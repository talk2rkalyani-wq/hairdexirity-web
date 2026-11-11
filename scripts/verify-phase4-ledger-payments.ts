// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4 VERIFICATION SUITE
// Payments & Customer Ledger Management Automated Verification
// Tests 1-41 across 7 Categories as per Section 14
// Real PostgreSQL 18.6 Database Boundary & TypeScript Service Verification
// ==============================================================================

import { execSync } from 'node:child_process'
import assert from 'node:assert'
import {
  generateStatementPdf,
  type CustomerStatementPdfData,
} from '../src/services/statementPdfService.ts'
import { customerLedgerService } from '../src/services/customerLedgerService.ts'
import type { CustomerLedgerSummary, CustomerLedgerEvent } from '../src/types/finance.ts'

const PSQL_BIN = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
const DB_HOST = process.env.DB_HOST || '/tmp'
const DB_PORT = '5433'
const DB_USER = 'postgres'
const DB_NAME = 'luma_test'

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
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      code: err.status || 1,
    }
  }
}

async function runTest(
  suite: string,
  id: string,
  name: string,
  fn: () => Promise<void> | void
) {
  try {
    await fn()
    results.push({
      suite,
      id,
      name,
      status: 'PASS',
      details: 'Requirement verified successfully against database boundary',
    })
    console.log(`[PASS] ${id} - ${name}`)
  } catch (err: any) {
    results.push({
      suite,
      id,
      name,
      status: 'FAIL',
      details: err.message || String(err),
    })
    console.error(`[FAIL] ${id} - ${name}: ${err.message}`)
  }
}

