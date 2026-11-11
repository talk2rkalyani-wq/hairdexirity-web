-- ==============================================================================
-- Luma Salon — Rollback Script for Migration 000009
-- Phase 6.2 Rollback: Restores direct client INSERT privilege and INSERT RLS policy
-- on public.inventory_stock_movements (use only if explicitly required).
-- ==============================================================================

BEGIN;

-- 1. Restore INSERT privilege to authenticated role
GRANT INSERT ON TABLE public.inventory_stock_movements TO authenticated;

-- 2. Restore direct INSERT RLS policy
DROP POLICY IF EXISTS "Stock movements insertable by authorized salon staff" ON public.inventory_stock_movements;
CREATE POLICY "Stock movements insertable by authorized salon staff"
    ON public.inventory_stock_movements FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

COMMIT;

