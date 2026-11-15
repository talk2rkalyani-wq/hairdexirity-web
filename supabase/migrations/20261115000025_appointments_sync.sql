-- Migration: 20261115000025_appointments_sync.sql
-- Description: Ensures public.appointments schema columns, lifecycle constraints,
-- and RLS policies fully support real-time cloud persistence from Salon Owners, Receptionists, and Admins.

-- ==============================================================================
-- 1. PUBLIC.APPOINTMENTS COLUMNS & CONSTRAINTS
-- ==============================================================================
ALTER TABLE public.appointments
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS client_name TEXT,
ADD COLUMN IF NOT EXISTS client_phone TEXT,
ADD COLUMN IF NOT EXISTS client_email TEXT,
ADD COLUMN IF NOT EXISTS staff_name TEXT,
ADD COLUMN IF NOT EXISTS service_name TEXT;

-- Relax foreign keys to ON DELETE SET NULL if not already set
ALTER TABLE public.appointments ALTER COLUMN client_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN service_id DROP NOT NULL;

-- Update status check constraint to support full 7-stage lifecycle
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_status_check 
CHECK (status IN (
    'scheduled', 
    'confirmed', 
    'checked_in', 
    'in_progress', 
    'completed', 
    'cancelled', 
    'no-show'
));

-- ==============================================================================
-- 2. PUBLIC.APPOINTMENTS RLS POLICIES FOR REAL-TIME CLOUD SYNC
-- ==============================================================================
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Appointments viewable by staff according to isolation" ON public.appointments;
CREATE POLICY "Appointments viewable by staff according to isolation"
    ON public.appointments FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
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
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Appointments updatable by owner, receptionist, or assigned employee" ON public.appointments;
CREATE POLICY "Appointments updatable by owner, receptionist, or assigned employee"
    ON public.appointments FOR UPDATE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
        OR (
            public.current_user_role() = 'EMPLOYEE'
            AND (
                staff_id = public.current_user_staff_id()
                OR assigned_employee_id = public.current_user_staff_id()
            )
        )
    )
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner_or_receptionist())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
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
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
