-- ==============================================================================
-- LUMA SALON BUSINESS SUITE — PHASE 3 MIGRATION
-- Migration 16: Professional Invoice PDF, Download & Secure Link Sharing System
-- Cryptographic Token Hashes, Ephemeral Sharing Links & Public Sanitized Projection
-- ==============================================================================

-- 1. Create invoice_shares table
CREATE TABLE IF NOT EXISTS public.invoice_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT fk_invoice_shares_invoice FOREIGN KEY (salon_id, invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoice_shares_token_hash ON public.invoice_shares(token_hash);
CREATE INDEX IF NOT EXISTS idx_invoice_shares_invoice ON public.invoice_shares(salon_id, invoice_id);

-- Enable RLS
ALTER TABLE public.invoice_shares ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any exist
DROP POLICY IF EXISTS "Invoice shares readable by salon staff" ON public.invoice_shares;
DROP POLICY IF EXISTS "Invoice shares insertable by salon staff" ON public.invoice_shares;
DROP POLICY IF EXISTS "Invoice shares updatable by salon staff" ON public.invoice_shares;

-- RLS Policies
CREATE POLICY "Invoice shares readable by salon staff" ON public.invoice_shares
    FOR SELECT TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Invoice shares insertable by salon staff" ON public.invoice_shares
    FOR INSERT TO authenticated
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

CREATE POLICY "Invoice shares updatable by salon staff" ON public.invoice_shares
    FOR UPDATE TO authenticated
    USING (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    )
    WITH CHECK (
        (salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL)
        AND is_owner_or_receptionist()
    );

-- 2. RPC to create a new secure invoice share link
CREATE OR REPLACE FUNCTION public.rpc_create_invoice_share_link(
    p_salon_id TEXT,
    p_invoice_id TEXT,
    p_token_hash TEXT,
    p_expiry_days INTEGER DEFAULT 7
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
    v_invoice RECORD;
    v_expires_at TIMESTAMPTZ;
    v_new_share_id UUID;
    v_days INTEGER;
BEGIN
    -- Resolve caller identity if JWT claims exist
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') AND current_user != 'postgres' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can generate invoice share links';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id AND current_user != 'postgres' THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot generate share link for another salon';
        END IF;
    END IF;

    -- Validate input parameters
    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: A valid cryptographic token hash is required';
    END IF;

    -- Validate target invoice
    SELECT id, salon_id, is_draft, invoice_number INTO v_invoice
    FROM public.invoices
    WHERE id = p_invoice_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice % does not exist in salon %', p_invoice_id, p_salon_id;
    END IF;

    IF v_invoice.is_draft = TRUE THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot create public sharing link for an unfinalized draft bill';
    END IF;

    -- Compute expiration
    v_days := GREATEST(1, LEAST(COALESCE(p_expiry_days, 7), 90));
    v_expires_at := timezone('utc'::text, now()) + (v_days || ' days')::INTERVAL;

    -- Revoke existing active links for this invoice so only one active link exists per replacement policy
    UPDATE public.invoice_shares
    SET revoked_at = timezone('utc'::text, now()),
        revoked_by = v_caller_user_id
    WHERE salon_id = p_salon_id
      AND invoice_id = p_invoice_id
      AND revoked_at IS NULL
      AND expires_at > timezone('utc'::text, now());

    -- Insert new share record
    INSERT INTO public.invoice_shares (
        salon_id,
        invoice_id,
        token_hash,
        created_by,
        expires_at
    ) VALUES (
        p_salon_id,
        p_invoice_id,
        trim(p_token_hash),
        v_caller_user_id,
        v_expires_at
    )
    RETURNING id INTO v_new_share_id;

    RETURN jsonb_build_object(
        'success', true,
        'share_id', v_new_share_id,
        'salon_id', p_salon_id,
        'invoice_id', p_invoice_id,
        'invoice_number', v_invoice.invoice_number,
        'expires_at', v_expires_at,
        'created_at', timezone('utc'::text, now())
    );
END;
$$;

-- 3. RPC to revoke an active invoice share link
CREATE OR REPLACE FUNCTION public.rpc_revoke_invoice_share_link(
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

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') AND current_user != 'postgres' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can revoke invoice share links';
        END IF;
    END IF;

    SELECT id, salon_id, invoice_id, revoked_at INTO v_share
    FROM public.invoice_shares
    WHERE id = p_share_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice share record % does not exist', p_share_id;
    END IF;

    IF v_caller_salon IS NOT NULL AND v_caller_salon != v_share.salon_id AND current_user != 'postgres' THEN
        RAISE EXCEPTION 'TENANT_VIOLATION: Cannot revoke link from another salon';
    END IF;

    IF v_share.revoked_at IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'share_id', p_share_id,
            'message', 'Link was already revoked'
        );
    END IF;

    UPDATE public.invoice_shares
    SET revoked_at = timezone('utc'::text, now()),
        revoked_by = v_caller_user_id
    WHERE id = p_share_id;

    RETURN jsonb_build_object(
        'success', true,
        'share_id', p_share_id,
        'revoked_at', timezone('utc'::text, now())
    );
END;
$$;

-- 4. RPC to get public invoice by token hash (PUBLIC projection)
CREATE OR REPLACE FUNCTION public.rpc_get_public_invoice(
    p_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_share RECORD;
    v_invoice RECORD;
    v_salon RECORD;
    v_line_items JSONB;
    v_payments JSONB;
BEGIN
    IF p_token_hash IS NULL OR length(trim(p_token_hash)) < 32 THEN
        RAISE EXCEPTION 'INVALID_LINK: Invalid invoice access token';
    END IF;

    -- Lookup share record
    SELECT * INTO v_share
    FROM public.invoice_shares
    WHERE token_hash = trim(p_token_hash);

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK: Invoice link not found or invalid';
    END IF;

    IF v_share.revoked_at IS NOT NULL THEN
        RAISE EXCEPTION 'LINK_REVOKED: This invoice link has been revoked by the salon';
    END IF;

    IF v_share.expires_at < timezone('utc'::text, now()) THEN
        RAISE EXCEPTION 'LINK_EXPIRED: This invoice link has expired';
    END IF;

    -- Record access telemetry safely
    UPDATE public.invoice_shares
    SET access_count = access_count + 1,
        last_accessed_at = timezone('utc'::text, now())
    WHERE id = v_share.id;

    -- Retrieve invoice
    SELECT
        id,
        invoice_number,
        date,
        created_at,
        is_gst_invoice,
        tax_treatment,
        tax_rate,
        subtotal,
        discount_amount,
        discount_type,
        cgst_amount,
        sgst_amount,
        tax_amount,
        total_amount,
        paid_amount,
        balance_due,
        payment_status,
        primary_payment_method,
        client_name,
        notes
    INTO v_invoice
    FROM public.invoices
    WHERE id = v_share.invoice_id AND salon_id = v_share.salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'INVALID_LINK: Associated invoice no longer available';
    END IF;

    -- Retrieve salon public details
    SELECT
        id,
        name,
        phone,
        email,
        owner_name
    INTO v_salon
    FROM public.salons
    WHERE id = v_share.salon_id;

    -- Retrieve line items (project only public presentation data, exclude internal staff IDs)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'description', li.description,
                'quantity', li.quantity,
                'unit_price', li.unit_price,
                'total_price', li.total_price,
                'item_type', li.item_type,
                'staff_name', COALESCE(s.name, li.staff_id, 'Stylist'),
                'tax_rate', li.tax_rate,
                'tax_amount', li.tax_amount,
                'discount_amount', li.discount_amount
            )
            ORDER BY li.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_line_items
    FROM public.invoice_line_items li
    LEFT JOIN public.staff s ON s.id = li.staff_id
    WHERE li.invoice_id = v_share.invoice_id AND li.salon_id = v_share.salon_id;

    -- Retrieve payments (project only public transaction summary, no auth/admin notes)
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'payment_method', p.payment_method,
                'amount', p.amount,
                'created_at', p.created_at
            )
            ORDER BY p.created_at ASC
        ),
        '[]'::jsonb
    ) INTO v_payments
    FROM public.payments p
    WHERE p.invoice_id = v_share.invoice_id AND p.salon_id = v_share.salon_id;

    -- Return strictly sanitized public projection
    RETURN jsonb_build_object(
        'valid', true,
        'salon', jsonb_build_object(
            'name', COALESCE(v_salon.name, 'Luma Salon'),
            'phone', COALESCE(v_salon.phone, '+91 98765 43210'),
            'email', COALESCE(v_salon.email, 'contact@lumasalon.example.com'),
            'address', 'Level 2, Galleria Market, DLF Phase IV, Gurugram, Haryana 122009'
        ),
        'invoice', jsonb_build_object(
            'invoice_number', v_invoice.invoice_number,
            'date', v_invoice.date,
            'created_at', v_invoice.created_at,
            'client_name', v_invoice.client_name,
            'subtotal', v_invoice.subtotal,
            'discount_amount', v_invoice.discount_amount,
            'discount_type', v_invoice.discount_type,
            'is_gst_invoice', v_invoice.is_gst_invoice,
            'tax_treatment', v_invoice.tax_treatment,
            'tax_rate', v_invoice.tax_rate,
            'cgst_amount', v_invoice.cgst_amount,
            'sgst_amount', v_invoice.sgst_amount,
            'tax_amount', v_invoice.tax_amount,
            'total_amount', v_invoice.total_amount,
            'paid_amount', v_invoice.paid_amount,
            'balance_due', v_invoice.balance_due,
            'payment_status', v_invoice.payment_status,
            'primary_payment_method', v_invoice.primary_payment_method,
            'notes', v_invoice.notes
        ),
        'line_items', v_line_items,
        'payments', v_payments,
        'share_metadata', jsonb_build_object(
            'expires_at', v_share.expires_at,
            'access_count', v_share.access_count + 1
        )
    );
