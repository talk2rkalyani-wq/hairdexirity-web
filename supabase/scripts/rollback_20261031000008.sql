-- ==============================================================================
-- Luma Salon — Rollback Script for Migration 000008
-- Phase 6 Rollback: Removes rpc_adjust_inventory_stock safely
-- ==============================================================================

BEGIN;

-- Drop RPC function safely
DROP FUNCTION IF EXISTS public.rpc_adjust_inventory_stock(TEXT, UUID, TEXT, NUMERIC, TEXT, TEXT);

-- Core tables, inventory products, stock movements, and batch commits are PRESERVED
COMMIT;

