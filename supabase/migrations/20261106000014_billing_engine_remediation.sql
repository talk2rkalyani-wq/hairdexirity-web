-- ==============================================================================
-- Luma Salon — Migration 000014: Billing Engine Remediation & POS Atomic Persistence
-- Phase 2.1 Hardened: Walk-in Invoices, Split Payments, Draft Persistence,
--                     Atomic RPC Finalization, Discount Gates & Immutability Corrections
-- ==============================================================================

BEGIN;

-- 1. Schema Extensions: Make client_id and staff_id nullable for walk-ins & product-only bills
ALTER TABLE public.invoices ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN staff_name DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN service_name DROP NOT NULL;

-- 2. Add POS tracking columns to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS walk_in_guest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS authorized_by TEXT;

-- 3. Update Sequence / Next Invoice Number Function to be tenant-safe and test-compatible
CREATE OR REPLACE FUNCTION public.next_invoice_number(p_salon_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_year TEXT;
    v_seq INT;
BEGIN
    -- Caller authentication & tenant verification when running under authenticated role
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND p_salon_id IS NOT NULL AND p_salon_id <> v_caller_salon THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot request invoice sequence for another salon (%)', p_salon_id;
    END IF;

    -- Atomically advance sequence
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq := nextval('public.invoice_number_seq');
    RETURN 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- 4. Correct Invoice Immutability Trigger: Support drafts, walk-ins, and distinct checks
CREATE OR REPLACE FUNCTION public.fn_protect_finalized_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- If the invoice was saved as a draft, allow transitioning to a finalized state
    IF OLD.payment_status = 'draft' AND OLD.is_draft = true THEN
        RETURN NEW;
    END IF;

    -- 1. Prevent un-cancelling
    IF OLD.payment_status = 'cancelled' AND NEW.payment_status <> 'cancelled' THEN
        RAISE EXCEPTION 'Cannot un-cancel an invoice that has been cancelled';
    END IF;

    -- 2. Prohibit modifying commercial fields once finalized
    IF NEW.invoice_number <> OLD.invoice_number OR
       NEW.salon_id <> OLD.salon_id OR
       NEW.client_id IS DISTINCT FROM OLD.client_id OR
       NEW.staff_id IS DISTINCT FROM OLD.staff_id OR
       NEW.appointment_id IS DISTINCT FROM OLD.appointment_id OR
       NEW.service_id IS DISTINCT FROM OLD.service_id OR
       NEW.date <> OLD.date OR
       NEW.subtotal <> OLD.subtotal OR
       NEW.discount_amount <> OLD.discount_amount OR
       NEW.discount_type IS DISTINCT FROM OLD.discount_type OR
       NEW.discount_reason IS DISTINCT FROM OLD.discount_reason OR
       NEW.tax_rate <> OLD.tax_rate OR
       NEW.tax_amount <> OLD.tax_amount OR
       NEW.cgst_amount <> OLD.cgst_amount OR
       NEW.sgst_amount <> OLD.sgst_amount OR
       NEW.total_amount <> OLD.total_amount OR
       NEW.primary_payment_method <> OLD.primary_payment_method OR
       NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
        RAISE EXCEPTION 'Immutable financial fields (invoice_number, subtotal, tax, total) cannot be modified after issuance: commercial ledger fields are locked';
    END IF;

    -- 3. Prevent direct tampering with trigger-managed balance and paid amounts
    IF pg_trigger_depth() <= 1 AND (
        NEW.balance_due <> OLD.balance_due OR 
        NEW.paid_amount <> OLD.paid_amount
    ) THEN
        RAISE EXCEPTION 'Direct manipulation of paid_amount or balance_due is prohibited; must be reconciled via payments ledger';
    END IF;

    RETURN NEW;
END;
$$;

-- 5. Correct Line Items Protection Trigger
CREATE OR REPLACE FUNCTION public.fn_protect_finalized_line_items()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
    v_target_id TEXT;
BEGIN
    v_target_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
    
    SELECT payment_status INTO v_status
    FROM public.invoices
    WHERE id = v_target_id;

    -- Prohibit modifying line items on invoices that have already been finalized / paid / cancelled
    IF v_status IS NOT NULL AND v_status IN ('paid', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot modify or append line items on a finalized or cancelled invoice (%)', v_target_id;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- 6. Table Privileges: Retain strict column-level immutability on invoices for authenticated role
-- All atomic drafting, finalization and draft purging operations are securely mediated via SECURITY DEFINER RPCs
REVOKE UPDATE, DELETE ON public.invoices FROM authenticated;
GRANT UPDATE (notes, void_reason, updated_at) ON public.invoices TO authenticated;
REVOKE DELETE ON public.invoice_line_items FROM authenticated;

-- 7. RLS Policy: Allow Draft Invoices and Line Items to be Deleted by Billing Staff
DROP POLICY IF EXISTS "Draft invoices deletable by billing staff" ON public.invoices;
CREATE POLICY "Draft invoices deletable by billing staff"
    ON public.invoices FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() OR public.current_user_salon_id() IS NULL)
        AND public.is_owner_or_receptionist()
        AND is_draft = true
        AND payment_status = 'draft'
    );

