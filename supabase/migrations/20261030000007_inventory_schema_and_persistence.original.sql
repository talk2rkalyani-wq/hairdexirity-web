-- ==============================================================================
-- Luma Salon — Migration 000007: Product Inventory Schema, Stock Movements & Persistence
-- Phase 5: Supabase Database Foundation & Transactional Persistence
-- ==============================================================================
-- STRICT BOUNDARY:
-- This migration is prepared locally for review and testing.
-- DO NOT apply remotely to the live production database until authorized.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.inventory_products
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    brand TEXT NOT NULL,
    description TEXT,
    barcode TEXT,
    sku TEXT NOT NULL,
    unit TEXT NOT NULL,
    purchase_price NUMERIC(12, 2) NOT NULL CHECK (purchase_price >= 0),
    selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000 CHECK (current_stock >= 0),
    min_stock_threshold NUMERIC(12, 3) NOT NULL DEFAULT 5.000 CHECK (min_stock_threshold >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'low_stock', 'out_of_stock')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_by TEXT,
    updated_by TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_products_salon_id 
    ON public.inventory_products(salon_id);

CREATE INDEX IF NOT EXISTS idx_inventory_products_category 
    ON public.inventory_products(salon_id, category);

CREATE INDEX IF NOT EXISTS idx_inventory_products_status 
    ON public.inventory_products(salon_id, status);

CREATE INDEX IF NOT EXISTS idx_inventory_products_brand 
    ON public.inventory_products(salon_id, brand);

-- Multi-Tenant Uniqueness Rules (Scoped per Salon)
-- A non-empty barcode must be unique within its salon
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_salon_barcode_unique
    ON public.inventory_products (salon_id, lower(trim(barcode)))
    WHERE barcode IS NOT NULL AND trim(barcode) <> '';

-- A non-empty SKU must be unique within its salon
CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_products_salon_sku_unique
    ON public.inventory_products (salon_id, lower(trim(sku)))
    WHERE sku IS NOT NULL AND trim(sku) <> '';


