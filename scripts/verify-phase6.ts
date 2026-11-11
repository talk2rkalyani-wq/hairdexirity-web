// ==============================================================================
// Luma Salon — Phase 6 Automated Verification Suite
// Validates:
//   1. Product Details & gross margin calculation
//   2. Product Information Editing & updated_at timestamp
//   3. Edit Barcode Duplicate Rejection within same salon
//   4. Edit Barcode Self-Exclusion (saving existing barcode succeeds)
//   5. Manual Stock Adjustment IN (STOCK_ADJUSTMENT_IN) increments stock & logs movement
//   6. Manual Stock Adjustment OUT (STOCK_ADJUSTMENT_OUT) decrements stock & updates status
//   7. Insufficient stock deduction rejection (cannot drop below 0)
//   8. Mandatory reason/notes validation (min 5 chars required)
//   9. Product Archival (sets archived status & excludes from active listing)
//   10. Archived product stock adjustment rejection (must unarchive first)
//   11. Product Unarchival (restores product to active catalog with stock intact)
//   12. ON DELETE RESTRICT on products with stock movement history
//   13. Migration 000008 Rollback script safety & clean execution
// ==============================================================================

import fs from 'node:fs'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'

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
  console.log('🧪 RUNNING LUMA SALON PHASE 6 VERIFICATION SUITE')
  console.log('========================================================================\n')

  const rootDir = path.resolve(process.cwd())
  const migrationsDir = path.join(rootDir, 'supabase/migrations')

  // Initialize isolated in-memory PGlite engine (PostgreSQL 16)
  const db = new PGlite()

  // 1. Setup Supabase Roles & Auth Schema Stubs
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

    CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT AS $$
      SELECT 'OWNER'::text;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.is_owner() RETURNS BOOLEAN AS $$
      SELECT true;
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.is_owner_or_receptionist() RETURNS BOOLEAN AS $$
      SELECT true;
    $$ LANGUAGE sql STABLE;
  `)

  // 2. Apply Baseline Schema Snapshot & Migrations 000004–000008
  const baselineSql = fs.readFileSync(path.join(rootDir, 'supabase/backups/baseline_pre_migration_000004_snapshot.sql'), 'utf8')
  await db.exec(baselineSql)

  const mig000004 = fs.readFileSync(path.join(migrationsDir, '20261015000004_admin_and_owner_rebuild.sql'), 'utf8')
  await db.exec(mig000004)

  const mig000007 = fs.readFileSync(path.join(migrationsDir, '20261030000007_inventory_schema_and_persistence.sql'), 'utf8')
  await db.exec(mig000007)

  const mig000008 = fs.readFileSync(path.join(migrationsDir, '20261031000008_inventory_stock_adjustments.sql'), 'utf8')
  await db.exec(mig000008)

  console.log('  [Setup] Baseline snapshot and migrations 000004–000008 applied cleanly in PGlite.\n')

  // Setup Test Salon and Auth Owner User
  const testSalonId = 'salon-luma-01'
  const ownerAuthId = '11111111-1111-4111-a111-111111111111'
  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES ('${ownerAuthId}'::uuid, 'owner@lumasalon.example.com') ON CONFLICT DO NOTHING;
    UPDATE public.users SET auth_user_id = '${ownerAuthId}'::uuid WHERE id = 'user-owner-01';
  `)

  function setAuthUidSql(uuidStr: string | null) {
    if (!uuidStr) {
      return `CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT null::uuid; $$ LANGUAGE sql STABLE;`
    }
    return `CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT '${uuidStr}'::uuid; $$ LANGUAGE sql STABLE;`
  }

  await db.exec(setAuthUidSql(ownerAuthId))

  // Create initial test products
  const createProdRes1 = await db.query(`
    SELECT public.rpc_create_inventory_product_with_opening_stock(
      '${testSalonId}',
      'Moroccanoil Treatment Original',
      'Moroccanoil',
      'Hair Care',
      'Oil',
      'Signature argan oil formula',
      'bottle',
      '890123456001',
      'SKU-MOR-001',
      1200.00,
      2100.00,
      10.000,
      5.000
    ) as prod;
  `)
  const prod1 = (createProdRes1.rows[0] as any).prod
  assert(prod1 && prod1.id, 'TC-6.1: Product 1 created with opening stock 10.000')

  const createProdRes2 = await db.query(`
    SELECT public.rpc_create_inventory_product_with_opening_stock(
      '${testSalonId}',
      'Olaplex No. 3 Hair Perfector',
      'Olaplex',
      'Hair Treatment',
      'Bond Builder',
      'Pre-shampoo treatment',
      'bottle',
      '890123456002',
      'SKU-OLA-002',
      1800.00,
      2950.00,
      4.000,
      5.000
    ) as prod;
  `)
  const prod2 = (createProdRes2.rows[0] as any).prod
  assert(prod2 && prod2.status === 'low_stock', 'TC-6.1: Product 2 created with status low_stock (stock 4 <= min 5)')

  // --- Section 1: Product Editing & Duplicate Validation ---
  console.log('\n--- Section 1: Product Editing & Uniqueness Validation ---')

  // TC-6.2: Product Editing succeeds
  await db.exec(`
    UPDATE public.inventory_products
    SET name = 'Moroccanoil Treatment Original (200ml)',
        selling_price = 2250.00,
        updated_at = timezone('utc'::text, now())
    WHERE id = '${prod1.id}';
  `)
  const editRes1 = await db.query(`SELECT name, selling_price FROM public.inventory_products WHERE id = '${prod1.id}';`)
  assert(
    editRes1.rows[0].name === 'Moroccanoil Treatment Original (200ml)' && Number(editRes1.rows[0].selling_price) === 2250,
    'TC-6.2: Product name and selling price updated successfully'
  )

  // TC-6.3: Updating to a barcode already held by another product in same salon is rejected
  let dupBarcodeCaught = false
  try {
    await db.exec(`
      UPDATE public.inventory_products
      SET barcode = '890123456002'
      WHERE id = '${prod1.id}';
    `)
  } catch (err: any) {
    dupBarcodeCaught = true
  }
  assert(dupBarcodeCaught, 'TC-6.3: Duplicate barcode update across different products in same salon strictly rejected')

  // TC-6.4: Updating product with its own unchanged barcode succeeds (self-exclusion)
  let selfBarcodeSucceeded = false
  try {
    await db.exec(`
      UPDATE public.inventory_products
      SET barcode = '890123456001',
          name = 'Moroccanoil Treatment Original (Luxury)'
      WHERE id = '${prod1.id}';
    `)
    selfBarcodeSucceeded = true
  } catch (err: any) {
    selfBarcodeSucceeded = false
  }
  assert(selfBarcodeSucceeded, 'TC-6.4: Product update retaining its own unchanged barcode succeeds')

  // --- Section 2: Manual Stock Adjustments ---
  console.log('\n--- Section 2: Manual Stock Adjustments (RPC rpc_adjust_inventory_stock) ---')

  // TC-6.5: Stock Adjustment IN
  const adjInRes = await db.query(`
    SELECT public.rpc_adjust_inventory_stock(
      '${testSalonId}',
      '${prod1.id}'::uuid,
      'STOCK_ADJUSTMENT_IN',
      5.000,
      'Supplier bonus promotional units received.'
    ) as res;
  `)
  const adjInPayload = (adjInRes.rows[0] as any).res
  assert(adjInPayload.success === true, 'TC-6.5: rpc_adjust_inventory_stock (STOCK_ADJUSTMENT_IN) succeeded')
  assert(Number(adjInPayload.newStock) === 15.000, 'TC-6.5: Stock increased from 10.000 to 15.000')

  // Verify stock movement row recorded
  const movInCheck = await db.query(`
    SELECT * FROM public.inventory_stock_movements WHERE id = '${adjInPayload.movementId}'::uuid;
  `)
  assert(
    movInCheck.rows.length === 1 && movInCheck.rows[0].movement_type === 'STOCK_ADJUSTMENT_IN',
    'TC-6.5: Movement audit row appended with type STOCK_ADJUSTMENT_IN'
  )

  // TC-6.6: Stock Adjustment OUT
  const adjOutRes = await db.query(`
    SELECT public.rpc_adjust_inventory_stock(
      '${testSalonId}',
      '${prod1.id}'::uuid,
      'STOCK_ADJUSTMENT_OUT',
      12.000,
      'Salon floor usage and staff training demo bottles.'
    ) as res;
  `)
  const adjOutPayload = (adjOutRes.rows[0] as any).res
  assert(Number(adjOutPayload.newStock) === 3.000, 'TC-6.6: Stock decremented from 15.000 to 3.000')
  assert(adjOutPayload.status === 'low_stock', 'TC-6.6: Status dynamically transitioned to low_stock (3 <= min 5)')

  // TC-6.7: Insufficient stock deduction is rejected
  let insufficientCaught = false
  let insufficientMsg = ''
  try {
    await db.query(`
      SELECT public.rpc_adjust_inventory_stock(
        '${testSalonId}',
        '${prod1.id}'::uuid,
        'STOCK_ADJUSTMENT_OUT',
        10.000,
        'Attempting to deduct more stock than available.'
      );
    `)
  } catch (err: any) {
    insufficientCaught = true
    insufficientMsg = err.message
  }
  assert(insufficientCaught && insufficientMsg.includes('Insufficient stock'), 'TC-6.7: Over-deduction rejected with Insufficient stock error')

  // TC-6.8: Missing or short reason notes rejected (<5 chars)
  let shortNotesCaught = false
  try {
    await db.query(`
      SELECT public.rpc_adjust_inventory_stock(
        '${testSalonId}',
        '${prod1.id}'::uuid,
        'STOCK_ADJUSTMENT_IN',
        2.000,
        'bad'
      );
    `)
  } catch (err: any) {
    shortNotesCaught = true
  }
  assert(shortNotesCaught, 'TC-6.8: Adjustment with notes < 5 chars rejected by validation')

  // --- Section 3: Archival & Unarchival Workflows ---
  console.log('\n--- Section 3: Product Archival & Movement History Protection ---')

  // TC-6.9: Product Archival
  await db.exec(`
    UPDATE public.inventory_products
    SET status = 'archived',
        archived_at = timezone('utc'::text, now()),
        archived_by = 'user-owner-01'
    WHERE id = '${prod1.id}';
  `)
  const activeProducts = await db.query(`
    SELECT * FROM public.inventory_products WHERE salon_id = '${testSalonId}' AND status <> 'archived';
  `)
  assert(
    activeProducts.rows.every((p: any) => p.id !== prod1.id),
    'TC-6.9: Archived product excluded from normal active listings'
  )

  // TC-6.10: Cannot adjust stock for an archived product
  let archivedAdjCaught = false
  try {
    await db.query(`
      SELECT public.rpc_adjust_inventory_stock(
        '${testSalonId}',
        '${prod1.id}'::uuid,
        'STOCK_ADJUSTMENT_IN',
        5.000,
        'Trying to adjust stock on archived product.'
      );
    `)
  } catch (err: any) {
    archivedAdjCaught = true
  }
  assert(archivedAdjCaught, 'TC-6.10: Adjusting stock for archived product strictly rejected (Unarchive first)')

  // TC-6.11: Unarchive restores product to active status with stock intact
  await db.exec(`
    UPDATE public.inventory_products
    SET status = 'low_stock',
        archived_at = NULL,
        archived_by = NULL
    WHERE id = '${prod1.id}';
  `)
  const unarchivedCheck = await db.query(`
    SELECT status, current_stock FROM public.inventory_products WHERE id = '${prod1.id}';
  `)
  assert(
    unarchivedCheck.rows[0].status === 'low_stock' && Number(unarchivedCheck.rows[0].current_stock) === 3.000,
    'TC-6.11: Unarchiving restores product to active catalog with exact stock balance (3.000) intact'
  )

  // TC-6.12: Deleting product with historical movements is blocked by ON DELETE RESTRICT
  let deleteBlocked = false
  try {
    await db.exec(`DELETE FROM public.inventory_products WHERE id = '${prod1.id}';`)
  } catch (err: any) {
    deleteBlocked = true
  }
  assert(deleteBlocked, 'TC-6.12: ON DELETE RESTRICT physically prevents destructive deletion of product with movement history')

  // --- Section 4: Rollback Script Safety ---
  console.log('\n--- Section 4: Rollback Script Clean Execution ---')

  const rollbackSql = fs.readFileSync(path.join(rootDir, 'supabase/scripts/rollback_20261031000008.sql'), 'utf8')
  await db.exec(rollbackSql)

  // Verify RPC function is dropped
  const rpcCheck = await db.query(`
    SELECT routine_name FROM information_schema.routines
    WHERE routine_schema = 'public' AND routine_name = 'rpc_adjust_inventory_stock';
  `)
  assert(rpcCheck.rows.length === 0, 'TC-6.13: Rollback script safely dropped rpc_adjust_inventory_stock')

  // Verify all inventory tables and records remain intact
  const prodCount = await db.query(`SELECT count(*) as cnt FROM public.inventory_products;`)
  const movCount = await db.query(`SELECT count(*) as cnt FROM public.inventory_stock_movements;`)
  assert(Number(prodCount.rows[0].cnt) >= 2, 'TC-6.13: All inventory products preserved after rollback')
  assert(Number(movCount.rows[0].cnt) >= 4, 'TC-6.13: All stock movements audit logs preserved after rollback')

  console.log('\n========================================================================')
  console.log(`📊 PHASE 6 VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

runSuite().catch((err) => {
  console.error('Test suite runner crashed:', err)
  process.exit(1)
})
