-- ==============================================================================
-- Luma Salon — Migration 000005: Cross-Salon Tenant Isolation & Identity RLS Hardening
-- Phase 15: Real Supabase Authentication & Multi-Tenant Database Security
-- ==============================================================================
-- STRICT BOUNDARY:
-- This migration is prepared locally for testing and verification.
-- DO NOT apply remotely to the live database until authorized.
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 0. PRECONDITIONS & RLS FORCING
-- ==============================================================================
-- Enforce RLS even for table owners to guarantee strict tenant isolation
ALTER TABLE public.salons FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.administrators FORCE ROW LEVEL SECURITY;

-- Note on Owner-to-Staff Mapping:
-- user-owner-01 (Rajesh / Owner 1) retains employee_id = NULL in baseline state.
-- staff-01 belongs to Mia Vance (user-emp-01). Do not link user-owner-01 to staff-01,
-- ensuring Mia Vance's appointments are not misattributed to Rajesh and are not blocked by VIP rules.


-- ==============================================================================
-- 1. HELPER FUNCTION: current_user_salon_id()
-- ==============================================================================
-- Resolves the authorized salon_id of the authenticated caller.
-- Runs with SECURITY DEFINER to safely inspect public.users.

CREATE OR REPLACE FUNCTION public.current_user_salon_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT salon_id FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_salon_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_salon_id() TO authenticated;

-- ==============================================================================
-- 2. SALON TENANT ISOLATION: SALONS TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "Salons readable by authenticated salon users" ON public.salons;
CREATE POLICY "Salons readable by authenticated salon users"
    ON public.salons FOR SELECT
    TO authenticated
    USING (
        id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );

DROP POLICY IF EXISTS "Salons updatable only by owners" ON public.salons;
CREATE POLICY "Salons updatable only by owners"
    ON public.salons FOR UPDATE
    TO authenticated
    USING (id = public.current_user_salon_id() AND public.is_owner())
    WITH CHECK (id = public.current_user_salon_id() AND public.is_owner());

-- ==============================================================================
-- 3. SALON TENANT ISOLATION: STAFF TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "Staff list viewable by authenticated users" ON public.staff;
CREATE POLICY "Staff list viewable by authenticated users"
    ON public.staff FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );

DROP POLICY IF EXISTS "Staff insertable only by owners" ON public.staff;
CREATE POLICY "Staff insertable only by owners"
    ON public.staff FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

DROP POLICY IF EXISTS "Staff updatable only by owners" ON public.staff;
CREATE POLICY "Staff updatable only by owners"
    ON public.staff FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

DROP POLICY IF EXISTS "Staff deletable only by owners" ON public.staff;
CREATE POLICY "Staff deletable only by owners"
    ON public.staff FOR DELETE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

-- ==============================================================================
-- 4. SALON TENANT ISOLATION: SERVICES TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "Services viewable by authenticated users" ON public.services;
CREATE POLICY "Services viewable by authenticated users"
    ON public.services FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );

DROP POLICY IF EXISTS "Services insertable only by owners" ON public.services;
CREATE POLICY "Services insertable only by owners"
    ON public.services FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

DROP POLICY IF EXISTS "Services updatable only by owners" ON public.services;
CREATE POLICY "Services updatable only by owners"
    ON public.services FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

DROP POLICY IF EXISTS "Services deletable only by owners" ON public.services;
CREATE POLICY "Services deletable only by owners"
    ON public.services FOR DELETE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

-- ==============================================================================
-- 5. SALON TENANT ISOLATION: CLIENTS TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "Clients viewable by authenticated users" ON public.clients;
CREATE POLICY "Clients viewable by authenticated users"
    ON public.clients FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );

DROP POLICY IF EXISTS "Clients insertable by owner and receptionist" ON public.clients;
CREATE POLICY "Clients insertable by owner and receptionist"
    ON public.clients FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Clients updatable by owner and receptionist" ON public.clients;
CREATE POLICY "Clients updatable by owner and receptionist"
    ON public.clients FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Clients deletable only by owners" ON public.clients;
CREATE POLICY "Clients deletable only by owners"
    ON public.clients FOR DELETE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

