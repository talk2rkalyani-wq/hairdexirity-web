-- ==============================================================================
-- Luma Salon — Migration 000009: Stock Movement Audit Integrity Hardening
-- Phase 6.2: Restricts stock movement creation exclusively to trusted database RPCs.
-- Prevents authenticated/anon frontend callers from directly fabricating audit records.
-- ==============================================================================
-- STRICT BOUNDARY:
-- This migration is prepared locally for review and testing.
-- DO NOT apply remotely to the live production database until authorized.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. REVOKE DIRECT INSERT PRIVILEGES ON public.inventory_stock_movements
-- All inventory stock movement writes must occur strictly through trusted
-- transactional database functions:
--   - rpc_create_inventory_product_with_opening_stock
--   - rpc_commit_inventory_intake_batch
--   - rpc_adjust_inventory_stock
-- Direct client INSERT via PostgREST / Supabase JS client is completely disallowed.
-- ==============================================================================
REVOKE INSERT ON TABLE public.inventory_stock_movements FROM PUBLIC, anon, authenticated;

-- Ensure SELECT remains granted to authenticated role for salon audit trail inspection
GRANT SELECT ON TABLE public.inventory_stock_movements TO authenticated;

-- Re-affirm denial of UPDATE and DELETE privileges to preserve absolute immutability
REVOKE UPDATE, DELETE ON TABLE public.inventory_stock_movements FROM PUBLIC, anon, authenticated;

-- ==============================================================================
-- 2. DROP DIRECT INSERT RLS POLICY ON public.inventory_stock_movements
-- Removes the policy that previously allowed authenticated users to execute
-- direct row inserts outside of transactional business RPCs.
-- ==============================================================================
DROP POLICY IF EXISTS "Stock movements insertable by authorized salon staff" ON public.inventory_stock_movements;

-- Note: The SELECT policy "Stock movements viewable by authorized salon staff"
-- remains active, strictly scoped to salon_id and Owner/Receptionist authorization.

COMMIT;

