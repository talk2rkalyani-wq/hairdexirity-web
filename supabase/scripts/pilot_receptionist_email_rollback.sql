-- ==============================================================================
-- Luma Salon — Phase 14.4B.3: Rollback Statement
-- Restores original placeholder email for user-rec-01
-- Target Project Reference: ktlzrezhiopwwlzmycdw
-- ==============================================================================

DO $$
DECLARE
    v_rows_affected INT;
BEGIN
    UPDATE public.users
    SET email = 'receptionist@lumasalon.example.com',
        updated_at = timezone('utc'::text, now())
    WHERE id = 'user-rec-01'
      AND auth_user_id IS NULL;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected != 1 THEN
        RAISE EXCEPTION 'Rollback Failed: Expected exactly 1 row updated, but % rows affected.', v_rows_affected;
    END IF;

    RAISE NOTICE 'SUCCESS: user-rec-01 email restored to placeholder (receptionist@lumasalon.example.com).';
END $$;
