-- ==============================================================================
-- Luma Salon — Migration 000019: Purchase & Supplier Management System
-- Phase 6: Suppliers, Purchase Orders, Purchase Bills, Goods Receipts,
--          Purchase Returns, Supplier Payments & Accounts Payable Ledger
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. SEQUENCES FOR HUMAN-READABLE DOCUMENT NUMBERS
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.supplier_code_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_bill_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.goods_receipt_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.purchase_return_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.supplier_payment_number_seq START WITH 1 INCREMENT BY 1;

-- ==============================================================================
-- 2. EXTEND INVENTORY PRODUCTS & STOCK MOVEMENTS (RETAIL & CONSUMABLES)
-- ==============================================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'item_type'
    ) THEN
        ALTER TABLE public.inventory_products ADD COLUMN item_type TEXT NOT NULL DEFAULT 'retail' CHECK (item_type IN ('retail', 'consumable'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'default_supplier_id'
    ) THEN
        ALTER TABLE public.inventory_products ADD COLUMN default_supplier_id UUID;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'inventory_products' AND column_name = 'tax_rate'
    ) THEN
        ALTER TABLE public.inventory_products ADD COLUMN tax_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1800;
    END IF;
END $$;

-- Update stock movements check constraint to include explicit purchase types
DO $$
BEGIN
    ALTER TABLE public.inventory_stock_movements DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;
    ALTER TABLE public.inventory_stock_movements ADD CONSTRAINT inventory_stock_movements_movement_type_check
        CHECK (movement_type IN (
            'OPENING_STOCK',
            'STOCK_RECEIVED',
            'PURCHASE_RECEIPT',
            'STOCK_ADJUSTMENT_IN',
            'STOCK_ADJUSTMENT_OUT',
            'STOCK_RETURN',
            'PURCHASE_RETURN'
        ));
EXCEPTION
    WHEN OTHERS THEN NULL;
END $$;

-- ==============================================================================
-- 3. TABLE: public.suppliers
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    supplier_code TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    contact_person TEXT,
    phone TEXT NOT NULL CHECK (length(trim(phone)) >= 7),
    email TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    gstin TEXT,
    pan TEXT,
    category TEXT NOT NULL DEFAULT 'General',
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_suppliers_salon_code UNIQUE (salon_id, supplier_code)
);

CREATE INDEX IF NOT EXISTS idx_suppliers_salon ON public.suppliers(salon_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status ON public.suppliers(salon_id, status);
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON public.suppliers(salon_id, category);

-- Scoped uniqueness for phone and GSTIN within salon
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_salon_phone_unique
    ON public.suppliers (salon_id, lower(trim(phone)));

CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_salon_gstin_unique
    ON public.suppliers (salon_id, lower(trim(gstin)))
    WHERE gstin IS NOT NULL AND trim(gstin) <> '';

-- ==============================================================================
-- 4. TABLE: public.purchase_orders & ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    po_number TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'partially_received', 'fully_received', 'cancelled', 'closed')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    terms_and_conditions TEXT,
    created_by TEXT,
    submitted_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_purchase_orders_salon_num UNIQUE (salon_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_salon_date ON public.purchase_orders(salon_id, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_salon_supplier ON public.purchase_orders(salon_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_salon_status ON public.purchase_orders(salon_id, status);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
    item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'consumable', 'custom')),
    name TEXT NOT NULL,
    sku TEXT,
    unit TEXT NOT NULL DEFAULT 'pcs',
    ordered_quantity NUMERIC(12, 3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (received_quantity >= 0),
    unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON public.purchase_order_items(po_id);
CREATE INDEX IF NOT EXISTS idx_po_items_salon ON public.purchase_order_items(salon_id);

-- ==============================================================================
-- 5. TABLE: public.purchase_bills & ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_bills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL, -- PB-2026-0001
    supplier_invoice_number TEXT NOT NULL,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL DEFAULT (CURRENT_DATE + 30),
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partially_paid', 'paid', 'cancelled')),
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    additional_charges NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    balance_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_purchase_bills_salon_num UNIQUE (salon_id, bill_number)
);

CREATE INDEX IF NOT EXISTS idx_pb_salon_date ON public.purchase_bills(salon_id, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_pb_salon_supplier ON public.purchase_bills(salon_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_pb_salon_status ON public.purchase_bills(salon_id, status);

-- Duplicate protection on supplier invoice number per supplier
CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_salon_supplier_inv_unique
    ON public.purchase_bills (salon_id, supplier_id, lower(trim(supplier_invoice_number)));

CREATE TABLE IF NOT EXISTS public.purchase_bill_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
    item_type TEXT NOT NULL DEFAULT 'product' CHECK (item_type IN ('product', 'consumable', 'custom')),
    name TEXT NOT NULL,
    sku TEXT,
    unit TEXT NOT NULL DEFAULT 'pcs',
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    taxable_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pb_items_bill ON public.purchase_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_pb_items_salon ON public.purchase_bill_items(salon_id);

-- ==============================================================================
-- 6. TABLE: public.goods_receipts & ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    grn_number TEXT NOT NULL, -- GRN-2026-0001
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
    bill_id UUID REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_goods_receipts_salon_grn UNIQUE (salon_id, grn_number)
);

CREATE INDEX IF NOT EXISTS idx_grn_salon_date ON public.goods_receipts(salon_id, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_grn_salon_supplier ON public.goods_receipts(salon_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_grn_salon_po ON public.goods_receipts(salon_id, po_id);

CREATE TABLE IF NOT EXISTS public.goods_receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
    po_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
    ordered_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    received_quantity NUMERIC(12, 3) NOT NULL CHECK (received_quantity >= 0),
    accepted_quantity NUMERIC(12, 3) NOT NULL CHECK (accepted_quantity >= 0),
    rejected_quantity NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (rejected_quantity >= 0),
    rejection_reason TEXT,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sort_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT chk_grn_quantities CHECK (received_quantity = accepted_quantity + rejected_quantity)
);

CREATE INDEX IF NOT EXISTS idx_grn_items_receipt ON public.goods_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_grn_items_product ON public.goods_receipt_items(product_id);

-- ==============================================================================
-- 7. TABLE: public.purchase_returns & ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    return_number TEXT NOT NULL, -- PR-2026-0001
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    bill_id UUID REFERENCES public.purchase_bills(id) ON DELETE SET NULL,
    receipt_id UUID REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
    return_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'completed', 'cancelled')),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT NOT NULL,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_purchase_returns_salon_num UNIQUE (salon_id, return_number)
);

