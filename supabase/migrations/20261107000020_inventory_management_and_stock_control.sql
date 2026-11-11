-- ==============================================================================
-- LUMA SALON BUSINESS SUITE — DATABASE MIGRATION
-- Migration: 20261107000020_inventory_management_and_stock_control.sql
-- Phase 7: Inventory Management & Stock Control
-- Applied to: PostgreSQL 18.6 (Local luma_test)
-- Description:
--   1. Inventory Products schema extension (reorder level, max threshold, reserved stock, batch tracking, WAC).
--   2. Stock movements ledger extension (SALE_DEDUCTION, CONSUMABLE_USAGE, DAMAGE, EXPIRY, WASTAGE, etc.).
--   3. Inventory Settings (allow_negative_stock, valuation method, expiry alert days, loss threshold).
--   4. Batches & Expiry Tracking (inventory_batches, FEFO rules, status lifecycle).
--   5. Consumable Usages (consumable_usages with appointment/service/staff links).
--   6. Stock Loss & Wastage (stock_loss_records with threshold authorization).
--   7. Physical Stock Audit Sessions & Items (stock_audit_sessions, stock_audit_items, reconciliation).
--   8. Atomic POS retail product stock deduction integration in rpc_finalize_pos_invoice.
--   9. Dedicated inventory RPCs: consumable usage, stock losses, audits, batches, and dashboard KPIs.
-- ==============================================================================

-- 1. Document Number Sequences
CREATE SEQUENCE IF NOT EXISTS public.consumable_usage_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_loss_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_audit_number_seq START WITH 1 INCREMENT BY 1;

-- 2. Extend inventory_products table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'reorder_level') THEN
        ALTER TABLE public.inventory_products ADD COLUMN reorder_level NUMERIC(12,3) NOT NULL DEFAULT 10.000;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'max_stock_threshold') THEN
        ALTER TABLE public.inventory_products ADD COLUMN max_stock_threshold NUMERIC(12,3) DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'reserved_stock') THEN
        ALTER TABLE public.inventory_products ADD COLUMN reserved_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'is_batch_tracked') THEN
        ALTER TABLE public.inventory_products ADD COLUMN is_batch_tracked BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'weighted_average_cost') THEN
        ALTER TABLE public.inventory_products ADD COLUMN weighted_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000;
    END IF;
END $$;

-- 3. Extend inventory_stock_movements table
DO $$
BEGIN
    -- Drop existing movement_type check constraint safely
    ALTER TABLE public.inventory_stock_movements DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

    -- Add columns for batch and valuation traceability if not present
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements' AND column_name = 'batch_id') THEN
        ALTER TABLE public.inventory_stock_movements ADD COLUMN batch_id UUID DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements' AND column_name = 'unit_cost') THEN
        ALTER TABLE public.inventory_stock_movements ADD COLUMN unit_cost NUMERIC(12,4) DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements' AND column_name = 'total_cost') THEN
        ALTER TABLE public.inventory_stock_movements ADD COLUMN total_cost NUMERIC(12,4) DEFAULT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements' AND column_name = 'source_document') THEN
        ALTER TABLE public.inventory_stock_movements ADD COLUMN source_document TEXT DEFAULT NULL;
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.inventory_stock_movements
    ADD CONSTRAINT inventory_stock_movements_movement_type_check
    CHECK (movement_type IN (
        'OPENING_STOCK', 'STOCK_RECEIVED', 'PURCHASE_RECEIPT', 'STOCK_ADJUSTMENT_IN',
        'STOCK_ADJUSTMENT_OUT', 'STOCK_RETURN', 'PURCHASE_RETURN', 'SALE_DEDUCTION',
        'CONSUMABLE_USAGE', 'DAMAGE', 'EXPIRY', 'WASTAGE', 'CUSTOMER_RETURN', 'STOCK_TRANSFER'
    ));

