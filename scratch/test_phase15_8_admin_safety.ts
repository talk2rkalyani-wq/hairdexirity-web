import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function runAdminSafetyTests() {
  console.log('========================================================================')
  console.log('LUMA SALON — PHASE 15.8: ROOT ADMINISTRATOR IDENTITY SAFETY TESTS')
  console.log('========================================================================\n')

  const db = new PGlite()

  // 1. Initialize Supabase Auth Schema & Roles
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
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
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

  // 2. Load baseline & Migration 000004 & 000005
  const baselinePath = path.resolve(__dirname, '../supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  const mig4Path = path.resolve(__dirname, '../supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  const mig5Path = path.resolve(__dirname, '../supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')

  await db.exec(fs.readFileSync(baselinePath, 'utf8'))
  await db.exec(fs.readFileSync(mig4Path, 'utf8'))
  await db.exec(fs.readFileSync(mig5Path, 'utf8'))

  console.log('Database initialized with Migration 000004 & 000005.\n')

  // Helper function to run provisioning PL/pgSQL block
  async function runProvisioning(
    adminEmail: string,
    adminName: string,
    expectedUuid: string | null = null,
    adminId: string = 'admin-root-01'
  ) {
    const expectedUuidClause = expectedUuid ? `'${expectedUuid}'::uuid` : 'NULL'
    const sql = `
      DO $$
      DECLARE
          v_admin_id TEXT := '${adminId}';
          v_admin_email TEXT := '${adminEmail}';
          v_admin_name TEXT := '${adminName}';
          v_expected_auth_uuid UUID := ${expectedUuidClause};
          v_norm_email TEXT;
          v_auth_id UUID;
          v_existing_admin_by_email RECORD;
          v_existing_admin_by_auth RECORD;
      BEGIN
          v_norm_email := lower(trim(v_admin_email));

          -- 1. Locate the user identity in auth.users
          SELECT id INTO v_auth_id
          FROM auth.users
          WHERE lower(trim(email)) = v_norm_email
          LIMIT 1;

          IF v_auth_id IS NULL THEN
              RAISE EXCEPTION 'Administrator provisioning failed: No user found in auth.users with email "%". Create the user first in Supabase Dashboard -> Authentication -> Users.', v_norm_email;
          END IF;

          -- 2. Optional strict assertion check
          IF v_expected_auth_uuid IS NOT NULL AND v_auth_id <> v_expected_auth_uuid THEN
              RAISE EXCEPTION 'Security violation: Auth user found for email "%" has UUID "%", which does not match expected UUID "%". Aborting.',
                  v_norm_email, v_auth_id, v_expected_auth_uuid;
          END IF;

          -- 3. Check for existing administrators record by email
          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_email
          FROM public.administrators
          WHERE email = v_norm_email;

          -- 4. Check for existing administrators record by auth_user_id
          SELECT id, auth_user_id, email, active INTO v_existing_admin_by_auth
          FROM public.administrators
          WHERE auth_user_id = v_auth_id;

          -- 5. Evaluate identity consistency and branch accordingly
          IF v_existing_admin_by_email.id IS NOT NULL THEN
              IF v_existing_admin_by_email.auth_user_id = v_auth_id THEN
                  -- SAFE RETRY: Same email and same auth_user_id
                  UPDATE public.administrators
                  SET 
                      name = v_admin_name,
                      active = true,
                      updated_at = timezone('utc'::text, now())
                  WHERE id = v_existing_admin_by_email.id;

                  RAISE NOTICE 'Safe retry: Administrator "%" (id: %) is already linked to verified auth_user_id %.',
                      v_norm_email, v_existing_admin_by_email.id, v_auth_id;
                  RETURN;
              ELSE
                  -- CRITICAL CONFLICT: Target email is already bound to a DIFFERENT auth_user_id
                  RAISE EXCEPTION 'Security conflict: Administrator profile for email "%" is already linked to auth_user_id "%". Attempted to link to different auth_user_id "%". Silent privilege transfer is strictly prohibited. Manual database review required.',
                      v_norm_email, v_existing_admin_by_email.auth_user_id, v_auth_id;
              END IF;
          END IF;

          IF v_existing_admin_by_auth.id IS NOT NULL THEN
              -- auth_user_id already exists but under a different email
              RAISE EXCEPTION 'Security conflict: auth_user_id "%" is already linked to administrator email "%". Prohibited from binding to email "%".',
                  v_auth_id, v_existing_admin_by_auth.email, v_norm_email;
          END IF;

          -- 6. FIRST-TIME PROVISIONING
          INSERT INTO public.administrators (
              id,
              auth_user_id,
              email,
              name,
              role,
              active,
              created_at,
              updated_at
          )
          VALUES (
              v_admin_id,
              v_auth_id,
              v_norm_email,
              v_admin_name,
              'ADMIN',
              true,
              timezone('utc'::text, now()),
              timezone('utc'::text, now())
          );

          RAISE NOTICE 'Success: Administrator "%" (id: %) provisioned and bound to auth_user_id %.',
              v_norm_email, v_admin_id, v_auth_id;
      END;
      $$;
    `
    await db.exec(sql)
  }

  // TEST 1: Missing Auth user -> Explicit Error
  console.log('--- Test 1: Provisioning with missing Auth user ---')
  let test1Error = ''
  try {
    await runProvisioning('talk2rkalyani@gmail.com', 'Root Administrator')
  } catch (err: any) {
    test1Error = err.message
  }
  if (!test1Error.includes('No user found in auth.users')) {
    throw new Error(`Test 1 Failed: Expected missing user exception, got: ${test1Error}`)
  }
  console.log('✅ PASS: Rejected non-existent Auth user with explicit message.\n')

  // Create real Auth user 1
  const authUser1Id = '11111111-1111-4111-a111-111111111111'
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${authUser1Id}', 'talk2rkalyani@gmail.com');
  `)

  // TEST 2: First-time provisioning -> Success
  console.log('--- Test 2: First-time administrator provisioning ---')
  await runProvisioning('talk2rkalyani@gmail.com', 'Root Administrator')
  const adminCheck = await db.query("SELECT * FROM public.administrators WHERE email = 'talk2rkalyani@gmail.com';")
  if (adminCheck.rows.length !== 1) throw new Error('Test 2 Failed: administrator record not created')
  if (adminCheck.rows[0].auth_user_id !== authUser1Id) throw new Error('Test 2 Failed: auth_user_id mismatch')
  console.log(`✅ PASS: Successfully provisioned administrator with auth_user_id ${authUser1Id}.\n`)

  // TEST 3: Safe Retry (Idempotency with same UUID) -> Success
  console.log('--- Test 3: Safe retry (idempotency with identical UUID) ---')
  await runProvisioning('talk2rkalyani@gmail.com', 'Root Administrator Updated')
  const retryCheck = await db.query("SELECT * FROM public.administrators WHERE email = 'talk2rkalyani@gmail.com';")
  if (retryCheck.rows.length !== 1) throw new Error('Test 3 Failed: duplicate administrator record created')
  if (retryCheck.rows[0].name !== 'Root Administrator Updated') throw new Error('Test 3 Failed: name not updated on safe retry')
  if (retryCheck.rows[0].auth_user_id !== authUser1Id) throw new Error('Test 3 Failed: auth_user_id changed on safe retry')
  console.log('✅ PASS: Idempotent re-run succeeded without duplicate rows or errors.\n')

  // TEST 4: Email conflict (Different Auth UUID tries to claim same email) -> Strictly Rejected
  console.log('--- Test 4: Email conflict: Different Auth UUID attempts to claim existing admin email ---')
  const authUser2Id = '22222222-2222-4222-a222-222222222222'
  // Create second user in auth.users and swap emails to simulate re-registration under new UUID
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${authUser2Id}', 'temp_user2@example.com');
    UPDATE auth.users SET email = 'talk2rkalyani_archived@gmail.com' WHERE id = '${authUser1Id}';
    UPDATE auth.users SET email = 'talk2rkalyani@gmail.com' WHERE id = '${authUser2Id}';
  `)
  let test4Error = ''
  try {
    await runProvisioning('talk2rkalyani@gmail.com', 'Imposter Administrator')
  } catch (err: any) {
    test4Error = err.message
  }
  if (!test4Error.includes('Silent privilege transfer is strictly prohibited')) {
    throw new Error(`Test 4 Failed: Expected silent privilege transfer exception, got: ${test4Error}`)
  }
  // Verify administrator record in database was NOT modified
  const postTest4Admin = await db.query("SELECT * FROM public.administrators WHERE email = 'talk2rkalyani@gmail.com';")
  if (postTest4Admin.rows[0].auth_user_id !== authUser1Id) {
    throw new Error('Test 4 Failed: auth_user_id was silently overwritten!')
  }
  console.log('✅ PASS: Blocked attempt to transfer admin identity to new UUID. Existing link preserved.\n')

  // Restore Auth user 1 email
  await db.exec(`
    UPDATE auth.users SET email = 'user2_other@example.com' WHERE id = '${authUser2Id}';
    UPDATE auth.users SET email = 'talk2rkalyani@gmail.com' WHERE id = '${authUser1Id}';
  `)

  // TEST 5: Mismatched Expected Auth UUID -> Explicit Error
  console.log('--- Test 5: Mismatched Expected Auth UUID assertion ---')
  let test5Error = ''
  const wrongUuid = '33333333-3333-4333-a333-333333333333'
  try {
    await runProvisioning('talk2rkalyani@gmail.com', 'Root Administrator', wrongUuid)
  } catch (err: any) {
    test5Error = err.message
  }
  if (!test5Error.includes('does not match expected UUID')) {
    throw new Error(`Test 5 Failed: Expected UUID mismatch exception, got: ${test5Error}`)
  }
  console.log('✅ PASS: Explicitly rejected mismatch against expected UUID.\n')

  // TEST 6: Same Auth UUID with different email -> Strictly Rejected
  console.log('--- Test 6: Cross-Identity Conflict: Same Auth UUID for different email ---')
  const authUser3Id = '33333333-3333-4333-a333-333333333333'
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${authUser3Id}', 'secondary@lumasalon.example.com');
  `)
  // First provision secondary
  await runProvisioning('secondary@lumasalon.example.com', 'Secondary Admin', null, 'admin-secondary-02')
  // Now try to provision with an account that has authUser3Id under a different email
  let test6Error = ''
  try {
    await db.exec(`
      DO $$
      BEGIN
        INSERT INTO public.administrators (id, auth_user_id, email, name, role)
        VALUES ('admin-hijack', '${authUser3Id}', 'hijack@example.com', 'Hijacker', 'ADMIN');
      END $$;
    `)
  } catch (err: any) {
    test6Error = err.message
  }
  if (!test6Error.includes('unique constraint') && !test6Error.includes('idx_administrators_auth_user_id')) {
    throw new Error(`Test 6 Failed: Expected unique constraint violation on auth_user_id, got: ${test6Error}`)
  }
  console.log('✅ PASS: Database uniqueness constraint prevented re-use of auth_user_id across emails.\n')

  // TEST 7: Database Uniqueness on Email
  console.log('--- Test 7: Database Uniqueness on Email ---')
  let test7Error = ''
  try {
    await db.exec(`
      INSERT INTO public.administrators (id, auth_user_id, email, name, role)
      VALUES ('admin-dup-email', gen_random_uuid(), 'talk2rkalyani@gmail.com', 'Duplicate Email', 'ADMIN');
    `)
  } catch (err: any) {
    test7Error = err.message
  }
  if (!test7Error.includes('unique constraint')) {
    throw new Error(`Test 7 Failed: Expected unique constraint on email, got: ${test7Error}`)
  }
  console.log('✅ PASS: Database uniqueness constraint prevented duplicate administrator emails.\n')

  console.log('========================================================================')
  console.log('🎉 ALL 7 ROOT ADMINISTRATOR IDENTITY SAFETY TESTS PASSED (100% SUCCESS)!')
  console.log('========================================================================')
}

runAdminSafetyTests().catch((err) => {
  console.error('TEST FAILED:', err)
  process.exit(1)
})
