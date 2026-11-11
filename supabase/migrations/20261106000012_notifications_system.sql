-- ==============================================================================
-- Luma Salon — Migration 000012: Centralized Notifications & Preferences
-- Phase 8.1 Hardened: 15-Minute Window Deduplication, Persistent Dismissal & RLS
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. TABLE: public.notifications
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id TEXT PRIMARY KEY DEFAULT ('notif-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    recipient_user_id TEXT,
    target_role TEXT NOT NULL DEFAULT 'ALL' 
        CHECK (target_role IN ('ALL', 'OWNER', 'RECEPTIONIST', 'EMPLOYEE', 'ADMIN')),
    category TEXT NOT NULL 
        CHECK (category IN ('appointment', 'operational', 'inventory', 'financial', 'system')),
    severity TEXT NOT NULL DEFAULT 'info' 
        CHECK (severity IN ('info', 'success', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    action_url TEXT,
    deduplication_key TEXT,
    dedup_bucket BIGINT NOT NULL DEFAULT (floor(extract(epoch from now()) / 900)::bigint),
    is_read BOOLEAN NOT NULL DEFAULT false,
    read_at TIMESTAMPTZ,
    is_dismissed BOOLEAN NOT NULL DEFAULT false,
    dismissed_at TIMESTAMPTZ,
    dismissed_by TEXT,
    delivery_channels JSONB DEFAULT '{"inApp": true}'::jsonb,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    -- Tenant isolation and 15-minute bucketed deduplication constraint:
    -- Prevents concurrent duplicate insertion within the same 15-minute epoch bucket (900 seconds)
    -- Allows legitimate recurring events to re-trigger after window expiration
    CONSTRAINT uq_notification_salon_dedup_bucket UNIQUE (salon_id, deduplication_key, dedup_bucket)
);

CREATE INDEX IF NOT EXISTS idx_notifications_salon_created ON public.notifications(salon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(salon_id, recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_role ON public.notifications(salon_id, target_role);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(salon_id, is_read) WHERE is_read = false AND is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_notifications_active ON public.notifications(salon_id, is_dismissed) WHERE is_dismissed = false;

-- Trigger: 15-minute continuous sliding-window deduplication guard
CREATE OR REPLACE FUNCTION public.fn_notification_dedup_sliding_window()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.deduplication_key IS NOT NULL THEN
        -- Check if an active notification with identical key was created within the last 15 minutes
        IF EXISTS (
            SELECT 1 FROM public.notifications
            WHERE salon_id = NEW.salon_id
              AND deduplication_key = NEW.deduplication_key
              AND is_dismissed = false
              AND created_at > (NEW.created_at - interval '15 minutes')
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_EVENT_WINDOW: Notification with key % already exists within 15-minute window', NEW.deduplication_key;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_dedup_window ON public.notifications;
CREATE TRIGGER trg_notification_dedup_window
    BEFORE INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_notification_dedup_sliding_window();

-- ==============================================================================
-- 2. TABLE: public.notification_preferences
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id TEXT PRIMARY KEY DEFAULT ('pref-' || gen_random_uuid()),
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    appointment_alerts BOOLEAN NOT NULL DEFAULT true,
    operational_alerts BOOLEAN NOT NULL DEFAULT true,
    inventory_alerts BOOLEAN NOT NULL DEFAULT true,
    financial_alerts BOOLEAN NOT NULL DEFAULT true,
    sound_enabled BOOLEAN NOT NULL DEFAULT true,
    email_digest BOOLEAN NOT NULL DEFAULT false,
    sms_critical_only BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT uq_pref_salon_user UNIQUE (salon_id, user_id),
    -- Mandatory alerts cannot be suppressed at the database constraint level
    CONSTRAINT chk_pref_mandatory_operational CHECK (operational_alerts = true),
    CONSTRAINT chk_pref_mandatory_financial CHECK (financial_alerts = true)
);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- 3.1 Notifications SELECT Policy: Tenant-isolated and role-filtered
DROP POLICY IF EXISTS "Notifications readable by authorized roles" ON public.notifications;
CREATE POLICY "Notifications readable by authorized roles"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        AND (
            target_role = 'ALL'
            OR (target_role = 'OWNER' AND public.is_owner_or_receptionist())
            OR (target_role = 'RECEPTIONIST' AND public.is_owner_or_receptionist())
            OR (target_role = 'EMPLOYEE' AND (recipient_user_id IS NULL OR recipient_user_id = public.current_user_staff_id()))
        )
    );

-- 3.2 Notifications INSERT Policy: Authenticated salon staff can trigger events
DROP POLICY IF EXISTS "Notifications insertable by salon staff" ON public.notifications;
CREATE POLICY "Notifications insertable by salon staff"
    ON public.notifications FOR INSERT
    TO authenticated
    WITH CHECK (
        salon_id = public.current_user_salon_id()
    );

-- 3.3 Notifications UPDATE Policy: Users can update read and dismissal flags within salon
DROP POLICY IF EXISTS "Notifications updatable by recipient" ON public.notifications;
CREATE POLICY "Notifications updatable by recipient"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
    )
    WITH CHECK (
        salon_id = public.current_user_salon_id()
    );

-- 3.4 Preferences Policies
DROP POLICY IF EXISTS "Preferences readable by owner user" ON public.notification_preferences;
CREATE POLICY "Preferences readable by owner user"
    ON public.notification_preferences FOR SELECT
    TO authenticated
    USING (salon_id = public.current_user_salon_id());

DROP POLICY IF EXISTS "Preferences manageable by user" ON public.notification_preferences;
CREATE POLICY "Preferences manageable by user"
    ON public.notification_preferences FOR ALL
    TO authenticated
    USING (salon_id = public.current_user_salon_id())
    WITH CHECK (salon_id = public.current_user_salon_id());

-- ==============================================================================
-- 4. PRIVILEGE HARDENING (GRANT & REVOKE)
-- ==============================================================================
REVOKE ALL ON public.notifications FROM PUBLIC, anon;
REVOKE ALL ON public.notification_preferences FROM PUBLIC, anon;

-- Notifications: Authenticated users can SELECT and INSERT. DELETE is permanently revoked.
-- Column-level UPDATE is granted only for read and dismissal management.
GRANT SELECT, INSERT ON public.notifications TO authenticated;
GRANT UPDATE (is_read, read_at, is_dismissed, dismissed_at, dismissed_by) ON public.notifications TO authenticated;
REVOKE DELETE ON public.notifications FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

COMMIT;