-- 4. Inventory Settings Table
CREATE TABLE IF NOT EXISTS public.inventory_settings (
    salon_id TEXT PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
    default_valuation_method TEXT NOT NULL DEFAULT 'WAC' CHECK (default_valuation_method IN ('WAC', 'FIFO')),
    near_expiry_days INTEGER NOT NULL DEFAULT 30 CHECK (near_expiry_days > 0),
    high_value_loss_threshold NUMERIC(12,2) NOT NULL DEFAULT 2000.00 CHECK (high_value_loss_threshold >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.inventory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY "Inventory settings viewable by authorized salon staff"
    ON public.inventory_settings FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE POLICY "Inventory settings modifiable only by salon owner"
    ON public.inventory_settings FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner())
    WITH CHECK ((salon_id = current_user_salon_id()) AND is_owner());

-- Default settings for salon-luma-01
INSERT INTO public.inventory_settings (salon_id, allow_negative_stock, default_valuation_method, near_expiry_days, high_value_loss_threshold)
VALUES ('salon-luma-01', false, 'WAC', 30, 2000.00)
ON CONFLICT (salon_id) DO NOTHING;

-- 5. Inventory Batches Table (Expiry, FEFO & Quarantine Tracking)
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    goods_receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
    purchase_bill_id UUID REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
    received_quantity NUMERIC(12,3) NOT NULL CHECK (received_quantity >= 0),
    current_quantity NUMERIC(12,3) NOT NULL CHECK (current_quantity >= 0),
    unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    manufacturing_date DATE,
    expiry_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'near_expiry', 'expired', 'quarantined', 'depleted')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_product_batch UNIQUE (salon_id, product_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_inventory_batches_salon_prod ON public.inventory_batches(salon_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON public.inventory_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_status ON public.inventory_batches(status);

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches FORCE ROW LEVEL SECURITY;

CREATE POLICY "Inventory batches viewable by authorized salon staff"
    ON public.inventory_batches FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE POLICY "Inventory batches modifiable by authorized salon staff"
    ON public.inventory_batches FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

-- 6. Consumable Usages Table
CREATE TABLE IF NOT EXISTS public.consumable_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    usage_number TEXT NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL,
    appointment_id TEXT REFERENCES public.appointments(id) ON DELETE SET NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
    staff_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    total_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    reason TEXT,
    notes TEXT,
    recorded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_consumable_usages_salon_prod ON public.consumable_usages(salon_id, product_id);
CREATE INDEX IF NOT EXISTS idx_consumable_usages_created_at ON public.consumable_usages(created_at DESC);

ALTER TABLE public.consumable_usages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumable_usages FORCE ROW LEVEL SECURITY;

CREATE POLICY "Consumable usages viewable by salon staff"
    ON public.consumable_usages FOR SELECT TO authenticated
    USING (salon_id = current_user_salon_id());

CREATE POLICY "Consumable usages insertable by salon staff"
    ON public.consumable_usages FOR INSERT TO authenticated
    WITH CHECK (salon_id = current_user_salon_id());

-- 7. Stock Loss Records Table (Damage, Expiry, Wastage)
CREATE TABLE IF NOT EXISTS public.stock_loss_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    loss_number TEXT NOT NULL UNIQUE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.inventory_batches(id) ON DELETE SET NULL,
    loss_type TEXT NOT NULL CHECK (loss_type IN ('DAMAGE', 'EXPIRY', 'WASTAGE', 'INTERNAL_LOSS', 'REJECTION')),
    quantity NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    total_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    reason TEXT NOT NULL,
    supporting_notes TEXT,
    recorded_by TEXT,
    approved_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_loss_salon_prod ON public.stock_loss_records(salon_id, product_id);
CREATE INDEX IF NOT EXISTS idx_stock_loss_created_at ON public.stock_loss_records(created_at DESC);

ALTER TABLE public.stock_loss_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_loss_records FORCE ROW LEVEL SECURITY;

CREATE POLICY "Stock loss records viewable by authorized salon staff"
    ON public.stock_loss_records FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE POLICY "Stock loss records insertable by authorized salon staff"
    ON public.stock_loss_records FOR INSERT TO authenticated
    WITH CHECK ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

-- 8. Stock Audit Sessions & Items Tables (Physical Counts & Reconciliation)
CREATE TABLE IF NOT EXISTS public.stock_audit_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    audit_number TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    category_filter TEXT NOT NULL DEFAULT 'ALL',
    item_type_filter TEXT NOT NULL DEFAULT 'ALL',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed', 'reconciled', 'cancelled')),
    total_items_counted INTEGER NOT NULL DEFAULT 0,
    total_discrepancies INTEGER NOT NULL DEFAULT 0,
    net_variance_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000,
    net_variance_value NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    counted_by TEXT,
    reviewed_by TEXT,
    approved_by TEXT,
    notes TEXT,
    audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reconciled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_audits_salon ON public.stock_audit_sessions(salon_id);
CREATE INDEX IF NOT EXISTS idx_stock_audits_status ON public.stock_audit_sessions(status);

ALTER TABLE public.stock_audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY "Stock audits viewable by authorized salon staff"
    ON public.stock_audit_sessions FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE POLICY "Stock audits modifiable by authorized salon staff"
    ON public.stock_audit_sessions FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE TABLE IF NOT EXISTS public.stock_audit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    audit_id UUID NOT NULL REFERENCES public.stock_audit_sessions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    system_quantity NUMERIC(12,3) NOT NULL,
    counted_quantity NUMERIC(12,3) DEFAULT NULL,
    variance_quantity NUMERIC(12,3) DEFAULT NULL,
    unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
    variance_value NUMERIC(12,4) DEFAULT NULL,
    discrepancy_reason TEXT,
    is_reconciled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_audit_product UNIQUE (audit_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_items_audit_id ON public.stock_audit_items(audit_id);

ALTER TABLE public.stock_audit_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_audit_items FORCE ROW LEVEL SECURITY;

CREATE POLICY "Stock audit items viewable by authorized salon staff"
    ON public.stock_audit_items FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

CREATE POLICY "Stock audit items modifiable by authorized salon staff"
    ON public.stock_audit_items FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id()) AND is_owner_or_receptionist());

-- ==============================================================================
-- 9. ATOMIC POS RETAIL PRODUCT INVENTORY DEDUCTION (rpc_finalize_pos_invoice)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.rpc_finalize_pos_invoice(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, jsonb, text, integer);

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
    v_caller_salon text;
    v_invoice_id text;
    v_invoice_number text;
    v_year text;
    v_seq bigint;
    v_existing_inv record;
    v_existing_by_idempotency record;
    v_discount_pct numeric;
    v_item jsonb;
    v_pmt jsonb;
    v_grant record;
    v_approving_owner record;
    v_actual_authorized_by text := NULL;
    v_current_draft_version integer;
    v_res jsonb;

    -- Phase 7 inventory deduction variables:
    v_prod record;
    v_prod_uuid uuid;
    v_allow_neg boolean := false;
    v_new_stock numeric;
    v_batch record;
    v_qty_needed numeric;
    v_deduct_qty numeric;
    v_item_qty numeric;
BEGIN
    -- 1. Tenant Isolation: Ensure caller belongs to target salon if session exists
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller salon % does not match invoice salon %', v_caller_salon, p_salon_id;
    END IF;

    -- Idempotency check: If key provided and already completed, return existing
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT id, invoice_number, is_draft, total_amount, paid_amount, payment_status
        INTO v_existing_by_idempotency
        FROM public.invoices
        WHERE salon_id = p_salon_id AND idempotency_key = trim(p_idempotency_key);

        IF FOUND AND v_existing_by_idempotency.is_draft = false THEN
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
                    SELECT jsonb_agg(li)
                    FROM public.invoice_line_items li
                    WHERE li.invoice_id = i.id AND li.salon_id = i.salon_id
                ), '[]'::jsonb),
                'payments', COALESCE((
                    SELECT jsonb_agg(p)
                    FROM public.payments p
                    WHERE p.invoice_id = i.id AND p.salon_id = i.salon_id
                ), '[]'::jsonb)
            ) INTO v_res
            FROM public.invoices i
            WHERE id = v_existing_by_idempotency.id AND i.salon_id = p_salon_id;

            RETURN v_res;
        END IF;
    END IF;

    v_invoice_id := COALESCE(p_invoice_id, 'inv-' || gen_random_uuid());

    -- 2. Discount Authorization Check: If discount > 10% of subtotal, valid grant is mandatory
    IF p_subtotal > 0 AND p_discount_amount > 0 THEN
        v_discount_pct := (p_discount_amount / p_subtotal) * 100.0;
        IF v_discount_pct > 10.01 THEN
            IF p_authorization_grant_id IS NULL OR length(trim(p_authorization_grant_id)) = 0 THEN
                RAISE EXCEPTION 'Discounts exceeding 10%% require salon owner authorization: Discounts exceeding 10%% require a valid owner authorization grant';
            END IF;

            -- Lock the grant row FOR UPDATE to prevent race conditions and concurrent reuse
            SELECT * INTO v_grant
            FROM public.discount_authorizations
            WHERE id = trim(p_authorization_grant_id)
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Invalid authorization grant: grant not found';
            END IF;

            -- Verify salon isolation
            IF v_grant.salon_id <> p_salon_id THEN
                RAISE EXCEPTION 'Cross-salon authorization grant rejected';
            END IF;

            -- Verify invoice binding
            IF v_grant.invoice_id <> v_invoice_id THEN
                RAISE EXCEPTION 'Authorization grant is bound to invoice % but attempted on invoice %',
                    v_grant.invoice_id, v_invoice_id;
            END IF;

            -- Verify single-use status
            IF v_grant.status <> 'active' OR v_grant.used_at IS NOT NULL THEN
                RAISE EXCEPTION 'Authorization grant has already been used or revoked (status: %)', v_grant.status;
            END IF;

            -- Verify expiration
            IF v_grant.expires_at < timezone('utc', now()) THEN
                UPDATE public.discount_authorizations SET status = 'expired' WHERE id = v_grant.id;
                RAISE EXCEPTION 'Authorization grant has expired';
            END IF;

            -- Verify exact discount amount and financial context
            IF p_discount_amount > (v_grant.discount_amount + 0.01) THEN
                RAISE EXCEPTION 'Final discount amount (₹%) exceeds authorized discount amount (₹%)',
                    p_discount_amount, v_grant.discount_amount;
            END IF;

            IF p_subtotal < (v_grant.subtotal - 0.01) THEN
                RAISE EXCEPTION 'Invoice subtotal has changed since authorization was granted';
            END IF;

            -- Verify approving owner is an active OWNER of this salon
            SELECT id, name, role, active INTO v_approving_owner
            FROM public.users
            WHERE id = v_grant.owner_id AND salon_id = p_salon_id;

            IF NOT FOUND OR v_approving_owner.role <> 'OWNER' OR v_approving_owner.active IS NOT TRUE THEN
                RAISE EXCEPTION 'Approving user is not an active Owner of this salon';
            END IF;

            -- Atomically consume the grant in this transaction
            UPDATE public.discount_authorizations
            SET status = 'consumed',
                used_at = timezone('utc', now()),
                consumed_in_invoice_id = v_invoice_id
            WHERE id = v_grant.id;

            -- Bind actual approving owner's ID
            v_actual_authorized_by := v_approving_owner.id;
        ELSE
            -- Normal discount <= 10%: standard optional authorized_by
            v_actual_authorized_by := p_authorized_by;
        END IF;
    ELSE
        v_actual_authorized_by := NULL;
    END IF;

    -- 3. Check for existing draft or invoice
    SELECT id, is_draft, draft_version, invoice_number INTO v_existing_inv
    FROM public.invoices
    WHERE id = v_invoice_id AND salon_id = p_salon_id;

    IF FOUND THEN
        -- If it was a draft, convert it to finalized
        IF v_existing_inv.is_draft = true THEN
            -- Lock row and verify draft OCC if expected version provided
            SELECT draft_version INTO v_current_draft_version
            FROM public.invoices
            WHERE id = v_invoice_id AND salon_id = p_salon_id
            FOR UPDATE;

            IF p_expected_draft_version IS NOT NULL AND p_expected_draft_version <> v_current_draft_version THEN
                RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Draft % was modified by another session (expected version %, current version %)',
                    v_invoice_id, p_expected_draft_version, v_current_draft_version;
            END IF;

            -- Generate permanent sequential invoice number
            v_year := to_char(CURRENT_DATE, 'YYYY');
            v_seq := nextval('public.invoice_number_seq');
            v_invoice_number := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');

            -- Purge draft line items before inserting finalized line items
            DELETE FROM public.invoice_line_items
            WHERE invoice_id = v_invoice_id AND salon_id = p_salon_id;
            DELETE FROM public.payments
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
                authorized_by = v_actual_authorized_by,
                notes = p_notes,
                idempotency_key = p_idempotency_key,
                draft_version = v_existing_inv.draft_version + 1,
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
            id, salon_id, invoice_number, appointment_id, client_id, client_name, client_phone, client_email,
            staff_id, staff_name, service_id, service_name, date, subtotal, discount_amount, discount_type,
            discount_reason, tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
            balance_due, payment_status, primary_payment_method, is_gst_invoice, tax_treatment, is_draft,
            walk_in_guest, authorized_by, notes, idempotency_key, created_at, updated_at
        ) VALUES (
            v_invoice_id, p_salon_id, v_invoice_number, p_appointment_id, p_client_id, p_client_name, p_client_phone, p_client_email,
            p_staff_id, p_staff_name, p_service_id, p_service_name, p_date, p_subtotal, p_discount_amount, p_discount_type,
            p_discount_reason, p_tax_rate, p_tax_amount, p_cgst_amount, p_sgst_amount, p_total_amount, 0,
            p_total_amount, 'unpaid', p_primary_payment_method, p_is_gst_invoice, p_tax_treatment, false,
            p_walk_in_guest, v_actual_authorized_by, p_notes, p_idempotency_key,
            timezone('utc', now()), timezone('utc', now())
        );
    END IF;

    -- 4. Insert Line Items & Atomic Retail Inventory Deduction
    SELECT allow_negative_stock INTO v_allow_neg
    FROM public.inventory_settings
    WHERE salon_id = p_salon_id;
    v_allow_neg := COALESCE(v_allow_neg, false);

    IF p_line_items IS NOT NULL AND jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
        LOOP
            v_item_qty := COALESCE((v_item->>'quantity')::numeric, 1);

            INSERT INTO public.invoice_line_items (
                id, salon_id, invoice_id, description, quantity, unit_price,
                total_price, item_type, product_id, service_id, staff_id,
                discount_amount, tax_rate, tax_amount
            ) VALUES (
                COALESCE(v_item->>'id', 'item-' || gen_random_uuid()),
                p_salon_id, v_invoice_id,
                COALESCE(v_item->>'description', 'Salon Item'),
                v_item_qty,
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

            -- RETAIL PRODUCT INVENTORY DEDUCTION
            IF COALESCE(v_item->>'item_type', '') IN ('product', 'retail') AND NULLIF(trim(v_item->>'product_id'), '') IS NOT NULL THEN
                v_prod_uuid := NULL;
                BEGIN
                    v_prod_uuid := (v_item->>'product_id')::uuid;
                EXCEPTION WHEN OTHERS THEN
                    SELECT id INTO v_prod_uuid FROM public.inventory_products
                    WHERE salon_id = p_salon_id AND (id::text = v_item->>'product_id' OR sku = v_item->>'product_id') LIMIT 1;
                END;

                IF v_prod_uuid IS NOT NULL THEN
                    SELECT * INTO v_prod FROM public.inventory_products
                    WHERE id = v_prod_uuid AND salon_id = p_salon_id
                    FOR UPDATE;

                    IF FOUND THEN
                        IF NOT v_allow_neg AND (v_prod.current_stock < v_item_qty) THEN
                            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" only has % units available (requested %)',
                                v_prod.name, v_prod.current_stock, v_item_qty;
                        END IF;

                        v_new_stock := v_prod.current_stock - v_item_qty;

                        UPDATE public.inventory_products
                        SET current_stock = v_new_stock,
                            status = CASE
                                WHEN v_new_stock <= 0 THEN 'out_of_stock'
                                WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
                                ELSE 'active'
                            END,
                            updated_at = timezone('utc'::text, now())
                        WHERE id = v_prod_uuid;

                        -- Auditable Movement Entry
                        INSERT INTO public.inventory_stock_movements (
                            salon_id, product_id, movement_type, quantity, previous_stock,
                            new_stock, reference_id, notes, created_by, source_document,
                            unit_cost, total_cost
                        ) VALUES (
                            p_salon_id, v_prod_uuid, 'SALE_DEDUCTION', v_item_qty,
                            v_prod.current_stock, v_new_stock, v_invoice_id,
                            'POS Sale on invoice ' || v_invoice_number, v_actual_authorized_by,
                            'INVOICE', v_prod.purchase_price, (v_item_qty * v_prod.purchase_price)
                        );

                        -- FEFO Batch Deduction if Batch-Tracked
                        IF v_prod.is_batch_tracked THEN
                            v_qty_needed := v_item_qty;
                            FOR v_batch IN SELECT * FROM public.inventory_batches
                                           WHERE salon_id = p_salon_id AND product_id = v_prod_uuid
                                             AND status = 'active' AND expiry_date >= CURRENT_DATE
                                             AND current_quantity > 0
                                           ORDER BY expiry_date ASC
                                           FOR UPDATE
                            LOOP
                                IF v_qty_needed <= 0 THEN
                                    EXIT;
                                END IF;

                                v_deduct_qty := LEAST(v_batch.current_quantity, v_qty_needed);
                                UPDATE public.inventory_batches
                                SET current_quantity = current_quantity - v_deduct_qty,
                                    status = CASE WHEN (current_quantity - v_deduct_qty) <= 0 THEN 'depleted' ELSE status END,
                                    updated_at = timezone('utc'::text, now())
                                WHERE id = v_batch.id;

                                v_qty_needed := v_qty_needed - v_deduct_qty;
                            END LOOP;

                            IF v_qty_needed > 0 AND NOT v_allow_neg THEN
                                RAISE EXCEPTION 'INSUFFICIENT_BATCH_STOCK: Item "%" does not have enough active, non-expired batch stock (% remaining needed)',
                                    v_prod.name, v_qty_needed;
                            END IF;
                        END IF;
                    END IF;
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- 5. Insert Payments (Reconciliation trigger automatically calculates paid_amount, balance_due, payment_status)
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

    -- 6. Return fully hydrated invoice JSON
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
            SELECT jsonb_agg(li)
            FROM public.invoice_line_items li
            WHERE li.invoice_id = i.id AND li.salon_id = i.salon_id
        ), '[]'::jsonb),
        'payments', COALESCE((
            SELECT jsonb_agg(p)
            FROM public.payments p
            WHERE p.invoice_id = i.id AND p.salon_id = i.salon_id
        ), '[]'::jsonb)
    ) INTO v_res
    FROM public.invoices i
    WHERE i.id = v_invoice_id AND i.salon_id = p_salon_id;

    RETURN v_res;
