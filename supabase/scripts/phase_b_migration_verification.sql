-- ==============================================================================
-- Luma Salon — Phase B Migration Verification Script
-- Target Project: ktlzrezhiopwwlzmycdw
-- Read-only SQL query to verify schema elements after Migration 000004
-- ==============================================================================

-- 1. Verify public.administrators table and columns
SELECT 
    column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'administrators'
ORDER BY ordinal_position;

-- 2. Verify owner_designation column & constraints on public.users
SELECT 
    c.column_name, c.data_type, tc.constraint_name, tc.constraint_type
FROM information_schema.columns c
LEFT JOIN information_schema.constraint_column_usage ccu 
    ON ccu.table_name = c.table_name AND ccu.column_name = c.column_name
LEFT JOIN information_schema.table_constraints tc 
    ON tc.constraint_name = ccu.constraint_name
WHERE c.table_schema = 'public' 
  AND c.table_name = 'users' 
  AND c.column_name = 'owner_designation';

-- 3. Verify partial unique index on owner_designation
SELECT 
    indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' 
  AND tablename = 'users' 
  AND indexname = 'idx_users_owner_designation_unique';

-- 4. Verify gender and job_title on public.staff
SELECT 
    column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'staff' 
  AND column_name IN ('gender', 'job_title');

-- 5. Verify is_vip on public.clients
SELECT 
    column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'clients' 
  AND column_name = 'is_vip';

-- 6. Verify booking_source and trigger on public.appointments
SELECT 
    column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'appointments' 
  AND column_name = 'booking_source';

SELECT 
    trigger_name, event_manipulation, action_timing
FROM information_schema.triggers
WHERE trigger_schema = 'public' 
  AND event_object_table = 'appointments'
  AND trigger_name = 'trg_enforce_vip_booking_rules';

-- 7. Verify is_admin() function
SELECT 
    routine_name, security_type, data_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
  AND routine_name = 'is_admin';

-- 8. Verify updated RLS policies on public.users
SELECT 
    policyname, cmd, permissive, roles
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'users'
ORDER BY policyname;
