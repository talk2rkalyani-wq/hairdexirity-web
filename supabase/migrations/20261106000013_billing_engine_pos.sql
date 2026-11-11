-- ==============================================================================
-- Luma Salon — Migration 000013: Billing Engine POS & Multi-Item Extensions
-- Phase 2 Hardened: POS Cart Line Items, Draft Invoices, Bank Tender & Immutability Rules
-- ==============================================================================

BEGIN;

-- 1. Extend invoices payment status check to allow 'draft'
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_payment_status_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_payment_status_check 
    CHECK (payment_status IN ('paid', 'partial', 'unpaid', 'refunded', 'cancelled', 'draft'));

-- 2. Extend invoices primary payment method to allow 'bank'
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_primary_payment_method_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_primary_payment_method_check 
    CHECK (primary_payment_method IN ('cash', 'upi', 'card', 'bank', 'split', 'other'));

-- 3. Extend payments payment method to allow 'bank'
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_payment_method_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_payment_method_check 
    CHECK (payment_method IN ('cash', 'upi', 'card', 'bank', 'other'));

-- 4. Additive columns to invoices for POS configuration
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_gst_invoice BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_treatment TEXT NOT NULL DEFAULT 'exclusive';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;

-- 5. Additive columns to invoice_line_items for stylist attribution, discounts and tax
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS staff_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.18 CHECK (tax_rate >= 0);
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_line_items_staff ON public.invoice_line_items(staff_id);
CREATE INDEX IF NOT EXISTS idx_line_items_service ON public.invoice_line_items(service_id);

-- 6. Immutability Trigger Update: Allow drafts to transition to finalized state
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
    IF pg_trigger_depth() <= 1 AND (
        NEW.balance_due <> OLD.balance_due OR 
        NEW.paid_amount <> OLD.paid_amount
    ) THEN
        RAISE EXCEPTION 'Direct manipulation of paid_amount or balance_due is prohibited; must be reconciled via payments ledger';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;

