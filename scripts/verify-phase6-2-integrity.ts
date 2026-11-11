// ==============================================================================
// Luma Salon — Phase 6.2 Stock Movement Audit Integrity Verification Suite
// Validates:
//   1. Direct client INSERT by Owner is rejected (42501 permission denied)
//   2. Direct client INSERT by Receptionist is rejected (42501 permission denied)
//   3. Direct client INSERT by Employee is rejected (42501 permission denied)
//   4. Direct client INSERT by Anonymous caller is rejected (42501 permission denied)
//   5. Owner legitimate stock adjustment via RPC succeeds & records movement
//   6. Receptionist legitimate stock adjustment via RPC succeeds & records movement
//   7. Product creation via RPC records opening stock movement
//   8. Batch intake via RPC records inventory stock movements
//   9. Historical movements cannot be updated or deleted by application users
//   10. Stock quantities remain exactly consistent with legitimate movement ledger
//   11. Rollback script restores previous state cleanly and re-hardening works
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

async function runIntegritySuite() {
  console.log('\n========================================================================')
  console.log('🛡️ LUMA SALON: PHASE 6.2 AUDIT INTEGRITY HARDENING TEST SUITE')
  console.log('========================================================================\n')

  const rootDir = path.resolve(process.cwd())
  const migrationsDir = path.join(rootDir, 'supabase/migrations')
  const scriptsDir = path.join(rootDir, 'supabase/scripts')

  const db = new PGlite()

  // 1. Roles and Auth Schema Stubs
  await db.exec(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
    END $$;

    CREATE SCHEMA IF NOT EXISTS auth;
    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE
    );
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$
      SELECT null::uuid;
    $$ LANGUAGE sql STABLE;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

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

  // 2. Apply baseline and migrations 000004, 000007, 000008, 000009
  const baselineSql = fs.readFileSync(path.join(rootDir, 'supabase/backups/baseline_pre_migration_000004_snapshot.sql'), 'utf8')
  await db.exec(baselineSql)

  const mig000004 = fs.readFileSync(path.join(migrationsDir, '20261015000004_admin_and_owner_rebuild.sql'), 'utf8')
  await db.exec(mig000004)

  const mig000007 = fs.readFileSync(path.join(migrationsDir, '20261030000007_inventory_schema_and_persistence.sql'), 'utf8')
  await db.exec(mig000007)

  const mig000008 = fs.readFileSync(path.join(migrationsDir, '20261031000008_inventory_stock_adjustments.sql'), 'utf8')
  await db.exec(mig000008)

  const mig000009 = fs.readFileSync(path.join(migrationsDir, '20261031000009_inventory_movement_integrity_hardening.sql'), 'utf8')
  await db.exec(mig000009)

  // Bind dynamic role evaluation against public.users
  await db.exec(`
    CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT AS $$
      SELECT COALESCE(
        (SELECT role FROM public.users WHERE auth_user_id = auth.uid() AND active = true LIMIT 1),
        'anon'
      );
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.is_owner() RETURNS BOOLEAN AS $$
      SELECT COALESCE((public.current_user_role() = 'OWNER'), false);
    $$ LANGUAGE sql STABLE;

    CREATE OR REPLACE FUNCTION public.is_owner_or_receptionist() RETURNS BOOLEAN AS $$
      SELECT COALESCE((public.current_user_role() IN ('OWNER', 'RECEPTIONIST')), false);
    $$ LANGUAGE sql STABLE;
  `)

  // Setup test identities
  const miaAuthId = '11111111-1111-4111-8111-111111111111'
  const saraAuthId = '22222222-2222-4222-8222-222222222222'
  const jakeAuthId = '33333333-3333-4333-8333-333333333333'

  await db.exec(`
    INSERT INTO auth.users (id, email) VALUES
      ('${miaAuthId}'::uuid, 'mia@luma.example.com'),
      ('${saraAuthId}'::uuid, 'sara@luma.example.com'),
      ('${jakeAuthId}'::uuid, 'jake@luma.example.com')
    ON CONFLICT DO NOTHING;

    UPDATE public.users SET auth_user_id = '${miaAuthId}'::uuid WHERE id = 'user-owner-01';

    INSERT INTO public.users (id, salon_id, auth_user_id, name, email, role, active) VALUES
      ('user-recep-01', 'salon-luma-01', '${saraAuthId}'::uuid, 'Sara Recep', 'sara@luma.example.com', 'RECEPTIONIST', true),
      ('user-emp-01', 'salon-luma-01', '${jakeAuthId}'::uuid, 'Jake Stylist', 'jake@luma.example.com', 'EMPLOYEE', true)
    ON CONFLICT (id) DO UPDATE SET
      auth_user_id = EXCLUDED.auth_user_id,
      role = EXCLUDED.role,
      salon_id = EXCLUDED.salon_id,
      active = true;
  `)

  function setSession(authId: string | null, role: string = 'authenticated') {
    const uidVal = authId ? `'${authId}'::uuid` : 'null::uuid'
    return `
      RESET ROLE;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID AS $$ SELECT ${uidVal}; $$ LANGUAGE sql STABLE;
      GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
      SET ROLE ${role};
    `
  }

  // Helper to switch back to postgres admin for test assertions if needed
  function asAdmin() {
    return `RESET ROLE;`
  }

  // --- SECTION 1: Direct Client INSERT Blocking Tests ---
  console.log('--- Section 1: Direct Client INSERT Blocking Tests ---')

  // TC-1: Owner direct INSERT
  await db.exec(setSession(miaAuthId, 'authenticated'))
  let ownerDirectBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock
      ) VALUES (
        'salon-luma-01', gen_random_uuid(), 'STOCK_ADJUSTMENT_IN', 10.000, 0, 10.000
      );
    `)
  } catch (err: any) {
    ownerDirectBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(ownerDirectBlocked, 'TC-6.2.1: Owner cannot directly INSERT stock movement via client (permission denied)')

  // TC-2: Receptionist direct INSERT
  await db.exec(setSession(saraAuthId, 'authenticated'))
  let recepDirectBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock
      ) VALUES (
        'salon-luma-01', gen_random_uuid(), 'STOCK_ADJUSTMENT_IN', 5.000, 0, 5.000
      );
    `)
  } catch (err: any) {
    recepDirectBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(recepDirectBlocked, 'TC-6.2.2: Receptionist cannot directly INSERT stock movement via client (permission denied)')

  // TC-3: Employee direct INSERT
  await db.exec(setSession(jakeAuthId, 'authenticated'))
  let empDirectBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock
      ) VALUES (
        'salon-luma-01', gen_random_uuid(), 'STOCK_ADJUSTMENT_IN', 1.000, 0, 1.000
      );
    `)
  } catch (err: any) {
    empDirectBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(empDirectBlocked, 'TC-6.2.3: Employee cannot directly INSERT stock movement via client (permission denied)')

  // TC-4: Anonymous direct INSERT
  await db.exec(setSession(null, 'anon'))
  let anonDirectBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock
      ) VALUES (
        'salon-luma-01', gen_random_uuid(), 'STOCK_ADJUSTMENT_IN', 1.000, 0, 1.000
      );
    `)
  } catch (err: any) {
    anonDirectBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(anonDirectBlocked, 'TC-6.2.4: Anonymous user cannot directly INSERT stock movement (permission denied)')

  // --- SECTION 2: Trusted RPC Execution Verification ---
  console.log('\n--- Section 2: Trusted RPC Execution Verification ---')

  // TC-5: Product creation with opening stock via RPC (as Owner)
  await db.exec(setSession(miaAuthId, 'authenticated'))
  const createProdRes = await db.query(`
    SELECT public.rpc_create_inventory_product_with_opening_stock(
      'salon-luma-01',
      'L''Oreal Professionnel Metal Detox Shampoo',
      'L''Oreal',
      'Hair Care',
      'Shampoo',
      'Anti-deposit protector shampoo',
      'bottle',
      '3474636974301',
      'SKU-LOR-MET-001',
      1200.00,
      2100.00,
      15.000,
      5.000
    ) as prod;
  `)
  const product = (createProdRes.rows[0] as any).prod
  assert(product && product.id, 'TC-6.2.5: Product created via rpc_create_inventory_product_with_opening_stock')

  // Verify opening stock movement was created by the RPC
  const openMov = await db.query(`
    SELECT * FROM public.inventory_stock_movements
    WHERE salon_id = 'salon-luma-01' AND product_id = '${product.id}'::uuid;
  `)
  assert(
    openMov.rows.length === 1 && openMov.rows[0].movement_type === 'OPENING_STOCK' && Number(openMov.rows[0].quantity) === 15,
    'TC-6.2.5: Opening stock movement (15.000) recorded cleanly by trusted product creation RPC'
  )

  // TC-6: Manual stock adjustment IN via RPC (as Owner)
  const ownerAdj = await db.query(`
    SELECT public.rpc_adjust_inventory_stock(
      'salon-luma-01',
      '${product.id}'::uuid,
      'STOCK_ADJUSTMENT_IN',
      5.000,
      'Received promo stock from distributor.'
    ) as res;
  `)
  const adjResult1 = (ownerAdj.rows[0] as any).res
  assert(
    adjResult1.success && adjResult1.newStock === 20,
    'TC-6.2.6: Owner executed rpc_adjust_inventory_stock (+5 -> 20.000) successfully'
  )

  // TC-7: Manual stock adjustment OUT via RPC (as Receptionist)
  await db.exec(setSession(saraAuthId, 'authenticated'))
  const recepAdj = await db.query(`
    SELECT public.rpc_adjust_inventory_stock(
      'salon-luma-01',
      '${product.id}'::uuid,
      'STOCK_ADJUSTMENT_OUT',
      4.000,
      'Damaged bottle discarded.'
    ) as res;
  `)
  const adjResult2 = (recepAdj.rows[0] as any).res
  assert(
    adjResult2.success && adjResult2.newStock === 16,
    'TC-6.2.7: Receptionist executed rpc_adjust_inventory_stock (-4 -> 16.000) successfully'
  )

  // TC-8: Batch intake via RPC (as Owner)
  await db.exec(setSession(miaAuthId, 'authenticated'))
  const batchRes = await db.query(`
    SELECT public.rpc_commit_inventory_intake_batch(
      'salon-luma-01',
      'BATCH-AUDIT-001',
      jsonb_build_array(
        jsonb_build_object(
          'barcode', '3474636974301',
          'quantity', 10,
          'isNew', false,
          'product', jsonb_build_object(
            'id', '${product.id}',
            'name', 'L''Oreal Professionnel Metal Detox Shampoo'
          )
        )
      )
    ) as batch;
  `)
  const batchData = (batchRes.rows[0] as any).batch
  assert(
    batchData.success && batchData.committedCount === 1,
    'TC-6.2.8: Live intake batch committed via rpc_commit_inventory_intake_batch (+10 -> 26.000)'
  )

  // --- SECTION 3: Ledger Consistency & Immutability Verification ---
  console.log('\n--- Section 3: Ledger Consistency & Immutability Verification ---')

  // TC-9: Audit immutability: UPDATE and DELETE blocked on movements
  let updateBlocked = false
  try {
    await db.exec(`
      UPDATE public.inventory_stock_movements
      SET quantity = 999.000
      WHERE product_id = '${product.id}'::uuid;
    `)
  } catch (err: any) {
    updateBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(updateBlocked, 'TC-6.2.9: UPDATE on inventory_stock_movements strictly blocked (42501 permission denied)')

  let deleteBlocked = false
  try {
    await db.exec(`
      DELETE FROM public.inventory_stock_movements
      WHERE product_id = '${product.id}'::uuid;
    `)
  } catch (err: any) {
    deleteBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(deleteBlocked, 'TC-6.2.9: DELETE on inventory_stock_movements strictly blocked (42501 permission denied)')

  // TC-10: Stock quantity matches sum of legitimate movement records
  const prodCurrent = await db.query(`
    SELECT current_stock FROM public.inventory_products WHERE id = '${product.id}'::uuid;
  `)
  const stockNow = Number(prodCurrent.rows[0].current_stock)

  const movements = await db.query(`
    SELECT movement_type, quantity FROM public.inventory_stock_movements
    WHERE product_id = '${product.id}'::uuid
    ORDER BY created_at ASC;
  `)
  let calculatedStock = 0
  for (const m of movements.rows) {
    const qty = Number(m.quantity)
    if (m.movement_type === 'OPENING_STOCK' || m.movement_type === 'STOCK_ADJUSTMENT_IN' || m.movement_type === 'STOCK_RECEIVED' || m.movement_type === 'STOCK_RETURN') {
      calculatedStock += qty
    } else if (m.movement_type === 'STOCK_ADJUSTMENT_OUT' || m.movement_type === 'STOCK_USAGE' || m.movement_type === 'STOCK_DAMAGED') {
      calculatedStock -= qty
    }
  }

  assert(
    stockNow === calculatedStock && stockNow === 26,
    `TC-6.2.10: Stock quantity (${stockNow}) matches exact sum of legitimate movement records (${calculatedStock})`
  )

  // TC-11: Authorized SELECT inspection works for Owner & Receptionist
  const selectOwner = await db.query(`
    SELECT count(*) as cnt FROM public.inventory_stock_movements WHERE salon_id = 'salon-luma-01';
  `)
  assert(
    Number(selectOwner.rows[0].cnt) === 4,
    'TC-6.2.11: Authorized Owner can inspect stock movement audit records (4 records found)'
  )

  await db.exec(setSession(saraAuthId, 'authenticated'))
  const selectRecep = await db.query(`
    SELECT count(*) as cnt FROM public.inventory_stock_movements WHERE salon_id = 'salon-luma-01';
  `)
  assert(
    Number(selectRecep.rows[0].cnt) === 4,
    'TC-6.2.11: Authorized Receptionist can inspect stock movement audit records (4 records found)'
  )

  // --- SECTION 4: Rollback and Re-Hardening Verification ---
  console.log('\n--- Section 4: Rollback & Re-Hardening Verification ---')
  await db.exec(asAdmin())

  // Execute rollback script
  const rollbackSql = fs.readFileSync(path.join(scriptsDir, 'rollback_20261031000009.sql'), 'utf8')
  await db.exec(rollbackSql)

  // As authenticated Owner, direct insert should now succeed under rollback
  await db.exec(setSession(miaAuthId, 'authenticated'))
  let rollbackInsertSuccess = false
  let dummyMovId = ''
  try {
    const rbIns = await db.query(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock, notes
      ) VALUES (
        'salon-luma-01', '${product.id}'::uuid, 'STOCK_ADJUSTMENT_IN', 1.000, 26, 27.000, 'Rollback direct insert test'
      ) RETURNING id;
    `)
    rollbackInsertSuccess = rbIns.rows.length === 1
    dummyMovId = rbIns.rows[0].id
  } catch (err: any) {
    rollbackInsertSuccess = false
  }
  assert(rollbackInsertSuccess, 'TC-6.2.12: Rollback script restored direct client INSERT privilege successfully')

  // Clean up dummy movement and re-apply migration 000009
  await db.exec(asAdmin())
  if (dummyMovId) {
    await db.exec(`DELETE FROM public.inventory_stock_movements WHERE id = '${dummyMovId}'::uuid;`)
  }
  await db.exec(mig000009)

  // Verify re-hardened state: direct insert must be blocked again
  await db.exec(setSession(miaAuthId, 'authenticated'))
  let rehardenedBlocked = false
  try {
    await db.exec(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock
      ) VALUES (
        'salon-luma-01', '${product.id}'::uuid, 'STOCK_ADJUSTMENT_IN', 1.000, 26, 27.000
      );
    `)
  } catch (err: any) {
    rehardenedBlocked = err.message.includes('permission denied for table inventory_stock_movements')
  }
  assert(rehardenedBlocked, 'TC-6.2.13: Re-applied migration 000009 successfully re-hardened direct INSERT revocation')

  console.log('\n========================================================================')
  console.log(`🛡️ PHASE 6.2 INTEGRITY TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`)
  console.log('========================================================================\n')

  if (failed > 0) process.exit(1)
}

runIntegritySuite().catch((err) => {
  console.error('Audit integrity suite crashed:', err)
  process.exit(1)
})
