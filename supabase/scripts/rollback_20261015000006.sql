-- ==============================================================================
-- Luma Salon — Rollback Script for Migration 000006
-- Revert Provisional Rajesh Staff Profile (staff-real-03)
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_apt_count INT;
BEGIN
    -- 1. Check if any appointments have been booked with staff-real-03
    SELECT count(*) INTO v_apt_count
    FROM public.appointments
    WHERE staff_id = 'staff-real-03';

    IF v_apt_count > 0 THEN
        RAISE EXCEPTION 'Rollback Aborted: % appointments are linked to staff-real-03. Reassign or cancel these appointments before rolling back.', v_apt_count;
    END IF;
END;
$$;

-- 2. Unlink user-owner-01 from staff-real-03
UPDATE public.users
SET 
    employee_id = NULL,
    updated_at = timezone('utc'::text, now())
WHERE id = 'user-owner-01'
  AND employee_id = 'staff-real-03';

-- 3. Delete provisional staff profile
DELETE FROM public.staff
WHERE id = 'staff-real-03';

COMMIT;
