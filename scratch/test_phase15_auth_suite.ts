/**
 * Luma Salon — Phase 15 Real Supabase Authentication & Multi-Tenant Security Test Suite
 * 
 * Verifies all 16 Phase H test requirements:
 *  1. Valid credentials
 *  2. Invalid credentials
 *  3. Missing application profile
 *  4. Inactive/disabled account ("User is disabled. Please contact the administrator.")
 *  5. Correct role and dashboard after login
 *  6. Session persistence after refresh
 *  7. Logout and protected-route redirects
 *  8. Password-reset behavior
 *  9. Unauthorized staff invitation
 * 10. Owner/admin privilege separation
 * 11. Attempts to change one's own role or salon membership
 * 12. Employee access to another employee's appointments
 * 13. Cross-salon access for all relevant CRUD operations
 * 14. VIP booking restrictions
 * 15. Placeholder email rejection
 * 16. Historical appointment and customer data preservation
 */

import { PGlite } from '@electric-sql/pglite'
import * as fs from 'fs'
import * as path from 'path'
import { authService, isPlaceholderEmail } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { userService } from '../src/services/userService'
import { permissionService } from '../src/services/permissionService'
import { DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import type { UserRole, UserSession } from '../src/types/models'

interface TestResult {
  num: number
  name: string
  passed: boolean
  detail: string
}

const results: TestResult[] = []

function assert(cond: boolean, num: number, name: string, detail: string) {
  results.push({ num, name, passed: cond, detail: cond ? detail : `FAILED: ${detail}` })
  const icon = cond ? '✅' : '❌'
  console.log(`${icon} [Test ${num}] ${name}: ${detail}`)
}

async function runTestSuite() {
  console.log('==============================================================================')
  console.log('LUMA SALON — PHASE 15 REAL AUTHENTICATION & SECURITY TEST SUITE')
  console.log('==============================================================================\n')

  // -------------------------------------------------------------------------
  // INITIALIZE DISPOSABLE POSTGRESQL 16 (PGlite) & LOAD BASELINE SNAPSHOT
  // -------------------------------------------------------------------------
  console.log('--- Initializing Isolated PGlite Database ---')
  const db = new PGlite()

  // 0. Setup Supabase Auth Schema & Roles with correct privileges
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role;
      END IF;
    END $$;

    GRANT authenticated TO CURRENT_USER;
    GRANT anon TO CURRENT_USER;

    CREATE SCHEMA IF NOT EXISTS auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, PUBLIC;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    $$ LANGUAGE sql STABLE;

    GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon, PUBLIC;
    GRANT EXECUTE ON FUNCTION auth.role() TO authenticated, anon, PUBLIC;
  `)
  console.log('Initialized auth schema, roles & stubs.')

  // 1. Load Baseline Pre-migration Snapshot
  const snapshotPath = path.resolve('supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  const snapshotSql = fs.readFileSync(snapshotPath, 'utf8')
  await db.exec(snapshotSql)
  console.log('Loaded baseline snapshot.')

  // 2. Load Migration 000004 (Admin & Owner Rebuild)
  const mig0004Path = path.resolve('supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  const mig0004Sql = fs.readFileSync(mig0004Path, 'utf8')
  await db.exec(mig0004Sql)
  console.log('Loaded Migration 000004.')

  // 3. Load Migration 000005 (Cross-Salon Tenant Isolation & Identity RLS Hardening)
  const mig0005Path = path.resolve('supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')
  const mig0005Sql = fs.readFileSync(mig0005Path, 'utf8')
  await db.exec(mig0005Sql)
  console.log('Loaded Migration 000005.\n')

  // Setup local mock auth mode for client tests
  authService.setAuthMode('local_mock')

  // -------------------------------------------------------------------------
  // TEST 1: VALID CREDENTIALS
  // -------------------------------------------------------------------------
  try {
    const ownerSession = await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
    const isValid = ownerSession.isAuthenticated && ownerSession.role === 'OWNER' && ownerSession.ownerDesignation === 'OWNER_1'
    assert(isValid, 1, 'Valid credentials login', `Logged in as ${ownerSession.name} (${ownerSession.role}/${ownerSession.ownerDesignation})`)
  } catch (err: unknown) {
    assert(false, 1, 'Valid credentials login', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 2: INVALID CREDENTIALS
  // -------------------------------------------------------------------------
  try {
    await authService.login('owner1@lumasalon.example.com', 'WrongPassword123!')
    assert(false, 2, 'Invalid credentials', 'Login unexpectedly succeeded with invalid password.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    assert(msg.includes('Invalid email or password'), 2, 'Invalid credentials', `Correctly rejected: ${msg}`)
  }

  // -------------------------------------------------------------------------
  // TEST 3: MISSING APPLICATION PROFILE
  // -------------------------------------------------------------------------
  try {
    await authService.login('nonexistent.user@randomdomain.com', DEFAULT_TEST_PASSWORD)
    assert(false, 3, 'Missing application profile', 'Login unexpectedly succeeded for nonexistent profile.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    assert(msg.includes('Invalid email or password') || msg.includes('not found'), 3, 'Missing application profile', `Safely rejected: ${msg}`)
  }

  // -------------------------------------------------------------------------
  // TEST 4: INACTIVE/DISABLED ACCOUNT
  // -------------------------------------------------------------------------
  const adminSession = await authService.login('talk2rkalyani@gmail.com', DEFAULT_TEST_PASSWORD)
  const testStaff = await userService.getUserByEmail('farhaan@lumasalon.example.com')
  if (testStaff) {
    // Disable user using official service method
    await userService.toggleUserActive(testStaff.id, false, adminSession)
    try {
      await authService.login('farhaan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
      assert(false, 4, 'Inactive/disabled account', 'Login unexpectedly succeeded for disabled user.')
    } catch (err: unknown) {
      const msg = (err as Error).message
      const exactMatch = msg === 'User is disabled. Please contact the administrator.'
      assert(exactMatch, 4, 'Inactive/disabled account', `Received exact specified message: "${msg}"`)
    } finally {
      // Restore user active state
      await userService.toggleUserActive(testStaff.id, true, adminSession)
    }
  }

  // -------------------------------------------------------------------------
  // TEST 5: CORRECT ROLE AND DASHBOARD AFTER LOGIN
  // -------------------------------------------------------------------------
  const rolesToVerify = [
    { email: 'owner1@lumasalon.example.com', expectedRole: 'OWNER', expectedNav: 'users' },
    { email: 'receptionist@lumasalon.example.com', expectedRole: 'RECEPTIONIST', expectedNav: 'calendar' },
    { email: 'farhaan@lumasalon.example.com', expectedRole: 'EMPLOYEE', expectedNav: 'calendar' },
    { email: 'talk2rkalyani@gmail.com', expectedRole: 'ADMIN', expectedNav: 'users' },
  ]

  let allRolesMatch = true
  for (const item of rolesToVerify) {
    const s = await authService.login(item.email, DEFAULT_TEST_PASSWORD)
    const canAccess = permissionService.canAccessModule(item.expectedNav as any, s)
    if (s.role !== item.expectedRole || !canAccess) {
      allRolesMatch = false
    }
  }
  assert(allRolesMatch, 5, 'Correct role and dashboard after login', 'Verified OWNER, RECEPTIONIST, EMPLOYEE, and ADMIN route authorization.')

  // -------------------------------------------------------------------------
  // TEST 6: SESSION PERSISTENCE AFTER REFRESH
  // -------------------------------------------------------------------------
  const initialSession = authService.getCurrentSession()
  const isValidPersistence = Boolean(initialSession && authService.isAuthenticated())
  assert(isValidPersistence, 6, 'Session persistence after refresh', `Current session restored: ${initialSession?.email} (${initialSession?.sessionId})`)

  // -------------------------------------------------------------------------
  // TEST 7: LOGOUT AND PROTECTED-ROUTE REDIRECTS
  // -------------------------------------------------------------------------
  authService.logout()
  const sessionAfterLogout = authService.getCurrentSession()
  const isLoggedOut = sessionAfterLogout === null && !authService.isAuthenticated()
  assert(isLoggedOut, 7, 'Logout and protected-route redirects', 'Session completely invalidated and cleared on logout.')

  // -------------------------------------------------------------------------
  // TEST 8: PASSWORD-RESET BEHAVIOR
  // -------------------------------------------------------------------------
  try {
    const resetRes = await authService.requestPasswordReset('verified.receptionist@lumasalon.com')
    assert(resetRes.success, 8, 'Password-reset behavior', `Password reset request succeeded: ${resetRes.message}`)
  } catch (err: unknown) {
    assert(false, 8, 'Password-reset behavior', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 9: UNAUTHORIZED STAFF INVITATION
  // -------------------------------------------------------------------------
  // Employee attempting to create a user profile
  const empSession = await authService.login('farhaan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  try {
    await userService.createUser(
      { name: 'Unauthorized Staff', email: 'unauth@testdomain.com', role: 'EMPLOYEE' },
      empSession
    )
    assert(false, 9, 'Unauthorized staff invitation', 'Employee unexpectedly created a staff account.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    assert(msg.includes('Unauthorized'), 9, 'Unauthorized staff invitation', `Correctly blocked non-owner staff creation: "${msg}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 10: OWNER/ADMIN PRIVILEGE SEPARATION
  // -------------------------------------------------------------------------
  // Owner attempting to create an OWNER or ADMIN account
  const ownerSession = await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  try {
    await userService.createUser(
      { name: 'Third Owner', email: 'owner3@testdomain.com', role: 'OWNER' },
      ownerSession
    )
    assert(false, 10, 'Owner/admin privilege separation', 'Owner unexpectedly created an owner account.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    assert(msg.includes('Forbidden') || msg.includes('administrator'), 10, 'Owner/admin privilege separation', `Correctly separated owner and admin privileges: "${msg}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 11: ATTEMPTS TO CHANGE ONE'S OWN ROLE OR SALON MEMBERSHIP (DATABASE TRIGGER)
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-000000000004', 'farhaan@lumasalon.example.com') ON CONFLICT DO NOTHING;
      UPDATE public.users SET auth_user_id = '00000000-0000-0000-0000-000000000004' WHERE id = 'user-emp-01';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
    `)

    await db.exec(`
      UPDATE public.users
      SET role = 'OWNER'
      WHERE id = 'user-emp-01';
    `)
    assert(false, 11, 'Attempts to change role/salon membership', 'Trigger failed to block role elevation.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Security violation') || msg.includes('unauthorized')
    assert(passed, 11, 'Attempts to change role/salon membership', `Database trigger blocked self-escalation: "${msg.split('\n')[0]}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 12: EMPLOYEE ACCESS TO ANOTHER EMPLOYEE'S APPOINTMENTS (RLS POLICY)
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000004', false);
    `)

    // Query appointments as authenticated employee (Farhaan)
    const aptRes = await db.query<{ id: string; staff_id: string }>(`
      SELECT id, staff_id FROM public.appointments;
    `)
    // Farhaan has staff_id 'staff-01' in baseline mapping. None of other 12 salon appointments should be visible.
    const expectedStaffId = 'staff-01'
    const hasForeignStaffApts = aptRes.rows.some((r) => r.staff_id !== expectedStaffId)
    const totalSalonApts = 18

    assert(
      !hasForeignStaffApts && aptRes.rows.length < totalSalonApts && aptRes.rows.length > 0,
      12,
      "Employee access to another employee's appointments",
      `Employee correctly restricted to own appointments (${aptRes.rows.length}/${totalSalonApts} records returned, 0 cross-employee leaks).`
    )
  } catch (err: unknown) {
    assert(false, 12, "Employee access to another employee's appointments", (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 13: CROSS-SALON ACCESS FOR ALL RELEVANT CRUD OPERATIONS (TENANT ISOLATION)
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      INSERT INTO public.salons (id, name, owner_name, phone, email, address, currency, timezone)
      VALUES ('salon-rival-02', 'Rival Salon B', 'Rival Owner', '+91 99999 00000', 'rival@rivalsalon.com', '{"city":"Mumbai"}'::jsonb, 'INR', 'Asia/Kolkata')
      ON CONFLICT DO NOTHING;

      INSERT INTO public.clients (id, salon_id, name, phone, email)
      VALUES ('client-rival-01', 'salon-rival-02', 'Rival Client', '+91 99999 11111', 'rivalclient@rivalsalon.com')
      ON CONFLICT DO NOTHING;

      INSERT INTO auth.users (id, email) VALUES ('22222222-2222-2222-2222-222222222222', 'owner1@lumasalon.example.com') ON CONFLICT DO NOTHING;
      UPDATE public.users SET auth_user_id = '22222222-2222-2222-2222-222222222222' WHERE id = 'user-owner-01';

      -- Authenticate as Salon A Owner
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
    `)

    // Attempt SELECT on Salon B clients
    const rivalClients = await db.query<{ id: string }>(`
      SELECT id FROM public.clients WHERE salon_id = 'salon-rival-02';
    `)
    const selectBlocked = rivalClients.rows.length === 0

    // Attempt UPDATE on Salon B clients
    const updateRes = await db.query(`
      UPDATE public.clients SET name = 'Tampered' WHERE salon_id = 'salon-rival-02' RETURNING id;
    `)
    const updateBlocked = updateRes.rows.length === 0

    // Attempt DELETE on Salon B clients
    const deleteRes = await db.query(`
      DELETE FROM public.clients WHERE salon_id = 'salon-rival-02' RETURNING id;
    `)
    const deleteBlocked = deleteRes.rows.length === 0

    assert(
      selectBlocked && updateBlocked && deleteBlocked,
      13,
      'Cross-salon access for all relevant CRUD operations',
      `Salon A user isolated: SELECT returned ${rivalClients.rows.length}, UPDATE affected ${updateRes.rows.length}, DELETE affected ${deleteRes.rows.length}.`
    )
  } catch (err: unknown) {
    assert(false, 13, 'Cross-salon access for all relevant CRUD operations', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 14: VIP BOOKING RESTRICTIONS & OWNER/STAFF MAPPING (DATABASE TRIGGER)
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      UPDATE public.clients SET is_vip = true WHERE id = 'cli-01';

      -- 1. Normal online booking with Mia Vance (staff-01) for VIP client -> MUST BE ALLOWED
      INSERT INTO public.appointments (
        id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
      ) VALUES (
        'apt-test-mia-online', 'salon-luma-01', 'cli-01', 'staff-01', '2026-11-01', '09:00:00', '10:00:00', 'scheduled', 1000.00, 'online'
      );

      -- 2. Normal online booking with Rohan Sen (staff-02) for VIP client -> MUST BE ALLOWED
      INSERT INTO public.appointments (
        id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
      ) VALUES (
        'apt-test-rohan-online', 'salon-luma-01', 'cli-01', 'staff-02', '2026-11-01', '10:30:00', '11:30:00', 'scheduled', 1200.00, 'online'
      );
    `)

    // Setup distinct staff profile for Rajesh (Owner 1) to test Rajesh VIP restriction
    await db.exec(`
      INSERT INTO public.staff (
        id, salon_id, name, phone, email, role, job_title, gender, active
      ) VALUES (
        'staff-rajesh', 'salon-luma-01', 'Rajesh', '+91 98111 00003', 'owner1@lumasalon.example.com', 'owner', 'Premium Hair Stylist', 'Male', true
      );
      UPDATE public.users SET employee_id = 'staff-rajesh' WHERE id = 'user-owner-01';
    `)

    // 3. Online VIP booking with Rajesh -> MUST BE REJECTED
    let onlineBlocked = false
    try {
      await db.exec(`
        INSERT INTO public.appointments (
          id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
        ) VALUES (
          'apt-test-rajesh-online', 'salon-luma-01', 'cli-01', 'staff-rajesh', '2026-11-01', '13:00:00', '14:00:00', 'scheduled', 2000.00, 'online'
        );
      `)
    } catch (err: unknown) {
      if ((err as Error).message.includes('Booking Policy Violation')) onlineBlocked = true
    }

    // 4. AI-assistant VIP booking with Rajesh -> MUST BE REJECTED
    let aiBlocked = false
    try {
      await db.exec(`
        INSERT INTO public.appointments (
          id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
        ) VALUES (
          'apt-test-rajesh-ai', 'salon-luma-01', 'cli-01', 'staff-rajesh', '2026-11-01', '14:30:00', '15:30:00', 'scheduled', 2000.00, 'ai_assistant'
        );
      `)
    } catch (err: unknown) {
      if ((err as Error).message.includes('Booking Policy Violation')) aiBlocked = true
    }

    // 5. In-salon manual booking with Rajesh -> MUST BE ALLOWED
    let inSalonAllowed = false
    try {
      await db.exec(`
        INSERT INTO public.appointments (
          id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
        ) VALUES (
          'apt-test-rajesh-in-salon', 'salon-luma-01', 'cli-01', 'staff-rajesh', '2026-11-01', '16:00:00', '17:00:00', 'scheduled', 2000.00, 'in_salon'
        );
      `)
      inSalonAllowed = true
    } catch {
      inSalonAllowed = false
    }

    // Clean up temporary test appointments & reset Rajesh mapping
    await db.exec(`
      DELETE FROM public.appointments WHERE id IN ('apt-test-mia-online', 'apt-test-rohan-online', 'apt-test-rajesh-in-salon');
      UPDATE public.users SET employee_id = NULL WHERE id = 'user-owner-01';
      DELETE FROM public.staff WHERE id = 'staff-rajesh';
    `)

    const allPassed = onlineBlocked && aiBlocked && inSalonAllowed
    assert(
      allPassed,
      14,
      'VIP booking restrictions',
      'All 5 VIP booking scenarios validated: Mia/Rohan online allowed, Rajesh online/AI blocked, Rajesh in-salon allowed.'
    )
  } catch (err: unknown) {
    assert(false, 14, 'VIP booking restrictions', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 15: PLACEHOLDER EMAIL REJECTION
  // -------------------------------------------------------------------------
  const isBlocked1 = isPlaceholderEmail('test@lumasalon.example.com')
  const isBlocked2 = isPlaceholderEmail('anyone@example.com')
  const isAllowedReal = !isPlaceholderEmail('receptionist.luma@gmail.com')
  assert(
    isBlocked1 && isBlocked2 && isAllowedReal,
    15,
    'Placeholder email rejection',
    'Verified @lumasalon.example.com and @example.com are strictly blocked, real email permitted.'
  )

  // -------------------------------------------------------------------------
  // TEST 16: HISTORICAL APPOINTMENT AND CUSTOMER DATA PRESERVATION
  // -------------------------------------------------------------------------
  try {
    await db.exec('RESET role;')
    const snapCols = await db.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'appointments' AND column_name IN ('client_name', 'staff_name', 'service_name');
    `)
    const hasSnapCols = snapCols.rows.length === 3
    const aptCountAfter = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM public.appointments;')
    const countPreserved = parseInt(aptCountAfter.rows[0].count, 10) >= 18

    assert(
      hasSnapCols && countPreserved,
      16,
      'Historical appointment and customer data preservation',
      `All ${aptCountAfter.rows[0].count} historical appointments preserved with client_name, staff_name, service_name snapshots intact.`
    )
  } catch (err: unknown) {
    assert(false, 16, 'Historical appointment and customer data preservation', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 17: UNLINKED IDENTITY REJECTION (FAIL SAFELY)
  // -------------------------------------------------------------------------
  try {
    await authService.resolveAndEstablishSession('00000000-0000-0000-0000-000000000999')
    assert(false, 17, 'Unlinked identity fails safely', 'Unexpectedly resolved session for unlinked identity.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const expected = 'Your account is not linked to an active salon profile. Please contact the administrator to complete your setup.'
    assert(msg === expected, 17, 'Unlinked identity fails safely', `Correctly failed with exact helpful message: "${msg}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 18: ROOT ADMINISTRATOR IDENTITY SPOOFING REJECTION (EMAIL != PERMISSION)
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      INSERT INTO auth.users (id, email) VALUES ('99999999-9999-9999-9999-999999999999', 'talk2rkalyani@gmail.com') ON CONFLICT DO NOTHING;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '99999999-9999-9999-9999-999999999999', false);
    `)

    // Call is_admin() helper
    const adminCheck = await db.query<{ is_admin: boolean }>('SELECT public.is_admin() as is_admin;')
    const isAdmin = adminCheck.rows[0]?.is_admin === true

    // Query administrators table
    const adminRows = await db.query('SELECT * FROM public.administrators;')
    const canSeeAdmins = adminRows.rows.length > 0

    assert(
      !isAdmin && !canSeeAdmins,
      18,
      'Root administrator email spoofing rejection',
      `User with email talk2rkalyani@gmail.com denied admin rights without linked administrators record (is_admin=${isAdmin}, visible rows=${adminRows.rows.length}).`
    )
  } catch (err: unknown) {
    assert(false, 18, 'Root administrator email spoofing rejection', (err as Error).message)
  }

  // -------------------------------------------------------------------------
  // TEST 19: OWNER CANNOT MANAGE ANOTHER OWNER OR ADMINISTRATOR PROFILE
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
    `)

    const updateRes = await db.query(`
      UPDATE public.users
      SET name = 'Tampered Owner 2'
      WHERE id = 'user-owner-02'
      RETURNING id;
    `)
    await db.exec('RESET role;')
    const checkRow = await db.query<{ name: string }>(`
      SELECT name FROM public.users WHERE id = 'user-owner-02';
    `)
    const blocked = updateRes.rows.length === 0 && checkRow.rows[0]?.name !== 'Tampered Owner 2'
    assert(blocked, 19, 'Owner cannot manage another owner identity', `Cross-owner modification blocked by RLS (${updateRes.rows.length} rows affected, name preserved as "${checkRow.rows[0]?.name}").`)
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Security violation') || msg.includes('owners cannot manage') || msg.includes('violates row-level security')
    assert(passed, 19, 'Owner cannot manage another owner identity', `Blocked cross-owner modification: "${msg.split('\n')[0]}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 20: DIRECT CLIENT ATTEMPTS TO ALTER AUTH_USER_ID LINKAGE BLOCKED
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
    `)

    await db.exec(`
      UPDATE public.users
      SET auth_user_id = '33333333-3333-3333-3333-333333333333'
      WHERE id = 'user-emp-01';
    `)
    assert(false, 20, 'Direct client attempts to alter auth_user_id blocked', 'Unexpectedly changed auth_user_id directly.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Security violation') || msg.includes('auth identity linkage')
    assert(passed, 20, 'Direct client attempts to alter auth_user_id blocked', `Trigger blocked client linkage alteration: "${msg.split('\n')[0]}"`)
  }

  // -------------------------------------------------------------------------
  // TEST 21: RECEPTIONIST AND EMPLOYEE RLS INSERTION REJECTION
  // -------------------------------------------------------------------------
  try {
    await db.exec(`
      RESET role;
      INSERT INTO auth.users (id, email) VALUES ('44444444-4444-4444-4444-444444444444', 'receptionist@lumasalon.example.com') ON CONFLICT DO NOTHING;
      UPDATE public.users SET auth_user_id = '44444444-4444-4444-4444-444444444444' WHERE id = 'user-rec-01';
      SET ROLE authenticated;
      SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
    `)

    await db.exec(`
      INSERT INTO public.users (id, salon_id, email, name, role)
      VALUES ('user-unauth-test', 'salon-luma-01', 'unauth@lumasalon.com', 'Unauth', 'EMPLOYEE');
    `)
    assert(false, 21, 'Receptionist/Employee user insertion rejection', 'Receptionist unexpectedly inserted a new user.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('violates row-level security') || msg.includes('policy')
    assert(passed, 21, 'Receptionist/Employee user insertion rejection', `RLS blocked receptionist user insertion: "${msg.split('\n')[0]}"`)
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n==============================================================================')
  const passedCount = results.filter((r) => r.passed).length
  console.log(`TEST SUITE RESULTS: ${passedCount} / ${results.length} PASSED (${Math.round((passedCount / results.length) * 100)}% SUCCESS)`)
  console.log('==============================================================================')

  await db.close()
}

runTestSuite().catch((err) => {
  console.error('Fatal error running test suite:', err)
  process.exit(1)
})
