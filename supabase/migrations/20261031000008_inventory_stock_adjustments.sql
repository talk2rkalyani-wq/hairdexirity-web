-- ==============================================================================
-- Luma Salon — Migration 000008: Manual Stock Adjustments RPC & Archival Support
-- Phase 6: Inventory Management & Reconciliation
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TRANSACTIONAL RPC: rpc_adjust_inventory_stock
-- Atomically adjusts product stock and logs an immutable movement audit row.
-- Enforces row-level pessimistic locking (FOR UPDATE) to prevent concurrency anomalies.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_adjust_inventory_stock(
    p_salon_id TEXT,
    p_product_id UUID,
    p_adjustment_type TEXT,
    p_quantity NUMERIC,
    p_notes TEXT,
    p_user_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_salon TEXT;
    v_user_id TEXT;
    v_product public.inventory_products;
    v_old_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
    v_new_status TEXT;
    v_movement_id UUID;
    v_now TIMESTAMPTZ := timezone('utc'::text, now());
BEGIN
    -- 1. STRICT AUTHENTICATION & AUTHORIZATION PRE-CHECKS
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Access denied: Caller is unauthenticated.';
    END IF;

    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NULL THEN
        RAISE EXCEPTION 'Access denied: Caller has no active salon association.';
    END IF;

    IF v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Access denied: Cannot adjust inventory for another salon.';
    END IF;

    IF NOT public.is_owner_or_receptionist() THEN
        RAISE EXCEPTION 'Access denied: Only Salon Owners and Receptionists can adjust stock.';
    END IF;

    -- Derive trusted user identity from auth.uid()
    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;

    IF v_user_id IS NULL THEN
        v_user_id := auth.uid()::text;
    END IF;

    -- 2. INPUT VALIDATION
    IF p_adjustment_type NOT IN ('STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT', 'STOCK_RETURN') THEN
        RAISE EXCEPTION 'Invalid adjustment type: "%". Allowed types: STOCK_ADJUSTMENT_IN, STOCK_ADJUSTMENT_OUT, STOCK_RETURN.', p_adjustment_type;
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Adjustment quantity must be greater than zero.';
    END IF;

    IF p_notes IS NULL OR length(trim(p_notes)) < 5 THEN
        RAISE EXCEPTION 'Adjustment reason/notes are required and must be at least 5 characters.';
    END IF;

    -- 3. ACQUIRE PESSIMISTIC ROW LOCK (Prevent concurrent race conditions)
    SELECT * INTO v_product
    FROM public.inventory_products
    WHERE salon_id = p_salon_id AND id = p_product_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Product with ID "%" not found in salon catalog.', p_product_id;
    END IF;

    IF v_product.status = 'archived' THEN
        RAISE EXCEPTION 'Cannot adjust stock for archived product "%". Unarchive product first.', v_product.name;
    END IF;

    v_old_stock := v_product.current_stock;

    -- 4. CALCULATE NEW STOCK QUANTITY
    IF p_adjustment_type = 'STOCK_ADJUSTMENT_IN' OR p_adjustment_type = 'STOCK_RETURN' THEN
        v_new_stock := v_old_stock + p_quantity;
    ELSIF p_adjustment_type = 'STOCK_ADJUSTMENT_OUT' THEN
        IF v_old_stock < p_quantity THEN
            RAISE EXCEPTION 'Insufficient stock: Cannot deduct % units from current stock of % %.', 
                p_quantity, v_old_stock, v_product.unit;
        END IF;
        v_new_stock := v_old_stock - p_quantity;
    END IF;

    -- 5. RECALCULATE PRODUCT STATUS
    IF v_new_stock <= 0 THEN
        v_new_status := 'out_of_stock';
    ELSIF v_new_stock <= v_product.min_stock_threshold THEN
        v_new_status := 'low_stock';
    ELSIF v_product.status = 'inactive' THEN
        v_new_status := 'inactive';
    ELSE
        v_new_status := 'active';
    END IF;

    -- 6. UPDATE PRODUCT TABLE
    UPDATE public.inventory_products
    SET current_stock = v_new_stock,
        status = v_new_status,
        updated_at = v_now,
        updated_by = v_user_id
    WHERE id = v_product.id;

    -- 7. INSERT AUDIT MOVEMENT RECORD
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
        p_adjustment_type,
        p_quantity,
        v_old_stock,
        v_new_stock,
        'ADJ-' || upper(substr(md5(random()::text), 1, 8)),
        trim(p_notes),
        v_user_id,
        v_now
    )
    RETURNING id INTO v_movement_id;

    -- 8. RETURN RESPONSE PAYLOAD
    RETURN jsonb_build_object(
        'success', true,
        'productId', v_product.id,
        'productName', v_product.name,
        'movementId', v_movement_id,
        'adjustmentType', p_adjustment_type,
        'quantity', p_quantity,
        'previousStock', v_old_stock,
        'newStock', v_new_stock,
        'status', v_new_status,
        'adjustedAt', v_now
    );
END;
$$;

-- Revoke public execution privileges; grant strictly to authenticated role
REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_adjust_inventory_stock TO authenticated;

COMMIT;

