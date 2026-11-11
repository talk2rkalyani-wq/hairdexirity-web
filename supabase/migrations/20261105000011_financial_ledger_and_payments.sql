-- ==============================================================================
-- Luma Salon — Migration 000011: Financial Ledger, Invoicing & Multi-Tender Payments
-- Phase 7.1D Hardened: PostgreSQL Financial Persistence, Sequences & Hardened RLS
-- ==============================================================================
-- Includes:
--   1. Central PostgreSQL sequence for atomic, monotonic invoice numbering
--   2. Invoices table with tenant isolation, composite constraints, and audit timestamps
--   3. Invoice line items table with cross-tenant composite FK
--   4. Payments table with multi-tender records (Cash, UPI, Card, Split) and payment idempotency
--   5. Payment balance reconciliation trigger (with pessimistic row locking & overpayment rejection)
--   6. Finalized invoice immutability trigger protecting core financial fields
--   7. Role-based Row Level Security (RLS) policies:
--      - OWNER & RECEPTIONIST: Full authorized billing, checkout and reporting access
--      - EMPLOYEE: Read-only access to own assigned service invoices; zero access to salon turnover
--      - DELETE: Completely prohibited across all financial tables (Accounting Ledger Immutability)
--   8. SQL GRANT and REVOKE privilege hardening
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PREREQUISITE HELPER FUNCTIONS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.current_user_salon_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT salon_id FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_salon_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_salon_id() TO authenticated;

-- ==============================================================================
-- 1. CENTRAL INVOICE SEQUENCE & ATOMIC NUMBER GENERATION (WITH ROLE & TENANT GUARDS)
-- ==============================================================================
-- NOTE ON GAPLESS NUMBERING:
-- PostgreSQL sequences are atomic, thread-safe, and monotonically increasing.
-- However, under transaction aborts or rollbacks, sequence numbers are consumed and not recycled.
-- Therefore, numbering is monotonically increasing but NOT strictly gapless under failure conditions.
-- For legal and tax audit compliance (e.g. Indian GST Rule 46), voided or cancelled invoices
-- must be preserved with payment_status = 'cancelled' rather than leaving unrecorded gaps.
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START WITH 1001 INCREMENT BY 1;

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
    -- 1. Enforce caller authentication & tenant membership
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is unauthenticated or has no active salon membership';
    END IF;

    -- 2. Reject cross-tenant attempts
    IF p_salon_id IS NOT NULL AND p_salon_id <> v_caller_salon THEN
        RAISE EXCEPTION 'Unauthorized: Caller cannot request invoice sequence for another salon (%)', p_salon_id;
    END IF;

    -- 3. Enforce role authorization (Only Owner or Receptionist can generate invoice numbers)
    IF NOT public.is_owner_or_receptionist() THEN
        RAISE EXCEPTION 'Unauthorized: Only salon owners or receptionists are authorized to allocate invoice numbers';
    END IF;

    -- 4. Atomically advance sequence
    v_year := to_char(CURRENT_DATE, 'YYYY');
    v_seq := nextval('public.invoice_number_seq');
    RETURN 'INV-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.next_invoice_number(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(TEXT) TO authenticated;

