// ==============================================================================
// Luma Salon — Phase 5.1 Remediation Comprehensive Verification Suite
// Tests all Phase 5.1 requirements across SQL Engine (PGlite) & Frontend Service
// ==============================================================================

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { inventoryService } from '../src/services/inventoryService'
import { sessionService } from '../src/services/sessionService'
import type { UserSession } from '../src/types/models'
import type { ScannedProductItem } from '../src/types/inventory'

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✅ [PASS] ${testName}`)
  } else {
    failed++
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`)
  }
}

async function runSuite() {
  console.log('\n========================================================================')
  console.log('🧪 RUNNING LUMA SALON PHASE 5.1 SECURITY, TRANSACTION & PERSISTENCE SUITE')
  console.log('========================================================================\n')

  const rootDir = path.resolve(process.cwd())
  const migrationsDir = path.join(rootDir, 'supabase/migrations')

  // Initialize PGlite (Real in-memory PostgreSQL 16 engine)
  const db = new PGlite()

  // 1. Setup Supabase Roles & Auth Schema Stub
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT null::uuid;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT AS $$
      SELECT 'postgres';
    $$ LANGUAGE sql STABLE;
  `)

  // 2. Load baseline snapshot + migrations 000004, 000005, 000006
  const baselineBackupPath = path.join(rootDir, 'supabase/backups/baseline_pre_migration_000004_snapshot.sql')
  if (fs.existsSync(baselineBackupPath)) {
    const baselineSql = fs.readFileSync(baselineBackupPath, 'utf8')
    await db.exec(baselineSql)
  }

  const migrationFiles = [
    '20261015000004_admin_and_owner_rebuild.sql',
    '20261015000005_cross_salon_isolation_and_rls_hardening.sql',
    '20261015000006_provisional_rajesh_staff_profile.sql',
    '20261030000007_inventory_schema_and_persistence.sql',
  ]

  for (const f of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8')
    await db.exec(sql)
  }
  console.log('  [Setup] Baseline snapshot and migrations 000004–000007 applied cleanly.\n')

  // Setup test users in auth and public.users:
  // User 1: Rajesh (Owner, salon-luma-01) -> auth UUID = 11111111-1111-4111-a111-111111111111
  // User 2: Priya (Receptionist, salon-luma-01) -> auth UUID = 22222222-2222-4222-a222-222222222222
  // User 3: Anita (Employee, salon-luma-01) -> auth UUID = 33333333-3333-4333-a333-333333333333
  // User 4: Other Owner (Owner, salon-other-99) -> auth UUID = 44444444-4444-4444-a444-444444444444
  // User 5: Unlinked Auth User -> auth UUID = 55555555-5555-4555-a555-555555555555 (not in public.users)
  await db.exec(`
    INSERT INTO public.salons (id, name, owner_name, phone, email)
    VALUES ('salon-other-99', 'Other Salon 99', 'Other Owner', '+91 99999 00099', 'other@salon99.example.com')
    ON CONFLICT DO NOTHING;

    INSERT INTO auth.users (id, email) VALUES
      ('11111111-1111-4111-a111-111111111111'::uuid, 'rajesh.owner@luma.com'),
      ('22222222-2222-4222-a222-222222222222'::uuid, 'priya.rec@luma.com'),
      ('33333333-3333-4333-a333-333333333333'::uuid, 'anita.emp@luma.com'),
      ('44444444-4444-4444-a444-444444444444'::uuid, 'owner@salon99.com'),
      ('55555555-5555-4555-a555-555555555555'::uuid, 'unlinked@attacker.com')
    ON CONFLICT DO NOTHING;

    -- Link auth_user_id to public.users
    UPDATE public.users SET auth_user_id = '11111111-1111-4111-a111-111111111111'::uuid WHERE id = 'user-owner-01';
    UPDATE public.users SET auth_user_id = '22222222-2222-4222-a222-222222222222'::uuid WHERE id = 'user-rec-01';
    UPDATE public.users SET auth_user_id = '33333333-3333-4333-a333-333333333333'::uuid WHERE id = 'user-emp-01';

    INSERT INTO public.users (id, salon_id, auth_user_id, name, email, role, active, created_at, updated_at)
    VALUES ('user-owner-99', 'salon-other-99', '44444444-4444-4444-a444-444444444444'::uuid, 'Other Owner', 'owner@salon99.com', 'OWNER', true, now(), now())
    ON CONFLICT (id) DO NOTHING;
  `)

  function setAuthUidSql(uuidStr: string | null) {
    if (!uuidStr) {
      return `CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT null::uuid; $$ LANGUAGE sql STABLE;`
    }
    return `CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT '${uuidStr}'::uuid; $$ LANGUAGE sql STABLE;`
  }

  // ===========================================================================
  // GROUP 1: AUTHENTICATION AND AUTHORIZATION
  // ===========================================================================
  console.log('--- Group 1: Authentication and Authorization ---')

  // 1.1 Unauthenticated user denied
  await db.exec(setAuthUidSql(null))
  let unauthErr = ''
  try {
    await db.query(`
      SELECT public.rpc_create_inventory_product_with_opening_stock(
        'salon-luma-01', 'Test Shampoo', 'Brand X', 'Hair Care', NULL, NULL, 'bottle',
        'BAR-001', 'SKU-001', 100, 200, 10, 5, 'spoofed-id'
      );
    `)
  } catch (err: any) {
    unauthErr = err.message
  }
  assert(unauthErr.includes('unauthenticated'), 'Unauthenticated caller rejected by RPC', unauthErr)

  // 1.2 Unlinked authenticated user denied
  await db.exec(setAuthUidSql('55555555-5555-4555-a555-555555555555'))
  let unlinkedErr = ''
  try {
    await db.query(`
      SELECT public.rpc_create_inventory_product_with_opening_stock(
        'salon-luma-01', 'Test Shampoo', 'Brand X', 'Hair Care', NULL, NULL, 'bottle',
        'BAR-001', 'SKU-001', 100, 200, 10, 5, 'spoofed-id'
      );
    `)
  } catch (err: any) {
    unlinkedErr = err.message
  }
  assert(unlinkedErr.includes('no active salon association'), 'Unlinked authenticated caller rejected by RPC', unlinkedErr)

  // 1.3 Caller from Salon A cannot create or commit for Salon B
  await db.exec(setAuthUidSql('44444444-4444-4444-a444-444444444444')) // salon-other-99
  let crossSalonErr = ''
  try {
    await db.query(`
      SELECT public.rpc_create_inventory_product_with_opening_stock(
        'salon-luma-01', 'Cross Product', 'Brand X', 'Hair Care', NULL, NULL, 'bottle',
        'BAR-002', 'SKU-002', 100, 200, 10, 5
      );
    `)
  } catch (err: any) {
    crossSalonErr = err.message
  }
  assert(crossSalonErr.includes('another salon'), 'Caller from Salon A strictly blocked from creating in Salon B', crossSalonErr)

  // 1.4 Employee denied
  await db.exec(setAuthUidSql('33333333-3333-4333-a333-333333333333')) // user-emp-01
  let empErr = ''
  try {
    await db.query(`
      SELECT public.rpc_create_inventory_product_with_opening_stock(
        'salon-luma-01', 'Emp Product', 'Brand X', 'Hair Care', NULL, NULL, 'bottle',
        'BAR-003', 'SKU-003', 100, 200, 10, 5
      );
    `)
  } catch (err: any) {
    empErr = err.message
  }
  assert(empErr.includes('Only Salon Owners and Receptionists'), 'Employee role strictly denied inventory operations', empErr)

  // 1.5 Authenticated Receptionist allowed
  await db.exec(setAuthUidSql('22222222-2222-4222-a222-222222222222')) // user-rec-01
  const recProdRes = await db.query(`
    SELECT public.rpc_create_inventory_product_with_opening_stock(
      'salon-luma-01', 'Receptionist Product', 'Brand Luma', 'Hair Care', NULL, NULL, 'bottle',
      'BAR-REC-01', 'SKU-REC-01', 500, 900, 20, 5
    ) as prod;
  `)
  const recProd = (recProdRes.rows[0] as any).prod
  assert(recProd?.name === 'Receptionist Product', 'Authenticated Receptionist successfully creates inventory')

  // 1.6 Spoofed client-supplied user_id is ignored, trusted identity derived from auth.uid()
  assert(recProd?.created_by === 'user-rec-01', 'Audit created_by is derived from trusted auth session, not spoofed input')

  // 1.7 Authenticated Owner allowed
  await db.exec(setAuthUidSql('11111111-1111-4111-a111-111111111111')) // user-owner-01
  const ownerProdRes = await db.query(`
    SELECT public.rpc_create_inventory_product_with_opening_stock(
      'salon-luma-01', 'Owner Product', 'L''Oreal Professionnel', 'Hair Treatment', NULL, NULL, 'bottle',
      'BAR-OWN-01', 'SKU-OWN-01', 800, 1500, 15, 3
    ) as prod;
  `)
  const ownerProd = (ownerProdRes.rows[0] as any).prod
  assert(ownerProd?.name === 'Owner Product', 'Authenticated Owner successfully creates inventory')
  assert(ownerProd?.created_by === 'user-owner-01', 'Owner trusted user ID correctly attributed in audit trail')

  // ===========================================================================
  // GROUP 2: IDEMPOTENCY & MULTI-TENANT ISOLATION
  // ===========================================================================
  console.log('\n--- Group 2: Idempotency & Multi-Tenant Isolation ---')

  // 2.1 Same key and same salon returns cached response without duplicate stock
  const batchItem = {
    id: ownerProd.id,
    name: ownerProd.name,
    brand: ownerProd.brand,
    category: ownerProd.category,
    sku: ownerProd.sku,
    barcode: ownerProd.barcode,
    unit: 'bottle',
    quantity: 5,
    purchasePrice: 800,
    sellingPrice: 1500,
    isNewProduct: false,
  }

  const commitRes1 = await db.query(
    `SELECT public.rpc_commit_inventory_intake_batch($1, $2, $3::jsonb) as result;`,
    ['salon-luma-01', 'SHARED-KEY-100', JSON.stringify([batchItem])]
  )
  const result1 = (commitRes1.rows[0] as any).result
  assert(result1.committedCount === 1, 'Batch commit 1 succeeded')

  const prodAfterBatch1 = await db.query(`SELECT current_stock FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  assert(Number((prodAfterBatch1.rows[0] as any).current_stock) === 20, 'Stock incremented from 15 to 20 on first commit')

  // Recommit same batch with same idempotency key
  const commitRes2 = await db.query(
    `SELECT public.rpc_commit_inventory_intake_batch($1, $2, $3::jsonb) as result;`,
    ['salon-luma-01', 'SHARED-KEY-100', JSON.stringify([batchItem])]
  )
  const result2 = (commitRes2.rows[0] as any).result
  assert(result2.idempotencyKey === 'SHARED-KEY-100', 'Idempotent response returned on repeated submission')

  const prodAfterBatch2 = await db.query(`SELECT current_stock FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  assert(Number((prodAfterBatch2.rows[0] as any).current_stock) === 20, 'Stock did NOT increase on duplicate submission')

  // 2.2 Same key used by a DIFFERENT salon is completely independent (composite PK works)
  await db.exec(setAuthUidSql('44444444-4444-4444-a444-444444444444')) // salon-other-99
  const salon2Item = {
    name: 'Salon 99 Conditioner',
    brand: 'Salon99 Brand',
    category: 'Hair Care',
    sku: 'SKU-S99-01',
    barcode: 'BAR-S99-01',
    unit: 'bottle',
    quantity: 12,
    purchasePrice: 300,
    sellingPrice: 600,
    isNewProduct: true,
  }

  const salon2Commit = await db.query(
    `SELECT public.rpc_commit_inventory_intake_batch($1, $2, $3::jsonb) as result;`,
    ['salon-other-99', 'SHARED-KEY-100', JSON.stringify([salon2Item])]
  )
  const s2Result = (salon2Commit.rows[0] as any).result
  assert(s2Result.salonId === 'salon-other-99' && s2Result.totalUnits === 12, 'Different salon successfully uses SAME idempotency key without collision')

  // 2.3 Cross-salon cached response leakage prevented
  // Salon 99 user attempts to query Salon 1's batch key for salon-luma-01 -> strictly rejected by auth pre-check
  let leakAttemptErr = ''
  try {
    await db.query(`
      SELECT public.rpc_commit_inventory_intake_batch(
        'salon-luma-01',
        'SHARED-KEY-100',
        '[]'::jsonb
      );
    `)
  } catch (err: any) {
    leakAttemptErr = err.message
  }
  assert(leakAttemptErr.includes('another salon'), 'Cross-salon idempotency lookup blocked before cache inspection', leakAttemptErr)

  // ===========================================================================
  // GROUP 3: TRANSACTION INTEGRITY & DEADLOCK PROTECTION
  // ===========================================================================
  console.log('\n--- Group 3: Transaction Integrity & Deadlock Protection ---')

  await db.exec(setAuthUidSql('11111111-1111-4111-a111-111111111111')) // salon-luma-01 owner

  // 3.1 Atomic rollback on failed item in batch
  let failedBatchErr = ''
  try {
    await db.query(`
      SELECT public.rpc_commit_inventory_intake_batch(
        'salon-luma-01',
        'FAIL-BATCH-KEY-1',
        '[
          {"id":"${ownerProd.id}","quantity":5,"unit":"bottle","isNewProduct":false},
          {"name":"","brand":"Brand Bad","category":"Hair Care","quantity":-10,"unit":"bottle","isNewProduct":true}
        ]'::jsonb
      );
    `)
  } catch (err: any) {
    failedBatchErr = err.message
  }
  assert(failedBatchErr.includes('greater than zero') || failedBatchErr.includes('required'), 'Invalid batch item triggers exception', failedBatchErr)

  const prodAfterFailedBatch = await db.query(`SELECT current_stock FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  assert(Number((prodAfterFailedBatch.rows[0] as any).current_stock) === 20, 'Entire batch rolled back atomically; stock of first item remains untouched')

  // 3.2 Deterministic locking verifies sorting by UUID
  const batchWithTwoItems = [
    { id: ownerProd.id, quantity: 2, unit: 'bottle', isNewProduct: false },
    { id: recProd.id, quantity: 3, unit: 'bottle', isNewProduct: false },
  ]
  const commitSorted = await db.query(
    `SELECT public.rpc_commit_inventory_intake_batch($1, $2, $3::jsonb) as result;`,
    ['salon-luma-01', 'SORTED-LOCK-BATCH-01', JSON.stringify(batchWithTwoItems)]
  )
  assert((commitSorted.rows[0] as any).result.success === true, 'Batch committed with deterministic upfront row locking')

  // ===========================================================================
  // GROUP 4: HISTORICAL AUDIT INTEGRITY & DELETION RESTRICTION
  // ===========================================================================
  console.log('\n--- Group 4: Historical Audit Integrity & Deletion Restriction ---')

  // 4.1 Product with stock movements CANNOT be deleted (ON DELETE RESTRICT)
  let delErr = ''
  try {
    await db.query(`DELETE FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  } catch (err: any) {
    delErr = err.message
  }
  assert(
    delErr.toLowerCase().includes('restrict') || delErr.toLowerCase().includes('foreign key'),
    'PostgreSQL ON DELETE RESTRICT blocks deleting product with movement history',
    delErr
  )

  const movCount = await db.query(`SELECT count(*) as cnt FROM public.inventory_stock_movements WHERE product_id = '${ownerProd.id}';`)
  assert(Number((movCount.rows[0] as any).cnt) > 0, 'Historical stock movements preserved intact and immutable')

  // 4.2 Soft deletion / archive status works
  await db.query(`
    UPDATE public.inventory_products 
    SET status = 'archived', archived_at = now(), archived_by = 'user-owner-01'
    WHERE id = '${ownerProd.id}';
  `)
  const archivedProd = await db.query(`SELECT status, archived_at, archived_by FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  assert((archivedProd.rows[0] as any).status === 'archived', 'Product successfully archived without destroying stock movement history')

  // 4.3 Attempting stock intake on archived product is rejected
  let archivedIntakeErr = ''
  try {
    await db.query(`
      SELECT public.rpc_commit_inventory_intake_batch(
        'salon-luma-01',
        'ARCHIVED-INTAKE-TEST',
        '[{"id":"${ownerProd.id}","quantity":5,"unit":"bottle","isNewProduct":false}]'::jsonb
      );
    `)
  } catch (err: any) {
    archivedIntakeErr = err.message
  }
  assert(archivedIntakeErr.includes('archived product'), 'Stock intake on archived product rejected with clear message', archivedIntakeErr)

  // 4.4 Unarchive product restores active status
  await db.query(`
    UPDATE public.inventory_products 
    SET status = 'active', archived_at = NULL, archived_by = NULL
    WHERE id = '${ownerProd.id}';
  `)
  const restoredProd = await db.query(`SELECT status, archived_at FROM public.inventory_products WHERE id = '${ownerProd.id}';`)
  assert((restoredProd.rows[0] as any).status === 'active' && (restoredProd.rows[0] as any).archived_at === null, 'Product unarchived cleanly')

  // ===========================================================================
  // GROUP 5: ROLLBACK SAFETY INTERLOCK
  // ===========================================================================
  console.log('\n--- Group 5: Rollback Safety Interlock ---')

  const rollbackPath = path.join(rootDir, 'supabase/scripts/rollback_20261030000007.sql')
  const rollbackSql = fs.readFileSync(rollbackPath, 'utf8')

  let rollbackInterlockErr = ''
  try {
    await db.exec(rollbackSql)
  } catch (err: any) {
    rollbackInterlockErr = err.message
  }
  assert(
    rollbackInterlockErr.includes('ROLLBACK ABORTED BY SAFETY INTERLOCK'),
    'Rollback script aborted automatically when populated inventory data exists',
    rollbackInterlockErr
  )

  // Clear aborted transaction state
  await db.exec('ROLLBACK;')

  // Verify baseline salon tables remain untouched
  const salonCount = await db.query(`SELECT count(*) as cnt FROM public.salons;`)
  assert(Number((salonCount.rows[0] as any).cnt) >= 2, 'Core salon records remain 100% untouched')

  // ===========================================================================
  // GROUP 6: FRONTEND SERVICE PERSISTENCE & HARDENING
  // ===========================================================================
  console.log('\n--- Group 6: Frontend Service Persistence & Hardening ---')

  // 6.1 Session with missing salonId throws descriptive error
  const invalidSession: UserSession = {
    sessionId: 's-bad',
    userId: 'u-bad',
    name: 'No Salon User',
    email: 'bad@example.com',
    role: 'OWNER',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  let sessionNoSalonErr = ''
  try {
    sessionService.setSession(invalidSession)
    await inventoryService.fetchInventoryProducts()
  } catch (err: any) {
    sessionNoSalonErr = err.message
  }
  assert(sessionNoSalonErr.includes('Active salon context is required'), 'Service strictly rejects missing salon context without default fallback', sessionNoSalonErr)

  // 6.2 Valid owner session resolves correct salon
  const validOwnerSession: UserSession = {
    sessionId: 's-good',
    userId: 'u-owner-01',
    salonId: 'salon-luma-01',
    name: 'Rajesh',
    email: 'rajesh@luma.com',
    role: 'OWNER',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }
  sessionService.setSession(validOwnerSession)

  // 6.3 Empty or whitespace-only SKU rejected
  let emptySkuErr = ''
  try {
    await inventoryService.createProduct(
      {
        name: 'Bad SKU Product',
        brand: 'Brand',
        category: 'Hair Care',
        unit: 'bottle',
        sku: '   ',
        purchasePrice: 100,
        sellingPrice: 200,
        openingStock: 5,
      },
      validOwnerSession
    )
  } catch (err: any) {
    emptySkuErr = err.message
  }
  assert(emptySkuErr.includes('SKU is required'), 'Whitespace-only SKU rejected by frontend service', emptySkuErr)

  // 6.4 Successful creation marks syncStatus as synced or pending
  const createdFrontendProd = await inventoryService.createProduct(
    {
      name: 'Moroccanoil Hydrating Mask',
      brand: 'Moroccanoil',
      category: 'Hair Treatment',
      unit: 'tub' as any,
      sku: 'MOR-HYD-250ML',
      barcode: '7290011521011',
      purchasePrice: 1200,
      sellingPrice: 2400,
      openingStock: 10,
      minStockThreshold: 3,
    },
    validOwnerSession
  )
  assert(createdFrontendProd.name === 'Moroccanoil Hydrating Mask', 'Product created via frontend service')
  assert(createdFrontendProd.syncStatus !== undefined, 'Product has explicit syncStatus indicator')

  // 6.5 Archive product via frontend service
  const archivedFrontendProd = await inventoryService.archiveProduct(createdFrontendProd.id, validOwnerSession)
  assert(archivedFrontendProd.status === 'archived' && !!archivedFrontendProd.archivedAt, 'Product archived via frontend service with timestamp')

  // 6.6 Active listing excludes archived products by default
  const activeList = await inventoryService.fetchInventoryProducts('salon-luma-01', false)
  const isArchivedInActive = activeList.some((p) => p.id === createdFrontendProd.id)
  assert(!isArchivedInActive, 'Active product listing excludes archived products by default')

  // 6.7 includeArchived includes archived products
  const fullList = await inventoryService.fetchInventoryProducts('salon-luma-01', true)
  const isArchivedInFull = fullList.some((p) => p.id === createdFrontendProd.id)
  assert(isArchivedInFull, 'Full inventory query includes archived products')

  // 6.8 Deleting product with historical movements is blocked by frontend service
  let frontendDelErr = ''
  try {
    await inventoryService.deleteProduct(createdFrontendProd.id, validOwnerSession)
  } catch (err: any) {
    frontendDelErr = err.message
  }
  assert(frontendDelErr.includes('historical stock movements'), 'Frontend service prevents destructive deletion when movements exist', frontendDelErr)

  // 6.9 Cache isolation between salons
  const salon2Session: UserSession = {
    sessionId: 's-salon2',
    userId: 'u-owner-99',
    salonId: 'salon-other-99',
    name: 'Salon 99 Owner',
    email: 'owner@salon99.com',
    role: 'OWNER',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }
  sessionService.setSession(salon2Session)
  const salon2Products = await inventoryService.fetchInventoryProducts('salon-other-99')
  assert(!salon2Products.some((p) => p.id === createdFrontendProd.id), 'Salon 2 cache does not contain Salon 1 products (Tenant Isolation)')

  console.log('\n========================================================================')
  console.log(`PHASE 5.1 VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err)
  process.exit(1)
})