END;
$$;

-- ==============================================================================
-- 10. RPC: RECORD CONSUMABLE USAGE (Salon Services & Internal Operations)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_record_consumable_usage(
    p_salon_id TEXT,
    p_product_id UUID,
    p_quantity NUMERIC,
    p_unit TEXT DEFAULT NULL,
    p_appointment_id TEXT DEFAULT NULL,
    p_service_id TEXT DEFAULT NULL,
    p_staff_id TEXT DEFAULT NULL,
    p_batch_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Service usage',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_user_id TEXT := NULL;
    v_caller_salon TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_usage_num TEXT;
    v_new_usage_id UUID;
    v_prod RECORD;
    v_batch RECORD;
    v_new_stock NUMERIC;
    v_allow_neg BOOLEAN := false;
    v_unit TEXT;
    v_cost NUMERIC(12,4);
    v_total_cost NUMERIC(12,4);
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record consumable usage for another salon';
        END IF;
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Usage quantity must be greater than zero';
    END IF;

    SELECT allow_negative_stock INTO v_allow_neg
    FROM public.inventory_settings
    WHERE salon_id = p_salon_id;
    v_allow_neg := COALESCE(v_allow_neg, false);

    SELECT * INTO v_prod
    FROM public.inventory_products
    WHERE id = p_product_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Product % not found in salon %', p_product_id, p_salon_id;
    END IF;

    IF NOT v_allow_neg AND (v_prod.current_stock < p_quantity) THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" only has % units available (requested %)',
            v_prod.name, v_prod.current_stock, p_quantity;
    END IF;

    -- Validate batch if specified
    IF p_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch
        FROM public.inventory_batches
        WHERE id = p_batch_id AND salon_id = p_salon_id AND product_id = p_product_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Batch % not found for product', p_batch_id;
        END IF;

        IF v_batch.status = 'quarantined' THEN
            RAISE EXCEPTION 'BATCH_QUARANTINED: Cannot use batch % because it is quarantined', v_batch.batch_number;
        END IF;

        IF v_batch.expiry_date < CURRENT_DATE THEN
            RAISE EXCEPTION 'BATCH_EXPIRED: Cannot use batch % because it expired on %',
                v_batch.batch_number, v_batch.expiry_date;
        END IF;

        IF NOT v_allow_neg AND (v_batch.current_quantity < p_quantity) THEN
            RAISE EXCEPTION 'INSUFFICIENT_BATCH_STOCK: Batch % only has % units available (requested %)',
                v_batch.batch_number, v_batch.current_quantity, p_quantity;
        END IF;

        UPDATE public.inventory_batches
        SET current_quantity = current_quantity - p_quantity,
            status = CASE WHEN (current_quantity - p_quantity) <= 0 THEN 'depleted' ELSE status END,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_batch_id;
    END IF;

    v_new_stock := v_prod.current_stock - p_quantity;
    v_unit := COALESCE(trim(p_unit), v_prod.unit);
    v_cost := COALESCE(NULLIF(v_prod.weighted_average_cost, 0), v_prod.purchase_price);
    v_total_cost := p_quantity * v_cost;

    v_usage_num := 'USE-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.consumable_usage_number_seq')::text, 4, '0');

    -- Insert usage record
    INSERT INTO public.consumable_usages (
        salon_id, usage_number, product_id, batch_id, quantity, unit,
        appointment_id, service_id, staff_id, unit_cost, total_cost,
        reason, notes, recorded_by
    ) VALUES (
        p_salon_id, v_usage_num, p_product_id, p_batch_id, p_quantity, v_unit,
        p_appointment_id, p_service_id, p_staff_id, v_cost, v_total_cost,
        trim(p_reason), trim(p_notes), v_caller_user_id
    ) RETURNING id INTO v_new_usage_id;

    -- Update product stock & status
    UPDATE public.inventory_products
    SET current_stock = v_new_stock,
        status = CASE 
            WHEN v_new_stock <= 0 THEN 'out_of_stock'
            WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
            ELSE 'active'
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    -- Insert movement
    INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock,
        new_stock, reference_id, notes, created_by, source_document,
        unit_cost, total_cost, batch_id
    ) VALUES (
        p_salon_id, p_product_id, 'CONSUMABLE_USAGE', p_quantity,
        v_prod.current_stock, v_new_stock, v_usage_num,
        'Consumable usage via ' || v_usage_num || ': ' || COALESCE(p_reason, 'Usage'),
        v_caller_user_id, 'CONSUMABLE_USAGE', v_cost, v_total_cost, p_batch_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'usage_id', v_new_usage_id,
        'usage_number', v_usage_num,
        'product_id', p_product_id,
        'quantity', p_quantity,
        'previous_stock', v_prod.current_stock,
        'new_stock', v_new_stock
    );