-- ==============================================================================
-- 2. TABLE: public.inventory_stock_movements (Audit Trail)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.inventory_products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK (
        movement_type IN (
            'OPENING_STOCK',
            'STOCK_RECEIVED',
            'STOCK_ADJUSTMENT_IN',
            'STOCK_ADJUSTMENT_OUT',
            'STOCK_RETURN'
        )
    ),
    quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    previous_stock NUMERIC(12, 3) NOT NULL CHECK (previous_stock >= 0),
    new_stock NUMERIC(12, 3) NOT NULL CHECK (new_stock >= 0),
    reference_id TEXT, -- Batch idempotency key, intake session ID, or order ref
    notes TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_salon_id 
    ON public.inventory_stock_movements(salon_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id 
    ON public.inventory_stock_movements(product_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_reference_id 
    ON public.inventory_stock_movements(reference_id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at 
    ON public.inventory_stock_movements(created_at DESC);


-- ==============================================================================
-- 3. TABLE: public.inventory_batch_commits (Idempotency Key Store)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_batch_commits (
    idempotency_key TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    committed_items_count INTEGER NOT NULL CHECK (committed_items_count >= 0),
    total_units NUMERIC(12, 3) NOT NULL CHECK (total_units >= 0),
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_batch_commits_salon_id 
    ON public.inventory_batch_commits(salon_id);


-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_stock_movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory_batch_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batch_commits FORCE ROW LEVEL SECURITY;

-- Revoke anon/PUBLIC privileges
REVOKE ALL ON public.inventory_products FROM PUBLIC, anon;
REVOKE ALL ON public.inventory_stock_movements FROM PUBLIC, anon;
REVOKE ALL ON public.inventory_batch_commits FROM PUBLIC, anon;

-- Grant standard DML to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_products TO authenticated;
GRANT SELECT, INSERT ON public.inventory_stock_movements TO authenticated;
GRANT SELECT, INSERT ON public.inventory_batch_commits TO authenticated;

-- Policies for public.inventory_products
DROP POLICY IF EXISTS "Inventory products viewable by authorized salon staff" ON public.inventory_products;
CREATE POLICY "Inventory products viewable by authorized salon staff"
    ON public.inventory_products FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Inventory products insertable by authorized salon staff" ON public.inventory_products;
CREATE POLICY "Inventory products insertable by authorized salon staff"
    ON public.inventory_products FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Inventory products updatable by authorized salon staff" ON public.inventory_products;
CREATE POLICY "Inventory products updatable by authorized salon staff"
    ON public.inventory_products FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Inventory products deletable only by salon owner" ON public.inventory_products;
CREATE POLICY "Inventory products deletable only by salon owner"
    ON public.inventory_products FOR DELETE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

-- Policies for public.inventory_stock_movements
DROP POLICY IF EXISTS "Stock movements viewable by authorized salon staff" ON public.inventory_stock_movements;
CREATE POLICY "Stock movements viewable by authorized salon staff"
    ON public.inventory_stock_movements FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Stock movements insertable by authorized salon staff" ON public.inventory_stock_movements;
CREATE POLICY "Stock movements insertable by authorized salon staff"
    ON public.inventory_stock_movements FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

-- Policies for public.inventory_batch_commits
DROP POLICY IF EXISTS "Batch commits viewable by authorized salon staff" ON public.inventory_batch_commits;
CREATE POLICY "Batch commits viewable by authorized salon staff"
    ON public.inventory_batch_commits FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Batch commits insertable by authorized salon staff" ON public.inventory_batch_commits;
CREATE POLICY "Batch commits insertable by authorized salon staff"
    ON public.inventory_batch_commits FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );


-- ==============================================================================
-- 5. RPC: rpc_create_inventory_product_with_opening_stock
-- Transactionally creates product and records opening stock movement in one atomic step.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_create_inventory_product_with_opening_stock(
    p_salon_id TEXT,
    p_name TEXT,
    p_brand TEXT,
    p_category TEXT,
    p_subcategory TEXT,
    p_description TEXT,
    p_unit TEXT,
    p_barcode TEXT,
    p_sku TEXT,
    p_purchase_price NUMERIC,
    p_selling_price NUMERIC,
    p_opening_stock NUMERIC,
    p_min_stock_threshold NUMERIC,
    p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_new_product public.inventory_products;
    v_status TEXT;
    v_clean_barcode TEXT := NULLIF(trim(p_barcode), '');
    v_clean_sku TEXT := trim(p_sku);
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. Authorization checks
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Access denied: Cannot create inventory for another salon.';
    END IF;

    IF NOT public.is_owner_or_receptionist() AND v_caller_salon IS NOT NULL THEN
        RAISE EXCEPTION 'Access denied: Only Salon Owners and Receptionists can create inventory.';
    END IF;

    -- 2. Input validation
    IF trim(p_name) IS NULL OR trim(p_name) = '' THEN
        RAISE EXCEPTION 'Product name is required.';
    END IF;

    IF trim(p_brand) IS NULL OR trim(p_brand) = '' THEN
        RAISE EXCEPTION 'Brand name is required.';
    END IF;

    IF p_purchase_price < 0 THEN
        RAISE EXCEPTION 'Purchase price cannot be negative.';
    END IF;

    IF p_selling_price < 0 THEN
        RAISE EXCEPTION 'Selling price cannot be negative.';
    END IF;

    IF p_opening_stock < 0 THEN
        RAISE EXCEPTION 'Opening stock cannot be negative.';
    END IF;

    -- 3. Calculate status
    IF p_opening_stock <= 0 THEN
        v_status := 'out_of_stock';
    ELSIF p_opening_stock <= p_min_stock_threshold THEN
        v_status := 'low_stock';
    ELSE
        v_status := 'active';
    END IF;

    -- 4. Insert product
    INSERT INTO public.inventory_products (
        salon_id,
        name,
        brand,
        category,
        subcategory,
        description,
        unit,
        barcode,
        sku,
        purchase_price,
        selling_price,
        current_stock,
        min_stock_threshold,
        status,
        created_at,
        updated_at,
        created_by,
        updated_by
    ) VALUES (
        p_salon_id,
        trim(p_name),
        trim(p_brand),
        p_category,
        NULLIF(trim(p_subcategory), ''),
        NULLIF(trim(p_description), ''),
        p_unit,
        v_clean_barcode,
        v_clean_sku,
        p_purchase_price,
        p_selling_price,
        p_opening_stock,
        COALESCE(p_min_stock_threshold, 5.000),
        v_status,
        v_now,
        v_now,
        p_user_id,
        p_user_id
    )
    RETURNING * INTO v_new_product;

    -- 5. Record Opening Stock Movement if quantity > 0
    IF p_opening_stock > 0 THEN
        INSERT INTO public.inventory_stock_movements (
            salon_id,
            product_id,
            movement_type,
            quantity,
            previous_stock,
            new_stock,
            reference_id,
            notes,
            created_by,
            created_at
        ) VALUES (
            p_salon_id,
            v_new_product.id,
            'OPENING_STOCK',
            p_opening_stock,
            0.000,
            p_opening_stock,
            'OPENING-' || v_new_product.id::text,
            'Initial opening stock registered during product creation.',
            p_user_id,
            v_now
        );
    END IF;

    RETURN to_jsonb(v_new_product);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_create_inventory_product_with_opening_stock FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_inventory_product_with_opening_stock TO authenticated;


-- ==============================================================================
-- 6. RPC: rpc_commit_inventory_intake_batch
-- Atomically processes an entire scanned intake batch with idempotency key protection.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_commit_inventory_intake_batch(
    p_salon_id TEXT,
    p_idempotency_key TEXT,
    p_items JSONB,
    p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_existing_commit public.inventory_batch_commits;
    v_item JSONB;
    v_item_barcode TEXT;
    v_item_sku TEXT;
    v_item_id TEXT;
    v_item_qty NUMERIC(12, 3);
    v_item_is_new BOOLEAN;
    v_product public.inventory_products;
    v_old_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
    v_status TEXT;
    v_committed_count INTEGER := 0;
    v_total_units NUMERIC(12, 3) := 0.000;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
    v_result_payload JSONB;
BEGIN
    -- 1. Idempotency Check: Return existing result immediately if already committed
    SELECT * INTO v_existing_commit
    FROM public.inventory_batch_commits
    WHERE idempotency_key = p_idempotency_key AND salon_id = p_salon_id;

    IF FOUND THEN
        RETURN v_existing_commit.response_payload;
    END IF;

    -- 2. Authorization checks
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Access denied: Cannot commit batch for another salon.';
    END IF;

    IF NOT public.is_owner_or_receptionist() AND v_caller_salon IS NOT NULL THEN
        RAISE EXCEPTION 'Access denied: Only Salon Owners and Receptionists can commit inventory batches.';
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Batch items array cannot be empty.';
    END IF;

    -- 3. Process each item atomically
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_barcode := NULLIF(trim(v_item->>'barcode'), '');
        v_item_sku := trim(v_item->>'sku');
        v_item_id := v_item->>'id';
        v_item_qty := COALESCE((v_item->>'quantity')::numeric, 1.000);
        v_item_is_new := COALESCE((v_item->>'isNewProduct')::boolean, false);

        IF v_item_qty <= 0 THEN
            RAISE EXCEPTION 'Item intake quantity must be greater than zero.';
        END IF;

        IF NOT v_item_is_new THEN
            -- A. Existing Product: Lock row for update to prevent concurrent race conditions
            SELECT * INTO v_product
            FROM public.inventory_products
            WHERE salon_id = p_salon_id
              AND (
                  (v_item_id ~ '^[0-9a-fA-F-]{36}$' AND id = v_item_id::uuid)
                  OR (v_item_barcode IS NOT NULL AND lower(trim(barcode)) = lower(v_item_barcode))
                  OR (v_item_sku IS NOT NULL AND lower(trim(sku)) = lower(v_item_sku))
              )
            FOR UPDATE;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Product with barcode % not found in salon catalog.', v_item_barcode;
            END IF;

            v_old_stock := v_product.current_stock;
            v_new_stock := v_old_stock + v_item_qty;

            IF v_new_stock <= 0 THEN
                v_status := 'out_of_stock';
            ELSIF v_new_stock <= v_product.min_stock_threshold THEN
                v_status := 'low_stock';
            ELSE
                v_status := 'active';
            END IF;

            -- Update product stock
            UPDATE public.inventory_products
            SET current_stock = v_new_stock,
                status = v_status,
                updated_at = v_now,
                updated_by = p_user_id
            WHERE id = v_product.id;

            -- Record stock movement
            INSERT INTO public.inventory_stock_movements (
                salon_id,
                product_id,
                movement_type,
                quantity,
                previous_stock,
                new_stock,
                reference_id,
                notes,
                created_by,
                created_at
            ) VALUES (
                p_salon_id,
                v_product.id,
                'STOCK_RECEIVED',
                v_item_qty,
                v_old_stock,
                v_new_stock,
                p_idempotency_key,
                'Live barcode scanner intake batch.',
                p_user_id,
                v_now
            );

        ELSE
            -- B. New Product: Insert product and record opening stock
            IF v_item_qty <= 0 THEN
                v_status := 'out_of_stock';
            ELSIF v_item_qty <= COALESCE((v_item->>'minStockThreshold')::numeric, 5.000) THEN
                v_status := 'low_stock';
            ELSE
                v_status := 'active';
            END IF;

            INSERT INTO public.inventory_products (
                salon_id,
                name,
                brand,
                category,
                subcategory,
                description,
                unit,
                barcode,
                sku,
                purchase_price,
                selling_price,
                current_stock,
                min_stock_threshold,
                status,
                created_at,
                updated_at,
                created_by,
                updated_by
            ) VALUES (
                p_salon_id,
                trim(v_item->>'name'),
                trim(v_item->>'brand'),
                v_item->>'category',
                NULLIF(trim(v_item->>'subcategory'), ''),
                NULLIF(trim(v_item->>'description'), ''),
                COALESCE(v_item->>'unit', 'bottle'),
                v_item_barcode,
                COALESCE(v_item_sku, 'SKU-' || substr(md5(random()::text), 1, 8)),
                COALESCE((v_item->>'purchasePrice')::numeric, 0.00),
                COALESCE((v_item->>'sellingPrice')::numeric, 0.00),
                v_item_qty,
                COALESCE((v_item->>'minStockThreshold')::numeric, 5.000),
                v_status,
                v_now,
                v_now,
                p_user_id,
                p_user_id
            )
            RETURNING * INTO v_product;

            -- Record opening stock movement
            INSERT INTO public.inventory_stock_movements (
                salon_id,
                product_id,
                movement_type,
                quantity,
                previous_stock,
                new_stock,
                reference_id,
                notes,
                created_by,
                created_at
            ) VALUES (
                p_salon_id,
                v_product.id,
                'OPENING_STOCK',
                v_item_qty,
                0.000,
                v_item_qty,
                p_idempotency_key,
                'New product intake via Live scanner batch.',
                p_user_id,
                v_now
            );
        END IF;

        v_committed_count := v_committed_count + 1;
        v_total_units := v_total_units + v_item_qty;
    END LOOP;

    -- 4. Construct response payload
    v_result_payload := jsonb_build_object(
        'success', true,
        'idempotencyKey', p_idempotency_key,
        'salonId', p_salon_id,
        'committedCount', v_committed_count,
        'totalUnits', v_total_units,
        'committedAt', v_now
    );

    -- 5. Record batch commit for future idempotency checks
    INSERT INTO public.inventory_batch_commits (
        idempotency_key,
        salon_id,
        committed_items_count,
        total_units,
        response_payload,
        created_by,
        created_at
    ) VALUES (
        p_idempotency_key,
        p_salon_id,
        v_committed_count,
        v_total_units,
        v_result_payload,
        p_user_id,
        v_now
    );

    RETURN v_result_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rpc_commit_inventory_intake_batch FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_commit_inventory_intake_batch TO authenticated;

COMMIT;

