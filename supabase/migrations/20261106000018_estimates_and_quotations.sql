-- ==============================================================================
-- LUMA SALON BUSINESS SUITE — PHASE 5 MIGRATION
-- Migration 18: Estimates, Quotations & Proforma Invoicing System
-- Full Quotation Lifecycle, Public Approval Portal, Snapshot Invariant & Conversion
-- ==============================================================================

-- 1. Numbering Sequences
CREATE SEQUENCE IF NOT EXISTS public.quotation_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.proforma_number_seq START 1;

-- 2. Quotations Table
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    quotation_number TEXT NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_email TEXT,
    is_walk_in BOOLEAN NOT NULL DEFAULT false,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + 14),
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    discount_type TEXT CHECK (discount_type = ANY (ARRAY['flat'::text, 'percentage'::text])),
    discount_value NUMERIC(12, 2) DEFAULT 0,
    discount_reason TEXT,
    authorized_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    authorization_grant_id TEXT,
    tax_treatment TEXT NOT NULL DEFAULT 'exclusive' CHECK (tax_treatment = ANY (ARRAY['exclusive'::text, 'inclusive'::text, 'non_gst'::text])),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status = ANY (ARRAY[
        'draft'::text, 'sent'::text, 'viewed'::text, 'accepted'::text,
        'rejected'::text, 'expired'::text, 'converted'::text, 'cancelled'::text
    ])),
    customer_notes TEXT,
    internal_notes TEXT,
    terms_and_conditions TEXT,
    advance_required NUMERIC(12, 2) DEFAULT 0 CHECK (advance_required >= 0),
    estimated_duration_minutes INTEGER DEFAULT 0,
    converted_invoice_id TEXT REFERENCES public.invoices(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    customer_response_comment TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_quotations_num UNIQUE (salon_id, quotation_number),
    CONSTRAINT uq_quotations_converted UNIQUE (salon_id, converted_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_quotations_salon_date ON public.quotations(salon_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_quotations_salon_client ON public.quotations(salon_id, client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_salon_status ON public.quotations(salon_id, status);

-- 3. Quotation Items Table (Stores Immutable Snapshot of Items & Tax)
CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type = ANY (ARRAY['service'::text, 'product'::text, 'custom'::text])),
    service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
    product_id TEXT,
    staff_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    staff_name TEXT,
    name TEXT NOT NULL,
    description TEXT,
    is_custom BOOLEAN NOT NULL DEFAULT false,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    taxable_amount NUMERIC(12, 2) NOT NULL CHECK (taxable_amount >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quote ON public.quotation_items(quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_salon ON public.quotation_items(salon_id);

-- 4. Quotation Sharing Links Table (32-byte CSPRNG token hash storage)
CREATE TABLE IF NOT EXISTS public.quotation_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_quotation_shares_token ON public.quotation_shares(token_hash);
CREATE INDEX IF NOT EXISTS idx_quotation_shares_quote ON public.quotation_shares(salon_id, quotation_id);

-- 5. Proforma Invoices Table (Isolated from revenue and finalized sales)
CREATE TABLE IF NOT EXISTS public.proforma_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    proforma_number TEXT NOT NULL,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_email TEXT,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'issued' CHECK (status = ANY (ARRAY['issued'::text, 'expired'::text, 'cancelled'::text])),
    notes TEXT,
    terms_and_conditions TEXT,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_proforma_num UNIQUE (salon_id, proforma_number)
);

CREATE INDEX IF NOT EXISTS idx_proforma_salon ON public.proforma_invoices(salon_id);
CREATE INDEX IF NOT EXISTS idx_proforma_quote ON public.proforma_invoices(quotation_id);

-- 6. Proforma Invoice Line Items Table
CREATE TABLE IF NOT EXISTS public.proforma_invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    proforma_id UUID NOT NULL REFERENCES public.proforma_invoices(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    item_type TEXT NOT NULL DEFAULT 'service',
    staff_name TEXT,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_proforma_items_proforma ON public.proforma_invoice_items(proforma_id);

-- 7. Quotation Audit Logs Table
CREATE TABLE IF NOT EXISTS public.quotation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE CASCADE,
    proforma_id UUID REFERENCES public.proforma_invoices(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    actor_id TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    actor_role TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_quote_audit_quote ON public.quotation_audit_logs(salon_id, quotation_id);

-- ==============================================================================
-- 8. Enable Row Level Security & Access Policies
-- ==============================================================================

ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proforma_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_audit_logs ENABLE ROW LEVEL SECURITY;

-- Quotations Policies
DROP POLICY IF EXISTS "Quotations readable by salon staff" ON public.quotations;
DROP POLICY IF EXISTS "Quotations insertable by salon staff" ON public.quotations;
DROP POLICY IF EXISTS "Quotations updatable by salon staff" ON public.quotations;

CREATE POLICY "Quotations readable by salon staff" ON public.quotations
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotations insertable by salon staff" ON public.quotations
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotations updatable by salon staff" ON public.quotations
    FOR UPDATE TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    )
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Quotation Items Policies
DROP POLICY IF EXISTS "Quotation items readable by salon staff" ON public.quotation_items;
DROP POLICY IF EXISTS "Quotation items insertable by salon staff" ON public.quotation_items;
DROP POLICY IF EXISTS "Quotation items updatable by salon staff" ON public.quotation_items;
DROP POLICY IF EXISTS "Quotation items deletable by salon staff" ON public.quotation_items;

CREATE POLICY "Quotation items readable by salon staff" ON public.quotation_items
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotation items insertable by salon staff" ON public.quotation_items
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotation items updatable by salon staff" ON public.quotation_items
    FOR UPDATE TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    )
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotation items deletable by salon staff" ON public.quotation_items
    FOR DELETE TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Quotation Shares Policies
DROP POLICY IF EXISTS "Quotation shares readable by salon staff" ON public.quotation_shares;
DROP POLICY IF EXISTS "Quotation shares insertable by salon staff" ON public.quotation_shares;
DROP POLICY IF EXISTS "Quotation shares updatable by salon staff" ON public.quotation_shares;

CREATE POLICY "Quotation shares readable by salon staff" ON public.quotation_shares
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotation shares insertable by salon staff" ON public.quotation_shares
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Quotation shares updatable by salon staff" ON public.quotation_shares
    FOR UPDATE TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    )
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Proforma Policies
DROP POLICY IF EXISTS "Proforma readable by salon staff" ON public.proforma_invoices;
DROP POLICY IF EXISTS "Proforma insertable by salon staff" ON public.proforma_invoices;
CREATE POLICY "Proforma readable by salon staff" ON public.proforma_invoices
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Proforma insertable by salon staff" ON public.proforma_invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Proforma Items Policies
DROP POLICY IF EXISTS "Proforma items readable by salon staff" ON public.proforma_invoice_items;
DROP POLICY IF EXISTS "Proforma items insertable by salon staff" ON public.proforma_invoice_items;
CREATE POLICY "Proforma items readable by salon staff" ON public.proforma_invoice_items
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Proforma items insertable by salon staff" ON public.proforma_invoice_items
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Audit Logs Policies
DROP POLICY IF EXISTS "Quotation audit readable by salon staff" ON public.quotation_audit_logs;
CREATE POLICY "Quotation audit readable by salon staff" ON public.quotation_audit_logs
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- Table level grants for authenticated and postgres roles
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotations TO authenticated, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_items TO authenticated, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotation_shares TO authenticated, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proforma_invoices TO authenticated, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proforma_invoice_items TO authenticated, postgres;
GRANT SELECT, INSERT, UPDATE ON public.quotation_audit_logs TO authenticated, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.quotation_number_seq TO authenticated, postgres;
GRANT USAGE, SELECT ON SEQUENCE public.proforma_number_seq TO authenticated, postgres;

-- ==============================================================================
-- 9. RPC Functions & Stored Procedures
-- ==============================================================================

-- 9.1 RPC: Create Quotation
CREATE OR REPLACE FUNCTION public.rpc_create_quotation(
    p_salon_id TEXT,
    p_client_id TEXT DEFAULT NULL,
    p_client_name TEXT DEFAULT NULL,
    p_client_phone TEXT DEFAULT NULL,
    p_client_email TEXT DEFAULT NULL,
    p_is_walk_in BOOLEAN DEFAULT false,
    p_issue_date DATE DEFAULT CURRENT_DATE,
    p_valid_until DATE DEFAULT (CURRENT_DATE + 14),
    p_subtotal NUMERIC DEFAULT 0,
    p_discount_amount NUMERIC DEFAULT 0,
    p_discount_type TEXT DEFAULT 'flat',
    p_discount_value NUMERIC DEFAULT 0,
    p_discount_reason TEXT DEFAULT NULL,
    p_authorization_grant_id TEXT DEFAULT NULL,
    p_tax_treatment TEXT DEFAULT 'exclusive',
    p_tax_rate NUMERIC DEFAULT 0.18,
    p_tax_amount NUMERIC DEFAULT 0,
    p_cgst_amount NUMERIC DEFAULT 0,
    p_sgst_amount NUMERIC DEFAULT 0,
    p_total_amount NUMERIC DEFAULT 0,
    p_customer_notes TEXT DEFAULT NULL,
    p_internal_notes TEXT DEFAULT NULL,
    p_terms_and_conditions TEXT DEFAULT NULL,
    p_advance_required NUMERIC DEFAULT 0,
    p_estimated_duration_minutes INTEGER DEFAULT 0,
    p_line_items JSONB DEFAULT '[]'::jsonb
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
    v_seq_num BIGINT;
    v_quote_num TEXT;
    v_year TEXT;
    v_new_quote_id UUID;
    v_grant RECORD;
    v_authorized_by TEXT := NULL;
    v_item RECORD;
    v_item_subtotal NUMERIC(12,2) := 0;
    v_item_tax NUMERIC(12,2) := 0;
    v_item_discount NUMERIC(12,2) := 0;
    v_discount_pct NUMERIC(5,2) := 0;
    v_client_name TEXT;
    v_client_phone TEXT;
    v_client_email TEXT;
BEGIN
    -- Resolve caller identity
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can create quotations';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot create quotation for another salon';
        END IF;
    END IF;

    -- Resolve customer details
    IF p_client_id IS NOT NULL THEN
        SELECT name, phone, email INTO v_client_name, v_client_phone, v_client_email
        FROM public.clients
        WHERE id = p_client_id AND salon_id = p_salon_id;

        IF NOT FOUND AND NOT p_is_walk_in THEN
            RAISE EXCEPTION 'NOT_FOUND: Client % does not exist in salon %', p_client_id, p_salon_id;
        END IF;

        v_client_name := COALESCE(p_client_name, v_client_name, 'Guest Customer');
        v_client_phone := COALESCE(p_client_phone, v_client_phone);
        v_client_email := COALESCE(p_client_email, v_client_email);
    ELSE
        v_client_name := COALESCE(trim(p_client_name), 'Walk-in Guest');
        v_client_phone := p_client_phone;
        v_client_email := p_client_email;
    END IF;

    -- Discount Authorization Check
    IF p_subtotal > 0 AND p_discount_amount > 0 THEN
        v_discount_pct := (p_discount_amount / p_subtotal) * 100.0;
        IF v_discount_pct > 10.01 THEN
            IF v_caller_role = 'OWNER' THEN
                v_authorized_by := v_caller_user_id;
            ELSE
                IF p_authorization_grant_id IS NULL OR length(trim(p_authorization_grant_id)) = 0 THEN
                    RAISE EXCEPTION 'Discounts exceeding 10%% require salon owner authorization';
                END IF;

                SELECT * INTO v_grant
                FROM public.discount_authorizations
                WHERE id = trim(p_authorization_grant_id)
                FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Invalid authorization grant: grant not found';
                END IF;

                IF v_grant.salon_id <> p_salon_id THEN
                    RAISE EXCEPTION 'Cross-salon authorization grant rejected';
                END IF;

                IF v_grant.used_at IS NOT NULL THEN
                    RAISE EXCEPTION 'Authorization grant has already been used';
                END IF;

                IF v_grant.expires_at < timezone('utc'::text, now()) THEN
                    RAISE EXCEPTION 'Authorization grant has expired';
                END IF;

                UPDATE public.discount_authorizations
                SET used_at = timezone('utc'::text, now()),
                    used_for_invoice_id = 'QUOTE-' || gen_random_uuid()
                WHERE id = v_grant.id;

                v_authorized_by := v_grant.authorized_by_id;
            END IF;
        END IF;
    END IF;

    -- Generate Monotonic Quotation Number: QT-YYYY-XXXX
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq_num := nextval('public.quotation_number_seq');
    v_quote_num := 'QT-' || v_year || '-' || lpad(v_seq_num::text, 4, '0');

    -- Insert Quotation Header
    INSERT INTO public.quotations (
        salon_id, quotation_number, client_id, client_name, client_phone, client_email,
        is_walk_in, issue_date, valid_until, subtotal, discount_amount, discount_type,
        discount_value, discount_reason, authorized_by, authorization_grant_id,
        tax_treatment, tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount,
        status, customer_notes, internal_notes, terms_and_conditions,
        advance_required, estimated_duration_minutes, created_by
    ) VALUES (
        p_salon_id, v_quote_num, p_client_id, v_client_name, v_client_phone, v_client_email,
        p_is_walk_in, p_issue_date, p_valid_until, round(p_subtotal, 2), round(p_discount_amount, 2),
        p_discount_type, round(COALESCE(p_discount_value, 0), 2), p_discount_reason,
        v_authorized_by, p_authorization_grant_id, p_tax_treatment, round(p_tax_rate, 4),
        round(p_tax_amount, 2), round(p_cgst_amount, 2), round(p_sgst_amount, 2),
        round(p_total_amount, 2), 'draft', p_customer_notes, p_internal_notes,
        p_terms_and_conditions, round(COALESCE(p_advance_required, 0), 2),
        p_estimated_duration_minutes, v_caller_user_id
    ) RETURNING id INTO v_new_quote_id;

    -- Insert Quotation Line Items
    IF jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_line_items) AS x(
            item_type text,
            service_id text,
            product_id text,
            staff_id text,
            staff_name text,
            name text,
            description text,
            is_custom boolean,
            quantity numeric,
            unit_price numeric,
            discount_amount numeric,
            taxable_amount numeric,
            tax_rate numeric,
            tax_amount numeric,
            total_price numeric,
            sort_order integer
        )
        LOOP
            INSERT INTO public.quotation_items (
                salon_id, quotation_id, item_type, service_id, product_id,
                staff_id, staff_name, name, description, is_custom,
                quantity, unit_price, discount_amount, taxable_amount,
                tax_rate, tax_amount, total_price, sort_order
            ) VALUES (
                p_salon_id, v_new_quote_id,
                COALESCE(v_item.item_type, 'service'),
                v_item.service_id, v_item.product_id,
                v_item.staff_id, v_item.staff_name,
                COALESCE(v_item.name, 'Quotation Item'),
                v_item.description,
                COALESCE(v_item.is_custom, false),
                COALESCE(v_item.quantity, 1),
                COALESCE(v_item.unit_price, 0),
                COALESCE(v_item.discount_amount, 0),
                COALESCE(v_item.taxable_amount, (COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0)) - COALESCE(v_item.discount_amount, 0)),
                COALESCE(v_item.tax_rate, p_tax_rate),
                COALESCE(v_item.tax_amount, 0),
                COALESCE(v_item.total_price, 0),
                COALESCE(v_item.sort_order, 0)
            );
        END LOOP;
    END IF;

    -- Record Audit Log
    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, action, actor_id, actor_role, details
    ) VALUES (
        p_salon_id, v_new_quote_id, 'CREATED', v_caller_user_id, v_caller_role,
        jsonb_build_object(
            'quotation_number', v_quote_num,
            'client_name', v_client_name,
            'total_amount', round(p_total_amount, 2),
            'items_count', jsonb_array_length(p_line_items)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', v_new_quote_id,
        'id', v_new_quote_id,
        'quotation_number', v_quote_num,
        'salon_id', p_salon_id,
        'client_id', p_client_id,
        'client_name', v_client_name,
        'status', 'draft',
        'subtotal', round(p_subtotal, 2),
        'discount_amount', round(p_discount_amount, 2),
        'tax_amount', round(p_tax_amount, 2),
        'total_amount', round(p_total_amount, 2),
        'issue_date', p_issue_date,
        'valid_until', p_valid_until,
        'version', 1
    );
END;
$$;

-- 9.2 RPC: Update Quotation (Optimistic Concurrency Control)
CREATE OR REPLACE FUNCTION public.rpc_update_quotation(
    p_salon_id TEXT,
    p_quotation_id UUID,
    p_expected_version INTEGER,
    p_subtotal NUMERIC,
    p_discount_amount NUMERIC,
    p_discount_type TEXT,
    p_discount_value NUMERIC,
    p_discount_reason TEXT,
    p_tax_rate NUMERIC,
    p_tax_amount NUMERIC,
    p_cgst_amount NUMERIC,
    p_sgst_amount NUMERIC,
    p_total_amount NUMERIC,
    p_customer_notes TEXT,
    p_internal_notes TEXT,
    p_terms_and_conditions TEXT,
    p_valid_until DATE,
    p_line_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_user_id TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_quote RECORD;
    v_item RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, role INTO v_caller_user_id, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quotation_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation % does not exist in salon %', p_quotation_id, p_salon_id;
    END IF;

    -- Concurrency Check
    IF p_expected_version IS NOT NULL AND v_quote.version <> p_expected_version THEN
        RAISE EXCEPTION 'STALE_QUOTATION_CONFLICT: Expected version % but found version %', p_expected_version, v_quote.version;
    END IF;

    -- Immutability on converted or cancelled quotes
    IF v_quote.status IN ('converted', 'cancelled') THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot edit quotation in % status', v_quote.status;
    END IF;

    -- Update quotation header
    UPDATE public.quotations
    SET subtotal = round(p_subtotal, 2),
        discount_amount = round(p_discount_amount, 2),
        discount_type = p_discount_type,
        discount_value = round(COALESCE(p_discount_value, 0), 2),
        discount_reason = p_discount_reason,
        tax_rate = round(p_tax_rate, 4),
        tax_amount = round(p_tax_amount, 2),
        cgst_amount = round(p_cgst_amount, 2),
        sgst_amount = round(p_sgst_amount, 2),
        total_amount = round(p_total_amount, 2),
        customer_notes = p_customer_notes,
        internal_notes = p_internal_notes,
        terms_and_conditions = p_terms_and_conditions,
        valid_until = COALESCE(p_valid_until, valid_until),
        version = version + 1,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_quotation_id;

    -- Replace line items
    DELETE FROM public.quotation_items
    WHERE quotation_id = p_quotation_id AND salon_id = p_salon_id;

    IF jsonb_array_length(p_line_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_to_recordset(p_line_items) AS x(
            item_type text,
            service_id text,
            product_id text,
            staff_id text,
            staff_name text,
            name text,
            description text,
            is_custom boolean,
            quantity numeric,
            unit_price numeric,
            discount_amount numeric,
            taxable_amount numeric,
            tax_rate numeric,
            tax_amount numeric,
            total_price numeric,
            sort_order integer
        )
        LOOP
            INSERT INTO public.quotation_items (
                salon_id, quotation_id, item_type, service_id, product_id,
                staff_id, staff_name, name, description, is_custom,
                quantity, unit_price, discount_amount, taxable_amount,
                tax_rate, tax_amount, total_price, sort_order
            ) VALUES (
                p_salon_id, p_quotation_id,
                COALESCE(v_item.item_type, 'service'),
                v_item.service_id, v_item.product_id,
                v_item.staff_id, v_item.staff_name,
                COALESCE(v_item.name, 'Quotation Item'),
                v_item.description,
                COALESCE(v_item.is_custom, false),
                COALESCE(v_item.quantity, 1),
                COALESCE(v_item.unit_price, 0),
                COALESCE(v_item.discount_amount, 0),
                COALESCE(v_item.taxable_amount, (COALESCE(v_item.quantity, 1) * COALESCE(v_item.unit_price, 0)) - COALESCE(v_item.discount_amount, 0)),
                COALESCE(v_item.tax_rate, p_tax_rate),
                COALESCE(v_item.tax_amount, 0),
                COALESCE(v_item.total_price, 0),
                COALESCE(v_item.sort_order, 0)
            );
        END LOOP;
    END IF;

    -- Record Audit Log
    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, action, actor_id, actor_role, details
    ) VALUES (
        p_salon_id, p_quotation_id, 'UPDATED', v_caller_user_id, v_caller_role,
        jsonb_build_object('new_version', v_quote.version + 1, 'total_amount', round(p_total_amount, 2))
    );

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', p_quotation_id,
        'version', v_quote.version + 1,
        'total_amount', round(p_total_amount, 2)
    );
END;
$$;

-- 9.3 RPC: Create Quotation Share Link
CREATE OR REPLACE FUNCTION public.rpc_create_quotation_share_link(
    p_salon_id TEXT,
    p_quotation_id UUID,
    p_token_hash TEXT,
    p_expiry_days INTEGER DEFAULT 14
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
    v_quote RECORD;
    v_expires_at TIMESTAMPTZ;
    v_new_share_id UUID;
    v_days INTEGER;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can generate quotation share links';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot generate share link for another salon';
        END IF;
    END IF;

    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: A valid cryptographic token hash is required';
    END IF;

    SELECT id, salon_id, status, quotation_number INTO v_quote
    FROM public.quotations
    WHERE id = p_quotation_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation % does not exist in salon %', p_quotation_id, p_salon_id;
    END IF;

    v_days := GREATEST(1, LEAST(COALESCE(p_expiry_days, 14), 90));
    v_expires_at := timezone('utc'::text, now()) + (v_days || ' days')::INTERVAL;

    -- Revoke any existing active share link for this quotation
    UPDATE public.quotation_shares
    SET revoked_at = timezone('utc'::text, now()),
        revoked_by = v_caller_user_id
    WHERE quotation_id = p_quotation_id
      AND salon_id = p_salon_id
      AND revoked_at IS NULL;

    -- Insert new share record
    INSERT INTO public.quotation_shares (
        salon_id, quotation_id, token_hash, created_by, expires_at
    ) VALUES (
        p_salon_id, p_quotation_id, trim(p_token_hash), v_caller_user_id, v_expires_at
    ) RETURNING id INTO v_new_share_id;

    -- If currently in draft state, advance to 'sent'
    IF v_quote.status = 'draft' THEN
        UPDATE public.quotations
        SET status = 'sent',
            updated_at = timezone('utc'::text, now())
        WHERE id = p_quotation_id;
    END IF;

    -- Record Audit Log
    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, action, actor_id, actor_role, details
    ) VALUES (
        p_salon_id, p_quotation_id, 'SHARED', v_caller_user_id, v_caller_role,
        jsonb_build_object('share_id', v_new_share_id, 'expires_at', v_expires_at)
    );

    RETURN jsonb_build_object(
        'success', true,
        'share_id', v_new_share_id,
        'quotation_id', p_quotation_id,
        'quotation_number', v_quote.quotation_number,
        'expires_at', v_expires_at,
        'created_at', timezone('utc'::text, now())
    );
END;
$$;

-- 9.4 RPC: Revoke Quotation Share Link
CREATE OR REPLACE FUNCTION public.rpc_revoke_quotation_share_link(
    p_share_id UUID
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
    v_share RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can revoke quotation share links';
        END IF;
    END IF;

    SELECT id, salon_id, quotation_id, revoked_at INTO v_share
    FROM public.quotation_shares
    WHERE id = p_share_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation share record % does not exist', p_share_id;
    END IF;

    IF v_caller_salon IS NOT NULL AND v_caller_salon != v_share.salon_id THEN
        RAISE EXCEPTION 'TENANT_VIOLATION: Cannot revoke link from another salon';
    END IF;

    IF v_share.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'share_id', p_share_id,
            'message', 'Link was already revoked'
        );
    END IF;

    UPDATE public.quotation_shares
    SET revoked_at = timezone('utc'::text, now()),
        revoked_by = v_caller_user_id
    WHERE id = p_share_id;

    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, action, actor_id, actor_role, details
    ) VALUES (
        v_share.salon_id, v_share.quotation_id, 'LINK_REVOKED', v_caller_user_id, v_caller_role,
        jsonb_build_object('share_id', p_share_id)
    );

    RETURN jsonb_build_object(
        'success', true,
        'share_id', p_share_id,
        'revoked_at', timezone('utc'::text, now())
    );
END;
$$;

-- 9.5 RPC: Get Public Quotation (Customer-Facing Projection — Internal notes strictly stripped)
CREATE OR REPLACE FUNCTION public.rpc_get_public_quotation(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_share RECORD;
    v_quote RECORD;
    v_salon RECORD;
    v_line_items JSONB;
BEGIN
    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'INVALID_LINK: Invalid quotation access token';
    END IF;

    SELECT * INTO v_share
    FROM public.quotation_shares
    WHERE token_hash = trim(p_token_hash);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK: Quotation link not found or invalid';
    END IF;

    IF v_share.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'LINK_REVOKED: This quotation link has been revoked by the salon';
    END IF;

    IF v_share.expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'LINK_EXPIRED: This quotation link has expired';
    END IF;

    -- Lookup quotation
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = v_share.quotation_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation not found';
    END IF;

    -- Auto-check validity date
    IF v_quote.valid_until < CURRENT_DATE AND v_quote.status IN ('draft', 'sent', 'viewed') THEN
        UPDATE public.quotations
        SET status = 'expired',
            updated_at = timezone('utc'::text, now())
        WHERE id = v_quote.id;
        v_quote.status := 'expired';
    END IF;

    -- Update telemetry & advance 'sent' to 'viewed'
    UPDATE public.quotation_shares
    SET access_count = access_count + 1,
        last_accessed_at = timezone('utc'::text, now())
    WHERE id = v_share.id;

    IF v_quote.status = 'sent' THEN
        UPDATE public.quotations
        SET status = 'viewed',
            updated_at = timezone('utc'::text, now())
        WHERE id = v_quote.id;
        v_quote.status := 'viewed';

        INSERT INTO public.quotation_audit_logs (
            salon_id, quotation_id, action, actor_id, actor_role, details
        ) VALUES (
            v_quote.salon_id, v_quote.id, 'VIEWED', NULL, 'CUSTOMER',
            jsonb_build_object('share_id', v_share.id, 'access_count', v_share.access_count + 1)
        );
    END IF;

    -- Fetch salon information
    SELECT id, name, phone, email, owner_name INTO v_salon
    FROM public.salons
    WHERE id = v_quote.salon_id;

    -- Fetch line items (Itemized snapshot)
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', qi.id,
            'item_type', qi.item_type,
            'name', qi.name,
            'description', qi.description,
            'staff_name', qi.staff_name,
            'quantity', qi.quantity,
            'unit_price', qi.unit_price,
            'discount_amount', qi.discount_amount,
            'taxable_amount', qi.taxable_amount,
            'tax_rate', qi.tax_rate,
            'tax_amount', qi.tax_amount,
            'total_price', qi.total_price,
            'is_custom', qi.is_custom
        ) ORDER BY qi.sort_order ASC, qi.created_at ASC
    ) INTO v_line_items
    FROM public.quotation_items qi
    WHERE qi.quotation_id = v_quote.id;

    RETURN jsonb_build_object(
        'valid', true,
        'salon', jsonb_build_object(
            'name', COALESCE(v_salon.name, 'Luma Salon'),
            'phone', COALESCE(v_salon.phone, '+91 98765 43210'),
            'email', COALESCE(v_salon.email, 'contact@lumasalon.example.com'),
            'address', 'Level 2, Galleria Market, DLF Phase IV, Gurugram, Haryana 122009',
            'gstin', '06AAAAA0000A1Z5',
            'owner_name', v_salon.owner_name
        ),
        'quotation', jsonb_build_object(
            'id', v_quote.id,
            'quotation_number', v_quote.quotation_number,
            'client_name', v_quote.client_name,
            'client_phone', v_quote.client_phone,
            'client_email', v_quote.client_email,
            'issue_date', v_quote.issue_date,
            'valid_until', v_quote.valid_until,
            'status', v_quote.status,
            'subtotal', v_quote.subtotal,
            'discount_amount', v_quote.discount_amount,
            'discount_type', v_quote.discount_type,
            'tax_rate', v_quote.tax_rate,
            'tax_amount', v_quote.tax_amount,
            'cgst_amount', v_quote.cgst_amount,
            'sgst_amount', v_quote.sgst_amount,
            'total_amount', v_quote.total_amount,
            'customer_notes', v_quote.customer_notes,
            'terms_and_conditions', v_quote.terms_and_conditions,
            'advance_required', v_quote.advance_required,
            'estimated_duration_minutes', v_quote.estimated_duration_minutes,
            'accepted_at', v_quote.accepted_at,
            'rejected_at', v_quote.rejected_at
        ),
        'line_items', COALESCE(v_line_items, '[]'::jsonb),
        'share_metadata', jsonb_build_object(
            'expires_at', v_share.expires_at,
            'access_count', v_share.access_count + 1
        )
    );
