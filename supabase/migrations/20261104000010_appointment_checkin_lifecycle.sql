-- Migration: Add checked_in and in_progress statuses and operational timestamps
-- Migration ID: 20261104000010_appointment_checkin_lifecycle.sql
-- Target: public.appointments

BEGIN;

-- 1. Drop the legacy check constraint
ALTER TABLE public.appointments 
  DROP CONSTRAINT IF EXISTS appointments_status_check;

-- 2. Apply updated check constraint with active 7-stage lifecycle
ALTER TABLE public.appointments 
  ADD CONSTRAINT appointments_status_check 
  CHECK (status IN (
    'scheduled', 
    'confirmed', 
    'checked_in', 
    'in_progress', 
    'completed', 
    'cancelled', 
    'no-show'
  ));

-- 3. Add operational timestamps and tracking fields
ALTER TABLE public.appointments 
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 4. Create performance indexes for operational queries
CREATE INDEX IF NOT EXISTS idx_appointments_status_date 
  ON public.appointments(date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_active_ops 
  ON public.appointments(date, status) 
  WHERE status IN ('checked_in', 'in_progress');

COMMENT ON COLUMN public.appointments.checked_in_at IS 'Timestamp when the client physically arrived at reception and was checked in';
COMMENT ON COLUMN public.appointments.service_started_at IS 'Timestamp when the stylist began the service on the salon floor';
COMMENT ON COLUMN public.appointments.completed_at IS 'Timestamp when the service was concluded and checkout initiated';

COMMIT;