END;
$$;

-- ==============================================================================
-- 11. RPC: RECORD STOCK LOSS (Damage, Expiry, Wastage)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_record_stock_loss(
    p_salon_id TEXT,
    p_product_id UUID,
    p_loss_type TEXT,
    p_quantity NUMERIC,
    p_batch_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Damaged goods',
    p_supporting_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_user_id TEXT := NULL;
    v_caller_salon TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_loss_num TEXT;
    v_new_loss_id UUID;
    v_prod RECORD;
    v_batch RECORD;
    v_new_stock NUMERIC;
    v_loss_threshold NUMERIC;
    v_total_loss_value NUMERIC(12,4);
    v_mov_type TEXT;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record stock loss for another salon';
        END IF;
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Loss quantity must be greater than zero';
    END IF;

    IF p_loss_type NOT IN ('DAMAGE', 'EXPIRY', 'WASTAGE', 'INTERNAL_LOSS', 'REJECTION') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid loss type %', p_loss_type;
    END IF;

    SELECT * INTO v_prod
    FROM public.inventory_products
    WHERE id = p_product_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Product % not found in salon %', p_product_id, p_salon_id;
    END IF;

    IF v_prod.current_stock < p_quantity THEN
        RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" only has % units available (loss quantity %)',
            v_prod.name, v_prod.current_stock, p_quantity;
    END IF;

    v_total_loss_value := p_quantity * v_prod.purchase_price;

    -- Owner approval check for high-value losses
    SELECT high_value_loss_threshold INTO v_loss_threshold
    FROM public.inventory_settings
    WHERE salon_id = p_salon_id;
    v_loss_threshold := COALESCE(v_loss_threshold, 2000.00);

    IF v_total_loss_value > v_loss_threshold AND (v_caller_role IS NOT NULL AND v_caller_role != 'OWNER') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Stock losses exceeding ₹% require Owner authorization', v_loss_threshold;
    END IF;

    -- Update batch if specified
    IF p_batch_id IS NOT NULL THEN
        SELECT * INTO v_batch
        FROM public.inventory_batches
        WHERE id = p_batch_id AND salon_id = p_salon_id AND product_id = p_product_id
        FOR UPDATE;

        IF FOUND THEN
            UPDATE public.inventory_batches
            SET current_quantity = GREATEST(0, current_quantity - p_quantity),
                status = CASE 
                    WHEN (current_quantity - p_quantity) <= 0 THEN 'depleted'
                    WHEN p_loss_type = 'EXPIRY' THEN 'expired'
                    ELSE status 
                END,
                updated_at = timezone('utc'::text, now())
            WHERE id = p_batch_id;
        END IF;
    END IF;

    v_new_stock := v_prod.current_stock - p_quantity;
    v_loss_num := 'LOSS-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.stock_loss_number_seq')::text, 4, '0');

    INSERT INTO public.stock_loss_records (
        salon_id, loss_number, product_id, batch_id, loss_type, quantity,
        unit_cost, total_cost, reason, supporting_notes, recorded_by,
        approved_by
    ) VALUES (
        p_salon_id, v_loss_num, p_product_id, p_batch_id, p_loss_type, p_quantity,
        v_prod.purchase_price, v_total_loss_value, trim(p_reason),
        trim(p_supporting_notes), v_caller_user_id,
        CASE WHEN v_caller_role = 'OWNER' THEN v_caller_user_id ELSE NULL END
    ) RETURNING id INTO v_new_loss_id;

    UPDATE public.inventory_products
    SET current_stock = v_new_stock,
        status = CASE 
            WHEN v_new_stock <= 0 THEN 'out_of_stock'
            WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
            ELSE 'active'
        END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_product_id;

    v_mov_type := CASE 
        WHEN p_loss_type = 'DAMAGE' THEN 'DAMAGE'
        WHEN p_loss_type = 'EXPIRY' THEN 'EXPIRY'
        ELSE 'WASTAGE'
    END;

    INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock,
        new_stock, reference_id, notes, created_by, source_document,
        unit_cost, total_cost, batch_id
    ) VALUES (
        p_salon_id, p_product_id, v_mov_type, p_quantity,
        v_prod.current_stock, v_new_stock, v_loss_num,
        'Stock loss (' || p_loss_type || '): ' || p_reason,
        v_caller_user_id, 'STOCK_LOSS', v_prod.purchase_price,
        v_total_loss_value, p_batch_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'loss_id', v_new_loss_id,
        'loss_number', v_loss_num,
        'total_loss_value', v_total_loss_value,
        'previous_stock', v_prod.current_stock,
        'new_stock', v_new_stock
    );