CREATE INDEX IF NOT EXISTS idx_pr_salon_date ON public.purchase_returns(salon_id, return_date DESC);
CREATE INDEX IF NOT EXISTS idx_pr_salon_supplier ON public.purchase_returns(salon_id, supplier_id);

CREATE TABLE IF NOT EXISTS public.purchase_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    return_id UUID NOT NULL REFERENCES public.purchase_returns(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE RESTRICT,
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    unit_cost NUMERIC(12, 2) NOT NULL CHECK (unit_cost >= 0),
    tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1800,
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    reason TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_pr_items_return ON public.purchase_return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_pr_items_product ON public.purchase_return_items(product_id);

-- ==============================================================================
-- 8. TABLE: public.supplier_payments & ALLOCATIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.supplier_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    payment_number TEXT NOT NULL, -- SPAY-2026-0001
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'bank', 'card', 'advance', 'other')),
    transaction_reference TEXT,
    allocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (allocated_amount >= 0),
    unallocated_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (unallocated_amount >= 0),
    is_advance BOOLEAN NOT NULL DEFAULT false,
    idempotency_key TEXT,
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_supplier_payments_salon_num UNIQUE (salon_id, payment_number)
);

CREATE INDEX IF NOT EXISTS idx_spay_salon_date ON public.supplier_payments(salon_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_spay_salon_supplier ON public.supplier_payments(salon_id, supplier_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spay_salon_idempotency_unique
    ON public.supplier_payments (salon_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL AND trim(idempotency_key) <> '';

CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.supplier_payments(id) ON DELETE CASCADE,
    bill_id UUID NOT NULL REFERENCES public.purchase_bills(id) ON DELETE RESTRICT,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_spay_alloc_bill ON public.supplier_payment_allocations(bill_id);
CREATE INDEX IF NOT EXISTS idx_spay_alloc_payment ON public.supplier_payment_allocations(payment_id);

-- ==============================================================================
-- 9. TABLE: public.supplier_ledger
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.supplier_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN (
            'PURCHASE_BILL',
            'SUPPLIER_PAYMENT',
            'PURCHASE_RETURN',
            'SUPPLIER_ADVANCE',
            'OPENING_BALANCE',
            'ADJUSTMENT'
        )
    ),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id TEXT NOT NULL,
    description TEXT NOT NULL,
    debit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,  -- Reduces payable: payments, returns, advances
    credit NUMERIC(12, 2) NOT NULL DEFAULT 0.00, -- Increases payable: bills, opening balance
    running_balance NUMERIC(12, 2) NOT NULL,     -- Net Payable (Closing balance = Credits - Debits)
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_sup_ledger_salon_sup ON public.supplier_ledger(salon_id, supplier_id, transaction_date DESC, created_at DESC);

-- ==============================================================================
-- 10. TABLE: public.purchase_audit_logs
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.purchase_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL, -- 'SUPPLIER', 'PO', 'BILL', 'RECEIPT', 'RETURN', 'PAYMENT'
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_role TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_purchase_audit_entity ON public.purchase_audit_logs(salon_id, entity_type, entity_id);

-- ==============================================================================
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_audit_logs ENABLE ROW LEVEL SECURITY;

-- Suppliers Policies
DROP POLICY IF EXISTS "Suppliers viewable by salon staff" ON public.suppliers;
CREATE POLICY "Suppliers viewable by salon staff" ON public.suppliers
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Suppliers manageable by owner" ON public.suppliers;
CREATE POLICY "Suppliers manageable by owner" ON public.suppliers
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

-- Purchase Orders Policies
DROP POLICY IF EXISTS "PO viewable by salon staff" ON public.purchase_orders;
CREATE POLICY "PO viewable by salon staff" ON public.purchase_orders
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "PO insertable by salon staff" ON public.purchase_orders;
CREATE POLICY "PO insertable by salon staff" ON public.purchase_orders
    FOR INSERT TO authenticated
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "PO updatable by salon staff" ON public.purchase_orders;
CREATE POLICY "PO updatable by salon staff" ON public.purchase_orders
    FOR UPDATE TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

-- Purchase Order Items Policies
DROP POLICY IF EXISTS "PO items viewable by salon staff" ON public.purchase_order_items;
CREATE POLICY "PO items viewable by salon staff" ON public.purchase_order_items
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "PO items insertable by salon staff" ON public.purchase_order_items;
CREATE POLICY "PO items insertable by salon staff" ON public.purchase_order_items
    FOR INSERT TO authenticated
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

-- Goods Receipts Policies
DROP POLICY IF EXISTS "Receipts viewable by salon staff" ON public.goods_receipts;
CREATE POLICY "Receipts viewable by salon staff" ON public.goods_receipts
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Receipts insertable by salon staff" ON public.goods_receipts;
CREATE POLICY "Receipts insertable by salon staff" ON public.goods_receipts
    FOR INSERT TO authenticated
    WITH CHECK ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Receipt items viewable by salon staff" ON public.goods_receipt_items;
CREATE POLICY "Receipt items viewable by salon staff" ON public.goods_receipt_items
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

-- Purchase Bills & Items Policies (Owner only for financial management)
DROP POLICY IF EXISTS "Bills viewable by salon staff" ON public.purchase_bills;
CREATE POLICY "Bills viewable by salon staff" ON public.purchase_bills
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Bills manageable by owner" ON public.purchase_bills;
CREATE POLICY "Bills manageable by owner" ON public.purchase_bills
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

DROP POLICY IF EXISTS "Bill items viewable by salon staff" ON public.purchase_bill_items;
CREATE POLICY "Bill items viewable by salon staff" ON public.purchase_bill_items
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Bill items manageable by owner" ON public.purchase_bill_items;
CREATE POLICY "Bill items manageable by owner" ON public.purchase_bill_items
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

-- Purchase Returns Policies
DROP POLICY IF EXISTS "Returns viewable by salon staff" ON public.purchase_returns;
CREATE POLICY "Returns viewable by salon staff" ON public.purchase_returns
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner_or_receptionist());

DROP POLICY IF EXISTS "Returns manageable by owner" ON public.purchase_returns;
CREATE POLICY "Returns manageable by owner" ON public.purchase_returns
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

DROP POLICY IF EXISTS "Return items viewable by salon staff" ON public.purchase_return_items;
CREATE POLICY "Return items viewable by salon staff" ON public.purchase_return_items
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

-- Supplier Payments & Ledger: STRICTLY OWNER ONLY
DROP POLICY IF EXISTS "Payments viewable only by owner" ON public.supplier_payments;
CREATE POLICY "Payments viewable only by owner" ON public.supplier_payments
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

DROP POLICY IF EXISTS "Allocations viewable only by owner" ON public.supplier_payment_allocations;
CREATE POLICY "Allocations viewable only by owner" ON public.supplier_payment_allocations
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

DROP POLICY IF EXISTS "Ledger viewable only by owner" ON public.supplier_ledger;
CREATE POLICY "Ledger viewable only by owner" ON public.supplier_ledger
    FOR ALL TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

DROP POLICY IF EXISTS "Purchase audit viewable by owner" ON public.purchase_audit_logs;
CREATE POLICY "Purchase audit viewable by owner" ON public.purchase_audit_logs
    FOR SELECT TO authenticated
    USING ((salon_id = current_user_salon_id() OR current_user_salon_id() IS NULL) AND is_owner());

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ==============================================================================
-- 12. STORED PROCEDURES & ATOMIC RPCS
-- ==============================================================================

-- 12.1 RPC: Create or Update Supplier
CREATE OR REPLACE FUNCTION public.rpc_create_or_update_supplier(
    p_salon_id TEXT,
    p_supplier_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_contact_person TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL,
    p_city TEXT DEFAULT NULL,
    p_state TEXT DEFAULT NULL,
    p_pincode TEXT DEFAULT NULL,
    p_gstin TEXT DEFAULT NULL,
    p_pan TEXT DEFAULT NULL,
    p_category TEXT DEFAULT 'General',
    p_opening_balance NUMERIC DEFAULT 0.00,
    p_status TEXT DEFAULT 'active',
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
    v_target_id UUID;
    v_supplier_code TEXT;
    v_clean_phone TEXT;
    v_clean_gstin TEXT;
    v_existing_id UUID;
    v_running_bal NUMERIC;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can manage supplier profiles';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot manage suppliers for another salon';
        END IF;
    END IF;

    IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Supplier name is required';
    END IF;

    v_clean_phone := trim(COALESCE(p_phone, ''));
    IF length(v_clean_phone) < 7 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: A valid phone number with at least 7 digits is required';
    END IF;

    v_clean_gstin := NULLIF(upper(trim(COALESCE(p_gstin, ''))), '');

    -- Duplicate check on phone within salon
    SELECT id INTO v_existing_id FROM public.suppliers
    WHERE salon_id = p_salon_id AND lower(trim(phone)) = lower(v_clean_phone)
      AND (p_supplier_id IS NULL OR id != p_supplier_id);
    IF FOUND THEN
        RAISE EXCEPTION 'DUPLICATE_SUPPLIER: A supplier with phone % already exists', v_clean_phone;
    END IF;

    -- Duplicate check on GSTIN within salon
    IF v_clean_gstin IS NOT NULL THEN
        SELECT id INTO v_existing_id FROM public.suppliers
        WHERE salon_id = p_salon_id AND upper(trim(gstin)) = v_clean_gstin
          AND (p_supplier_id IS NULL OR id != p_supplier_id);
        IF FOUND THEN
            RAISE EXCEPTION 'DUPLICATE_SUPPLIER: A supplier with GSTIN % already exists', v_clean_gstin;
        END IF;
    END IF;

    IF p_supplier_id IS NOT NULL THEN
        -- UPDATE existing
        UPDATE public.suppliers
        SET name = trim(p_name),
            contact_person = trim(p_contact_person),
            phone = v_clean_phone,
            email = trim(p_email),
            address = trim(p_address),
            city = trim(p_city),
            state = trim(p_state),
            pincode = trim(p_pincode),
            gstin = v_clean_gstin,
            pan = upper(trim(p_pan)),
            category = COALESCE(p_category, 'General'),
            status = COALESCE(p_status, 'active'),
            notes = trim(p_notes),
            updated_at = timezone('utc'::text, now())
        WHERE id = p_supplier_id AND salon_id = p_salon_id
        RETURNING id, supplier_code INTO v_target_id, v_supplier_code;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Supplier % not found in salon %', p_supplier_id, p_salon_id;
        END IF;

        -- Audit log
        INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
        VALUES (p_salon_id, 'SUPPLIER', v_target_id, 'UPDATED', v_caller_user_id, v_caller_role, jsonb_build_object('name', p_name, 'phone', v_clean_phone, 'status', p_status));
    ELSE
        -- CREATE new
        v_supplier_code := 'SUP-' || LPAD(nextval('public.supplier_code_seq')::text, 4, '0');

        INSERT INTO public.suppliers (
            salon_id, supplier_code, name, contact_person, phone, email,
            address, city, state, pincode, gstin, pan, category, opening_balance,
            status, notes, created_by
        ) VALUES (
            p_salon_id, v_supplier_code, trim(p_name), trim(p_contact_person), v_clean_phone, trim(p_email),
            trim(p_address), trim(p_city), trim(p_state), trim(p_pincode), v_clean_gstin, upper(trim(p_pan)),
            COALESCE(p_category, 'General'), COALESCE(p_opening_balance, 0.00),
            COALESCE(p_status, 'active'), trim(p_notes), v_caller_user_id
        ) RETURNING id INTO v_target_id;

        -- Record opening balance in supplier ledger if > 0
        IF COALESCE(p_opening_balance, 0.00) != 0.00 THEN
            INSERT INTO public.supplier_ledger (
                salon_id, supplier_id, transaction_type, transaction_date, reference_id,
                description, debit, credit, running_balance, created_by
            ) VALUES (
                p_salon_id, v_target_id, 'OPENING_BALANCE', CURRENT_DATE, v_supplier_code,
                'Initial Opening Balance',
                CASE WHEN p_opening_balance < 0 THEN abs(p_opening_balance) ELSE 0.00 END,
                CASE WHEN p_opening_balance > 0 THEN p_opening_balance ELSE 0.00 END,
                p_opening_balance,
                v_caller_user_id
            );
        END IF;

        -- Audit log
        INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
        VALUES (p_salon_id, 'SUPPLIER', v_target_id, 'CREATED', v_caller_user_id, v_caller_role, jsonb_build_object('name', p_name, 'supplier_code', v_supplier_code, 'phone', v_clean_phone));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'supplier_id', v_target_id,
        'id', v_target_id,
        'supplier_code', v_supplier_code,
        'name', trim(p_name),
        'phone', v_clean_phone,
        'status', COALESCE(p_status, 'active')
    );
END;
$$;

-- 12.2 RPC: Create Purchase Order (Draft)
CREATE OR REPLACE FUNCTION public.rpc_create_purchase_order(
    p_salon_id TEXT,
    p_supplier_id UUID,
    p_expected_delivery_date DATE DEFAULT NULL,
    p_subtotal NUMERIC DEFAULT 0.00,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_tax_amount NUMERIC DEFAULT 0.00,
    p_cgst_amount NUMERIC DEFAULT 0.00,
    p_sgst_amount NUMERIC DEFAULT 0.00,
    p_igst_amount NUMERIC DEFAULT 0.00,
    p_total_amount NUMERIC DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_terms TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
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
    v_supplier RECORD;
    v_po_num TEXT;
    v_new_po_id UUID;
    v_item RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can create purchase orders';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot create purchase order for another salon';
        END IF;
    END IF;

    -- Verify supplier exists and is active
    SELECT id, name, status INTO v_supplier
    FROM public.suppliers
    WHERE id = p_supplier_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Supplier % not found in salon %', p_supplier_id, p_salon_id;
    END IF;

    IF v_supplier.status != 'active' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Cannot create purchase order for inactive or archived supplier %', v_supplier.name;
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Purchase order must have at least one line item';
    END IF;

    v_po_num := 'PO-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.purchase_order_number_seq')::text, 4, '0');

    INSERT INTO public.purchase_orders (
        salon_id, po_number, supplier_id, order_date, expected_delivery_date,
        status, subtotal, discount_amount, tax_amount, cgst_amount, sgst_amount, igst_amount,
        total_amount, notes, terms_and_conditions, created_by
    ) VALUES (
        p_salon_id, v_po_num, p_supplier_id, CURRENT_DATE, p_expected_delivery_date,
        'draft', p_subtotal, p_discount_amount, p_tax_amount, p_cgst_amount, p_sgst_amount, p_igst_amount,
        p_total_amount, p_notes, p_terms, v_caller_user_id
    ) RETURNING id INTO v_new_po_id;

    -- Insert Items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        item_type TEXT,
        name TEXT,
        sku TEXT,
        unit TEXT,
        ordered_quantity NUMERIC,
        unit_cost NUMERIC,
        discount_amount NUMERIC,
        taxable_amount NUMERIC,
        tax_rate NUMERIC,
        tax_amount NUMERIC,
        total_cost NUMERIC,
        sort_order INTEGER
    )
    LOOP
        INSERT INTO public.purchase_order_items (
            salon_id, po_id, product_id, item_type, name, sku, unit,
            ordered_quantity, received_quantity, unit_cost, discount_amount,
            taxable_amount, tax_rate, tax_amount, total_cost, sort_order
        ) VALUES (
            p_salon_id, v_new_po_id, v_item.product_id, COALESCE(v_item.item_type, 'product'),
            COALESCE(v_item.name, 'Item'), v_item.sku, COALESCE(v_item.unit, 'pcs'),
            COALESCE(v_item.ordered_quantity, 1), 0.000, COALESCE(v_item.unit_cost, 0),
            COALESCE(v_item.discount_amount, 0), COALESCE(v_item.taxable_amount, 0),
            COALESCE(v_item.tax_rate, 0.1800), COALESCE(v_item.tax_amount, 0),
            COALESCE(v_item.total_cost, 0), COALESCE(v_item.sort_order, 0)
        );
    END LOOP;

    -- Audit Log
    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'PO', v_new_po_id, 'CREATED', v_caller_user_id, v_caller_role, jsonb_build_object('po_number', v_po_num, 'total', p_total_amount, 'items_count', jsonb_array_length(p_items)));

    RETURN jsonb_build_object(
        'success', true,
        'po_id', v_new_po_id,
        'id', v_new_po_id,
        'po_number', v_po_num,
        'status', 'draft',
        'total_amount', p_total_amount
    );
