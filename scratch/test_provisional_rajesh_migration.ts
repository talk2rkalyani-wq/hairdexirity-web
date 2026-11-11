import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testProvisionalRajeshMigration() {
  console.log('--- Testing Migration 000006 and Rollback 000006 in Disposable PGlite ---')
  const db = new PGlite()

  // Initialize roles and stubs
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
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb
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

  // Load baseline
  const baselinePath = path.resolve(__dirname, '../supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  await db.exec(fs.readFileSync(baselinePath, 'utf8'))

  // Load Migration 000004 & 000005
  const mig4Path = path.resolve(__dirname, '../supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  const mig5Path = path.resolve(__dirname, '../supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')
  await db.exec(fs.readFileSync(mig4Path, 'utf8'))
  await db.exec(fs.readFileSync(mig5Path, 'utf8'))

  // Check state before 000006
  const preCheck = await db.query("SELECT employee_id FROM public.users WHERE id = 'user-owner-01';")
  if (preCheck.rows[0].employee_id !== null) throw new Error('user-owner-01 employee_id should be null before 000006')

  // Apply Migration 000006
  const mig6Path = path.resolve(__dirname, '../supabase/migrations/20261015000006_provisional_rajesh_staff_profile.sql')
  await db.exec(fs.readFileSync(mig6Path, 'utf8'))
  console.log('✅ PASS: Migration 000006 applied cleanly.')

  // Check state after 000006
  const postCheck = await db.query("SELECT employee_id FROM public.users WHERE id = 'user-owner-01';")
  if (postCheck.rows[0].employee_id !== 'staff-real-03') throw new Error('user-owner-01 not linked to staff-real-03')

  const staffCheck = await db.query("SELECT * FROM public.staff WHERE id = 'staff-real-03';")
  if (staffCheck.rows.length !== 1 || staffCheck.rows[0].name !== 'Rajesh') throw new Error('staff-real-03 not found')
  console.log('✅ PASS: Rajesh staff profile created and linked.')

  // Verify Mia Vance untouched
  const miaUser = await db.query("SELECT employee_id FROM public.users WHERE id = 'user-emp-01';")
  if (miaUser.rows[0].employee_id !== 'staff-01') throw new Error('Mia Vance corrupted!')
  console.log('✅ PASS: Mia Vance identity untouched.')

  // Set cli-01 to VIP
  await db.exec("UPDATE public.clients SET is_vip = true WHERE id = 'cli-01';")

  // Test VIP trigger with staff-real-03
  // 1. Online booking for VIP client with Rajesh -> MUST FAIL
  let vipBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.appointments (
        id, salon_id, client_id, staff_id, service_id,
        date, start_time, end_time, status, price, booking_source
      ) VALUES (
        'apt-vip-test-rajesh', 'salon-luma-01', 'cli-01', 'staff-real-03', 'srv-01',
        '2026-10-28', '11:00', '12:00', 'scheduled', 1000.00, 'online'
      );
    `)
  } catch (err: any) {
    if (err.message.includes('Booking Policy Violation')) {
      vipBlocked = true
    } else {
      throw err
    }
  }
  if (!vipBlocked) throw new Error('VIP online booking with Rajesh was not blocked!')
  console.log('✅ PASS: VIP online booking with staff-real-03 blocked by trigger.')

  // 2. In-salon manual booking with Rajesh -> MUST PASS
  await db.exec(`
    INSERT INTO public.appointments (
      id, salon_id, client_id, staff_id, service_id,
      date, start_time, end_time, status, price, booking_source
    ) VALUES (
      'apt-vip-test-rajesh-insalon', 'salon-luma-01', 'cli-01', 'staff-real-03', 'srv-01',
      '2026-10-28', '11:00', '12:00', 'scheduled', 1000.00, 'in_salon'
    );
  `)
  console.log('✅ PASS: VIP in-salon booking with staff-real-03 permitted.')

  // Test rollback: Delete test appointment first
  await db.exec("DELETE FROM public.appointments WHERE id = 'apt-vip-test-rajesh-insalon';")

  const rollback6Path = path.resolve(__dirname, '../supabase/scripts/rollback_20261015000006.sql')
  await db.exec(fs.readFileSync(rollback6Path, 'utf8'))
  console.log('✅ PASS: Rollback 000006 executed cleanly.')

  const postRollCheck = await db.query("SELECT employee_id FROM public.users WHERE id = 'user-owner-01';")
  if (postRollCheck.rows[0].employee_id !== null) throw new Error('user-owner-01 employee_id should be null after rollback')

  const postRollStaff = await db.query("SELECT * FROM public.staff WHERE id = 'staff-real-03';")
  if (postRollStaff.rows.length !== 0) throw new Error('staff-real-03 should be deleted after rollback')
  console.log('✅ PASS: Clean state restored after rollback 000006.')
}

testProvisionalRajeshMigration().catch((err: any) => {
  console.error('FAILED MESSAGE:', err.message)
  console.error('FAILED STACK:', err.stack)
  process.exit(1)
})
