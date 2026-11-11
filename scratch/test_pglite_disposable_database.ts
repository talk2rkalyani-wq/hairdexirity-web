/**
 * Luma Salon — Disposable PostgreSQL 16 Engine Test Suite (PGlite)
 *
 * Runs full end-to-end verification against a real WebAssembly-compiled PostgreSQL 16 engine:
 * 1. Initializes fresh PostgreSQL 16 database.
 * 2. Creates auth schema & auth.users stub (matching Supabase environment).
 * 3. Applies baseline recoverable backup (Migrations 000001 + 000002 + 000003 + 86 Production Records).
 * 4. Verifies baseline record counts (86 records: salons=1, staff=20, users=23, services=10, clients=14, appointments=18).
 * 5. Applies Migration 000004 (Admin Panel, Owner Designations, Staff Attributes, VIP Trigger, RLS Policies).
 * 6. Executes Phase B verification queries (verifies new columns, indexes, constraints, trigger, function).
 * 7. Tests live constraint & trigger behavior:
 *    - Rejects duplicate OWNER_1.
 *    - Rejects 3rd owner.
 *    - VIP online booking rejection for Rajesh (Owner 1).
 *    - VIP in-salon booking acceptance for Rajesh (Owner 1).
 * 8. Applies Rollback Script (rollback_20261015000004.sql).
 * 9. Asserts clean return to baseline schema state.
 */

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

