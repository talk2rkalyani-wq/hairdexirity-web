-- Migration: 20261114000022_admin_owner_auth_management.sql
-- Description: Provides SECURITY DEFINER RPC functions for Platform Root Administrator
-- to manage Supabase Auth users (Release Slot / Delete Auth User, Change Password, Deactivate / Activate).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ==============================================================================
-- 1. admin_delete_owner: Release slot and delete user from auth.users and public.users
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_owner(
    p_user_id text,
    p_auth_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_target_auth_id uuid := p_auth_user_id;
BEGIN
    -- Verify caller is Root Administrator
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Root Administrator can release owner slots.';
    END IF;

    -- Lookup auth_user_id from public.users if not provided
    IF v_target_auth_id IS NULL AND p_user_id IS NOT NULL THEN
        SELECT auth_user_id INTO v_target_auth_id
        FROM public.users
        WHERE id = p_user_id;
    END IF;

    -- Delete from public.users
    DELETE FROM public.users
    WHERE id = p_user_id
       OR (v_target_auth_id IS NOT NULL AND auth_user_id = v_target_auth_id);

    -- Delete from auth.users (cascades to identities, sessions, refresh tokens)
    IF v_target_auth_id IS NOT NULL THEN
        DELETE FROM auth.users WHERE id = v_target_auth_id;
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_owner(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_owner(text, uuid) TO authenticated;

-- ==============================================================================
-- 2. admin_update_owner_password: Change owner password directly in Supabase auth.users
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_update_owner_password(
    p_user_id text,
    p_new_password text,
    p_auth_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_target_auth_id uuid := p_auth_user_id;
BEGIN
    -- Verify caller is Root Administrator
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Root Administrator can change owner passwords.';
    END IF;

    IF p_new_password IS NULL OR length(trim(p_new_password)) < 6 THEN
        RAISE EXCEPTION 'Password must be at least 6 characters.';
    END IF;

    -- Lookup auth_user_id if not provided
    IF v_target_auth_id IS NULL AND p_user_id IS NOT NULL THEN
        SELECT auth_user_id INTO v_target_auth_id
        FROM public.users
        WHERE id = p_user_id;
    END IF;

    IF v_target_auth_id IS NULL THEN
        RAISE EXCEPTION 'User has no linked Supabase Auth identity.';
    END IF;

    -- Update encrypted_password in auth.users using bcrypt
    UPDATE auth.users
    SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_target_auth_id;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_owner_password(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_owner_password(text, text, uuid) TO authenticated;

-- ==============================================================================
-- 3. admin_toggle_owner_active: Toggle active in public.users and ban/unban in auth.users
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_toggle_owner_active(
    p_user_id text,
    p_active boolean,
    p_auth_user_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_target_auth_id uuid := p_auth_user_id;
BEGIN
    -- Verify caller is Root Administrator
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Root Administrator can change owner account status.';
    END IF;

    -- Lookup auth_user_id if not provided
    IF v_target_auth_id IS NULL AND p_user_id IS NOT NULL THEN
        SELECT auth_user_id INTO v_target_auth_id
        FROM public.users
        WHERE id = p_user_id;
    END IF;

    -- Update active status in public.users
    UPDATE public.users
    SET active = p_active,
        updated_at = now()
    WHERE id = p_user_id
       OR (v_target_auth_id IS NOT NULL AND auth_user_id = v_target_auth_id);

    -- Disable or enable user credentials in auth.users backend
    IF v_target_auth_id IS NOT NULL THEN
        IF p_active THEN
            -- Reactivate: lift ban
            UPDATE auth.users
            SET banned_until = NULL,
                updated_at = now()
            WHERE id = v_target_auth_id;
        ELSE
            -- Deactivate: set banned_until to year 2999
            UPDATE auth.users
            SET banned_until = '2999-12-31 23:59:59+00'::timestamptz,
                updated_at = now()
            WHERE id = v_target_auth_id;

            -- Invalidate all active sessions for this user
            DELETE FROM auth.sessions WHERE user_id = v_target_auth_id;
        END IF;
    END IF;

    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_toggle_owner_active(text, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_owner_active(text, boolean, uuid) TO authenticated;
