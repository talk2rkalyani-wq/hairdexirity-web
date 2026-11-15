-- ==============================================================================
-- 20261115000028_pos_billing_tables_and_rpc.sql
-- Complete Standalone POS Billing Schema & RPC Finalization
-- Creates invoices, invoice_line_items, payments, sequences, and rpc_finalize_pos_invoice
-- ==============================================================================

-- 1. Sequence for Invoice Numbers
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1001;

-- 2. Invoices Table
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY DEFAULT ('inv-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    appointment_id TEXT,
    client_id TEXT,
    client_name TEXT NOT NULL DEFAULT 'Walk-in Guest',
    client_phone TEXT,
    client_email TEXT,
    staff_id TEXT,
    staff_name TEXT NOT NULL DEFAULT 'Staff',
    service_id TEXT,
    service_name TEXT NOT NULL DEFAULT 'Salon Service',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    discount_type TEXT DEFAULT 'percentage',
    discount_reason TEXT,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
    payment_status TEXT NOT NULL DEFAULT 'unpaid',
    primary_payment_method TEXT NOT NULL DEFAULT 'cash',
    is_gst_invoice BOOLEAN NOT NULL DEFAULT true,
    tax_treatment TEXT NOT NULL DEFAULT 'exclusive',
    is_draft BOOLEAN NOT NULL DEFAULT false,
    draft_version INTEGER DEFAULT 1,
    walk_in_guest BOOLEAN NOT NULL DEFAULT false,
    authorized_by TEXT,
    notes TEXT,
    idempotency_key TEXT,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_invoices_salon_id UNIQUE (salon_id, id)
);

