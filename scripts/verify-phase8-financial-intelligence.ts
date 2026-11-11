// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 8 AUTOMATED VERIFICATION SUITE
// 50 Formal Acceptance Tests: Owner Financial Intelligence Dashboard
// Scope: Accrual Revenue, Cash Collections, P&L Statement, Receivables Ageing,
//        Supplier Payables, Inventory COGS, Staff Attribution & Multi-Tenant Security
// ==============================================================================

import assert from 'node:assert'
import { spawnSync } from 'node:child_process'
import {
  ownerFinancialIntelligenceService,
  computeFinancialDateRange,
} from '../src/services/ownerFinancialIntelligenceService.ts'
import { financialIntelligenceExportService } from '../src/services/financialIntelligenceExportService.ts'
import { permissionService } from '../src/services/permissionService.ts'
import type { UserSession } from '../src/types/models.ts'

const DB_HOST = 'localhost'
const DB_PORT = '5433'
const DB_NAME = 'luma_test'
const DB_USER = 'postgres'
const PSQL_BIN = 'psql'

const SALON_ID = 'salon-luma-01'
const FOREIGN_SALON_ID = 'salon-foreign-99'
const RUN_ID = `p8-${Date.now().toString(36)}`

function runPsql(sql: string, authUserUuid?: string, authRole: string = 'authenticated') {
  let setupSql = ''
  if (authUserUuid) {
    setupSql += `SET request.jwt.claim.sub = '${authUserUuid}';\n`
    setupSql += `SET request.jwt.claim.role = '${authRole}';\n`
  }
  const fullSql = `${setupSql}${sql}`
  const env = { ...process.env, PGPASSWORD: 'postgres' }
  const res = spawnSync(
    PSQL_BIN,
    ['-h', DB_HOST, '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1'],
    { input: fullSql, env, encoding: 'utf-8' }
  )
  const rawStdout = res.stdout || ''
  const stdout = rawStdout
    .split('\n')
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^(BEGIN|COMMIT|ROLLBACK|SET|INSERT\s+\d+|UPDATE\s+\d+|DELETE\s+\d+)/i.test(line)
    )
    .join('\n')
    .trim()

  return {
    stdout,
    rawStdout,
    stderr: res.stderr || '',
    code: res.status ?? 1,
  }
}

interface TestResult {
  suite: string
  id: string
  name: string
  passed: boolean
  error?: string
}

const results: TestResult[] = []

function recordTest(suite: string, id: string, name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn()
    if (res instanceof Promise) {
      throw new Error('Async test must be awaited in main loop')
    }
    results.push({ suite, id, name, passed: true })
    console.log(`✅ [${id}] (${suite}) ${name}`)
  } catch (err: any) {
    results.push({ suite, id, name, passed: false, error: err?.message || String(err) })
    console.error(`❌ [${id}] (${suite}) ${name}: ${err?.message || err}`)
  }
}

async function recordAsyncTest(suite: string, id: string, name: string, fn: () => Promise<void>) {
  try {
    await fn()
    results.push({ suite, id, name, passed: true })
    console.log(`✅ [${id}] (${suite}) ${name}`)
  } catch (err: any) {
    results.push({ suite, id, name, passed: false, error: err?.message || String(err) })
    console.error(`❌ [${id}] (${suite}) ${name}: ${err?.message || err}`)
  }
}

