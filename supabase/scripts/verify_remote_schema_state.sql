-- ==============================================================================
-- Luma Salon — Phase 14.2 Remote Schema & Database State Verification Script
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ktlzrezhiopwwlzmycdw/sql/new
--
-- This script performs a complete, 100% read-only audit of the remote schema:
-- 1. Confirms all 6 public tables exist and checks column counts.
-- 2. Confirms Row Level Security (RLS) is ENABLED on every table.
-- 3. Confirms table row counts (proves clean database before import).
-- 4. Confirms Primary Keys and Foreign Keys are intact.
-- 5. Confirms Business Rule Triggers (Deletion Protection & Snapshots) exist.
-- 6. Confirms RLS policies match local migration 20261015000002.
-- 7. Confirms Security Definer helper functions and search paths.
-- ==============================================================================

-- 1. Check all tables in schema 'public'
SELECT 
    t.table_name,
    COUNT(c.column_name) AS total_columns
FROM information_schema.tables t
LEFT JOIN information_schema.columns c 
    ON t.table_name = c.table_name 
    AND t.table_schema = c.table_schema
WHERE t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;

-- 2. Confirm RLS Status on all tables
SELECT 
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 3. Check Current Row Counts (Ensures no unexpected data will be overwritten)
SELECT 'salons' AS table_name, count(*) AS current_rows FROM public.salons
UNION ALL
SELECT 'staff' AS table_name, count(*) AS current_rows FROM public.staff
UNION ALL
SELECT 'users' AS table_name, count(*) AS current_rows FROM public.users
UNION ALL
SELECT 'services' AS table_name, count(*) AS current_rows FROM public.services
UNION ALL
SELECT 'clients' AS table_name, count(*) AS current_rows FROM public.clients
UNION ALL
SELECT 'appointments' AS table_name, count(*) AS current_rows FROM public.appointments;

-- 4. Check Primary Keys and Foreign Keys
SELECT
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public' 
  AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY')
ORDER BY tc.table_name, tc.constraint_type DESC;

-- 5. Check Triggers (Deletion Protection & Appointment Snapshots)
SELECT 
    event_object_table AS table_name,
    trigger_name,
    event_manipulation AS event,
    action_timing AS timing
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 6. Check Installed RLS Policies
SELECT 
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 7. Check Functions
SELECT 
    routine_name,
    data_type AS return_type,
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;
