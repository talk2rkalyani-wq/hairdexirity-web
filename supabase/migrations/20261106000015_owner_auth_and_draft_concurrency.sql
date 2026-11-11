-- ==============================================================================
-- LUMA SALON BUSINESS SUITE — PHASE 2.2
-- MIGRATION: 20261106000015_owner_auth_and_draft_concurrency.sql
-- SECURE OWNER DISCOUNT AUTHORIZATION & DRAFT OPTIMISTIC CONCURRENCY CONTROL
-- ==============================================================================

-- 1. PREREQUISITE: Ensure pgcrypto extension for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. SERVER-SIDE USER CREDENTIALS TABLE (Never exposed to client)
CREATE TABLE IF NOT EXISTS public.user_credentials (
    user_id text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    password_hash text NOT NULL,
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

-- Enable RLS and revoke direct client queries
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_credentials FROM PUBLIC, anon, authenticated;

-- Seed server-side credentials with bcrypt for existing salon owners & users (default: 'Luma@2026!')
INSERT INTO public.user_credentials (user_id, password_hash)
SELECT id, crypt('Luma@2026!', gen_salt('bf'))
FROM public.users
ON CONFLICT (user_id) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    updated_at = timezone('utc', now());

-- 3. ONE-TIME OWNER DISCOUNT AUTHORIZATIONS TABLE
CREATE TABLE IF NOT EXISTS public.discount_authorizations (
    id text PRIMARY KEY DEFAULT ('auth-' || gen_random_uuid()),
    salon_id text NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    invoice_id text NOT NULL,
    receptionist_id text NOT NULL,
    owner_id text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    discount_percent numeric(5,2) NOT NULL,
    discount_amount numeric(12,2) NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    expires_at timestamp with time zone NOT NULL DEFAULT (timezone('utc', now()) + interval '10 minutes'),
    used_at timestamp with time zone,
    consumed_in_invoice_id text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'consumed', 'expired', 'revoked')),
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT chk_auth_subtotal_pos CHECK (subtotal >= 0),
    CONSTRAINT chk_auth_discount_amt_pos CHECK (discount_amount >= 0),
    CONSTRAINT chk_auth_discount_pct_pos CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_discount_auth_lookup ON public.discount_authorizations (salon_id, invoice_id, status);
CREATE INDEX IF NOT EXISTS idx_discount_auth_owner ON public.discount_authorizations (owner_id);

ALTER TABLE public.discount_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.discount_authorizations FROM PUBLIC, anon;

-- Read policy: salon staff can read authorizations for their salon
DROP POLICY IF EXISTS "Discount authorizations viewable by salon staff" ON public.discount_authorizations;
CREATE POLICY "Discount authorizations viewable by salon staff"
    ON public.discount_authorizations FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR public.current_user_salon_id() IS NULL
    );

-- 4. ADD DRAFT VERSION COLUMN TO INVOICES FOR OPTIMISTIC CONCURRENCY CONTROL
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS draft_version INTEGER NOT NULL DEFAULT 1;