END;
$$;

-- 12.3 RPC: Submit Purchase Order
CREATE OR REPLACE FUNCTION public.rpc_submit_purchase_order(
    p_salon_id TEXT,
    p_po_id UUID
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
    v_po RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can submit purchase orders';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot submit purchase order for another salon';
        END IF;
    END IF;

    SELECT id, po_number, status INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Purchase order % not found', p_po_id;
    END IF;

    IF v_po.status != 'draft' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Purchase order % is already in status %', v_po.po_number, v_po.status;
    END IF;

    UPDATE public.purchase_orders
    SET status = 'submitted',
        submitted_at = timezone('utc'::text, now()),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_po_id;

    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'PO', p_po_id, 'SUBMITTED', v_caller_user_id, v_caller_role, jsonb_build_object('po_number', v_po.po_number));

    RETURN jsonb_build_object(
        'success', true,
        'po_id', p_po_id,
        'status', 'submitted'
    );
END;
$$;

-- 12.4 RPC: Cancel Purchase Order
CREATE OR REPLACE FUNCTION public.rpc_cancel_purchase_order(
    p_salon_id TEXT,
    p_po_id UUID,
    p_reason TEXT DEFAULT NULL
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
    v_po RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can cancel purchase orders';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot cancel purchase order for another salon';
        END IF;
    END IF;

    SELECT id, po_number, status INTO v_po
    FROM public.purchase_orders
    WHERE id = p_po_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Purchase order % not found', p_po_id;
    END IF;

    IF v_po.status IN ('cancelled', 'closed', 'fully_received') THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Purchase order % in status % cannot be cancelled', v_po.po_number, v_po.status;
    END IF;

    -- Check if any receipts exist
    IF EXISTS (SELECT 1 FROM public.goods_receipts WHERE po_id = p_po_id) THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Cannot cancel purchase order % because goods receipts have already been recorded', v_po.po_number;
    END IF;

    UPDATE public.purchase_orders
    SET status = 'cancelled',
        cancelled_at = timezone('utc'::text, now()),
        cancellation_reason = trim(p_reason),
        updated_at = timezone('utc'::text, now())
    WHERE id = p_po_id;

    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'PO', p_po_id, 'CANCELLED', v_caller_user_id, v_caller_role, jsonb_build_object('po_number', v_po.po_number, 'reason', p_reason));

    RETURN jsonb_build_object(
        'success', true,
        'po_id', p_po_id,
        'status', 'cancelled'
    );
