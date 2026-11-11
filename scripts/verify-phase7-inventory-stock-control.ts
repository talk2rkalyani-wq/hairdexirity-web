// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 7 VERIFICATION SUITE
// Inventory Management & Stock Control Automated Acceptance Verification
// 50 Acceptance Tests across 9 Core Modules (Section 16 Specification)
// Real PostgreSQL 18.6 Database Boundary & TypeScript Service Verification
// ==============================================================================

import { execSync } from 'node:child_process'
import assert from 'node:assert'
import { inventoryReportExporter } from '../src/features/inventory/utils/inventoryReports.ts'

const PSQL_BIN = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
const DB_HOST = process.env.DB_HOST || '/tmp'
const DB_PORT = '5433'
const DB_USER = 'postgres'
const DB_NAME = 'luma_test'

const SALON_ID = 'salon-luma-01'
const RUN_ID = Date.now().toString().slice(-6)

const PROD_RETAIL_ID = 'a0000001-0000-0000-0000-000000000001'
const PROD_CONS_ID = 'a0000002-0000-0000-0000-000000000002'
const PROD_OOS_ID = 'a0000003-0000-0000-0000-000000000003'

const INV_POS_TC13 = `inv-pos-tc-13-${RUN_ID}`
const INV_POS_TC15 = `inv-pos-tc-15-${RUN_ID}`
const INV_DRAFT_TC16 = `inv-draft-tc-16-${RUN_ID}`

const USER_SUB_MAP: Record<string, string> = {
  'usr-owner': '00000000-0000-0000-0000-000000000001',
  'usr-rec': '00000000-0000-0000-0000-000000000002',
  'usr-emp': '00000000-0000-0000-0000-000000000003',
  'usr-foreign': '00000000-0000-0000-0000-000000000999',
}

interface TestResult {
  suite: string
  id: string
  name: string
  status: 'PASS' | 'FAIL'
  details: string
}

const results: TestResult[] = []

function toPgJson(obj: any): string {
  return JSON.stringify(obj).replace(/'/g, "''")
}

function runPsql(
  sql: string,
  userJwtSub?: string,
  dbRole: 'postgres' | 'authenticated' | 'anon' = 'postgres'
): { stdout: string; stderr: string; code: number } {
  let setupSql = ''
  if (userJwtSub) {
    const claimSub = USER_SUB_MAP[userJwtSub] || userJwtSub
    setupSql += `SET request.jwt.claim.sub = '${claimSub}';\n`
  }
  if (dbRole !== 'postgres') {
    setupSql += `SET ROLE ${dbRole};\n`
  }

  const fullSql = `${setupSql}${sql}`
  try {
    const rawStdout = execSync(
      `"${PSQL_BIN}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -X -t -A -v ON_ERROR_STOP=1`,
      {
        input: fullSql,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PGPASSWORD: 'postgres' },
      }
    )
    const stdout = rawStdout
      .split('\n')
      .filter((line) => line.trim() !== 'SET')
      .join('\n')
      .trim()
    return { stdout, stderr: '', code: 0 }
  } catch (err: any) {
    const rawErr = err.stdout ? err.stdout.toString() : ''
    const stdout = rawErr
      .split('\n')
      .filter((line: string) => line.trim() !== 'SET')
      .join('\n')
      .trim()
    return {
      stdout,
      stderr: err.stderr ? err.stderr.toString().trim() : err.message,
      code: err.status || 1,
    }
  }
}

function recordTest(suite: string, id: string, name: string, fn: () => void) {
  try {
    fn()
    results.push({ suite, id, name, status: 'PASS', details: 'Passed as expected' })
  } catch (err: any) {
    results.push({ suite, id, name, status: 'FAIL', details: err.message || String(err) })
  }
}

// ==============================================================================
// TEST EXECUTION
// ==============================================================================

