// ==============================================================================
// LUMA SALON — PHASE 2.1 REMEDIATION VERIFICATION SUITE
// Real PostgreSQL 18.6 Concurrency, Security, POS Engine & Immutability Verification
// ==============================================================================

import { execSync } from 'node:child_process'
import assert from 'node:assert'
import { calculateInvoiceFinancials } from '../src/services/billingService.ts'
import type { InvoiceLineItem } from '../src/types/finance.ts'

const PSQL_BIN = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
const DB_HOST = 'localhost'
const DB_PORT = '5433'
const DB_USER = 'postgres'
const DB_NAME = 'luma_test'

interface TestResult {
  id: string
  name: string
  status: 'PASS' | 'FAIL'
  details: string
}

const results: TestResult[] = []

function runPsql(sql: string, userJwtSub?: string, dbRole: 'postgres' | 'authenticated' | 'anon' = 'postgres'): { stdout: string; stderr: string; code: number } {
  let setupSql = ''
  if (userJwtSub) {
    setupSql += `SET request.jwt.claim.sub = '${userJwtSub}';\n`
  }
  if (dbRole !== 'postgres') {
    setupSql += `SET ROLE ${dbRole};\n`
  }

  const fullSql = `${setupSql}${sql}`
  try {
    const stdout = execSync(
      `"${PSQL_BIN}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -X -t -A -v ON_ERROR_STOP=1`,
      { input: fullSql, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    return { stdout, stderr: '', code: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      code: err.status || 1,
    }
  }
}

async function runTest(id: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    results.push({ id, name, status: 'PASS', details: 'OK' })
    console.log(`  ✅ [${id}] ${name}: PASS`)
  } catch (err: any) {
    results.push({ id, name, status: 'FAIL', details: err.message })
    console.log(`  ❌ [${id}] ${name}: FAIL -> ${err.message}`)
  }
}

async function main() {
  console.log('\n========================================================================')
  console.log('🏛️ LUMA SALON: PHASE 2.1 CRITICAL BILLING REMEDIATION VERIFICATION')
  console.log(`Database: PostgreSQL (Host: ${DB_HOST}, Port: ${DB_PORT}, DB: ${DB_NAME})`)
  console.log('========================================================================\n')

  // Clean any previous test data
  runPsql(`
    SET session_replication_role = 'replica';
    DELETE FROM public.payments WHERE invoice_id LIKE 'inv-p21-%' OR invoice_id LIKE 'draft-p21-%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE 'inv-p21-%' OR invoice_id LIKE 'draft-p21-%';
    DELETE FROM public.invoices WHERE id LIKE 'inv-p21-%' OR id LIKE 'draft-p21-%';
  `)

  // --------------------------------------------------------------------------
  // SUITE 1: WALK-IN GUEST INVOICE CREATION & DATABASE PERSISTENCE
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Walk-in Guest & Product Billing Persistence ---')

  await runTest('P21-01', 'Walk-in guest invoice persisted with client_id = NULL in PostgreSQL', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        'inv-p21-walkin-1',
        'salon-luma-01',
        NULL, -- client_id is NULL for walk-in
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Hair Styling',
        NULL,
        CURRENT_DATE,
        1000.00,
        0.00,
        NULL,
        NULL,
        0.18,
        180.00,
        90.00,
        90.00,
        1180.00,
        'cash',
        true,
        'exclusive',
        true,
        'Walk-in test note',
        NULL,
        'idemp-p21-01',
        '[{"id": "li-p21-1", "description": "Hair Styling", "quantity": 1, "unit_price": 1000.00, "total_price": 1000.00, "item_type": "service", "tax_rate": 0.18, "tax_amount": 180.00}]'::jsonb,
        '[{"id": "pmt-p21-1", "payment_method": "cash", "amount": 1180.00}]'::jsonb
      );
    `)

    assert.strictEqual(res.code, 0, `SQL error: ${res.stderr}`)
    const json = JSON.parse(res.stdout.trim())
    assert.strictEqual(json.id, 'inv-p21-walkin-1')
    assert.strictEqual(json.client_id, null)
    assert.strictEqual(json.walk_in_guest, true)
    assert.strictEqual(json.paid_amount, 1180)
    assert.strictEqual(json.balance_due, 0)
    assert.strictEqual(json.payment_status, 'paid')
  })

  // --------------------------------------------------------------------------
  // SUITE 2: MULTI-TENDER SPLIT PAYMENTS & RECONCILIATION
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Multi-Tender Split Payments & Ledger Integrity ---')

  await runTest('P21-02', 'Split payment across Cash, UPI, and Card persists individual tender rows', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        'inv-p21-split-1',
        'salon-luma-01',
        NULL,
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Bridal Trial',
        NULL,
        CURRENT_DATE,
        5000.00,
        0.00,
        NULL,
        NULL,
        0.18,
        900.00,
        450.00,
        450.00,
        5900.00,
        'split',
        true,
        'exclusive',
        true,
        'Split payment test',
        NULL,
        'idemp-p21-02',
        '[{"id": "li-p21-split-1", "description": "Bridal Trial", "quantity": 1, "unit_price": 5000.00, "total_price": 5000.00, "item_type": "service", "tax_rate": 0.18, "tax_amount": 900.00}]'::jsonb,
        '[{"id": "pmt-p21-sp1", "payment_method": "cash", "amount": 2000.00}, {"id": "pmt-p21-sp2", "payment_method": "upi", "amount": 2500.00, "transaction_reference": "UPI-REF-99"}, {"id": "pmt-p21-sp3", "payment_method": "card", "amount": 1400.00, "transaction_reference": "CARD-4242"}]'::jsonb
      );
    `)

    assert.strictEqual(res.code, 0, `SQL error: ${res.stderr}`)
    const json = JSON.parse(res.stdout.trim())
    assert.strictEqual(json.primary_payment_method, 'split')
    assert.strictEqual(json.payments.length, 3, 'Must record all 3 split payment tenders')

    // Verify in database payments table
    const checkDb = runPsql(`
      SELECT payment_method, amount FROM public.payments WHERE invoice_id = 'inv-p21-split-1' ORDER BY amount DESC;
    `)
    assert(checkDb.stdout.includes('upi'), 'Database must contain UPI payment record')
    assert(checkDb.stdout.includes('cash'), 'Database must contain Cash payment record')
    assert(checkDb.stdout.includes('card'), 'Database must contain Card payment record')
  })

  // --------------------------------------------------------------------------
  // SUITE 3: DRAFT INVOICE PERSISTENCE & CONVERSION IN POSTGRESQL
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Database-Backed Draft Lifecycle ---')

  await runTest('P21-03', 'Draft invoice persists in PostgreSQL with payment_status = draft and is_draft = true', () => {
    const res = runPsql(`
      SELECT public.rpc_save_pos_draft(
        'draft-p21-01',
        'salon-luma-01',
        NULL,
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Keratin Treatment',
        NULL,
        CURRENT_DATE,
        4000.00,
        0.00,
        NULL,
        NULL,
        0.18,
        720.00,
        360.00,
        360.00,
        4720.00,
        'cash',
        true,
        'exclusive',
        true,
        'Draft test',
        NULL,
        NULL,
        '[{"id": "li-p21-d1", "description": "Keratin Treatment", "quantity": 1, "unit_price": 4000.00, "total_price": 4000.00, "item_type": "service", "tax_rate": 0.18, "tax_amount": 720.00}]'::jsonb
      );
    `)

    assert.strictEqual(res.code, 0, `SQL error: ${res.stderr}`)
    const json = JSON.parse(res.stdout.trim())
    assert.strictEqual(json.is_draft, true)
    assert.strictEqual(json.payment_status, 'draft')
    assert.strictEqual(json.paid_amount, 0)
    assert.strictEqual(json.balance_due, 4720)
    assert(json.invoice_number.startsWith('DFT-'), 'Draft number must start with DFT-')
  })

  await runTest('P21-04', 'Draft invoice is atomically converted to finalized tax invoice with official INV sequence', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        'draft-p21-01',
        'salon-luma-01',
        NULL,
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Keratin Treatment',
        NULL,
        CURRENT_DATE,
        4000.00,
        0.00,
        NULL,
        NULL,
        0.18,
        720.00,
        360.00,
        360.00,
        4720.00,
        'card',
        true,
        'exclusive',
        true,
        'Finalized from draft',
        NULL,
        'idemp-p21-04',
        '[{"id": "li-p21-d1-final", "description": "Keratin Treatment", "quantity": 1, "unit_price": 4000.00, "total_price": 4000.00, "item_type": "service", "tax_rate": 0.18, "tax_amount": 720.00}]'::jsonb,
        '[{"id": "pmt-p21-d1", "payment_method": "card", "amount": 4720.00, "transaction_reference": "POS-CARD-777"}]'::jsonb
      );
    `)

    assert.strictEqual(res.code, 0, `SQL error: ${res.stderr}`)
    const json = JSON.parse(res.stdout.trim())
    assert.strictEqual(json.is_draft, false, 'Invoice must no longer be marked as draft')
    assert.strictEqual(json.payment_status, 'paid', 'Status must be paid')
    assert.strictEqual(json.paid_amount, 4720)
    assert.strictEqual(json.balance_due, 0)
    assert(json.invoice_number.startsWith('INV-'), `Invoice number must follow production sequence: ${json.invoice_number}`)
  })

  // --------------------------------------------------------------------------
  // SUITE 4: SECURITY DISCOUNT AUTHORIZATION ENFORCEMENT
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Discount Security Gate & Owner Authorization ---')

  await runTest('P21-05', 'Discounts > 10% without authorized_by are rejected by PostgreSQL', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        'inv-p21-disc-fail',
        'salon-luma-01',
        NULL,
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Haircut',
        NULL,
        CURRENT_DATE,
        2000.00,
        500.00, -- 25% discount
        'percentage',
        'Unauthorized Promo',
        0.18,
        270.00,
        135.00,
        135.00,
        1770.00,
        'cash',
        true,
        'exclusive',
        true,
        'Attempt unauthorized discount',
        NULL, -- authorized_by is NULL!
        'idemp-p21-05',
        '[{"description": "Haircut", "quantity": 1, "unit_price": 2000.00, "total_price": 2000.00}]'::jsonb,
        '[{"payment_method": "cash", "amount": 1770.00}]'::jsonb
      );
    `)

    assert.notStrictEqual(res.code, 0, 'Database must reject unauthorized discount')
    assert(res.stderr.includes('Discounts exceeding 10% require salon owner authorization'))
  })

  await runTest('P21-06', 'Discounts > 10% with valid authorized_by are accepted and recorded', () => {
    // Phase 2.2: Request genuine Owner authorization grant first
    const grantRes = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        'salon-luma-01',
        'inv-p21-disc-pass',
        'owner@lumasalon.com',
        'Luma@2026!',
        2000.00,
        500.00,
        25.0
      );
    `)
    assert.strictEqual(grantRes.code, 0, `Grant error: ${grantRes.stderr}`)
    const grantId = JSON.parse(grantRes.stdout.trim()).grant_id

    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        'inv-p21-disc-pass',
        'salon-luma-01',
        NULL,
        'Walk-in Guest',
        NULL,
        NULL,
        'staff-1',
        'Mia Patel',
        NULL,
        'Haircut',
        NULL,
        CURRENT_DATE,
        2000.00,
        500.00, -- 25% discount
        'percentage',
        'VIP Referral Offer',
        0.18,
        270.00,
        135.00,
        135.00,
        1770.00,
        'cash',
        true,
        'exclusive',
        true,
        'Authorized discount',
        NULL,
        'idemp-p21-06',
        '[{"description": "Haircut", "quantity": 1, "unit_price": 2000.00, "total_price": 2000.00}]'::jsonb,
        '[{"payment_method": "cash", "amount": 1770.00}]'::jsonb,
        '${grantId}'
      );
    `)

    assert.strictEqual(res.code, 0, `SQL error: ${res.stderr}`)
    const json = JSON.parse(res.stdout.trim())
    assert.strictEqual(json.authorized_by, 'usr-owner')
    assert.strictEqual(json.discount_amount, 500)
    assert.strictEqual(json.total_amount, 1770)
  })

  // --------------------------------------------------------------------------
  // SUITE 5: IMMUTABILITY & OVERPAYMENT REJECTION
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Immutability & Overpayment Protections ---')

  await runTest('P21-07', 'Modifying or appending line items on finalized invoice is strictly rejected', () => {
    const res = runPsql(`
      INSERT INTO public.invoice_line_items (id, salon_id, invoice_id, description, quantity, unit_price, total_price)
      VALUES ('li-tamper-p21', 'salon-luma-01', 'inv-p21-walkin-1', 'Tampered Service', 1, 500.00, 500.00);
    `)

    assert.notStrictEqual(res.code, 0, 'Must block line item insert on finalized invoice')
    assert(res.stderr.includes('Cannot modify or append line items on a finalized or cancelled invoice'))
  })

  await runTest('P21-08', 'Overpayment exceeding balance due is rejected by database trigger', () => {
    const res = runPsql(`
      INSERT INTO public.payments (id, salon_id, invoice_id, payment_method, amount)
      VALUES ('pmt-overpay', 'salon-luma-01', 'inv-p21-walkin-1', 'cash', 100.00);
    `)

    assert.notStrictEqual(res.code, 0, 'Must block overpayment')
    assert(res.stderr.includes('exceeds invoice balance due'))
  })

  // --------------------------------------------------------------------------
  // SUITE 6: PER-LINE TAX & PROPORTIONAL INVOICE DISCOUNT MATH
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Per-Line Tax & Proportional Discount Math ---')

  await runTest('P21-09', 'Per-line tax calculation handles mixed tax rates (18% & 5%) and proportional discount with 0 penny discrepancy', () => {
    const sampleLineItems: InvoiceLineItem[] = [
      {
        id: 'li-item-1',
        description: 'Salon Service (18% GST)',
        quantity: 1,
        unitPrice: 1000.00,
        totalPrice: 1000.00,
        itemType: 'service',
        taxRate: 0.18,
      },
      {
        id: 'li-item-2',
        description: 'Retail Hair Care Product (5% GST)',
        quantity: 2,
        unitPrice: 500.00,
        totalPrice: 1000.00,
        itemType: 'product',
        taxRate: 0.05,
      },
    ]

    // Subtotal = 2000. Discount = 200 (10%). Net discounted subtotal = 1800.
    // Line 1: 1000 gross -> 100 discount share -> 900 net -> 18% tax on 900 = 162.00
    // Line 2: 1000 gross -> 100 discount share -> 900 net -> 5% tax on 900 = 45.00
    // Total Tax = 162.00 + 45.00 = 207.00.
    // CGST = 103.50, SGST = 103.50.
    // Grand Total = 1800 + 207 = 2007.00.
    const result = calculateInvoiceFinancials({
      subtotal: 2000.00,
      discountAmount: 200.00,
      isGstInvoice: true,
      taxTreatment: 'exclusive',
      lineItems: sampleLineItems,
    })

    assert.strictEqual(result.subtotal, 2000.00)
    assert.strictEqual(result.discountAmount, 200.00)
    assert.strictEqual(result.discountedSubtotal, 1800.00)
    assert.strictEqual(result.taxAmount, 207.00, 'Tax amount must exactly match sum of per-line taxes (162 + 45)')
    assert.strictEqual(result.cgstAmount, 103.50)
    assert.strictEqual(result.sgstAmount, 103.50)
    assert.strictEqual(result.totalAmount, 2007.00)

    // Check per-line item outputs
    assert.strictEqual(result.lineItems[0].discountAmount, 100.00)
    assert.strictEqual(result.lineItems[0].taxAmount, 162.00)
    assert.strictEqual(result.lineItems[1].discountAmount, 100.00)
    assert.strictEqual(result.lineItems[1].taxAmount, 45.00)
  })

  // Cleanup test data
  runPsql(`
    SET session_replication_role = 'replica';
    DELETE FROM public.payments WHERE invoice_id LIKE 'inv-p21-%' OR invoice_id LIKE 'draft-p21-%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE 'inv-p21-%' OR invoice_id LIKE 'draft-p21-%';
    DELETE FROM public.invoices WHERE id LIKE 'inv-p21-%' OR id LIKE 'draft-p21-%';
  `)

  console.log('\n========================================================================')
  console.log('📊 VERIFICATION SUMMARY')
  console.log('========================================================================')
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`  PASSED: ${passed} of ${results.length}`)
  console.log(`  FAILED: ${failed}`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
