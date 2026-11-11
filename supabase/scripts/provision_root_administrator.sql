-- ==============================================================================
-- Luma Salon — Idempotent & Hardened Root Administrator Provisioning Script
-- Phase 15.10: Root Admin Identity Safeguards & Execution Verification
-- Safe for execution in Supabase Dashboard SQL Editor (Runs as postgres)
-- ==============================================================================
-- CRITICAL SECURITY POLICIES:
-- 1. MANDATORY CONFIRMED AUTH UUID:
--    You MUST replace the placeholder NULL below with the exact Auth UUID copied
--    directly from Supabase Dashboard -> Authentication -> Users.
--    This script will abort immediately with an error if v_expected_auth_uuid is NULL.
--
-- 2. ANTI-HIJACKING & IDENTITY PROTECTION:
--    - Prohibits binding an existing admin email to a different Auth UUID.
--    - Prohibits binding an existing Auth UUID to a different admin email.
--    - Prohibits overwriting an existing administrator ID (admin-root-01).
--
-- 3. CONTROLLED REACTIVATION (NO SILENT REACTIVATION):
--    If an administrator account exists but is currently deactivated (active = false),
--    a normal retry WILL FAIL by default. Reactivating an administrator account is a
--    security-sensitive operation requiring an explicit change to v_allow_reactivation := true.
--
-- 4. CASE-INSENSITIVE EMAIL NORMALIZATION:
--    Emails are strictly compared and stored in lower-case trimmed format
--    (lower(trim(...))) to ensure case variants cannot bypass uniqueness or security guards.
--
-- 5. TRANSACTIONAL INTEGRITY:
--    Executed as an atomic PL/pgSQL block without error-hiding handlers. Any failed check
--    aborts the entire transaction, leaving ZERO partial database changes.
-- ==============================================================================

DO $$
DECLARE
    -- -------------------------------------------------------------------------
    -- 1. OPERATOR CONFIGURATION (MUST BE REVIEWED BEFORE EXECUTION)
    -- -------------------------------------------------------------------------
    v_admin_id TEXT := 'admin-root-01';
    v_admin_email TEXT := 'talk2rkalyani@gmail.com';
    v_admin_name TEXT := 'Root Administrator';

    -- MANDATORY: Replace NULL with the confirmed Auth UUID from Supabase Dashboard
    -- Example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid
    v_expected_auth_uuid UUID := NULL; 

    -- SECURITY-SENSITIVE FLAG:
    -- Set to true ONLY if deliberately reactivating an administrator whose account was deactivated.
    -- Default is false to prevent accidental/silent reactivation during normal retries.
    v_allow_reactivation BOOLEAN := false;

    -- -------------------------------------------------------------------------
    -- 2. INTERNAL STATE VARIABLES
    -- -------------------------------------------------------------------------
    v_norm_email TEXT;
    v_auth_id UUID;
    v_existing_admin_by_email RECORD;
    v_existing_admin_by_auth RECORD;
    v_existing_admin_by_id RECORD;