END;
$$;

-- 12.5 RPC: Record Goods Receipt (Updates Stock with Traceable Movements)
CREATE OR REPLACE FUNCTION public.rpc_record_goods_receipt(
    p_salon_id TEXT,
    p_supplier_id UUID,
    p_po_id UUID DEFAULT NULL,
    p_bill_id UUID DEFAULT NULL,
    p_received_by TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
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
    v_grn_num TEXT;
    v_new_grn_id UUID;
    v_item RECORD;
    v_prod RECORD;
    v_po_item RECORD;
    v_new_stock NUMERIC;
    v_all_po_received BOOLEAN := true;
    v_has_partial BOOLEAN := false;
    v_any_item_received BOOLEAN := false;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role NOT IN ('OWNER', 'RECEPTIONIST') THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners and receptionists can record goods receipts';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record goods receipt for another salon';
        END IF;
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Goods receipt must contain at least one item';
    END IF;

    v_grn_num := 'GRN-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.goods_receipt_number_seq')::text, 4, '0');

    INSERT INTO public.goods_receipts (
        salon_id, grn_number, supplier_id, po_id, bill_id, received_date,
        received_by, notes
    ) VALUES (
        p_salon_id, v_grn_num, p_supplier_id, p_po_id, p_bill_id, CURRENT_DATE,
        COALESCE(trim(p_received_by), v_caller_user_id, 'Staff'), trim(p_notes)
    ) RETURNING id INTO v_new_grn_id;

    -- Process each received item
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        po_item_id UUID,
        product_id UUID,
        ordered_quantity NUMERIC,
        received_quantity NUMERIC,
        accepted_quantity NUMERIC,
        rejected_quantity NUMERIC,
        rejection_reason TEXT,
        unit_cost NUMERIC,
        sort_order INTEGER
    )
    LOOP
        IF v_item.product_id IS NULL THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: Product ID is required for each goods receipt line item';
        END IF;

        -- Verify product exists in salon and lock for update
        SELECT id, name, current_stock, unit INTO v_prod
        FROM public.inventory_products
        WHERE id = v_item.product_id AND salon_id = p_salon_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Product % not found in salon %', v_item.product_id, p_salon_id;
        END IF;

        -- If PO item linked, validate against remaining ordered quantity (prevent over-receipt)
        IF v_item.po_item_id IS NOT NULL THEN
            SELECT id, ordered_quantity, received_quantity INTO v_po_item
            FROM public.purchase_order_items
            WHERE id = v_item.po_item_id AND salon_id = p_salon_id
            FOR UPDATE;

            IF FOUND THEN
                IF (v_po_item.received_quantity + COALESCE(v_item.received_quantity, 0)) > v_po_item.ordered_quantity THEN
                    RAISE EXCEPTION 'OVER_RECEIPT: Total received quantity (%) would exceed ordered quantity (%) for item %',
                        (v_po_item.received_quantity + COALESCE(v_item.received_quantity, 0)),
                        v_po_item.ordered_quantity,
                        v_prod.name;
                END IF;

                -- Update PO item received quantity
                UPDATE public.purchase_order_items
                SET received_quantity = received_quantity + COALESCE(v_item.received_quantity, 0)
                WHERE id = v_item.po_item_id;
            END IF;
        END IF;

        -- Insert goods receipt item
        INSERT INTO public.goods_receipt_items (
            salon_id, receipt_id, po_item_id, product_id, ordered_quantity,
            received_quantity, accepted_quantity, rejected_quantity,
            rejection_reason, unit_cost, sort_order
        ) VALUES (
            p_salon_id, v_new_grn_id, v_item.po_item_id, v_item.product_id,
            COALESCE(v_item.ordered_quantity, 0.000),
            COALESCE(v_item.received_quantity, 0.000),
            COALESCE(v_item.accepted_quantity, 0.000),
            COALESCE(v_item.rejected_quantity, 0.000),
            trim(v_item.rejection_reason),
            COALESCE(v_item.unit_cost, 0.00),
            COALESCE(v_item.sort_order, 0)
        );

        -- Critical stock update: ONLY accepted_quantity increases available inventory!
        IF COALESCE(v_item.accepted_quantity, 0.000) > 0 THEN
            v_new_stock := v_prod.current_stock + v_item.accepted_quantity;

            UPDATE public.inventory_products
            SET current_stock = v_new_stock,
                status = CASE 
                    WHEN v_new_stock <= 0 THEN 'out_of_stock'
                    WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
                    ELSE 'active'
                END,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_item.product_id;

            -- Traceable Stock Movement Audit Record
            INSERT INTO public.inventory_stock_movements (
                salon_id, product_id, movement_type, quantity, previous_stock,
                new_stock, reference_id, notes, created_by
            ) VALUES (
                p_salon_id, v_item.product_id, 'STOCK_RECEIVED', v_item.accepted_quantity,
                v_prod.current_stock, v_new_stock, v_grn_num,
                'Goods receipt via ' || v_grn_num, v_caller_user_id
            );
        END IF;
    END LOOP;

    -- If linked to PO, update PO overall status
    IF p_po_id IS NOT NULL THEN
        FOR v_po_item IN SELECT ordered_quantity, received_quantity FROM public.purchase_order_items WHERE po_id = p_po_id
        LOOP
            IF v_po_item.received_quantity < v_po_item.ordered_quantity THEN
                v_all_po_received := false;
            END IF;
            IF v_po_item.received_quantity > 0 THEN
                v_has_partial := true;
            END IF;
        END LOOP;

        UPDATE public.purchase_orders
        SET status = CASE 
                WHEN v_all_po_received THEN 'fully_received'
                WHEN v_has_partial THEN 'partially_received'
                ELSE status
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = p_po_id;
    END IF;

    -- Audit log
    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'RECEIPT', v_new_grn_id, 'RECORDED', v_caller_user_id, v_caller_role, jsonb_build_object('grn_number', v_grn_num, 'po_id', p_po_id));

    RETURN jsonb_build_object(
        'success', true,
        'receipt_id', v_new_grn_id,
        'id', v_new_grn_id,
        'grn_number', v_grn_num,
        'received_date', CURRENT_DATE
    );
