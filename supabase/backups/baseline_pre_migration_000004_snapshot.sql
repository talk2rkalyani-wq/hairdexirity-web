-- ==============================================================================
-- LUMA SALON — BASELINE PRE-MIGRATION 000004 RECOVERABLE SNAPSHOT
-- Target Supabase Project Ref: ktlzrezhiopwwlzmycdw
-- Timestamp: 20261017_214000
-- Integrity: Complete DDL (000001 + 000002 + 000003) + 86 Baseline Production Records
-- ==============================================================================

BEGIN;

-- Part 1: Schema Baseline (Migration 000001)
-- ==============================================================================
-- Luma Salon — Migration 000001: Initial PostgreSQL Schema & Business Rules
-- Phase 14.1 Database Foundation
-- ==============================================================================

-- 1. SALONS TABLE
CREATE TABLE IF NOT EXISTS public.salons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    address JSONB NOT NULL DEFAULT '{}'::jsonb,
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    currency TEXT NOT NULL DEFAULT 'INR',
    currency_symbol TEXT NOT NULL DEFAULT '₹',
    language TEXT NOT NULL DEFAULT 'en',
    working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. STAFF TABLE
CREATE TABLE IF NOT EXISTS public.staff (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'master_stylist', 'senior_stylist', 'colorist', 'junior_stylist')),
    skills TEXT[] NOT NULL DEFAULT '{}',
    experience TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    working_hours JSONB NOT NULL DEFAULT '{}'::jsonb,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_staff_salon_id ON public.staff(salon_id);
CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff(active);

-- 3. USERS TABLE (Linked with staff and future Supabase auth)
CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'RECEPTIONIST', 'EMPLOYEE')),
    employee_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    specialty TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON public.users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON public.users(auth_user_id);