DROP POLICY IF EXISTS "Draft line items deletable by billing staff" ON public.invoice_line_items;
CREATE POLICY "Draft line items deletable by billing staff"
    ON public.invoice_line_items FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() OR public.current_user_salon_id() IS NULL)
        AND public.is_owner_or_receptionist()
        AND EXISTS (
            SELECT 1 FROM public.invoices i
            WHERE i.id = invoice_line_items.invoice_id
              AND i.salon_id = invoice_line_items.salon_id
              AND i.is_draft = true
        )
    );

-- 8. Stored Procedure: Atomic POS Invoice Finalization
CREATE OR REPLACE FUNCTION public.rpc_finalize_pos_invoice(
    p_invoice_id TEXT,
    p_salon_id TEXT,
    p_client_id TEXT DEFAULT NULL,
    p_client_name TEXT DEFAULT 'Walk-in Guest',
    p_client_phone TEXT DEFAULT NULL,
    p_client_email TEXT DEFAULT NULL,
    p_staff_id TEXT DEFAULT NULL,
    p_staff_name TEXT DEFAULT NULL,
    p_service_id TEXT DEFAULT NULL,
    p_service_name TEXT DEFAULT NULL,
    p_appointment_id TEXT DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE,
    p_subtotal NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_type TEXT DEFAULT NULL,
    p_discount_reason TEXT DEFAULT NULL,
    p_tax_rate NUMERIC DEFAULT 0.18,
    p_tax_amount NUMERIC DEFAULT 0,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_total_amount NUMERIC DEFAULT 0,
    p_primary_payment_method TEXT DEFAULT 'cash',
    p_is_gst_invoice BOOLEAN DEFAULT true,
    p_tax_treatment TEXT DEFAULT 'exclusive',
    p_walk_in_guest BOOLEAN DEFAULT false,
    p_notes TEXT DEFAULT NULL,
    p_authorized_by TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_line_items JSONB DEFAULT '[]'::jsonb,
    p_payments JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_invoice_id TEXT;
    v_invoice_number TEXT;
    v_existing_inv RECORD;
    v_year TEXT;
    v_seq INT;
    v_item JSONB;
    v_pmt JSONB;
    v_result JSONB;
    v_discount_pct NUMERIC;
BEGIN
    -- 1. Tenant Security: verify caller if authenticated
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND p_salon_id <> v_caller_salon THEN
        RAISE EXCEPTION 'Unauthorized: Cross-tenant invoice creation prohibited (caller %, target %)', v_caller_salon, p_salon_id;
    END IF;

    -- Verify target salon exists
    IF NOT EXISTS (SELECT 1 FROM public.salons WHERE id = p_salon_id) THEN
        RAISE EXCEPTION 'Salon % does not exist', p_salon_id;
    END IF;

    -- 2. Discount Authorization Check: If discount > 10% of subtotal, authorization is mandatory
    IF p_subtotal > 0 AND p_discount_amount > 0 THEN
        v_discount_pct := (p_discount_amount / p_subtotal) * 100;
        IF v_discount_pct > 10.01 THEN
            IF p_authorized_by IS NULL OR length(trim(p_authorized_by)) = 0 THEN
                RAISE EXCEPTION 'Discounts exceeding 10%% require salon owner authorization';
            END IF;
        END IF;
    END IF;

    v_invoice_id := COALESCE(p_invoice_id, 'inv-' || gen_random_uuid());

    -- 3. Check for existing draft or invoice
    SELECT id, is_draft, invoice_number INTO v_existing_inv
    FROM public.invoices
    WHERE id = v_invoice_id AND salon_id = p_salon_id;

    IF FOUND THEN
        -- If it was a draft, convert it to finalized
        IF v_existing_inv.is_draft = true THEN
            -- Generate permanent sequential invoice number
            v_year := to_char(CURRENT_DATE, 'YYYY');
            v_seq := nextval('public.invoice_number_seq');
            v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');

            -- Purge draft line items before inserting finalized line items
            DELETE FROM public.invoice_line_items
            WHERE invoice_id = v_invoice_id AND salon_id = p_salon_id;

            -- Update draft header to unpaid finalized state
            UPDATE public.invoices
            SET invoice_number = v_invoice_number,
                appointment_id = p_appointment_id,
                client_id = p_client_id,
                client_name = p_client_name,
                client_phone = p_client_phone,
                client_email = p_client_email,
                staff_id = p_staff_id,
                staff_name = p_staff_name,
                service_id = p_service_id,
                service_name = p_service_name,
                date = p_date,
                subtotal = p_subtotal,
                discount_amount = p_discount_amount,
                discount_type = p_discount_type,
                discount_reason = p_discount_reason,
                tax_rate = p_tax_rate,
                tax_amount = p_tax_amount,
                cgst_amount = p_cgst_amount,
                sgst_amount = p_sgst_amount,
                total_amount = p_total_amount,
                paid_amount = 0,
                balance_due = p_total_amount,
                payment_status = 'unpaid',
                primary_payment_method = p_primary_payment_method,
                is_gst_invoice = p_is_gst_invoice,
                tax_treatment = p_tax_treatment,
                is_draft = false,
                walk_in_guest = p_walk_in_guest,
                authorized_by = p_authorized_by,
                notes = p_notes,
                idempotency_key = p_idempotency_key,
                updated_at = timezone('utc', now())
            WHERE id = v_invoice_id AND salon_id = p_salon_id;
        ELSE
            RAISE EXCEPTION 'Invoice % has already been finalized and cannot be overwritten', v_invoice_id;
        END IF;
    ELSE
        -- Generate permanent sequential invoice number
        v_year := to_char(CURRENT_DATE, 'YYYY');
        v_seq := nextval('public.invoice_number_seq');
        v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');

        -- Insert fresh invoice in unpaid state
        INSERT INTO public.invoices (
            id,
            salon_id,
            invoice_number,
            appointment_id,
            client_id,
            client_name,
            client_phone,
            client_email,
            staff_id,
            staff_name,
            service_id,
            service_name,
            date,
            subtotal,
            discount_amount,
            discount_type,
            discount_reason,
            tax_rate,
            tax_amount,
            cgst_amount,
            sgst_amount,
            total_amount,
            paid_amount,
            balance_due,
            payment_status,
            primary_payment_method,
            is_gst_invoice,
            tax_treatment,
            is_draft,
            walk_in_guest,
            authorized_by,
            notes,
            idempotency_key,
            created_at,
            updated_at
        ) VALUES (
            v_invoice_id,
            p_salon_id,
            v_invoice_number,
            p_appointment_id,
            p_client_id,
            p_client_name,
            p_client_phone,
            p_client_email,
            p_staff_id,
            p_staff_name,
            p_service_id,
            p_service_name,
            p_date,
            p_subtotal,
            p_discount_amount,
            p_discount_type,
            p_discount_reason,
            p_tax_rate,
            p_tax_amount,
            p_cgst_amount,
            p_sgst_amount,
            p_total_amount,
            0,
            p_total_amount,
            'unpaid',
            p_primary_payment_method,
            p_is_gst_invoice,
            p_tax_treatment,
            false,
            p_walk_in_guest,
            p_authorized_by,
            p_notes,
            p_idempotency_key,
            timezone('utc', now()),
            timezone('utc', now())
        );
    END IF;

    -- 4. Insert Line Items (Allowed because invoice is in 'unpaid' status)
    IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
            INSERT INTO public.invoice_line_items (
                id,
                salon_id,
                invoice_id,
                description,
                quantity,
                unit_price,
                total_price,
                item_type,
                product_id,
                service_id,
                staff_id,
                discount_amount,
                tax_rate,
                tax_amount
            ) VALUES (
                COALESCE(v_item->>'id', 'item-' || gen_random_uuid()),
                p_salon_id,
                v_invoice_id,
                COALESCE(v_item->>'description', 'Salon Service'),
                COALESCE((v_item->>'quantity')::numeric, 1),
                COALESCE((v_item->>'unit_price')::numeric, 0),
                COALESCE((v_item->>'total_price')::numeric, 0),
                COALESCE(v_item->>'item_type', 'service'),
                v_item->>'product_id',
                v_item->>'service_id',
                v_item->>'staff_id',
                COALESCE((v_item->>'discount_amount')::numeric, 0),
                COALESCE((v_item->>'tax_rate')::numeric, 0.18),
                COALESCE((v_item->>'tax_amount')::numeric, 0)
            );
        END LOOP;
    END IF;

    -- 5. Insert Payments (Automatically reconciles paid_amount, balance_due and payment_status via trg_reconcile_invoice_payment)
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_pmt IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO public.payments (
                id,
                salon_id,
                invoice_id,
                payment_method,
                amount,
                transaction_reference,
                notes,
                received_by,
                idempotency_key,
                created_at
            ) VALUES (
                COALESCE(v_pmt->>'id', 'pmt-' || gen_random_uuid()),
                p_salon_id,
                v_invoice_id,
                v_pmt->>'payment_method',
                (v_pmt->>'amount')::numeric,
                v_pmt->>'transaction_reference',
                v_pmt->>'notes',
                v_pmt->>'received_by',
                v_pmt->>'idempotency_key',
                timezone('utc', now())
            );
        END LOOP;
    END IF;

    -- 6. Construct and Return Fully Reconciled Domain Entity
    SELECT jsonb_build_object(
        'id', i.id,
        'salon_id', i.salon_id,
        'invoice_number', i.invoice_number,
        'appointment_id', i.appointment_id,
        'client_id', i.client_id,
        'client_name', i.client_name,
        'client_phone', i.client_phone,
        'client_email', i.client_email,
        'staff_id', i.staff_id,
        'staff_name', i.staff_name,
        'service_id', i.service_id,
        'service_name', i.service_name,
        'date', i.date,
        'subtotal', i.subtotal,
        'discount_amount', i.discount_amount,
        'discount_type', i.discount_type,
        'discount_reason', i.discount_reason,
        'tax_rate', i.tax_rate,
        'tax_amount', i.tax_amount,
        'cgst_amount', i.cgst_amount,
        'sgst_amount', i.sgst_amount,
        'total_amount', i.total_amount,
        'paid_amount', i.paid_amount,
        'balance_due', i.balance_due,
        'payment_status', i.payment_status,
        'primary_payment_method', i.primary_payment_method,
        'is_gst_invoice', i.is_gst_invoice,
        'tax_treatment', i.tax_treatment,
        'is_draft', i.is_draft,
        'walk_in_guest', i.walk_in_guest,
        'authorized_by', i.authorized_by,
        'notes', i.notes,
        'idempotency_key', i.idempotency_key,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'line_items', COALESCE((
            SELECT jsonb_agg(to_jsonb(li))
            FROM public.invoice_line_items li
            WHERE li.invoice_id = i.id
        ), '[]'::jsonb),
        'payments', COALESCE((
            SELECT jsonb_agg(to_jsonb(p))
            FROM public.payments p
            WHERE p.invoice_id = i.id
        ), '[]'::jsonb)
    ) INTO v_result
    FROM public.invoices i
    WHERE i.id = v_invoice_id;

    RETURN v_result;
END;
$$;

-- 9. Stored Procedure: Atomic POS Draft Creation & Update
CREATE OR REPLACE FUNCTION public.rpc_save_pos_draft(
    p_draft_id TEXT,
    p_salon_id TEXT,
    p_client_id TEXT DEFAULT NULL,
    p_client_name TEXT DEFAULT 'Walk-in Guest',
    p_client_phone TEXT DEFAULT NULL,
    p_client_email TEXT DEFAULT NULL,
    p_staff_id TEXT DEFAULT NULL,
    p_staff_name TEXT DEFAULT NULL,
    p_service_id TEXT DEFAULT NULL,
    p_service_name TEXT DEFAULT NULL,
    p_appointment_id TEXT DEFAULT NULL,
    p_date DATE DEFAULT CURRENT_DATE,
    p_subtotal NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_type TEXT DEFAULT NULL,
    p_discount_reason TEXT DEFAULT NULL,
    p_tax_rate NUMERIC DEFAULT 0.18,
    p_tax_amount NUMERIC DEFAULT 0,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_total_amount NUMERIC DEFAULT 0,
    p_primary_payment_method TEXT DEFAULT 'cash',
    p_is_gst_invoice BOOLEAN DEFAULT true,
    p_tax_treatment TEXT DEFAULT 'exclusive',
    p_walk_in_guest BOOLEAN DEFAULT false,
    p_notes TEXT DEFAULT NULL,
    p_authorized_by TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_line_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_draft_id TEXT;
    v_draft_number TEXT;
    v_item JSONB;
    v_result JSONB;
BEGIN
    -- Verify caller salon if authenticated
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND p_salon_id <> v_caller_salon THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot save draft for another salon (%)', p_salon_id;
    END IF;

    v_draft_id := COALESCE(p_draft_id, 'draft-' || gen_random_uuid());

    -- Look up existing draft
    SELECT invoice_number INTO v_draft_number
    FROM public.invoices
    WHERE id = v_draft_id AND salon_id = p_salon_id;

    IF v_draft_number IS NULL THEN
        v_draft_number := 'DFT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 4, '0');

        INSERT INTO public.invoices (
            id,
            salon_id,
            invoice_number,
            appointment_id,
            client_id,
            client_name,
            client_phone,
            client_email,
            staff_id,
            staff_name,
            service_id,
            service_name,
            date,
            subtotal,
            discount_amount,
            discount_type,
            discount_reason,
            tax_rate,
            tax_amount,
            cgst_amount,
            sgst_amount,
            total_amount,
            paid_amount,
            balance_due,
            payment_status,
            primary_payment_method,
            is_gst_invoice,
            tax_treatment,
            is_draft,
            walk_in_guest,
            authorized_by,
            notes,
            idempotency_key,
            created_at,
            updated_at
        ) VALUES (
            v_draft_id,
            p_salon_id,
            v_draft_number,
            p_appointment_id,
            p_client_id,
            p_client_name,
            p_client_phone,
            p_client_email,
            p_staff_id,
            p_staff_name,
            p_service_id,
            p_service_name,
            p_date,
            p_subtotal,
            p_discount_amount,
            p_discount_type,
            p_discount_reason,
            p_tax_rate,
            p_tax_amount,
            p_cgst_amount,
            p_sgst_amount,
            p_total_amount,
            0,
            p_total_amount,
            'draft',
            p_primary_payment_method,
            p_is_gst_invoice,
            p_tax_treatment,
            true,
            p_walk_in_guest,
            p_authorized_by,
            p_notes,
            p_idempotency_key,
            timezone('utc', now()),
            timezone('utc', now())
        );
    ELSE
        -- Update existing draft
        UPDATE public.invoices
        SET appointment_id = p_appointment_id,
            client_id = p_client_id,
            client_name = p_client_name,
            client_phone = p_client_phone,
            client_email = p_client_email,
            staff_id = p_staff_id,
            staff_name = p_staff_name,
            service_id = p_service_id,
            service_name = p_service_name,
            date = p_date,
            subtotal = p_subtotal,
            discount_amount = p_discount_amount,
            discount_type = p_discount_type,
            discount_reason = p_discount_reason,
            tax_rate = p_tax_rate,
            tax_amount = p_tax_amount,
            cgst_amount = p_cgst_amount,
            sgst_amount = p_sgst_amount,
            total_amount = p_total_amount,
            paid_amount = 0,
            balance_due = p_total_amount,
            payment_status = 'draft',
            primary_payment_method = p_primary_payment_method,
            is_gst_invoice = p_is_gst_invoice,
            tax_treatment = p_tax_treatment,
            is_draft = true,
            walk_in_guest = p_walk_in_guest,
            authorized_by = p_authorized_by,
            notes = p_notes,
            idempotency_key = p_idempotency_key,
            updated_at = timezone('utc', now())
        WHERE id = v_draft_id AND salon_id = p_salon_id;

        -- Remove old draft line items
        DELETE FROM public.invoice_line_items
        WHERE invoice_id = v_draft_id AND salon_id = p_salon_id;
    END IF;

    -- Insert draft line items
    IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
            INSERT INTO public.invoice_line_items (
                id,
                salon_id,
                invoice_id,
                description,
                quantity,
                unit_price,
                total_price,
                item_type,
                product_id,
                service_id,
                staff_id,
                discount_amount,
                tax_rate,
                tax_amount
            ) VALUES (
                COALESCE(v_item->>'id', 'item-' || gen_random_uuid()),
                p_salon_id,
                v_draft_id,
                COALESCE(v_item->>'description', 'Salon Service'),
                COALESCE((v_item->>'quantity')::numeric, 1),
                COALESCE((v_item->>'unit_price')::numeric, 0),
                COALESCE((v_item->>'total_price')::numeric, 0),
                COALESCE(v_item->>'item_type', 'service'),
                v_item->>'product_id',
                v_item->>'service_id',
                v_item->>'staff_id',
                COALESCE((v_item->>'discount_amount')::numeric, 0),
                COALESCE((v_item->>'tax_rate')::numeric, 0.18),
                COALESCE((v_item->>'tax_amount')::numeric, 0)
            );
        END LOOP;
    END IF;

    -- Return complete draft domain entity
    SELECT jsonb_build_object(
        'id', i.id,
        'salon_id', i.salon_id,
        'invoice_number', i.invoice_number,
        'appointment_id', i.appointment_id,
        'client_id', i.client_id,
        'client_name', i.client_name,
        'client_phone', i.client_phone,
        'client_email', i.client_email,
        'staff_id', i.staff_id,
        'staff_name', i.staff_name,
        'service_id', i.service_id,
        'service_name', i.service_name,
        'date', i.date,
        'subtotal', i.subtotal,
        'discount_amount', i.discount_amount,
        'discount_type', i.discount_type,
        'discount_reason', i.discount_reason,
        'tax_rate', i.tax_rate,
        'tax_amount', i.tax_amount,
        'cgst_amount', i.cgst_amount,
        'sgst_amount', i.sgst_amount,
        'total_amount', i.total_amount,
        'paid_amount', i.paid_amount,
        'balance_due', i.balance_due,
        'payment_status', i.payment_status,
        'primary_payment_method', i.primary_payment_method,
        'is_gst_invoice', i.is_gst_invoice,
        'tax_treatment', i.tax_treatment,
        'is_draft', i.is_draft,
        'walk_in_guest', i.walk_in_guest,
        'authorized_by', i.authorized_by,
        'notes', i.notes,
        'idempotency_key', i.idempotency_key,
        'created_at', i.created_at,
        'updated_at', i.updated_at,
        'line_items', COALESCE((
            SELECT jsonb_agg(to_jsonb(li))
            FROM public.invoice_line_items li
            WHERE li.invoice_id = i.id
        ), '[]'::jsonb),
        'payments', '[]'::jsonb
    ) INTO v_result
    FROM public.invoices i
    WHERE i.id = v_draft_id;

    RETURN v_result;
END;
$$;

-- 10. Stored Procedure: Atomic POS Draft Deletion
CREATE OR REPLACE FUNCTION public.rpc_delete_pos_draft(p_draft_id TEXT, p_salon_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
BEGIN
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot delete drafts for another salon (%)', p_salon_id;
    END IF;

    DELETE FROM public.invoices
    WHERE id = p_draft_id AND salon_id = p_salon_id AND is_draft = true AND payment_status = 'draft';

    RETURN FOUND;
END;
$$;

-- 11. Grant Execute on Functions to authenticated and anon
GRANT EXECUTE ON FUNCTION public.rpc_finalize_pos_invoice TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_pos_draft TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_pos_draft TO authenticated, anon;

COMMIT;
