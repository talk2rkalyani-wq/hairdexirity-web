-- ==============================================================================
-- Luma Salon — Migration 000004: Admin Panel, Owner Management & Schema Rebuild
-- Phase B Corrected: Schema Design, Integrity Guards & Pre-flight Assertions
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- PRE-FLIGHT ASSERTIONS & PRECONDITION CHECKS
-- ==============================================================================
DO $$
DECLARE
    v_owner_count INT;
    v_missing_tables TEXT[] := ARRAY[]::TEXT[];
    v_tbl TEXT;
    v_orphaned_emp_count INT;
    v_orphaned_staff_apt_count INT;
    v_dup_email_count INT;
    v_unexpected_owner_count INT;
    v_missing_triggers TEXT[] := ARRAY[]::TEXT[];
    v_trg TEXT;
    v_missing_funcs TEXT[] := ARRAY[]::TEXT[];
    v_fn TEXT;
BEGIN
    -- 1. Assert all 6 foundational tables exist
    FOREACH v_tbl IN ARRAY ARRAY['salons', 'staff', 'users', 'services', 'clients', 'appointments']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_name = v_tbl
        ) THEN
            v_missing_tables := array_append(v_missing_tables, v_tbl);
        END IF;
    END LOOP;

    IF array_length(v_missing_tables, 1) > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Missing foundational tables: %', v_missing_tables;
    END IF;

    -- 2. Assert RLS is enabled on foundational tables
    IF EXISTS (
        SELECT 1 FROM pg_tables 
        WHERE schemaname = 'public' 
          AND tablename IN ('salons', 'staff', 'users', 'services', 'clients', 'appointments')
          AND rowsecurity = false
    ) THEN
        RAISE EXCEPTION 'Pre-migration check failed: RLS is disabled on one or more foundational tables.';
    END IF;

    -- 3. Assert baseline index from Migration 000003 exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE schemaname = 'public' AND tablename = 'users' AND indexname = 'idx_users_auth_user_id_unique'
    ) THEN
        RAISE EXCEPTION 'Pre-migration check failed: Missing required index idx_users_auth_user_id_unique from Migration 000003.';
    END IF;

    -- 4. Assert zero duplicate emails exist in public.users
    SELECT COUNT(*) INTO v_dup_email_count
    FROM (
        SELECT lower(trim(email)) FROM public.users GROUP BY lower(trim(email)) HAVING COUNT(*) > 1
    ) sub;
    IF v_dup_email_count > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % duplicate email address groups in public.users.', v_dup_email_count;
    END IF;

    -- 5. Assert foreign key integrity (users.employee_id -> staff.id)
    SELECT COUNT(*) INTO v_orphaned_emp_count
    FROM public.users u
    WHERE u.employee_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = u.employee_id);
    IF v_orphaned_emp_count > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % orphaned employee_id references in public.users.', v_orphaned_emp_count;
    END IF;

    -- 6. Assert foreign key integrity (appointments.staff_id -> staff.id)
    SELECT COUNT(*) INTO v_orphaned_staff_apt_count
    FROM public.appointments a
    WHERE a.staff_id IS NOT NULL 
      AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.id = a.staff_id);
    IF v_orphaned_staff_apt_count > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % orphaned staff_id references in public.appointments.', v_orphaned_staff_apt_count;
    END IF;

    -- 7. Assert owner count does not exceed 2
    SELECT COUNT(*) INTO v_owner_count FROM public.users WHERE role = 'OWNER';
    IF v_owner_count > 2 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % owners in public.users, expected at most 2.', v_owner_count;
    END IF;

    -- 8. Assert all existing owners are mapped by the safe pre-population statements
    SELECT COUNT(*) INTO v_unexpected_owner_count
    FROM public.users
    WHERE role = 'OWNER' 
      AND id NOT IN ('user-owner-01', 'user-owner-02');
    IF v_unexpected_owner_count > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Found % owners not mapped to user-owner-01 or user-owner-02.', v_unexpected_owner_count;
    END IF;

    -- 9. Assert baseline triggers exist
    FOREACH v_trg IN ARRAY ARRAY['trg_populate_appointment_snapshots', 'trg_check_last_owner_protection']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE trigger_schema = 'public' AND trigger_name = v_trg
        ) THEN
            v_missing_triggers := array_append(v_missing_triggers, v_trg);
        END IF;
    END LOOP;
    IF array_length(v_missing_triggers, 1) > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Missing baseline triggers: %', v_missing_triggers;
    END IF;

    -- 10. Assert baseline security functions exist
    FOREACH v_fn IN ARRAY ARRAY['is_owner', 'is_owner_or_receptionist', 'current_user_role']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.routines 
            WHERE routine_schema = 'public' AND routine_name = v_fn
        ) THEN
            v_missing_funcs := array_append(v_missing_funcs, v_fn);
        END IF;
    END LOOP;
    IF array_length(v_missing_funcs, 1) > 0 THEN
        RAISE EXCEPTION 'Pre-migration check failed: Missing baseline functions: %', v_missing_funcs;
    END IF;

    RAISE NOTICE 'Pre-flight checks passed: 6 foundational tables verified, RLS active, FK integrity intact, index verified, owner count is % (<= 2), triggers and functions verified.', v_owner_count;