END;
$$;

-- 12.6 RPC: Create Purchase Bill (Supplier Invoice) & Update Supplier Ledger
CREATE OR REPLACE FUNCTION public.rpc_create_purchase_bill(
    p_salon_id TEXT,
    p_supplier_id UUID,
    p_supplier_invoice_number TEXT,
    p_bill_date DATE DEFAULT CURRENT_DATE,
    p_due_date DATE DEFAULT (CURRENT_DATE + 30),
    p_po_id UUID DEFAULT NULL,
    p_subtotal NUMERIC DEFAULT 0.00,
    p_discount_amount NUMERIC DEFAULT 0.00,
    p_tax_amount NUMERIC DEFAULT 0.00,
    p_cgst_amount NUMERIC DEFAULT 0.00,
    p_sgst_amount NUMERIC DEFAULT 0.00,
    p_igst_amount NUMERIC DEFAULT 0.00,
    p_additional_charges NUMERIC DEFAULT 0.00,
    p_total_amount NUMERIC DEFAULT 0.00,
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
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
    v_bill_num TEXT;
    v_new_bill_id UUID;
    v_supplier RECORD;
    v_item RECORD;
    v_current_bal NUMERIC := 0.00;
    v_new_bal NUMERIC;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can create purchase bills';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot create purchase bill for another salon';
        END IF;
    END IF;

    IF p_supplier_invoice_number IS NULL OR length(trim(p_supplier_invoice_number)) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Supplier invoice number is mandatory';
    END IF;

    -- Duplicate check on supplier invoice number
    IF EXISTS (
        SELECT 1 FROM public.purchase_bills
        WHERE salon_id = p_salon_id AND supplier_id = p_supplier_id
          AND lower(trim(supplier_invoice_number)) = lower(trim(p_supplier_invoice_number))
    ) THEN
        RAISE EXCEPTION 'DUPLICATE_INVOICE: Supplier invoice number % already exists for this supplier', p_supplier_invoice_number;
    END IF;

    -- Verify supplier exists
    SELECT id, name, status INTO v_supplier
    FROM public.suppliers
    WHERE id = p_supplier_id AND salon_id = p_salon_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Supplier % not found', p_supplier_id;
    END IF;

    IF v_supplier.status != 'active' THEN
        RAISE EXCEPTION 'INVALID_OPERATION: Cannot create purchase bill for inactive supplier %', v_supplier.name;
    END IF;

    v_bill_num := 'PB-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.purchase_bill_number_seq')::text, 4, '0');

    INSERT INTO public.purchase_bills (
        salon_id, bill_number, supplier_invoice_number, supplier_id, po_id,
        bill_date, due_date, status, subtotal, discount_amount, tax_amount,
        cgst_amount, sgst_amount, igst_amount, additional_charges, total_amount,
        paid_amount, balance_due, notes, created_by
    ) VALUES (
        p_salon_id, v_bill_num, trim(p_supplier_invoice_number), p_supplier_id, p_po_id,
        COALESCE(p_bill_date, CURRENT_DATE), COALESCE(p_due_date, CURRENT_DATE + 30),
        'unpaid', p_subtotal, p_discount_amount, p_tax_amount, p_cgst_amount, p_sgst_amount,
        p_igst_amount, p_additional_charges, p_total_amount, 0.00, p_total_amount,
        trim(p_notes), v_caller_user_id
    ) RETURNING id INTO v_new_bill_id;

    -- Insert items
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        item_type TEXT,
        name TEXT,
        sku TEXT,
        unit TEXT,
        quantity NUMERIC,
        unit_cost NUMERIC,
        discount_amount NUMERIC,
        taxable_amount NUMERIC,
        tax_rate NUMERIC,
        tax_amount NUMERIC,
        total_cost NUMERIC,
        sort_order INTEGER
    )
    LOOP
        INSERT INTO public.purchase_bill_items (
            salon_id, bill_id, product_id, item_type, name, sku, unit,
            quantity, unit_cost, discount_amount, taxable_amount, tax_rate,
            tax_amount, total_cost, sort_order
        ) VALUES (
            p_salon_id, v_new_bill_id, v_item.product_id, COALESCE(v_item.item_type, 'product'),
            COALESCE(v_item.name, 'Item'), v_item.sku, COALESCE(v_item.unit, 'pcs'),
            COALESCE(v_item.quantity, 1), COALESCE(v_item.unit_cost, 0),
            COALESCE(v_item.discount_amount, 0), COALESCE(v_item.taxable_amount, 0),
            COALESCE(v_item.tax_rate, 0.1800), COALESCE(v_item.tax_amount, 0),
            COALESCE(v_item.total_cost, 0), COALESCE(v_item.sort_order, 0)
        );
    END LOOP;

    -- Resolve supplier current running balance
    SELECT running_balance INTO v_current_bal
    FROM public.supplier_ledger
    WHERE salon_id = p_salon_id AND supplier_id = p_supplier_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    v_current_bal := COALESCE(v_current_bal, 0.00);
    v_new_bal := v_current_bal + p_total_amount; -- Credit increases payable

    -- Write to Supplier Ledger
    INSERT INTO public.supplier_ledger (
        salon_id, supplier_id, transaction_type, transaction_date, reference_id,
        description, debit, credit, running_balance, created_by
    ) VALUES (
        p_salon_id, p_supplier_id, 'PURCHASE_BILL', COALESCE(p_bill_date, CURRENT_DATE),
        v_bill_num, 'Purchase Bill ' || v_bill_num || ' (Inv: ' || p_supplier_invoice_number || ')',
        0.00, p_total_amount, v_new_bal, v_caller_user_id
    );

    -- Audit log
    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'BILL', v_new_bill_id, 'CREATED', v_caller_user_id, v_caller_role, jsonb_build_object('bill_number', v_bill_num, 'total', p_total_amount, 'supplier_inv', p_supplier_invoice_number));

    RETURN jsonb_build_object(
        'success', true,
        'bill_id', v_new_bill_id,
        'id', v_new_bill_id,
        'bill_number', v_bill_num,
        'supplier_invoice_number', p_supplier_invoice_number,
        'total_amount', p_total_amount,
        'status', 'unpaid'
    );
