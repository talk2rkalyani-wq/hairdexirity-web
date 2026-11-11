-- ==============================================================================
-- LUMA SALON BUSINESS SUITE — PHASE 4 MIGRATION
-- Migration 17: Payments & Customer Ledger Management
-- Advances, Allocations, Refunds, Credit Notes, Statements & Daily Reconciliation
-- ==============================================================================

-- 1. Extend payments table check constraint to support advance & credit note tenders
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check 
    CHECK (payment_method = ANY (ARRAY['cash'::text, 'upi'::text, 'card'::text, 'bank'::text, 'advance'::text, 'credit_note'::text, 'other'::text]));

-- 2. Customer Advances Table
CREATE TABLE IF NOT EXISTS public.customer_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    advance_number TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method = ANY (ARRAY['cash'::text, 'upi'::text, 'card'::text, 'bank'::text, 'other'::text])),
    transaction_reference TEXT,
    notes TEXT,
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_customer_advances_num UNIQUE (salon_id, advance_number)
);

CREATE INDEX IF NOT EXISTS idx_customer_advances_client ON public.customer_advances(salon_id, client_id);

-- 3. Customer Advance Allocations Table
CREATE TABLE IF NOT EXISTS public.customer_advance_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    advance_id UUID NOT NULL REFERENCES public.customer_advances(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL,
    payment_id TEXT REFERENCES public.payments(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_adv_alloc_invoice FOREIGN KEY (salon_id, invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_adv_allocations_advance ON public.customer_advance_allocations(advance_id);
CREATE INDEX IF NOT EXISTS idx_adv_allocations_invoice ON public.customer_advance_allocations(invoice_id);

-- 4. Refunds Table
CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    refund_number TEXT NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    invoice_id TEXT NOT NULL,
    payment_id TEXT REFERENCES public.payments(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method = ANY (ARRAY['cash'::text, 'upi'::text, 'card'::text, 'bank'::text, 'other'::text])),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'completed'::text, 'rejected'::text])),
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    approved_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_refunds_invoice FOREIGN KEY (salon_id, invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_refunds_num UNIQUE (salon_id, refund_number)
);