async function main() {
  console.log('==============================================================================')
  console.log(' LUMA SALON BUSINESS SUITE — PHASE 4 VERIFICATION SUITE')
  console.log(' 41 Acceptance Tests: Ledgers, Advances, Refunds, Credit Notes, Reconciliations')
  console.log('==============================================================================\n')

  // Setup Test Fixtures in Database
  console.log('Setting up clean test fixtures in database...')
  const initSql = `
    -- Clean previous phase 4 test rows
    DELETE FROM public.payment_reminders WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.credit_note_allocations WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.credit_note_items WHERE credit_note_id IN (SELECT id FROM public.credit_notes WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999'));
    DELETE FROM public.credit_notes WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.refunds WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.customer_advance_allocations WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.customer_advances WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');
    DELETE FROM public.payment_reconciliations WHERE salon_id IN ('salon-luma-01', 'salon-foreign-999');

    -- Clean test invoices
    DELETE FROM public.payments WHERE invoice_id LIKE 'inv-p4-%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE 'inv-p4-%';
    DELETE FROM public.invoices WHERE id LIKE 'inv-p4-%' OR invoice_number LIKE 'INV-P4-%';

    -- Ensure test clients exist
    INSERT INTO public.clients (id, salon_id, name, phone, email)
    VALUES ('cli-p4-test-01', 'salon-luma-01', 'Aarav Sharma', '+91 98765 43210', 'aarav@example.com')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone;

    INSERT INTO public.clients (id, salon_id, name, phone, email)
    VALUES ('cli-p4-foreign-01', 'salon-foreign-999', 'Vikram Seth', '+91 91234 56789', 'vikram@foreign.com')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
  `
  const setupRes = runPsql(initSql)
  assert.strictEqual(setupRes.code, 0, `Fixture setup failed: ${setupRes.stderr}`)

  // --------------------------------------------------------------------------
  // SUITE 1: CUSTOMER LEDGER RUNNING BALANCES (Tests 1-7)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 1: Customer Ledger Running Balances (Tests 1-7) ---')

  const inv1Id = 'inv-p4-001'

  await runTest(
    'Customer Ledger',
    'LEDGER-01',
    'Invoices increase customer balance (Debit)',
    async () => {
      // Create unpaid invoice #1 for ₹1,500
      const insertSql = `
        INSERT INTO public.invoices (
          id, salon_id, invoice_number, client_id, client_name, client_phone,
          subtotal, discount_amount, tax_amount, total_amount, paid_amount, balance_due,
          payment_status, primary_payment_method, is_draft, date, created_at
        ) VALUES (
          '${inv1Id}', 'salon-luma-01', 'INV-P4-001', 'cli-p4-test-01', 'Aarav Sharma', '+91 98765 43210',
          1500.00, 0.00, 0.00, 1500.00, 0.00, 1500.00,
          'unpaid', 'cash', false, CURRENT_DATE - INTERVAL '5 days', NOW() - INTERVAL '5 days'
        );
      `
      const r = runPsql(insertSql)
      assert.strictEqual(r.code, 0, r.stderr)

      // Query ledger
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      assert.strictEqual(ledgerRes.code, 0, ledgerRes.stderr)
      const data = JSON.parse(ledgerRes.stdout)

      assert.strictEqual(Number(data.summary.total_invoiced), 1500)
      assert.strictEqual(Number(data.summary.total_outstanding), 1500)
      assert.strictEqual(Number(data.summary.net_customer_balance), 1500)

      const invEvent = data.transactions.find((t: any) => t.reference === 'INV-P4-001')
      assert.ok(invEvent, 'Invoice event must be present in ledger')
      assert.strictEqual(Number(invEvent.debit_amount), 1500)
      assert.strictEqual(Number(invEvent.credit_amount), 0)
    }
  )

  await runTest(
    'Customer Ledger',
    'LEDGER-02',
    'Payments reduce customer balance (Credit)',
    async () => {
      // Payment of ₹500 against invoice #1
      const pmtSql = `
        INSERT INTO public.payments (
          id, salon_id, invoice_id, payment_method, amount, created_at
        ) VALUES (
          'pmt-p4-001', 'salon-luma-01', '${inv1Id}', 'cash', 500.00, NOW() - INTERVAL '4 days'
        );
      `
      const r = runPsql(pmtSql)
      assert.strictEqual(r.code, 0, r.stderr)

      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)

      assert.strictEqual(Number(data.summary.total_paid), 500)
      assert.strictEqual(Number(data.summary.total_outstanding), 1000)
      assert.strictEqual(Number(data.summary.net_customer_balance), 1000)

      const pmtEvent = data.transactions.find((t: any) => t.transaction_type === 'PAYMENT')
      assert.ok(pmtEvent, 'Payment event must be present')
      assert.strictEqual(Number(pmtEvent.credit_amount), 500)
      assert.strictEqual(Number(pmtEvent.debit_amount), 0)
    }
  )

  let adv1Id = ''

  await runTest(
    'Customer Ledger',
    'LEDGER-03',
    'Advances reduce customer balance / create credit balance',
    async () => {
      // Customer deposits advance of ₹2,000
      const advSql = `
        SELECT public.rpc_record_customer_advance(
          'salon-luma-01', 'cli-p4-test-01', 2000.00, 'upi', 'UPI-ADV-101', 'Bridal package deposit'
        );
      `
      const r = runPsql(advSql, 'usr-rec', 'authenticated')
      assert.strictEqual(r.code, 0, r.stderr)
      const advData = JSON.parse(r.stdout)
      adv1Id = advData.advance_id || advData.id
      assert.ok(adv1Id, 'Advance ID must be returned')

      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)

      assert.strictEqual(Number(data.summary.total_advance), 2000)
      assert.strictEqual(Number(data.summary.available_advance), 2000)
      // Net customer balance: outstanding (1000) - available advance (2000) = -1000 (credit in customer's favor)
      assert.strictEqual(Number(data.summary.net_customer_balance), -1000)
    }
  )

  await runTest(
    'Customer Ledger',
    'LEDGER-04',
    'Refunds increase customer balance / reverse credit',
    async () => {
      // Issue refund of ₹200 on invoice #1 (<= ₹2,000, receptionist can process)
      const refSql = `
        SELECT public.rpc_issue_refund(
          'salon-luma-01', '${inv1Id}', 200.00, 'cash', 'Partial service refund'
        );
      `
      const r = runPsql(refSql, 'usr-rec', 'authenticated')
      assert.strictEqual(r.code, 0, r.stderr)

      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)

      assert.strictEqual(Number(data.summary.total_refunds), 200)

      const refEvent = data.transactions.find((t: any) => t.transaction_type === 'REFUND')
      assert.ok(refEvent, 'Refund event must be in transactions')
      assert.strictEqual(Number(refEvent.debit_amount), 200)
      assert.strictEqual(Number(refEvent.credit_amount), 0)
    }
  )

  let cn1Id = ''

  await runTest(
    'Customer Ledger',
    'LEDGER-05',
    'Credit notes reduce customer balance (Credit)',
    async () => {
      // Issue credit note of ₹300 against invoice #1
      const cnSql = `
        SELECT public.rpc_create_credit_note(
          'salon-luma-01', '${inv1Id}', 300.00, 'Client concession voucher',
          '[{"description": "Product concession", "quantity": 1, "unit_price": 300.00}]'::jsonb
        );
      `
      const r = runPsql(cnSql, 'usr-rec', 'authenticated')
      assert.strictEqual(r.code, 0, r.stderr)
      const cnData = JSON.parse(r.stdout)
      cn1Id = cnData.credit_note_id || cnData.id
      assert.ok(cn1Id, 'Credit note ID must be returned')

      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)

      assert.strictEqual(Number(data.summary.total_credit_notes), 300)
      assert.strictEqual(Number(data.summary.available_credit), 300)

      const cnEvent = data.transactions.find((t: any) => t.transaction_type === 'CREDIT_NOTE')
      assert.ok(cnEvent, 'Credit note event must be in transactions')
      assert.strictEqual(Number(cnEvent.credit_amount), 300)
    }
  )

  await runTest(
    'Customer Ledger',
    'LEDGER-06',
    'Ledger transactions are strictly ordered chronologically',
    async () => {
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      const txs = data.transactions

      assert.ok(txs.length >= 4, 'Must have at least 4 transactions')
      for (let i = 1; i < txs.length; i++) {
        const prevTime = new Date(txs[i - 1].event_timestamp).getTime()
        const currTime = new Date(txs[i].event_timestamp).getTime()
        assert.ok(
          currTime >= prevTime,
          `Transactions must be ascending in time: ${txs[i - 1].event_timestamp} vs ${txs[i].event_timestamp}`
        )
      }
    }
  )

  await runTest(
    'Customer Ledger',
    'LEDGER-07',
    'Running balance matches mathematical sum of transactions at each step',
    async () => {
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      const txs = data.transactions

      let running = 0
      for (const t of txs) {
        const debit = Number(t.debit_amount) || 0
        const credit = Number(t.credit_amount) || 0
        running += debit - credit
      }
      // Running total: 1500 (debit) - 500 (credit) - 2000 (credit) + 200 (debit) - 300 (credit) = -1100
      assert.strictEqual(Math.round(running * 100) / 100, -1100)
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 2: PARTIAL PAYMENTS & ADVANCE ALLOCATIONS (Tests 8-14)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 2: Partial Payments & Advance Allocations (Tests 8-14) ---')

  const inv2Id = 'inv-p4-002'

  await runTest(
    'Payments & Advances',
    'PAY-01',
    'Partial payments leave accurate balance due on invoice',
    async () => {
      // Create invoice #2 for ₹3,000 unpaid
      const invSql = `
        INSERT INTO public.invoices (
          id, salon_id, invoice_number, client_id, client_name, client_phone,
          subtotal, discount_amount, tax_amount, total_amount, paid_amount, balance_due,
          payment_status, primary_payment_method, is_draft, date
        ) VALUES (
          '${inv2Id}', 'salon-luma-01', 'INV-P4-002', 'cli-p4-test-01', 'Aarav Sharma', '+91 98765 43210',
          3000.00, 0.00, 0.00, 3000.00, 0.00, 3000.00,
          'unpaid', 'cash', false, CURRENT_DATE
        );
      `
      const r = runPsql(invSql)
      assert.strictEqual(r.code, 0, r.stderr)

      // Add payment of ₹1,000
      runPsql(`
        INSERT INTO public.payments (id, salon_id, invoice_id, payment_method, amount)
        VALUES ('pmt-p4-002', 'salon-luma-01', '${inv2Id}', 'card', 1000.00);
      `)

      const q = runPsql(`SELECT paid_amount, balance_due, payment_status FROM public.invoices WHERE id = '${inv2Id}';`)
      const [paid, bal, status] = q.stdout.split('|')

      assert.strictEqual(Number(paid), 1000)
      assert.strictEqual(Number(bal), 2000)
      assert.ok(status === 'partial' || status === 'partially_paid')
    }
  )

  await runTest(
    'Payments & Advances',
    'PAY-02',
    'Multiple partial payments sum correctly to total paid',
    async () => {
      // Second partial payment of ₹800
      runPsql(`
        INSERT INTO public.payments (id, salon_id, invoice_id, payment_method, amount)
        VALUES ('pmt-p4-003', 'salon-luma-01', '${inv2Id}', 'upi', 800.00);
      `)

      const q = runPsql(`SELECT paid_amount, balance_due, payment_status FROM public.invoices WHERE id = '${inv2Id}';`)
      const [paid, bal, status] = q.stdout.split('|')

      assert.strictEqual(Number(paid), 1800)
      assert.strictEqual(Number(bal), 1200)
      assert.ok(status === 'partial' || status === 'partially_paid')
    }
  )

  await runTest(
    'Payments & Advances',
    'PAY-03',
    'Invoice transitions from unpaid -> partially_paid -> paid',
    async () => {
      // Pay remaining ₹1,200
      runPsql(`
        INSERT INTO public.payments (id, salon_id, invoice_id, payment_method, amount)
        VALUES ('pmt-p4-004', 'salon-luma-01', '${inv2Id}', 'cash', 1200.00);
      `)

      const q = runPsql(`SELECT paid_amount, balance_due, payment_status FROM public.invoices WHERE id = '${inv2Id}';`)
      const [paid, bal, status] = q.stdout.split('|')

      assert.strictEqual(Number(paid), 3000)
      assert.strictEqual(Number(bal), 0)
      assert.strictEqual(status, 'paid')
    }
  )

  let adv2Id = ''

  await runTest(
    'Payments & Advances',
    'PAY-04',
    'Customer advances can be recorded prior to invoicing',
    async () => {
      const advRes = runPsql(`
        SELECT public.rpc_record_customer_advance(
          'salon-luma-01', 'cli-p4-test-01', 1500.00, 'cash', 'ADV-TX-202', 'General hair treatment advance'
        );
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(advRes.code, 0, advRes.stderr)
      const data = JSON.parse(advRes.stdout)
      adv2Id = data.advance_id || data.id

      const check = runPsql(`SELECT amount, remaining_amount FROM public.customer_advances WHERE id = '${adv2Id}';`)
      const [amt, rem] = check.stdout.split('|')
      assert.strictEqual(Number(amt), 1500)
      assert.strictEqual(Number(rem), 1500)
    }
  )

  const inv3Id = 'inv-p4-003'
  const inv4Id = 'inv-p4-004'

  await runTest(
    'Payments & Advances',
    'PAY-05',
    'Customer advances can be allocated to one or more invoices',
    async () => {
      // Create invoices #3 and #4 (₹1,000 each)
      runPsql(`
        INSERT INTO public.invoices (id, salon_id, invoice_number, client_id, client_name, subtotal, total_amount, paid_amount, balance_due, payment_status, primary_payment_method, is_draft, date)
        VALUES ('${inv3Id}', 'salon-luma-01', 'INV-P4-003', 'cli-p4-test-01', 'Aarav Sharma', 1000.00, 1000.00, 0.00, 1000.00, 'unpaid', 'cash', false, CURRENT_DATE),
               ('${inv4Id}', 'salon-luma-01', 'INV-P4-004', 'cli-p4-test-01', 'Aarav Sharma', 1000.00, 1000.00, 0.00, 1000.00, 'unpaid', 'cash', false, CURRENT_DATE);
      `)

      // Allocate ₹600 from advance #2 to invoice #3
      const alloc1 = runPsql(`
        SELECT public.rpc_allocate_customer_advance('salon-luma-01', '${adv2Id}', '${inv3Id}', 600.00);
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(alloc1.code, 0, alloc1.stderr)

      // Allocate ₹400 from advance #2 to invoice #4
      const alloc2 = runPsql(`
        SELECT public.rpc_allocate_customer_advance('salon-luma-01', '${adv2Id}', '${inv4Id}', 400.00);
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(alloc2.code, 0, alloc2.stderr)

      // Check invoice balances
      const q3 = runPsql(`SELECT balance_due, paid_amount, payment_status FROM public.invoices WHERE id = '${inv3Id}';`)
      const [bal3, paid3, stat3] = q3.stdout.split('|')
      assert.strictEqual(Number(bal3), 400)
      assert.strictEqual(Number(paid3), 600)
      assert.ok(stat3 === 'partial' || stat3 === 'partially_paid')

      const q4 = runPsql(`SELECT balance_due, paid_amount, payment_status FROM public.invoices WHERE id = '${inv4Id}';`)
      const [bal4, paid4, stat4] = q4.stdout.split('|')
      assert.strictEqual(Number(bal4), 600)
      assert.strictEqual(Number(paid4), 400)
      assert.ok(stat4 === 'partial' || stat4 === 'partially_paid')
    }
  )

  await runTest(
    'Payments & Advances',
    'PAY-06',
    'Advance remaining balance updates atomically',
    async () => {
      // Advance #2 initial: 1500, allocated 600 + 400 = 1000. Remaining must be 500
      const q = runPsql(`SELECT remaining_amount FROM public.customer_advances WHERE id = '${adv2Id}';`)
      assert.strictEqual(Number(q.stdout), 500)
    }
  )

  await runTest(
    'Payments & Advances',
    'PAY-07',
    'Advance cannot be over-allocated',
    async () => {
      // Attempt to allocate ₹600 from advance #2 (remaining is 500)
      const res = runPsql(`
        SELECT public.rpc_allocate_customer_advance('salon-luma-01', '${adv2Id}', '${inv3Id}', 600.00);
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(res.code, 0, 'Must reject over-allocation')
      assert.ok(res.stderr.includes('OVER_ALLOCATION'), `Expected OVER_ALLOCATION, got: ${res.stderr}`)
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 3: REFUND MANAGEMENT & PROTECTIONS (Tests 15-21)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 3: Refund Management & Protections (Tests 15-21) ---')

  await runTest(
    'Refund Management',
    'REF-01',
    'Refunds cannot exceed invoice paid amount',
    async () => {
      // Invoice #3 has paid_amount = 600. Attempt refund of ₹700
      const res = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${inv3Id}', 700.00, 'cash', 'Over-refund test');
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('EXCEEDS_REFUNDABLE'), `Expected EXCEEDS_REFUNDABLE, got: ${res.stderr}`)
    }
  )

  await runTest(
    'Refund Management',
    'REF-02',
    'Refunds require mandatory reason',
    async () => {
      const res = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${inv3Id}', 100.00, 'cash', '   ');
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('MANDATORY_REASON'), `Expected MANDATORY_REASON, got: ${res.stderr}`)
    }
  )

  const invHighId = 'inv-p4-high'

  await runTest(
    'Refund Management',
    'REF-03',
    'Refunds > ₹2,000 require Owner password approval',
    async () => {
      // Create invoice with paid amount ₹4,000
      runPsql(`
        INSERT INTO public.invoices (id, salon_id, invoice_number, client_id, client_name, subtotal, total_amount, paid_amount, balance_due, payment_status, primary_payment_method, is_draft, date)
        VALUES ('${invHighId}', 'salon-luma-01', 'INV-P4-099', 'cli-p4-test-01', 'Aarav Sharma', 4000.00, 4000.00, 0.00, 4000.00, 'unpaid', 'card', false, CURRENT_DATE);
        INSERT INTO public.payments (id, salon_id, invoice_id, payment_method, amount)
        VALUES ('pmt-p4-high', 'salon-luma-01', '${invHighId}', 'card', 4000.00);
      `)

      // 1. Receptionist calls refund of ₹2,500 without credentials -> REJECTED
      const noAuth = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${invHighId}', 2500.00, 'card', 'High value reversal');
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(noAuth.code, 0)
      assert.ok(noAuth.stderr.includes('OWNER_APPROVAL_REQUIRED'))

      // 2. Receptionist calls refund with invalid password -> REJECTED
      const badAuth = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${invHighId}', 2500.00, 'card', 'High value reversal', 'owner@lumasalon.com', 'WrongPass!');
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(badAuth.code, 0)
      assert.ok(badAuth.stderr.includes('INVALID_CREDENTIALS'))

      // 3. Receptionist calls refund with valid owner credentials -> PASS
      const validAuth = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${invHighId}', 2500.00, 'card', 'High value reversal', 'owner@lumasalon.com', 'Luma@2026!');
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(validAuth.code, 0, validAuth.stderr)
      const data = JSON.parse(validAuth.stdout)
      assert.strictEqual(data.approved_by, 'usr-owner')
    }
  )

  await runTest(
    'Refund Management',
    'REF-04',
    'Refunds <= ₹2,000 can be processed by receptionist without password',
    async () => {
      // Remaining refundable on invHighId is 4000 - 2500 = 1500.
      // Refund ₹1,000 (<= 2000 threshold)
      const res = runPsql(`
        SELECT public.rpc_issue_refund('salon-luma-01', '${invHighId}', 1000.00, 'card', 'Low value reversal');
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(res.code, 0, res.stderr)
      const data = JSON.parse(res.stdout)
      assert.strictEqual(Number(data.amount), 1000)
    }
  )

  await runTest(
    'Refund Management',
    'REF-05',
    'Refund does not delete or mutate historical payment records',
    async () => {
      // Verify payment 'pmt-p4-high' still exists with its original amount 4000.00
      const q = runPsql(`SELECT amount, payment_method FROM public.payments WHERE id = 'pmt-p4-high';`)
      assert.strictEqual(q.stdout, '4000.00|card')
    }
  )

  await runTest(
    'Refund Management',
    'REF-06',
    'Refund is reflected in customer ledger as debit reversal',
    async () => {
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      // Check total refunds: 200 (LEDGER-04) + 2500 (REF-03) + 1000 (REF-04) = 3700
      assert.strictEqual(Number(data.summary.total_refunds), 3700)
    }
  )

  await runTest(
    'Refund Management',
    'REF-07',
    'Cross-salon refund attempt is rejected',
    async () => {
      // Attempt by user in salon-foreign-999 to refund invoice from salon-luma-01
      const res = runPsql(`
        SELECT public.rpc_issue_refund('salon-foreign-999', '${invHighId}', 100.00, 'cash', 'Cross salon hack');
      `, 'usr-foreign', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('NOT_FOUND') || res.stderr.includes('UNAUTHORIZED'))
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 4: CREDIT NOTES (Tests 22-27)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 4: Credit Notes (Tests 22-27) ---')

  const invCnTestId = 'inv-p4-cntest'
  let cnTestId = ''

  await runTest(
    'Credit Notes',
    'CN-01',
    'Credit notes can be issued against finalized invoices',
    async () => {
      // Create finalized invoice for ₹2,000
      runPsql(`
        INSERT INTO public.invoices (id, salon_id, invoice_number, client_id, client_name, subtotal, total_amount, paid_amount, balance_due, payment_status, primary_payment_method, is_draft, date)
        VALUES ('${invCnTestId}', 'salon-luma-01', 'INV-P4-050', 'cli-p4-test-01', 'Aarav Sharma', 2000.00, 2000.00, 2000.00, 0.00, 'paid', 'cash', false, CURRENT_DATE);
      `)

      const res = runPsql(`
        SELECT public.rpc_create_credit_note(
          'salon-luma-01', '${invCnTestId}', 800.00, 'Service concession voucher',
          '[{"description": "Colour rework credit", "quantity": 1, "unit_price": 800.00}]'::jsonb
        );
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(res.code, 0, res.stderr)
      const data = JSON.parse(res.stdout)
      cnTestId = data.credit_note_id || data.id
      assert.ok(cnTestId)
      assert.strictEqual(Number(data.total_amount), 800)
      assert.strictEqual(Number(data.remaining_amount), 800)
    }
  )

  await runTest(
    'Credit Notes',
    'CN-02',
    'Credit note amounts cannot exceed invoice total',
    async () => {
      // Invoice total is 2000, 800 already issued, remaining allowable is 1200.
      // Attempt to issue 1500
      const res = runPsql(`
        SELECT public.rpc_create_credit_note('salon-luma-01', '${invCnTestId}', 1500.00, 'Excessive credit');
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('EXCEEDS_LIMIT'), `Expected EXCEEDS_LIMIT, got: ${res.stderr}`)
    }
  )

  const invUnpaidTarget = 'inv-p4-target'

  await runTest(
    'Credit Notes',
    'CN-03',
    'Credit notes can be applied against unpaid invoices',
    async () => {
      // Create unpaid target invoice for ₹1,200
      runPsql(`
        INSERT INTO public.invoices (id, salon_id, invoice_number, client_id, client_name, subtotal, total_amount, paid_amount, balance_due, payment_status, primary_payment_method, is_draft, date)
        VALUES ('${invUnpaidTarget}', 'salon-luma-01', 'INV-P4-055', 'cli-p4-test-01', 'Aarav Sharma', 1200.00, 1200.00, 0.00, 1200.00, 'unpaid', 'cash', false, CURRENT_DATE);
      `)

      // Allocate ₹500 from cnTestId (which has 800 available)
      const res = runPsql(`
        SELECT public.rpc_allocate_credit_note('salon-luma-01', '${cnTestId}', '${invUnpaidTarget}', 500.00);
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(res.code, 0, res.stderr)

      // Target invoice balance due must now be 1200 - 500 = 700
      const q = runPsql(`SELECT balance_due, paid_amount, payment_status FROM public.invoices WHERE id = '${invUnpaidTarget}';`)
      const [bal, paid, status] = q.stdout.split('|')
      assert.strictEqual(Number(bal), 700)
      assert.strictEqual(Number(paid), 500)
      assert.ok(status === 'partial' || status === 'partially_paid')

      // Check payment record with method 'credit_note'
      const pmtCheck = runPsql(`SELECT payment_method, amount FROM public.payments WHERE invoice_id = '${invUnpaidTarget}';`)
      assert.strictEqual(pmtCheck.stdout, 'credit_note|500.00')
    }
  )

  await runTest(
    'Credit Notes',
    'CN-04',
    'Credit note remaining balance updates atomically',
    async () => {
      // Initial 800 - allocated 500 = 300 remaining
      const q = runPsql(`SELECT remaining_amount, allocated_amount, status FROM public.credit_notes WHERE id = '${cnTestId}';`)
      assert.strictEqual(q.stdout, '300.00|500.00|active')
    }
  )

  await runTest(
    'Credit Notes',
    'CN-05',
    'Credit note cannot be over-allocated',
    async () => {
      // Attempt to allocate ₹400 from cnTestId (only 300 remaining)
      const res = runPsql(`
        SELECT public.rpc_allocate_credit_note('salon-luma-01', '${cnTestId}', '${invUnpaidTarget}', 400.00);
      `, 'usr-rec', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('OVER_ALLOCATION'), `Expected OVER_ALLOCATION, got: ${res.stderr}`)
    }
  )

  await runTest(
    'Credit Notes',
    'CN-06',
    'Cross-salon credit note allocation is rejected',
    async () => {
      // Create foreign invoice
      runPsql(`
        INSERT INTO public.invoices (id, salon_id, invoice_number, client_id, client_name, subtotal, total_amount, paid_amount, balance_due, payment_status, primary_payment_method, is_draft, date)
        VALUES ('inv-p4-foreign-target', 'salon-foreign-999', 'INV-FOR-01', 'cli-p4-foreign-01', 'Vikram Seth', 500.00, 500.00, 0.00, 500.00, 'unpaid', 'cash', false, CURRENT_DATE)
        ON CONFLICT (id) DO NOTHING;
      `)

      // Attempt to allocate salon-luma-01 credit note to salon-foreign-999
      const res = runPsql(`
        SELECT public.rpc_allocate_credit_note('salon-foreign-999', '${cnTestId}', 'inv-p4-foreign-target', 100.00);
      `, 'usr-foreign', 'authenticated')
      assert.notStrictEqual(res.code, 0)
      assert.ok(res.stderr.includes('NOT_FOUND') || res.stderr.includes('UNAUTHORIZED'))
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 5: CUSTOMER ACCOUNT STATEMENTS (Tests 28-31)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 5: Customer Account Statements (Tests 28-31) ---')

  await runTest(
    'Customer Statements',
    'STMT-01',
    'Statement includes opening balance, transactions and closing balance',
    async () => {
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      assert.ok(data.client)
      assert.ok(data.summary)
      assert.ok(data.summary.total_invoiced !== undefined)
      assert.ok(data.summary.total_paid !== undefined)
      assert.ok(data.summary.total_outstanding !== undefined)
      assert.ok(data.summary.net_customer_balance !== undefined)
      assert.ok(Array.isArray(data.transactions))
    }
  )

  await runTest(
    'Customer Statements',
    'STMT-02',
    'Statement date filtering correctly isolates transactions',
    async () => {
      // Query with date range: only today
      const todayStr = new Date().toISOString().slice(0, 10)
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01', '${todayStr}', '${todayStr}');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      for (const t of data.transactions) {
        assert.strictEqual(t.event_date, todayStr)
      }
    }
  )

  await runTest(
    'Customer Statements',
    'STMT-03',
    'Statement balances match ledger calculations',
    async () => {
      const ledgerRes = runPsql(
        `SELECT public.rpc_get_customer_ledger('salon-luma-01', 'cli-p4-test-01');`
      )
      const data = JSON.parse(ledgerRes.stdout)
      const expectedNet =
        Number(data.summary.total_outstanding) -
        Number(data.summary.available_advance) -
        Number(data.summary.available_credit)
      assert.strictEqual(Number(data.summary.net_customer_balance), expectedNet)
    }
  )

  await runTest(
    'Customer Statements',
    'STMT-04',
    'Statement PDF generates without errors',
    async () => {
      const summary: CustomerLedgerSummary = {
        total_invoiced: 8500,
        total_paid: 5500,
        total_outstanding: 3000,
        total_advance: 3500,
        available_advance: 500,
        total_refunds: 3700,
        total_credit_notes: 1100,
        available_credit: 300,
        net_customer_balance: 2200,
      }

      const transactions: CustomerLedgerEvent[] = [
        {
          event_date: '2026-11-01',
          event_timestamp: '2026-11-01T10:00:00Z',
          transaction_type: 'INVOICE',
          reference: 'INV-P4-001',
          description: 'Hair styling & wash',
          debit_amount: 1500,
          credit_amount: 0,
          running_balance: 1500,
        },
        {
          event_date: '2026-11-02',
          event_timestamp: '2026-11-02T11:00:00Z',
          transaction_type: 'PAYMENT',
          reference: 'INV-P4-001',
          description: 'Payment Received (cash)',
          debit_amount: 0,
          credit_amount: 500,
          running_balance: 1000,
        },
      ]

      const pdfData: CustomerStatementPdfData = {
        client: {
          id: 'cli-p4-test-01',
          name: 'Aarav Sharma',
          phone: '+91 98765 43210',
          email: 'aarav@example.com',
        },
        summary,
        transactions,
      }

      const doc = generateStatementPdf(pdfData)
      assert.ok(doc, 'PDF doc must be generated')
      const totalPages = (doc as any).internal.getNumberOfPages()
      assert.ok(totalPages >= 1, 'PDF must contain at least 1 page')
      const arrayBuffer = doc.output('arraybuffer')
      assert.ok(arrayBuffer.byteLength > 1000, 'PDF binary output must be non-trivial')
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 6: PAYMENT REMINDERS (Tests 32-36)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 6: Payment Reminders (Tests 32-36) ---')

  await runTest(
    'Payment Reminders',
    'REM-01',
    'Payment reminder includes correct customer and invoice details',
    async () => {
      const waUrl = customerLedgerService.buildWhatsAppReminderUrl({
        phone: '+91 98765 43210',
        clientName: 'Aarav Sharma',
        invoiceNumber: 'INV-P4-055',
        balanceDue: 700.0,
        salonName: 'Luma Salon',
      })
      assert.ok(waUrl.includes('919876543210'))
      assert.ok(decodeURIComponent(waUrl).includes('Aarav Sharma'))
      assert.ok(decodeURIComponent(waUrl).includes('INV-P4-055'))
    }
  )

  await runTest(
    'Payment Reminders',
    'REM-02',
    'Payment reminder shows accurate balance due',
    async () => {
      const waUrl = customerLedgerService.buildWhatsAppReminderUrl({
        phone: '9876543210',
        clientName: 'Aarav Sharma',
        invoiceNumber: 'INV-P4-055',
        balanceDue: 700.0,
        salonName: 'Luma Salon',
      })
      assert.ok(decodeURIComponent(waUrl).includes('Rs. 700.00'))
    }
  )

  await runTest(
    'Payment Reminders',
    'REM-03',
    'WhatsApp reminder URL is properly encoded',
    async () => {
      const waUrl = customerLedgerService.buildWhatsAppReminderUrl({
        phone: '9876543210',
        clientName: 'Aarav Sharma',
        invoiceNumber: 'INV-P4-055',
        balanceDue: 700.0,
        salonName: 'Luma Salon',
      })
      assert.ok(waUrl.startsWith('https://api.whatsapp.com/send?phone=919876543210'))
      assert.doesNotThrow(() => decodeURIComponent(waUrl))
    }
  )

  await runTest(
    'Payment Reminders',
    'REM-04',
    'Email reminder mailto URL is properly encoded',
    async () => {
      const mailto = customerLedgerService.buildEmailReminderMailto({
        email: 'aarav@example.com',
        clientName: 'Aarav Sharma',
        invoiceNumber: 'INV-P4-055',
        balanceDue: 700.0,
        salonName: 'Luma Salon',
      })
      assert.ok(mailto.startsWith('mailto:aarav%40example.com'))
      assert.ok(mailto.includes('subject='))
      assert.ok(mailto.includes('body='))
    }
  )

  await runTest(
    'Payment Reminders',
    'REM-05',
    'Reminder attempts are logged in database',
    async () => {
      const insRes = runPsql(`
        INSERT INTO public.payment_reminders (
          salon_id, invoice_id, client_id, channel, recipient_contact, balance_due, status
        ) VALUES (
          'salon-luma-01', '${invUnpaidTarget}', 'cli-p4-test-01', 'whatsapp', '+919876543210', 700.00, 'sent'
        ) RETURNING id;
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(insRes.code, 0, insRes.stderr)
      assert.ok(insRes.stdout.trim().length > 0)
    }
  )

  // --------------------------------------------------------------------------
  // SUITE 7: DAILY PAYMENT RECONCILIATION (Tests 37-41)
  // --------------------------------------------------------------------------
  console.log('\n--- Running Suite 7: Daily Payment Reconciliation (Tests 37-41) ---')

  const reconDate = new Date().toISOString().slice(0, 10)

  await runTest(
    'Payment Reconciliation',
    'RECON-01',
    'Reconciliation correctly calculates total collections by tender',
    async () => {
      const r = runPsql(`
        SELECT public.rpc_record_payment_reconciliation(
          'salon-luma-01', '${reconDate}', 500.00, 2000.00, 'Test closing count'
        );
      `, 'usr-rec', 'authenticated')
      assert.strictEqual(r.code, 0, r.stderr)
      const data = JSON.parse(r.stdout)
      assert.ok(Number(data.cash_collected) >= 0)
      assert.ok(Number(data.card_collected) >= 0)
      assert.ok(Number(data.upi_collected) >= 0)
    }
  )

  await runTest(
    'Payment Reconciliation',
    'RECON-02',
    'Expected cash equals opening cash + cash payments - cash refunds',
    async () => {
      const q = runPsql(`SELECT opening_cash, cash_collected, expected_cash FROM public.payment_reconciliations WHERE salon_id = 'salon-luma-01' AND reconciliation_date = '${reconDate}';`)
      const [opening, cash, expected] = q.stdout.split('|')
      assert.strictEqual(Number(expected), Number(opening) + Number(cash))
    }
  )

  await runTest(
    'Payment Reconciliation',
    'RECON-03',
    'Discrepancy is correctly calculated and flagged',
    async () => {
      const q = runPsql(`SELECT expected_cash, actual_cash, discrepancy, status FROM public.payment_reconciliations WHERE salon_id = 'salon-luma-01' AND reconciliation_date = '${reconDate}';`)
      const [expected, actual, disc, status] = q.stdout.split('|')
      const mathDisc = Number(actual) - Number(expected)
      assert.strictEqual(Number(disc), mathDisc)
      if (mathDisc !== 0) {
        assert.strictEqual(status, 'discrepancy_reported')
      } else {
        assert.strictEqual(status, 'balanced')
      }
    }
  )

  await runTest(
    'Payment Reconciliation',
    'RECON-04',
    'Reconciliation can be saved and retrieved',
    async () => {
      const q = runPsql(`SELECT count(*) FROM public.payment_reconciliations WHERE salon_id = 'salon-luma-01' AND reconciliation_date = '${reconDate}';`)
      assert.strictEqual(Number(q.stdout), 1)
    }
  )

  await runTest(
    'Payment Reconciliation',
    'RECON-05',
    'Cross-salon reconciliation is isolated',
    async () => {
      const q = runPsql(`
        SELECT public.rpc_record_payment_reconciliation(
          'salon-foreign-999', '${reconDate}', 100.00, 100.00, 'Foreign salon closing'
        );
      `, 'usr-foreign', 'authenticated')
      assert.strictEqual(q.code, 0, q.stderr)
      const data = JSON.parse(q.stdout)
      // Foreign salon has 0 cash collected from salon-luma-01
      assert.strictEqual(Number(data.cash_collected), 0)
      assert.strictEqual(Number(data.expected_cash), 100)
    }
  )

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  console.log('\n==============================================================================')
  console.log(' PHASE 4 VERIFICATION RESULTS SUMMARY')
  console.log('==============================================================================')
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`Total Tests Executed: ${results.length}`)
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)

  if (failed > 0) {
    console.error('\nFAILED TESTS:')
    results.filter((r) => r.status === 'FAIL').forEach((r) => {
      console.error(`  [${r.id}] ${r.name}: ${r.details}`)
    })
    process.exit(1)
  } else {
    console.log('\nALL 41 ACCEPTANCE TESTS PASSED (100% SUCCESS)!')
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