END;
$$;

-- 5. RPC to list share links for an invoice (Billing Staff Management)
CREATE OR REPLACE FUNCTION public.rpc_list_invoice_shares(
    p_invoice_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_salon TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_shares JSONB;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT salon_id, role INTO v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') AND current_user != 'postgres' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can list share links';
        END IF;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'invoice_id', s.invoice_id,
                'created_at', s.created_at,
                'expires_at', s.expires_at,
                'revoked_at', s.revoked_at,
                'is_active', (s.revoked_at IS NULL AND s.expires_at > timezone('utc'::text, now())),
                'access_count', s.access_count,
                'last_accessed_at', s.last_accessed_at
            )
            ORDER BY s.created_at DESC
        ),
        '[]'::jsonb
    ) INTO v_shares
    FROM public.invoice_shares s
    WHERE s.invoice_id = p_invoice_id
      AND (v_caller_salon IS NULL OR s.salon_id = v_caller_salon OR current_user = 'postgres');

    RETURN v_shares;
END;
$$;

-- 6. Grants & Permissions
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoice_shares TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_invoice_share_link(TEXT, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_invoice_share_link(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_list_invoice_shares(TEXT) TO authenticated;
-- Public projection executable by anon as well as authenticated
GRANT EXECUTE ON FUNCTION public.rpc_get_public_invoice(TEXT) TO anon, authenticated;