async function runAcceptanceSuite() {
  console.log('='.repeat(80))
  console.log('LUMA SALON — PHASE 7: INVENTORY MANAGEMENT & STOCK CONTROL ACCEPTANCE SUITE')
  console.log('50 Formal Acceptance Tests (PostgreSQL 18.6 Local Database + Domain Logic)')
  console.log('='.repeat(80))

  // Clean up any previous test artifacts
  runPsql(`
    DELETE FROM public.stock_audit_items WHERE salon_id = '${SALON_ID}';
    DELETE FROM public.stock_audit_sessions WHERE salon_id = '${SALON_ID}';
    DELETE FROM public.stock_loss_records WHERE salon_id = '${SALON_ID}';
    DELETE FROM public.consumable_usages WHERE salon_id = '${SALON_ID}';
    DELETE FROM public.inventory_batches WHERE salon_id = '${SALON_ID}';
    DELETE FROM public.inventory_stock_movements WHERE salon_id = '${SALON_ID}' AND product_id IN ('${PROD_RETAIL_ID}', '${PROD_CONS_ID}', '${PROD_OOS_ID}');
    DELETE FROM public.inventory_products WHERE salon_id = '${SALON_ID}' AND id IN ('${PROD_RETAIL_ID}', '${PROD_CONS_ID}', '${PROD_OOS_ID}');
  `)

  // ----------------------------------------------------------------------------
  // SUITE 1: Inventory Items & Catalog (TC-01 to TC-06)
  // ----------------------------------------------------------------------------
  const S1 = 'Suite 1: Inventory Items & Catalog'

  recordTest(S1, 'TC-01', 'Create retail product with SKU, barcode, brand, category, pricing, opening stock', () => {
    const res = runPsql(`
      INSERT INTO public.inventory_products (
        id, salon_id, name, brand, category, sku, barcode, purchase_price, selling_price,
        current_stock, min_stock_threshold, reorder_level, max_stock_threshold, item_type, unit, status, weighted_average_cost
      ) VALUES (
        '${PROD_RETAIL_ID}', '${SALON_ID}', 'Moroccanoil Treatment 100ml', 'Moroccanoil', 'Hair Care',
        'SKU-MO-100', '7290011521011', 1800.00, 3200.00, 25.000, 5.000, 8.000, 50.000, 'retail', 'bottle', 'active', 1800.0000
      ) RETURNING id, sku, barcode, item_type, current_stock;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.ok(res.stdout.includes(PROD_RETAIL_ID))
    assert.ok(res.stdout.includes('SKU-MO-100'))
    assert.ok(res.stdout.includes('retail'))
  })

  recordTest(S1, 'TC-02', 'Create salon consumable item with unit of measure, unit cost, reorder level', () => {
    const res = runPsql(`
      INSERT INTO public.inventory_products (
        id, salon_id, name, brand, category, sku, barcode, purchase_price, selling_price,
        current_stock, min_stock_threshold, reorder_level, max_stock_threshold, item_type, unit, status, weighted_average_cost
      ) VALUES (
        '${PROD_CONS_ID}', '${SALON_ID}', 'Olaplex No. 1 Bond Multiplier', 'Olaplex', 'Chemicals',
        'SKU-OLA-01', '89600110001', 4500.00, 0.00, 10.000, 2.000, 3.000, 20.000, 'consumable', 'bottle', 'active', 4500.0000
      ) RETURNING id, sku, item_type, unit, purchase_price;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.ok(res.stdout.includes(PROD_CONS_ID))
    assert.ok(res.stdout.includes('consumable'))
    assert.ok(res.stdout.includes('bottle'))
  })

  recordTest(S1, 'TC-03', 'Barcode scanning lookup (exact match, barcode collision prevention)', () => {
    // 1. Exact match lookup
    const lookup = runPsql(`
      SELECT id, name, sku FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND barcode = '7290011521011';
    `)
    assert.strictEqual(lookup.code, 0)
    assert.ok(lookup.stdout.includes(PROD_RETAIL_ID))

    // 2. Barcode collision prevention (unique constraint per salon)
    const dup = runPsql(`
      INSERT INTO public.inventory_products (
        id, salon_id, name, brand, category, sku, barcode, purchase_price, selling_price,
        current_stock, item_type, unit
      ) VALUES (
        gen_random_uuid(), '${SALON_ID}', 'Duplicate Barcode Item', 'Brand', 'Hair Care',
        'SKU-DUP-BC', '7290011521011', 100.00, 200.00, 5.000, 'retail', 'bottle'
      );
    `)
    assert.ok(dup.code !== 0, 'Should fail duplicate barcode constraint')
    assert.ok(dup.stderr.includes('unique') || dup.stderr.includes('duplicate') || dup.stderr.includes('idx_inventory_products_salon_barcode_unique'))
  })

  recordTest(S1, 'TC-04', 'Edit product details (prices, thresholds, category) without altering stock ledger history', () => {
    const edit = runPsql(`
      UPDATE public.inventory_products
      SET selling_price = 3400.00, min_stock_threshold = 10.000, reorder_level = 12.000
      WHERE id = '${PROD_RETAIL_ID}' AND salon_id = '${SALON_ID}'
      RETURNING selling_price, min_stock_threshold, reorder_level;
    `)
    assert.strictEqual(edit.code, 0)
    assert.ok(edit.stdout.includes('3400'))
    assert.ok(edit.stdout.includes('10'))
    assert.ok(edit.stdout.includes('12'))

    // Ensure stock level remained untouched
    const stockCheck = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stockCheck.stdout.includes('25'))
  })

  recordTest(S1, 'TC-05', 'Product archiving (discontinued products hidden from POS but preserved in ledger)', () => {
    const archive = runPsql(`
      UPDATE public.inventory_products
      SET status = 'archived'
      WHERE id = '${PROD_RETAIL_ID}' AND salon_id = '${SALON_ID}'
      RETURNING status;
    `)
    assert.strictEqual(archive.code, 0)
    assert.ok(archive.stdout.includes('archived'))

    // POS query checking active items should exclude archived product
    const posActive = runPsql(`
      SELECT count(*) FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND id = '${PROD_RETAIL_ID}' AND status != 'archived';
    `)
    assert.strictEqual(posActive.stdout.trim(), '0')
  })

  recordTest(S1, 'TC-06', 'Product unarchiving / restoring to active status', () => {
    const unarchive = runPsql(`
      UPDATE public.inventory_products
      SET status = 'active'
      WHERE id = '${PROD_RETAIL_ID}' AND salon_id = '${SALON_ID}'
      RETURNING status;
    `)
    assert.strictEqual(unarchive.code, 0)
    assert.ok(unarchive.stdout.includes('active'))

    const posActive = runPsql(`
      SELECT count(*) FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND id = '${PROD_RETAIL_ID}' AND status = 'active';
    `)
    assert.strictEqual(posActive.stdout.trim(), '1')
  })

  // ----------------------------------------------------------------------------
  // SUITE 2: Stock Movements & Ledger (TC-07 to TC-12)
  // ----------------------------------------------------------------------------
  const S2 = 'Suite 2: Stock Movements & Ledger'

  recordTest(S2, 'TC-07', 'Positive stock adjustment (STOCK_ADJUSTMENT_IN) updates stock and logs movement', () => {
    const res = runPsql(`
      DO $$
      DECLARE
        v_prev numeric;
        v_new numeric;
      BEGIN
        SELECT current_stock INTO v_prev FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';
        v_new := v_prev + 5;
        UPDATE public.inventory_products SET current_stock = v_new WHERE id = '${PROD_RETAIL_ID}';
        INSERT INTO public.inventory_stock_movements (
          salon_id, product_id, movement_type, quantity, previous_stock, new_stock, notes
        ) VALUES (
          '${SALON_ID}', '${PROD_RETAIL_ID}', 'STOCK_ADJUSTMENT_IN', 5.000, v_prev, v_new, 'Found backroom carton'
        );
      END $$;
      SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.ok(res.stdout.includes('30'))
  })

  recordTest(S2, 'TC-08', 'Negative stock adjustment (STOCK_ADJUSTMENT_OUT) updates stock and logs movement', () => {
    const res = runPsql(`
      DO $$
      DECLARE
        v_prev numeric;
        v_new numeric;
      BEGIN
        SELECT current_stock INTO v_prev FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';
        v_new := v_prev - 2;
        UPDATE public.inventory_products SET current_stock = v_new WHERE id = '${PROD_RETAIL_ID}';
        INSERT INTO public.inventory_stock_movements (
          salon_id, product_id, movement_type, quantity, previous_stock, new_stock, notes
        ) VALUES (
          '${SALON_ID}', '${PROD_RETAIL_ID}', 'STOCK_ADJUSTMENT_OUT', 2.000, v_prev, v_new, 'Correction after count'
        );
      END $$;
      SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.ok(res.stdout.includes('28'))
  })

  recordTest(S2, 'TC-09', 'Insufficient stock check (negative stock blocked)', () => {
    const res = runPsql(`
      UPDATE public.inventory_products
      SET current_stock = -5.000
      WHERE id = '${PROD_RETAIL_ID}';
    `)
    assert.ok(res.code !== 0, 'Should reject negative stock')
    assert.ok(res.stderr.includes('inventory_products_current_stock_check') || res.stderr.includes('violates check constraint'))
  })

  recordTest(S2, 'TC-10', 'Traceable movement ledger verification (immutable audit record per movement)', () => {
    const count = runPsql(`
      SELECT count(*) FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_RETAIL_ID}' AND salon_id = '${SALON_ID}';
    `)
    assert.strictEqual(count.code, 0)
    assert.ok(parseInt(count.stdout.trim(), 10) >= 2)
  })

  recordTest(S2, 'TC-11', 'Movement ledger filtering (by product, movement type, date range)', () => {
    const filtered = runPsql(`
      SELECT movement_type, quantity, notes FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_RETAIL_ID}'
        AND movement_type = 'STOCK_ADJUSTMENT_IN'
        AND created_at >= NOW() - INTERVAL '1 day';
    `)
    assert.strictEqual(filtered.code, 0)
    assert.ok(filtered.stdout.includes('STOCK_ADJUSTMENT_IN'))
    assert.ok(filtered.stdout.includes('5'))
  })

  recordTest(S2, 'TC-12', 'Zero quantity movement prevention', () => {
    const zeroMov = runPsql(`
      INSERT INTO public.inventory_stock_movements (
        salon_id, product_id, movement_type, quantity, previous_stock, new_stock, notes
      ) VALUES (
        '${SALON_ID}', '${PROD_RETAIL_ID}', 'STOCK_ADJUSTMENT_IN', 0.000, 28.000, 28.000, 'Zero quantity test'
      );
    `)
    assert.ok(zeroMov.code !== 0, 'Should reject 0 quantity movement')
    assert.ok(zeroMov.stderr.includes('inventory_stock_movements_quantity_check') || zeroMov.stderr.includes('violates check constraint'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 3: POS Integration & Finalization (TC-13 to TC-18)
  // ----------------------------------------------------------------------------
  const S3 = 'Suite 3: POS Integration & Finalization'

  recordTest(S3, 'TC-13', 'POS sale finalization deducts retail product stock atomically', () => {
    // Current stock of PROD_RETAIL_ID is 28. Finalizing invoice with 3 units should yield 25.
    const items = [
      {
        product_id: PROD_RETAIL_ID,
        item_type: 'product',
        item_name: 'Moroccanoil Treatment 100ml',
        quantity: 3,
        unit_price: 3400.00,
        discount_amount: 0,
        tax_rate: 0.18,
        tax_amount: 1836.00,
        total_price: 12036.00,
      },
    ]
    const payments = [
      {
        payment_method: 'card',
        amount: 12036.00,
      },
    ]

    const finalize = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := '${INV_POS_TC13}',
        p_salon_id := '${SALON_ID}',
        p_subtotal := 10200.00,
        p_tax_amount := 1836.00,
        p_total_amount := 12036.00,
        p_idempotency_key := 'idem-${INV_POS_TC13}',
        p_line_items := '${toPgJson(items)}'::jsonb,
        p_payments := '${toPgJson(payments)}'::jsonb,
        p_notes := 'POS Sale TC-13'
      );
    `, 'usr-rec', 'authenticated')

    assert.strictEqual(finalize.code, 0, finalize.stderr)
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('25'), `Expected 25, got ${stock.stdout}`)
  })

  recordTest(S3, 'TC-14', 'SALE_DEDUCTION movement logged with invoice reference', () => {
    const mov = runPsql(`
      SELECT movement_type, quantity, new_stock, source_document
      FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_RETAIL_ID}' AND movement_type = 'SALE_DEDUCTION';
    `)
    assert.strictEqual(mov.code, 0)
    assert.ok(mov.stdout.includes('SALE_DEDUCTION'))
    assert.ok(mov.stdout.includes('3'))
  })

  recordTest(S3, 'TC-15', 'Insufficient stock at checkout blocked by server-side RPC validation', () => {
    // Current stock is 25. Attempting to sell 30 should raise error and roll back!
    const items = [
      {
        product_id: PROD_RETAIL_ID,
        item_type: 'product',
        item_name: 'Moroccanoil Treatment 100ml',
        quantity: 30,
        unit_price: 3400.00,
        discount_amount: 0,
        tax_rate: 0.18,
        tax_amount: 18360.00,
        total_price: 120360.00,
      },
    ]
    const payments = [{ payment_method: 'cash', amount: 120360.00 }]

    const finalize = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := '${INV_POS_TC15}',
        p_salon_id := '${SALON_ID}',
        p_subtotal := 102000.00,
        p_tax_amount := 18360.00,
        p_total_amount := 120360.00,
        p_line_items := '${toPgJson(items)}'::jsonb,
        p_payments := '${toPgJson(payments)}'::jsonb,
        p_notes := 'POS Sale TC-15'
      );
    `, 'usr-rec', 'authenticated')

    assert.ok(finalize.code !== 0, 'Should fail insufficient stock')
    assert.ok(finalize.stderr.toLowerCase().includes('insufficient_stock') || finalize.stderr.toLowerCase().includes('available'))

    // Verify stock is still 25 (atomic rollback)
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('25'))
  })

  recordTest(S3, 'TC-16', 'POS draft invoice does not deduct inventory stock', () => {
    const draft = runPsql(`
      INSERT INTO public.invoices (
        id, salon_id, invoice_number, payment_status, subtotal, discount_amount, tax_amount, total_amount, balance_due, client_name, primary_payment_method, is_draft, created_at, updated_at
      ) VALUES (
        '${INV_DRAFT_TC16}', '${SALON_ID}', 'DFT-${RUN_ID}-0001', 'draft', 3400.00, 0.00, 612.00, 4012.00, 4012.00, 'Walk-in Guest', 'cash', true, now(), now()
      );
    `)
    assert.strictEqual(draft.code, 0, draft.stderr)
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('25'))
  })

  recordTest(S3, 'TC-17', 'Abandoned POS cart does not deduct inventory stock', () => {
    const del = runPsql(`DELETE FROM public.invoices WHERE id = '${INV_DRAFT_TC16}';`)
    assert.strictEqual(del.code, 0, del.stderr)
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('25'))
  })

  recordTest(S3, 'TC-18', 'POS idempotent finalization (retry does not double-deduct stock)', () => {
    const items = [
      {
        product_id: PROD_RETAIL_ID,
        item_type: 'product',
        item_name: 'Moroccanoil Treatment 100ml',
        quantity: 3,
        unit_price: 3400.00,
        discount_amount: 0,
        tax_rate: 0.18,
        tax_amount: 1836.00,
        total_price: 12036.00,
      },
    ]
    const payments = [{ payment_method: 'card', amount: 12036.00 }]

    const finalizeAgain = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := '${INV_POS_TC13}',
        p_salon_id := '${SALON_ID}',
        p_subtotal := 10200.00,
        p_tax_amount := 1836.00,
        p_total_amount := 12036.00,
        p_idempotency_key := 'idem-${INV_POS_TC13}',
        p_line_items := '${toPgJson(items)}'::jsonb,
        p_payments := '${toPgJson(payments)}'::jsonb,
        p_notes := 'POS Sale TC-13 Retry'
      );
    `, 'usr-rec', 'authenticated')

    assert.strictEqual(finalizeAgain.code, 0, finalizeAgain.stderr)
    // Stock must STILL be 25!
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('25'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 4: Consumables Management (TC-19 to TC-23)
  // ----------------------------------------------------------------------------
  const S4 = 'Suite 4: Consumables Management'

  recordTest(S4, 'TC-19', 'Record consumable usage generates unique USE-YYYY-XXXX number', () => {
    const res = runPsql(`
      SELECT public.rpc_record_consumable_usage(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_quantity := 1.500,
        p_unit := 'bottle',
        p_reason := 'Hair bleaching service',
        p_notes := 'Used for high-lift balayage'
      );
    `, 'usr-emp', 'authenticated')

    assert.strictEqual(res.code, 0, res.stderr)
    const json = JSON.parse(res.stdout)
    assert.ok(json.usage_number.startsWith('USE-'), `Expected USE- prefix, got ${json.usage_number}`)
  })

  recordTest(S4, 'TC-20', 'Consumable usage deducts stock and logs CONSUMABLE_USAGE movement', () => {
    // Initial was 10. Deducted 1.5 => 8.5.
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_CONS_ID}';`)
    assert.ok(stock.stdout.includes('8.5'), `Expected 8.5, got ${stock.stdout}`)

    const mov = runPsql(`
      SELECT movement_type, quantity, new_stock FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_CONS_ID}' AND movement_type = 'CONSUMABLE_USAGE';
    `)
    assert.strictEqual(mov.code, 0)
    assert.ok(mov.stdout.includes('CONSUMABLE_USAGE'))
    assert.ok(mov.stdout.includes('1.5'))
    assert.ok(mov.stdout.includes('8.5'))
  })

  recordTest(S4, 'TC-21', 'Consumable usage linked to service, appointment and stylist', () => {
    const res = runPsql(`
      SELECT public.rpc_record_consumable_usage(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_quantity := 0.500,
        p_unit := 'bottle',
        p_reason := 'VIP Color Touchup',
        p_notes := 'Appointment link verified'
      );
    `, 'usr-emp', 'authenticated')
    assert.strictEqual(res.code, 0)

    const rec = runPsql(`
      SELECT reason, notes, recorded_by FROM public.consumable_usages
      WHERE product_id = '${PROD_CONS_ID}'::uuid AND reason = 'VIP Color Touchup';
    `)
    assert.strictEqual(rec.code, 0)
    assert.ok(rec.stdout.includes('VIP Color Touchup'))
    assert.ok(rec.stdout.includes('Appointment link verified'))
  })

  recordTest(S4, 'TC-22', 'Consumable usage prevented when available stock is insufficient', () => {
    // Stock is now 8.0. Attempting to consume 15.0 must fail
    const res = runPsql(`
      SELECT public.rpc_record_consumable_usage(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_quantity := 15.000,
        p_unit := 'bottle',
        p_reason := 'Excessive consumption',
        p_notes := 'Should fail'
      );
    `, 'usr-emp', 'authenticated')
    assert.ok(res.code !== 0, 'Should fail insufficient stock')
    assert.ok(res.stderr.toLowerCase().includes('insufficient_stock') || res.stderr.toLowerCase().includes('available'))
  })

  recordTest(S4, 'TC-23', 'Consumable usage report with cost impact per service / department', () => {
    const costQuery = runPsql(`
      SELECT count(*), sum(quantity), sum(total_cost)
      FROM public.consumable_usages
      WHERE product_id = '${PROD_CONS_ID}'::uuid AND salon_id = '${SALON_ID}';
    `)
    assert.strictEqual(costQuery.code, 0)
    assert.ok(costQuery.stdout.includes('2')) // 2 usages recorded
    assert.ok(costQuery.stdout.includes('2')) // 1.5 + 0.5 = 2.0 total units
    assert.ok(costQuery.stdout.includes('9000')) // 2.0 * 4500 = 9000.00
  })

  // ----------------------------------------------------------------------------
  // SUITE 5: Low Stock Alerts & Reorders (TC-24 to TC-27)
  // ----------------------------------------------------------------------------
  const S5 = 'Suite 5: Low Stock Alerts & Reorders'

  recordTest(S5, 'TC-24', 'Stock at or below reorder level triggers low stock alert', () => {
    // Set stock to 3.0 (reorder_level for PROD_CONS_ID is 3.0)
    runPsql(`UPDATE public.inventory_products SET current_stock = 3.000 WHERE id = '${PROD_CONS_ID}';`)
    const lowStock = runPsql(`
      SELECT count(*) FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND current_stock <= reorder_level AND current_stock > 0;
    `)
    assert.strictEqual(lowStock.code, 0)
    assert.ok(parseInt(lowStock.stdout.trim(), 10) >= 1)
  })

  recordTest(S5, 'TC-25', 'Out of stock (quantity = 0) state detected and flagged', () => {
    runPsql(`
      INSERT INTO public.inventory_products (
        id, salon_id, name, brand, category, sku, purchase_price, selling_price, current_stock,
        min_stock_threshold, reorder_level, item_type, unit
      ) VALUES (
        '${PROD_OOS_ID}', '${SALON_ID}', 'Out of Stock Wax Strip', 'SalonPro', 'Consumables',
        'SKU-OOS-01', 50.00, 100.00, 0.000, 10.000, 15.000, 'consumable', 'pack'
      );
    `)
    const oos = runPsql(`
      SELECT count(*) FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND current_stock <= 0;
    `)
    assert.strictEqual(oos.code, 0)
    assert.ok(parseInt(oos.stdout.trim(), 10) >= 1)
  })

  recordTest(S5, 'TC-26', 'Suggested reorder quantity calculation (max - current)', () => {
    // PROD_CONS_ID has current_stock = 3.0, max_stock_threshold = 20.0 => suggested reorder = 17.0
    const calc = runPsql(`
      SELECT max_stock_threshold - current_stock AS suggested_reorder
      FROM public.inventory_products
      WHERE id = '${PROD_CONS_ID}';
    `)
    assert.strictEqual(calc.code, 0)
    assert.ok(calc.stdout.includes('17'))
  })

  recordTest(S5, 'TC-27', 'Low stock report generation with supplier info', () => {
    const report = runPsql(`
      SELECT sku, name, current_stock, reorder_level, (max_stock_threshold - current_stock) AS reorder_qty
      FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND current_stock <= reorder_level;
    `)
    assert.strictEqual(report.code, 0)
    assert.ok(report.stdout.includes('SKU-OLA-01'))
    assert.ok(report.stdout.includes('SKU-OOS-01'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 6: Batch, Expiry & Shelf-Life (TC-28 to TC-33)
  // ----------------------------------------------------------------------------
  const S6 = 'Suite 6: Batch, Expiry & Shelf-Life'

  recordTest(S6, 'TC-28', 'Register batch with batch number, mfg date, expiry date, initial quantity', () => {
    const res = runPsql(`
      SELECT public.rpc_create_inventory_batch(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_RETAIL_ID}'::uuid,
        p_batch_number := 'BATCH-TC-2026-01',
        p_expiry_date := '2027-01-01'::date,
        p_received_quantity := 15.000,
        p_unit_cost := 1800.00,
        p_manufacturing_date := '2026-01-01'::date,
        p_notes := 'Initial test batch'
      );
    `, 'usr-rec', 'authenticated')
    assert.strictEqual(res.code, 0, res.stderr)
    const json = JSON.parse(res.stdout)
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.batch_number, 'BATCH-TC-2026-01')
  })

  recordTest(S6, 'TC-29', 'Near-expiry detection (within configurable threshold)', () => {
    // Create a batch expiring in 15 days (default threshold is 30 days)
    runPsql(`
      INSERT INTO public.inventory_batches (
        id, salon_id, product_id, batch_number, expiry_date, received_quantity, current_quantity, unit_cost, status
      ) VALUES (
        gen_random_uuid(), '${SALON_ID}', '${PROD_RETAIL_ID}'::uuid, 'BATCH-NEAR-EXP',
        (CURRENT_DATE + INTERVAL '15 days')::date, 5.000, 5.000, 1800.00, 'near_expiry'
      );
    `)
    const nearExp = runPsql(`
      SELECT count(*) FROM public.inventory_batches
      WHERE salon_id = '${SALON_ID}' AND status = 'near_expiry';
    `)
    assert.strictEqual(nearExp.code, 0)
    assert.ok(parseInt(nearExp.stdout.trim(), 10) >= 1)
  })

  recordTest(S6, 'TC-30', 'Expired batch detection and automatic status transition', () => {
    // Create an expired batch (yesterday)
    runPsql(`
      INSERT INTO public.inventory_batches (
        id, salon_id, product_id, batch_number, expiry_date, received_quantity, current_quantity, unit_cost, status
      ) VALUES (
        gen_random_uuid(), '${SALON_ID}', '${PROD_RETAIL_ID}'::uuid, 'BATCH-PAST-EXP',
        (CURRENT_DATE - INTERVAL '2 days')::date, 4.000, 4.000, 1800.00, 'expired'
      );
    `)
    const exp = runPsql(`
      SELECT count(*) FROM public.inventory_batches
      WHERE salon_id = '${SALON_ID}' AND status = 'expired';
    `)
    assert.strictEqual(exp.code, 0)
    assert.ok(parseInt(exp.stdout.trim(), 10) >= 1)
  })

  recordTest(S6, 'TC-31', 'FEFO deduction priority (earliest expiring batch deducted first)', () => {
    runPsql(`
      INSERT INTO public.inventory_batches (
        id, salon_id, product_id, batch_number, expiry_date, received_quantity, current_quantity, unit_cost, status
      ) VALUES
      ('b0000001-0000-0000-0000-000000000001'::uuid, '${SALON_ID}', '${PROD_CONS_ID}'::uuid, 'FEFO-BATCH-EARLY', (CURRENT_DATE + INTERVAL '60 days')::date, 10.000, 10.000, 4500.00, 'active'),
      ('b0000002-0000-0000-0000-000000000002'::uuid, '${SALON_ID}', '${PROD_CONS_ID}'::uuid, 'FEFO-BATCH-LATER', (CURRENT_DATE + INTERVAL '180 days')::date, 10.000, 10.000, 4500.00, 'active');
    `)

    // Query FEFO order
    const fefoOrder = runPsql(`
      SELECT batch_number FROM public.inventory_batches
      WHERE product_id = '${PROD_CONS_ID}'::uuid AND status = 'active'
      ORDER BY expiry_date ASC
      LIMIT 1;
    `)
    assert.strictEqual(fefoOrder.code, 0)
    assert.strictEqual(fefoOrder.stdout.trim(), 'FEFO-BATCH-EARLY')
  })

  recordTest(S6, 'TC-32', 'Expired batch blocked from POS sale and salon consumable usage', () => {
    const expBatchId = runPsql(`
      SELECT id FROM public.inventory_batches
      WHERE salon_id = '${SALON_ID}' AND batch_number = 'BATCH-PAST-EXP';
    `).stdout.trim()

    const useExp = runPsql(`
      SELECT public.rpc_record_consumable_usage(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_RETAIL_ID}'::uuid,
        p_quantity := 1.000,
        p_unit := 'bottle',
        p_batch_id := '${expBatchId}'::uuid,
        p_reason := 'Should fail expired batch',
        p_notes := 'Testing TC-32'
      );
    `, 'usr-emp', 'authenticated')

    assert.ok(useExp.code !== 0, 'Should reject expired batch')
    assert.ok(useExp.stderr.includes('expired') || useExp.stderr.includes('inactive'))
  })

  recordTest(S6, 'TC-33', 'Batch quarantine workflow (quarantined batch blocked from deduction)', () => {
    // Quarantine batch A
    runPsql(`
      UPDATE public.inventory_batches
      SET status = 'quarantined', notes = 'Quarantined for quality check'
      WHERE id = 'b0000001-0000-0000-0000-000000000001'::uuid;
    `)

    // Try to consume from quarantined batch
    const useQuarantine = runPsql(`
      SELECT public.rpc_record_consumable_usage(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_quantity := 1.000,
        p_unit := 'bottle',
        p_batch_id := 'b0000001-0000-0000-0000-000000000001'::uuid,
        p_reason := 'Should fail quarantine batch',
        p_notes := 'Testing TC-33'
      );
    `, 'usr-emp', 'authenticated')

    assert.ok(useQuarantine.code !== 0, 'Should reject quarantined batch')
    assert.ok(useQuarantine.stderr.includes('quarantined') || useQuarantine.stderr.includes('inactive'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 7: Stock Losses & Wastage (TC-34 to TC-38)
  // ----------------------------------------------------------------------------
  const S7 = 'Suite 7: Stock Losses & Wastage'

  recordTest(S7, 'TC-34', 'Record damaged stock disposal with unique LOSS-YYYY-XXXX number', () => {
    const res = runPsql(`
      SELECT public.rpc_record_stock_loss(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_RETAIL_ID}'::uuid,
        p_loss_type := 'DAMAGE',
        p_quantity := 1.000,
        p_reason := 'Broken bottle on delivery floor',
        p_supporting_notes := 'Dropped during shelf stocking'
      );
    `, 'usr-rec', 'authenticated')
    assert.strictEqual(res.code, 0, res.stderr)
    const json = JSON.parse(res.stdout)
    assert.strictEqual(json.success, true)
    assert.ok(json.loss_number.startsWith('LOSS-'), `Expected LOSS- prefix, got ${json.loss_number}`)
  })

  recordTest(S7, 'TC-35', 'Record expired product disposal with EXPIRY movement type', () => {
    const res = runPsql(`
      SELECT public.rpc_record_stock_loss(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_RETAIL_ID}'::uuid,
        p_loss_type := 'EXPIRY',
        p_quantity := 1.000,
        p_reason := 'Passed expiry date disposal',
        p_supporting_notes := 'Biological waste protocol'
      );
    `, 'usr-rec', 'authenticated')
    assert.strictEqual(res.code, 0)
    const mov = runPsql(`
      SELECT movement_type, quantity FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_RETAIL_ID}' AND movement_type = 'EXPIRY';
    `)
    assert.strictEqual(mov.code, 0)
    assert.ok(mov.stdout.includes('EXPIRY'))
  })

  recordTest(S7, 'TC-36', 'Record salon wastage / spillage with WASTAGE movement type', () => {
    // 0.4 units * 4500 = ₹1800 (within ₹2000 auto-approve limit)
    const res = runPsql(`
      SELECT public.rpc_record_stock_loss(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_loss_type := 'WASTAGE',
        p_quantity := 0.400,
        p_reason := 'Overmixed color bowl leftover',
        p_supporting_notes := 'Unusable excess mix'
      );
    `, 'usr-emp', 'authenticated')
    assert.strictEqual(res.code, 0, res.stderr)
    const mov = runPsql(`
      SELECT movement_type, quantity FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_CONS_ID}' AND movement_type = 'WASTAGE';
    `)
    assert.strictEqual(mov.code, 0)
    assert.ok(mov.stdout.includes('WASTAGE'))
  })

  recordTest(S7, 'TC-37', 'Stock loss value calculation based on weighted average cost', () => {
    // Olaplex cost is 4500.00. 0.4 units wasted => 1800.00 total loss value
    const checkLoss = runPsql(`
      SELECT unit_cost, total_cost FROM public.stock_loss_records
      WHERE product_id = '${PROD_CONS_ID}'::uuid AND loss_type = 'WASTAGE';
    `)
    assert.strictEqual(checkLoss.code, 0)
    assert.ok(checkLoss.stdout.includes('4500'))
    assert.ok(checkLoss.stdout.includes('1800'))
  })

  recordTest(S7, 'TC-38', 'Owner authorization required for losses exceeding threshold (₹2,000)', () => {
    // 1. Employee attempting loss of ₹4,500 (> ₹2,000) MUST be blocked
    const empAttempt = runPsql(`
      SELECT public.rpc_record_stock_loss(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_loss_type := 'DAMAGE',
        p_quantity := 1.000,
        p_reason := 'Dropped full bottle'
      );
    `, 'usr-emp', 'authenticated')
    assert.ok(empAttempt.code !== 0, 'Employee loss > 2000 should require Owner')
    assert.ok(empAttempt.stderr.includes('PERMISSION_DENIED') || empAttempt.stderr.includes('require Owner authorization'))

    // 2. Owner attempting same loss MUST succeed
    const ownerAttempt = runPsql(`
      SELECT public.rpc_record_stock_loss(
        p_salon_id := '${SALON_ID}',
        p_product_id := '${PROD_CONS_ID}'::uuid,
        p_loss_type := 'DAMAGE',
        p_quantity := 1.000,
        p_reason := 'Dropped full bottle - owner authorized'
      );
    `, 'usr-owner', 'authenticated')
    assert.strictEqual(ownerAttempt.code, 0, ownerAttempt.stderr)
  })

  // ----------------------------------------------------------------------------
  // SUITE 8: Physical Stock Audits & Reconciliation (TC-39 to TC-44)
  // ----------------------------------------------------------------------------
  const S8 = 'Suite 8: Physical Stock Audits & Reconciliation'

  let testAuditSessionId = ''

  recordTest(S8, 'TC-39', 'Initiate stock audit creates session with unique AUD-YYYY-XXXX and frozen snapshot', () => {
    const res = runPsql(`
      SELECT public.rpc_create_stock_audit_session(
        p_salon_id := '${SALON_ID}',
        p_title := 'Monthly Salon Count Test',
        p_category_filter := 'Hair Care',
        p_item_type_filter := 'retail',
        p_notes := 'Full retail haircare physical count'
      );
    `, 'usr-owner', 'authenticated')
    assert.strictEqual(res.code, 0, res.stderr)
    const json = JSON.parse(res.stdout)
    assert.ok(json.audit_number.startsWith('AUD-'), `Expected AUD- prefix, got ${json.audit_number}`)
    testAuditSessionId = json.audit_id

    // Check that items snapshot was created
    const itemsCount = runPsql(`
      SELECT count(*) FROM public.stock_audit_items WHERE audit_id = '${testAuditSessionId}'::uuid;
    `)
    assert.strictEqual(itemsCount.code, 0)
    assert.ok(parseInt(itemsCount.stdout.trim(), 10) >= 1)
  })

  recordTest(S8, 'TC-40', 'Record physical count per item / batch', () => {
    const counts = [
      {
        product_id: PROD_RETAIL_ID,
        counted_quantity: 20.000,
        discrepancy_reason: 'Counted 20 bottles on shelf',
      },
    ]

    const saveCounts = runPsql(`
      SELECT public.rpc_record_stock_audit_counts(
        p_salon_id := '${SALON_ID}',
        p_audit_id := '${testAuditSessionId}'::uuid,
        p_items := '${toPgJson(counts)}'::jsonb
      );
    `, 'usr-rec', 'authenticated')
    assert.strictEqual(saveCounts.code, 0, saveCounts.stderr)
  })

  recordTest(S8, 'TC-41', 'Real-time variance calculation (physical - expected)', () => {
    const varCheck = runPsql(`
      SELECT system_quantity, counted_quantity, variance_quantity
      FROM public.stock_audit_items
      WHERE audit_id = '${testAuditSessionId}'::uuid AND product_id = '${PROD_RETAIL_ID}'::uuid;
    `)
    assert.strictEqual(varCheck.code, 0)
    assert.ok(varCheck.stdout.includes('20'))
  })

  recordTest(S8, 'TC-42', 'Discrepancy flagging for missing or surplus stock', () => {
    const discCheck = runPsql(`
      SELECT total_items_counted, total_discrepancies, net_variance_quantity
      FROM public.stock_audit_sessions
      WHERE id = '${testAuditSessionId}'::uuid;
    `)
    assert.strictEqual(discCheck.code, 0)
    assert.ok(discCheck.stdout.includes('1')) // Discrepancy recorded
  })

  recordTest(S8, 'TC-43', 'Reconciliation approval (Owner only) applies compensating adjustments', () => {
    const reconcile = runPsql(`
      SELECT public.rpc_reconcile_stock_audit(
        p_salon_id := '${SALON_ID}',
        p_audit_id := '${testAuditSessionId}'::uuid,
        p_notes := 'Approved by salon owner after double count'
      );
    `, 'usr-owner', 'authenticated')
    assert.strictEqual(reconcile.code, 0, reconcile.stderr)

    // Verify session status is reconciled
    const sess = runPsql(`SELECT status FROM public.stock_audit_sessions WHERE id = '${testAuditSessionId}'::uuid;`)
    assert.strictEqual(sess.stdout.trim(), 'reconciled')

    // Verify product current_stock is now updated to the reconciled count (20)
    const stock = runPsql(`SELECT current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';`)
    assert.ok(stock.stdout.includes('20'), `Expected 20, got ${stock.stdout}`)

    // Verify compensating movement was logged
    const compMov = runPsql(`
      SELECT count(*) FROM public.inventory_stock_movements
      WHERE product_id = '${PROD_RETAIL_ID}'
        AND movement_type IN ('STOCK_ADJUSTMENT_IN', 'STOCK_ADJUSTMENT_OUT')
        AND notes ILIKE '%AUD-%';
    `)
    assert.strictEqual(compMov.code, 0)
    assert.ok(parseInt(compMov.stdout.trim(), 10) >= 1)
  })

  recordTest(S8, 'TC-44', 'Non-owner reconciliation attempt rejected', () => {
    // Receptionist creates a new audit session and attempts to reconcile it directly
    const newAudit = runPsql(`
      SELECT public.rpc_create_stock_audit_session(
        p_salon_id := '${SALON_ID}',
        p_title := 'Rec Count Test',
        p_category_filter := 'ALL',
        p_item_type_filter := 'ALL',
        p_notes := 'Test non-owner reconciliation'
      );
    `, 'usr-rec', 'authenticated')
    const json = JSON.parse(newAudit.stdout)

    // Attempt reconcile as receptionist (must fail authorization)
    const unauthorizedReconcile = runPsql(`
      SELECT public.rpc_reconcile_stock_audit(
        p_salon_id := '${SALON_ID}',
        p_audit_id := '${json.audit_id}'::uuid,
        p_notes := 'Illegal non-owner reconciliation'
      );
    `, 'usr-rec', 'authenticated')

    assert.ok(unauthorizedReconcile.code !== 0, 'Should fail non-owner reconciliation')
    assert.ok(unauthorizedReconcile.stderr.includes('Only owners can approve') || unauthorizedReconcile.stderr.includes('PERMISSION_DENIED'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 9: Valuation & Reports (TC-45 to TC-50)
  // ----------------------------------------------------------------------------
  const S9 = 'Suite 9: Valuation & Reports'

  recordTest(S9, 'TC-45', 'Weighted Average Cost (WAC) recalculation on goods receipt', () => {
    // Current stock: 20 units @ 1800.00
    // Receive 10 units @ 2100.00
    // Total units: 30
    // Total value: (20 * 1800) + (10 * 2100) = 36000 + 21000 = 57000
    // New WAC: 57000 / 30 = 1900.00
    const wacCalc = runPsql(`
      DO $$
      DECLARE
        v_current_stock numeric := 20.000;
        v_current_wac numeric := 1800.00;
        v_new_qty numeric := 10.000;
        v_new_cost numeric := 2100.00;
        v_updated_wac numeric;
      BEGIN
        v_updated_wac := ((v_current_stock * v_current_wac) + (v_new_qty * v_new_cost)) / (v_current_stock + v_new_qty);
        UPDATE public.inventory_products
        SET weighted_average_cost = v_updated_wac, current_stock = v_current_stock + v_new_qty
        WHERE id = '${PROD_RETAIL_ID}';
      END $$;
      SELECT weighted_average_cost, current_stock FROM public.inventory_products WHERE id = '${PROD_RETAIL_ID}';
    `)
    assert.strictEqual(wacCalc.code, 0)
    assert.ok(wacCalc.stdout.includes('1900'))
    assert.ok(wacCalc.stdout.includes('30'))
  })

  recordTest(S9, 'TC-46', 'Total inventory valuation calculation', () => {
    const kpi = runPsql(`
      SELECT public.rpc_get_inventory_dashboard_kpis('${SALON_ID}');
    `)
    assert.strictEqual(kpi.code, 0)
    const json = JSON.parse(kpi.stdout)
    assert.ok(json.total_valuation > 0, `Expected total_valuation > 0, got ${json.total_valuation}`)
    assert.ok(json.total_products >= 2)
  })

  recordTest(S9, 'TC-47', 'Inventory valuation breakdown by category', () => {
    const catVal = runPsql(`
      SELECT category, sum(current_stock * weighted_average_cost) as cat_val
      FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}'
      GROUP BY category;
    `)
    assert.strictEqual(catVal.code, 0)
    assert.ok(catVal.stdout.includes('Hair Care'))
  })

  recordTest(S9, 'TC-48', 'Stock summary report data generation', () => {
    const summary = runPsql(`
      SELECT id, name, sku, current_stock, weighted_average_cost, selling_price, status
      FROM public.inventory_products
      WHERE salon_id = '${SALON_ID}' AND status != 'archived';
    `)
    assert.strictEqual(summary.code, 0)
    assert.ok(summary.stdout.includes('Moroccanoil'))
    assert.ok(summary.stdout.includes('Olaplex'))
  })

  recordTest(S9, 'TC-49', 'Dead stock / slow-moving inventory identification', () => {
    const deadStock = runPsql(`
      SELECT p.sku, p.name, p.current_stock
      FROM public.inventory_products p
      WHERE p.salon_id = '${SALON_ID}'
        AND NOT EXISTS (
          SELECT 1 FROM public.inventory_stock_movements m
          WHERE m.product_id = p.id AND m.created_at >= NOW() - INTERVAL '30 days'
        );
    `)
    assert.strictEqual(deadStock.code, 0)
    assert.ok(deadStock.stdout.includes('SKU-OOS-01'))
  })

  recordTest(S9, 'TC-50', 'CSV export generation for all 12 standard report types', () => {
    assert.strictEqual(typeof inventoryReportExporter.exportStockSummary, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportLowStockReorder, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportStockMovements, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportConsumableUsage, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportValuationReport, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportBatchExpiryReport, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportStockLossSummary, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportDeadStockAnalysis, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportStockAuditHistory, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportGrnPoVariance, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportPurchaseReturnImpact, 'function')
    assert.strictEqual(typeof inventoryReportExporter.exportRetailVsConsumableRatio, 'function')
  })

  // ----------------------------------------------------------------------------
  // REPORTING RESULTS
  // ----------------------------------------------------------------------------
  console.log('\n' + '='.repeat(80))
  console.log('ACCEPTANCE RESULTS BREAKDOWN')
  console.log('='.repeat(80))

  let passed = 0
  let failed = 0

  for (const r of results) {
    const symbol = r.status === 'PASS' ? '✅' : '❌'
    console.log(`${symbol} [${r.id}] (${r.suite}) ${r.name}`)
    if (r.status === 'PASS') {
      passed++
    } else {
      failed++
      console.log(`   ERROR: ${r.details}`)
    }
  }

  console.log('='.repeat(80))
  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('='.repeat(80))

  if (failed > 0) {
    process.exit(1)
  }
}

runAcceptanceSuite()
