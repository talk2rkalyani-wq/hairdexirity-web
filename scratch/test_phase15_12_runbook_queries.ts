import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function testRunbookQueries() {
  console.log('--- Testing Phase 15.12 Runbook Queries in PGlite ---')
  const db = new PGlite()

  // 1. Test Role Inspection Query
  const roleCheck = await db.query(`
    SELECT current_user, session_user, rolbypassrls, rolsuper 
    FROM pg_roles 
    WHERE rolname = current_user;
  `)
  console.log('Role Check:', roleCheck.rows[0])
  if (!roleCheck.rows[0].current_user) throw new Error('Role check failed')

  // Setup roles & auth
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

  // Load baseline
  const baselinePath = path.resolve(__dirname, '../supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  await db.exec(fs.readFileSync(baselinePath, 'utf8'))

  // 2. Test Baseline Reference Query
  const baselineCounts = await db.query(`
    SELECT 'salons' AS table_name, count(*) AS live_rows, 1 AS historical_baseline_rows FROM public.salons
    UNION ALL
    SELECT 'staff', count(*), 20 FROM public.staff
    UNION ALL
    SELECT 'users', count(*), 23 FROM public.users
    UNION ALL
    SELECT 'services', count(*), 10 FROM public.services
    UNION ALL
    SELECT 'clients', count(*), 14 FROM public.clients
    UNION ALL
    SELECT 'appointments', count(*), 18 FROM public.appointments;
  `)
  console.log('Baseline Counts Check:', baselineCounts.rows)
  if (baselineCounts.rows.length !== 6) throw new Error('Baseline query failed')

  // 3. Apply 000004
  const mig4Path = path.resolve(__dirname, '../supabase/migrations/20261015000004_admin_and_owner_rebuild.sql')
  await db.exec(fs.readFileSync(mig4Path, 'utf8'))

  // 4. Test Post-000004 Verification Queries
  const mig4Verify = await db.query(`
    SELECT count(*) AS admin_columns_count 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'administrators';
  `)
  if (mig4Verify.rows[0].admin_columns_count !== 8) throw new Error('000004 verification failed')

  // 5. Apply 000005
  const mig5Path = path.resolve(__dirname, '../supabase/migrations/20261015000005_cross_salon_isolation_and_rls_hardening.sql')
  await db.exec(fs.readFileSync(mig5Path, 'utf8'))

  // 6. Test Post-000005 Verification Queries
  const rlsCheck = await db.query(`
    SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity, c.relforcerowsecurity AS forcerowsecurity 
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
      AND c.relname IN ('salons', 'staff', 'users', 'services', 'clients', 'appointments', 'administrators')
    ORDER BY c.relname;
  `)
  console.log('RLS and Force RLS status:', rlsCheck.rows)
  if (rlsCheck.rows.length !== 7) throw new Error('000005 RLS verification failed')
  if (!rlsCheck.rows.every((r: any) => r.rowsecurity && r.forcerowsecurity)) {
    throw new Error('Some tables do not have rowsecurity and forcerowsecurity enabled!')
  }

  // 7. Test Catalog Statistics Query (RLS-Immune)
  const catalogStats = await db.query(`
    SELECT relname AS table_name, n_live_tup AS catalog_row_estimate
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY relname;
  `)
  console.log('Catalog Stats:', catalogStats.rows)

  console.log('✅ ALL PHASE 15.12 RUNBOOK QUERIES VALIDATED IN PGLITE!')
}

testRunbookQueries().catch((err) => {
  console.error('Runbook queries test failed:', err)
  process.exit(1)
})
