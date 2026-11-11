-- ==============================================================================
-- Luma Salon — Migration 000002: Row Level Security (RLS) & Access Policies
-- Phase 14.1 Database Foundation
-- ==============================================================================

-- 1. ENABLE ROW LEVEL SECURITY ACROSS ALL TABLES
ALTER TABLE public.salons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Explicitly revoke all privileges from anon / PUBLIC to enforce total denial for unauthenticated callers
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon;

-- Grant standard DML to authenticated users (strictly constrained by RLS policies below)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- 2. HELPER FUNCTIONS TO RESOLVE AUTHENTICATED CALLER ROLES & IDENTITIES
-- Security Definiter ensures functions run with query privileges to look up users table safely.

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_user_staff_id()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT employee_id FROM public.users
    WHERE auth_user_id = auth.uid() AND active = true
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((public.current_user_role() = 'OWNER'), false);
$$;

CREATE OR REPLACE FUNCTION public.is_owner_or_receptionist()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((public.current_user_role() IN ('OWNER', 'RECEPTIONIST')), false);
$$;

-- Restrict function execution strictly to authenticated callers
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_staff_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_or_receptionist() TO authenticated;

-- ==============================================================================
-- 3. POLICIES: SALONS TABLE
-- ==============================================================================
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

-- ==============================================================================
-- 4. POLICIES: STAFF TABLE
-- ==============================================================================
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

-- ==============================================================================
-- 5. POLICIES: USERS TABLE (RBAC & User Management Isolation)
-- ==============================================================================
DROP POLICY IF EXISTS "Users visible to owners or own profile" ON public.users;
DROP POLICY IF EXISTS "Users viewable by self" ON public.users;
CREATE POLICY "Users viewable by self"
    ON public.users FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users viewable by owner" ON public.users;
CREATE POLICY "Users viewable by owner"
    ON public.users FOR SELECT
    TO authenticated
    USING (public.is_owner());

DROP POLICY IF EXISTS "Users insertable only by owners" ON public.users;
CREATE POLICY "Users insertable only by owners"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner());

-- Only Owners can modify user accounts (prevents employee privilege escalation or staff re-association)
DROP POLICY IF EXISTS "Users updatable by owners or own self" ON public.users;
DROP POLICY IF EXISTS "Users updatable only by owners" ON public.users;
CREATE POLICY "Users updatable only by owners"
    ON public.users FOR UPDATE
    TO authenticated
    USING (public.is_owner())
    WITH CHECK (public.is_owner());

DROP POLICY IF EXISTS "Users deletable only by owners" ON public.users;
CREATE POLICY "Users deletable only by owners"
    ON public.users FOR DELETE
    TO authenticated
    USING (public.is_owner());

-- ==============================================================================
-- 6. POLICIES: SERVICES TABLE
-- ==============================================================================
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

-- ==============================================================================
-- 7. POLICIES: CLIENTS TABLE
-- ==============================================================================
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

-- ==============================================================================
-- 8. POLICIES: APPOINTMENTS TABLE (Enforcing Employee Isolation in SQL)
-- ==============================================================================
DROP POLICY IF EXISTS "Appointments viewable by staff according to isolation" ON public.appointments;
CREATE POLICY "Appointments viewable by staff according to isolation"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
        -- Owners and receptionists see salon-wide calendar
        public.is_owner_or_receptionist()
        -- Employees can ONLY query appointments assigned to themselves
        OR (
            public.current_user_role() = 'EMPLOYEE'
            AND (
                staff_id = public.current_user_staff_id()
                OR assigned_employee_id = public.current_user_staff_id()
            )
        )
    );

DROP POLICY IF EXISTS "Appointments insertable by owner and receptionist" ON public.appointments;
CREATE POLICY "Appointments insertable by owner and receptionist"
    ON public.appointments FOR INSERT
    TO authenticated
    WITH CHECK (public.is_owner_or_receptionist());

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

DROP POLICY IF EXISTS "Appointments deletable only by owners" ON public.appointments;
CREATE POLICY "Appointments deletable only by owners"
    ON public.appointments FOR DELETE
    TO authenticated
    USING (public.is_owner());