END $$;

-- ==============================================================================
-- 1. DEDICATED ADMINISTRATOR TABLE
-- ==============================================================================
-- Physically isolates administrator credentials and permissions from salon staff/users.
-- Prevents any ordinary user or salon owner from escalating to administrator.

CREATE TABLE IF NOT EXISTS public.administrators (
    id TEXT PRIMARY KEY,
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role = 'ADMIN'),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_administrators_auth_user_id ON public.administrators(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_administrators_email ON public.administrators(email);

-- Enable RLS on administrators
ALTER TABLE public.administrators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.administrators FROM PUBLIC, anon, authenticated;

-- Allow authenticated administrator to read ONLY their own verified profile
GRANT SELECT ON public.administrators TO authenticated;

DROP POLICY IF EXISTS "Administrators view own profile only" ON public.administrators;
CREATE POLICY "Administrators view own profile only"
    ON public.administrators FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid() AND active = true);

-- NO INSERT, UPDATE, or DELETE policies granted to authenticated or anon.
-- Administrator accounts can ONLY be created or modified via trusted server-side service_role.

-- ==============================================================================
-- 2. OWNER DESIGNATIONS & MAXIMUM TWO OWNERS ENFORCEMENT ON public.users
-- ==============================================================================
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS owner_designation TEXT;

-- Safe Pre-population: Map existing unassigned placeholder owners to OWNER_1 and OWNER_2
-- to prevent check constraint violations on pre-existing records.
UPDATE public.users 
SET owner_designation = 'OWNER_1'
WHERE id = 'user-owner-01' AND role = 'OWNER' AND owner_designation IS NULL;

UPDATE public.users 
SET owner_designation = 'OWNER_2'
WHERE id = 'user-owner-02' AND role = 'OWNER' AND owner_designation IS NULL;

-- Constraint: Only OWNER role can have owner_designation; other roles must be NULL
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_users_owner_consistency'
    ) THEN
        ALTER TABLE public.users
        ADD CONSTRAINT chk_users_owner_consistency
        CHECK (
            (role = 'OWNER' AND owner_designation IN ('OWNER_1', 'OWNER_2'))
            OR
            (role != 'OWNER' AND owner_designation IS NULL)
        );
    END IF;
END $$;

-- Partial Unique Index: Strictly caps owners to maximum 2 (one OWNER_1, one OWNER_2)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_owner_designation_unique
ON public.users(owner_designation)
WHERE owner_designation IS NOT NULL;

-- ==============================================================================
-- 3. STAFF ATTRIBUTES: JOB TITLE AND GENDER
-- ==============================================================================
-- Preserves existing staff records, IDs, and appointment relationships.
-- Adds real job titles and gender attributes without mutating existing IDs.

ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
ADD COLUMN IF NOT EXISTS job_title TEXT;

CREATE INDEX IF NOT EXISTS idx_staff_job_title ON public.staff(job_title);

-- ==============================================================================
-- 4. STRUCTURED VIP STATUS ON CLIENTS
-- ==============================================================================
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_clients_is_vip ON public.clients(is_vip);

-- ==============================================================================
-- 5. VIP APPOINTMENT RESTRICTION RULE (RAJESH — OWNER 1)
-- ==============================================================================
-- Stable relationship resolution: identifies Rajesh via u.owner_designation = 'OWNER_1'
-- and u.employee_id = NEW.staff_id, NEVER through mutable string matching.
-- Blocks online and AI-assisted bookings for VIP clients assigned to Rajesh.
-- Permits authorized in-salon manual front-desk booking.

ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS booking_source TEXT NOT NULL DEFAULT 'in_salon' 
CHECK (booking_source IN ('online', 'in_salon', 'ai_assistant'));

CREATE OR REPLACE FUNCTION public.fn_enforce_vip_booking_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_is_vip BOOLEAN := false;
    v_is_rajesh_owner1 BOOLEAN := false;
