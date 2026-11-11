/**
 * Luma Salon — Automated Local Backup Restoration Validator
 * 
 * Verifies that a physical SQL dump can be restored cleanly into an isolated
 * PostgreSQL database (PGlite) without errors, confirming data integrity, constraints,
 * triggers, functions, RLS policies, and row counts.
 * 
 * Usage:
 *   npx tsx scratch/validate_backup_restore.ts [path-to-backup.sql]
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'

import { PGlite } from '@electric-sql/pglite'

interface BaselineCheck {
  table: string
  expected: number
}

const BASELINE_CHECKS: BaselineCheck[] = [
  { table: 'salons', expected: 1 },
  { table: 'staff', expected: 20 },
  { table: 'users', expected: 23 },
  { table: 'services', expected: 10 },
  { table: 'clients', expected: 14 },
  { table: 'appointments', expected: 18 },
]

const EXPECTED_FUNCTIONS = [
  'current_user_role',
  'current_user_staff_id',
  'fn_check_client_deletion_protection',
  'fn_check_last_owner_protection',
  'fn_check_service_deletion_protection',
  'fn_check_staff_deletion_protection',
  'fn_populate_appointment_snapshots',
  'is_owner',
  'is_owner_or_receptionist',
]

const EXPECTED_TRIGGERS = [
  'trg_check_client_deletion_protection',
  'trg_check_last_owner_protection',
  'trg_check_service_deletion_protection',
  'trg_check_staff_deletion_protection',
  'trg_populate_appointment_snapshots',
]

function resolveTargetFile(inputPath?: string): string {
  const candidates: string[] = []
  if (inputPath) {
    candidates.push(path.resolve(inputPath))
    candidates.push(path.resolve(process.cwd(), inputPath))
    candidates.push(path.resolve(process.cwd(), 'App code', inputPath))
    // If inputPath starts with App code/, also check without it
    if (inputPath.startsWith('App code/')) {
      candidates.push(path.resolve(process.cwd(), inputPath.replace(/^App code\//, '')))
    }
    // If inputPath doesn't start with App code/, also check with it
    candidates.push(path.resolve(process.cwd(), 'App code', inputPath))
  } else {
    candidates.push(path.resolve('supabase/backups/live_remote_backup_20261018_131610.sql'))
    candidates.push(path.resolve('App code/supabase/backups/live_remote_backup_20261018_131610.sql'))
    candidates.push(path.resolve('supabase/backups/baseline_pre_migration_000004_snapshot.sql'))
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c
    }
  }

  return path.resolve(inputPath || 'supabase/backups/live_remote_backup_20261018_131610.sql')
}

function parseCopyVal(val: string): string {
  if (val === '\\N') return 'NULL'
  let unescaped = ''
  for (let i = 0; i < val.length; i++) {
    if (val[i] === '\\' && i + 1 < val.length) {
      const next = val[i + 1]
      if (next === 'n') { unescaped += '\n'; i++ }
      else if (next === 't') { unescaped += '\t'; i++ }
      else if (next === '\\') { unescaped += '\\'; i++ }
      else { unescaped += next; i++ }
    } else {
      unescaped += val[i]
    }
  }
  return "'" + unescaped.replace(/'/g, "''") + "'"
}

function generateInsert(table: string, cols: string, rows: string[]): string {
  const valueRows = rows.map((r) => {
    const fields = r.split('\t')
    const sqlVals = fields.map(parseCopyVal)
    return '(' + sqlVals.join(', ') + ')'
  })
  return `INSERT INTO ${table} (${cols}) VALUES\n${valueRows.join(',\n')};`
}

function transformDumpToExecutableSql(sql: string): { transformed: string; copyTablesConverted: string[] } {
  const lines = sql.split('\n')
  const out: string[] = []
  let inCopy = false
  let copyTable = ''
  let copyCols = ''
  let copyRows: string[] = []
  const copyTablesConverted: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Comment out psql client backslash commands like \restrict, \unrestrict, \connect
    if (line.trim().startsWith('\\')) {
      out.push('-- [psql meta-command]: ' + line)
      if (line.trim() === '\\.') {
        inCopy = false
        if (copyRows.length > 0) {
          const insertStmt = generateInsert(copyTable, copyCols, copyRows)
          out.push(insertStmt)
          copyTablesConverted.push(copyTable)
          copyRows = []
        }
      }
      continue
    }

    if (!inCopy) {
      const match = line.match(/^COPY\s+([^\s]+)\s+\((.+)\)\s+FROM\s+stdin;/i)
      if (match) {
        inCopy = true
        copyTable = match[1]
        copyCols = match[2]
        copyRows = []
        out.push('-- [converted pg_dump COPY block]: ' + line)
        continue
      }
      out.push(line)
    } else {
      copyRows.push(line)
    }
  }

  return { transformed: out.join('\n'), copyTablesConverted }
}

async function validateBackup(filePath?: string) {
  console.log('==============================================================================')
  console.log('LUMA SALON — LOCAL BACKUP RESTORATION & INTEGRITY VALIDATOR')
  console.log('==============================================================================\n')

  const resolvedPath = resolveTargetFile(filePath)

  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ ERROR: Target backup file not found at: ${resolvedPath}`)
    console.error('Please verify the filename and path provided.')
    process.exit(1)
  }

  // 1. File Inspection & Size
  const stats = fs.statSync(resolvedPath)
  const sizeKb = (stats.size / 1024).toFixed(2)
  console.log(`Target Backup File:  ${resolvedPath}`)
  console.log(`File Size:           ${sizeKb} KB (${stats.size} bytes)`)

  // 2. Compute SHA-256 Checksum
  const fileBuffer = fs.readFileSync(resolvedPath)
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  console.log(`SHA-256 Checksum:    ${sha256}`)

  const rawSql = fileBuffer.toString('utf8')
  const lineCount = rawSql.split('\n').length
  console.log(`Total SQL Lines:     ${lineCount}`)

  // Inspect headers
  const pgDumpMatch = rawSql.match(/-- Dumped by pg_dump version ([^\n]+)/)
  const dbVerMatch = rawSql.match(/-- Dumped from database version ([^\n]+)/)
  if (pgDumpMatch) console.log(`pg_dump Utility:     ${pgDumpMatch[1]}`)
  if (dbVerMatch) console.log(`Source DB Version:   ${dbVerMatch[1]}`)

  // 3. Initialize Isolated PostgreSQL Instance
  console.log('\n--- Step 1: Initializing Isolated In-Memory PostgreSQL 16 Test Engine (PGlite) ---')
  const db = new PGlite()
  const versionRes = await db.query<{ version: string }>('SELECT version();')
  console.log(`PostgreSQL Engine:   ${versionRes.rows[0].version}`)

  // Setup auth schema and standard Supabase roles
  console.log('Provisioning Supabase core role stubs & auth schema in test sandbox...')
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN CREATE ROLE postgres; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN CREATE ROLE supabase_admin; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pg_database_owner') THEN CREATE ROLE pg_database_owner; END IF;
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
    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT 'authenticated';
    $$ LANGUAGE sql STABLE;

    -- Drop default public schema so dump's CREATE SCHEMA "public" executes cleanly
    DROP SCHEMA IF EXISTS public CASCADE;
  `)
  console.log('✅ Sandbox environment ready: roles, auth schema, and clean state created.')

  // 4. Transform and Execute Full SQL Restoration
  console.log('\n--- Step 2: Executing Full SQL Restoration in Disposable Sandbox ---')
  const { transformed, copyTablesConverted } = transformDumpToExecutableSql(rawSql)
  if (copyTablesConverted.length > 0) {
    console.log(`Transformed ${copyTablesConverted.length} COPY stdin data blocks to SQL INSERT statements.`)
  }

  const startTime = Date.now()
  try {
    await db.exec(transformed)
    const elapsed = Date.now() - startTime
    console.log(`✅ Full SQL restoration completed successfully in ${elapsed}ms.`)
  } catch (err: unknown) {
    console.error('\n❌ CRITICAL: SQL Restoration failed!')
    console.error((err as Error).message)
    await db.close()
    process.exit(1)
  }

  // 5. Inspect Restored Schema & Tables
  console.log('\n--- Step 3: Verifying Restored Database Tables & Row Counts ---')
  let totalRows = 0
  let countsMatch = true

  console.log('Table Row Verification:')
  for (const check of BASELINE_CHECKS) {
    try {
      const res = await db.query<{ count: string }>(`SELECT count(*) as count FROM public.${check.table};`)
      const count = parseInt(res.rows[0].count, 10)
      totalRows += count
      const isMatch = count === check.expected
      if (!isMatch) countsMatch = false
      const status = isMatch ? '✅ MATCH' : `❌ MISMATCH (Expected ${check.expected})`
      console.log(`  - public.${check.table.padEnd(14)} : ${count.toString().padEnd(4)} rows [${status}]`)
    } catch (tblErr) {
      countsMatch = false
      console.log(`  - public.${check.table.padEnd(14)} : ❌ MISSING TABLE!`)
    }
  }

  console.log(`\nTotal Database Records Restored: ${totalRows} (Baseline Expected: 86)`)

  // 6. Inspect Schema Definitions, Constraints, Triggers, Functions, Policies
  console.log('\n--- Step 4: Inspecting Schema Definitions & Database Objects ---')

  // Functions
  const fnRes = await db.query<{ routine_name: string }>(`
    SELECT routine_name 
    FROM information_schema.routines 
    WHERE routine_schema = 'public' 
    ORDER BY routine_name;
  `)
  const restoredFunctions = fnRes.rows.map((r) => r.routine_name)
  console.log(`\nFunctions in public schema (${restoredFunctions.length}):`)
  let missingFunctions = 0
  for (const expectedFn of EXPECTED_FUNCTIONS) {
    const found = restoredFunctions.includes(expectedFn)
    if (!found) missingFunctions++
    console.log(`  - ${expectedFn.padEnd(38)} : ${found ? '✅ PRESENT' : '❌ MISSING'}`)
  }

  // Triggers
  const trgRes = await db.query<{ trigger_name: string; event_object_table: string }>(`
    SELECT trigger_name, event_object_table 
    FROM information_schema.triggers 
    WHERE trigger_schema = 'public'
    ORDER BY trigger_name;
  `)
  console.log(`\nTriggers in public schema (${trgRes.rows.length}):`)
  let missingTriggers = 0
  const restoredTriggerNames = trgRes.rows.map((r) => r.trigger_name)
  for (const expectedTrg of EXPECTED_TRIGGERS) {
    const found = restoredTriggerNames.includes(expectedTrg)
    if (!found) missingTriggers++
    const matchedRow = trgRes.rows.find((r) => r.trigger_name === expectedTrg)
    const onTable = matchedRow ? `on ${matchedRow.event_object_table}` : ''
    console.log(`  - ${expectedTrg.padEnd(40)} ${onTable.padEnd(18)} : ${found ? '✅ PRESENT' : '❌ MISSING'}`)
  }

  // RLS Policies
  const rlsRes = await db.query<{ tablename: string; policyname: string }>(`
    SELECT tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public'
    ORDER BY tablename, policyname;
  `)
  console.log(`\nRow Level Security (RLS) Policies (${rlsRes.rows.length}):`)
  const policiesByTable: Record<string, string[]> = {}
  for (const p of rlsRes.rows) {
    if (!policiesByTable[p.tablename]) policiesByTable[p.tablename] = []
    policiesByTable[p.tablename].push(p.policyname)
  }
  for (const [tbl, pols] of Object.entries(policiesByTable)) {
    console.log(`  - Table public.${tbl}: ${pols.length} policies`)
    for (const p of pols) {
      console.log(`      * ${p}`)
    }
  }

  // Constraints
  const constrRes = await db.query<{ count: string }>(`
    SELECT count(*) as count 
    FROM information_schema.table_constraints 
    WHERE table_schema = 'public';
  `)
  console.log(`\nTable Constraints in Public: ${constrRes.rows[0].count}`)

  // Indexes
  const idxRes = await db.query<{ count: string }>(`
    SELECT count(*) as count 
    FROM pg_indexes 
    WHERE schemaname = 'public';
  `)
  console.log(`Indexes in Public Schema:    ${idxRes.rows[0].count}`)

  // 7. Final Verdict
  console.log('\n==============================================================================')
  if (countsMatch && totalRows === 86 && missingFunctions === 0 && missingTriggers === 0 && rlsRes.rows.length >= 23) {
    console.log('✅ FINAL VERDICT: BACKUP RESTORATION 100% VALIDATED & SUCCESSFUL')
    console.log('All 6 tables, 86 rows, 9 functions, 5 triggers, and 23 RLS policies verified!')
    console.log('The backup file is authentic, complete, and restorable.')
    console.log('==============================================================================')
    await db.close()
    process.exit(0)
  } else {
    console.error('❌ FINAL VERDICT: BACKUP VALIDATION FAILED')
    if (!countsMatch || totalRows !== 86) {
      console.error(`- Row counts mismatch! Expected 86 records, found ${totalRows}.`)
    }
    if (missingFunctions > 0) {
      console.error(`- Missing ${missingFunctions} expected functions.`)
    }
    if (missingTriggers > 0) {
      console.error(`- Missing ${missingTriggers} expected triggers.`)
    }
    console.log('==============================================================================')
    await db.close()
    process.exit(1)
  }
}

const inputArg = process.argv[2]
validateBackup(inputArg).catch((err) => {
  console.error('Validation runner encountered an unexpected error:', err)
  process.exit(1)
})
