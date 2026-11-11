import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runPhase15_10SafeguardTests() {
  console.log('========================================================================')
  console.log('LUMA SALON — PHASE 15.10: ROOT ADMIN PROVISIONING SAFEGUARDS TEST SUITE')
  console.log('========================================================================\n')

  const db = new PGlite()

  // 1. Setup Supabase Auth Schema & Roles
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

  // 2. Load baseline & Migrations 000004 & 000005
  const baselinePath = path.resolve(__dirname, '../supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  const mig4Path = path.resolve(__dirname, '../supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  const mig5Path = path.resolve(__dirname, '../supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')

  await db.exec(fs.readFileSync(baselinePath, 'utf8'))
  await db.exec(fs.readFileSync(mig4Path, 'utf8'))
  await db.exec(fs.readFileSync(mig5Path, 'utf8'))
  console.log('Sandbox initialized with baseline and Migrations 000004 & 000005.\n')

  // Helper function executing the exact logic of provision_root_administrator.sql
  async function runProvisioning(options: {
    adminId?: string
    adminEmail?: string
    adminName?: string
    expectedAuthUuid: string | null
    allowReactivation?: boolean
  }) {
    const adminId = options.adminId ?? 'admin-root-01'
    const adminEmail = options.adminEmail ?? 'talk2rkalyani@gmail.com'
    const adminName = options.adminName ?? 'Root Administrator'
    const expectedUuidLiteral = options.expectedAuthUuid ? `'${options.expectedAuthUuid}'::uuid` : 'NULL'
    const allowReactivation = options.allowReactivation ? 'true' : 'false'

    const script = `
      DO $$
      DECLARE
          v_admin_id TEXT := '${adminId}';
          v_admin_email TEXT := '${adminEmail}';
          v_admin_name TEXT := '${adminName}';
          v_expected_auth_uuid UUID := ${expectedUuidLiteral};
          v_allow_reactivation BOOLEAN := ${allowReactivation};

          v_norm_email TEXT;
          v_auth_id UUID;
          v_existing_admin_by_email RECORD;
          v_existing_admin_by_auth RECORD;
          v_existing_admin_by_id RECORD;
      BEGIN
          v_norm_email := lower(trim(v_admin_email));

          IF v_expected_auth_uuid IS NULL THEN
              RAISE EXCEPTION 'Operational Safety Gate: v_expected_auth_uuid is NULL. You must explicitly configure v_expected_auth_uuid with the confirmed Auth UUID from Supabase Dashboard -> Authentication -> Users before running this script.';
          END IF;

          SELECT id INTO v_auth_id
          FROM auth.users
          WHERE lower(trim(email)) = v_norm_email
          LIMIT 1;

          IF v_auth_id IS NULL THEN
              RAISE EXCEPTION 'Administrator provisioning failed: No user found in auth.users with email "%". Create or invite the user first in Supabase Dashboard -> Authentication -> Users.', v_norm_email;
          END IF;

          IF v_auth_id <> v_expected_auth_uuid THEN
              RAISE EXCEPTION 'Security violation: Auth user found in auth.users for email "%" has UUID "%", which does not match the confirmed expected UUID "%". Aborting with no changes.',
                  v_norm_email, v_auth_id, v_expected_auth_uuid;
          END IF;

          SELECT id, email, auth_user_id, active INTO v_existing_admin_by_id
          FROM public.administrators
          WHERE id = v_admin_id;

          IF v_existing_admin_by_id.id IS NOT NULL AND lower(trim(v_existing_admin_by_id.email)) <> v_norm_email THEN
              RAISE EXCEPTION 'Primary Key Conflict: Administrator ID "%" is already occupied by a different identity (email: "%", auth_user_id: "%"). Cannot assign ID "%" to "%". Aborting with no changes.',
                  v_admin_id, v_existing_admin_by_id.email, v_existing_admin_by_id.auth_user_id, v_admin_id, v_norm_email;
          END IF;

          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_email
          FROM public.administrators
          WHERE lower(trim(email)) = v_norm_email;

          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_auth
          FROM public.administrators
          WHERE auth_user_id = v_auth_id;

          IF v_existing_admin_by_email.id IS NOT NULL THEN
              IF v_existing_admin_by_email.auth_user_id = v_auth_id THEN
                  IF v_existing_admin_by_email.active = false THEN
                      IF NOT v_allow_reactivation THEN
                          RAISE EXCEPTION 'Security violation: Administrator account "%" (id: %) exists and matches auth_user_id %, but is currently DEACTIVATED (active = false). Normal retry is prohibited from reactivating deactivated accounts. If reactivation is intended, set v_allow_reactivation := true in this script.',
                              v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                      ELSE
                          UPDATE public.administrators
                          SET 
                              name = v_admin_name,
                              active = true,
                              updated_at = timezone('utc'::text, now())
                          WHERE id = v_existing_admin_by_email.id;

                          RAISE NOTICE 'Reactivation successful: Deactivated administrator "%" (id: %) has been explicitly reactivated and bound to auth_user_id %.',
                              v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                          RETURN;
                      END IF;
                  ELSE
                      UPDATE public.administrators
                      SET 
                          name = v_admin_name,
                          updated_at = timezone('utc'::text, now())
                      WHERE id = v_existing_admin_by_email.id;

                      RAISE NOTICE 'Safe retry confirmed: Administrator "%" (id: %) is already active and linked to verified auth_user_id %. Profile updated cleanly.',
                          v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                      RETURN;
                  END IF;
              ELSE
                  RAISE EXCEPTION 'Security conflict: Administrator profile for email "%" is already linked to auth_user_id "%". Attempted to link to different auth_user_id "%". Silent privilege transfer is strictly prohibited. Manual database review required.',
                      v_norm_email, v_existing_admin_by_email.auth_user_id, v_auth_id;
              END IF;
          END IF;

          IF v_existing_admin_by_auth.id IS NOT NULL AND lower(trim(v_existing_admin_by_auth.email)) <> v_norm_email THEN
              RAISE EXCEPTION 'Security conflict: auth_user_id "%" is already linked to administrator email "%". Prohibited from binding to email "%". Aborting with no changes.',
                  v_auth_id, v_existing_admin_by_auth.email, v_norm_email;
          END IF;

          INSERT INTO public.administrators (
              id, auth_user_id, email, name, role, active, created_at, updated_at
          )
          VALUES (
              v_admin_id, v_auth_id, v_norm_email, v_admin_name, 'ADMIN', true,
              timezone('utc'::text, now()), timezone('utc'::text, now())
          );

          RAISE NOTICE 'Success: Administrator "%" (id: %) provisioned and bound to confirmed Auth UUID %.',
              v_norm_email, v_admin_id, v_auth_id;
      END;
      $$;
    `
    await db.exec(script)
  }

  const rootEmail = 'talk2rkalyani@gmail.com'
  const rootAuthUuid = '11111111-aaaa-4111-a111-111111111111'
  const imposterUuid = '22222222-bbbb-4222-b222-222222222222'
  const secondaryEmail = 'secondary@lumasalon.example.com'
  const secondaryUuid = '33333333-cccc-4333-c333-333333333333'

  // Pre-seed Auth users
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${rootAuthUuid}', '${rootEmail}');
    INSERT INTO auth.users (id, email) VALUES ('${imposterUuid}', 'imposter@example.com');
    INSERT INTO auth.users (id, email) VALUES ('${secondaryUuid}', '${secondaryEmail}');
  `)

  // ---------------------------------------------------------------------------
  // TEST 1: NULL expected UUID is rejected immediately
  // ---------------------------------------------------------------------------
  console.log('--- Test 1: NULL expected UUID rejection ---')
  let test1Error = ''
  try {
    await runProvisioning({ expectedAuthUuid: null })
  } catch (err: any) {
    test1Error = err.message
  }
  if (!test1Error.includes('v_expected_auth_uuid is NULL')) {
    throw new Error(`Test 1 Failed: Expected NULL guard rejection, got: ${test1Error}`)
  }
  console.log('✅ PASS: NULL expected UUID is rejected immediately by operational safety gate.\n')

  // ---------------------------------------------------------------------------
  // TEST 2: Correct UUID and email allow first-time provisioning
  // ---------------------------------------------------------------------------
  console.log('--- Test 2: Correct UUID and email first-time provisioning ---')
  await runProvisioning({ expectedAuthUuid: rootAuthUuid })
  const checkAdmin = await db.query(`SELECT * FROM public.administrators WHERE email = '${rootEmail}';`)
  if (checkAdmin.rows.length !== 1) throw new Error('Test 2 Failed: administrator row not found')
  if (checkAdmin.rows[0].auth_user_id !== rootAuthUuid) throw new Error('Test 2 Failed: auth_user_id mismatch')
  if (checkAdmin.rows[0].active !== true) throw new Error('Test 2 Failed: active should be true')
  console.log(`✅ PASS: Correct UUID allowed first-time provisioning (id: ${checkAdmin.rows[0].id}).\n`)

  // ---------------------------------------------------------------------------
  // TEST 3: Matching active identity allows safe retry (idempotency)
  // ---------------------------------------------------------------------------
  console.log('--- Test 3: Matching active identity safe retry ---')
  await runProvisioning({ expectedAuthUuid: rootAuthUuid, adminName: 'Root Administrator Renamed' })
  const checkRetry = await db.query(`SELECT * FROM public.administrators WHERE email = '${rootEmail}';`)
  if (checkRetry.rows.length !== 1) throw new Error('Test 3 Failed: duplicate row created')
  if (checkRetry.rows[0].name !== 'Root Administrator Renamed') throw new Error('Test 3 Failed: name not updated')
  if (checkRetry.rows[0].auth_user_id !== rootAuthUuid) throw new Error('Test 3 Failed: auth_user_id changed')
  console.log('✅ PASS: Matching active identity retry succeeded without duplicate rows or errors.\n')

  // ---------------------------------------------------------------------------
  // TEST 4: Wrong UUID for the target email is rejected
  // ---------------------------------------------------------------------------
  console.log('--- Test 4: Wrong UUID for target email rejection ---')
  let test4Error = ''
  try {
    // Provide an expectedAuthUuid that does NOT match what auth.users has for rootEmail
    await runProvisioning({ expectedAuthUuid: '99999999-9999-4999-a999-999999999999' })
  } catch (err: any) {
    test4Error = err.message
  }
  if (!test4Error.includes('does not match the confirmed expected UUID')) {
    throw new Error(`Test 4 Failed: Expected UUID mismatch exception, got: ${test4Error}`)
  }
  console.log('✅ PASS: Providing a mismatched UUID for the target email is strictly rejected.\n')

  // ---------------------------------------------------------------------------
  // TEST 5: Existing email linked to a different UUID is rejected (Anti-Hijack)
  // ---------------------------------------------------------------------------
  console.log('--- Test 5: Existing email linked to a different UUID rejected ---')
  // Simulate auth user being re-registered under imposterUuid with rootEmail
  await db.exec(`
    UPDATE auth.users SET email = 'talk2rkalyani_old@gmail.com' WHERE id = '${rootAuthUuid}';
    UPDATE auth.users SET email = '${rootEmail}' WHERE id = '${imposterUuid}';
  `)
  let test5Error = ''
  try {
    // Attempt provisioning with imposterUuid
    await runProvisioning({ expectedAuthUuid: imposterUuid })
  } catch (err: any) {
    test5Error = err.message
  }
  if (!test5Error.includes('Silent privilege transfer is strictly prohibited')) {
    throw new Error(`Test 5 Failed: Expected silent privilege transfer exception, got: ${test5Error}`)
  }
  // Restore auth users
  await db.exec(`
    UPDATE auth.users SET email = 'imposter@example.com' WHERE id = '${imposterUuid}';
    UPDATE auth.users SET email = '${rootEmail}' WHERE id = '${rootAuthUuid}';
  `)
  // Verify administrator table is untouched
  const checkPostTest5 = await db.query(`SELECT auth_user_id FROM public.administrators WHERE email = '${rootEmail}';`)
  if (checkPostTest5.rows[0].auth_user_id !== rootAuthUuid) {
    throw new Error('Test 5 Failed: auth_user_id was silently overwritten!')
  }
  console.log('✅ PASS: Attempt to link existing admin email to a different UUID is strictly rejected.\n')

  // ---------------------------------------------------------------------------
  // TEST 6: Existing UUID linked to another admin email is rejected
  // ---------------------------------------------------------------------------
  console.log('--- Test 6: Existing UUID linked to another admin email rejected ---')
  let test6Error = ''
  try {
    // Try to provision secondaryEmail using rootAuthUuid
    await runProvisioning({
      adminId: 'admin-secondary-01',
      adminEmail: secondaryEmail,
      expectedAuthUuid: rootAuthUuid, // Collision: rootAuthUuid belongs to rootEmail
    })
  } catch (err: any) {
    test6Error = err.message
  }
  if (!test6Error.includes('Security violation: Auth user found') && !test6Error.includes('Security conflict: auth_user_id')) {
    throw new Error(`Test 6 Failed: Expected cross-identity conflict, got: ${test6Error}`)
  }
  console.log('✅ PASS: Binding an already-linked UUID to another administrator email is strictly rejected.\n')

  // ---------------------------------------------------------------------------
  // TEST 7: admin-root-01 occupied by a different identity is rejected
  // ---------------------------------------------------------------------------
  console.log('--- Test 7: admin-root-01 occupied by different identity rejected ---')
  let test7Error = ''
  try {
    // Attempt to provision secondaryEmail using admin-root-01
    await runProvisioning({
      adminId: 'admin-root-01', // Collides with rootEmail's record
      adminEmail: secondaryEmail,
      expectedAuthUuid: secondaryUuid,
    })
  } catch (err: any) {
    test7Error = err.message
  }
  if (!test7Error.includes('Primary Key Conflict: Administrator ID "admin-root-01" is already occupied')) {
    throw new Error(`Test 7 Failed: Expected primary key conflict exception, got: ${test7Error}`)
  }
  console.log('✅ PASS: Primary key collision on admin-root-01 is caught with clear diagnostic error.\n')

  // ---------------------------------------------------------------------------
  // TEST 8: An inactive admin is NOT reactivated by a normal retry
  // ---------------------------------------------------------------------------
  console.log('--- Test 8: Inactive admin is NOT reactivated by normal retry ---')
  // Deactivate root administrator
  await db.exec(`UPDATE public.administrators SET active = false WHERE id = 'admin-root-01';`)
  let test8Error = ''
  try {
    await runProvisioning({
      expectedAuthUuid: rootAuthUuid,
      allowReactivation: false, // Normal retry
    })
  } catch (err: any) {
    test8Error = err.message
  }
  if (!test8Error.includes('currently DEACTIVATED (active = false). Normal retry is prohibited')) {
    throw new Error(`Test 8 Failed: Expected inactive retry block, got: ${test8Error}`)
  }
  // Verify account remains inactive
  const checkPostTest8 = await db.query(`SELECT active FROM public.administrators WHERE id = 'admin-root-01';`)
  if (checkPostTest8.rows[0].active !== false) {
    throw new Error('Test 8 Failed: Account was silently reactivated!')
  }
  console.log('✅ PASS: Inactive administrator account is NOT reactivated by normal retry.\n')

  // ---------------------------------------------------------------------------
  // TEST 9: Explicitly authorized reactivation works only for intended identity
  // ---------------------------------------------------------------------------
  console.log('--- Test 9: Explicitly authorized reactivation ---')
  await runProvisioning({
    expectedAuthUuid: rootAuthUuid,
    allowReactivation: true, // Explicit operator authorization
  })
  const checkPostTest9 = await db.query(`SELECT active FROM public.administrators WHERE id = 'admin-root-01';`)
  if (checkPostTest9.rows[0].active !== true) {
    throw new Error('Test 9 Failed: Explicit reactivation failed')
  }
  console.log('✅ PASS: Explicitly authorized reactivation succeeds for the verified identity.\n')

  // ---------------------------------------------------------------------------
  // TEST 10: Failed provisioning leaves no partial changes
  // ---------------------------------------------------------------------------
  console.log('--- Test 10: Failed provisioning leaves no partial changes ---')
  const countBefore = await db.query(`SELECT count(*) FROM public.administrators;`)
  let test10Error = ''
  try {
    await runProvisioning({
      adminId: 'admin-fail-test',
      adminEmail: 'nonexistent@example.com',
      expectedAuthUuid: '77777777-7777-4777-a777-777777777777',
    })
  } catch (err: any) {
    test10Error = err.message
  }
  const countAfter = await db.query(`SELECT count(*) FROM public.administrators;`)
  if (countBefore.rows[0].count !== countAfter.rows[0].count) {
    throw new Error('Test 10 Failed: Partial row was inserted during failed provisioning!')
  }
  console.log('✅ PASS: Failed provisioning rolled back atomically leaving zero partial changes.\n')

  // ---------------------------------------------------------------------------
  // TEST 11: Email case-insensitivity normalization check
  // ---------------------------------------------------------------------------
  console.log('--- Test 11: Email case-insensitivity normalization check ---')
  // Try running safe retry with uppercase email 'TALK2RKALYANI@GMAIL.COM'
  await runProvisioning({
    adminEmail: 'TALK2RKALYANI@GMAIL.COM',
    expectedAuthUuid: rootAuthUuid,
  })
  const countCase = await db.query(`SELECT count(*) FROM public.administrators WHERE email = '${rootEmail}';`)
  if (countCase.rows[0].count !== 1) {
    throw new Error('Test 11 Failed: Mixed-case created duplicate record!')
  }
  console.log('✅ PASS: Mixed-case email normalized cleanly without duplicate entries.\n')

  console.log('========================================================================')
  console.log('🎉 ALL 11 PHASE 15.10 SAFEGUARD & ISOLATION TESTS PASSED (100% SUCCESS)!')
  console.log('========================================================================')
}

runPhase15_10SafeguardTests().catch((err) => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})