END;
$$;

-- 12.7 RPC: Record Purchase Return (Decreases Stock & Debits Supplier Ledger)
CREATE OR REPLACE FUNCTION public.rpc_record_purchase_return(
    p_salon_id TEXT,
    p_supplier_id UUID,
    p_bill_id UUID DEFAULT NULL,
    p_receipt_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'Damaged goods',
    p_notes TEXT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb
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
    v_return_num TEXT;
    v_new_return_id UUID;
    v_item RECORD;
    v_prod RECORD;
    v_total_ret NUMERIC := 0.00;
    v_new_stock NUMERIC;
    v_current_bal NUMERIC := 0.00;
    v_new_bal NUMERIC;
    v_bill RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can authorize purchase returns';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record purchase return for another salon';
        END IF;
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Return must contain at least one item';
    END IF;

    v_return_num := 'PR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.purchase_return_number_seq')::text, 4, '0');

    -- Calculate total return value
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(total_amount NUMERIC)
    LOOP
        v_total_ret := v_total_ret + COALESCE(v_item.total_amount, 0.00);
    END LOOP;

    INSERT INTO public.purchase_returns (
        salon_id, return_number, supplier_id, bill_id, receipt_id, return_date,
        status, total_amount, reason, notes, created_by
    ) VALUES (
        p_salon_id, v_return_num, p_supplier_id, p_bill_id, p_receipt_id, CURRENT_DATE,
        'completed', v_total_ret, trim(p_reason), trim(p_notes), v_caller_user_id
    ) RETURNING id INTO v_new_return_id;

    -- Process items & update stock
    FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
        product_id UUID,
        quantity NUMERIC,
        unit_cost NUMERIC,
        tax_rate NUMERIC,
        tax_amount NUMERIC,
        total_amount NUMERIC,
        reason TEXT,
        sort_order INTEGER
    )
    LOOP
        -- Verify product exists and has sufficient stock
        SELECT id, name, current_stock INTO v_prod
        FROM public.inventory_products
        WHERE id = v_item.product_id AND salon_id = p_salon_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'NOT_FOUND: Product % not found', v_item.product_id;
        END IF;

        IF v_prod.current_stock < v_item.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Cannot return % units of %; current stock is %',
                v_item.quantity, v_prod.name, v_prod.current_stock;
        END IF;

        INSERT INTO public.purchase_return_items (
            salon_id, return_id, product_id, quantity, unit_cost, tax_rate,
            tax_amount, total_amount, reason, sort_order
        ) VALUES (
            p_salon_id, v_new_return_id, v_item.product_id, v_item.quantity,
            COALESCE(v_item.unit_cost, 0), COALESCE(v_item.tax_rate, 0.1800),
            COALESCE(v_item.tax_amount, 0), COALESCE(v_item.total_amount, 0),
            COALESCE(trim(v_item.reason), p_reason), COALESCE(v_item.sort_order, 0)
        );

        -- Decrease stock atomically
        v_new_stock := v_prod.current_stock - v_item.quantity;
        UPDATE public.inventory_products
        SET current_stock = v_new_stock,
            status = CASE 
                WHEN v_new_stock <= 0 THEN 'out_of_stock'
                WHEN v_new_stock <= min_stock_threshold THEN 'low_stock'
                ELSE 'active'
            END,
            updated_at = timezone('utc'::text, now())
        WHERE id = v_item.product_id;

        -- Traceable Stock Movement Audit Record
        INSERT INTO public.inventory_stock_movements (
            salon_id, product_id, movement_type, quantity, previous_stock,
            new_stock, reference_id, notes, created_by
        ) VALUES (
            p_salon_id, v_item.product_id, 'STOCK_RETURN', v_item.quantity,
            v_prod.current_stock, v_new_stock, v_return_num,
            'Purchase return via ' || v_return_num || ': ' || p_reason, v_caller_user_id
        );
    END LOOP;

    -- If linked to a purchase bill, reduce bill balance_due
    IF p_bill_id IS NOT NULL THEN
        SELECT * INTO v_bill FROM public.purchase_bills WHERE id = p_bill_id FOR UPDATE;
        IF FOUND THEN
            UPDATE public.purchase_bills
            SET balance_due = GREATEST(0.00, balance_due - v_total_ret),
                status = CASE WHEN (balance_due - v_total_ret) <= 0.00 THEN 'paid' ELSE status END,
                updated_at = timezone('utc'::text, now())
            WHERE id = p_bill_id;
        END IF;
    END IF;

    -- Update Supplier Ledger (DEBIT reduces payable balance)
    SELECT running_balance INTO v_current_bal
    FROM public.supplier_ledger
    WHERE salon_id = p_salon_id AND supplier_id = p_supplier_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    v_current_bal := COALESCE(v_current_bal, 0.00);
    v_new_bal := v_current_bal - v_total_ret;

    INSERT INTO public.supplier_ledger (
        salon_id, supplier_id, transaction_type, transaction_date, reference_id,
        description, debit, credit, running_balance, created_by
    ) VALUES (
        p_salon_id, p_supplier_id, 'PURCHASE_RETURN', CURRENT_DATE, v_return_num,
        'Purchase Return ' || v_return_num || ' (' || p_reason || ')',
        v_total_ret, 0.00, v_new_bal, v_caller_user_id
    );

    -- Audit log
    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'RETURN', v_new_return_id, 'RECORDED', v_caller_user_id, v_caller_role, jsonb_build_object('return_number', v_return_num, 'total', v_total_ret));

    RETURN jsonb_build_object(
        'success', true,
        'return_id', v_new_return_id,
        'id', v_new_return_id,
        'return_number', v_return_num,
        'total_amount', v_total_ret
    );