BEGIN
    -- Check if client is VIP
    IF NEW.client_id IS NOT NULL THEN
        SELECT is_vip INTO v_is_vip 
        FROM public.clients 
        WHERE id = NEW.client_id;
    END IF;

    -- Check if assigned staff is Owner 1 (Rajesh) via stable employee_id linkage
    IF NEW.staff_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.employee_id = NEW.staff_id 
              AND u.owner_designation = 'OWNER_1'
              AND u.role = 'OWNER'
        ) INTO v_is_rajesh_owner1;
    END IF;

    -- Block online and AI-assistant bookings for VIP clients with Owner 1 (Rajesh)
    IF v_is_vip AND v_is_rajesh_owner1 AND NEW.booking_source IN ('online', 'ai_assistant') THEN
        RAISE EXCEPTION 'Booking Policy Violation: Online appointment booking is not available for VIP clients with Owner 1 (Rajesh). Please contact salon reception directly for private scheduling.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_vip_booking_rules ON public.appointments;
CREATE TRIGGER trg_enforce_vip_booking_rules
    BEFORE INSERT OR UPDATE OF client_id, staff_id, booking_source ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_enforce_vip_booking_rules();

-- ==============================================================================
-- 6. SECURITY FUNCTIONS & RLS HELPERS
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.administrators
        WHERE auth_user_id = auth.uid() 
          AND active = true
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Update Last-Owner Protection trigger to allow administrative management
CREATE OR REPLACE FUNCTION public.fn_check_last_owner_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    remaining_owners INTEGER;
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    -- The verified Administrator has explicit authority to manage owner lifecycles
    IF public.is_admin() THEN
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;

    IF TG_OP = 'DELETE' THEN
        -- If user is linked to staff, check appointment protection
        IF OLD.employee_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.appointments
                WHERE (staff_id = OLD.employee_id OR assigned_employee_id = OLD.employee_id)
                  AND status IN ('scheduled', 'confirmed')
                  AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
            ) INTO has_blocking;

            IF has_blocking THEN
                RAISE EXCEPTION 'Cannot delete this employee because an upcoming or active appointment exists for this employee.';
            END IF;
        END IF;

        -- Check last owner protection with row-level lock against concurrent deletion
        IF OLD.role = 'OWNER' THEN
            PERFORM 1 FROM public.users WHERE role = 'OWNER' FOR UPDATE;

            SELECT COUNT(*) INTO remaining_owners
            FROM public.users
            WHERE role = 'OWNER' AND active = true AND id != OLD.id;

            IF remaining_owners = 0 THEN
                RAISE EXCEPTION 'Cannot delete the last owner account.';
            END IF;
        END IF;

        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.role = 'OWNER' AND (NEW.role != 'OWNER' OR NEW.active = false) THEN
            PERFORM 1 FROM public.users WHERE role = 'OWNER' FOR UPDATE;

            SELECT COUNT(*) INTO remaining_owners
            FROM public.users
            WHERE role = 'OWNER' AND active = true AND id != OLD.id;

            IF remaining_owners = 0 THEN
                RAISE EXCEPTION 'Cannot deactivate or change the role of the last owner account.';
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$;

-- ==============================================================================
-- 7. RLS POLICIES FOR USERS TABLE (OWNER MANAGEMENT)
-- ==============================================================================
-- Only Administrator can create, update, or delete Owner accounts.
-- Owners can create, update, or delete Staff/Receptionist accounts.
-- All operations enforce active = true status.

DROP POLICY IF EXISTS "Users insertable only by owners" ON public.users;
DROP POLICY IF EXISTS "Users insertable by administrator or owner" ON public.users;
CREATE POLICY "Users insertable by administrator or owner"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Only Admin can create Owner accounts
        (role = 'OWNER' AND public.is_admin())
        OR
        -- Owners can create Staff/Receptionist accounts
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

DROP POLICY IF EXISTS "Users updatable only by owners" ON public.users;
DROP POLICY IF EXISTS "Users updatable by administrator or owner" ON public.users;
CREATE POLICY "Users updatable by administrator or owner"
    ON public.users FOR UPDATE
    TO authenticated
    USING (
        -- Admin can manage Owner accounts
        (role = 'OWNER' AND public.is_admin())
        OR
        -- Owners can manage Staff/Receptionist accounts (cannot touch Owners)
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    )
    WITH CHECK (
        (role = 'OWNER' AND public.is_admin())
        OR
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

DROP POLICY IF EXISTS "Users deletable only by owners" ON public.users;
DROP POLICY IF EXISTS "Users deletable by administrator or owner" ON public.users;
CREATE POLICY "Users deletable by administrator or owner"
    ON public.users FOR DELETE
    TO authenticated
    USING (
        -- Admin can delete Owner accounts
        (role = 'OWNER' AND public.is_admin())
        OR
        -- Owners can delete Staff/Receptionist accounts (cannot delete Owners)
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

COMMIT;
