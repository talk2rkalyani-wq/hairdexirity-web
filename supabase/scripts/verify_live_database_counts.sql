-- ==============================================================================
-- Luma Salon — Live Remote Database Row Count Verification
-- Target Project Reference: ktlzrezhiopwwlzmycdw
-- 100% Read-Only Audit Script (No mutations, no side effects)
-- ==============================================================================
-- Instructions:
-- 1. Open Supabase Dashboard -> SQL Editor (project: ktlzrezhiopwwlzmycdw)
-- 2. Paste and run this query.
-- 3. Confirm live row counts across all 6 foundational tables.
-- ==============================================================================

SELECT 
    'salons' AS table_name, 
    count(*) AS live_row_count,
    CASE 
        WHEN count(*) = 1 THEN 'CONFIRMED: Matches baseline (1 salon)' 
        ELSE 'NOTICE: Count differs from baseline (expected 1)' 
    END AS status
FROM public.salons

UNION ALL

SELECT 
    'staff', 
    count(*),
    CASE 
        WHEN count(*) = 20 THEN 'CONFIRMED: Matches baseline (20 staff records)' 
        ELSE 'NOTICE: Count differs from baseline (expected 20)' 
    END
FROM public.staff

UNION ALL

SELECT 
    'users', 
    count(*),
    CASE 
        WHEN count(*) = 23 THEN 'CONFIRMED: Matches baseline (23 user accounts)' 
        ELSE 'NOTICE: Count differs from baseline (expected 23)' 
    END
FROM public.users

UNION ALL

SELECT 
    'services', 
    count(*),
    CASE 
        WHEN count(*) = 10 THEN 'CONFIRMED: Matches baseline (10 services)' 
        ELSE 'NOTICE: Count differs from baseline (expected 10)' 
    END
FROM public.services

UNION ALL

SELECT 
    'clients', 
    count(*),
    CASE 
        WHEN count(*) = 14 THEN 'CONFIRMED: Matches baseline (14 clients)' 
        ELSE 'NOTICE: Count differs from baseline (expected 14)' 
    END
FROM public.clients

UNION ALL

SELECT 
    'appointments', 
    count(*),
    CASE 
        WHEN count(*) = 18 THEN 'CONFIRMED: Matches baseline (18 historical appointments)' 
        ELSE 'NOTICE: Count differs from baseline (expected 18)' 
    END
FROM public.appointments

ORDER BY table_name;