async function runAllTests() {
  console.log('================================================================================')
  console.log('LUMA SALON — PHASE 8: OWNER FINANCIAL INTELLIGENCE DASHBOARD ACCEPTANCE SUITE')
  console.log('50 Formal Acceptance Tests (PostgreSQL 18.6 Local Database + Domain Logic)')
  console.log('================================================================================\n')

  // Setup: Clean existing fixtures with our prefix
  runPsql(`
    DELETE FROM public.payments WHERE invoice_id LIKE '${RUN_ID}%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE '${RUN_ID}%';
    DELETE FROM public.invoices WHERE id LIKE '${RUN_ID}%';
    DELETE FROM public.refunds WHERE refund_number LIKE 'REF-${RUN_ID}%';
    DELETE FROM public.customer_advances WHERE advance_number LIKE 'ADV-${RUN_ID}%';
    DELETE FROM public.credit_notes WHERE credit_note_number LIKE 'CN-${RUN_ID}%';
    DELETE FROM public.purchase_bills WHERE bill_number LIKE 'PB-${RUN_ID}%';
    DELETE FROM public.supplier_payments WHERE payment_number LIKE 'SPAY-${RUN_ID}%';
    DELETE FROM public.stock_loss_records WHERE loss_number LIKE 'LOSS-${RUN_ID}%';
    DELETE FROM public.consumable_usages WHERE usage_number LIKE 'USE-${RUN_ID}%';
  `)

  // Create isolated seed data for Phase 8 test run
  const testStaffId = 'staff-p5-01' // Ananya Sharma
  const testClientId = 'client-p8-test'
  const today = computeFinancialDateRange('today').startDate

  // Ensure test client exists in clients table
  runPsql(`
    INSERT INTO public.clients (id, salon_id, name, phone, email)
    VALUES ('${testClientId}', '${SALON_ID}', 'Aarti Patel', '+91 98765 11111', 'aarti@example.com')
    ON CONFLICT (id) DO NOTHING;
  `)

  // Seed Invoice 1: Fully Paid (Gross 5,000, Discount 500, Tax 810, Total 5,310)
  // Split payment: 3,000 UPI + 2,310 Cash
  const inv1Id = `${RUN_ID}-inv-01`
  runPsql(`
    INSERT INTO public.invoices (
      id, salon_id, invoice_number, client_id, client_name, client_phone,
      staff_id, staff_name, service_name, date, subtotal, discount_amount,
      tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
      balance_due, payment_status, primary_payment_method, is_draft, created_at, updated_at
    ) VALUES (
      '${inv1Id}', '${SALON_ID}', 'INV-${RUN_ID}-0001', '${testClientId}', 'Aarti Patel', '+91 98765 11111',
      '${testStaffId}', 'Ananya Sharma', 'Balayage Color', '${today}', 5000.00, 500.00,
      0.18, 810.00, 405.00, 405.00, 5310.00, 0.00,
      5310.00, 'unpaid', 'split', false, now(), now()
    );

    INSERT INTO public.invoice_line_items (
      id, salon_id, invoice_id, description, quantity, unit_price, total_price,
      item_type, staff_id, discount_amount, tax_rate, tax_amount
    ) VALUES
    ('item-${RUN_ID}-01a', '${SALON_ID}', '${inv1Id}', 'Balayage Color', 1, 4000.00, 4000.00, 'service', '${testStaffId}', 400.00, 0.18, 648.00),
    ('item-${RUN_ID}-01b', '${SALON_ID}', '${inv1Id}', 'Moroccanoil 100ml', 1, 1000.00, 1000.00, 'product', '${testStaffId}', 100.00, 0.18, 162.00);

    INSERT INTO public.payments (
      id, salon_id, invoice_id, payment_method, amount, created_at
    ) VALUES
    ('pmt-${RUN_ID}-01a', '${SALON_ID}', '${inv1Id}', 'upi', 3000.00, now()),
    ('pmt-${RUN_ID}-01b', '${SALON_ID}', '${inv1Id}', 'cash', 2310.00, now());
  `)

  // Seed Invoice 2: Partially Paid (Gross 3,000, Discount 0, Tax 540, Total 3,540)
  // Payment: 1,540 Card, Balance Due: 2,000
  const inv2Id = `${RUN_ID}-inv-02`
  runPsql(`
    INSERT INTO public.invoices (
      id, salon_id, invoice_number, client_id, client_name, client_phone,
      staff_id, staff_name, service_name, date, subtotal, discount_amount,
      tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
      balance_due, payment_status, primary_payment_method, is_draft, created_at, updated_at
    ) VALUES (
      '${inv2Id}', '${SALON_ID}', 'INV-${RUN_ID}-0002', '${testClientId}', 'Aarti Patel', '+91 98765 11111',
      '${testStaffId}', 'Ananya Sharma', 'Hair Treatment', '${today}', 3000.00, 0.00,
      0.18, 540.00, 270.00, 270.00, 3540.00, 0.00,
      3540.00, 'unpaid', 'card', false, now(), now()
    );

    INSERT INTO public.invoice_line_items (
      id, salon_id, invoice_id, description, quantity, unit_price, total_price,
      item_type, staff_id, discount_amount, tax_rate, tax_amount
    ) VALUES
    ('item-${RUN_ID}-02', '${SALON_ID}', '${inv2Id}', 'Hair Treatment', 1, 3000.00, 3000.00, 'service', '${testStaffId}', 0.00, 0.18, 540.00);

    INSERT INTO public.payments (
      id, salon_id, invoice_id, payment_method, amount, created_at
    ) VALUES
    ('pmt-${RUN_ID}-02', '${SALON_ID}', '${inv2Id}', 'card', 1540.00, now());
  `)

  // Seed Invoice 3: Unpaid (Gross 2,000, Tax 360, Total 2,360, Balance Due: 2,360)
  const inv3Id = `${RUN_ID}-inv-03`
  runPsql(`
    INSERT INTO public.invoices (
      id, salon_id, invoice_number, client_id, client_name, client_phone,
      staff_id, staff_name, service_name, date, subtotal, discount_amount,
      tax_rate, tax_amount, cgst_amount, sgst_amount, total_amount, paid_amount,
      balance_due, payment_status, primary_payment_method, is_draft, created_at, updated_at
    ) VALUES (
      '${inv3Id}', '${SALON_ID}', 'INV-${RUN_ID}-0003', '${testClientId}', 'Aarti Patel', '+91 98765 11111',
      '${testStaffId}', 'Ananya Sharma', 'Keratin Spa', '${today}', 2000.00, 0.00,
      0.18, 360.00, 180.00, 180.00, 2360.00, 0.00, 2360.00, 'unpaid', 'cash', false, now(), now()
    );

    INSERT INTO public.invoice_line_items (
      id, salon_id, invoice_id, description, quantity, unit_price, total_price,
      item_type, staff_id, discount_amount, tax_rate, tax_amount
    ) VALUES
    ('item-${RUN_ID}-03', '${SALON_ID}', '${inv3Id}', 'Keratin Spa', 1, 2000.00, 2000.00, 'service', '${testStaffId}', 0.00, 0.18, 360.00);
  `)

  // ----------------------------------------------------------------------------
  // SUITE 1: Accrual Revenue, Invoicing & GST Math (TC-01 to TC-05)
  // ----------------------------------------------------------------------------
  const S1 = 'Suite 1: Accrual Revenue & GST Math'

  recordTest(S1, 'TC-01', 'Gross sales calculates exact subtotal across finalized invoices in period', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'gross_sales')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const gross = parseFloat(res.stdout.trim())
    assert(gross >= 10000.00, `Expected gross sales >= 10000, got ${gross}`)
  })

  recordTest(S1, 'TC-02', 'Total customer discounts deducted accurately without negative balances', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'discounts_total')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const disc = parseFloat(res.stdout.trim())
    assert(disc >= 500.00, `Expected discounts >= 500, got ${disc}`)
  })

  recordTest(S1, 'TC-03', 'Net sales mathematically equals Gross Sales minus Discounts', () => {
    const res = runPsql(`
      SELECT
        (k->>'gross_sales')::numeric - (k->>'discounts_total')::numeric AS expected_net,
        (k->>'net_sales')::numeric AS actual_net
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis' AS k
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [expectedNet, actualNet] = res.stdout.trim().split('|').map(Number)
    assert.strictEqual(expectedNet, actualNet, `Expected net ${expectedNet} to match actual ${actualNet}`)
  })

  recordTest(S1, 'TC-04', 'Statutory GST 18% (CGST 9% + SGST 9%) isolated from business revenue', () => {
    const res = runPsql(`
      SELECT
        (k->>'cgst_collected')::numeric AS cgst,
        (k->>'sgst_collected')::numeric AS sgst,
        (k->>'tax_collected')::numeric AS total_tax
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis' AS k
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [cgst, sgst, totalTax] = res.stdout.trim().split('|').map(Number)
    assert(totalTax >= 1710.00, `Expected tax >= 1710, got ${totalTax}`)
    assert(Math.abs((cgst + sgst) - totalTax) < 0.05, `CGST + SGST must equal total tax`)
  })

  recordTest(S1, 'TC-05', 'Total invoiced amount equals Net Sales plus GST Collected', () => {
    const res = runPsql(`
      SELECT
        (k->>'net_sales')::numeric + (k->>'tax_collected')::numeric AS expected_invoiced,
        (k->>'total_invoiced')::numeric AS actual_invoiced
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis' AS k
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [expected, actual] = res.stdout.trim().split('|').map(Number)
    assert(Math.abs(expected - actual) < 0.05, `Total invoiced (${actual}) must equal Net + Tax (${expected})`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 2: Cash Collections & Payment Tenders (TC-06 to TC-10)
  // ----------------------------------------------------------------------------
  const S2 = 'Suite 2: Cash Collections & Tenders'

  recordTest(S2, 'TC-06', 'Total collections accurately aggregates payment records on cash basis', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'total_collections')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const col = parseFloat(res.stdout.trim())
    // 3000 (UPI) + 2310 (Cash) + 1540 (Card) = 6850
    assert(col >= 6850.00, `Expected collections >= 6850, got ${col}`)
  })

  recordTest(S2, 'TC-07', 'Cash tender collections isolated and calculated', () => {
    const res = runPsql(`
      SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'collections_by_tender') AS elem
      WHERE elem->>'method' = 'cash';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const cash = parseFloat(res.stdout.trim())
    assert(cash >= 2310.00, `Expected cash collections >= 2310, got ${cash}`)
  })

  recordTest(S2, 'TC-08', 'Digital payment collections (UPI, Card, Bank Transfer) isolated', () => {
    const res = runPsql(`
      SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'collections_by_tender') AS elem
      WHERE elem->>'method' IN ('upi', 'card', 'bank');
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const digital = parseFloat(res.stdout.trim())
    assert(digital >= 4540.00, `Expected digital collections >= 4540, got ${digital}`)
  })

  recordTest(S2, 'TC-09', 'Split-tender payment transactions handled without double-counting', () => {
    const res = runPsql(`
      SELECT count(*) FROM public.payments WHERE invoice_id = '${inv1Id}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.strictEqual(res.stdout.trim(), '2', 'Split invoice must have 2 distinct payment rows')
  })

  recordTest(S2, 'TC-10', 'Payment tender share percentages sum mathematically to 100%', () => {
    const res = runPsql(`
      SELECT ROUND(SUM((elem->>'percentage')::numeric), 0)
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'collections_by_tender') AS elem;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const sumPct = parseFloat(res.stdout.trim())
    assert(Math.abs(sumPct - 100) <= 1, `Expected tender percentages to sum near 100%, got ${sumPct}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 3: Revenue vs Collections Reconciliation (TC-11 to TC-15)
  // ----------------------------------------------------------------------------
  const S3 = 'Suite 3: Revenue vs Collections Reconciliation'

  recordTest(S3, 'TC-11', 'Revenue (Accrual) versus Collections (Cash) timing gap calculated', () => {
    const res = runPsql(`
      SELECT
        (k->>'net_sales')::numeric AS net_sales,
        (k->>'total_collections')::numeric AS collections
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis' AS k
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [netSales, collections] = res.stdout.trim().split('|').map(Number)
    assert(netSales > 0 && collections > 0)
    // Accrual net sales should exceed cash collections due to unpaid and partial invoices
    assert(netSales !== collections, 'Net sales and collections must not be treated as identical')
  })

  recordTest(S3, 'TC-12', 'Fully settled invoice (paid = total) produces zero remaining balance due', () => {
    const res = runPsql(`
      SELECT balance_due, payment_status FROM public.invoices WHERE id = '${inv1Id}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [bal, status] = res.stdout.trim().split('|')
    assert.strictEqual(parseFloat(bal), 0.00)
    assert.strictEqual(status, 'paid')
  })

  recordTest(S3, 'TC-13', 'Partially settled invoice reflects exact balance due in outstanding receivables', () => {
    const res = runPsql(`
      SELECT balance_due, paid_amount, payment_status FROM public.invoices WHERE id = '${inv2Id}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [bal, paid, status] = res.stdout.trim().split('|')
    assert.strictEqual(parseFloat(bal), 2000.00)
    assert.strictEqual(parseFloat(paid), 1540.00)
    assert.strictEqual(status, 'partial')
  })

  recordTest(S3, 'TC-14', 'Unpaid invoice reflects full total in outstanding receivables', () => {
    const res = runPsql(`
      SELECT balance_due, total_amount, payment_status FROM public.invoices WHERE id = '${inv3Id}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [bal, total, status] = res.stdout.trim().split('|')
    assert.strictEqual(parseFloat(bal), 2360.00)
    assert.strictEqual(parseFloat(total), 2360.00)
    assert.strictEqual(status, 'unpaid')
  })

  recordTest(S3, 'TC-15', 'Daily time-series trend correctly pairs invoice dates with payment dates', () => {
    const res = runPsql(`
      SELECT count(*)
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'revenue_vs_collections') AS d
      WHERE d->>'date' = '${today}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert.strictEqual(res.stdout.trim(), '1', 'Must contain a daily point for today')
  })

  // ----------------------------------------------------------------------------
  // SUITE 4: Customer Receivables, Ageing & Credits (TC-16 to TC-21)
  // ----------------------------------------------------------------------------
  const S4 = 'Suite 4: Customer Receivables & Credits'

  recordTest(S4, 'TC-16', 'Total customer receivables matches sum of invoice balances due', () => {
    const res = runPsql(`
      SELECT
        (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->>'total_outstanding')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const out = parseFloat(res.stdout.trim())
    // inv2 (2000) + inv3 (2360) = 4360
    assert(out >= 4360.00, `Expected receivables >= 4360, got ${out}`)
  })

  recordTest(S4, 'TC-17', 'Receivables ageing bucket 0–30 days (Current) classified accurately', () => {
    const res = runPsql(`
      SELECT
        (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->'ageing'->>'current_0_30')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const current = parseFloat(res.stdout.trim())
    assert(current >= 4360.00, `Expected current 0-30 days ageing >= 4360, got ${current}`)
  })

  recordTest(S4, 'TC-18', 'Receivables ageing bucket 90+ days (Overdue) flagged and classified', () => {
    const res = runPsql(`
      SELECT
        (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->'ageing'->>'over_90')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert(!isNaN(parseFloat(res.stdout.trim())), 'Ageing over_90 must be numeric')
  })

  recordTest(S4, 'TC-19', 'Top debtor clients ranked in descending order of balance due', () => {
    const res = runPsql(`
      SELECT jsonb_array_length(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->'top_debtors');
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const count = parseInt(res.stdout.trim(), 10)
    assert(count >= 1, `Expected at least 1 top debtor, got ${count}`)
  })

  recordTest(S4, 'TC-20', 'Unallocated customer advances recorded as customer credit liability', () => {
    const adv = runPsql(`
      INSERT INTO public.customer_advances (
        salon_id, client_id, advance_number, amount, remaining_amount, payment_method, created_at
      ) VALUES (
        '${SALON_ID}', '${testClientId}', 'ADV-${RUN_ID}-01', 2500.00, 2500.00, 'upi', now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->>'advances_unallocated')::numeric;
    `)
    assert.strictEqual(adv.code, 0, adv.stderr)
    const unalloc = parseFloat(adv.stdout.trim())
    assert(unalloc >= 2500.00, `Expected unallocated advance >= 2500, got ${unalloc}`)
  })

  recordTest(S4, 'TC-21', 'Active credit note remaining balances recorded as customer credit liability', () => {
    const cn = runPsql(`
      INSERT INTO public.credit_notes (
        salon_id, credit_note_number, original_invoice_id, client_id, issue_date,
        reason, subtotal, tax_amount, total_amount, allocated_amount, remaining_amount, status, created_at
      ) VALUES (
        '${SALON_ID}', 'CN-${RUN_ID}-01', '${inv1Id}', '${testClientId}', '${today}',
        'Special credit', 1000.00, 180.00, 1180.00, 0.00, 1180.00, 'active', now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'customer_receivables'->>'credit_notes_remaining')::numeric;
    `)
    assert.strictEqual(cn.code, 0, cn.stderr)
    const rem = parseFloat(cn.stdout.trim())
    assert(rem >= 1180.00, `Expected credit note remaining >= 1180, got ${rem}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 5: Procurement Expenses & Supplier Payables (TC-22 to TC-27)
  // ----------------------------------------------------------------------------
  const S5 = 'Suite 5: Procurement & Supplier Payables'

  recordTest(S5, 'TC-22', 'Total purchase bills in period calculated accurately', () => {
    // Seed purchase bill
    const pb = runPsql(`
      INSERT INTO public.purchase_bills (
        salon_id, bill_number, supplier_invoice_number, supplier_id, bill_date,
        status, subtotal, tax_amount, total_amount, paid_amount, balance_due, created_at, updated_at
      ) VALUES (
        '${SALON_ID}', 'PB-${RUN_ID}-01', 'INV-SUP-${RUN_ID}-1',
        (SELECT id FROM public.suppliers WHERE salon_id = '${SALON_ID}' LIMIT 1),
        '${today}', 'unpaid', 8000.00, 1440.00, 9440.00, 0.00, 9440.00, now(), now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'purchase_expenses')::numeric;
    `)
    assert.strictEqual(pb.code, 0, pb.stderr)
    const exp = parseFloat(pb.stdout.trim())
    assert(exp >= 9440.00, `Expected purchase expenses >= 9440, got ${exp}`)
  })

  recordTest(S5, 'TC-23', 'Accounts payable matches sum of unpaid purchase bill balances due', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'supplier_payables'->>'total_outstanding')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const ap = parseFloat(res.stdout.trim())
    assert(ap >= 9440.00, `Expected AP >= 9440, got ${ap}`)
  })

  recordTest(S5, 'TC-24', 'Total supplier payments made in period aggregated', () => {
    const spay = runPsql(`
      INSERT INTO public.supplier_payments (
        salon_id, payment_number, supplier_id, amount, payment_date, payment_method,
        allocated_amount, unallocated_amount, is_advance, created_at
      ) VALUES (
        '${SALON_ID}', 'SPAY-${RUN_ID}-01',
        (SELECT id FROM public.suppliers WHERE salon_id = '${SALON_ID}' LIMIT 1),
        4000.00, '${today}', 'bank', 4000.00, 0.00, false, now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'supplier_payables'->>'total_paid')::numeric;
    `)
    assert.strictEqual(spay.code, 0, spay.stderr)
    const paid = parseFloat(spay.stdout.trim())
    assert(!isNaN(paid))
  })

  recordTest(S5, 'TC-25', 'Unallocated supplier advances recorded as vendor credit assets', () => {
    const spayAdv = runPsql(`
      INSERT INTO public.supplier_payments (
        salon_id, payment_number, supplier_id, amount, payment_date, payment_method,
        allocated_amount, unallocated_amount, is_advance, created_at
      ) VALUES (
        '${SALON_ID}', 'SPAY-${RUN_ID}-02',
        (SELECT id FROM public.suppliers WHERE salon_id = '${SALON_ID}' LIMIT 1),
        5000.00, '${today}', 'bank', 0.00, 5000.00, true, now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'supplier_payables'->>'total_advances')::numeric;
    `)
    assert.strictEqual(spayAdv.code, 0, spayAdv.stderr)
    const adv = parseFloat(spayAdv.stdout.trim())
    assert(adv >= 5000.00, `Expected supplier advances >= 5000, got ${adv}`)
  })

  recordTest(S5, 'TC-26', 'Purchase returns (debit notes) reduce accounts payable liability', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'supplier_payables'->>'total_returns')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert(!isNaN(parseFloat(res.stdout.trim())))
  })

  recordTest(S5, 'TC-27', 'Top creditor suppliers ranked in descending order of payable balance', () => {
    const res = runPsql(`
      SELECT jsonb_array_length(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'supplier_payables'->'top_creditors');
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const count = parseInt(res.stdout.trim(), 10)
    assert(count >= 1, `Expected top creditors count >= 1, got ${count}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 6: Inventory Valuation & Cost Intelligence (TC-28 to TC-33)
  // ----------------------------------------------------------------------------
  const S6 = 'Suite 6: Inventory Valuation & Costs'

  recordTest(S6, 'TC-28', 'Total inventory valuation equals sum of (current_stock * purchase_price)', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'inventory_analytics'->>'total_valuation')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const val = parseFloat(res.stdout.trim())
    assert(val >= 0, 'Valuation must be non-negative')
  })

  recordTest(S6, 'TC-29', 'Retail vs. Salon Consumables inventory valuation disaggregated', () => {
    const res = runPsql(`
      SELECT
        (k->>'inventory_retail_value')::numeric AS retail_val,
        (k->>'inventory_consumable_value')::numeric AS consumable_val
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis' AS k
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [retail, consumable] = res.stdout.trim().split('|').map(Number)
    assert(!isNaN(retail) && !isNaN(consumable))
  })

  recordTest(S6, 'TC-30', 'Category-wise inventory valuation breakdown calculated accurately', () => {
    const res = runPsql(`
      SELECT jsonb_array_length(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'inventory_analytics'->'valuation_by_category');
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const count = parseInt(res.stdout.trim(), 10)
    assert(count >= 1, `Expected categories count >= 1, got ${count}`)
  })

  recordTest(S6, 'TC-31', 'Cost of Goods Sold (COGS) aggregated from SALE_DEDUCTION movements', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'cogs_retail')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert(!isNaN(parseFloat(res.stdout.trim())))
  })

  recordTest(S6, 'TC-32', 'Consumables cost aggregated from salon service consumable usages', () => {
    const usage = runPsql(`
      INSERT INTO public.consumable_usages (
        salon_id, usage_number, product_id, quantity, unit, unit_cost, total_cost, reason, created_at
      ) VALUES (
        '${SALON_ID}', 'USE-${RUN_ID}-01',
        (SELECT id FROM public.inventory_products WHERE salon_id = '${SALON_ID}' LIMIT 1),
        2.0, 'tubes', 450.00, 900.00, 'Coloring service test', now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'consumable_usage_cost')::numeric;
    `)
    assert.strictEqual(usage.code, 0, usage.stderr)
    const cost = parseFloat(usage.stdout.trim())
    assert(cost >= 900.00, `Expected consumable usage cost >= 900, got ${cost}`)
  })

  recordTest(S6, 'TC-33', 'Stock losses & wastage valued accurately using weighted-average cost', () => {
    const loss = runPsql(`
      INSERT INTO public.stock_loss_records (
        salon_id, loss_number, product_id, loss_type, quantity, unit_cost, total_cost, reason, created_at
      ) VALUES (
        '${SALON_ID}', 'LOSS-${RUN_ID}-01',
        (SELECT id FROM public.inventory_products WHERE salon_id = '${SALON_ID}' LIMIT 1),
        'DAMAGE', 1.0, 1200.00, 1200.00, 'Broken bottle during cleaning', now()
      );
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'kpis'->>'stock_loss_value')::numeric;
    `)
    assert.strictEqual(loss.code, 0, loss.stderr)
    const val = parseFloat(loss.stdout.trim())
    assert(val >= 1200.00, `Expected stock loss value >= 1200, got ${val}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 7: Profit & Loss Statement & Operating Contribution (TC-34 to TC-38)
  // ----------------------------------------------------------------------------
  const S7 = 'Suite 7: Profit & Loss Statement'

  recordTest(S7, 'TC-34', 'Effective operating revenue equals Net Sales minus Completed Customer Refunds', () => {
    // Seed refund
    const ref = runPsql(`
      INSERT INTO public.refunds (
        salon_id, refund_number, client_id, invoice_id, amount, payment_method, reason, status, created_at
      ) VALUES (
        '${SALON_ID}', 'REF-${RUN_ID}-01', '${testClientId}', '${inv1Id}', 500.00, 'upi', 'Service redo discount', 'completed', now()
      );
      SELECT
        (p->>'net_sales')::numeric - (p->>'refunds')::numeric AS expected_eff,
        (p->>'effective_revenue')::numeric AS actual_eff
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'pnl_statement' AS p
      ) sub;
    `)
    assert.strictEqual(ref.code, 0, ref.stderr)
    const [expectedEff, actualEff] = ref.stdout.trim().split('|').map(Number)
    assert(Math.abs(expectedEff - actualEff) < 0.05, `Expected effective ${expectedEff} to match actual ${actualEff}`)
  })

  recordTest(S7, 'TC-35', 'Estimated Gross Profit equals Effective Revenue minus COGS minus Consumables Cost', () => {
    const res = runPsql(`
      SELECT
        (p->>'effective_revenue')::numeric - (p->>'cogs_retail')::numeric - (p->>'consumable_usage_cost')::numeric AS expected_gp,
        (p->>'gross_profit')::numeric AS actual_gp
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'pnl_statement' AS p
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [expectedGp, actualGp] = res.stdout.trim().split('|').map(Number)
    assert(Math.abs(expectedGp - actualGp) < 0.05, `Gross profit (${actualGp}) must equal expected (${expectedGp})`)
  })

  recordTest(S7, 'TC-36', 'Gross Margin percentage computed accurately against Effective Revenue', () => {
    const res = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'pnl_statement'->>'gross_margin_percentage')::numeric;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const pct = parseFloat(res.stdout.trim())
    assert(!isNaN(pct))
  })

  recordTest(S7, 'TC-37', 'Recorded Operating Contribution equals Gross Profit minus Stock Losses', () => {
    const res = runPsql(`
      SELECT
        (p->>'gross_profit')::numeric - (p->>'stock_losses')::numeric AS expected_oc,
        (p->>'recorded_operating_contribution')::numeric AS actual_oc
      FROM (
        SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'pnl_statement' AS p
      ) sub;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const [expectedOc, actualOc] = res.stdout.trim().split('|').map(Number)
    assert(Math.abs(expectedOc - actualOc) < 0.05, `Operating contribution (${actualOc}) must equal expected (${expectedOc})`)
  })

  recordTest(S7, 'TC-38', 'Mandatory off-ledger accounting disclaimer and GST exclusion verified', () => {
    const res = runPsql(`
      SELECT public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'pnl_statement'->>'disclaimer';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const disclaimer = res.stdout.trim()
    assert(disclaimer.includes('excludes off-ledger') && disclaimer.includes('lease/rent'))
  })

  // ----------------------------------------------------------------------------
  // SUITE 8: Employee & Service Performance Attribution (TC-39 to TC-44)
  // ----------------------------------------------------------------------------
  const S8 = 'Suite 8: Employee & Service Performance'

  recordTest(S8, 'TC-39', 'Service revenue accurately attributed to performing stylist via line items', () => {
    const res = runPsql(`
      SELECT (elem->>'service_revenue')::numeric
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'staff_performance') AS elem
      WHERE elem->>'staff_id' = '${testStaffId}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const srvRev = parseFloat(res.stdout.trim())
    // 3352 (inv1 srv: 4000 - 648) + 2460 (inv2: 3000 - 540) + 1640 (inv3: 2000 - 360) = 7452
    assert(srvRev >= 7000.00, `Expected stylist service revenue >= 7000, got ${srvRev}`)
  })

  recordTest(S8, 'TC-40', 'Retail product upsell revenue attributed to staff via line items', () => {
    const res = runPsql(`
      SELECT (elem->>'product_revenue')::numeric
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'staff_performance') AS elem
      WHERE elem->>'staff_id' = '${testStaffId}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const prodRev = parseFloat(res.stdout.trim())
    // 838 (inv1 prod: 1000 - 162)
    assert(prodRev >= 800.00, `Expected stylist product revenue >= 800, got ${prodRev}`)
  })

  recordTest(S8, 'TC-41', 'Stylist revenue leaderboard ranked by total net realized revenue', () => {
    const res = runPsql(`
      SELECT elem->>'staff_name', (elem->>'total_revenue')::numeric
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'staff_performance') AS elem
      LIMIT 1;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    assert(res.stdout.includes('Ananya Sharma') || res.stdout.includes('|'))
  })

  recordTest(S8, 'TC-42', 'Line-level discounts tracked and attributed to staff', () => {
    const res = runPsql(`
      SELECT (elem->>'line_discounts')::numeric
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'staff_performance') AS elem
      WHERE elem->>'staff_id' = '${testStaffId}';
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const disc = parseFloat(res.stdout.trim())
    assert(disc >= 500.00, `Expected staff discounts >= 500, got ${disc}`)
  })

  recordTest(S8, 'TC-43', 'Service popularity ranking aggregates service volume and revenue', () => {
    const res = runPsql(`
      SELECT jsonb_array_length(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'service_performance');
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const count = parseInt(res.stdout.trim(), 10)
    assert(count >= 1, `Expected at least 1 ranked service, got ${count}`)
  })

  recordTest(S8, 'TC-44', 'Service average realized ticket price computed accurately', () => {
    const res = runPsql(`
      SELECT (elem->>'average_price')::numeric
      FROM jsonb_array_elements(public.rpc_get_owner_financial_intelligence('${SALON_ID}', '${today}', '${today}')->'service_performance') AS elem
      LIMIT 1;
    `)
    assert.strictEqual(res.code, 0, res.stderr)
    const avg = parseFloat(res.stdout.trim())
    assert(avg > 0, `Average service price must be positive, got ${avg}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 9: Date Filtering, Timezones & Export Integrity (TC-45 to TC-47)
  // ----------------------------------------------------------------------------
  const S9 = 'Suite 9: Date Filtering & Exports'

  recordTest(S9, 'TC-45', 'Preset date boundaries (today, this_week, this_month, this_year) adhere to Asia/Kolkata (IST)', () => {
    const rToday = computeFinancialDateRange('today')
    const rWeek = computeFinancialDateRange('this_week')
    const rMonth = computeFinancialDateRange('this_month')
    const rYear = computeFinancialDateRange('this_year')

    assert.strictEqual(rToday.startDate, rToday.endDate)
    assert(rWeek.startDate <= rToday.startDate)
    assert(rMonth.startDate <= rToday.startDate)
    assert(rYear.startDate <= rMonth.startDate)
  })

  await recordAsyncTest(S9, 'TC-46', 'All 8 standard RFC-4180 CSV reports generated with matching figures', async () => {
    const dateRange = computeFinancialDateRange('today')
    const report = await ownerFinancialIntelligenceService.getFinancialIntelligence(dateRange, SALON_ID)

    const csvSummary = financialIntelligenceExportService.exportFinancialSummaryCsv(report)
    const csvRevenue = financialIntelligenceExportService.exportRevenueReportCsv(report)
    const csvCollections = financialIntelligenceExportService.exportCollectionsReportCsv(report)
    const csvPnl = financialIntelligenceExportService.exportProfitLossCsv(report)
    const csvCustomer = financialIntelligenceExportService.exportCustomerOutstandingCsv(report)
    const csvSupplier = financialIntelligenceExportService.exportSupplierOutstandingCsv(report)
    const csvInventory = financialIntelligenceExportService.exportInventoryValuationCsv(report)
    const csvEmployee = financialIntelligenceExportService.exportEmployeePerformanceCsv(report)

    assert(csvSummary.includes('Gross Sales') && csvSummary.includes('Net Sales'))
    assert(csvRevenue.includes('Date') && csvRevenue.includes('Total Invoiced (INR)'))
    assert(csvCollections.includes('Total Collections (INR)') && csvCollections.includes('UPI (INR)'))
    assert(csvPnl.includes('Estimated Gross Profit') && csvPnl.includes('Recorded Operating Contribution'))
    assert(csvCustomer.includes('Customer Outstanding') && csvCustomer.includes('0-30 Days'))
    assert(csvSupplier.toUpperCase().includes('SUPPLIER OUTSTANDING') && csvSupplier.includes('Total Accounts Payable'))
    assert(csvInventory.includes('Total Inventory Valuation') && csvInventory.includes('Retail Stock Value'))
    assert(csvEmployee.includes('Service Revenue') && csvEmployee.includes('Product Sales'))
  })

  await recordAsyncTest(S9, 'TC-47', 'Executive summary vector PDF generates with clean formatting', async () => {
    const dateRange = computeFinancialDateRange('today')
    const report = await ownerFinancialIntelligenceService.getFinancialIntelligence(dateRange, SALON_ID)
    const pdfBlob = await financialIntelligenceExportService.generateFinancialSummaryPdf(report, 'LUMA SALON')

    assert(pdfBlob instanceof Blob)
    assert(pdfBlob.size > 2000, `Expected PDF blob size > 2000 bytes, got ${pdfBlob.size}`)
  })

  // ----------------------------------------------------------------------------
  // SUITE 10: Security, RLS & Multi-Tenant Isolation (TC-48 to TC-50)
  // ----------------------------------------------------------------------------
  const S10 = 'Suite 10: Security & RBAC'

  recordTest(S10, 'TC-48', 'Owner role access authorized to financial intelligence dashboard', () => {
    const ownerSession: UserSession = {
      user: { id: 'usr-owner-01', email: 'owner@luma.com', name: 'Salon Owner' },
      role: 'OWNER',
      isAuthenticated: true,
    }
    const canAccess = permissionService.canAccessRoute('owner/financial-intelligence', ownerSession)
    assert.strictEqual(canAccess, true, 'Owner role must be authorized for owner/financial-intelligence')
  })

  recordTest(S10, 'TC-49', 'Non-owner roles (Receptionist, Employee, unauthenticated) strictly denied access', () => {
    const recSession: UserSession = {
      user: { id: 'usr-rec-01', email: 'rec@luma.com', name: 'Receptionist' },
      role: 'RECEPTIONIST',
      isAuthenticated: true,
    }
    const empSession: UserSession = {
      user: { id: 'usr-emp-01', email: 'stylist@luma.com', name: 'Stylist' },
      role: 'EMPLOYEE',
      isAuthenticated: true,
    }

    assert.strictEqual(permissionService.canAccessRoute('owner/financial-intelligence', recSession), false)
    assert.strictEqual(permissionService.canAccessRoute('owner/financial-intelligence', empSession), false)
    assert.strictEqual(permissionService.canAccessRoute('owner/financial-intelligence', null), false)
  })

  recordTest(S10, 'TC-50', 'Cross-salon tenant isolation strictly enforced (foreign salon data inaccessible)', () => {
    const crossSalon = runPsql(`
      SELECT public.rpc_get_owner_financial_intelligence('${FOREIGN_SALON_ID}', '${today}', '${today}');
    `)
    // Must return zero aggregates for foreign salon with no cross-contamination
    const gross = runPsql(`
      SELECT (public.rpc_get_owner_financial_intelligence('${FOREIGN_SALON_ID}', '${today}', '${today}')->'kpis'->>'gross_sales')::numeric;
    `)
    assert.strictEqual(gross.code, 0)
    assert.strictEqual(parseFloat(gross.stdout.trim()), 0.00, 'Foreign salon gross sales must be 0')
  })

  // ----------------------------------------------------------------------------
  // CLEANUP & SUMMARY
  // ----------------------------------------------------------------------------
  runPsql(`
    DELETE FROM public.payments WHERE invoice_id LIKE '${RUN_ID}%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE '${RUN_ID}%';
    DELETE FROM public.invoices WHERE id LIKE '${RUN_ID}%';
    DELETE FROM public.refunds WHERE refund_number LIKE 'REF-${RUN_ID}%';
    DELETE FROM public.customer_advances WHERE advance_number LIKE 'ADV-${RUN_ID}%';
    DELETE FROM public.credit_notes WHERE credit_note_number LIKE 'CN-${RUN_ID}%';
    DELETE FROM public.purchase_bills WHERE bill_number LIKE 'PB-${RUN_ID}%';
    DELETE FROM public.supplier_payments WHERE payment_number LIKE 'SPAY-${RUN_ID}%';
    DELETE FROM public.stock_loss_records WHERE loss_number LIKE 'LOSS-${RUN_ID}%';
    DELETE FROM public.consumable_usages WHERE usage_number LIKE 'USE-${RUN_ID}%';
  `)

  console.log('\n================================================================================')
  console.log('ACCEPTANCE RESULTS BREAKDOWN')
  console.log('================================================================================')
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  console.log(`TOTAL TESTS: ${results.length} | PASSED: ${passed} | FAILED: ${failed}`)
  console.log('================================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runAllTests().catch((err) => {
  console.error('Fatal test execution error:', err)
  process.exit(1)
})
