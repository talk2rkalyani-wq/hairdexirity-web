-- ==============================================================================
-- Luma Salon — Phase 14.4B.3: Controlled Receptionist Pilot Email Update
-- Target Project Reference: ktlzrezhiopwwlzmycdw
-- Target User ID: user-rec-01
-- Expected Current Email: receptionist@lumasalon.example.com
--
-- INSTRUCTIONS FOR USER:
-- 1. Replace 'YOUR_ACCESSIBLE_EMAIL_HERE' below with your actual email address.
-- 2. Open Supabase Dashboard -> SQL Editor (project: ktlzrezhiopwwlzmycdw).
-- 3. Run the DO block. It performs all preflight conflict checks atomically
--    and aborts if any condition fails or if row count != 1.
-- ==============================================================================

DO $$
DECLARE
    -- Supply the new accessible email here (it will be normalized automatically)
    v_new_raw_email TEXT := 'YOUR_ACCESSIBLE_EMAIL_HERE';
    v_new_email TEXT := LOWER(TRIM(v_new_raw_email));

    v_current_email TEXT;
    v_current_auth_id UUID;
    v_current_role TEXT;
    v_conflict_user_id TEXT;
    v_auth_conflict_count INT;
    v_rows_affected INT;
BEGIN
    -- 1. Format & Input Validation
    IF v_new_email IS NULL OR v_new_email = '' OR v_new_email = 'your_accessible_email_here' THEN
        RAISE EXCEPTION 'Safety Guard: Please provide a valid, accessible new email address.';
    END IF;

    IF v_new_email NOT LIKE '%_@__%.__%' THEN
        RAISE EXCEPTION 'Safety Guard: Invalid email format: %', v_new_email;
    END IF;

    -- 2. Verify target user 'user-rec-01' current state
    SELECT email, auth_user_id, role
    INTO v_current_email, v_current_auth_id, v_current_role
    FROM public.users
    WHERE id = 'user-rec-01';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Safety Guard: Target user user-rec-01 not found in public.users.';
    END IF;

    IF v_current_email != 'receptionist@lumasalon.example.com' THEN
        RAISE EXCEPTION 'Safety Guard: Current email (%) does not match expected placeholder (receptionist@lumasalon.example.com).', v_current_email;
    END IF;

    IF v_current_auth_id IS NOT NULL THEN
        RAISE EXCEPTION 'Safety Guard: Target user is already linked to auth identity (%). Cannot modify email of linked account.', v_current_auth_id;
    END IF;

    IF v_current_role != 'RECEPTIONIST' THEN
        RAISE EXCEPTION 'Safety Guard: Target user role (%) is not RECEPTIONIST.', v_current_role;
    END IF;

    -- 3. Preflight Collision Check in public.users (ensures no collision with another user)
    SELECT id INTO v_conflict_user_id
    FROM public.users
    WHERE LOWER(TRIM(email)) = v_new_email
      AND id != 'user-rec-01'
    LIMIT 1;

    IF FOUND THEN
        RAISE EXCEPTION 'Conflict Guard: Proposed email (%) is already used by another application user (%): aborting.', v_new_email, v_conflict_user_id;
    END IF;

    -- 4. Preflight Collision Check in auth.users (ensures no existing Auth identity uses this email)
    SELECT COUNT(*) INTO v_auth_conflict_count
    FROM auth.users
    WHERE LOWER(TRIM(email)) = v_new_email;

    IF v_auth_conflict_count > 0 THEN
        RAISE EXCEPTION 'Conflict Guard: An existing Supabase Auth identity already exists with email (%): aborting.', v_new_email;
    END IF;

    -- 5. Execute Update targeting user-rec-01 ONLY
    UPDATE public.users
    SET email = v_new_email,
        updated_at = timezone('utc'::text, now())
    WHERE id = 'user-rec-01'
      AND email = 'receptionist@lumasalon.example.com'
      AND auth_user_id IS NULL;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- 6. Assert Exactly 1 Row Affected
    IF v_rows_affected != 1 THEN
        RAISE EXCEPTION 'Assertion Failed: Expected exactly 1 row updated, but % rows were affected. Aborting transaction.', v_rows_affected;
    END IF;

    RAISE NOTICE 'SUCCESS: user-rec-01 email updated safely to % (1 row affected). Role, ID, and active status unchanged.', v_new_email;
END $$;