-- ==============================================================================
-- 2. TABLE: public.invoices
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invoices (
    id TEXT PRIMARY KEY DEFAULT ('inv-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
    invoice_number TEXT NOT NULL,
    appointment_id TEXT REFERENCES public.appointments(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
    client_name TEXT NOT NULL,
    client_phone TEXT,
    client_email TEXT,
    staff_id TEXT NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
    staff_name TEXT NOT NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
    service_name TEXT NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    subtotal NUMERIC(12, 2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    discount_type TEXT CHECK (discount_type IN ('flat', 'percentage')),
    discount_reason TEXT,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18 CHECK (tax_rate >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (balance_due >= 0),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' 
        CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'refunded', 'cancelled')),
    primary_payment_method TEXT NOT NULL 
        CHECK (primary_payment_method IN ('cash', 'upi', 'card', 'split', 'other')),
    notes TEXT,
    idempotency_key TEXT,
    void_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- Tenant isolation and composite constraints
    CONSTRAINT uq_invoices_salon_id UNIQUE (salon_id, id),
    CONSTRAINT uq_salon_invoice_number UNIQUE (salon_id, invoice_number),
    CONSTRAINT uq_invoices_salon_idempotency UNIQUE (salon_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_invoices_salon_date ON public.invoices(salon_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_appointment ON public.invoices(appointment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_staff ON public.invoices(staff_id);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON public.invoices(salon_id, payment_status);

-- ==============================================================================
-- 3. TABLE: public.invoice_line_items
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
    id TEXT PRIMARY KEY DEFAULT ('item-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(12, 2) NOT NULL CHECK (total_price >= 0),
    item_type TEXT NOT NULL DEFAULT 'service' CHECK (item_type IN ('service', 'product')),
    product_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- Cross-tenant composite foreign key: guarantees line item belongs to same salon as invoice
    CONSTRAINT fk_line_items_salon_invoice FOREIGN KEY (salon_id, invoice_id)
        REFERENCES public.invoices(salon_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_line_items_invoice ON public.invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_line_items_salon ON public.invoice_line_items(salon_id);

-- ==============================================================================
-- 4. TABLE: public.payments (Multi-Tender Cash, UPI, Card POS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id TEXT PRIMARY KEY DEFAULT ('pmt-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE RESTRICT,
    invoice_id TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'other')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    transaction_reference TEXT,
    notes TEXT,
    received_by TEXT,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- Cross-tenant composite foreign key: guarantees payment belongs to same salon as invoice
    CONSTRAINT fk_payments_salon_invoice FOREIGN KEY (salon_id, invoice_id)
        REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT,
    -- Tenant-scoped payment idempotency constraint
    CONSTRAINT uq_payments_salon_idempotency UNIQUE (salon_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_salon ON public.payments(salon_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON public.payments(salon_id, payment_method);

-- ==============================================================================
-- 5. AUTOMATIC RECONCILIATION & IMMUTABILITY TRIGGERS
-- ==============================================================================

-- 5.1 Payment Reconciliation Trigger: Atomically updates invoice balance with row locking
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
    -- Pessimistic row lock on target invoice to prevent concurrent balance corruption
    SELECT id, total_amount, paid_amount, balance_due, payment_status, salon_id
    INTO v_inv
    FROM public.invoices
    WHERE id = NEW.invoice_id AND salon_id = NEW.salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found in salon %', NEW.invoice_id, NEW.salon_id;
    END IF;

    -- Reject payment attempts on voided/cancelled invoices
    IF v_inv.payment_status = 'cancelled' THEN
        RAISE EXCEPTION 'Cannot record payment for cancelled invoice %', NEW.invoice_id;
    END IF;

    -- Reject overpayments at database constraint level
    IF NEW.amount > v_inv.balance_due THEN
        RAISE EXCEPTION 'Payment amount (₹%) exceeds invoice balance due (₹%)', NEW.amount, v_inv.balance_due;
    END IF;

    -- Reconcile paid amount and outstanding balance
    v_new_paid := v_inv.paid_amount + NEW.amount;
    v_new_balance := v_inv.total_amount - v_new_paid;

    IF v_new_balance <= 0 THEN
        v_new_status := 'paid';
    ELSIF v_new_paid > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'unpaid';
    END IF;

    -- Update invoice atomically
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
    BEFORE INSERT ON public.payments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_reconcile_invoice_payment();

-- 5.2 Invoice Immutability Trigger: Prohibits arbitrary modification of core commercial fields
CREATE OR REPLACE FUNCTION public.fn_protect_finalized_invoices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Prevent un-cancelling
    IF OLD.payment_status = 'cancelled' AND NEW.payment_status <> 'cancelled' THEN
        RAISE EXCEPTION 'Cannot un-cancel an invoice that has been cancelled';
    END IF;

    -- 2. Prohibit modifying commercial fields once created
    IF NEW.invoice_number <> OLD.invoice_number OR
       NEW.salon_id <> OLD.salon_id OR
       NEW.client_id <> OLD.client_id OR
       NEW.staff_id <> OLD.staff_id OR
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
    -- If called directly from an UPDATE statement (depth = 1), balance_due and paid_amount cannot be changed
    IF pg_trigger_depth() <= 1 AND (
        NEW.balance_due <> OLD.balance_due OR 
        NEW.paid_amount <> OLD.paid_amount
    ) THEN
        RAISE EXCEPTION 'Direct manipulation of paid_amount or balance_due is prohibited; must be reconciled via payments ledger';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_finalized_invoices ON public.invoices;
CREATE TRIGGER trg_protect_finalized_invoices
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_finalized_invoices();

-- 5.3 Line Items Immutability Trigger: Prohibits adding or altering items on finalized or cancelled invoices
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

DROP TRIGGER IF EXISTS trg_protect_finalized_line_items ON public.invoice_line_items;
CREATE TRIGGER trg_protect_finalized_line_items
    BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_line_items
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_finalized_line_items();

-- 5.4 Secure Invoice Cancellation RPC (Controlled Lifecycle Operation)
CREATE OR REPLACE FUNCTION public.cancel_invoice(p_invoice_id TEXT, p_void_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_inv RECORD;
BEGIN
    -- 1. Check authentication & tenant membership
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Caller is unauthenticated or has no active salon membership';
    END IF;

    -- 2. Check role authorization (Only Owner or Receptionist can void invoices)
    IF NOT public.is_owner_or_receptionist() THEN
        RAISE EXCEPTION 'Unauthorized: Only salon owners or receptionists are authorized to cancel invoices';
    END IF;

    -- 3. Lock target invoice
    SELECT id, salon_id, payment_status, notes
    INTO v_inv
    FROM public.invoices
    WHERE id = p_invoice_id AND salon_id = v_caller_salon
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice % not found in salon %', p_invoice_id, v_caller_salon;
    END IF;

    IF v_inv.payment_status = 'cancelled' THEN
        RAISE EXCEPTION 'Invoice % is already cancelled', p_invoice_id;
    END IF;

    -- 4. Atomically transition to cancelled with audit reason
    UPDATE public.invoices
    SET payment_status = 'cancelled',
        void_reason = COALESCE(p_void_reason, 'Voided by authorized staff'),
        notes = CASE 
            WHEN v_inv.notes IS NULL OR v_inv.notes = '' THEN 'CANCELLED: ' || COALESCE(p_void_reason, 'Voided by staff')
            ELSE v_inv.notes || ' | CANCELLED: ' || COALESCE(p_void_reason, 'Voided by staff')
        END,
        updated_at = timezone('utc', now())
    WHERE id = p_invoice_id AND salon_id = v_caller_salon;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_invoice(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (HARDENED ROLE-BASED LEAST PRIVILEGE)
-- ==============================================================================
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 6.1 Invoices RLS Policies
-- READ: Owners and Receptionists see all invoices; Stylists see ONLY their own assigned services
DROP POLICY IF EXISTS "Invoices readable by authorized salon roles" ON public.invoices;
CREATE POLICY "Invoices readable by authorized salon roles"
    ON public.invoices FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND (
            public.is_owner_or_receptionist()
            OR staff_id = public.current_user_staff_id()
        )
    );

-- INSERT: Only Owners and Receptionists can issue invoices
DROP POLICY IF EXISTS "Invoices insertable by billing staff" ON public.invoices;
CREATE POLICY "Invoices insertable by billing staff"
    ON public.invoices FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

-- UPDATE: Only Owners and Receptionists can update invoice status/settlement
DROP POLICY IF EXISTS "Invoices updatable by billing staff" ON public.invoices;
CREATE POLICY "Invoices updatable by billing staff"
    ON public.invoices FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

-- DELETE: Prohibited for ALL roles (Commercial Ledger Immutability)
-- (No DELETE policy defined; PostgreSQL default denies all DELETE operations)

-- 6.2 Line items RLS Policies
DROP POLICY IF EXISTS "Line items readable by authorized salon roles" ON public.invoice_line_items;
CREATE POLICY "Line items readable by authorized salon roles"
    ON public.invoice_line_items FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND (
            public.is_owner_or_receptionist()
            OR EXISTS (
                SELECT 1 FROM public.invoices i 
                WHERE i.id = invoice_id AND i.staff_id = public.current_user_staff_id()
            )
        )
    );

DROP POLICY IF EXISTS "Line items insertable by billing staff" ON public.invoice_line_items;
CREATE POLICY "Line items insertable by billing staff"
    ON public.invoice_line_items FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

-- 6.3 Payments RLS Policies
-- Payments contain sensitive financial tender data: ONLY Owners and Receptionists have read/write access
DROP POLICY IF EXISTS "Payments readable by billing staff" ON public.payments;
CREATE POLICY "Payments readable by billing staff"
    ON public.payments FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Payments insertable by billing staff" ON public.payments;
CREATE POLICY "Payments insertable by billing staff"
    ON public.payments FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

-- ==============================================================================
-- 7. SQL PRIVILEGE HARDENING (GRANT & REVOKE DEFENSE-IN-DEPTH)
-- ==============================================================================
REVOKE ALL ON public.invoices FROM PUBLIC, anon;
REVOKE ALL ON public.invoice_line_items FROM PUBLIC, anon;
REVOKE ALL ON public.payments FROM PUBLIC, anon;

-- Invoices: Authenticated users can SELECT and INSERT. DELETE is permanently revoked.
-- Table-level UPDATE is revoked to prevent tampering with financial amounts, status, and balances.
-- Column-level UPDATE is restricted exclusively to operational metadata (notes, void_reason, updated_at).
-- Controlled lifecycle cancellation must be executed through the secure RPC cancel_invoice().
GRANT SELECT, INSERT ON public.invoices TO authenticated;
REVOKE DELETE ON public.invoices FROM authenticated;
REVOKE UPDATE ON public.invoices FROM authenticated;
GRANT UPDATE (notes, void_reason, updated_at) ON public.invoices TO authenticated;

-- Line Items: Authenticated users can SELECT, INSERT. UPDATE and DELETE are permanently revoked.
GRANT SELECT, INSERT ON public.invoice_line_items TO authenticated;
REVOKE UPDATE, DELETE ON public.invoice_line_items FROM authenticated;

-- Payments: Authenticated users can SELECT, INSERT. UPDATE and DELETE are permanently revoked.
GRANT SELECT, INSERT ON public.payments TO authenticated;
REVOKE UPDATE, DELETE ON public.payments FROM authenticated;

-- Sequence usage
GRANT USAGE, SELECT ON SEQUENCE public.invoice_number_seq TO authenticated;

COMMIT;
