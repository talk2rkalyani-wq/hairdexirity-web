-- Migration: 20261115000024_staff_client_service_sync.sql
-- Description: Ensures public.staff, public.clients, and public.services schema columns and RLS policies
-- fully support real-time cloud persistence from Salon Owners and Administrators.

-- ==============================================================================
-- 1. PUBLIC.STAFF COLUMNS & CONSTRAINTS
-- ==============================================================================
ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
ADD COLUMN IF NOT EXISTS job_title TEXT;

ALTER TABLE public.staff ALTER COLUMN phone DROP NOT NULL;
ALTER TABLE public.staff ALTER COLUMN email DROP NOT NULL;

-- Allow owners & administrators full access to public.staff
DROP POLICY IF EXISTS "Staff list viewable by authenticated users" ON public.staff;
CREATE POLICY "Staff list viewable by authenticated users"
    ON public.staff FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Staff insertable only by owners" ON public.staff;
CREATE POLICY "Staff insertable only by owners"
    ON public.staff FOR INSERT
    TO authenticated
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Staff updatable only by owners" ON public.staff;
CREATE POLICY "Staff updatable only by owners"
    ON public.staff FOR UPDATE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    )
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Staff deletable only by owners" ON public.staff;
CREATE POLICY "Staff deletable only by owners"
    ON public.staff FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

-- ==============================================================================
-- 2. PUBLIC.CLIENTS RLS & CONSTRAINTS
-- ==============================================================================
ALTER TABLE public.clients ALTER COLUMN email DROP NOT NULL;

DROP POLICY IF EXISTS "Clients readable by authenticated salon users" ON public.clients;
CREATE POLICY "Clients readable by authenticated salon users"
    ON public.clients FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Clients insertable by salon staff" ON public.clients;
CREATE POLICY "Clients insertable by salon staff"
    ON public.clients FOR INSERT
    TO authenticated
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Clients updatable by salon staff" ON public.clients;
CREATE POLICY "Clients updatable by salon staff"
    ON public.clients FOR UPDATE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    )
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Clients deletable by owners" ON public.clients;
CREATE POLICY "Clients deletable by owners"
    ON public.clients FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

-- ==============================================================================
-- 3. PUBLIC.SERVICES RLS & CONSTRAINTS
-- ==============================================================================
DROP POLICY IF EXISTS "Services list viewable by authenticated users" ON public.services;
CREATE POLICY "Services list viewable by authenticated users"
    ON public.services FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Services insertable only by owners" ON public.services;
CREATE POLICY "Services insertable only by owners"
    ON public.services FOR INSERT
    TO authenticated
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Services updatable only by owners" ON public.services;
CREATE POLICY "Services updatable only by owners"
    ON public.services FOR UPDATE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    )
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Services deletable only by owners" ON public.services;
CREATE POLICY "Services deletable only by owners"
    ON public.services FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