END;
$$;

-- ==============================================================================
-- 12. RPC: PHYSICAL STOCK AUDIT WORKFLOW
-- ==============================================================================

-- 12.1 Create Audit Session & Snapshot Quantities
CREATE OR REPLACE FUNCTION public.rpc_create_stock_audit_session(
    p_salon_id TEXT,
    p_title TEXT,
    p_category_filter TEXT DEFAULT 'ALL',
    p_item_type_filter TEXT DEFAULT 'ALL',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_user_id TEXT := NULL;
    v_caller_salon TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_audit_num TEXT;
    v_new_audit_id UUID;
    v_prod RECORD;
    v_count INTEGER := 0;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot create audit session for another salon';
        END IF;
    END IF;

    v_audit_num := 'AUD-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.stock_audit_number_seq')::text, 4, '0');

    INSERT INTO public.stock_audit_sessions (
        salon_id, audit_number, title, category_filter, item_type_filter,
        status, counted_by, notes, audit_date
    ) VALUES (
        p_salon_id, v_audit_num, trim(p_title), COALESCE(trim(p_category_filter), 'ALL'),
        COALESCE(trim(p_item_type_filter), 'ALL'), 'draft', v_caller_user_id,
        trim(p_notes), CURRENT_DATE
    ) RETURNING id INTO v_new_audit_id;

    -- Snapshot current stock for items matching criteria
    FOR v_prod IN SELECT id, current_stock, purchase_price, weighted_average_cost
                  FROM public.inventory_products
                  WHERE salon_id = p_salon_id AND status != 'archived'
                    AND (p_category_filter = 'ALL' OR category = p_category_filter)
                    AND (p_item_type_filter = 'ALL' OR item_type = p_item_type_filter)
    LOOP
        INSERT INTO public.stock_audit_items (
            salon_id, audit_id, product_id, system_quantity, unit_cost
        ) VALUES (
            p_salon_id, v_new_audit_id, v_prod.id, v_prod.current_stock,
            COALESCE(NULLIF(v_prod.weighted_average_cost, 0), v_prod.purchase_price)
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'audit_id', v_new_audit_id,
        'audit_number', v_audit_num,
        'items_count', v_count
    );