BEGIN
    v_norm_email := lower(trim(v_admin_email));

    -- -------------------------------------------------------------------------
    -- STEP 1: OPERATIONAL SAFETY GATE — REQUIRE CONFIRMED AUTH UUID
    -- -------------------------------------------------------------------------
    IF v_expected_auth_uuid IS NULL THEN
        RAISE EXCEPTION 'Operational Safety Gate: v_expected_auth_uuid is NULL. You must explicitly configure v_expected_auth_uuid with the confirmed Auth UUID from Supabase Dashboard -> Authentication -> Users before running this script.';
    END IF;

    -- -------------------------------------------------------------------------
    -- STEP 2: VERIFY IDENTITY IN auth.users
    -- -------------------------------------------------------------------------
    SELECT id INTO v_auth_id
    FROM auth.users
    WHERE lower(trim(email)) = v_norm_email
    LIMIT 1;

    IF v_auth_id IS NULL THEN
        RAISE EXCEPTION 'Administrator provisioning failed: No user found in auth.users with email "%". Create or invite the user first in Supabase Dashboard -> Authentication -> Users.', v_norm_email;
    END IF;

    IF v_auth_id <> v_expected_auth_uuid THEN
        RAISE EXCEPTION 'Security violation: Auth user found in auth.users for email "%" has UUID "%", which does not match the confirmed expected UUID "%". Aborting with no changes.',
            v_norm_email, v_auth_id, v_expected_auth_uuid;
    END IF;

    -- -------------------------------------------------------------------------
    -- STEP 3: CHECK FOR ADMINISTRATOR ID (PRIMARY KEY) COLLISION
    -- -------------------------------------------------------------------------
    SELECT id, email, auth_user_id, active INTO v_existing_admin_by_id
    FROM public.administrators
    WHERE id = v_admin_id;

    IF v_existing_admin_by_id.id IS NOT NULL AND lower(trim(v_existing_admin_by_id.email)) <> v_norm_email THEN
        RAISE EXCEPTION 'Primary Key Conflict: Administrator ID "%" is already occupied by a different identity (email: "%", auth_user_id: "%"). Cannot assign ID "%" to "%". Aborting with no changes.',
            v_admin_id, v_existing_admin_by_id.email, v_existing_admin_by_id.auth_user_id, v_admin_id, v_norm_email;
    END IF;

    -- -------------------------------------------------------------------------
    -- STEP 4: CHECK EXISTING ADMINISTRATOR RECORDS (CASE-INSENSITIVE)
    -- -------------------------------------------------------------------------
    SELECT id, auth_user_id, email, active INTO v_existing_admin_by_email
    FROM public.administrators
    WHERE lower(trim(email)) = v_norm_email;

    SELECT id, auth_user_id, email, active INTO v_existing_admin_by_auth
    FROM public.administrators
    WHERE auth_user_id = v_auth_id;

    -- -------------------------------------------------------------------------
    -- STEP 5: EVALUATE IDENTITY CONSISTENCY, SAFE RETRY & REACTIVATION
    -- -------------------------------------------------------------------------
    IF v_existing_admin_by_email.id IS NOT NULL THEN
        -- Case A: Email exists in public.administrators
        IF v_existing_admin_by_email.auth_user_id = v_auth_id THEN
            -- Identity matches. Check activation state.
            IF v_existing_admin_by_email.active = false THEN
                IF NOT v_allow_reactivation THEN
                    RAISE EXCEPTION 'Security violation: Administrator account "%" (id: %) exists and matches auth_user_id %, but is currently DEACTIVATED (active = false). Normal retry is prohibited from reactivating deactivated accounts. If reactivation is intended, set v_allow_reactivation := true in this script.',
                        v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                ELSE
                    -- Explicitly authorized reactivation
                    UPDATE public.administrators
                    SET 
                        name = v_admin_name,
                        active = true,
                        updated_at = timezone('utc'::text, now())
                    WHERE id = v_existing_admin_by_email.id;

                    RAISE NOTICE 'Reactivation successful: Deactivated administrator "%" (id: %) has been explicitly reactivated and bound to auth_user_id %.',
                        v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                    RETURN;
                END IF;
            ELSE
                -- Normal idempotent safe retry for active administrator
                UPDATE public.administrators
                SET 
                    name = v_admin_name,
                    updated_at = timezone('utc'::text, now())
                WHERE id = v_existing_admin_by_email.id;

                RAISE NOTICE 'Safe retry confirmed: Administrator "%" (id: %) is already active and linked to verified auth_user_id %. Profile updated cleanly.',
                    v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                RETURN;
            END IF;
        ELSE
            -- CRITICAL SECURITY CONFLICT: Email exists but is bound to a DIFFERENT Auth UUID
            RAISE EXCEPTION 'Security conflict: Administrator profile for email "%" is already linked to auth_user_id "%". Attempted to link to different auth_user_id "%". Silent privilege transfer is strictly prohibited. Manual database review required.',
                v_norm_email, v_existing_admin_by_email.auth_user_id, v_auth_id;
        END IF;
    END IF;

    -- Case B: Auth UUID exists in public.administrators under a different email
    IF v_existing_admin_by_auth.id IS NOT NULL AND lower(trim(v_existing_admin_by_auth.email)) <> v_norm_email THEN
        RAISE EXCEPTION 'Security conflict: auth_user_id "%" is already linked to administrator email "%". Prohibited from binding to email "%". Aborting with no changes.',
            v_auth_id, v_existing_admin_by_auth.email, v_norm_email;
    END IF;

    -- -------------------------------------------------------------------------
    -- STEP 6: FIRST-TIME PROVISIONING (CLEAN INSERTION)
    -- -------------------------------------------------------------------------
    INSERT INTO public.administrators (
        id,
        auth_user_id,
        email,
        name,
        role,
        active,
        created_at,
        updated_at
    )
    VALUES (
        v_admin_id,
        v_auth_id,
        v_norm_email,
        v_admin_name,
        'ADMIN',
        true,
        timezone('utc'::text, now()),
        timezone('utc'::text, now())
    );

    RAISE NOTICE 'Success: Administrator "%" (id: %) provisioned and bound to confirmed Auth UUID %.',
        v_norm_email, v_admin_id, v_auth_id;
END;
$$;
