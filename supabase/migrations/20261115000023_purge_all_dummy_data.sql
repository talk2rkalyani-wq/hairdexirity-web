-- Migration: 20261115000023_purge_all_dummy_data.sql
-- Description: Purges all dummy data (staff, clients, services, appointments, and non-owner users)
-- while strictly preserving Owner accounts and the Root Administrator account.

-- 1. Delete all appointments
DELETE FROM public.appointments;

-- 2. Delete all dummy staff profiles
DELETE FROM public.staff;

-- 3. Delete all dummy clients
DELETE FROM public.clients;

-- 4. Delete all dummy services
DELETE FROM public.services;

-- 5. Delete all dummy non-owner users (strictly keep role = 'OWNER')
DELETE FROM public.users WHERE role != 'OWNER';

-- 6. RPC function for administrative dummy data purging
CREATE OR REPLACE FUNCTION public.admin_purge_all_dummy_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
    v_users_count integer;
    v_staff_count integer;
    v_clients_count integer;
    v_services_count integer;
    v_appointments_count integer;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Only platform Root Administrator can purge dummy data.';
    END IF;

    DELETE FROM public.appointments;
    GET DIAGNOSTICS v_appointments_count = ROW_COUNT;

    DELETE FROM public.users WHERE role != 'OWNER';
    GET DIAGNOSTICS v_users_count = ROW_COUNT;

    DELETE FROM public.staff;
    GET DIAGNOSTICS v_staff_count = ROW_COUNT;

    DELETE FROM public.clients;
    GET DIAGNOSTICS v_clients_count = ROW_COUNT;

    DELETE FROM public.services;
    GET DIAGNOSTICS v_services_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'users_deleted', v_users_count,
        'staff_deleted', v_staff_count,
        'clients_deleted', v_clients_count,
        'services_deleted', v_services_count,
        'appointments_deleted', v_appointments_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_all_dummy_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_dummy_data() TO authenticated;
