-- ==============================================================================
-- Luma Salon — Rollback Script for Migration 000007 (Hardened Phase 5.3)
-- ==============================================================================
-- CAUTION / CRITICAL SAFETY GUARD:
-- This script permanently drops the inventory schema, product catalog records,
-- stock movement audit histories, and batch commit records.
--
-- DO NOT EXECUTE THIS SCRIPT if the inventory system has been used in production!
-- 
-- AUTOMATIC SAFETY INTERLOCK:
-- This script will abort automatically if public.inventory_products,
-- public.inventory_stock_movements, or public.inventory_batch_commits contain
-- any records, unless the explicit session override variable
-- `luma.allow_destructive_inventory_rollback` is set to 'true'.
--
-- Existing core salon tables (salons, staff, users, services, clients, appointments)
-- are untouched and preserved.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_prod_count INT := 0;
    v_mov_count INT := 0;
    v_batch_count INT := 0;
    v_override TEXT := current_setting('luma.allow_destructive_inventory_rollback', true);
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'inventory_products'
    ) THEN
        SELECT count(*) INTO v_prod_count FROM public.inventory_products;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'inventory_stock_movements'
    ) THEN
        SELECT count(*) INTO v_mov_count FROM public.inventory_stock_movements;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'inventory_batch_commits'
    ) THEN
        SELECT count(*) INTO v_batch_count FROM public.inventory_batch_commits;
    END IF;

    IF (v_prod_count > 0 OR v_mov_count > 0 OR v_batch_count > 0) AND (v_override IS DISTINCT FROM 'true') THEN
        RAISE EXCEPTION 'ROLLBACK ABORTED BY SAFETY INTERLOCK: Cannot drop inventory schema while % products, % stock movement audit records, and % batch commit records exist. To force destructive rollback, an authorized administrator must first run: SET LOCAL luma.allow_destructive_inventory_rollback = ''true'';', v_prod_count, v_mov_count, v_batch_count;
    END IF;
END $$;

-- Drop RPC Functions
DROP FUNCTION IF EXISTS public.rpc_commit_inventory_intake_batch(TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.rpc_create_inventory_product_with_opening_stock(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT);

-- Drop Tables (in dependency order)
DROP TABLE IF EXISTS public.inventory_batch_commits CASCADE;
DROP TABLE IF EXISTS public.inventory_stock_movements CASCADE;
DROP TABLE IF EXISTS public.inventory_products CASCADE;

COMMIT;