END;
$$;

-- 12.8 RPC: Record Supplier Payment & Allocate to Purchase Bills
CREATE OR REPLACE FUNCTION public.rpc_record_supplier_payment(
    p_salon_id TEXT,
    p_supplier_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT DEFAULT 'bank',
    p_transaction_reference TEXT DEFAULT NULL,
    p_is_advance BOOLEAN DEFAULT false,
    p_idempotency_key TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_allocations JSONB DEFAULT '[]'::jsonb
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
    v_payment_num TEXT;
    v_new_payment_id UUID;
    v_alloc RECORD;
    v_bill RECORD;
    v_total_allocated NUMERIC := 0.00;
    v_unallocated NUMERIC := 0.00;
    v_current_bal NUMERIC := 0.00;
    v_new_bal NUMERIC;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can record supplier payments';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot record supplier payment for another salon';
        END IF;
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Payment amount must be greater than zero';
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT id, payment_number INTO v_new_payment_id, v_payment_num
        FROM public.supplier_payments
        WHERE salon_id = p_salon_id AND idempotency_key = trim(p_idempotency_key);

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'payment_id', v_new_payment_id,
                'payment_number', v_payment_num,
                'message', 'Payment already recorded (idempotent)'
            );
        END IF;
    END IF;

    v_payment_num := 'SPAY-' || to_char(CURRENT_DATE, 'YYYY') || '-' || LPAD(nextval('public.supplier_payment_number_seq')::text, 4, '0');

    -- Insert payment header
    INSERT INTO public.supplier_payments (
        salon_id, payment_number, supplier_id, amount, payment_date,
        payment_method, transaction_reference, allocated_amount,
        unallocated_amount, is_advance, idempotency_key, notes, created_by
    ) VALUES (
        p_salon_id, v_payment_num, p_supplier_id, p_amount, CURRENT_DATE,
        COALESCE(p_payment_method, 'bank'), trim(p_transaction_reference),
        0.00, p_amount, COALESCE(p_is_advance, false),
        NULLIF(trim(p_idempotency_key), ''), trim(p_notes), v_caller_user_id
    ) RETURNING id INTO v_new_payment_id;

    -- Process allocations
    IF jsonb_array_length(p_allocations) > 0 THEN
        FOR v_alloc IN SELECT * FROM jsonb_to_recordset(p_allocations) AS x(
            bill_id UUID,
            amount NUMERIC
        )
        LOOP
            IF v_alloc.amount <= 0 THEN
                CONTINUE;
            END IF;

            SELECT * INTO v_bill
            FROM public.purchase_bills
            WHERE id = v_alloc.bill_id AND salon_id = p_salon_id AND supplier_id = p_supplier_id
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'NOT_FOUND: Purchase bill % not found for supplier', v_alloc.bill_id;
            END IF;

            IF v_alloc.amount > v_bill.balance_due THEN
                RAISE EXCEPTION 'OVER_ALLOCATION: Allocation amount (%) exceeds bill balance due (%) for bill %',
                    v_alloc.amount, v_bill.balance_due, v_bill.bill_number;
            END IF;

            IF (v_total_allocated + v_alloc.amount) > p_amount THEN
                RAISE EXCEPTION 'OVER_ALLOCATION: Total allocated amount exceeds payment amount (%)', p_amount;
            END IF;

            INSERT INTO public.supplier_payment_allocations (
                salon_id, payment_id, bill_id, amount
            ) VALUES (
                p_salon_id, v_new_payment_id, v_alloc.bill_id, v_alloc.amount
            );

            UPDATE public.purchase_bills
            SET paid_amount = paid_amount + v_alloc.amount,
                balance_due = balance_due - v_alloc.amount,
                status = CASE WHEN (balance_due - v_alloc.amount) <= 0.00 THEN 'paid' ELSE 'partially_paid' END,
                updated_at = timezone('utc'::text, now())
            WHERE id = v_alloc.bill_id;

            v_total_allocated := v_total_allocated + v_alloc.amount;
        END LOOP;
    END IF;

    v_unallocated := p_amount - v_total_allocated;

    UPDATE public.supplier_payments
    SET allocated_amount = v_total_allocated,
        unallocated_amount = v_unallocated
    WHERE id = v_new_payment_id;

    -- Write to Supplier Ledger (DEBIT reduces payable balance)
    SELECT running_balance INTO v_current_bal
    FROM public.supplier_ledger
    WHERE salon_id = p_salon_id AND supplier_id = p_supplier_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;

    v_current_bal := COALESCE(v_current_bal, 0.00);
    v_new_bal := v_current_bal - p_amount;

    INSERT INTO public.supplier_ledger (
        salon_id, supplier_id, transaction_type, transaction_date, reference_id,
        description, debit, credit, running_balance, created_by
    ) VALUES (
        p_salon_id, p_supplier_id,
        CASE WHEN p_is_advance THEN 'SUPPLIER_ADVANCE' ELSE 'SUPPLIER_PAYMENT' END,
        CURRENT_DATE, v_payment_num,
        'Payment ' || v_payment_num || ' (' || upper(p_payment_method) || ')',
        p_amount, 0.00, v_new_bal, v_caller_user_id
    );

    -- Audit log
    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'PAYMENT', v_new_payment_id, 'RECORDED', v_caller_user_id, v_caller_role, jsonb_build_object('payment_number', v_payment_num, 'amount', p_amount, 'allocated', v_total_allocated));

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_new_payment_id,
        'id', v_new_payment_id,
        'payment_number', v_payment_num,
        'amount', p_amount,
        'allocated_amount', v_total_allocated,
        'unallocated_amount', v_unallocated
    );