-- 5. RPC: REQUEST OWNER DISCOUNT APPROVAL GRANT
-- Authenticates owner credentials server-side and issues a short-lived single-use grant
CREATE OR REPLACE FUNCTION public.rpc_request_owner_discount_approval(
    p_salon_id text,
    p_invoice_id text,
    p_owner_email text,
    p_owner_password text,
    p_subtotal numeric,
    p_discount_amount numeric,
    p_discount_percent numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth uuid;
    v_caller_salon text;
    v_caller_user_id text := NULL;
    v_caller_user_role text := NULL;
    v_owner record;
    v_calculated_pct numeric;
    v_grant_id text;
    v_expires_at timestamptz;
BEGIN
    v_caller_auth := auth.uid();
    v_caller_salon := public.current_user_salon_id();

    -- Tenant isolation check
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller salon % does not match target salon %', v_caller_salon, p_salon_id;
    END IF;

    -- Financial parameter sanity
    IF p_subtotal <= 0 THEN
        RAISE EXCEPTION 'Subtotal must be greater than zero to authorize a discount';
    END IF;
    IF p_discount_amount <= 0 THEN
        RAISE EXCEPTION 'Discount amount must be greater than zero';
    END IF;

    v_calculated_pct := (p_discount_amount / p_subtotal) * 100.0;
    IF abs(v_calculated_pct - p_discount_percent) > 0.05 THEN
        RAISE EXCEPTION 'Discount calculation mismatch: calculated % vs provided %', v_calculated_pct, p_discount_percent;
    END IF;

    -- Identify caller if authenticated
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, role INTO v_caller_user_id, v_caller_user_role
        FROM public.users
        WHERE auth_user_id = v_caller_auth AND salon_id = p_salon_id;
    END IF;

    -- Lookup authorizing owner strictly within the same salon
    SELECT u.id, u.name, u.email, u.role, u.salon_id, u.active, c.password_hash
    INTO v_owner
    FROM public.users u
    JOIN public.user_credentials c ON c.user_id = u.id
    WHERE lower(trim(u.email)) = lower(trim(p_owner_email))
      AND u.salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invalid owner credentials or owner does not belong to this salon';
    END IF;

    -- Role and active checks
    IF v_owner.role <> 'OWNER' THEN
        RAISE EXCEPTION 'Authorizing user (%) is not a salon owner', v_owner.email;
    END IF;

    IF v_owner.active IS NOT TRUE THEN
        RAISE EXCEPTION 'Authorizing owner account (%) is disabled', v_owner.email;
    END IF;

    -- Cross-salon check
    IF v_owner.salon_id <> p_salon_id THEN
        RAISE EXCEPTION 'Cross-salon owner authorization is strictly prohibited';
    END IF;

    -- Prevent receptionist from self-authorizing if caller is receptionist
    IF v_caller_user_id IS NOT NULL AND v_caller_user_role = 'RECEPTIONIST' AND v_caller_user_id = v_owner.id THEN
        RAISE EXCEPTION 'Receptionists cannot self-authorize discounts';
    END IF;

    -- Verify owner password using bcrypt
    IF v_owner.password_hash <> crypt(p_owner_password, v_owner.password_hash) THEN
        RAISE EXCEPTION 'Invalid owner password. Authorization rejected.';
    END IF;

    -- Invalidate previous unused active grants for this invoice & salon
    UPDATE public.discount_authorizations
    SET status = 'revoked'
    WHERE salon_id = p_salon_id
      AND invoice_id = p_invoice_id
      AND status = 'active';

    -- Issue short-lived, single-use grant (valid for 10 minutes)
    v_grant_id := 'auth-' || gen_random_uuid();
    v_expires_at := timezone('utc', now()) + interval '10 minutes';

    INSERT INTO public.discount_authorizations (
        id,
        salon_id,
        invoice_id,
        receptionist_id,
        owner_id,
        discount_percent,
        discount_amount,
        subtotal,
        expires_at,
        status,
        created_at
    ) VALUES (
        v_grant_id,
        p_salon_id,
        p_invoice_id,
        COALESCE(v_caller_user_id, 'receptionist'),
        v_owner.id,
        p_discount_percent,
        p_discount_amount,
        p_subtotal,
        v_expires_at,
        'active',
        timezone('utc', now())
    );

    RETURN jsonb_build_object(
        'success', true,
        'grant_id', v_grant_id,
        'owner_id', v_owner.id,
        'owner_name', v_owner.name,
        'discount_percent', p_discount_percent,
        'discount_amount', p_discount_amount,
        'subtotal', p_subtotal,
        'expires_at', v_expires_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_owner_discount_approval(text, text, text, text, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_request_owner_discount_approval(text, text, text, text, numeric, numeric, numeric) TO authenticated, anon;

-- 6. RPC: SAVE POS DRAFT WITH OPTIMISTIC CONCURRENCY CONTROL (OCC)
-- Preserves exact parameter order from migration 14 with p_expected_version appended at the end
DROP FUNCTION IF EXISTS public.rpc_save_pos_draft(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.rpc_save_pos_draft(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, integer);
DROP FUNCTION IF EXISTS public.rpc_save_pos_draft(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, jsonb, integer);

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
    v_caller_salon text;
    v_draft_id text;
    v_existing_inv record;
    v_draft_number text;
    v_year text;
    v_seq bigint;
    v_item jsonb;
    v_current_version integer;
    v_next_version integer;
BEGIN
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller salon % does not match target salon %', v_caller_salon, p_salon_id;
    END IF;

    v_draft_id := COALESCE(p_draft_id, 'draft-' || gen_random_uuid());

    -- Check if draft exists
    SELECT id, is_draft, draft_version, invoice_number INTO v_existing_inv
    FROM public.invoices
    WHERE id = v_draft_id AND salon_id = p_salon_id;

    IF FOUND THEN
        -- Protect against modifying finalized invoices
        IF v_existing_inv.is_draft = false THEN
            RAISE EXCEPTION 'Invoice % has already been finalized and cannot be overwritten', v_draft_id;
        END IF;

        -- Lock row FOR UPDATE to guarantee serialized OCC
        SELECT draft_version INTO v_current_version
        FROM public.invoices
        WHERE id = v_draft_id AND salon_id = p_salon_id
        FOR UPDATE;

        -- OCC Check: Reject stale updates
        IF p_expected_version IS NULL THEN
            RAISE EXCEPTION 'Missing expected draft version for existing draft %', v_draft_id;
        END IF;

        IF p_expected_version <> v_current_version THEN
            RAISE EXCEPTION 'CONCURRENCY_CONFLICT: Draft % was modified by another session (expected version %, current version %)',
                v_draft_id, p_expected_version, v_current_version;
        END IF;

        v_next_version := v_current_version + 1;
        v_draft_number := v_existing_inv.invoice_number;

        -- Update draft header with incremented version
        UPDATE public.invoices
        SET client_id = p_client_id,
            client_name = p_client_name,
            client_phone = p_client_phone,
            client_email = p_client_email,
            staff_id = p_staff_id,
            staff_name = p_staff_name,
            service_id = p_service_id,
            service_name = p_service_name,
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
            balance_due = p_total_amount,
            primary_payment_method = p_primary_payment_method,
            is_gst_invoice = p_is_gst_invoice,
            tax_treatment = p_tax_treatment,
            walk_in_guest = p_walk_in_guest,
            authorized_by = p_authorized_by,
            notes = p_notes,
            idempotency_key = p_idempotency_key,
            draft_version = v_next_version,
            updated_at = timezone('utc', now())
        WHERE id = v_draft_id AND salon_id = p_salon_id;

        -- Delete old draft line items
        DELETE FROM public.invoice_line_items
        WHERE invoice_id = v_draft_id AND salon_id = p_salon_id;
    ELSE
        -- Fresh draft: generate draft sequence number starting with DFT-
        v_year := to_char(CURRENT_DATE, 'YYYY');
        v_seq := nextval('public.invoice_number_seq');
        v_draft_number := 'DFT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
        v_next_version := 1;

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
            draft_version,
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
            1,
            timezone('utc', now()),
            timezone('utc', now())
        );
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

    RETURN jsonb_build_object(
        'id', v_draft_id,
        'salon_id', p_salon_id,
        'invoice_number', v_draft_number,
        'is_draft', true,
        'draft_version', v_next_version,
        'payment_status', 'draft',
        'subtotal', p_subtotal,
        'total_amount', p_total_amount,
        'paid_amount', 0,
        'balance_due', p_total_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_pos_draft(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_pos_draft(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, integer) TO authenticated, anon;

-- 7. RPC: FINALIZE POS INVOICE WITH GRANT VERIFICATION & OCC CHECK
DROP FUNCTION IF EXISTS public.rpc_finalize_pos_invoice(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, jsonb);
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
BEGIN
    -- 1. Tenant Isolation: Ensure caller belongs to target salon if session exists
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller salon % does not match invoice salon %', v_caller_salon, p_salon_id;
    END IF;

    -- Idempotency check: If key provided and already completed, return existing
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id, invoice_number, is_draft, total_amount, paid_amount, payment_status
        INTO v_existing_by_idempotency
        FROM public.invoices
        WHERE salon_id = p_salon_id AND idempotency_key = p_idempotency_key;

        IF FOUND AND v_existing_by_idempotency.is_draft = false THEN
            SELECT row_to_json(i)::jsonb INTO v_res FROM public.invoices i WHERE id = v_existing_by_idempotency.id;
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
            v_actual_authorized_by,
            p_notes,
            p_idempotency_key,
            timezone('utc', now()),
            timezone('utc', now())
        );
    END IF;

    -- 4. Insert Line Items
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

    -- 5. Insert Payments (Automatically reconciles paid_amount, balance_due, and payment_status via trigger)
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

REVOKE ALL ON FUNCTION public.rpc_finalize_pos_invoice(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_finalize_pos_invoice(text, text, text, text, text, text, text, text, text, text, text, date, numeric, numeric, text, text, numeric, numeric, numeric, numeric, numeric, text, boolean, text, boolean, text, text, text, jsonb, jsonb, text, integer) TO authenticated, anon;
