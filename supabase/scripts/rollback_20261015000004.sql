-- ==============================================================================
-- Luma Salon — Migration 000004 Rollback Script
-- Target Project: ktlzrezhiopwwlzmycdw
-- Safe, transactional restoration of pre-migration schema state
-- ==============================================================================
-- WARNING & DATA RECOVERY LIMITATION:
-- Executing this rollback script drops columns added in Migration 000004:
--   - public.users.owner_designation
--   - public.staff.job_title, public.staff.gender
--   - public.clients.is_vip
--   - public.appointments.booking_source
--   - public.administrators table and all administrator records
-- Any data written to these columns or tables while Migration 000004 was active
-- will be PERMANENTLY DESTROYED and is NOT recoverable by this script.
-- Before executing rollback in any environment, a full physical database backup
-- must be taken if data preservation is required.
-- ==============================================================================

BEGIN;

-- 1. Drop trigger and function for VIP booking restriction
DROP TRIGGER IF EXISTS trg_enforce_vip_booking_rules ON public.appointments;
DROP FUNCTION IF EXISTS public.fn_enforce_vip_booking_rules();
ALTER TABLE public.appointments DROP COLUMN IF EXISTS booking_source;

-- 2. Drop is_vip from clients
DROP INDEX IF EXISTS idx_clients_is_vip;
ALTER TABLE public.clients DROP COLUMN IF EXISTS is_vip;

-- 3. Drop job_title and gender from staff
DROP INDEX IF EXISTS idx_staff_job_title;
ALTER TABLE public.staff DROP COLUMN IF EXISTS job_title;
ALTER TABLE public.staff DROP COLUMN IF EXISTS gender;

-- 4. Revert RLS policies on public.users to migration 000002 baseline
DROP POLICY IF EXISTS "Users insertable by administrator or owner" ON public.users;
CREATE POLICY "Users insertable only by owners"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Users updatable by administrator or owner" ON public.users;
CREATE POLICY "Users updatable only by owners"
    ON public.users FOR UPDATE
    TO authenticated
    USING (public.is_owner())
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Users deletable by administrator or owner" ON public.users;
CREATE POLICY "Users deletable only by owners"
    ON public.users FOR DELETE
    TO authenticated
    USING (public.is_owner());

-- 5. Drop owner_designation constraints and column from public.users
DROP INDEX IF EXISTS idx_users_owner_designation_unique;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS chk_users_owner_consistency;
ALTER TABLE public.users DROP COLUMN IF EXISTS owner_designation;

-- 6. Restore original last-owner protection trigger (without is_admin override)
CREATE OR REPLACE FUNCTION public.fn_check_last_owner_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    remaining_owners INTEGER;
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
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

-- 7. Drop public.is_admin() helper function
DROP FUNCTION IF EXISTS public.is_admin();

-- 8. Drop public.administrators table
DROP POLICY IF EXISTS "Administrators view own profile only" ON public.administrators;
DROP TABLE IF EXISTS public.administrators CASCADE;

COMMIT;