-- ==============================================================================
-- 6. SALON TENANT & EMPLOYEE ISOLATION: APPOINTMENTS TABLE
-- ==============================================================================
DROP POLICY IF EXISTS "Appointments viewable by staff according to isolation" ON public.appointments;
CREATE POLICY "Appointments viewable by staff according to isolation"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND (
            public.is_owner_or_receptionist()
            OR (
                public.current_user_role() = 'EMPLOYEE'
                AND (
                    staff_id = public.current_user_staff_id()
                    OR assigned_employee_id = public.current_user_staff_id()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Appointments insertable by owner and receptionist" ON public.appointments;
CREATE POLICY "Appointments insertable by owner and receptionist"
    ON public.appointments FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Appointments updatable by owner, receptionist, or assigned employee" ON public.appointments;
CREATE POLICY "Appointments updatable by owner, receptionist, or assigned employee"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND (
            public.is_owner_or_receptionist()
            OR (
                public.current_user_role() = 'EMPLOYEE'
                AND (
                    staff_id = public.current_user_staff_id()
                    OR assigned_employee_id = public.current_user_staff_id()
                )
            )
        )
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
        AND (
            public.is_owner_or_receptionist()
            OR (
                public.current_user_role() = 'EMPLOYEE'
                AND (
                    staff_id = public.current_user_staff_id()
                    OR assigned_employee_id = public.current_user_staff_id()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Appointments deletable only by owners" ON public.appointments;
CREATE POLICY "Appointments deletable only by owners"
    ON public.appointments FOR DELETE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND public.is_owner()
    );

-- ==============================================================================
-- 7. USERS DIRECTORY RLS & COLUMN PROTECTION
-- ==============================================================================
DROP POLICY IF EXISTS "Users viewable by self" ON public.users;
DROP POLICY IF EXISTS "Users viewable by owner" ON public.users;

CREATE POLICY "Users viewable by self or salon owner"
    ON public.users FOR SELECT
    TO authenticated
    USING (
        (auth_user_id = auth.uid())
        OR
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR
        EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
    );

DROP POLICY IF EXISTS "Users insertable only by owners" ON public.users;
DROP POLICY IF EXISTS "Users insertable by administrator or owner" ON public.users;
CREATE POLICY "Users insertable by administrator or owner"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Only Admin can create Owner accounts
        (role = 'OWNER' AND public.is_admin())
        OR
        -- Owners can create Staff/Receptionist accounts in their salon
        (
            role IN ('EMPLOYEE', 'RECEPTIONIST')
            AND salon_id = public.current_user_salon_id()
            AND public.is_owner()
        )
    );

DROP POLICY IF EXISTS "Users updatable only by owners" ON public.users;
DROP POLICY IF EXISTS "Users updatable by owners or self" ON public.users;
DROP POLICY IF EXISTS "Users updatable by administrator or owner" ON public.users;
CREATE POLICY "Users updatable by administrator, owner, or self"
    ON public.users FOR UPDATE
    TO authenticated
    USING (
        -- Admin can manage any user
        public.is_admin()
        OR
        -- Owners can manage Staff/Receptionist accounts in their salon (cannot touch other Owners or Admins)
        (
            salon_id = public.current_user_salon_id()
            AND public.is_owner()
            AND role NOT IN ('OWNER', 'ADMIN')
        )
        OR
        -- Any user can update their own row (subject to trg_protect_user_identity_columns)
        (auth_user_id = auth.uid())
    )
    WITH CHECK (
        public.is_admin()
        OR
        (
            salon_id = public.current_user_salon_id()
            AND public.is_owner()
            AND role NOT IN ('OWNER', 'ADMIN')
        )
        OR
        (auth_user_id = auth.uid())
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
        -- Owners can delete Staff/Receptionist accounts in their salon (cannot delete other Owners or Admins)
        (
            salon_id = public.current_user_salon_id()
            AND public.is_owner()
            AND role NOT IN ('OWNER', 'ADMIN')
        )
    );

-- ==============================================================================
-- 8. TRIGGER: PROTECT USER IDENTITY & PRIVILEGED COLUMNS
-- ==============================================================================
-- Ensures that ordinary users cannot elevate their role, alter owner_designation,
-- change their salon_id, or tamper with auth_user_id/active status.

CREATE OR REPLACE FUNCTION public.fn_protect_user_identity_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow trusted database administrator, superuser, and service_role callers
    IF CURRENT_USER NOT IN ('authenticated', 'anon') OR auth.role() = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Check if caller is authenticated root administrator
    IF public.is_admin() THEN
        RETURN NEW;
    END IF;

    -- For ordinary authenticated users (including owners, receptionists, and employees):

    -- 1. Prevent altering salon_id under any circumstances
    IF NEW.salon_id IS DISTINCT FROM OLD.salon_id THEN
        RAISE EXCEPTION 'Security violation: salon membership cannot be altered.';
    END IF;

    -- 2. Prevent altering auth_user_id under any circumstances (only admin/service_role provisioning can link)
    IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
        RAISE EXCEPTION 'Security violation: auth identity linkage cannot be altered directly from client.';
    END IF;

    -- 3. Prevent non-admin from creating or altering owner_designation
    IF NEW.owner_designation IS DISTINCT FROM OLD.owner_designation THEN
        RAISE EXCEPTION 'Security violation: only the root administrator can assign or modify owner designations.';
    END IF;

    -- 4. Prevent altering role unless owner is managing a non-owner/non-admin user
    IF NEW.role IS DISTINCT FROM OLD.role THEN
        IF NOT public.is_owner() OR OLD.role IN ('OWNER', 'ADMIN') OR NEW.role IN ('OWNER', 'ADMIN') THEN
            RAISE EXCEPTION 'Security violation: unauthorized attempt to alter user role.';
        END IF;
    END IF;

    -- 5. Prevent users from modifying their own active status, and prevent non-admin from modifying owner/admin active status
    IF NEW.active IS DISTINCT FROM OLD.active THEN
        IF OLD.auth_user_id = auth.uid() THEN
            RAISE EXCEPTION 'Security violation: users cannot alter their own account activation status.';
        END IF;
        IF OLD.role IN ('OWNER', 'ADMIN') THEN
            RAISE EXCEPTION 'Security violation: only the root administrator can alter owner or administrator activation status.';
        END IF;
    END IF;

    -- 6. Owners cannot manage administrator or other owner profiles
    IF OLD.role IN ('OWNER', 'ADMIN') AND (OLD.auth_user_id IS NULL OR OLD.auth_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'Security violation: owners cannot manage administrator or other owner profiles.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_user_identity_columns ON public.users;
CREATE TRIGGER trg_protect_user_identity_columns
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_protect_user_identity_columns();

COMMIT;