-- 4. SERVICES TABLE
CREATE TABLE IF NOT EXISTS public.services (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    duration INTEGER NOT NULL CHECK (duration > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    category TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_services_salon_id ON public.services(salon_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON public.services(category);
CREATE INDEX IF NOT EXISTS idx_services_active ON public.services(active);

-- 5. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT NOT NULL,
    date_of_birth DATE,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    last_visit_at TIMESTAMPTZ,
    total_spend NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_spend >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clients_salon_id ON public.clients(salon_id);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON public.clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_email ON public.clients(email);

-- 6. APPOINTMENTS TABLE
-- Note: Foreign keys use ON DELETE SET NULL to preserve historical appointment records
-- while the snapshot columns (client_name, staff_name, service_name) ensure
-- that deleted records never cause broken references or placeholder text.
CREATE TABLE IF NOT EXISTS public.appointments (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    staff_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    assigned_employee_id TEXT,
    service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no-show')),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    notes TEXT,
    reminder_sent BOOLEAN NOT NULL DEFAULT false,
    last_reminder_sent_at TIMESTAMPTZ,
    reminder_delivery_status TEXT CHECK (reminder_delivery_status IN ('pending', 'sent', 'delivered', 'failed')),
    
    -- Historical snapshot metadata
    client_name TEXT,
    client_phone TEXT,
    client_email TEXT,
    staff_name TEXT,
    service_name TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_appointments_salon_id ON public.appointments(salon_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_staff_date ON public.appointments(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_service_id ON public.appointments(service_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- ==============================================================================
-- BUSINESS RULE TRIGGERS & AUTOMATION
-- ==============================================================================

-- A. Snapshot auto-capture trigger on appointment insert/update
CREATE OR REPLACE FUNCTION public.fn_populate_appointment_snapshots()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Populate client snapshot if empty
    IF NEW.client_name IS NULL AND NEW.client_id IS NOT NULL THEN
        SELECT name, phone, email INTO NEW.client_name, NEW.client_phone, NEW.client_email
        FROM public.clients WHERE id = NEW.client_id;
    END IF;

    -- Populate staff snapshot if empty
    IF NEW.staff_name IS NULL AND NEW.staff_id IS NOT NULL THEN
        SELECT name INTO NEW.staff_name
        FROM public.staff WHERE id = NEW.staff_id;
    END IF;

    -- Populate service snapshot if empty
    IF NEW.service_name IS NULL AND NEW.service_id IS NOT NULL THEN
        SELECT name INTO NEW.service_name
        FROM public.services WHERE id = NEW.service_id;
    END IF;

    -- Ensure assigned_employee_id mirrors staff_id
    IF NEW.assigned_employee_id IS NULL AND NEW.staff_id IS NOT NULL THEN
        NEW.assigned_employee_id := NEW.staff_id;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_populate_appointment_snapshots ON public.appointments;
CREATE TRIGGER trg_populate_appointment_snapshots
    BEFORE INSERT OR UPDATE ON public.appointments
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_populate_appointment_snapshots();

-- B. Phase 12.1.1 Deletion Protection Triggers
-- Prevents deleting clients, services, staff, or user accounts if referenced
-- by an upcoming or currently ongoing active appointment.

CREATE OR REPLACE FUNCTION public.fn_check_client_deletion_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE client_id = OLD.id
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this client because an upcoming or active appointment exists for this client.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET client_name = COALESCE(client_name, OLD.name),
        client_phone = COALESCE(client_phone, OLD.phone),
        client_email = COALESCE(client_email, OLD.email)
    WHERE client_id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_client_deletion_protection ON public.clients;
CREATE TRIGGER trg_check_client_deletion_protection
    BEFORE DELETE ON public.clients
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_client_deletion_protection();

CREATE OR REPLACE FUNCTION public.fn_check_service_deletion_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE service_id = OLD.id
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this service because an upcoming or active appointment exists for this service.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET service_name = COALESCE(service_name, OLD.name)
    WHERE service_id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_service_deletion_protection ON public.services;
CREATE TRIGGER trg_check_service_deletion_protection
    BEFORE DELETE ON public.services
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_service_deletion_protection();

CREATE OR REPLACE FUNCTION public.fn_check_staff_deletion_protection()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    salon_now_date DATE := (now() AT TIME ZONE 'Asia/Kolkata')::date;
    salon_now_time TIME := (now() AT TIME ZONE 'Asia/Kolkata')::time;
    has_blocking BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.appointments
        WHERE (staff_id = OLD.id OR assigned_employee_id = OLD.id)
          AND status IN ('scheduled', 'confirmed')
          AND (date > salon_now_date OR (date = salon_now_date AND end_time > salon_now_time))
    ) INTO has_blocking;

    IF has_blocking THEN
        RAISE EXCEPTION 'Cannot delete this employee because an upcoming or active appointment exists for this employee.';
    END IF;

    -- Snapshot details on historical appointments before foreign key is set null
    UPDATE public.appointments
    SET staff_name = COALESCE(staff_name, OLD.name)
    WHERE staff_id = OLD.id OR assigned_employee_id = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_staff_deletion_protection ON public.staff;
CREATE TRIGGER trg_check_staff_deletion_protection
    BEFORE DELETE ON public.staff
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_staff_deletion_protection();

-- C. Last-Owner Protection Trigger on USERS
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
        -- If user is linked to staff, check appointment protection
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

        -- Check last owner protection with row-level lock against concurrent deletion
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

DROP TRIGGER IF EXISTS trg_check_last_owner_protection ON public.users;
CREATE TRIGGER trg_check_last_owner_protection
    BEFORE DELETE OR UPDATE OF role, active ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_check_last_owner_protection();


-- Part 2: Row Level Security & Access Policies (Migration 000002)
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


-- Part 3: Auth Linkage Hardening Partial Unique Index (Migration 000003)
-- ==============================================================================
-- Luma Salon — Migration 000003: Auth Linkage Hardening
-- Phase 14.4A.2: Minimal Safe Index Migration
-- ==============================================================================

-- Partial Unique Index on auth_user_id
-- Ensures that when an application user is linked to a Supabase Auth identity,
-- that auth identity can NEVER be linked to more than one application user record.
-- Safely ignores existing records where auth_user_id IS NULL.

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id_unique
ON public.users(auth_user_id)
WHERE auth_user_id IS NOT NULL;


-- Part 4: Authoritative 86 Baseline Data Rows (Phase 14.2.1 Data Import)
-- ==============================================================================
-- Luma Salon — Phase 14.2.1 Strict INSERT-Only Migration Script
-- Generated At: 2026-10-17T14:03:13.745Z
-- Strategy: Atomic Transaction, Pre-Flight Guard, Fail-Fast on Any Conflict
-- ==============================================================================

BEGIN;

-- 0. PRE-FLIGHT GUARD: Ensure all target tables are clean before inserting
DO $$
BEGIN
  IF (SELECT count(*) FROM public.salons) > 0 OR
     (SELECT count(*) FROM public.staff) > 0 OR
     (SELECT count(*) FROM public.users) > 0 OR
     (SELECT count(*) FROM public.services) > 0 OR
     (SELECT count(*) FROM public.clients) > 0 OR
     (SELECT count(*) FROM public.appointments) > 0 THEN
    RAISE EXCEPTION 'Target database already contains records. Aborting INSERT-only initial migration to prevent overwriting or collisions.';
  END IF;
END $$;

-- 1. Insert Salon (1 record)
INSERT INTO public.salons (id, name, owner_name, phone, email, timezone, currency, currency_symbol, language)
VALUES ('salon-luma-01', 'Luma Salon', 'Mia', '+91 98765 43210', 'contact@lumasalon.example.com', 'Asia/Kolkata', 'INR', '₹', 'en');

-- 2. Insert Staff (20 records)
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-01', 'salon-luma-01', 'Mia Vance', '+91 98111 22334', 'mia@lumasalon.example.com', 'owner', ARRAY['Precision Cut', 'Balayage Specialist', 'Bridal Styling', 'Color Correction']::TEXT[], '11 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-02', 'salon-luma-01', 'Rohan Sen', '+91 98111 33445', 'rohan@lumasalon.example.com', 'senior_stylist', ARRAY['Balayage & Foils', 'Blonde & Toning', 'Haircut', 'Smoothening']::TEXT[], '7 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-03', 'salon-luma-01', 'Ananya Roy', '+91 98111 44556', 'ananya@lumasalon.example.com', 'colorist', ARRAY['Global Hair Color', 'Radiance Facial', 'Scalp Therapy', 'Keratin Treatment']::TEXT[], '6 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-04', 'salon-luma-01', 'Kabir Sharma', '+91 98111 55667', 'kabir@lumasalon.example.com', 'junior_stylist', ARRAY['Hair Spa Rituals', 'Texture Styling', 'Classic Manicure', 'Pedicure']::TEXT[], '4 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-05', 'salon-luma-01', 'Pooja Patel', '+91 98111 66778', 'pooja@lumasalon.example.com', 'senior_stylist', ARRAY['Haircut & Blowdry', 'Balayage & Toning', 'Hair Spa']::TEXT[], '5 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-06', 'salon-luma-01', 'Vikram Malhotra', '+91 98111 77889', 'vikram@lumasalon.example.com', 'master_stylist', ARRAY['Precision Cut', 'Global Hair Color', 'Keratin Treatment']::TEXT[], '8 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-07', 'salon-luma-01', 'Sneha Reddy', '+91 98111 88990', 'sneha@lumasalon.example.com', 'colorist', ARRAY['Radiance Facial', 'Scalp Therapy', 'Skin Glow']::TEXT[], '4 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-08', 'salon-luma-01', 'Arjun Kapoor', '+91 98111 99001', 'arjun@lumasalon.example.com', 'senior_stylist', ARRAY['Haircut & Blowdry', 'Texture Styling', 'Balayage']::TEXT[], '6 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-09', 'salon-luma-01', 'Divya Nair', '+91 98112 00112', 'divya@lumasalon.example.com', 'junior_stylist', ARRAY['Classic Manicure', 'Pedicure', 'Nail Art', 'Gel Polish']::TEXT[], '3 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-10', 'salon-luma-01', 'Karan Verma', '+91 98112 11223', 'karan@lumasalon.example.com', 'senior_stylist', ARRAY['Balayage & Foils', 'Blonde & Toning', 'Haircut']::TEXT[], '5 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-11', 'salon-luma-01', 'Meera Joshi', '+91 98112 22334', 'meera@lumasalon.example.com', 'colorist', ARRAY['Radiance Facial', 'Deep Cleansing', 'Scalp Therapy']::TEXT[], '5 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-12', 'salon-luma-01', 'Siddharth Rao', '+91 98112 33445', 'siddharth@lumasalon.example.com', 'master_stylist', ARRAY['Haircut & Blowdry', 'Keratin Treatment', 'Balayage Specialist']::TEXT[], '7 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-13', 'salon-luma-01', 'Riya Sen', '+91 98112 44556', 'riya@lumasalon.example.com', 'junior_stylist', ARRAY['Classic Manicure', 'Pedicure', 'Nail Art']::TEXT[], '2 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-14', 'salon-luma-01', 'Aditya Singhania', '+91 98112 55667', 'aditya@lumasalon.example.com', 'senior_stylist', ARRAY['Global Hair Color', 'Hair Spa & Deep Conditioning', 'Haircut']::TEXT[], '5 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-15', 'salon-luma-01', 'Tanvi Deshmukh', '+91 98112 66778', 'tanvi@lumasalon.example.com', 'colorist', ARRAY['Radiance Facial', 'Skin Glow', 'Ayurvedic Rituals']::TEXT[], '4 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-16', 'salon-luma-01', 'Manish Gupta', '+91 98112 77889', 'manish@lumasalon.example.com', 'junior_stylist', ARRAY['Hair Spa Rituals', 'Texture Styling', 'Haircut & Blowdry']::TEXT[], '3 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-17', 'salon-luma-01', 'Kavita Iyer', '+91 98112 88990', 'kavita@lumasalon.example.com', 'senior_stylist', ARRAY['Classic Manicure', 'Pedicure', 'Gel Extensions']::TEXT[], '6 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-18', 'salon-luma-01', 'Nikhil Bhatia', '+91 98112 99001', 'nikhil@lumasalon.example.com', 'senior_stylist', ARRAY['Haircut & Blowdry', 'Balayage & Toning', 'Smoothening']::TEXT[], '5 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-19', 'salon-luma-01', 'Ishita Dutta', '+91 98113 00112', 'ishita@lumasalon.example.com', 'colorist', ARRAY['Scalp Therapy', 'Radiance Facial', 'Ayurvedic Rituals']::TEXT[], '4 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);
INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('staff-20', 'salon-luma-01', 'Varun Dhawan', '+91 98113 11223', 'varun@lumasalon.example.com', 'junior_stylist', ARRAY['Haircut & Blowdry', 'Texture Styling', 'Hair Spa']::TEXT[], '2 years', true, '{"monday":{"open":"10:00","close":"20:00","isOpen":true},"tuesday":{"open":"10:00","close":"20:00","isOpen":true},"wednesday":{"open":"10:00","close":"20:00","isOpen":true},"thursday":{"open":"10:00","close":"20:00","isOpen":true},"friday":{"open":"10:00","close":"21:00","isOpen":true},"saturday":{"open":"09:30","close":"21:00","isOpen":true},"sunday":{"open":"10:00","close":"20:00","isOpen":true}}'::jsonb);

-- 3. Insert Users (23 records - auth_user_id strictly NULL)
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-owner-01', 'salon-luma-01', 'Owner 1', 'owner1@lumasalon.example.com', 'OWNER', NULL, NULL, true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-owner-02', 'salon-luma-01', 'Owner 2', 'owner2@lumasalon.example.com', 'OWNER', NULL, NULL, true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-rec-01', 'salon-luma-01', 'Receptionist 1', 'receptionist@lumasalon.example.com', 'RECEPTIONIST', NULL, NULL, true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-01', 'salon-luma-01', 'Mia Vance', 'mia@lumasalon.example.com', 'EMPLOYEE', 'staff-01', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-02', 'salon-luma-01', 'Rohan Sen', 'rohan@lumasalon.example.com', 'EMPLOYEE', 'staff-02', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-03', 'salon-luma-01', 'Ananya Roy', 'ananya@lumasalon.example.com', 'EMPLOYEE', 'staff-03', 'Skin', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-04', 'salon-luma-01', 'Kabir Sharma', 'kabir@lumasalon.example.com', 'EMPLOYEE', 'staff-04', 'Nail', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-05', 'salon-luma-01', 'Pooja Patel', 'pooja@lumasalon.example.com', 'EMPLOYEE', 'staff-05', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-06', 'salon-luma-01', 'Vikram Malhotra', 'vikram@lumasalon.example.com', 'EMPLOYEE', 'staff-06', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-07', 'salon-luma-01', 'Sneha Reddy', 'sneha@lumasalon.example.com', 'EMPLOYEE', 'staff-07', 'Skin', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-08', 'salon-luma-01', 'Arjun Kapoor', 'arjun@lumasalon.example.com', 'EMPLOYEE', 'staff-08', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-09', 'salon-luma-01', 'Divya Nair', 'divya@lumasalon.example.com', 'EMPLOYEE', 'staff-09', 'Nail', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-10', 'salon-luma-01', 'Karan Verma', 'karan@lumasalon.example.com', 'EMPLOYEE', 'staff-10', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-11', 'salon-luma-01', 'Meera Joshi', 'meera@lumasalon.example.com', 'EMPLOYEE', 'staff-11', 'Skin', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-12', 'salon-luma-01', 'Siddharth Rao', 'siddharth@lumasalon.example.com', 'EMPLOYEE', 'staff-12', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-13', 'salon-luma-01', 'Riya Sen', 'riya@lumasalon.example.com', 'EMPLOYEE', 'staff-13', 'Nail', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-14', 'salon-luma-01', 'Aditya Singhania', 'aditya@lumasalon.example.com', 'EMPLOYEE', 'staff-14', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-15', 'salon-luma-01', 'Tanvi Deshmukh', 'tanvi@lumasalon.example.com', 'EMPLOYEE', 'staff-15', 'Skin', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-16', 'salon-luma-01', 'Manish Gupta', 'manish@lumasalon.example.com', 'EMPLOYEE', 'staff-16', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-17', 'salon-luma-01', 'Kavita Iyer', 'kavita@lumasalon.example.com', 'EMPLOYEE', 'staff-17', 'Nail', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-18', 'salon-luma-01', 'Nikhil Bhatia', 'nikhil@lumasalon.example.com', 'EMPLOYEE', 'staff-18', 'Hair', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-19', 'salon-luma-01', 'Ishita Dutta', 'ishita@lumasalon.example.com', 'EMPLOYEE', 'staff-19', 'Skin', true);
INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('user-emp-20', 'salon-luma-01', 'Varun Dhawan', 'varun@lumasalon.example.com', 'EMPLOYEE', 'staff-20', 'Hair', true);

-- 4. Insert Services (10 records)
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-01', 'salon-luma-01', 'Haircut & Blowdry', 'Personalized consultation, scalp cleanse, precision haircut tailored to hair texture, and signature blowout.', 45, 600.00, 'haircut', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-02', 'salon-luma-01', 'Hair Spa & Deep Conditioning', 'Intense steam hydration mask, Ayurvedic scalp revitalization, and deep moisture repair.', 60, 1200.00, 'treatment', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-03', 'salon-luma-01', 'Global Hair Color', 'Complete rich root-to-tip permanent or demi-permanent color formulation with luminous gloss glaze.', 90, 2500.00, 'color', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-04', 'salon-luma-01', 'Balayage & Toning', 'Hand-painted dimensional highlights customized to facial contours with balancing gloss and bonding shield.', 180, 4500.00, 'color', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-05', 'salon-luma-01', 'Keratin Treatment', 'Deep anti-frizz protein bonding therapy that aligns the hair cuticle for silky, frizz-free texture.', 150, 5500.00, 'treatment', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-06', 'salon-luma-01', 'Hair Smoothening', 'Thermal cuticle restructuring and shine sealing for long-lasting, pin-straight, glossy hair.', 150, 4500.00, 'treatment', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-07', 'salon-luma-01', 'Radiance Facial Ritual', 'Gentle clarifying steam, enzymatic scrub, lymphatic facial massage, and brightening botanical mask.', 60, 1500.00, 'styling', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-08', 'salon-luma-01', 'Classic Manicure', 'Nail shaping, cuticle treatment, gentle exfoliating scrub, hand massage, and professional lacquer finish.', 40, 700.00, 'styling', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-09', 'salon-luma-01', 'Deluxe Pedicure', 'Aromatherapy foot soak, callus softening, exfoliating scrub, massage, and long-wear nail polish.', 45, 800.00, 'styling', true);
INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('srv-10', 'salon-luma-01', 'Hair Extensions Application', 'Premium seamless weft or tape-in extensions adjustment, natural blending cut, and thermal styling.', 120, 6000.00, 'extensions', true);

-- 5. Insert Clients (14 records)
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-01', 'salon-luma-01', 'Priya Sharma', '+91 98765 11001', 'priya.sharma@example.com', '1992-04-18', '{"preferredStylistId":"staff-01","preferredBeverage":"Masala Chai","hairType":"Thick, wavy, color-treated","allergies":"None","notes":"Loves caramel balayage; prefers quiet morning appointments."}'::jsonb, 'Loyal VIP client for 3 years. Books regular maintenance every 6 weeks.', 18500.00, '2026-10-11');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-02', 'salon-luma-01', 'Rahul Sethi', '+91 98765 11002', 'rahul.sethi@example.com', '1988-11-23', '{"preferredStylistId":"staff-04","preferredBeverage":"Green Tea","hairType":"Thick, straight","notes":"Fade cut on sides, scissor trim on top. Always punctual."}'::jsonb, 'Visits every 3 weeks for grooming and haircut.', 4800.00, '2026-10-05');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-03', 'salon-luma-01', 'Simran Kaur', '+91 98765 11003', 'simran.kaur@example.com', '1995-08-04', '{"preferredStylistId":"staff-04","preferredBeverage":"Ginger Lemon Tea","hairType":"Dense, long, naturally wavy","notes":"Regular hair spa client; prefers gentle scalp pressure."}'::jsonb, 'High attention to organic and ammonia-free products.', 9200.00, '2026-09-29');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-04', 'salon-luma-01', 'Ananya Kapoor', '+91 98765 11004', 'ananya.kapoor@example.com', '1984-02-14', '{"preferredStylistId":"staff-02","preferredBeverage":"Cold Coffee","hairType":"Medium density, frizzy, colored","allergies":"Mild lavender fragrance sensitivity","notes":"Keratin smoothing enthusiast; likes cool ash tone balayage."}'::jsonb, 'VIP client. Has not visited in over 2 months. Primary candidate for rebooking.', 24000.00, '2026-08-06');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-05', 'salon-luma-01', 'Aarav Singh', '+91 98765 11005', 'aarav.singh@example.com', '1979-09-30', '{"preferredStylistId":"staff-04","preferredBeverage":"Espresso","hairType":"Coarse, graying at temples"}'::jsonb, 'Executive haircut; usually schedules after 6 PM.', 3600.00, '2026-08-13');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-06', 'salon-luma-01', 'Riya Malhotra', '+91 98765 11006', 'riya.malhotra@example.com', '1998-12-10', '{"preferredStylistId":"staff-03","preferredBeverage":"Iced Green Tea","hairType":"Fine, bleached, long","notes":"Vivid toner and gloss melts; asks for post-color protein mask."}'::jsonb, 'Regularly shares salon reviews and stories on social media.', 16200.00, '2026-09-19');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-07', 'salon-luma-01', 'Neha Verma', '+91 98765 11007', 'neha.verma@example.com', '1976-06-17', '{"preferredStylistId":"staff-01","preferredBeverage":"Hot Water with Honey and Lemon","hairType":"Fine texture, prone to breakage","notes":"Requires gentle blowdry with heat shield."}'::jsonb, 'Senior corporate client. Has not booked in 85 days.', 28500.00, '2026-07-24');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-08', 'salon-luma-01', 'Mehak Arora', '+91 98765 11008', 'mehak.arora@example.com', '1991-03-25', '{"preferredStylistId":"staff-04","preferredBeverage":"Filter Coffee","hairType":"Silky, straight"}'::jsonb, 'Prefers quick haircut sessions during weekday afternoons.', 5400.00, '2026-07-14');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-09', 'salon-luma-01', 'Kavya Mehta', '+91 98765 11009', 'kavya.mehta@example.com', '2001-07-09', '{"preferredStylistId":"staff-03","preferredBeverage":"Lemon Ice Tea","hairType":"Wavy, medium, highlights","notes":"Loves golden honey tones."}'::jsonb, 'College student, usually visits on weekends.', 8100.00, '2026-09-12');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-10', 'salon-luma-01', 'Ishita Bansal', '+91 98765 11010', 'ishita.bansal@example.com', '1985-05-12', '{"preferredStylistId":"staff-01","preferredBeverage":"Sparkling Water","hairType":"Medium curly, dry ends"}'::jsonb, 'Always books haircut with deep hair spa.', 6700.00, '2026-10-03');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-11', 'salon-luma-01', 'Pooja Khanna', '+91 98765 11011', 'pooja.khanna@example.com', '1993-10-28', '{"preferredStylistId":"staff-02","preferredBeverage":"Cappuccino","hairType":"Long, straight, thick","notes":"Subtle chocolate brown global color with gloss."}'::jsonb, 'Referred by Priya Sharma.', 7900.00, '2026-09-05');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-12', 'salon-luma-01', 'Nisha Gupta', '+91 98765 11012', 'nisha.gupta@example.com', '1990-01-19', '{"preferredStylistId":"staff-01","preferredBeverage":"Warm Water","hairType":"Shoulder length, straight"}'::jsonb, 'Prefers curtain bangs and volume round-brush styling.', 2400.00, '2026-10-14');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-13', 'salon-luma-01', 'Aditi Chawla', '+91 98765 11013', 'aditi.chawla@example.com', '1987-08-16', '{"preferredStylistId":"staff-04","preferredBeverage":"Peach Iced Tea","hairType":"Curly, coarse"}'::jsonb, 'Interested in seasonal scalp detox treatments.', 1500.00, '2026-10-16');
INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('cli-14', 'salon-luma-01', 'Sakshi Arora', '+91 98765 11014', 'sakshi.arora@example.com', '1996-12-03', '{"preferredStylistId":"staff-01","preferredBeverage":"Cold Coffee with Almond Milk","hairType":"Wavy, fine, blonde highlights"}'::jsonb, 'First time booking online. Inquired about global color & gloss.', 0.00, NULL);

