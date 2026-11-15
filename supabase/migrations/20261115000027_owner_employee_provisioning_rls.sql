-- ==============================================================================
-- MIGRATION: 20261115000027_owner_employee_provisioning_rls.sql
-- PURPOSE:
-- 1. Strictly enforce Root Administrator authority to provision & govern Salon Owner accounts.
-- 2. Empower Salon Owners (e.g. Raman, Manish) to onboard, create, update, and manage
--    Employee and Receptionist user accounts in public.users.
-- ==============================================================================

-- 1. INSERT POLICY
DROP POLICY IF EXISTS "Users insertable by administrator or owner" ON public.users;
DROP POLICY IF EXISTS "Users insertable only by owners" ON public.users;
CREATE POLICY "Users insertable by administrator or owner"
    ON public.users FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Root Administrator can create Owner accounts
        (role = 'OWNER' AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)))
        OR
        -- Salon Owners can create Employee & Receptionist accounts for their salon
        (
            role IN ('EMPLOYEE', 'RECEPTIONIST')
            AND (salon_id = public.current_user_salon_id() OR public.is_owner())
        )
    );

-- 2. UPDATE POLICY
DROP POLICY IF EXISTS "Users updatable by administrator or owner" ON public.users;
DROP POLICY IF EXISTS "Users updatable only by owners" ON public.users;
CREATE POLICY "Users updatable by administrator or owner"
    ON public.users FOR UPDATE
    TO authenticated
    USING (
        -- Root Administrator can manage Owner accounts
        (role = 'OWNER' AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)))
        OR
        -- Salon Owners can manage Employee & Receptionist accounts (cannot modify Owners)
        (
            role IN ('EMPLOYEE', 'RECEPTIONIST')
            AND (salon_id = public.current_user_salon_id() OR public.is_owner())
        )
    )
    WITH CHECK (
        (role = 'OWNER' AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)))
        OR
        (
            role IN ('EMPLOYEE', 'RECEPTIONIST')
            AND (salon_id = public.current_user_salon_id() OR public.is_owner())
        )
    );

-- 3. DELETE POLICY
DROP POLICY IF EXISTS "Users deletable by administrator or owner" ON public.users;
DROP POLICY IF EXISTS "Users deletable only by owners" ON public.users;
CREATE POLICY "Users deletable by administrator or owner"
    ON public.users FOR DELETE
    TO authenticated
    USING (
        -- Root Administrator can delete Owner accounts
        (role = 'OWNER' AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)))
        OR
        -- Salon Owners can delete Employee & Receptionist accounts (cannot delete Owners)
        (
            role IN ('EMPLOYEE', 'RECEPTIONIST')
            AND (salon_id = public.current_user_salon_id() OR public.is_owner())
        )
    );
