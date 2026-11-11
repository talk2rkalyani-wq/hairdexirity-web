import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runPhase15_9AuditSuite() {
  console.log('========================================================================')
  console.log('LUMA SALON — PHASE 15.9: FINAL PRE-PRODUCTION GO/NO-GO AUDIT SUITE')
  console.log('========================================================================\n')

  // ---------------------------------------------------------------------------
  // 1. BACKUP CHECKSUM AUDIT
  // ---------------------------------------------------------------------------
  console.log('--- 1. Auditing Physical Live Backup Checksum ---')
  const backupRelPath = '../supabase/backups/live_remote_backup_20261018_131610.sql'
  const backupPath = path.resolve(__dirname, backupRelPath)
  const backupContent = fs.readFileSync(backupPath)
  const calculatedSha = crypto.createHash('sha256').update(backupContent).digest('hex')
  const EXPECTED_SHA = '41da65ff535f60dceb3ee43557a53ccb2d5880ba7c5354a2fc4f03e3b108d1cb'

  console.log(`Expected SHA-256:   ${EXPECTED_SHA}`)
  console.log(`Calculated SHA-256: ${calculatedSha}`)
  if (calculatedSha !== EXPECTED_SHA) {
    throw new Error('CRITICAL FAILURE: Backup SHA-256 checksum mismatch!')
  }
  console.log('✅ PASS: Backup file is authentic, unaltered, and matches recorded checksum.\n')

  // ---------------------------------------------------------------------------
  // 2. DISPOSABLE POSTGRESQL ENGINE INITIALIZATION & MIGRATIONS 000004 & 000005
  // ---------------------------------------------------------------------------
  console.log('--- 2. Testing Migration 000004 & 000005 in Disposable Sandbox ---')
  const db = new PGlite()

  // Initialize roles & auth schema stubs
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    GRANT authenticated TO CURRENT_USER;
    GRANT anon TO CURRENT_USER;

    CREATE SCHEMA IF NOT EXISTS auth;
    GRANT USAGE ON SCHEMA auth TO authenticated, anon, PUBLIC;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated');
    $$ LANGUAGE sql STABLE;
  `)

  // Restore baseline
  const baselinePath = path.resolve(__dirname, '../supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  await db.exec(fs.readFileSync(baselinePath, 'utf8'))

  // Apply Migration 000004
  const mig4Path = path.resolve(__dirname, '../supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  await db.exec(fs.readFileSync(mig4Path, 'utf8'))
  console.log('✅ PASS: Migration 000004 applied cleanly.')

  // Apply Migration 000005
  const mig5Path = path.resolve(__dirname, '../supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')
  await db.exec(fs.readFileSync(mig5Path, 'utf8'))
  console.log('✅ PASS: Migration 000005 applied cleanly.')

  // Check Mia Vance integrity
  const miaUser = await db.query("SELECT id, name, role, employee_id FROM public.users WHERE id = 'user-emp-01';")
  const miaStaff = await db.query("SELECT id, name, role FROM public.staff WHERE id = 'staff-01';")
  const owner1 = await db.query("SELECT id, name, role, employee_id, owner_designation FROM public.users WHERE id = 'user-owner-01';")

  if (miaUser.rows[0].employee_id !== 'staff-01') throw new Error('user-emp-01 employee_id corrupted!')
  if (miaStaff.rows[0].name !== 'Mia Vance') throw new Error('staff-01 name corrupted!')
  if (owner1.rows[0].employee_id !== null) throw new Error('user-owner-01 employee_id was incorrectly linked!')
  if (owner1.rows[0].owner_designation !== 'OWNER_1') throw new Error('user-owner-01 owner_designation missing!')
  console.log('✅ PASS: Mia Vance (staff-01) preserved; Owner 1 has employee_id = NULL and OWNER_1 designation.\n')

  // ---------------------------------------------------------------------------
  // 3. AUDITING PROVISIONING SCRIPT BEHAVIORS & EDGE CASES
  // ---------------------------------------------------------------------------
  console.log('--- 3. Auditing Root Administrator Provisioning Behaviors ---')

  const sampleAdminEmail = 'talk2rkalyani@gmail.com'
  const sampleAuthUuid1 = '44444444-4444-4444-a444-444444444444'
  const sampleAuthUuid2 = '55555555-5555-5555-a555-555555555555'

  // Insert Auth user in auth.users
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${sampleAuthUuid1}', '${sampleAdminEmail}');
  `)

  // Function to run the exact current script logic
  async function executeCurrentProvisioningScript(opts: {
    email: string
    name: string
    expectedUuid?: string | null
    adminId?: string
  }) {
    const adminId = opts.adminId || 'admin-root-01'
    const expectedUuidClause = opts.expectedUuid ? `'${opts.expectedUuid}'::uuid` : 'NULL'

    const sql = `
      DO $$
      DECLARE
          v_admin_id TEXT := '${adminId}';
          v_admin_email TEXT := '${opts.email}';
          v_admin_name TEXT := '${opts.name}';
          v_expected_auth_uuid UUID := ${expectedUuidClause};
          v_norm_email TEXT;
          v_auth_id UUID;
          v_existing_admin_by_email RECORD;
          v_existing_admin_by_auth RECORD;
      BEGIN
          v_norm_email := lower(trim(v_admin_email));

          SELECT id INTO v_auth_id
          FROM auth.users
          WHERE lower(trim(email)) = v_norm_email
          LIMIT 1;

          IF v_auth_id IS NULL THEN
              RAISE EXCEPTION 'Administrator provisioning failed: No user found in auth.users with email "%". Create the user first in Supabase Dashboard -> Authentication -> Users.', v_norm_email;
          END IF;

          IF v_expected_auth_uuid IS NOT NULL AND v_auth_id <> v_expected_auth_uuid THEN
              RAISE EXCEPTION 'Security violation: Auth user found for email "%" has UUID "%", which does not match expected UUID "%". Aborting.',
                  v_norm_email, v_auth_id, v_expected_auth_uuid;
          END IF;

          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_email
          FROM public.administrators
          WHERE email = v_norm_email;

          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_auth
          FROM public.administrators
          WHERE auth_user_id = v_auth_id;

          IF v_existing_admin_by_email.id IS NOT NULL THEN
              IF v_existing_admin_by_email.auth_user_id = v_auth_id THEN
                  UPDATE public.administrators
                  SET 
                      name = v_admin_name,
                      active = true,
                      updated_at = timezone('utc'::text, now())
                  WHERE id = v_existing_admin_by_email.id;

                  RAISE NOTICE 'Safe retry confirmed.';
                  RETURN;
              ELSE
                  RAISE EXCEPTION 'Security conflict: Administrator profile for email "%" is already linked to auth_user_id "%". Attempted to link to different auth_user_id "%". Silent privilege transfer is strictly prohibited. Manual database review required.',
                      v_norm_email, v_existing_admin_by_email.auth_user_id, v_auth_id;
              END IF;
          END IF;

          IF v_existing_admin_by_auth.id IS NOT NULL THEN
              RAISE EXCEPTION 'Security conflict: auth_user_id "%" is already linked to administrator email "%". Prohibited from binding to email "%".',
                  v_auth_id, v_existing_admin_by_auth.email, v_norm_email;
          END IF;

          INSERT INTO public.administrators (
              id, auth_user_id, email, name, role, active, created_at, updated_at
          )
          VALUES (
              v_admin_id, v_auth_id, v_norm_email, v_admin_name, 'ADMIN', true,
              timezone('utc'::text, now()), timezone('utc'::text, now())
          );
      END;
      $$;
    `
    await db.exec(sql)
  }

  // A. Check behavior when expected UUID is NULL (Dynamically binds to auth.users record)
  console.log('A. Testing behavior when expected UUID is NULL:')
  await executeCurrentProvisioningScript({
    email: sampleAdminEmail,
    name: 'Root Administrator',
    expectedUuid: null, // NULL
  })
  const adminRow = await db.query(`SELECT * FROM public.administrators WHERE email = '${sampleAdminEmail}';`)
  console.log(`   Result: Bound to auth_user_id = ${adminRow.rows[0].auth_user_id} automatically without external confirmation.`)
  console.log('   Finding: When v_expected_auth_uuid is NULL, the script trusts whichever record matches the email in auth.users.\n')

  // B. Testing Inactive Administrator Reactivation
  console.log('B. Testing Inactive Administrator Reactivation:')
  // Manually deactivate the administrator account (simulate account suspension/offboarding)
  await db.exec(`
    UPDATE public.administrators SET active = false WHERE email = '${sampleAdminEmail}';
  `)
  const deactivatedCheck = await db.query(`SELECT active FROM public.administrators WHERE email = '${sampleAdminEmail}';`)
  if (deactivatedCheck.rows[0].active !== false) throw new Error('Deactivation failed')
  console.log('   Administrator account deactivated (active = false).')

  // Now execute provisioning retry
  await executeCurrentProvisioningScript({
    email: sampleAdminEmail,
    name: 'Root Administrator',
    expectedUuid: sampleAuthUuid1,
  })
  const reactivatedCheck = await db.query(`SELECT active FROM public.administrators WHERE email = '${sampleAdminEmail}';`)
  console.log(`   Result after retry: active = ${reactivatedCheck.rows[0].active}`)
  if (reactivatedCheck.rows[0].active === true) {
    console.log('   Finding: Safe retry unconditionally overwrites active = true, reactivating a suspended account.\n')
  }

  // C. Testing Primary Key Collision (admin-root-01 already exists for a different administrator record)
  console.log('C. Testing Primary Key Collision when id = admin-root-01 already exists:')
  // Create another auth user
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${sampleAuthUuid2}', 'other_admin@example.com');
  `)
  let pkeyError = ''
  try {
    // Attempt to provision other_admin with the same default adminId 'admin-root-01'
    await executeCurrentProvisioningScript({
      email: 'other_admin@example.com',
      name: 'Other Administrator',
      adminId: 'admin-root-01', // Collides with existing admin-root-01
    })
  } catch (err: any) {
    pkeyError = err.message
  }
  console.log(`   Caught error: ${pkeyError}`)
  if (!pkeyError.includes('administrators_pkey') && !pkeyError.includes('unique constraint')) {
    throw new Error('Expected pkey collision error!')
  }
  console.log('   Finding: Collision on v_admin_id fails at database pkey constraint rather than graceful validation.\n')

  // ---------------------------------------------------------------------------
  // 4. TESTING REFINED HARDENED SCRIPT DESIGN
  // ---------------------------------------------------------------------------
  console.log('--- 4. Testing Proposed Hardened Script Design ---')

  async function executeProposedHardenedScript(opts: {
    email: string
    name: string
    expectedUuid: string | null
    adminId?: string
    allowReactivation?: boolean
  }) {
    const adminId = opts.adminId || 'admin-root-01'
    const expectedUuidClause = opts.expectedUuid ? `'${opts.expectedUuid}'::uuid` : 'NULL'
    const allowReactivation = opts.allowReactivation ? 'true' : 'false'

    const sql = `
      DO $$
      DECLARE
          v_admin_id TEXT := '${adminId}';
          v_admin_email TEXT := '${opts.email}';
          v_admin_name TEXT := '${opts.name}';
          v_expected_auth_uuid UUID := ${expectedUuidClause};
          v_allow_reactivation BOOLEAN := ${allowReactivation};
          v_norm_email TEXT;
          v_auth_id UUID;
          v_existing_admin_by_email RECORD;
          v_existing_admin_by_auth RECORD;
          v_existing_admin_by_id RECORD;
      BEGIN
          v_norm_email := lower(trim(v_admin_email));

          -- 1. MANDATORY CONFIRMED UUID GUARD
          IF v_expected_auth_uuid IS NULL THEN
              RAISE EXCEPTION 'Security Policy Gate: v_expected_auth_uuid cannot be NULL. You must explicitly provide the independently confirmed Auth UUID from Supabase Dashboard -> Authentication -> Users.';
          END IF;

          -- 2. Locate user in auth.users
          SELECT id INTO v_auth_id
          FROM auth.users
          WHERE lower(trim(email)) = v_norm_email
          LIMIT 1;

          IF v_auth_id IS NULL THEN
              RAISE EXCEPTION 'Administrator provisioning failed: No user found in auth.users with email "%". Create the user first in Supabase Dashboard -> Authentication -> Users.', v_norm_email;
          END IF;

          -- 3. Strict UUID assertion check
          IF v_auth_id <> v_expected_auth_uuid THEN
              RAISE EXCEPTION 'Security violation: Auth user found for email "%" has UUID "%", which does not match expected confirmed UUID "%". Aborting.',
                  v_norm_email, v_auth_id, v_expected_auth_uuid;
          END IF;

          -- 4. Check for existing record by email
          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_email
          FROM public.administrators
          WHERE email = v_norm_email;

          -- 5. Check for existing record by auth_user_id
          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_auth
          FROM public.administrators
          WHERE auth_user_id = v_auth_id;

          -- 6. Check for primary key collision by id
          SELECT id, email, auth_user_id INTO v_existing_admin_by_id
          FROM public.administrators
          WHERE id = v_admin_id;

          IF v_existing_admin_by_id.id IS NOT NULL AND v_existing_admin_by_id.email <> v_norm_email THEN
              RAISE EXCEPTION 'Primary Key Conflict: Administrator ID "%" is already occupied by "%". Cannot assign to "%".',
                  v_admin_id, v_existing_admin_by_id.email, v_norm_email;
          END IF;

          -- 7. Identity consistency check & Safe Retry
          IF v_existing_admin_by_email.id IS NOT NULL THEN
              IF v_existing_admin_by_email.auth_user_id = v_auth_id THEN
                  -- Inactive protection check
                  IF v_existing_admin_by_email.active = false AND NOT v_allow_reactivation THEN
                      RAISE EXCEPTION 'Security violation: Administrator account "%" exists but is currently DEACTIVATED (active = false). Reactivation requires setting v_allow_reactivation := true.',
                          v_norm_email;
                  END IF;

                  UPDATE public.administrators
                  SET 
                      name = v_admin_name,
                      active = true,
                      updated_at = timezone('utc'::text, now())
                  WHERE id = v_existing_admin_by_email.id;

                  RAISE NOTICE 'Safe retry confirmed: Administrator "%" (id: %) verified.', v_norm_email, v_existing_admin_by_email.id;
                  RETURN;
              ELSE
                  RAISE EXCEPTION 'Security conflict: Administrator profile for email "%" is already linked to auth_user_id "%". Attempted to link to different auth_user_id "%". Silent privilege transfer is strictly prohibited.',
                      v_norm_email, v_existing_admin_by_email.auth_user_id, v_auth_id;
              END IF;
          END IF;

          IF v_existing_admin_by_auth.id IS NOT NULL THEN
              RAISE EXCEPTION 'Security conflict: auth_user_id "%" is already linked to administrator email "%". Prohibited from binding to email "%".',
                  v_auth_id, v_existing_admin_by_auth.email, v_norm_email;
          END IF;

          -- 8. First-time insert
          INSERT INTO public.administrators (
              id, auth_user_id, email, name, role, active, created_at, updated_at
          ) VALUES (
              v_admin_id, v_auth_id, v_norm_email, v_admin_name, 'ADMIN', true,
              timezone('utc'::text, now()), timezone('utc'::text, now())
          );

          RAISE NOTICE 'Success: Administrator "%" (id: %) provisioned and bound to confirmed UUID %.',
              v_norm_email, v_admin_id, v_auth_id;
      END;
      $$;
    `
    await db.exec(sql)
  }

  // Test 1: NULL UUID is rejected
  console.log('Test 1: NULL v_expected_auth_uuid rejected:')
  let nullUuidError = ''
  try {
    await executeProposedHardenedScript({
      email: 'other_admin@example.com',
      name: 'Other Admin',
      expectedUuid: null,
      adminId: 'admin-02',
    })
  } catch (err: any) {
    nullUuidError = err.message
  }
  if (!nullUuidError.includes('v_expected_auth_uuid cannot be NULL')) {
    throw new Error('Expected NULL UUID rejection!')
  }
  console.log('✅ PASS: Rejected provisioning when confirmed Auth UUID was not supplied.')

  // Test 2: Inactive account without v_allow_reactivation is rejected
  console.log('Test 2: Deactivated admin retry without explicit reactivation flag:')
  await db.exec(`UPDATE public.administrators SET active = false WHERE email = '${sampleAdminEmail}';`)
  let inactiveError = ''
  try {
    await executeProposedHardenedScript({
      email: sampleAdminEmail,
      name: 'Root Administrator',
      expectedUuid: sampleAuthUuid1,
      allowReactivation: false,
    })
  } catch (err: any) {
    inactiveError = err.message
  }
  if (!inactiveError.includes('currently DEACTIVATED')) {
    throw new Error('Expected deactivated account rejection!')
  }
  console.log('✅ PASS: Prevented accidental reactivation of deactivated administrator.')

  // Test 3: Inactive account with explicit v_allow_reactivation succeeds
  console.log('Test 3: Deactivated admin retry with explicit v_allow_reactivation := true:')
  await executeProposedHardenedScript({
    email: sampleAdminEmail,
    name: 'Root Administrator',
    expectedUuid: sampleAuthUuid1,
    allowReactivation: true,
  })
  const reactivatedRow = await db.query(`SELECT active FROM public.administrators WHERE email = '${sampleAdminEmail}';`)
  if (reactivatedRow.rows[0].active !== true) throw new Error('Expected active = true')
  console.log('✅ PASS: Reactivation permitted when explicitly authorized.')

  // Test 4: Primary key collision handled gracefully
  console.log('Test 4: Primary key collision handled gracefully:')
  let pkeyHandledError = ''
  try {
    await executeProposedHardenedScript({
      email: 'other_admin@example.com',
      name: 'Other Admin',
      expectedUuid: sampleAuthUuid2,
      adminId: 'admin-root-01', // Collides with sampleAdminEmail
    })
  } catch (err: any) {
    pkeyHandledError = err.message
  }
  if (!pkeyHandledError.includes('Primary Key Conflict')) {
    throw new Error('Expected Primary Key Conflict error!')
  }
  console.log('✅ PASS: Caught primary key collision before database error.\n')

  console.log('========================================================================')
  console.log('🎉 ALL PHASE 15.9 AUDIT CHECKS & TESTS COMPLETED SUCCESSFULLY!')
  console.log('========================================================================')
}

runPhase15_9AuditSuite().catch((err) => {
  console.error('AUDIT FAILED:', err)
  process.exit(1)
})
