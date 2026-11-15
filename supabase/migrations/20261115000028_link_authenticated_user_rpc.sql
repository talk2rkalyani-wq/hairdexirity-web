-- ==============================================================================
-- MIGRATION: 20261115000028_link_authenticated_user_rpc.sql
-- PURPOSE:
-- 1. Provide SECURITY DEFINER function public.rpc_link_authenticated_user()
--    to automatically link an authenticated Supabase user's auth.uid() to
--    their record in public.users when logging in.
-- 2. Update SELECT policy on public.users so authenticated employees and receptionists
--    can immediately view their own profile even before auth_user_id is linked.
-- ==============================================================================

-- 1. RPC FUNCTION: rpc_link_authenticated_user
CREATE OR REPLACE FUNCTION public.rpc_link_authenticated_user()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_user RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RETURN NULL;
    END IF;

    -- Get caller's verified email from auth.users
    SELECT email INTO v_email
    FROM auth.users
    WHERE id = v_uid;

    IF v_email IS NULL THEN
        RETURN NULL;
    END IF;

    -- Find matching user in public.users by auth_user_id or by email
    SELECT * INTO v_user
    FROM public.users
    WHERE auth_user_id = v_uid
       OR (LOWER(email) = LOWER(v_email))
    ORDER BY CASE WHEN auth_user_id = v_uid THEN 1 ELSE 2 END
    LIMIT 1;

    IF v_user.id IS NULL THEN
        RETURN NULL;
    END IF;

    -- If auth_user_id is not set or needs linkage, link it now
    IF v_user.auth_user_id IS NULL OR v_user.auth_user_id != v_uid THEN
        UPDATE public.users
        SET auth_user_id = v_uid,
            updated_at = now()
        WHERE id = v_user.id;

        v_user.auth_user_id := v_uid;
    END IF;

    RETURN to_jsonb(v_user);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_link_authenticated_user() TO authenticated;

-- 2. UPDATE SELECT POLICY on public.users to allow self-view by email from verified JWT
DROP POLICY IF EXISTS "Users viewable by self or salon owner" ON public.users;
CREATE POLICY "Users viewable by self or salon owner"
    ON public.users FOR SELECT
    TO authenticated
    USING (
        (auth_user_id = auth.uid())
        OR
        (LOWER(email) = LOWER(auth.jwt()->>'email'))
        OR
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR
        EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );
