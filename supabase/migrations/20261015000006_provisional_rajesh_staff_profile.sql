-- ==============================================================================
-- Luma Salon — Migration 000006: Optional Provisional Rajesh Staff Profile
-- Phase 15.7: Controlled Pilot Execution Preparation
-- ==============================================================================
-- PURPOSE:
-- Safely provision a dedicated staff profile for Rajesh (Owner 1) with ID
-- 'staff-real-03' and link user-owner-01.employee_id = 'staff-real-03'.
--
-- STRICT PRECONDITIONS:
-- 1. user-owner-01 exists, role = 'OWNER', owner_designation = 'OWNER_1'.
-- 2. staff-real-03 does NOT exist.
-- 3. user-owner-01.employee_id IS NULL (never overwrite existing linkage).
-- 4. Mia Vance (staff-01, user-emp-01) is 100% UNTOUCHED and PRESERVED.
-- 5. No remote execution until authorized by salon management.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_owner_exists BOOLEAN;
    v_staff_exists BOOLEAN;
    v_mia_staff_name TEXT;
    v_mia_user_emp_id TEXT;
BEGIN
    -- 1. Verify user-owner-01 exists and has OWNER_1 designation
    SELECT EXISTS (
        SELECT 1 FROM public.users 
        WHERE id = 'user-owner-01' 
          AND role = 'OWNER' 
          AND owner_designation = 'OWNER_1'
          AND employee_id IS NULL
    ) INTO v_owner_exists;

    IF NOT v_owner_exists THEN
        RAISE EXCEPTION 'Precondition Failed: user-owner-01 with OWNER_1 designation and NULL employee_id not found.';
    END IF;

    -- 2. Verify staff-real-03 does not already exist
    SELECT EXISTS (
        SELECT 1 FROM public.staff 
        WHERE id = 'staff-real-03'
    ) INTO v_staff_exists;

    IF v_staff_exists THEN
        RAISE EXCEPTION 'Precondition Failed: staff-real-03 already exists in public.staff.';
    END IF;

    -- 3. Assert Mia Vance integrity before proceeding
    SELECT name INTO v_mia_staff_name FROM public.staff WHERE id = 'staff-01';
    SELECT employee_id INTO v_mia_user_emp_id FROM public.users WHERE id = 'user-emp-01';

    IF v_mia_staff_name IS DISTINCT FROM 'Mia Vance' OR v_mia_user_emp_id IS DISTINCT FROM 'staff-01' THEN
        RAISE EXCEPTION 'Precondition Failed: Mia Vance baseline identity integrity check failed (staff-01: %, user-emp-01.employee_id: %).',
            v_mia_staff_name, v_mia_user_emp_id;
    END IF;
END;
$$;

-- ==============================================================================
-- 1. INSERT DEDICATED STAFF PROFILE FOR RAJESH (staff-real-03)
-- ==============================================================================
INSERT INTO public.staff (
    id,
    salon_id,
    name,
    phone,
    email,
    role,
    skills,
    experience,
    active,
    gender,
    job_title,
    working_hours,
    created_at,
    updated_at
)
VALUES (
    'staff-real-03',
    'salon-luma-01',
    'Rajesh',
    '+91 98111 00003',
    'owner1@lumasalon.example.com',
    'owner',
    ARRAY['Master Precision Haircut', 'Creative Direction', 'Balayage Specialist', 'Texture Transformation']::TEXT[],
    '15 years',
    true,
    'Male',
    'Premium Hair Stylist',
    '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb,
    timezone('utc'::text, now()),
    timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. LINK user-owner-01 TO staff-real-03
-- ==============================================================================
UPDATE public.users
SET 
    employee_id = 'staff-real-03',
    updated_at = timezone('utc'::text, now())
WHERE id = 'user-owner-01'
  AND role = 'OWNER'
  AND owner_designation = 'OWNER_1'
  AND employee_id IS NULL;

-- ==============================================================================
-- 3. POST-FLIGHT VERIFICATION
-- ==============================================================================
DO $$
DECLARE
    v_updated_count INT;
    v_mia_link TEXT;
BEGIN
    -- Verify exact single update
    SELECT count(*) INTO v_updated_count 
    FROM public.users 
    WHERE id = 'user-owner-01' AND employee_id = 'staff-real-03';

    IF v_updated_count <> 1 THEN
        RAISE EXCEPTION 'Postcondition Failed: user-owner-01 was not properly linked to staff-real-03.';
    END IF;

    -- Verify Mia Vance unchanged
    SELECT employee_id INTO v_mia_link FROM public.users WHERE id = 'user-emp-01';
    IF v_mia_link <> 'staff-01' THEN
        RAISE EXCEPTION 'Postcondition Failed: user-emp-01 mapping was corrupted during migration.';
    END IF;
END;
$$;

COMMIT;