END;
$$;

-- 9.6 RPC: Customer Respond to Quotation (Server-Side Atomic Approval / Rejection)
CREATE OR REPLACE FUNCTION public.rpc_respond_to_quotation(
    p_token_hash TEXT,
    p_action TEXT, -- 'accept' or 'reject'
    p_customer_comment TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_share RECORD;
    v_quote RECORD;
    v_new_status TEXT;
BEGIN
    IF p_action NOT IN ('accept', 'reject') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Action must be accept or reject';
    END IF;

    SELECT * INTO v_share
    FROM public.quotation_shares
    WHERE token_hash = trim(p_token_hash);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK: Quotation share token not found';
    END IF;

    IF v_share.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'LINK_REVOKED: This quotation link has been revoked';
    END IF;

    IF v_share.expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'LINK_EXPIRED: This quotation link has expired';
    END IF;

    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = v_share.quotation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation not found';
    END IF;

    -- Validity Date Check
    IF v_quote.valid_until < CURRENT_DATE THEN
        UPDATE public.quotations
        SET status = 'expired',
            updated_at = timezone('utc'::text, now())
        WHERE id = v_quote.id;
        RAISE EXCEPTION 'EXPIRED_QUOTATION: This quotation expired on % and can no longer be accepted', v_quote.valid_until;
    END IF;

    -- Actionable State Check
    IF v_quote.status NOT IN ('draft', 'sent', 'viewed') THEN
        RAISE EXCEPTION 'INVALID_STATE: Quotation is in % status and cannot be modified', v_quote.status;
    END IF;

    IF p_action = 'accept' THEN
        v_new_status := 'accepted';
        UPDATE public.quotations
        SET status = 'accepted',
            accepted_at = timezone('utc'::text, now()),
            customer_response_comment = p_customer_comment,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_quote.id;

        INSERT INTO public.quotation_audit_logs (
            salon_id, quotation_id, action, actor_id, actor_role, details
        ) VALUES (
            v_quote.salon_id, v_quote.id, 'ACCEPTED', NULL, 'CUSTOMER',
            jsonb_build_object('comment', p_customer_comment, 'accepted_at', timezone('utc'::text, now()))
        );
    ELSE
        v_new_status := 'rejected';
        UPDATE public.quotations
        SET status = 'rejected',
            rejected_at = timezone('utc'::text, now()),
            customer_response_comment = p_customer_comment,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_quote.id;

        INSERT INTO public.quotation_audit_logs (
            salon_id, quotation_id, action, actor_id, actor_role, details
        ) VALUES (
            v_quote.salon_id, v_quote.id, 'REJECTED', NULL, 'CUSTOMER',
            jsonb_build_object('comment', p_customer_comment, 'rejected_at', timezone('utc'::text, now()))
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', v_quote.id,
        'status', v_new_status,
        'action', p_action,
        'customer_comment', p_customer_comment,
        'responded_at', timezone('utc'::text, now())
    );
END;
$$;

-- 9.7 RPC: Convert Accepted Quotation to Official POS Invoice (Atomic & Idempotent)
CREATE OR REPLACE FUNCTION public.rpc_convert_quotation_to_invoice(
    p_salon_id TEXT,
    p_quotation_id UUID
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
    v_quote RECORD;
    v_inv_id TEXT;
    v_inv_num TEXT;
    v_year TEXT;
    v_seq BIGINT;
    v_item RECORD;
    v_staff_id TEXT := NULL;
    v_staff_name TEXT := NULL;
BEGIN
    -- Resolve caller identity
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can convert quotations to invoices';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot convert quotation for another salon';
        END IF;
    END IF;

    -- Lock quotation row FOR UPDATE to prevent race conditions & duplicate conversion
    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quotation_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation % not found in salon %', p_quotation_id, p_salon_id;
    END IF;

    -- Strict duplicate conversion check
    IF v_quote.converted_invoice_id IS NOT NULL OR v_quote.status = 'converted' THEN
        RAISE EXCEPTION 'ALREADY_CONVERTED: Quotation % was already converted into invoice %', v_quote.quotation_number, v_quote.converted_invoice_id;
    END IF;

    -- Status must be 'accepted'
    IF v_quote.status <> 'accepted' THEN
        RAISE EXCEPTION 'INVALID_STATE: Only accepted quotations can be converted to an invoice (current status: %)', v_quote.status;
    END IF;

    -- Generate official sequential invoice number: INV-YYYY-XXXX
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq := nextval('public.invoice_number_seq');
    v_inv_num := 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');
    v_inv_id := 'inv-' || gen_random_uuid();

    -- Pick primary staff attribution from items if available
    SELECT staff_id, staff_name INTO v_staff_id, v_staff_name
    FROM public.quotation_items
    WHERE quotation_id = v_quote.id AND staff_id IS NOT NULL
    LIMIT 1;

    -- Fallback staff to salon default or first active staff member
    IF v_staff_id IS NULL THEN
        SELECT id, name INTO v_staff_id, v_staff_name
        FROM public.staff
        WHERE salon_id = p_salon_id AND active = true
        LIMIT 1;
    END IF;

    -- Insert into public.invoices (Unpaid state; zero fake payments; zero advance deduction)
    INSERT INTO public.invoices (
        id, salon_id, invoice_number, client_id, client_name, client_phone, client_email,
        staff_id, staff_name, date, subtotal, discount_amount, discount_type, discount_reason,
        tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount, balance_due,
        payment_status, primary_payment_method, is_gst_invoice, tax_treatment, is_draft,
        walk_in_guest, notes, authorized_by
    ) VALUES (
        v_inv_id, p_salon_id, v_inv_num, v_quote.client_id, v_quote.client_name,
        v_quote.client_phone, v_quote.client_email,
        v_staff_id, COALESCE(v_staff_name, 'Luma Staff'), CURRENT_DATE,
        v_quote.subtotal, v_quote.discount_amount, v_quote.discount_type, v_quote.discount_reason,
        v_quote.tax_rate, v_quote.tax_amount, v_quote.cgst_amount, v_quote.sgst_amount,
        v_quote.total_amount, 0.00, v_quote.total_amount, 'unpaid', 'cash',
        (v_quote.tax_treatment != 'non_gst'), v_quote.tax_treatment, false,
        v_quote.is_walk_in, v_quote.customer_notes, v_quote.authorized_by
    );

    -- Copy Line Items from quotation_items to invoice_line_items
    FOR v_item IN
        SELECT * FROM public.quotation_items
        WHERE quotation_id = v_quote.id
        ORDER BY sort_order ASC, created_at ASC
    LOOP
        INSERT INTO public.invoice_line_items (
            salon_id, invoice_id, description, quantity, unit_price, total_price,
            item_type, product_id, service_id, staff_id, discount_amount,
            tax_rate, tax_amount
        ) VALUES (
            p_salon_id, v_inv_id,
            COALESCE(v_item.description, v_item.name),
            v_item.quantity, v_item.unit_price, v_item.total_price,
            CASE WHEN v_item.item_type = 'product' THEN 'product' ELSE 'service' END,
            v_item.product_id, v_item.service_id,
            COALESCE(v_item.staff_id, v_staff_id),
            v_item.discount_amount, v_item.tax_rate, v_item.tax_amount
        );
    END LOOP;

    -- Update Quotation status to 'converted'
    UPDATE public.quotations
    SET status = 'converted',
        converted_invoice_id = v_inv_id,
        converted_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = v_quote.id;

    -- Record Audit Log
    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, action, actor_id, actor_role, details
    ) VALUES (
        p_salon_id, v_quote.id, 'CONVERTED', v_caller_user_id, v_caller_role,
        jsonb_build_object(
            'invoice_id', v_inv_id,
            'invoice_number', v_inv_num,
            'converted_at', timezone('utc'::text, now()),
            'total_amount', v_quote.total_amount
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'quotation_id', v_quote.id,
        'invoice_id', v_inv_id,
        'invoice_number', v_inv_num,
        'total_amount', v_quote.total_amount,
        'status', 'converted',
        'converted_at', timezone('utc'::text, now())
    );
END;
$$;

-- 9.8 RPC: Create Proforma Invoice from Quotation
CREATE OR REPLACE FUNCTION public.rpc_create_proforma_invoice(
    p_salon_id TEXT,
    p_quotation_id UUID
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
    v_quote RECORD;
    v_proforma_id UUID;
    v_proforma_num TEXT;
    v_year TEXT;
    v_seq BIGINT;
    v_item RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can generate proforma invoices';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot create proforma invoice for another salon';
        END IF;
    END IF;

    SELECT * INTO v_quote
    FROM public.quotations
    WHERE id = p_quotation_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Quotation % not found in salon %', p_quotation_id, p_salon_id;
    END IF;

    -- Generate sequential Proforma Number: PI-YYYY-XXXX
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq := nextval('public.proforma_number_seq');
    v_proforma_num := 'PI-' || v_year || '-' || lpad(v_seq::text, 4, '0');

    -- Insert into public.proforma_invoices
    INSERT INTO public.proforma_invoices (
        salon_id, proforma_number, quotation_id, client_id, client_name, client_phone, client_email,
        issue_date, valid_until, subtotal, discount_amount, tax_amount, cgst_amount, sgst_amount,
        total_amount, status, notes, terms_and_conditions, created_by
    ) VALUES (
        p_salon_id, v_proforma_num, v_quote.id, v_quote.client_id, v_quote.client_name,
        v_quote.client_phone, v_quote.client_email, CURRENT_DATE, v_quote.valid_until,
        v_quote.subtotal, v_quote.discount_amount, v_quote.tax_amount, v_quote.cgst_amount,
        v_quote.sgst_amount, v_quote.total_amount, 'issued', v_quote.customer_notes,
        v_quote.terms_and_conditions, v_caller_user_id
    ) RETURNING id INTO v_proforma_id;

    -- Copy items snapshot
    FOR v_item IN
        SELECT * FROM public.quotation_items
        WHERE quotation_id = v_quote.id
        ORDER BY sort_order ASC, created_at ASC
    LOOP
        INSERT INTO public.proforma_invoice_items (
            salon_id, proforma_id, name, description, item_type, staff_name,
            quantity, unit_price, discount_amount, tax_rate, tax_amount,
            total_price, sort_order
        ) VALUES (
            p_salon_id, v_proforma_id, v_item.name, v_item.description,
            v_item.item_type, v_item.staff_name, v_item.quantity, v_item.unit_price,
            v_item.discount_amount, v_item.tax_rate, v_item.tax_amount,
            v_item.total_price, v_item.sort_order
        );
    END LOOP;

    -- Record Audit Log
    INSERT INTO public.quotation_audit_logs (
        salon_id, quotation_id, proforma_id, action, actor_id, actor_role, details
    ) VALUES (
        p_salon_id, v_quote.id, v_proforma_id, 'PROFORMA_GENERATED', v_caller_user_id, v_caller_role,
        jsonb_build_object('proforma_number', v_proforma_num, 'total_amount', v_quote.total_amount)
    );

    RETURN jsonb_build_object(
        'success', true,
        'proforma_id', v_proforma_id,
        'proforma_number', v_proforma_num,
        'quotation_id', v_quote.id,
        'total_amount', v_quote.total_amount,
        'issue_date', CURRENT_DATE,
        'valid_until', v_quote.valid_until
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.rpc_create_quotation TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_update_quotation TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_create_quotation_share_link TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_quotation_share_link TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_get_public_quotation TO anon, authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_respond_to_quotation TO anon, authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_convert_quotation_to_invoice TO authenticated, postgres;
GRANT EXECUTE ON FUNCTION public.rpc_create_proforma_invoice TO authenticated, postgres;