END;
$$;

-- 12.2 Record Physical Counts & Calculate Variances
CREATE OR REPLACE FUNCTION public.rpc_record_stock_audit_counts(
    p_salon_id TEXT,
    p_audit_id UUID,
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item RECORD;
    v_discrepancies INTEGER := 0;
    v_counted INTEGER := 0;
    v_net_var_qty NUMERIC := 0.000;
    v_net_var_val NUMERIC := 0.0000;
    v_session RECORD;
BEGIN
    SELECT * INTO v_session FROM public.stock_audit_sessions
    WHERE id = p_audit_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Stock audit session % not found', p_audit_id;
    END IF;

    IF v_session.status = 'reconciled' THEN
        RAISE EXCEPTION 'ALREADY_RECONCILED: Cannot edit counts on a reconciled audit session';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        counted_quantity NUMERIC,
        discrepancy_reason TEXT
    )
    LOOP
        UPDATE public.stock_audit_items
        SET counted_quantity = v_item.counted_quantity,
            variance_quantity = v_item.counted_quantity - system_quantity,
            variance_value = (v_item.counted_quantity - system_quantity) * unit_cost,
            discrepancy_reason = trim(v_item.discrepancy_reason)
        WHERE audit_id = p_audit_id AND salon_id = p_salon_id AND product_id = v_item.product_id;
    END LOOP;

    -- Update session aggregates
    SELECT 
        COUNT(*) FILTER (WHERE counted_quantity IS NOT NULL),
        COUNT(*) FILTER (WHERE variance_quantity IS NOT NULL AND variance_quantity != 0),
        COALESCE(SUM(variance_quantity), 0),
        COALESCE(SUM(variance_value), 0)
    INTO v_counted, v_discrepancies, v_net_var_qty, v_net_var_val
    FROM public.stock_audit_items
    WHERE audit_id = p_audit_id AND salon_id = p_salon_id;

    UPDATE public.stock_audit_sessions
    SET total_items_counted = v_counted,
        total_discrepancies = v_discrepancies,
        net_variance_quantity = v_net_var_qty,
        net_variance_value = v_net_var_val,
        status = 'completed',
        updated_at = timezone('utc'::text, now())
    WHERE id = p_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'audit_id', p_audit_id,
        'total_counted', v_counted,
        'total_discrepancies', v_discrepancies,
        'net_variance_quantity', v_net_var_qty,
        'net_variance_value', v_net_var_val
    );
