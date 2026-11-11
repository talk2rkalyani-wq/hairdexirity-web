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