-- 6. Insert Appointments (18 records with historical snapshots)
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-01', 'salon-luma-01', 'cli-12', 'staff-01', 'staff-01', 'srv-01', '2026-10-17', '09:00', '09:45', 'completed', 600.00, 'Client requested subtle curtain bangs and root lift.', false, NULL, NULL, 'Nisha Gupta', NULL, NULL, 'Mia Vance', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-02', 'salon-luma-01', 'cli-02', 'staff-04', 'staff-04', 'srv-01', '2026-10-17', '10:15', '11:00', 'completed', 600.00, 'Classic taper cut on sides with textured top.', false, NULL, NULL, 'Rahul Sethi', NULL, NULL, 'Kabir Sharma', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-03', 'salon-luma-01', 'cli-01', 'staff-02', 'staff-02', 'srv-04', '2026-10-17', '11:30', '14:30', 'confirmed', 4500.00, 'Warm caramel balayage refresh with bonding treatment.', false, NULL, NULL, 'Priya Sharma', NULL, NULL, 'Rohan Sen', 'Balayage & Toning');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-04', 'salon-luma-01', 'cli-14', 'staff-01', 'staff-01', 'srv-03', '2026-10-17', '14:45', '16:15', 'confirmed', 2500.00, 'New client consultation + rich chocolate global color.', false, NULL, NULL, 'Sakshi Arora', NULL, NULL, 'Mia Vance', 'Global Hair Color');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-05', 'salon-luma-01', 'cli-03', 'staff-04', 'staff-04', 'srv-02', '2026-10-17', '16:30', '17:30', 'scheduled', 1200.00, 'Includes steam hydration and scalp therapy.', false, NULL, NULL, 'Simran Kaur', NULL, NULL, 'Kabir Sharma', 'Hair Spa & Deep Conditioning');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-06', 'salon-luma-01', 'cli-06', 'staff-03', 'staff-03', 'srv-07', '2026-10-17', '18:00', '19:00', 'scheduled', 1500.00, 'Herbal facial ritual before weekend destination wedding.', false, NULL, NULL, 'Riya Malhotra', NULL, NULL, 'Ananya Roy', 'Radiance Facial Ritual');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-07', 'salon-luma-01', 'cli-13', 'staff-04', 'staff-04', 'srv-02', '2026-10-16', '11:00', '12:00', 'completed', 1200.00, NULL, false, NULL, NULL, 'Aditi Chawla', NULL, NULL, 'Kabir Sharma', 'Hair Spa & Deep Conditioning');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-08', 'salon-luma-01', 'cli-10', 'staff-01', 'staff-01', 'srv-01', '2026-10-16', '14:00', '14:45', 'completed', 600.00, NULL, false, NULL, NULL, 'Ishita Bansal', NULL, NULL, 'Mia Vance', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-09', 'salon-luma-01', 'cli-08', 'staff-04', 'staff-04', 'srv-01', '2026-10-15', '15:30', '16:15', 'cancelled', 600.00, 'Client informed 3 hours prior due to urgent office travel.', false, NULL, NULL, 'Mehak Arora', NULL, NULL, 'Kabir Sharma', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-10', 'salon-luma-01', 'cli-05', 'staff-04', 'staff-04', 'srv-01', '2026-10-14', '16:00', '16:45', 'no-show', 600.00, 'Did not respond to WhatsApp confirmation or reminder call.', false, NULL, NULL, 'Aarav Singh', NULL, NULL, 'Kabir Sharma', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-11', 'salon-luma-01', 'cli-09', 'staff-03', 'staff-03', 'srv-02', '2026-10-13', '13:00', '14:00', 'completed', 1200.00, NULL, false, NULL, NULL, 'Kavya Mehta', NULL, NULL, 'Ananya Roy', 'Hair Spa & Deep Conditioning');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-12', 'salon-luma-01', 'cli-04', 'staff-02', 'staff-02', 'srv-05', '2026-10-18', '10:30', '13:00', 'confirmed', 5500.00, 'Rebooked after smart reminder outreach. Send confirmation.', false, NULL, NULL, 'Ananya Kapoor', NULL, NULL, 'Rohan Sen', 'Keratin Treatment');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-13', 'salon-luma-01', 'cli-07', 'staff-01', 'staff-01', 'srv-01', '2026-10-18', '14:00', '14:45', 'confirmed', 600.00, 'Include gentle scalp massage.', false, NULL, NULL, 'Neha Verma', NULL, NULL, 'Mia Vance', 'Haircut & Blowdry');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-14', 'salon-luma-01', 'cli-11', 'staff-02', 'staff-02', 'srv-03', '2026-10-19', '11:00', '12:30', 'scheduled', 2500.00, NULL, false, NULL, NULL, 'Pooja Khanna', NULL, NULL, 'Rohan Sen', 'Global Hair Color');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-15', 'salon-luma-01', 'cli-01', 'staff-01', 'staff-01', 'srv-08', '2026-10-20', '15:00', '15:40', 'scheduled', 700.00, 'Nude pink gel finish.', false, NULL, NULL, 'Priya Sharma', NULL, NULL, 'Mia Vance', 'Classic Manicure');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-16', 'salon-luma-01', 'cli-02', 'staff-04', 'staff-04', 'srv-09', '2026-10-21', '12:00', '12:45', 'scheduled', 800.00, NULL, false, NULL, NULL, 'Rahul Sethi', NULL, NULL, 'Kabir Sharma', 'Deluxe Pedicure');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-17', 'salon-luma-01', 'cli-06', 'staff-03', 'staff-03', 'srv-10', '2026-10-22', '13:00', '15:00', 'confirmed', 6000.00, 'Full row adjustment and styling.', false, NULL, NULL, 'Riya Malhotra', NULL, NULL, 'Ananya Roy', 'Hair Extensions Application');
INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('apt-18', 'salon-luma-01', 'cli-10', 'staff-01', 'staff-01', 'srv-01', '2026-10-23', '15:00', '15:45', 'scheduled', 600.00, NULL, false, NULL, NULL, 'Ishita Bansal', NULL, NULL, 'Mia Vance', 'Haircut & Blowdry');

-- 7. POST-IMPORT VERIFICATION: Ensure exact expected row counts are present before commit
DO $$
DECLARE
  v_salons INT;
  v_staff INT;
  v_users INT;
  v_services INT;
  v_clients INT;
  v_appointments INT;
BEGIN
  SELECT count(*) INTO v_salons FROM public.salons;
  SELECT count(*) INTO v_staff FROM public.staff;
  SELECT count(*) INTO v_users FROM public.users;
  SELECT count(*) INTO v_services FROM public.services;
  SELECT count(*) INTO v_clients FROM public.clients;
  SELECT count(*) INTO v_appointments FROM public.appointments;

  IF v_salons != 1 OR
     v_staff != 20 OR
     v_users != 23 OR
     v_services != 10 OR
     v_clients != 14 OR
     v_appointments != 18 THEN
    RAISE EXCEPTION 'Post-import row count mismatch! Rolling back. (Found: salons=%, staff=%, users=%, services=%, clients=%, appointments=%)',
      v_salons, v_staff, v_users, v_services, v_clients, v_appointments;
  END IF;
END $$;

COMMIT;

COMMIT;