END;
$$;

-- 12.3 Reconcile Audit Session (Apply Adjustments to Stock)
CREATE OR REPLACE FUNCTION public.rpc_reconcile_stock_audit(
    p_salon_id TEXT,
    p_audit_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_user_id TEXT := NULL;
    v_caller_salon TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_session RECORD;
    v_item RECORD;
    v_prod RECORD;
    v_new_stock NUMERIC;
    v_reconciled_count INTEGER := 0;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can approve and reconcile stock audits';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot reconcile audit for another salon';
        END IF;
    END IF;

    SELECT * INTO v_session
    FROM public.stock_audit_sessions
    WHERE id = p_audit_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Stock audit session % not found', p_audit_id;
    END IF;

    IF v_session.status = 'reconciled' THEN
        RAISE EXCEPTION 'ALREADY_RECONCILED: Stock audit session % has already been reconciled', v_session.audit_number;
    END IF;

    -- Apply variance to stock for each item
    FOR v_item IN SELECT * FROM public.stock_audit_items
                  WHERE audit_id = p_audit_id AND salon_id = p_salon_id AND is_reconciled = false
                    AND variance_quantity IS NOT NULL AND variance_quantity != 0
                  FOR UPDATE
    LOOP
        SELECT * INTO v_prod
        FROM public.inventory_products
        WHERE id = v_item.product_id AND salon_id = p_salon_id
        FOR UPDATE;

        IF FOUND THEN
            v_new_stock := GREATEST(0, v_prod.current_stock + v_item.variance_quantity);

            UPDATE public.inventory_products
            SET current_stock = v_new_stock,
                status = CASE 
                    WHEN v_new_stock <= 0 THEN 'out_of_stock'
                    WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
                    ELSE 'active'
                END,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_item.product_id;

            INSERT INTO public.inventory_stock_movements (
                salon_id, product_id, movement_type, quantity, previous_stock,
                new_stock, reference_id, notes, created_by, source_document,
                unit_cost, total_cost
            ) VALUES (
                p_salon_id, v_item.product_id,
                CASE WHEN v_item.variance_quantity > 0 THEN 'STOCK_ADJUSTMENT_IN' ELSE 'STOCK_ADJUSTMENT_OUT' END,
                abs(v_item.variance_quantity), v_prod.current_stock, v_new_stock,
                v_session.audit_number,
                'Physical audit reconciliation via ' || v_session.audit_number || COALESCE(': ' || v_item.discrepancy_reason, ''),
                v_caller_user_id, 'STOCK_AUDIT', v_item.unit_cost, abs(v_item.variance_value)
            );

            UPDATE public.stock_audit_items
            SET is_reconciled = true
            WHERE id = v_item.id;

            v_reconciled_count := v_reconciled_count + 1;
        END IF;
    END LOOP;

    UPDATE public.stock_audit_sessions
    SET status = 'reconciled',
        reconciled_at = timezone('utc'::text, now()),
        approved_by = v_caller_user_id,
        notes = COALESCE(trim(p_notes), notes),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_audit_id;

    RETURN jsonb_build_object(
        'success', true,
        'audit_id', p_audit_id,
        'audit_number', v_session.audit_number,
        'reconciled_items_count', v_reconciled_count
    );
END;
$$;

-- ==============================================================================
-- 13. RPC: CREATE INVENTORY BATCH
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_inventory_batch(
    p_salon_id TEXT,
    p_product_id UUID,
    p_batch_number TEXT,
    p_expiry_date DATE,
    p_received_quantity NUMERIC DEFAULT 0,
    p_unit_cost NUMERIC DEFAULT 0,
    p_supplier_id UUID DEFAULT NULL,
    p_manufacturing_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_batch TEXT;
    v_new_batch_id UUID;
BEGIN
    v_clean_batch := upper(trim(p_batch_number));
    IF v_clean_batch IS NULL OR v_clean_batch = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Batch number is required';
    END IF;

    IF p_expiry_date IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Expiry date is required for batch tracking';
    END IF;

    INSERT INTO public.inventory_batches (
        salon_id, product_id, batch_number, expiry_date, received_quantity,
        current_quantity, unit_cost, supplier_id, manufacturing_date, notes,
        status
    ) VALUES (
        p_salon_id, p_product_id, v_clean_batch, p_expiry_date,
        GREATEST(0, COALESCE(p_received_quantity, 0)),
        GREATEST(0, COALESCE(p_received_quantity, 0)),
        GREATEST(0, COALESCE(p_unit_cost, 0)),
        p_supplier_id, p_manufacturing_date, trim(p_notes),
        CASE WHEN p_expiry_date < CURRENT_DATE THEN 'expired' ELSE 'active' END
    ) RETURNING id INTO v_new_batch_id;

    -- Ensure product has batch tracking enabled
    UPDATE public.inventory_products
    SET is_batch_tracked = true
    WHERE id = p_product_id AND salon_id = p_salon_id;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_new_batch_id,
        'batch_number', v_clean_batch,
        'expiry_date', p_expiry_date
    );
END;
$$;

-- ==============================================================================
-- 14. RPC: GET INVENTORY DASHBOARD KPIS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_inventory_dashboard_kpis(p_salon_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_prods BIGINT := 0;
    v_retail_skus BIGINT := 0;
    v_consumable_skus BIGINT := 0;
    v_total_units NUMERIC := 0.000;
    v_total_val NUMERIC := 0.0000;
    v_retail_val NUMERIC := 0.0000;
    v_consumable_val NUMERIC := 0.0000;
    v_low_stock BIGINT := 0;
    v_out_of_stock BIGINT := 0;
    v_expired_batches BIGINT := 0;
    v_near_expiry_batches BIGINT := 0;
    v_quarantined_batches BIGINT := 0;
    v_recent_movements JSONB := '[]'::jsonb;
BEGIN
    SELECT 
        COUNT(*),
        COUNT(*) FILTER (WHERE item_type = 'retail'),
        COUNT(*) FILTER (WHERE item_type = 'consumable'),
        COALESCE(SUM(current_stock), 0),
        COALESCE(SUM(current_stock * COALESCE(NULLIF(weighted_average_cost, 0), purchase_price)), 0),
        COALESCE(SUM(CASE WHEN item_type = 'retail' THEN current_stock * COALESCE(NULLIF(weighted_average_cost, 0), purchase_price) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_type = 'consumable' THEN current_stock * COALESCE(NULLIF(weighted_average_cost, 0), purchase_price) ELSE 0 END), 0),
        COUNT(*) FILTER (WHERE current_stock <= min_stock_threshold AND current_stock > 0),
        COUNT(*) FILTER (WHERE current_stock <= 0)
    INTO 
        v_total_prods, v_retail_skus, v_consumable_skus, v_total_units,
        v_total_val, v_retail_val, v_consumable_val, v_low_stock, v_out_of_stock
    FROM public.inventory_products
    WHERE salon_id = p_salon_id AND status != 'archived';

    SELECT 
        COUNT(*) FILTER (WHERE expiry_date < CURRENT_DATE AND current_quantity > 0),
        COUNT(*) FILTER (WHERE expiry_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + 30) AND current_quantity > 0),
        COUNT(*) FILTER (WHERE status = 'quarantined')
    INTO v_expired_batches, v_near_expiry_batches, v_quarantined_batches
    FROM public.inventory_batches
    WHERE salon_id = p_salon_id;

    -- Recent 5 movements
    SELECT jsonb_agg(m) INTO v_recent_movements FROM (
        SELECT sm.id, sm.movement_type, sm.quantity, sm.previous_stock, sm.new_stock,
               sm.reference_id, sm.created_at, p.name as product_name, p.sku
        FROM public.inventory_stock_movements sm
        JOIN public.inventory_products p ON p.id = sm.product_id
        WHERE sm.salon_id = p_salon_id
        ORDER BY sm.created_at DESC
        LIMIT 5
    ) m;

    RETURN jsonb_build_object(
        'total_products', v_total_prods,
        'retail_skus', v_retail_skus,
        'consumable_skus', v_consumable_skus,
        'total_units', v_total_units,
        'total_valuation', v_total_val,
        'retail_valuation', v_retail_val,
        'consumable_valuation', v_consumable_val,
        'low_stock_count', v_low_stock,
        'out_of_stock_count', v_out_of_stock,
        'expired_batches_count', v_expired_batches,
        'near_expiry_batches_count', v_near_expiry_batches,
        'quarantined_batches_count', v_quarantined_batches,
        'recent_movements', COALESCE(v_recent_movements, '[]'::jsonb)
    );
END;
$$;