-- Ensure all columns exist if table was partially created
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS draft_version INTEGER DEFAULT 1;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_gst_invoice BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'exclusive';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS walk_in_guest BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS authorized_by TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_salon_date ON public.invoices(salon_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_is_draft ON public.invoices(salon_id, is_draft);

-- 3. Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id TEXT PRIMARY KEY DEFAULT ('item-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT 'Salon Item',
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
    item_type TEXT NOT NULL DEFAULT 'service',
    product_id TEXT,
    service_id TEXT,
    staff_id TEXT,
    discount_amount NUMERIC(12, 2) DEFAULT 0,
    tax_rate NUMERIC(5, 4) DEFAULT 0.18,
    tax_amount NUMERIC(12, 2) DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON public.invoice_line_items(invoice_id);

-- 4. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT ('pmt-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cash',
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    transaction_reference TEXT,
    notes TEXT,
    received_by TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);

-- 5. Automatic Payment Reconciliation Trigger
CREATE OR REPLACE FUNCTION public.fn_reconcile_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inv RECORD;
    v_new_paid NUMERIC(12, 2);
    v_new_balance NUMERIC(12, 2);
    v_new_status TEXT;
BEGIN
    SELECT id, total_amount, paid_amount, balance_due, payment_status, salon_id
    INTO v_inv
    FROM public.invoices
    WHERE id = NEW.invoice_id AND salon_id = NEW.salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_new_paid
    FROM public.payments
    WHERE invoice_id = NEW.invoice_id AND salon_id = NEW.salon_id;

    v_new_balance := GREATEST(0, v_inv.total_amount - v_new_paid);

    IF v_new_balance <= 0 THEN
        v_new_status := 'paid';
    ELSIF v_new_paid > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'unpaid';
    END IF;

    UPDATE public.invoices
    SET paid_amount = v_new_paid,
        balance_due = v_new_balance,
        payment_status = v_new_status,
        updated_at = timezone('utc', now())
    WHERE id = NEW.invoice_id AND salon_id = NEW.salon_id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reconcile_invoice_payment ON public.payments;
CREATE TRIGGER trg_reconcile_invoice_payment
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.fn_reconcile_invoice_payment();

-- 6. RPC: rpc_finalize_pos_invoice
CREATE OR REPLACE FUNCTION public.rpc_finalize_pos_invoice(
    p_invoice_id text,
    p_salon_id text,
    p_client_id text DEFAULT NULL,
    p_client_name text DEFAULT 'Walk-in Guest',
    p_client_phone text DEFAULT NULL,
    p_client_email text DEFAULT NULL,
    p_staff_id text DEFAULT NULL,
    p_staff_name text DEFAULT NULL,
    p_service_id text DEFAULT NULL,
    p_service_name text DEFAULT NULL,
    p_appointment_id text DEFAULT NULL,
    p_date date DEFAULT CURRENT_DATE,
    p_subtotal numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_discount_type text DEFAULT 'percentage',
    p_discount_reason text DEFAULT NULL,
    p_tax_rate numeric DEFAULT 0.18,
    p_tax_amount numeric DEFAULT 0,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_total_amount numeric DEFAULT 0,
    p_primary_payment_method text DEFAULT 'cash',
    p_is_gst_invoice boolean DEFAULT true,
    p_tax_treatment text DEFAULT 'exclusive',
    p_walk_in_guest boolean DEFAULT false,
    p_notes text DEFAULT NULL,
    p_authorized_by text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_line_items jsonb DEFAULT '[]'::jsonb,
    p_payments jsonb DEFAULT '[]'::jsonb,
    p_authorization_grant_id text DEFAULT NULL,
    p_expected_draft_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_invoice_id text;
    v_invoice_number text;
    v_year text;
    v_seq bigint;
    v_item jsonb;
    v_pmt jsonb;
    v_existing_inv record;
    v_current_draft_version integer;
    v_res jsonb;
BEGIN
    v_invoice_id := COALESCE(p_invoice_id, 'inv-' || gen_random_uuid());

    -- Check if existing invoice or draft exists
    SELECT id, is_draft, draft_version, invoice_number INTO v_existing_inv
    FROM public.invoices
    WHERE id = v_invoice_id AND salon_id = p_salon_id;

    IF FOUND THEN
        IF v_existing_inv.is_draft = true THEN
            -- Generate permanent sequential invoice number
            v_year := to_char(CURRENT_DATE, 'YYYY');
            v_seq := nextval('public.invoice_number_seq');
            v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');

            -- Purge draft line items
            DELETE FROM public.invoice_line_items WHERE invoice_id = v_invoice_id AND salon_id = p_salon_id;
            DELETE FROM public.payments WHERE invoice_id = v_invoice_id AND salon_id = p_salon_id;

            UPDATE public.invoices
            SET invoice_number = v_invoice_number,
                appointment_id = p_appointment_id,
                client_id = p_client_id,
                client_name = p_client_name,
                client_phone = p_client_phone,
                client_email = p_client_email,
                staff_id = p_staff_id,
                staff_name = COALESCE(p_staff_name, 'Staff'),
                service_id = p_service_id,
                service_name = COALESCE(p_service_name, 'Salon Service'),
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
                draft_version = COALESCE(v_existing_inv.draft_version, 1) + 1,
                updated_at = timezone('utc', now())
            WHERE id = v_invoice_id AND salon_id = p_salon_id;
        END IF;
    ELSE
        -- Fresh invoice creation
        v_year := to_char(CURRENT_DATE, 'YYYY');
        v_seq := nextval('public.invoice_number_seq');
        v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');

        INSERT INTO public.invoices (
            id, salon_id, invoice_number, appointment_id, client_id, client_name, client_phone, client_email,
            staff_id, staff_name, service_id, service_name, date, subtotal, discount_amount, discount_type,
            discount_reason, tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
            balance_due, payment_status, primary_payment_method, is_gst_invoice, tax_treatment, is_draft,
            walk_in_guest, authorized_by, notes, idempotency_key, created_at, updated_at
        ) VALUES (
            v_invoice_id, p_salon_id, v_invoice_number, p_appointment_id, p_client_id, p_client_name, p_client_phone, p_client_email,
            p_staff_id, COALESCE(p_staff_name, 'Staff'), p_service_id, COALESCE(p_service_name, 'Salon Service'), p_date,
            p_subtotal, p_discount_amount, p_discount_type, p_discount_reason, p_tax_rate, p_tax_amount,
            p_cgst_amount, p_sgst_amount, p_total_amount, 0, p_total_amount, 'unpaid', p_primary_payment_method,
            p_is_gst_invoice, p_tax_treatment, false, p_walk_in_guest, p_authorized_by, p_notes, p_idempotency_key,
            timezone('utc', now()), timezone('utc', now())
        );
    END IF;

    -- Insert Line Items
    IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
            INSERT INTO public.invoice_line_items (
                id, salon_id, invoice_id, description, quantity, unit_price,
                total_price, item_type, product_id, service_id, staff_id,
                discount_amount, tax_rate, tax_amount
            ) VALUES (
                COALESCE(v_item->>'id', 'item-' || gen_random_uuid()),
                p_salon_id, v_invoice_id,
                COALESCE(v_item->>'description', 'Salon Item'),
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

    -- Insert Payments
    IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
        FOR v_pmt IN SELECT * FROM jsonb_array_elements(p_payments)
        LOOP
            INSERT INTO public.payments (
                id, salon_id, invoice_id, payment_method, amount,
                transaction_reference, notes, received_by, idempotency_key, created_at
            ) VALUES (
                COALESCE(v_pmt->>'id', 'pmt-' || gen_random_uuid()),
                p_salon_id, v_invoice_id,
                COALESCE(v_pmt->>'payment_method', 'cash'),
                COALESCE((v_pmt->>'amount')::numeric, 0),
                v_pmt->>'transaction_reference',
                v_pmt->>'notes',
                v_pmt->>'received_by',
                v_pmt->>'idempotency_key',
                timezone('utc', now())
            );
        END LOOP;
    END IF;

    -- Return JSON payload
    SELECT jsonb_build_object(
        'id', i.id,
        'salon_id', i.salon_id,
        'invoice_number', i.invoice_number,
        'appointment_id', i.appointment_id,
        'client_id', i.client_id,
        'client_name', i.client_name,
        'date', i.date,
        'subtotal', i.subtotal,
        'discount_amount', i.discount_amount,
        'tax_amount', i.tax_amount,
        'total_amount', i.total_amount,
        'paid_amount', i.paid_amount,
        'balance_due', i.balance_due,
        'payment_status', i.payment_status,
        'authorized_by', i.authorized_by,
        'is_draft', i.is_draft
    ) INTO v_res
    FROM public.invoices i
    WHERE id = v_invoice_id AND i.salon_id = p_salon_id;

    RETURN v_res;
END;
$$;

-- 7. RPC: rpc_save_pos_draft
CREATE OR REPLACE FUNCTION public.rpc_save_pos_draft(
    p_draft_id text,
    p_salon_id text,
    p_client_id text DEFAULT NULL,
    p_client_name text DEFAULT 'Walk-in Guest',
    p_client_phone text DEFAULT NULL,
    p_client_email text DEFAULT NULL,
    p_staff_id text DEFAULT NULL,
    p_staff_name text DEFAULT NULL,
    p_service_id text DEFAULT NULL,
    p_service_name text DEFAULT NULL,
    p_appointment_id text DEFAULT NULL,
    p_date date DEFAULT CURRENT_DATE,
    p_subtotal numeric DEFAULT 0,
    p_discount_amount numeric DEFAULT 0,
    p_discount_type text DEFAULT 'percentage',
    p_discount_reason text DEFAULT NULL,
    p_tax_rate numeric DEFAULT 0.18,
    p_tax_amount numeric DEFAULT 0,
    p_cgst_amount numeric DEFAULT 0,
    p_sgst_amount numeric DEFAULT 0,
    p_total_amount numeric DEFAULT 0,
    p_primary_payment_method text DEFAULT 'cash',
    p_is_gst_invoice boolean DEFAULT true,
    p_tax_treatment text DEFAULT 'exclusive',
    p_walk_in_guest boolean DEFAULT false,
    p_notes text DEFAULT NULL,
    p_authorized_by text DEFAULT NULL,
    p_idempotency_key text DEFAULT NULL,
    p_line_items jsonb DEFAULT '[]'::jsonb,
    p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_draft_id text;
    v_draft_version integer := 1;
    v_invoice_number text;
    v_existing record;
    v_item jsonb;
    v_res jsonb;
BEGIN
    v_draft_id := COALESCE(p_draft_id, 'draft-' || gen_random_uuid());

    SELECT id, draft_version, invoice_number INTO v_existing
    FROM public.invoices
    WHERE id = v_draft_id AND salon_id = p_salon_id;

    IF FOUND THEN
        v_draft_version := COALESCE(v_existing.draft_version, 1) + 1;
        v_invoice_number := v_existing.invoice_number;

        DELETE FROM public.invoice_line_items WHERE invoice_id = v_draft_id AND salon_id = p_salon_id;

        UPDATE public.invoices
        SET client_id = p_client_id,
            client_name = p_client_name,
            client_phone = p_client_phone,
            client_email = p_client_email,
            staff_id = p_staff_id,
            staff_name = COALESCE(p_staff_name, 'Staff'),
            service_id = p_service_id,
            service_name = COALESCE(p_service_name, 'Salon Service'),
            appointment_id = p_appointment_id,
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
            primary_payment_method = p_primary_payment_method,
            is_gst_invoice = p_is_gst_invoice,
            tax_treatment = p_tax_treatment,
            walk_in_guest = p_walk_in_guest,
            notes = p_notes,
            authorized_by = p_authorized_by,
            idempotency_key = p_idempotency_key,
            draft_version = v_draft_version,
            updated_at = timezone('utc', now())
        WHERE id = v_draft_id AND salon_id = p_salon_id;
    ELSE
        v_invoice_number := 'DRAFT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || substring(gen_random_uuid()::text, 1, 6);

        INSERT INTO public.invoices (
            id, salon_id, invoice_number, appointment_id, client_id, client_name, client_phone, client_email,
            staff_id, staff_name, service_id, service_name, date, subtotal, discount_amount, discount_type,
            discount_reason, tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
            balance_due, payment_status, primary_payment_method, is_gst_invoice, tax_treatment, is_draft,
            draft_version, walk_in_guest, authorized_by, notes, idempotency_key, created_at, updated_at
        ) VALUES (
            v_draft_id, p_salon_id, v_invoice_number, p_appointment_id, p_client_id, p_client_name, p_client_phone, p_client_email,
            p_staff_id, COALESCE(p_staff_name, 'Staff'), p_service_id, COALESCE(p_service_name, 'Salon Service'), p_date,
            p_subtotal, p_discount_amount, p_discount_type, p_discount_reason, p_tax_rate, p_tax_amount,
            p_cgst_amount, p_sgst_amount, p_total_amount, 0, p_total_amount, 'unpaid', p_primary_payment_method,
            p_is_gst_invoice, p_tax_treatment, true, 1, p_walk_in_guest, p_authorized_by, p_notes, p_idempotency_key,
            timezone('utc', now()), timezone('utc', now())
        );
    END IF;

    -- Insert Draft Line Items
    IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
            INSERT INTO public.invoice_line_items (
                id, salon_id, invoice_id, description, quantity, unit_price,
                total_price, item_type, product_id, service_id, staff_id,
                discount_amount, tax_rate, tax_amount
            ) VALUES (
                COALESCE(v_item->>'id', 'item-' || gen_random_uuid()),
                p_salon_id, v_draft_id,
                COALESCE(v_item->>'description', 'Salon Item'),
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

    SELECT jsonb_build_object(
        'id', i.id,
        'salon_id', i.salon_id,
        'invoice_number', i.invoice_number,
        'draft_version', i.draft_version,
        'is_draft', true
    ) INTO v_res
    FROM public.invoices i
    WHERE id = v_draft_id AND salon_id = p_salon_id;

    RETURN v_res;
END;
$$;

-- 8. RPC: rpc_delete_pos_draft
CREATE OR REPLACE FUNCTION public.rpc_delete_pos_draft(
    p_draft_id text,
    p_salon_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    DELETE FROM public.invoice_line_items WHERE invoice_id = p_draft_id AND salon_id = p_salon_id;
    DELETE FROM public.payments WHERE invoice_id = p_draft_id AND salon_id = p_salon_id;
    DELETE FROM public.invoices WHERE id = p_draft_id AND salon_id = p_salon_id AND is_draft = true;
    RETURN true;
END;
$$;

-- 9. Row Level Security & Permissions
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_full_access" ON public.invoices;
CREATE POLICY "invoices_full_access" ON public.invoices FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "line_items_full_access" ON public.invoice_line_items;
CREATE POLICY "line_items_full_access" ON public.invoice_line_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "payments_full_access" ON public.payments;
CREATE POLICY "payments_full_access" ON public.payments FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.invoices TO authenticated, anon;
GRANT ALL ON public.invoice_line_items TO authenticated, anon;
GRANT ALL ON public.payments TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated, anon;

GRANT EXECUTE ON FUNCTION public.rpc_finalize_pos_invoice TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_pos_draft TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_pos_draft TO authenticated, anon;

-- 10. Refresh PostgREST Schema Cache
NOTIFY pgrst, 'reload schema';
