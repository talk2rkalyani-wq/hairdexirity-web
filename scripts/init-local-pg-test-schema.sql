-- ==============================================================================
-- Luma Salon — Local PostgreSQL Test Schema Initialization
-- Sets up isolated schemas, auth mocks, and base tables for concurrency testing
-- ==============================================================================

BEGIN;

-- 1. Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
    END IF;
END $$;

-- 2. Auth Schema Mock
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- auth.uid() resolves caller UUID from session setting request.jwt.claim.sub
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- 3. Base Public Tables
CREATE TABLE IF NOT EXISTS public.salons (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.staff (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'senior_stylist',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    auth_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('OWNER', 'RECEPTIONIST', 'EMPLOYEE', 'ADMIN')),
    employee_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.services (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0,
    duration_minutes INT NOT NULL DEFAULT 60,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.appointments (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
    staff_id TEXT REFERENCES public.staff(id) ON DELETE SET NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'confirmed',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Session Helper Functions
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

GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 5. Seed Core Tenants & Identities for Concurrency Testing
INSERT INTO public.salons (id, name, owner_name)
VALUES 
    ('salon-luma-01', 'Luma Salon Indiranagar', 'Ananya Sharma'),
    ('salon-foreign-999', 'Competitor Salon Koramangala', 'Foreign Owner')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email)
VALUES 
    ('00000000-0000-0000-0000-000000000001', 'owner@lumasalon.com'),
    ('00000000-0000-0000-0000-000000000002', 'receptionist@lumasalon.com'),
    ('00000000-0000-0000-0000-000000000003', 'stylist@lumasalon.com'),
    ('00000000-0000-0000-0000-000000000999', 'foreign@salon.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.staff (id, salon_id, name, role)
VALUES 
    ('staff-1', 'salon-luma-01', 'Mia Patel', 'senior_stylist'),
    ('staff-2', 'salon-luma-01', 'Rajesh Kumar', 'master_stylist')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, salon_id, auth_user_id, name, email, role, employee_id)
VALUES 
    ('usr-owner', 'salon-luma-01', '00000000-0000-0000-0000-000000000001', 'Ananya Sharma', 'owner@lumasalon.com', 'OWNER', NULL),
    ('usr-rec', 'salon-luma-01', '00000000-0000-0000-0000-000000000002', 'Pooja Nair', 'receptionist@lumasalon.com', 'RECEPTIONIST', NULL),
    ('usr-emp', 'salon-luma-01', '00000000-0000-0000-0000-000000000003', 'Mia Patel', 'stylist@lumasalon.com', 'EMPLOYEE', 'staff-1'),
    ('usr-foreign', 'salon-foreign-999', '00000000-0000-0000-0000-000000000999', 'Foreign User', 'foreign@salon.com', 'OWNER', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, salon_id, name, phone)
VALUES 
    ('client-1', 'salon-luma-01', 'Rahul Sharma', '+91 98765 43210'),
    ('client-2', 'salon-luma-01', 'Priya Patel', '+91 98765 43211')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.services (id, salon_id, name, price)
VALUES 
    ('srv-1', 'salon-luma-01', 'Hair Styling & Cut', 1000.00),
    ('srv-2', 'salon-luma-01', 'Hair Spa', 1500.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.appointments (id, salon_id, client_id, staff_id, service_id, status)
VALUES 
    ('apt-test-1', 'salon-luma-01', 'client-1', 'staff-1', 'srv-1', 'confirmed'),
    ('apt-test-2', 'salon-luma-01', 'client-2', 'staff-2', 'srv-2', 'confirmed')
ON CONFLICT (id) DO NOTHING;

COMMIT;

