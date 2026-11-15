-- Migration: 20261115000026_consumable_usage_and_inventory_rpcs.sql
-- Description: Sets up sequences, tables, constraints, and RPC function rpc_record_consumable_usage
-- for recording consumable usage in salon services and internal operations.

-- ==============================================================================
-- 1. SEQUENCES & CONSTRAINTS
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS public.consumable_usage_number_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS public.stock_loss_number_seq START WITH 1 INCREMENT BY 1;

-- Extend inventory_products table
ALTER TABLE public.inventory_products
ADD COLUMN IF NOT EXISTS reorder_level NUMERIC(12,3) NOT NULL DEFAULT 10.000,
ADD COLUMN IF NOT EXISTS max_stock_threshold NUMERIC(12,3) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS reserved_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
ADD COLUMN IF NOT EXISTS is_batch_tracked BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS weighted_average_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'retail';

-- Extend inventory_stock_movements table
ALTER TABLE public.inventory_stock_movements 
DROP CONSTRAINT IF EXISTS inventory_stock_movements_movement_type_check;

ALTER TABLE public.inventory_stock_movements
ADD COLUMN IF NOT EXISTS batch_id UUID DEFAULT NULL,
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS total_cost NUMERIC(12,4) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS source_document TEXT DEFAULT NULL;

ALTER TABLE public.inventory_stock_movements
ADD CONSTRAINT inventory_stock_movements_movement_type_check
CHECK (movement_type IN (
    'OPENING_STOCK', 'STOCK_RECEIVED', 'PURCHASE_RECEIPT', 'STOCK_ADJUSTMENT_IN',
    'STOCK_ADJUSTMENT_OUT', 'STOCK_RETURN', 'PURCHASE_RETURN', 'SALE_DEDUCTION',
    'CONSUMABLE_USAGE', 'DAMAGE', 'EXPIRY', 'WASTAGE', 'CUSTOMER_RETURN', 'STOCK_TRANSFER'
));

-- ==============================================================================
-- 2. INVENTORY SETTINGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_settings (
    salon_id TEXT PRIMARY KEY REFERENCES public.salons(id) ON DELETE CASCADE,
    allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
    cost_flow_method TEXT NOT NULL DEFAULT 'WAC' CHECK (cost_flow_method IN ('FIFO', 'LIFO', 'WAC')),
    low_stock_buffer_days INTEGER NOT NULL DEFAULT 30 CHECK (low_stock_buffer_days > 0),
    auto_reorder_threshold_value NUMERIC(12,2) NOT NULL DEFAULT 2000.00 CHECK (auto_reorder_threshold_value >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

INSERT INTO public.inventory_settings (salon_id, allow_negative_stock, cost_flow_method, low_stock_buffer_days, auto_reorder_threshold_value)
VALUES ('salon-luma-01', false, 'WAC', 30, 2000.00)
ON CONFLICT (salon_id) DO NOTHING;

-- ==============================================================================
-- 3. INVENTORY BATCHES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    batch_number TEXT NOT NULL,
    supplier_id UUID,
    goods_receipt_id UUID,
    purchase_bill_id UUID,
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

ALTER TABLE public.inventory_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inventory batches viewable by salon staff" ON public.inventory_batches;
CREATE POLICY "Inventory batches viewable by salon staff"
    ON public.inventory_batches FOR SELECT TO authenticated
    USING (salon_id = public.current_user_salon_id() OR public.is_owner_or_receptionist());

DROP POLICY IF EXISTS "Inventory batches modifiable by salon staff" ON public.inventory_batches;
CREATE POLICY "Inventory batches modifiable by salon staff"
    ON public.inventory_batches FOR ALL TO authenticated
    USING (salon_id = public.current_user_salon_id() OR public.is_owner_or_receptionist())
    WITH CHECK (salon_id = public.current_user_salon_id() OR public.is_owner_or_receptionist());

-- ==============================================================================
-- 4. CONSUMABLE USAGES TABLE
-- ==============================================================================
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

ALTER TABLE public.consumable_usages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consumable usages viewable by salon staff" ON public.consumable_usages;
CREATE POLICY "Consumable usages viewable by salon staff"
    ON public.consumable_usages FOR SELECT TO authenticated
    USING (salon_id = public.current_user_salon_id() OR public.is_owner_or_receptionist());

DROP POLICY IF EXISTS "Consumable usages insertable by salon staff" ON public.consumable_usages;
CREATE POLICY "Consumable usages insertable by salon staff"
    ON public.consumable_usages FOR INSERT TO authenticated
    WITH CHECK (salon_id = public.current_user_salon_id() OR public.is_owner_or_receptionist());

-- ==============================================================================
-- 5. FUNCTION: public.rpc_record_consumable_usage
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

        IF FOUND THEN
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
    END IF;

    v_new_stock := v_prod.current_stock - p_quantity;
    v_unit := COALESCE(trim(p_unit), v_prod.unit);
    v_cost := COALESCE(NULLIF(v_prod.purchase_price, 0), 0);
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

GRANT EXECUTE ON FUNCTION public.rpc_record_consumable_usage TO authenticated, anon;

-- ==============================================================================
-- 6. RELOAD SCHEMA CACHE
-- ==============================================================================
NOTIFY pgrst, 'reload schema';
