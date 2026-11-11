-- ==============================================================================
-- Luma Salon — Migration 000003: Auth Linkage Hardening
-- Phase 14.4A.2: Minimal Safe Index Migration
-- ==============================================================================

-- Partial Unique Index on auth_user_id
-- Ensures that when an application user is linked to a Supabase Auth identity,
-- that auth identity can NEVER be linked to more than one application user record.
-- Safely ignores existing records where auth_user_id IS NULL.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
ON public.users(auth_user_id)
WHERE auth_user_id IS NOT NULL;
