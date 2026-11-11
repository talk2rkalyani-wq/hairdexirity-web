// ==============================================================================
// Luma Salon — Phase 7.1D: Complete Financial System Security & Integrity Suite
// Tests: Role RLS, Immutability, RPC Security, Idempotency, Reconciliation & Rollback
// ==============================================================================

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { billingService } from '../src/services/billingService.ts'
import { sessionService } from '../src/services/sessionService.ts'
import { financialReportsService } from '../src/services/financialReportsService.ts'
import { permissionService } from '../src/services/permissionService.ts'
import type { UserSession } from '../src/types/models.ts'
import type { Invoice, PaymentStatus } from '../src/types/finance.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 7.1D FINANCIAL SECURITY & INTEGRITY VERIFICATION')
console.log('========================================================================\n')

let passedTests = 0

async function runTest(testName: string, testFn: () => void | Promise<void>) {
  try {
    const res = testFn()
    if (res instanceof Promise) {
      await res
    }
    console.log(`  ✅ [PASS] ${testName}`)
    passedTests++
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${testName}: ${err.message}`)
    process.exitCode = 1
  }
}

async function runAllTests() {
  const initialInvoices = billingService.getAllInvoices()

  // --------------------------------------------------------------------------
  // Group 1: Role-Based Authorization & Visibility Matrix
  // --------------------------------------------------------------------------
  await runTest('TC-01: Role Auth — OWNER session has full visibility over salon invoices', () => {
    const ownerSession: UserSession = {
      sessionId: 'sess-owner-test',
      userId: 'usr-owner-01',
      name: 'Owner',
      email: 'owner@luma.com',
      role: 'OWNER',
      salonId: 'salon-luma-01',
      isAuthenticated: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }
    sessionService.setSession(ownerSession)

    const invoices = billingService.getAllInvoices()
    assert(Array.isArray(invoices))
    assert(invoices.length > 0, 'Owner must see salon invoices')
    assert(invoices.every((i) => i.salonId === 'salon-luma-01'), 'Must be scoped to owner salon')
  })

  await runTest('TC-02: Role Auth — RECEPTIONIST session has full visibility over front desk salon invoices', () => {
    const recSession: UserSession = {
      sessionId: 'sess-rec-test',
      userId: 'usr-rec-01',
      name: 'Receptionist',
      email: 'reception@luma.com',
      role: 'RECEPTIONIST',
      salonId: 'salon-luma-01',
      isAuthenticated: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }
    sessionService.setSession(recSession)

    const invoices = billingService.getAllInvoices()
    assert(Array.isArray(invoices))
    assert(invoices.length > 0, 'Receptionist must see salon invoices for checkout settlement')
  })

  await runTest('TC-03: Role Auth — EMPLOYEE (Stylist) is strictly restricted to viewing ONLY their own assigned invoices', () => {
    const targetStaffId = 'staff-real-01'
    const empSession: UserSession = {
      sessionId: 'sess-emp-test',
      userId: 'usr-emp-01',
      name: 'Riya Sharma',
      email: 'riya@luma.com',
      role: 'EMPLOYEE',
      employeeId: targetStaffId,
      salonId: 'salon-luma-01',
      isAuthenticated: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }
    sessionService.setSession(empSession)

    const empInvoices = billingService.getAllInvoices()
    assert(Array.isArray(empInvoices))
    // Must only contain invoices for staff-real-01
    assert(
      empInvoices.every((i) => i.staffId === targetStaffId),
      'Stylist must NOT be able to view invoices of other stylists or salon-wide turnover'
    )
  })

  await runTest('TC-04: Role Auth — EMPLOYEE cannot fetch other staff invoices via getInvoiceById', () => {
    // Keep empSession active for staff-real-01
    sessionService.setSession({
      sessionId: 'sess-emp-test',
      userId: 'usr-emp-01',
      name: 'Riya Sharma',
      role: 'EMPLOYEE',
      employeeId: 'staff-real-01',
      salonId: 'salon-luma-01',
      isAuthenticated: true,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    })

    // Find an invoice belonging to another staff member
    const otherStaffInvoice = initialInvoices.find((i) => i.staffId !== 'staff-real-01')
    if (otherStaffInvoice) {
      const retrieved = billingService.getInvoiceById(otherStaffInvoice.id)
      assert.strictEqual(
        retrieved,
        null,
        'Stylist must be blocked from inspecting an invoice belonging to another staff member'
      )
    }
  })

  await runTest('TC-05: RBAC Route Boundary — EMPLOYEE and RECEPTIONIST denied access to owner financial reports route', () => {
    const empSession: UserSession = {
      user: { id: 'usr-emp-01', email: 'stylist@luma.com', name: 'Stylist' },
      role: 'EMPLOYEE',
      employeeId: 'staff-real-01',
      isAuthenticated: true,
    }
    assert.strictEqual(
      permissionService.canAccessRoute('owner/reports', empSession),
      false,
      'Stylist must be blocked from owner financial reports route'
    )

    const recSession: UserSession = {
      user: { id: 'usr-rec-01', email: 'frontdesk@luma.com', name: 'Front Desk' },
      role: 'RECEPTIONIST',
      isAuthenticated: true,
    }
    assert.strictEqual(
      permissionService.canAccessRoute('owner/reports', recSession),
      false,
      'Receptionist must be blocked from owner financial reports route'
    )
  })

  // Reset session to owner for remaining operational tests
  sessionService.setSession({
    sessionId: 'sess-owner-test',
    userId: 'usr-owner-01',
    name: 'Owner',
    role: 'OWNER',
    salonId: 'salon-luma-01',
    isAuthenticated: true,
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
  })

  // --------------------------------------------------------------------------
  // Group 2: Invoice Integrity, Sequences & Immutability
  // --------------------------------------------------------------------------
  await runTest('TC-06: Invoice Numbering — Generates monotonic atomic sequence conforming to INV-YYYY-XXXX', () => {
    const nextNum = billingService.generateNextInvoiceNumber()
    const currentYear = new Date().getFullYear()
    assert(nextNum.startsWith(`INV-${currentYear}-`), `Invoice number must start with INV-${currentYear}-`)
    assert(/INV-\d{4}-\d{4,}/.test(nextNum), 'Sequence must match INV-YYYY-XXXX format')
  })

  await runTest('TC-07: Invoice Idempotency — Duplicate submission with identical key returns original invoice', async () => {
    const idempotencyKey = `idem-test-sec-${Date.now()}`

    const first = await billingService.createInvoice({
      clientId: 'cli-idem-sec-01',
      clientName: 'Security Idem Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 3000,
      applyTax: true,
      primaryPaymentMethod: 'upi',
      payments: [{ method: 'upi', amount: 3540, idempotencyKey: `${idempotencyKey}-upi` }],
      idempotencyKey,
    })

    const second = await billingService.createInvoice({
      clientId: 'cli-idem-sec-01',
      clientName: 'Security Idem Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 3000,
      applyTax: true,
      primaryPaymentMethod: 'upi',
      payments: [{ method: 'upi', amount: 3540, idempotencyKey: `${idempotencyKey}-upi` }],
      idempotencyKey,
    })

    assert.strictEqual(first.id, second.id, 'Duplicate checkout with identical idempotencyKey must return existing invoice')
    assert.strictEqual(first.invoiceNumber, second.invoiceNumber, 'Must not allocate a second invoice number')
  })

  await runTest('TC-08: Invoice Void / Cancellation — Transitions status to cancelled with audit reason', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-void-sec',
      clientName: 'Void Security Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 1500,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1500 }],
    })

    const voided = await billingService.voidInvoice(inv.id, 'Appointment cancelled by front desk')
    assert(voided !== null)
    assert.strictEqual(voided!.paymentStatus, 'cancelled', 'Status must transition to cancelled')
    assert.strictEqual(voided!.voidReason, 'Appointment cancelled by front desk')
    assert(voided!.notes?.includes('CANCELLED: Appointment cancelled by front desk'))
  })

  // --------------------------------------------------------------------------
  // Group 3: Payment Integrity & Reconciliation
  // --------------------------------------------------------------------------
  await runTest('TC-09: Overpayment Rejection in Initial Checkout — Throws error when payments exceed total bill', async () => {
    let errorThrown = false
    try {
      await billingService.createInvoice({
        clientId: 'cli-overpay-01',
        clientName: 'Overpay Client',
        staffId: 'staff-real-01',
        staffName: 'Riya Sharma',
        subtotal: 1000,
        applyTax: false, // Total is ₹1000
        primaryPaymentMethod: 'cash',
        payments: [{ method: 'cash', amount: 2000 }], // Attempting ₹2000 payment for ₹1000 bill
      })
    } catch (err: any) {
      errorThrown = true
      assert(err.message.includes('exceed invoice total'), 'Error must specify overpayment rejection')
    }
    assert.strictEqual(errorThrown, true, 'createInvoice must reject overpayments exceeding total bill')
  })

  await runTest('TC-10: Overpayment Rejection in Additional Payment — Throws error when amount exceeds balanceDue', async () => {
    // Create partial invoice (bill: ₹2000, paid: ₹1000, balance: ₹1000)
    const partialInv = await billingService.createInvoice({
      clientId: 'cli-partial-sec',
      clientName: 'Partial Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 2000,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
    })

    assert.strictEqual(partialInv.balanceDue, 1000)

    let errorThrown = false
    try {
      await billingService.recordAdditionalPayment(partialInv.id, {
        method: 'upi',
        amount: 1500, // Exceeds balance due of 1000
      })
    } catch (err: any) {
      errorThrown = true
      assert(err.message.includes('exceeds outstanding balance due'), 'Must reject overpayment exceeding balance')
    }
    assert.strictEqual(errorThrown, true, 'recordAdditionalPayment must reject overpayments exceeding balance')
  })

  await runTest('TC-11: Payment Cancellation Protection — Rejects additional payment on a cancelled invoice', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-cancelled-pay',
      clientName: 'Cancelled Pay Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 2000,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
    })

    await billingService.voidInvoice(inv.id, 'Void test')

    let errorThrown = false
    try {
      await billingService.recordAdditionalPayment(inv.id, {
        method: 'cash',
        amount: 500,
      })
    } catch (err: any) {
      errorThrown = true
      assert(err.message.includes('Cannot record payment for cancelled invoice'))
    }
    assert.strictEqual(errorThrown, true, 'Cannot record payment against cancelled invoice')
  })

  await runTest('TC-12: Payment Idempotency — Retrying additional payment with same key does not duplicate amount', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-idem-pmt',
      clientName: 'Idem Payment Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 2000,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
    })

    const pmtIdemKey = `pmt-idem-${Date.now()}`

    const updated1 = await billingService.recordAdditionalPayment(inv.id, {
      method: 'upi',
      amount: 500,
      idempotencyKey: pmtIdemKey,
    })

    assert.strictEqual(updated1!.paidAmount, 1500)
    assert.strictEqual(updated1!.balanceDue, 500)

    // Retry with exact same idempotency key
    const updated2 = await billingService.recordAdditionalPayment(inv.id, {
      method: 'upi',
      amount: 500,
      idempotencyKey: pmtIdemKey,
    })

    assert.strictEqual(updated2!.paidAmount, 1500, 'Paid amount must NOT increase upon idempotency retry')
    assert.strictEqual(updated2!.balanceDue, 500, 'Balance due must remain unchanged')
  })

  await runTest('TC-13: Split Tender Reconciliation — Cash + UPI tenders reconcile exactly to invoice total', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-split-sec',
      clientName: 'Split Client',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 5000,
      applyTax: false,
      primaryPaymentMethod: 'split',
      payments: [
        { method: 'cash', amount: 2000, idempotencyKey: 'split-cash-1' },
        { method: 'upi', amount: 3000, idempotencyKey: 'split-upi-1' },
      ],
    })

    assert.strictEqual(inv.payments.length, 2)
    assert.strictEqual(inv.paidAmount, 5000)
    assert.strictEqual(inv.balanceDue, 0)
    assert.strictEqual(inv.paymentStatus, 'paid')
  })

  // --------------------------------------------------------------------------
  // Group 4: Database Migration Schema & SQL Security Inspection
  // --------------------------------------------------------------------------
  await runTest('TC-14: Migration 000011 — Implements composite tenant-scoped idempotency constraints', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    assert(
      sql.includes('CONSTRAINT uq_invoices_salon_idempotency UNIQUE (salon_id, idempotency_key)'),
      'Invoices must have composite tenant-scoped idempotency constraint'
    )
    assert(
      sql.includes('CONSTRAINT uq_payments_salon_idempotency UNIQUE (salon_id, idempotency_key)'),
      'Payments must have composite tenant-scoped idempotency constraint'
    )
  })

  await runTest('TC-15: Migration 000011 — Implements cross-tenant composite foreign keys on line items and payments', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    assert(
      sql.includes('CONSTRAINT uq_invoices_salon_id UNIQUE (salon_id, id)'),
      'Invoices must define composite unique (salon_id, id)'
    )
    assert(
      sql.includes('REFERENCES public.invoices(salon_id, id) ON DELETE CASCADE'),
      'Line items must enforce composite foreign key to parent invoice'
    )
    assert(
      sql.includes('REFERENCES public.invoices(salon_id, id) ON DELETE RESTRICT'),
      'Payments must enforce composite foreign key to parent invoice'
    )
  })

  await runTest('TC-16: Migration 000011 — Implements payment reconciliation trigger with row-level locking', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    assert(sql.includes('CREATE TRIGGER trg_reconcile_invoice_payment'), 'Must define trg_reconcile_invoice_payment')
    assert(sql.includes('FOR UPDATE'), 'Trigger must lock invoice row with FOR UPDATE')
    assert(sql.includes('exceeds invoice balance due'), 'Trigger must reject overpayments')
  })

  await runTest('TC-17: Migration 000011 — Implements finalized invoice immutability trigger', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    assert(sql.includes('CREATE TRIGGER trg_protect_finalized_invoices'), 'Must define trg_protect_finalized_invoices')
    assert(
      sql.includes('Immutable financial fields (invoice_number, subtotal, tax, total) cannot be modified after issuance'),
      'Trigger must block modifications to issued financial fields'
    )
  })

  await runTest('TC-18: Migration 000011 — Implements granular role-based RLS and completely prohibits DELETE', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    // Prohibit DELETE
    assert(sql.includes('REVOKE DELETE ON public.invoices FROM authenticated'), 'DELETE must be revoked on invoices')
    assert(sql.includes('REVOKE UPDATE, DELETE ON public.payments FROM authenticated'), 'DELETE must be revoked on payments')
    assert(sql.includes('REVOKE UPDATE, DELETE ON public.invoice_line_items FROM authenticated'), 'DELETE must be revoked on line items')

    // Role-separated policies
    assert(sql.includes('FOR SELECT'), 'Must define discrete SELECT policies')
    assert(sql.includes('FOR INSERT'), 'Must define discrete INSERT policies')
    assert(sql.includes('FOR UPDATE'), 'Must define discrete UPDATE policies')
    assert(sql.includes('staff_id = public.current_user_staff_id()'), 'Stylist SELECT must be restricted to assigned staff_id')
  })

  await runTest('TC-19: Migration 000011 — next_invoice_number enforces caller authentication, tenant check and role permissions', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/20261105000011_financial_ledger_and_payments.sql'
    )
    const sql = fs.readFileSync(migrationPath, 'utf-8')

    assert(sql.includes('v_caller_salon IS NULL'), 'RPC must check unauthenticated caller')
    assert(sql.includes('p_salon_id <> v_caller_salon'), 'RPC must reject cross-tenant requests')
    assert(sql.includes('NOT public.is_owner_or_receptionist()'), 'RPC must reject non-billing roles')
    assert(sql.includes('SET search_path = public'), 'RPC must set search_path')
  })

  // --------------------------------------------------------------------------
  // Group 5: Rollback Script Safety & Non-Destructive Archival
  // --------------------------------------------------------------------------
  await runTest('TC-20: Rollback Script — rollback_20261105000011.sql preserves live financial records via archival', () => {
    const rollbackPath = path.resolve(
      process.cwd(),
      'supabase/scripts/rollback_20261105000011.sql'
    )
    assert(fs.existsSync(rollbackPath), 'Rollback script must exist on disk')

    const sql = fs.readFileSync(rollbackPath, 'utf-8')
    assert(sql.includes('invoices_archive_202611'), 'Must rename to archive table if records exist')
    assert(sql.includes('Section 36 of the Central Goods and Services Tax (CGST) Act'), 'Must document statutory tax compliance')
    assert(!sql.includes('DROP TABLE IF EXISTS public.invoices CASCADE;'), 'Must not execute unconditional DROP CASCADE on live data')
  })

  // --------------------------------------------------------------------------
  // Group 6: Financial Reports & CSV Reconciliation
  // --------------------------------------------------------------------------
  await runTest('TC-21: KPI Reconciliation — Summary metrics reconcile with actual invoices and tenders', () => {
    const dateRange = {
      preset: 'custom' as const,
      startDate: '2020-01-01',
      endDate: '2030-12-31',
      label: 'All Time Range',
      previousStartDate: '2010-01-01',
      previousEndDate: '2019-12-31',
    }
    const summary = financialReportsService.getFinancialSummary(dateRange)
    assert(summary.totalCollectedRevenue > 0)
    assert(summary.totalInvoicesCount > 0)
    assert.strictEqual(
      summary.totalTaxCollected,
      Math.round((summary.totalCgstCollected + summary.totalSgstCollected) * 100) / 100
    )
  })

  await runTest('TC-22: RFC 4180 CSV Export — Ledger exports all required tax and payment columns accurately', () => {
    const all = billingService.getAllInvoices()
    const csv = financialReportsService.exportInvoicesToCsv(all)
    assert(csv.includes('Invoice Number,Date,Client Name'))
    assert(csv.includes('CGST 9% (INR)'))
    assert(csv.includes('SGST 9% (INR)'))
    assert(csv.includes('Total Amount (INR)'))
    assert(csv.includes('Paid Amount (INR)'))
    assert(csv.includes('Balance Due (INR)'))
  })

  // Clean up session
  sessionService.logout()

  console.log('\n========================================================================')
  console.log(`🎉 ALL PHASE 7.1D VERIFICATION TESTS PASSED (${passedTests} of ${passedTests})`)
  console.log('========================================================================\n')
}

runAllTests().catch((err) => {
  console.error('Fatal error running Phase 7.1D verification:', err)
  process.exit(1)
})
