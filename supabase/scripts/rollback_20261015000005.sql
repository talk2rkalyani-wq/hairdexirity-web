-- ==============================================================================
-- Luma Salon — Rollback Script for Migration 000005
-- Restores pre-migration 000005 RLS policies and removes column protection trigger
-- ==============================================================================
-- WARNING & DATA RECOVERY LIMITATION:
-- Executing this rollback script reverts table RLS policies, tenant isolation rules,
-- and the identity protection trigger (trg_protect_user_identity_columns) back to
-- the state established by Migration 000004.
--
-- This script DOES NOT revert data modifications (such as appointments created
-- or user records inserted) that occurred while Migration 000005 was active.
-- Schema rollbacks only alter database objects, not row history.
-- ==============================================================================

BEGIN;

-- 1. DROP TRIGGER AND FUNCTION
DROP TRIGGER IF EXISTS trg_protect_user_identity_columns ON public.users;
DROP FUNCTION IF EXISTS public.fn_protect_user_identity_columns();

-- 2. RESTORE POLICIES: USERS TABLE (MIGRATION 000004 BASELINE)
DROP POLICY IF EXISTS "Users viewable by self or salon owner" ON public.users;
DROP POLICY IF EXISTS "Users insertable by administrator or owner" ON public.users;
DROP POLICY IF EXISTS "Users updatable by administrator, owner, or self" ON public.users;
DROP POLICY IF EXISTS "Users updatable by owners or self" ON public.users;
DROP POLICY IF EXISTS "Users deletable by administrator or owner" ON public.users;

CREATE POLICY "Users viewable by self"
    ON public.users FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

CREATE POLICY "Users viewable by owner"
    ON public.users FOR SELECT
    TO authenticated
    USING (public.is_owner());

CREATE POLICY "Users insertable by administrator or owner"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (
        (role = 'OWNER' AND public.is_admin())
        OR
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

CREATE POLICY "Users updatable by administrator or owner"
    ON public.users FOR UPDATE
    TO authenticated
    USING (
        (role = 'OWNER' AND public.is_admin())
        OR
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    )
    WITH CHECK (
        (role = 'OWNER' AND public.is_admin())
        OR
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

CREATE POLICY "Users deletable by administrator or owner"
    ON public.users FOR DELETE
    TO authenticated
    USING (
        (role = 'OWNER' AND public.is_admin())
        OR
        (role IN ('EMPLOYEE', 'RECEPTIONIST') AND public.is_owner())
    );

-- 3. RESTORE POLICIES: APPOINTMENTS TABLE
DROP POLICY IF EXISTS "Appointments viewable by staff according to isolation" ON public.appointments;
CREATE POLICY "Appointments viewable by staff according to isolation"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
        public.is_owner_or_receptionist()
        OR (
            public.current_user_role() = 'EMPLOYEE'
            AND (
                staff_id = public.current_user_staff_id()
                OR assigned_employee_id = public.current_user_staff_id()
            )
        )
    );

DROP POLICY IF EXISTS "Appointments updatable by owner, receptionist, or assigned employee" ON public.appointments;
CREATE POLICY "Appointments updatable by owner, receptionist, or assigned employee"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (
        public.is_owner_or_receptionist()
        OR (
            public.current_user_role() = 'EMPLOYEE'
            AND (
                staff_id = public.current_user_staff_id()
                OR assigned_employee_id = public.current_user_staff_id()
            )
        )
    )
    WITH CHECK (
        public.is_owner_or_receptionist()
        OR (
            public.current_user_role() = 'EMPLOYEE'
            AND (
                staff_id = public.current_user_staff_id()
                OR assigned_employee_id = public.current_user_staff_id()
            )
        )
    );

-- 4. RESTORE POLICIES: CLIENTS TABLE
DROP POLICY IF EXISTS "Clients viewable by authenticated users" ON public.clients;
CREATE POLICY "Clients viewable by authenticated users"
    ON public.clients FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Clients insertable by owner and receptionist" ON public.clients;
CREATE POLICY "Clients insertable by owner and receptionist"
    ON public.clients FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner_or_receptionist());

DROP POLICY IF EXISTS "Clients updatable by owner and receptionist" ON public.clients;
CREATE POLICY "Clients updatable by owner and receptionist"
    ON public.clients FOR UPDATE
    TO authenticated
    USING (public.is_owner_or_receptionist())
    WITH CHECK (public.is_owner_or_receptionist());

DROP POLICY IF EXISTS "Clients deletable only by owners" ON public.clients;
CREATE POLICY "Clients deletable only by owners"
    ON public.clients FOR DELETE
    TO authenticated
    USING (public.is_owner());

-- 5. RESTORE POLICIES: SERVICES TABLE
DROP POLICY IF EXISTS "Services viewable by authenticated users" ON public.services;
CREATE POLICY "Services viewable by authenticated users"
    ON public.services FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Services insertable only by owners" ON public.services;
CREATE POLICY "Services insertable only by owners"
    ON public.services FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Services updatable only by owners" ON public.services;
CREATE POLICY "Services updatable only by owners"
    ON public.services FOR UPDATE
    TO authenticated
    USING (public.is_owner())
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Services deletable only by owners" ON public.services;
CREATE POLICY "Services deletable only by owners"
    ON public.services FOR DELETE
    TO authenticated
    USING (public.is_owner());

-- 6. RESTORE POLICIES: STAFF TABLE
DROP POLICY IF EXISTS "Staff list viewable by authenticated users" ON public.staff;
CREATE POLICY "Staff list viewable by authenticated users"
    ON public.staff FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Staff insertable only by owners" ON public.staff;
CREATE POLICY "Staff insertable only by owners"
    ON public.staff FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Staff updatable only by owners" ON public.staff;
CREATE POLICY "Staff updatable only by owners"
    ON public.staff FOR UPDATE
    TO authenticated
    USING (public.is_owner())
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Staff deletable only by owners" ON public.staff;
CREATE POLICY "Staff deletable only by owners"
    ON public.staff FOR DELETE
    TO authenticated
    USING (public.is_owner());

-- 7. RESTORE POLICIES: SALONS TABLE
DROP POLICY IF EXISTS "Salons readable by authenticated salon users" ON public.salons;
CREATE POLICY "Salons readable by authenticated salon users"
    ON public.salons FOR SELECT
    TO authenticated
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Salons updatable only by owners" ON public.salons;
CREATE POLICY "Salons updatable only by owners"
    ON public.salons FOR UPDATE
    TO authenticated
    USING (public.is_owner())
    WITH CHECK (public.is_owner());

-- 8. DROP HELPER FUNCTION
DROP FUNCTION IF EXISTS public.current_user_salon_id();

-- 9. RESTORE NO FORCE ROW LEVEL SECURITY
ALTER TABLE public.salons NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.services NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.clients NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.appointments NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.administrators NO FORCE ROW LEVEL SECURITY;

COMMIT;
