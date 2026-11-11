/**
 * Luma Salon — Phase 14.1 Automated Verification Suite
 * Supabase Setup, Database Foundation, Migrations & Migration Utility
 */

import fs from 'fs'
import path from 'path'
import {
  extractAndValidateLocalStorage,
  generateIdempotentSql,
  STORAGE_KEYS,
  type StorageAccessor,
} from '../src/utils/migrationUtility'
import { isSupabaseConfigured, getSupabaseClient } from '../src/lib/supabaseClient'
import { mockClients, mockServices, mockStaff } from '../src/mockData/salonEntities'
import { mockUsers } from '../src/mockData/usersData'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhase14_1_Suite() {
  console.log('=================================================================')
  console.log('PHASE 14.1 AUTOMATED VERIFICATION: SUPABASE FOUNDATION & MIGRATIONS')
  console.log('=================================================================\n')

  // ----------------------------------------------------
  // TEST 1: Supabase client & environment configuration
  // ----------------------------------------------------
  console.log('--- TEST 1: Supabase Client Graceful Initialization ---')
  const envExamplePath = path.resolve(process.cwd(), '.env.example')
  assert(fs.existsSync(envExamplePath), '.env.example exists')
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8')
  assert(envExampleContent.includes('VITE_SUPABASE_URL'), '.env.example defines VITE_SUPABASE_URL')
  assert(
    envExampleContent.includes('VITE_SUPABASE_PUBLISHABLE_KEY'),
    '.env.example defines VITE_SUPABASE_PUBLISHABLE_KEY'
  )
  assert(
    envExampleContent.includes('NEVER put a Supabase service_role key'),
    '.env.example contains security warning regarding service-role keys'
  )

  const isConfigured = isSupabaseConfigured()
  console.log(`Supabase configured status: ${isConfigured}`)
  const client = getSupabaseClient()
  if (!isConfigured) {
    assert(client === null, 'Client returns null gracefully without throwing when unconfigured')
  }

  // ----------------------------------------------------
  // TEST 2: .gitignore rules for credentials
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Git Exclusion Security ---')
  const gitignorePath = path.resolve(process.cwd(), '.gitignore')
  assert(fs.existsSync(gitignorePath), '.gitignore exists')
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
  assert(gitignoreContent.includes('.env'), '.gitignore excludes .env files')
  assert(gitignoreContent.includes('!.env.example'), '.gitignore preserves .env.example')
  assert(gitignoreContent.includes('scratch/exports/'), '.gitignore excludes local data exports')

  // ----------------------------------------------------
  // TEST 3: Migration files inspection
  // ----------------------------------------------------
  console.log('\n--- TEST 3: SQL Migration Files Integrity ---')
  const mig1Path = path.resolve(process.cwd(), 'supabase/migrations/20261015000001_initial_schema.sql')
  const mig2Path = path.resolve(process.cwd(), 'supabase/migrations/20261015000002_row_level_security.sql')

  assert(fs.existsSync(mig1Path), 'Migration 000001 (initial schema) exists')
  assert(fs.existsSync(mig2Path), 'Migration 000002 (RLS) exists')

  const mig1 = fs.readFileSync(mig1Path, 'utf8')
  const mig2 = fs.readFileSync(mig2Path, 'utf8')

  // Check Schema tables & constraints
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.salons'), 'Creates salons table')
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.staff'), 'Creates staff table')
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.users'), 'Creates users table')
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.services'), 'Creates services table')
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.clients'), 'Creates clients table')
  assert(mig1.includes('CREATE TABLE IF NOT EXISTS public.appointments'), 'Creates appointments table')

  // Check Precise Numerics
  assert(mig1.includes('price NUMERIC(10, 2)'), 'Services price uses precise NUMERIC(10, 2)')
  assert(mig1.includes('total_spend NUMERIC(10, 2)'), 'Clients total_spend uses precise NUMERIC(10, 2)')

  // Check Asia/Kolkata timezone & historical snapshots
  assert(mig1.includes("'Asia/Kolkata'"), 'Preserves Asia/Kolkata salon timezone')
  assert(mig1.includes('client_name TEXT'), 'Preserves client_name historical snapshot column')
  assert(mig1.includes('staff_name TEXT'), 'Preserves staff_name historical snapshot column')
  assert(mig1.includes('service_name TEXT'), 'Preserves service_name historical snapshot column')

  // Check Triggers
  assert(
    mig1.includes('fn_check_client_deletion_protection'),
    'Defines client deletion protection trigger function'
  )
  assert(
    mig1.includes('fn_check_service_deletion_protection'),
    'Defines service deletion protection trigger function'
  )
  assert(
    mig1.includes('fn_check_staff_deletion_protection'),
    'Defines staff deletion protection trigger function'
  )
  assert(
    mig1.includes('fn_check_last_owner_protection'),
    'Defines last-owner account protection trigger function'
  )

  // Check RLS policies
  assert(mig2.includes('ENABLE ROW LEVEL SECURITY'), 'Enables Row Level Security on tables')
  assert(mig2.includes('current_user_role()'), 'Defines current_user_role() security definer')
  assert(mig2.includes('current_user_staff_id()'), 'Defines current_user_staff_id() helper')
  assert(
    mig2.includes('Appointments viewable by staff according to isolation'),
    'Implements Employee Data Isolation RLS policy on appointments'
  )

  // ----------------------------------------------------
  // TEST 4: Migration Export & Validation Utility
  // ----------------------------------------------------
  console.log('\n--- TEST 4: LocalStorage Extraction & Validation Engine ---')
  const mockStorageMap = new Map<string, string>()
  const mockStorage: StorageAccessor = {
    getItem: (key: string) => mockStorageMap.get(key) || null,
  }

  // Populate mock baseline
  mockStorageMap.set(STORAGE_KEYS.USERS, JSON.stringify(mockUsers))
  mockStorageMap.set(STORAGE_KEYS.STAFF, JSON.stringify(mockStaff))
  mockStorageMap.set(STORAGE_KEYS.CLIENTS, JSON.stringify(mockClients))
  mockStorageMap.set(STORAGE_KEYS.SERVICES, JSON.stringify(mockServices))
  mockStorageMap.set(
    STORAGE_KEYS.APPOINTMENTS,
    JSON.stringify([
      {
        id: 'apt-mock-01',
        salonId: 'salon-luma-01',
        clientId: 'cli-01',
        staffId: 'staff-01',
        serviceId: 'srv-01',
        date: '2026-10-16',
        startTime: '10:00',
        endTime: '10:45',
        status: 'scheduled',
        price: 1500,
        createdAt: '2026-10-15T10:00:00Z',
      },
    ])
  )
  mockStorageMap.set(
    STORAGE_KEYS.CREDS,
    JSON.stringify([
      {
        userId: 'user-owner-01',
        email: 'owner1@lumasalon.example.com',
        salt: 'secret_salt_123',
        passwordHash: 'secret_hash_abc',
        updatedAt: '2026-10-15T00:00:00Z',
      },
    ])
  )

  const payload = extractAndValidateLocalStorage(mockStorage)
  assert(payload.validation.isValid, 'Clean baseline validation passed with 0 errors')
  assert(payload.counts.users === mockUsers.length, `Extracted all ${mockUsers.length} users`)
  assert(payload.counts.staff === mockStaff.length, `Extracted all ${mockStaff.length} staff`)
  assert(payload.counts.clients === mockClients.length, `Extracted all ${mockClients.length} clients`)
  assert(payload.counts.services === mockServices.length, `Extracted all ${mockServices.length} services`)
  assert(payload.counts.appointments === 1, 'Extracted test appointment')

  // Verify confidentiality: password hashes are NOT present in exported payload data
  const payloadString = JSON.stringify(payload)
  assert(!payloadString.includes('secret_salt_123'), 'Secret salts are NOT leaked into export payload')
  assert(!payloadString.includes('secret_hash_abc'), 'Password hashes are NOT leaked into export payload')

  // ----------------------------------------------------
  // TEST 5: Malformed Data & Relationship Conflict Handling
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Anomaly & Conflict Detection ---')
  const dirtyStorageMap = new Map<string, string>()
  const dirtyStorage: StorageAccessor = {
    getItem: (key: string) => dirtyStorageMap.get(key) || null,
  }

  dirtyStorageMap.set(
    STORAGE_KEYS.USERS,
    JSON.stringify([
      { id: 'dup-01', email: 'dup@example.com', role: 'INVALID_ROLE', name: 'User 1' },
      { id: 'dup-01', email: 'dup@example.com', role: 'OWNER', name: 'User 2' },
    ])
  )
  dirtyStorageMap.set(
    STORAGE_KEYS.SERVICES,
    JSON.stringify([{ id: 'srv-bad', name: 'Bad Service', price: -50, duration: 0 }])
  )
  dirtyStorageMap.set(
    STORAGE_KEYS.APPOINTMENTS,
    JSON.stringify([
      {
        id: 'apt-orphan-01',
        date: 'invalid-date',
        startTime: 'bad-time',
        status: 'not_a_status',
        clientId: 'missing-cli',
        // No client snapshot
      },
      {
        id: 'apt-historical-02',
        date: '2026-10-14',
        startTime: '11:00',
        endTime: '11:30',
        status: 'completed',
        price: 500,
        clientId: 'deleted-cli',
        clientName: 'Safely Preserved Snapshot Client',
      },
    ])
  )

  const dirtyPayload = extractAndValidateLocalStorage(dirtyStorage)
  assert(!dirtyPayload.validation.isValid, 'Dirty dataset correctly flagged as INVALID')
  assert(dirtyPayload.validation.errorsCount > 0, `Detected ${dirtyPayload.validation.errorsCount} errors`)

  const dupIssue = dirtyPayload.validation.issues.find((i) => i.issueType === 'DUPLICATE_ID')
  assert(!!dupIssue, 'Duplicate ID detected')

  const invalidRole = dirtyPayload.validation.issues.find((i) => i.message.includes('invalid role'))
  assert(!!invalidRole, 'Invalid role detected')

  const invalidPrice = dirtyPayload.validation.issues.find((i) => i.message.includes('invalid price'))
  assert(!!invalidPrice, 'Negative price detected')

  const missingRefNoSnapshot = dirtyPayload.validation.issues.find(
    (i) => i.recordId === 'apt-orphan-01' && i.issueType === 'MISSING_REFERENCE'
  )
  assert(!!missingRefNoSnapshot, 'Missing reference without snapshot flagged as ERROR')

  const historicalWithSnapshot = dirtyPayload.validation.issues.find(
    (i) => i.recordId === 'apt-historical-02' && i.issueType === 'HISTORICAL_SNAPSHOT_REFERENCE'
  )
  assert(
    !!historicalWithSnapshot && historicalWithSnapshot.severity === 'WARNING',
    'Historical appointment with snapshot recognized as safe WARNING (non-breaking)'
  )

  // ----------------------------------------------------
  // TEST 6: Idempotent SQL Generation for Dry-Run Plan
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Idempotent SQL Generator ---')
  const generatedSql = generateIdempotentSql(payload)
  assert(generatedSql.includes('BEGIN;'), 'SQL script wraps in atomic transaction (BEGIN)')
  assert(generatedSql.includes('COMMIT;'), 'SQL script ends with COMMIT')
  assert(generatedSql.includes('ON CONFLICT (id) DO UPDATE'), 'Includes ON CONFLICT upsert handling')
  assert(generatedSql.includes('INSERT INTO public.appointments'), 'Generates appointments insert')

  console.log('\n=================================================================')
  console.log('🎉 ALL PHASE 14.1 VERIFICATION TESTS PASSED SUCCESSFULLY!')
  console.log('=================================================================\n')
}

runPhase14_1_Suite().catch((err) => {
  console.error('\n❌ Phase 14.1 Test Suite Failed:', err)
  process.exit(1)
})