async function runRealPostgresTest() {
  console.log('========================================================================')
  console.log('LUMA SALON — DISPOSABLE POSTGRESQL 16 (PGLITE) ENGINE VERIFICATION')
  console.log('========================================================================\n')

  const db = new PGlite()
  const versionRes = await db.query('SELECT version();')
  console.log('PostgreSQL Core Engine:', (versionRes.rows[0] as any).version)

  // 1. Setup Supabase Auth Schema & Stubs
  console.log('\n>>> [STEP 1: INITIALIZE SUPABASE AUTH STUBS & ROLES]')
  await db.exec(`
    DO $$ BEGIN
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

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT '00000000-0000-0000-0000-000000000001'::uuid;
    $$ LANGUAGE sql STABLE;
  `)
  console.log('✅ PASS: auth schema, roles (anon, authenticated, service_role), auth.users stub, and auth.uid() initialized.')

  // 2. Apply Baseline Recoverable Backup (Migrations 000001, 000002, 000003 + 86 rows)
  console.log('\n>>> [STEP 2: RESTORE BASELINE BACKUP SNAPSHOT]')
  const baselineBackupPath = path.resolve(process.cwd(), 'supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  const baselineSql = fs.readFileSync(baselineBackupPath, 'utf8')

  await db.exec(baselineSql)
  console.log('✅ PASS: Baseline backup snapshot successfully restored.')

  // 3. Verify Baseline Row Counts
  console.log('\n>>> [STEP 3: ASSERT BASELINE ROW COUNTS (EXACTLY 86 RECORDS)]')
  const countChecks = [
    { table: 'salons', expected: 1 },
    { table: 'staff', expected: 20 },
    { table: 'users', expected: 23 },
    { table: 'services', expected: 10 },
    { table: 'clients', expected: 14 },
    { table: 'appointments', expected: 18 },
  ]
  let totalRows = 0
  for (const check of countChecks) {
    const res = await db.query(`SELECT COUNT(*) as cnt FROM public.${check.table};`)
    const actual = Number((res.rows[0] as any).cnt)
    totalRows += actual
    if (actual !== check.expected) {
      throw new Error(`Row count mismatch on '${check.table}': expected ${check.expected}, found ${actual}`)
    }
    console.log(`  - Table '${check.table}': ${actual} records (Expected: ${check.expected}) ✅`)
  }
  if (totalRows !== 86) throw new Error(`Total rows = ${totalRows}, expected 86!`)
  console.log(`✅ PASS: Exactly 86 baseline records verified in PostgreSQL database.`)

  // 4. Apply Migration 000004
  console.log('\n>>> [STEP 4: EXECUTE MIGRATION 000004]')
  const migPath = path.resolve(process.cwd(), 'supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  const migSql = fs.readFileSync(migPath, 'utf8')

  await db.exec(migSql)
  console.log('✅ PASS: Migration 000004 applied cleanly without error.')

  // 5. Verify Post-Migration Schema Elements
  console.log('\n>>> [STEP 5: RUN POST-MIGRATION VERIFICATION SQL]')

  // A. Check administrators table
  const adminColRes = await db.query(`
    SELECT column_name, data_type FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'administrators';
  `)
  if (adminColRes.rows.length === 0) throw new Error('Table administrators not found!')
  console.log(`✅ PASS: Table 'public.administrators' created with ${adminColRes.rows.length} columns.`)

  // B. Check owner_designation column & values on users
  const ownersRes = await db.query(`
    SELECT id, role, owner_designation FROM public.users WHERE role = 'OWNER';
  `)
  console.log('Verified Owners in DB:', ownersRes.rows)
  const o1 = (ownersRes.rows as any[]).find(r => r.id === 'user-owner-01')
  const o2 = (ownersRes.rows as any[]).find(r => r.id === 'user-owner-02')
  if (o1?.owner_designation !== 'OWNER_1' || o2?.owner_designation !== 'OWNER_2') {
    throw new Error('Safe pre-population of owner designations failed!')
  }
  console.log('✅ PASS: user-owner-01 -> OWNER_1, user-owner-02 -> OWNER_2 properly assigned.')

  // C. Check staff gender and job_title
  const staffColRes = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'staff' AND column_name IN ('gender', 'job_title');
  `)
  if (staffColRes.rows.length !== 2) throw new Error('staff columns gender/job_title missing!')
  console.log('✅ PASS: Columns gender and job_title active on public.staff.')

  // D. Check clients is_vip
  const clientColRes = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'is_vip';
  `)
  if (clientColRes.rows.length !== 1) throw new Error('clients column is_vip missing!')
  console.log('✅ PASS: Column is_vip active on public.clients.')

  // E. Check booking_source on appointments
  const apptColRes = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'booking_source';
  `)
  if (apptColRes.rows.length !== 1) throw new Error('appointments column booking_source missing!')
  console.log('✅ PASS: Column booking_source active on public.appointments.')

  // 6. Test Live PostgreSQL Constraints & Triggers
  console.log('\n>>> [STEP 6: TEST LIVE POSTGRESQL CONSTRAINTS & TRIGGERS]')

  // Test 1: Reject duplicate OWNER_1
  let dupOwnerBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.users (id, salon_id, name, email, role, owner_designation)
      VALUES ('user-owner-dup', 'salon-luma-01', 'Dup Owner', 'dup@lumasalon.example.com', 'OWNER', 'OWNER_1');
    `)
  } catch (err: any) {
    if (err.message.includes('unique') || err.message.includes('idx_users_owner_designation_unique')) {
      dupOwnerBlocked = true
    }
  }
  if (!dupOwnerBlocked) throw new Error('PostgreSQL allowed duplicate OWNER_1!')
  console.log('✅ PASS: PostgreSQL kernel rejected duplicate OWNER_1 (unique constraint enforced).')

  // Test 2: Reject 3rd owner with invalid designation
  let invalidDesigBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.users (id, salon_id, name, email, role, owner_designation)
      VALUES ('user-owner-3', 'salon-luma-01', 'Owner 3', 'owner3@lumasalon.example.com', 'OWNER', 'OWNER_3');
    `)
  } catch (err: any) {
    if (err.message.includes('chk_users_owner_consistency') || err.message.includes('check constraint')) {
      invalidDesigBlocked = true
    }
  }
  if (!invalidDesigBlocked) throw new Error('PostgreSQL allowed OWNER_3!')
  console.log('✅ PASS: PostgreSQL kernel rejected OWNER_3 (chk_users_owner_consistency enforced).')

  // Test 3: Set VIP client & verify Mia Vance (staff-01) online booking is ALLOWED
  await db.exec(`
    UPDATE public.clients SET is_vip = true WHERE id = 'cli-01';
    -- Normal online booking with Mia Vance (staff-01) MUST succeed
    INSERT INTO public.appointments (
      id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
    ) VALUES (
      'apt-mia-vip-online', 'salon-luma-01', 'cli-01', 'staff-01', '2026-10-30', '09:00', '10:00', 'scheduled', 600.00, 'online'
    );
  `)
  console.log('✅ PASS: Online booking for VIP client with Mia Vance (staff-01) allowed normally.')

  // Test 4: Link user-owner-01 to distinct Rajesh staff profile
  await db.exec(`
    INSERT INTO public.staff (
      id, salon_id, name, phone, email, role, job_title, gender, active
    ) VALUES (
      'staff-rajesh', 'salon-luma-01', 'Rajesh', '+91 98111 00003', 'owner1@lumasalon.example.com', 'owner', 'Premium Hair Stylist', 'Male', true
    );
    UPDATE public.users SET employee_id = 'staff-rajesh' WHERE id = 'user-owner-01';
  `)

  // Test 5: VIP Client + Rajesh (Owner 1) + online booking -> BLOCKED BY TRIGGER
  let vipOnlineTriggerBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.appointments (
        id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
      ) VALUES (
        'apt-vip-test', 'salon-luma-01', 'cli-01', 'staff-rajesh', '2026-10-30', '10:00', '11:00', 'scheduled', 1000.00, 'online'
      );
    `)
  } catch (err: any) {
    if (err.message.includes('Booking Policy Violation')) {
      vipOnlineTriggerBlocked = true
    }
  }
  if (!vipOnlineTriggerBlocked) throw new Error('PostgreSQL trigger failed to block VIP online booking!')
  console.log('✅ PASS: PostgreSQL trigger fn_enforce_vip_booking_rules successfully blocked VIP online booking for Rajesh.')

  // Test 6: VIP Client + Rajesh + in_salon manual booking -> ALLOWED
  await db.exec(`
    INSERT INTO public.appointments (
      id, salon_id, client_id, staff_id, date, start_time, end_time, status, price, booking_source
    ) VALUES (
      'apt-vip-manual', 'salon-luma-01', 'cli-01', 'staff-rajesh', '2026-10-30', '10:00', '11:00', 'scheduled', 1000.00, 'in_salon'
    );
  `)
  console.log('✅ PASS: PostgreSQL trigger permitted in-salon manual booking for VIP client with Owner 1 (Rajesh).')

  // Clean up test rows
  await db.exec(`
    DELETE FROM public.appointments WHERE id IN ('apt-mia-vip-online', 'apt-vip-manual');
    UPDATE public.users SET employee_id = NULL WHERE id = 'user-owner-01';
    DELETE FROM public.staff WHERE id = 'staff-rajesh';
    UPDATE public.clients SET is_vip = false WHERE id = 'cli-01';
  `)

  // 7. Execute Rollback Script
  console.log('\n>>> [STEP 7: EXECUTE ROLLBACK SCRIPT]')
  const rollPath = path.resolve(process.cwd(), 'supabase/scripts/rollback_20261015000004.sql')
  const rollSql = fs.readFileSync(rollPath, 'utf8')

  await db.exec(rollSql)
  console.log('✅ PASS: Rollback script executed cleanly without error.')

  // 8. Assert Post-Rollback Clean Baseline State
  console.log('\n>>> [STEP 8: VERIFY CLEAN POST-ROLLBACK STATE]')
  const postRollAdminRes = await db.query(`
    SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'administrators';
  `)
  if (postRollAdminRes.rows.length !== 0) throw new Error('Table administrators was not dropped!')
  console.log('✅ PASS: Table administrators confirmed dropped.')

  const postRollColsRes = await db.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'owner_designation';
  `)
  if (postRollColsRes.rows.length !== 0) throw new Error('Column owner_designation was not dropped!')
  console.log('✅ PASS: Column owner_designation confirmed dropped from users.')

  const postRollCount = await db.query('SELECT count(*) as cnt FROM public.users;')
  if (Number((postRollCount.rows[0] as any).cnt) !== 23) throw new Error('Users count changed!')
  console.log('✅ PASS: All 23 original user records intact after rollback.')

  console.log('\n========================================================================')
  console.log('🎉 REAL POSTGRESQL 16 DISPOSABLE DATABASE VERIFICATION PASSED (100%)!')
  console.log('========================================================================')
}

runRealPostgresTest().catch(err => {
  console.error('Fatal Test Error:', err)
  process.exit(1)
})