END;
$$;

-- 12.9 RPC: Allocate Supplier Advance
CREATE OR REPLACE FUNCTION public.rpc_allocate_supplier_advance(
    p_salon_id TEXT,
    p_payment_id UUID,
    p_bill_id UUID,
    p_amount NUMERIC
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
    v_pmt RECORD;
    v_bill RECORD;
BEGIN
    v_caller_auth := NULLIF(current_setting('request.jwt.claim.sub', true), '');
    IF v_caller_auth IS NOT NULL THEN
        SELECT id, salon_id, role INTO v_caller_user_id, v_caller_salon, v_caller_role
        FROM public.users
        WHERE (auth_user_id::text = v_caller_auth OR id = v_caller_auth);

        IF v_caller_role IS NOT NULL AND v_caller_role != 'OWNER' THEN
            RAISE EXCEPTION 'PERMISSION_DENIED: Only owners can allocate supplier advances';
        END IF;

        IF v_caller_salon IS NOT NULL AND v_caller_salon != p_salon_id THEN
            RAISE EXCEPTION 'TENANT_VIOLATION: Cannot allocate advance for another salon';
        END IF;
    END IF;

    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Allocation amount must be positive';
    END IF;

    SELECT * INTO v_pmt
    FROM public.supplier_payments
    WHERE id = p_payment_id AND salon_id = p_salon_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Supplier payment % not found', p_payment_id;
    END IF;

    IF v_pmt.unallocated_amount < p_amount THEN
        RAISE EXCEPTION 'OVER_ALLOCATION: Allocation amount (%) exceeds unallocated advance (%)',
            p_amount, v_pmt.unallocated_amount;
    END IF;

    SELECT * INTO v_bill
    FROM public.purchase_bills
    WHERE id = p_bill_id AND salon_id = p_salon_id AND supplier_id = v_pmt.supplier_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_FOUND: Purchase bill % not found for this supplier', p_bill_id;
    END IF;

    IF p_amount > v_bill.balance_due THEN
        RAISE EXCEPTION 'OVER_ALLOCATION: Allocation amount (%) exceeds bill balance due (%)',
            p_amount, v_bill.balance_due;
    END IF;

    INSERT INTO public.supplier_payment_allocations (
        salon_id, payment_id, bill_id, amount
    ) VALUES (
        p_salon_id, p_payment_id, p_bill_id, p_amount
    );

    UPDATE public.supplier_payments
    SET allocated_amount = allocated_amount + p_amount,
        unallocated_amount = unallocated_amount - p_amount
    WHERE id = p_payment_id;

    UPDATE public.purchase_bills
    SET paid_amount = paid_amount + p_amount,
        balance_due = balance_due - p_amount,
        status = CASE WHEN (balance_due - p_amount) <= 0.00 THEN 'paid' ELSE 'partially_paid' END,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_bill_id;

    INSERT INTO public.purchase_audit_logs (salon_id, entity_type, entity_id, action, actor_id, actor_role, details)
    VALUES (p_salon_id, 'PAYMENT', p_payment_id, 'ALLOCATED', v_caller_user_id, v_caller_role, jsonb_build_object('bill_id', p_bill_id, 'amount', p_amount));

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'bill_id', p_bill_id,
        'allocated_amount', p_amount,
        'remaining_advance', (v_pmt.unallocated_amount - p_amount)
    );
END;
$$;

COMMIT;