CREATE INDEX IF NOT EXISTS idx_refunds_invoice ON public.refunds(salon_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_refunds_client ON public.refunds(salon_id, client_id);

-- 5. Credit Notes Table
CREATE TABLE IF NOT EXISTS public.credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    credit_note_number TEXT NOT NULL,
    original_invoice_id TEXT NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount > 0),
    allocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (allocated_amount >= 0),
    remaining_amount NUMERIC(12, 2) NOT NULL CHECK (remaining_amount >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active'::text, 'fully_applied'::text, 'cancelled'::text])),
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT fk_credit_notes_invoice FOREIGN KEY (salon_id, original_invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT,
    CONSTRAINT uq_credit_notes_num UNIQUE (salon_id, credit_note_number)
);

CREATE INDEX IF NOT EXISTS idx_credit_notes_invoice ON public.credit_notes(salon_id, original_invoice_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_client ON public.credit_notes(salon_id, client_id);

-- 6. Credit Note Line Items Table
CREATE TABLE IF NOT EXISTS public.credit_note_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_credit_note_items_note ON public.credit_note_items(credit_note_id);

-- 7. Credit Note Allocations Table
CREATE TABLE IF NOT EXISTS public.credit_note_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE RESTRICT,
    target_invoice_id TEXT NOT NULL,
    payment_id TEXT REFERENCES public.payments(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_cn_alloc_target_invoice FOREIGN KEY (salon_id, target_invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_cn_allocations_cn ON public.credit_note_allocations(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cn_allocations_invoice ON public.credit_note_allocations(target_invoice_id);

-- 8. Payment Reminders Table
CREATE TABLE IF NOT EXISTS public.payment_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    channel TEXT NOT NULL CHECK (channel = ANY (ARRAY['whatsapp'::text, 'email'::text])),
    recipient_contact TEXT NOT NULL,
    balance_due NUMERIC(12, 2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'sent' CHECK (status = ANY (ARRAY['sent'::text, 'failed'::text])),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_payment_reminders_invoice FOREIGN KEY (salon_id, invoice_id) REFERENCES public.invoices(salon_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_invoice ON public.payment_reminders(salon_id, invoice_id);

-- 9. Payment Reconciliations Table
CREATE TABLE IF NOT EXISTS public.payment_reconciliations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    reconciliation_date DATE NOT NULL,
    opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
    cash_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
    upi_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
    card_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
    bank_collected NUMERIC(12, 2) NOT NULL DEFAULT 0,
    refunds_total NUMERIC(12, 2) NOT NULL DEFAULT 0,
    net_collections NUMERIC(12, 2) NOT NULL DEFAULT 0,
    expected_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
    actual_cash NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discrepancy NUMERIC(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'balanced' CHECK (status = ANY (ARRAY['balanced'::text, 'discrepancy_reported'::text, 'reviewed'::text])),
    notes TEXT,
    prepared_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    reviewed_by TEXT REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_reconciliation_date UNIQUE (salon_id, reconciliation_date)
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_date ON public.payment_reconciliations(salon_id, reconciliation_date);

-- Enable RLS on all Phase 4 tables
ALTER TABLE public.customer_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_advance_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_note_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_reconciliations ENABLE ROW LEVEL SECURITY;

-- Billing Staff Access Policies
DROP POLICY IF EXISTS "Advances manageable by billing staff" ON public.customer_advances;
CREATE POLICY "Advances manageable by billing staff" ON public.customer_advances
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Advance allocations manageable by billing staff" ON public.customer_advance_allocations;
CREATE POLICY "Advance allocations manageable by billing staff" ON public.customer_advance_allocations
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Refunds manageable by billing staff" ON public.refunds;
CREATE POLICY "Refunds manageable by billing staff" ON public.refunds
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Credit notes manageable by billing staff" ON public.credit_notes;
CREATE POLICY "Credit notes manageable by billing staff" ON public.credit_notes
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Credit note items readable by billing staff" ON public.credit_note_items;
CREATE POLICY "Credit note items readable by billing staff" ON public.credit_note_items
    FOR ALL TO authenticated
    USING (is_owner_or_receptionist())
    WITH CHECK (is_owner_or_receptionist());

DROP POLICY IF EXISTS "Credit note allocations manageable by billing staff" ON public.credit_note_allocations;
CREATE POLICY "Credit note allocations manageable by billing staff" ON public.credit_note_allocations
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Payment reminders manageable by billing staff" ON public.payment_reminders;
CREATE POLICY "Payment reminders manageable by billing staff" ON public.payment_reminders
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Reconciliations manageable by billing staff" ON public.payment_reconciliations;
CREATE POLICY "Reconciliations manageable by billing staff" ON public.payment_reconciliations
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist())
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

-- ==============================================================================
-- TRANSACTIONAL RPCS FOR PHASE 4 FINANCIAL OPERATIONS
-- ==============================================================================

-- 1. RPC: Record Customer Advance
CREATE OR REPLACE FUNCTION public.rpc_record_customer_advance(
    p_salon_id TEXT,
    p_client_id TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_caller_salon TEXT := NULL;
    v_adv_num TEXT;
    v_new_adv_id UUID;
    v_seq_num BIGINT;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id INTO v_caller_id, v_caller_salon
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id AND current_user != 'postgres' THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record advance for another salon';
        END IF;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Advance amount must be greater than zero';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id AND salon_id = p_salon_id) THEN
        RAISE EXCEPTION 'NOT_FOUND: Client % does not exist in salon %', p_client_id, p_salon_id;
    END IF;

    -- Generate monotonic advance sequence number
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq_num
    FROM public.customer_advances
    WHERE salon_id = p_salon_id;

    v_adv_num := 'ADV-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_num::text, 4, '0');

    INSERT INTO public.customer_advances (
        salon_id, client_id, advance_number, amount, remaining_amount,
        payment_method, transaction_reference, notes, created_by
    ) VALUES (
        p_salon_id, p_client_id, v_adv_num, round(p_amount, 2), round(p_amount, 2),
        p_payment_method, p_reference, p_notes, v_caller_id
    ) RETURNING id INTO v_new_adv_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_adv_id,
        'advance_id', v_new_adv_id,
        'salon_id', p_salon_id,
        'advance_number', v_adv_num,
        'amount', round(p_amount, 2),
        'remaining_amount', round(p_amount, 2),
        'payment_method', p_payment_method,
        'transaction_reference', p_reference,
        'notes', p_notes,
        'client_id', p_client_id,
        'created_at', now()
    );
END;
$$;

-- 2. RPC: Allocate Customer Advance to an Invoice
CREATE OR REPLACE FUNCTION public.rpc_allocate_customer_advance(
    p_salon_id TEXT,
    p_advance_id UUID,
    p_invoice_id TEXT,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_adv RECORD;
    v_inv RECORD;
    v_alloc_id UUID;
    v_pmt_id TEXT;
    v_new_adv_rem NUMERIC(12, 2);
    v_alloc_amount NUMERIC(12, 2);
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id INTO v_caller_id
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    v_alloc_amount := round(p_amount, 2);

    IF v_alloc_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Allocation amount must be greater than zero';
    END IF;

    -- Pessimistic lock on customer advance
    SELECT * INTO v_adv
    FROM public.customer_advances
    WHERE id = p_advance_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Customer advance % does not exist in salon %', p_advance_id, p_salon_id;
    END IF;

    IF v_alloc_amount > v_adv.remaining_amount THEN
        RAISE EXCEPTION 'OVER_ALLOCATION: Allocation amount (₹%) exceeds available advance balance (₹%)', v_alloc_amount, v_adv.remaining_amount;
    END IF;

    -- Pessimistic lock on target invoice
    SELECT id, salon_id, client_id, balance_due, payment_status, is_draft
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice % does not exist in salon %', p_invoice_id, p_salon_id;
    END IF;

    IF v_inv.is_draft = true THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot allocate advance to an unfinalized draft bill';
    END IF;

    IF v_alloc_amount > v_inv.balance_due THEN
        RAISE EXCEPTION 'EXCEEDS_BALANCE: Allocation amount (₹%) exceeds invoice balance due (₹%)', v_alloc_amount, v_inv.balance_due;
    END IF;

    -- 1. Deduct from advance remaining balance
    v_new_adv_rem := v_adv.remaining_amount - v_alloc_amount;
    UPDATE public.customer_advances
    SET remaining_amount = v_new_adv_rem
    WHERE id = p_advance_id;

    -- 2. Insert payment record into public.payments (triggers fn_reconcile_invoice_payment)
    v_pmt_id := 'pmt-' || gen_random_uuid();
    INSERT INTO public.payments (
        id, salon_id, invoice_id, payment_method, amount,
        transaction_reference, notes, received_by
    ) VALUES (
        v_pmt_id, p_salon_id, p_invoice_id, 'advance', v_alloc_amount,
        v_adv.advance_number, 'Advance allocation: ' || v_adv.advance_number, v_caller_id
    );

    -- 3. Record audit in customer_advance_allocations
    INSERT INTO public.customer_advance_allocations (
        salon_id, advance_id, invoice_id, payment_id, amount, created_by
    ) VALUES (
        p_salon_id, p_advance_id, p_invoice_id, v_pmt_id, v_alloc_amount, v_caller_id
    ) RETURNING id INTO v_alloc_id;

    -- Fetch updated invoice balance
    SELECT balance_due INTO v_alloc_amount FROM public.invoices WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_alloc_id,
        'allocation_id', v_alloc_id,
        'salon_id', p_salon_id,
        'advance_id', p_advance_id,
        'invoice_id', p_invoice_id,
        'payment_id', v_pmt_id,
        'amount', round(p_amount, 2),
        'remaining_advance', v_new_adv_rem,
        'invoice_balance_due', v_alloc_amount,
        'allocated_at', now()
    );
END;
$$;

-- 3. RPC: Issue Invoice Refund (With Server-Side Owner Approval Guard for High Values)
CREATE OR REPLACE FUNCTION public.rpc_issue_refund(
    p_salon_id TEXT,
    p_invoice_id TEXT,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_reason TEXT,
    p_owner_email TEXT DEFAULT NULL,
    p_owner_password TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_caller_role TEXT := NULL;
    v_inv RECORD;
    v_refund_amt NUMERIC(12, 2);
    v_total_paid NUMERIC(12, 2);
    v_total_refunded NUMERIC(12, 2);
    v_refundable NUMERIC(12, 2);
    v_refund_num TEXT;
    v_new_ref_id UUID;
    v_seq_num BIGINT;
    v_threshold CONSTANT NUMERIC(12, 2) := 2000.00;
    v_owner_user RECORD;
    v_owner_cred RECORD;
    v_approved_by TEXT := NULL;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, role INTO v_caller_id, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    v_refund_amt := round(p_amount, 2);

    IF v_refund_amt <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Refund amount must be greater than zero';
    END IF;

    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'MANDATORY_REASON: A mandatory reason is required to process an invoice refund';
    END IF;

    -- Pessimistic lock on invoice
    SELECT id, salon_id, client_id, invoice_number, paid_amount, total_amount, payment_status, is_draft
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Invoice % does not exist in salon %', p_invoice_id, p_salon_id;
    END IF;

    IF v_inv.is_draft = true THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot issue refund on an unfinalized draft bill';
    END IF;

    -- Calculate refundable limit
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id AND salon_id = p_salon_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM public.refunds
    WHERE invoice_id = p_invoice_id AND salon_id = p_salon_id AND status = 'completed';

    v_refundable := v_total_paid - v_total_refunded;

    IF v_refund_amt > v_refundable THEN
        RAISE EXCEPTION 'EXCEEDS_REFUNDABLE: Refund amount (₹%) exceeds maximum refundable balance (₹%)', v_refund_amt, v_refundable;
    END IF;

    -- Server-side Owner authorization check for high-value refunds (> ₹2,000)
    IF v_refund_amt > v_threshold THEN
        IF v_caller_role = 'OWNER' THEN
            v_approved_by := v_caller_id;
        ELSE
            -- Receptionist requires owner credentials to approve
            IF p_owner_email IS NULL OR p_owner_password IS NULL THEN
                RAISE EXCEPTION 'OWNER_APPROVAL_REQUIRED: Refunds exceeding ₹% require verified Salon Owner approval', v_threshold;
            END IF;

            SELECT u.id, u.salon_id, u.role, u.active
            INTO v_owner_user
            FROM public.users u
            WHERE lower(trim(u.email)) = lower(trim(p_owner_email))
              AND u.salon_id = p_salon_id;

            IF NOT FOUND OR v_owner_user.role != 'OWNER' THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Provided email does not belong to a Salon Owner in this salon';
            END IF;

            IF v_owner_user.active != true THEN
                RAISE EXCEPTION 'UNAUTHORIZED: Owner account is disabled';
            END IF;

            SELECT password_hash INTO v_owner_cred
            FROM public.user_credentials
            WHERE user_id = v_owner_user.id;

            IF NOT FOUND OR crypt(p_owner_password, v_owner_cred.password_hash) != v_owner_cred.password_hash THEN
                RAISE EXCEPTION 'INVALID_CREDENTIALS: Owner password verification failed';
            END IF;

            v_approved_by := v_owner_user.id;
        END IF;
    ELSE
        v_approved_by := COALESCE(v_caller_id, 'staff');
    END IF;

    -- Generate refund sequence number
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq_num
    FROM public.refunds
    WHERE salon_id = p_salon_id;

    v_refund_num := 'REF-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_num::text, 4, '0');

    -- Insert refund record
    INSERT INTO public.refunds (
        salon_id, refund_number, client_id, invoice_id, amount,
        payment_method, reason, status, created_by, approved_by
    ) VALUES (
        p_salon_id, v_refund_num, v_inv.client_id, p_invoice_id, v_refund_amt,
        p_payment_method, p_reason, 'completed', v_caller_id, v_approved_by
    ) RETURNING id INTO v_new_ref_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_ref_id,
        'refund_id', v_new_ref_id,
        'salon_id', p_salon_id,
        'refund_number', v_refund_num,
        'client_id', v_inv.client_id,
        'invoice_id', p_invoice_id,
        'amount', v_refund_amt,
        'payment_method', p_payment_method,
        'reason', p_reason,
        'status', 'completed',
        'remaining_refundable', v_refundable - v_refund_amt,
        'approved_by', v_approved_by,
        'created_by', v_caller_id,
        'created_at', now()
    );
END;
$$;

-- 4. RPC: Create Credit Note
CREATE OR REPLACE FUNCTION public.rpc_create_credit_note(
    p_salon_id TEXT,
    p_original_invoice_id TEXT,
    p_amount NUMERIC,
    p_reason TEXT,
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_inv RECORD;
    v_cn_amt NUMERIC(12, 2);
    v_existing_cn NUMERIC(12, 2);
    v_max_cn NUMERIC(12, 2);
    v_cn_num TEXT;
    v_new_cn_id UUID;
    v_seq_num BIGINT;
    v_item JSONB;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id INTO v_caller_id
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    v_cn_amt := round(p_amount, 2);

    IF v_cn_amt <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Credit note amount must be greater than zero';
    END IF;

    -- Pessimistic lock on original invoice
    SELECT id, salon_id, client_id, invoice_number, total_amount, is_draft
    INTO v_inv
    FROM public.invoices
    WHERE id = p_original_invoice_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Original invoice % does not exist in salon %', p_original_invoice_id, p_salon_id;
    END IF;

    IF v_inv.is_draft = true THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot issue credit note for an unfinalized draft bill';
    END IF;

    SELECT COALESCE(SUM(total_amount), 0) INTO v_existing_cn
    FROM public.credit_notes
    WHERE original_invoice_id = p_original_invoice_id AND salon_id = p_salon_id AND status != 'cancelled';

    v_max_cn := v_inv.total_amount - v_existing_cn;

    IF v_cn_amt > v_max_cn THEN
        RAISE EXCEPTION 'EXCEEDS_LIMIT: Credit note amount (₹%) exceeds maximum allowable credit (₹%) for invoice %', v_cn_amt, v_max_cn, v_inv.invoice_number;
    END IF;

    -- Generate sequence number
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq_num
    FROM public.credit_notes
    WHERE salon_id = p_salon_id;

    v_cn_num := 'CN-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(v_seq_num::text, 4, '0');

    -- Insert credit note header
    INSERT INTO public.credit_notes (
        salon_id, credit_note_number, original_invoice_id, client_id,
        reason, subtotal, tax_amount, total_amount, remaining_amount,
        status, created_by
    ) VALUES (
        p_salon_id, v_cn_num, p_original_invoice_id, v_inv.client_id,
        p_reason, v_cn_amt, 0.00, v_cn_amt, v_cn_amt,
        'active', v_caller_id
    ) RETURNING id INTO v_new_cn_id;

    -- Insert credit note line items if provided
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO public.credit_note_items (
                credit_note_id, description, quantity, unit_price, total_price, tax_rate, tax_amount
            ) VALUES (
                v_new_cn_id,
                COALESCE(v_item->>'description', 'Service Adjustment'),
                COALESCE((v_item->>'quantity')::numeric, 1),
                COALESCE((v_item->>'unit_price')::numeric, v_cn_amt),
                COALESCE((v_item->>'total_price')::numeric, v_cn_amt),
                COALESCE((v_item->>'tax_rate')::numeric, 0.18),
                COALESCE((v_item->>'tax_amount')::numeric, 0.00)
            );
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_new_cn_id,
        'credit_note_id', v_new_cn_id,
        'salon_id', p_salon_id,
        'credit_note_number', v_cn_num,
        'original_invoice_id', p_original_invoice_id,
        'client_id', v_inv.client_id,
        'issue_date', CURRENT_DATE,
        'reason', p_reason,
        'subtotal', v_cn_amt,
        'tax_amount', 0.00,
        'total_amount', v_cn_amt,
        'allocated_amount', 0.00,
        'remaining_amount', v_cn_amt,
        'status', 'active',
        'created_at', now()
    );
END;
$$;

-- 5. RPC: Allocate Credit Note to an Outstanding Invoice
CREATE OR REPLACE FUNCTION public.rpc_allocate_credit_note(
    p_salon_id TEXT,
    p_credit_note_id UUID,
    p_target_invoice_id TEXT,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_cn RECORD;
    v_target RECORD;
    v_alloc_amt NUMERIC(12, 2);
    v_new_cn_rem NUMERIC(12, 2);
    v_new_cn_alloc NUMERIC(12, 2);
    v_pmt_id TEXT;
    v_alloc_id UUID;
    v_new_status TEXT;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id INTO v_caller_id
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    v_alloc_amt := round(p_amount, 2);

    IF v_alloc_amt <= 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Credit allocation amount must be greater than zero';
    END IF;

    -- Lock credit note
    SELECT * INTO v_cn
    FROM public.credit_notes
    WHERE id = p_credit_note_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Credit note % does not exist in salon %', p_credit_note_id, p_salon_id;
    END IF;

    IF v_cn.status = 'cancelled' THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot allocate from a cancelled credit note';
    END IF;

    IF v_alloc_amt > v_cn.remaining_amount THEN
        RAISE EXCEPTION 'OVER_ALLOCATION: Allocation amount (₹%) exceeds available credit note balance (₹%)', v_alloc_amt, v_cn.remaining_amount;
    END IF;

    -- Lock target invoice
    SELECT id, salon_id, client_id, invoice_number, balance_due, payment_status, is_draft
    INTO v_target
    FROM public.invoices
    WHERE id = p_target_invoice_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Target invoice % does not exist in salon %', p_target_invoice_id, p_salon_id;
    END IF;

    IF v_target.is_draft = true THEN
        RAISE EXCEPTION 'INVALID_STATE: Cannot allocate credit note to an unfinalized draft bill';
    END IF;

    IF v_alloc_amt > v_target.balance_due THEN
        RAISE EXCEPTION 'EXCEEDS_BALANCE: Allocation amount (₹%) exceeds target invoice balance due (₹%)', v_alloc_amt, v_target.balance_due;
    END IF;

    -- 1. Deduct from credit note remaining balance
    v_new_cn_rem := v_cn.remaining_amount - v_alloc_amt;
    v_new_cn_alloc := v_cn.allocated_amount + v_alloc_amt;
    v_new_status := CASE WHEN v_new_cn_rem <= 0 THEN 'fully_applied' ELSE 'active' END;

    UPDATE public.credit_notes
    SET remaining_amount = v_new_cn_rem,
        allocated_amount = v_new_cn_alloc,
        status = v_new_status
    WHERE id = p_credit_note_id;

    -- 2. Insert payment row into public.payments (triggers automatic balance reconciliation)
    v_pmt_id := 'pmt-' || gen_random_uuid();
    INSERT INTO public.payments (
        id, salon_id, invoice_id, payment_method, amount,
        transaction_reference, notes, received_by
    ) VALUES (
        v_pmt_id, p_salon_id, p_target_invoice_id, 'credit_note', v_alloc_amt,
        v_cn.credit_note_number, 'Credit note applied: ' || v_cn.credit_note_number, v_caller_id
    );

    -- 3. Record in credit_note_allocations
    INSERT INTO public.credit_note_allocations (
        salon_id, credit_note_id, target_invoice_id, payment_id, amount, created_by
    ) VALUES (
        p_salon_id, p_credit_note_id, p_target_invoice_id, v_pmt_id, v_alloc_amt, v_caller_id
    ) RETURNING id INTO v_alloc_id;

    -- Retrieve updated target invoice balance
    SELECT balance_due INTO v_alloc_amt FROM public.invoices WHERE id = p_target_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_alloc_id,
        'allocation_id', v_alloc_id,
        'salon_id', p_salon_id,
        'credit_note_id', p_credit_note_id,
        'target_invoice_id', p_target_invoice_id,
        'payment_id', v_pmt_id,
        'amount', round(p_amount, 2),
        'remaining_credit', v_new_cn_rem,
        'target_invoice_balance_due', v_alloc_amt,
        'allocated_at', now()
    );
END;
$$;

-- 6. RPC: Record Payment Reconciliation Session
CREATE OR REPLACE FUNCTION public.rpc_record_payment_reconciliation(
    p_salon_id TEXT,
    p_date DATE,
    p_opening_cash NUMERIC,
    p_actual_cash NUMERIC,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_auth TEXT;
    v_caller_id TEXT := NULL;
    v_cash NUMERIC(12, 2) := 0;
    v_upi NUMERIC(12, 2) := 0;
    v_card NUMERIC(12, 2) := 0;
    v_bank NUMERIC(12, 2) := 0;
    v_refunds NUMERIC(12, 2) := 0;
    v_net NUMERIC(12, 2) := 0;
    v_expected_cash NUMERIC(12, 2) := 0;
    v_discrepancy NUMERIC(12, 2) := 0;
    v_status TEXT := 'balanced';
    v_rec_id UUID;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id INTO v_caller_id
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);
    END IF;

    -- Calculate collections for date by tender
    SELECT
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END), 0)
    INTO v_cash, v_upi, v_card, v_bank
    FROM public.payments
    WHERE salon_id = p_salon_id AND created_at::date = p_date;

    -- Calculate refunds for date
    SELECT COALESCE(SUM(amount), 0) INTO v_refunds
    FROM public.refunds
    WHERE salon_id = p_salon_id AND created_at::date = p_date AND status = 'completed';

    v_net := (v_cash + v_upi + v_card + v_bank) - v_refunds;
    v_expected_cash := round(p_opening_cash, 2) + v_cash;
    v_discrepancy := round(p_actual_cash, 2) - v_expected_cash;

    IF v_discrepancy != 0 THEN
        v_status := 'discrepancy_reported';
    END IF;

    INSERT INTO public.payment_reconciliations (
        salon_id, reconciliation_date, opening_cash, cash_collected,
        upi_collected, card_collected, bank_collected, refunds_total,
        net_collections, expected_cash, actual_cash, discrepancy,
        status, notes, prepared_by
    ) VALUES (
        p_salon_id, p_date, round(p_opening_cash, 2), v_cash,
        v_upi, v_card, v_bank, v_refunds,
        v_net, v_expected_cash, round(p_actual_cash, 2), v_discrepancy,
        v_status, p_notes, v_caller_id
    )
    ON CONFLICT (salon_id, reconciliation_date) DO UPDATE
    SET opening_cash = EXCLUDED.opening_cash,
        cash_collected = EXCLUDED.cash_collected,
        upi_collected = EXCLUDED.upi_collected,
        card_collected = EXCLUDED.card_collected,
        bank_collected = EXCLUDED.bank_collected,
        refunds_total = EXCLUDED.refunds_total,
        net_collections = EXCLUDED.net_collections,
        expected_cash = EXCLUDED.expected_cash,
        actual_cash = EXCLUDED.actual_cash,
        discrepancy = EXCLUDED.discrepancy,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        prepared_by = EXCLUDED.prepared_by
    RETURNING id INTO v_rec_id;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_rec_id,
        'reconciliation_id', v_rec_id,
        'salon_id', p_salon_id,
        'date', p_date,
        'reconciliation_date', p_date,
        'opening_cash', round(p_opening_cash, 2),
        'cash_collected', v_cash,
        'upi_collected', v_upi,
        'card_collected', v_card,
        'bank_collected', v_bank,
        'refunds_total', v_refunds,
        'net_collections', v_net,
        'expected_cash', v_expected_cash,
        'actual_cash', round(p_actual_cash, 2),
        'discrepancy', v_discrepancy,
        'status', v_status,
        'created_at', now()
    );
END;
$$;

-- 7. RPC: Get Customer Ledger (Chronological Running Balances)
CREATE OR REPLACE FUNCTION public.rpc_get_customer_ledger(
    p_salon_id TEXT,
    p_client_id TEXT,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_client RECORD;
    v_total_invoiced NUMERIC(12, 2) := 0;
    v_total_paid NUMERIC(12, 2) := 0;
    v_total_outstanding NUMERIC(12, 2) := 0;
    v_total_advance NUMERIC(12, 2) := 0;
    v_available_advance NUMERIC(12, 2) := 0;
    v_total_refunds NUMERIC(12, 2) := 0;
    v_total_credit_notes NUMERIC(12, 2) := 0;
    v_available_credit NUMERIC(12, 2) := 0;
    v_events JSONB;
BEGIN
    SELECT * INTO v_client
    FROM public.clients
    WHERE id = p_client_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Client % not found in salon %', p_client_id, p_salon_id;
    END IF;

    -- Aggregate totals
    SELECT
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount), 0),
        COALESCE(SUM(balance_due), 0)
    INTO v_total_invoiced, v_total_paid, v_total_outstanding
    FROM public.invoices
    WHERE client_id = p_client_id AND salon_id = p_salon_id AND is_draft = false;

    SELECT
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(remaining_amount), 0)
    INTO v_total_advance, v_available_advance
    FROM public.customer_advances
    WHERE client_id = p_client_id AND salon_id = p_salon_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunds
    FROM public.refunds
    WHERE client_id = p_client_id AND salon_id = p_salon_id AND status = 'completed';

    SELECT
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(remaining_amount), 0)
    INTO v_total_credit_notes, v_available_credit
    FROM public.credit_notes
    WHERE client_id = p_client_id AND salon_id = p_salon_id AND status != 'cancelled';

    -- Build chronological ledger events stream
    WITH ledger_stream AS (
        -- Invoices Issued (Debit: Increases what customer owes)
        SELECT
            date::text AS event_date,
            created_at AS event_timestamp,
            'INVOICE' AS transaction_type,
            invoice_number AS reference,
            'Tax Invoice Issued' AS description,
            total_amount AS debit_amount,
            0.00::numeric AS credit_amount,
            NULL::text AS payment_method
        FROM public.invoices
        WHERE client_id = p_client_id AND salon_id = p_salon_id AND is_draft = false
          AND (p_start_date IS NULL OR date >= p_start_date)
          AND (p_end_date IS NULL OR date <= p_end_date)

        UNION ALL

        -- Payments Received against Invoices (Credit: Reduces what customer owes)
        SELECT
            p.created_at::date::text AS event_date,
            p.created_at AS event_timestamp,
            'PAYMENT' AS transaction_type,
            COALESCE(i.invoice_number, p.id) AS reference,
            'Payment Received (' || p.payment_method || ')' AS description,
            0.00::numeric AS debit_amount,
            p.amount AS credit_amount,
            p.payment_method AS payment_method
        FROM public.payments p
        JOIN public.invoices i ON i.id = p.invoice_id AND i.salon_id = p.salon_id
        WHERE i.client_id = p_client_id AND p.salon_id = p_salon_id
          AND (p_start_date IS NULL OR p.created_at::date >= p_start_date)
          AND (p_end_date IS NULL OR p.created_at::date <= p_end_date)

        UNION ALL

        -- Customer Advances Received (Credit)
        SELECT
            created_at::date::text AS event_date,
            created_at AS event_timestamp,
            'ADVANCE_RECEIVED' AS transaction_type,
            advance_number AS reference,
            'Customer Advance Deposited' AS description,
            0.00::numeric AS debit_amount,
            amount AS credit_amount,
            payment_method AS payment_method
        FROM public.customer_advances
        WHERE client_id = p_client_id AND salon_id = p_salon_id
          AND (p_start_date IS NULL OR created_at::date >= p_start_date)
          AND (p_end_date IS NULL OR created_at::date <= p_end_date)

        UNION ALL

        -- Refunds Issued (Debit: Reversal of cash received)
        SELECT
            created_at::date::text AS event_date,
            created_at AS event_timestamp,
            'REFUND' AS transaction_type,
            refund_number AS reference,
            'Customer Refund Issued (' || reason || ')' AS description,
            amount AS debit_amount,
            0.00::numeric AS credit_amount,
            payment_method AS payment_method
        FROM public.refunds
        WHERE client_id = p_client_id AND salon_id = p_salon_id AND status = 'completed'
          AND (p_start_date IS NULL OR created_at::date >= p_start_date)
          AND (p_end_date IS NULL OR created_at::date <= p_end_date)

        UNION ALL

        -- Credit Notes Issued (Credit)
        SELECT
            issue_date::text AS event_date,
            created_at AS event_timestamp,
            'CREDIT_NOTE' AS transaction_type,
            credit_note_number AS reference,
            'Credit Note Issued (' || reason || ')' AS description,
            0.00::numeric AS debit_amount,
            total_amount AS credit_amount,
            'credit_note' AS payment_method
        FROM public.credit_notes
        WHERE client_id = p_client_id AND salon_id = p_salon_id AND status != 'cancelled'
          AND (p_start_date IS NULL OR issue_date >= p_start_date)
          AND (p_end_date IS NULL OR issue_date <= p_end_date)
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'event_date', s.event_date,
                'event_timestamp', s.event_timestamp,
                'transaction_type', s.transaction_type,
                'reference', s.reference,
                'description', s.description,
                'debit_amount', s.debit_amount,
                'credit_amount', s.credit_amount,
                'payment_method', s.payment_method
            )
            ORDER BY s.event_timestamp ASC
        ),
        '[]'::jsonb
    ) INTO v_events
    FROM ledger_stream s;

    RETURN jsonb_build_object(
        'client', jsonb_build_object(
            'id', v_client.id,
            'name', v_client.name,
            'phone', v_client.phone,
            'email', v_client.email
        ),
        'summary', jsonb_build_object(
            'total_invoiced', v_total_invoiced,
            'total_paid', v_total_paid,
            'total_outstanding', v_total_outstanding,
            'total_advance', v_total_advance,
            'available_advance', v_available_advance,
            'total_refunds', v_total_refunds,
            'total_credit_notes', v_total_credit_notes,
            'available_credit', v_available_credit,
            'net_customer_balance', v_total_outstanding - v_available_advance - v_available_credit
        ),
        'transactions', v_events
    );
END;
$$;

-- Grant permissions to authenticated
GRANT ALL ON TABLE public.customer_advances TO authenticated;
GRANT ALL ON TABLE public.customer_advance_allocations TO authenticated;
GRANT ALL ON TABLE public.refunds TO authenticated;
GRANT ALL ON TABLE public.credit_notes TO authenticated;
GRANT ALL ON TABLE public.credit_note_items TO authenticated;
GRANT ALL ON TABLE public.credit_note_allocations TO authenticated;
GRANT ALL ON TABLE public.payment_reminders TO authenticated;
GRANT ALL ON TABLE public.payment_reconciliations TO authenticated;

GRANT EXECUTE ON FUNCTION public.rpc_record_customer_advance(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_allocate_customer_advance(TEXT, UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_issue_refund(TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_create_credit_note(TEXT, TEXT, NUMERIC, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_allocate_credit_note(TEXT, UUID, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_payment_reconciliation(TEXT, DATE, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_get_customer_ledger(TEXT, TEXT, DATE, DATE) TO authenticated;
