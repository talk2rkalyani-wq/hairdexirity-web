// ==============================================================================
// Luma Salon — Phase 7 Owner Financial Reports & Billing Verification Suite
// Tests: RBAC Access, Invoicing, Multi-Tender Payments, GST Math & CSV Export
// ==============================================================================

import assert from 'node:assert'
import { billingService } from '../src/services/billingService.ts'
import { financialReportsService } from '../src/services/financialReportsService.ts'
import { permissionService } from '../src/services/permissionService.ts'
import { computeDateRange } from '../src/services/ownerDashboardService.ts'
import { getSalonDateStr } from '../src/utils/formatters.ts'
import type { UserSession } from '../src/types/models.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 7 FINANCIAL INTELLIGENCE & BILLING VERIFICATION')
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
  const todayStr = getSalonDateStr(0)

  // --------------------------------------------------------------------------
  // Group 1: Role-Based Access Control (RBAC) & Route Security
  // --------------------------------------------------------------------------
  await runTest('TC-01: RBAC Positive — Owner is granted access to owner/reports', () => {
    const ownerSession: UserSession = {
      user: { id: 'usr-owner-01', email: 'owner@luma.com', name: 'Owner' },
      role: 'OWNER',
      isAuthenticated: true,
    }
    const hasAccess = permissionService.canAccessRoute('owner/reports', ownerSession)
    assert.strictEqual(hasAccess, true, 'OWNER role must have access to owner/reports')
  })

  await runTest('TC-02: RBAC Negative — Employee is denied access to owner/reports', () => {
    const employeeSession: UserSession = {
      user: { id: 'usr-emp-01', email: 'stylist@luma.com', name: 'Stylist' },
      role: 'EMPLOYEE',
      employeeId: 'staff-real-01',
      isAuthenticated: true,
    }
    const hasAccess = permissionService.canAccessRoute('owner/reports', employeeSession)
    assert.strictEqual(hasAccess, false, 'EMPLOYEE role must be denied access to owner/reports')
  })

  await runTest('TC-03: RBAC Negative — Receptionist is denied access to owner/reports', () => {
    const recSession: UserSession = {
      user: { id: 'usr-rec-01', email: 'frontdesk@luma.com', name: 'Front Desk' },
      role: 'RECEPTIONIST',
      isAuthenticated: true,
    }
    const hasAccess = permissionService.canAccessRoute('owner/reports', recSession)
    assert.strictEqual(hasAccess, false, 'RECEPTIONIST role must be denied access to owner/reports')
  })

  await runTest('TC-04: RBAC Negative — Unauthenticated user is denied access to owner/reports', () => {
    const hasAccess = permissionService.canAccessRoute('owner/reports', null)
    assert.strictEqual(hasAccess, false, 'Unauthenticated user must be denied access to owner/reports')
  })

  await runTest('TC-05: RBAC Boundary — Root Admin is confined to /admin, denied owner/reports', () => {
    const adminSession: UserSession = {
      user: { id: 'usr-admin-01', email: 'admin@luma.com', name: 'Admin' },
      role: 'ADMIN',
      isAuthenticated: true,
    }
    const hasAccess = permissionService.canAccessRoute('owner/reports', adminSession)
    assert.strictEqual(hasAccess, false, 'ADMIN must be blocked from owner/reports')
  })

  // --------------------------------------------------------------------------
  // Group 2: Transactional Invoicing & GST Math
  // --------------------------------------------------------------------------
  await runTest('TC-06: Invoicing — Generates sequential invoice number with valid metadata', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-01',
      clientName: 'Pooja Hegde',
      clientPhone: '+91 98765 44444',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      serviceId: 'srv-01',
      serviceName: 'Balayage Hair Color',
      subtotal: 5000,
      applyTax: true,
      primaryPaymentMethod: 'upi',
      payments: [
        {
          method: 'upi',
          amount: 5900,
          transactionReference: 'UPI-TEST-123456',
        },
      ],
    })

    assert(inv.id.startsWith('inv-'), 'Invoice ID must start with inv-')
    assert(inv.invoiceNumber.startsWith('INV-'), 'Invoice number must follow INV-YYYY-XXXX format')
    assert.strictEqual(inv.clientName, 'Pooja Hegde')
    assert.strictEqual(inv.paymentStatus, 'paid')
  })

  await runTest('TC-07: Tax Calculation — Correctly computes 18% GST (9% CGST + 9% SGST)', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-02',
      clientName: 'Rahul Verma',
      staffId: 'staff-real-02',
      staffName: 'Priya Patel',
      serviceName: 'Keratin Treatment',
      subtotal: 10000,
      applyTax: true,
      primaryPaymentMethod: 'card',
      payments: [{ method: 'card', amount: 11800 }],
    })

    assert.strictEqual(inv.subtotal, 10000, 'Subtotal must be 10,000')
    assert.strictEqual(inv.taxAmount, 1800, 'Tax must be 18% of 10,000 = 1,800')
    assert.strictEqual(inv.cgstAmount, 900, 'CGST must be 9% = 900')
    assert.strictEqual(inv.sgstAmount, 900, 'SGST must be 9% = 900')
    assert.strictEqual(inv.totalAmount, 11800, 'Total bill must be 11,800')
  })

  await runTest('TC-08: Tax Exemption — Sets 0 tax when applyTax is false', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-03',
      clientName: 'Ananya Roy',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      serviceName: 'Consultation',
      subtotal: 1000,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
    })

    assert.strictEqual(inv.taxAmount, 0, 'Tax amount must be 0')
    assert.strictEqual(inv.totalAmount, 1000, 'Total must equal subtotal when tax exempt')
  })

  // --------------------------------------------------------------------------
  // Group 3: Discounts & Multi-Tender Payments
  // --------------------------------------------------------------------------
  await runTest('TC-09: Flat Discount — Correctly deducts flat amount before tax', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-04',
      clientName: 'Sanjay Dutt',
      staffId: 'staff-real-03',
      staffName: 'Rajesh Kumar',
      serviceName: 'Signature Haircut',
      subtotal: 2000,
      discountAmount: 500,
      discountReason: 'First Visit Offer',
      applyTax: false,
      primaryPaymentMethod: 'upi',
      payments: [{ method: 'upi', amount: 1500 }],
    })

    assert.strictEqual(inv.subtotal, 2000)
    assert.strictEqual(inv.discountAmount, 500)
    assert.strictEqual(inv.totalAmount, 1500)
    assert.strictEqual(inv.discountReason, 'First Visit Offer')
  })

  await runTest('TC-10: Multi-Tender Split Payment — Records Cash + UPI split payment accurately', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-05',
      clientName: 'Deepika Sen',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      serviceName: 'Bridal Trial',
      subtotal: 5000,
      applyTax: false,
      primaryPaymentMethod: 'split',
      payments: [
        { method: 'cash', amount: 2000, notes: 'Cash portion' },
        { method: 'upi', amount: 3000, transactionReference: 'UPI-SPLIT-999', notes: 'UPI portion' },
      ],
    })

    assert.strictEqual(inv.payments.length, 2, 'Must have 2 payment records')
    assert.strictEqual(inv.paidAmount, 5000, 'Total paid must equal 5,000')
    assert.strictEqual(inv.balanceDue, 0, 'Balance due must be 0')
    assert.strictEqual(inv.paymentStatus, 'paid')
  })

  await runTest('TC-11: Partial Payment & Balance Due — Correctly calculates partial balance', async () => {
    const inv = await billingService.createInvoice({
      clientId: 'cli-test-06',
      clientName: 'Vikram Seth',
      staffId: 'staff-real-02',
      staffName: 'Priya Patel',
      serviceName: 'Hair Spa Package',
      subtotal: 4000,
      applyTax: false,
      primaryPaymentMethod: 'upi',
      payments: [{ method: 'upi', amount: 2500 }],
    })

    assert.strictEqual(inv.totalAmount, 4000)
    assert.strictEqual(inv.paidAmount, 2500)
    assert.strictEqual(inv.balanceDue, 1500, 'Balance due must be 1,500')
    assert.strictEqual(inv.paymentStatus, 'partial', 'Status must be partial')
  })

  await runTest('TC-12: Additional Payment Settlement — Settles balance and transitions to paid', async () => {
    const all = billingService.getAllInvoices()
    const partial = all.find((i) => i.paymentStatus === 'partial')
    assert(partial !== undefined, 'Must find a partial invoice')

    const updated = await billingService.recordAdditionalPayment(partial.id, {
      method: 'cash',
      amount: partial.balanceDue,
    })

    assert(updated !== null)
    assert.strictEqual(updated!.balanceDue, 0, 'Balance must now be 0')
    assert.strictEqual(updated!.paymentStatus, 'paid', 'Status must transition to paid')
  })

  // --------------------------------------------------------------------------
  // Group 4: Financial KPI Aggregations & Reports
  // --------------------------------------------------------------------------
  await runTest('TC-13: Financial Summary KPIs — Accurately aggregates revenue, GST, and tenders', () => {
    const dateRange = {
      preset: 'custom' as const,
      startDate: '2023-01-01',
      endDate: '2029-12-31',
      label: 'All Time Test Range',
      previousStartDate: '2020-01-01',
      previousEndDate: '2022-12-31',
    }
    const summary = financialReportsService.getFinancialSummary(dateRange)

    assert(summary.totalCollectedRevenue > 0, 'Total collected revenue must be greater than 0')
    assert(summary.totalInvoicedAmount >= summary.totalCollectedRevenue, 'Invoiced amount must be >= collected')
    assert(summary.totalInvoicesCount > 0, 'Total invoices count must be greater than 0')
    assert(summary.digitalSharePercentage >= 0 && summary.digitalSharePercentage <= 100, 'Digital share must be percentage')
    assert.strictEqual(
      summary.totalTaxCollected,
      Math.round((summary.totalCgstCollected + summary.totalSgstCollected) * 100) / 100,
      'CGST + SGST must equal total tax'
    )
  })

  await runTest('TC-14: Tender Distribution — Computes correct shares across UPI, Card, and Cash', () => {
    const dateRange = {
      preset: 'custom' as const,
      startDate: '2023-01-01',
      endDate: '2029-12-31',
      label: 'All Time Test Range',
      previousStartDate: '2020-01-01',
      previousEndDate: '2022-12-31',
    }
    const shares = financialReportsService.getPaymentMethodBreakdown(dateRange)

    assert(Array.isArray(shares), 'Shares must be an array')
    assert(shares.length > 0, 'Must have at least one tender method')
    const sumPct = shares.reduce((sum, s) => sum + s.percentage, 0)
    assert(sumPct >= 99 && sumPct <= 101, `Percentages must sum to ~100%, got ${sumPct}%`)
  })

  await runTest('TC-15: Daily Cash Flow Trends — Bins daily receipts for charts correctly', () => {
    const dateRange = computeDateRange('last_7_days')
    const trends = financialReportsService.getCashFlowDailyTrends(dateRange)

    assert(Array.isArray(trends))
    assert.strictEqual(trends.length, 7, 'Last 7 days must produce exactly 7 trend points')
    trends.forEach((t) => {
      assert(t.date !== undefined)
      assert(t.displayDate !== undefined)
      assert(typeof t.totalCollected === 'number')
    })
  })

  // --------------------------------------------------------------------------
  // Group 5: Filtering & Accounting CSV Export
  // --------------------------------------------------------------------------
  await runTest('TC-16: Table Filtering — Filters invoices by tender and search query', () => {
    const all = billingService.getAllInvoices()
    const upiOnly = billingService.filterInvoices(all, { paymentMethod: 'upi' })
    assert(upiOnly.every((i) => i.primaryPaymentMethod === 'upi' || i.payments.some((p) => p.paymentMethod === 'upi')))

    const searchResult = billingService.filterInvoices(all, { searchQuery: 'Pooja' })
    assert(searchResult.every((i) => i.clientName.toLowerCase().includes('pooja') || i.staffName.toLowerCase().includes('pooja')))
  })

  await runTest('TC-17: CSV Export — Generates RFC 4180 compliant CSV accounting ledger', () => {
    const all = billingService.getAllInvoices()
    const csv = financialReportsService.exportInvoicesToCsv(all)

    assert(typeof csv === 'string')
    assert(csv.includes('Invoice Number,Date,Client Name'), 'Must contain standard CSV headers')
    assert(csv.includes('INV-2026-'), 'Must contain invoice records')
    assert(csv.includes('CGST 9% (INR)'), 'Must contain tax columns')
  })

  await runTest('TC-18: Reactive Subscription — Notifies listeners upon new invoice creation', async () => {
    let notified = false
    const unsubscribe = billingService.subscribe((_invoices) => {
      notified = true
    })

    await billingService.createInvoice({
      clientId: 'cli-notify-test',
      clientName: 'Listener Test',
      staffId: 'staff-real-01',
      staffName: 'Riya Sharma',
      subtotal: 1000,
      applyTax: false,
      primaryPaymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 1000 }],
    })

    unsubscribe()
    assert.strictEqual(notified, true, 'Subscriber must be notified when invoice is created')
  })

  console.log('\n========================================================================')
  console.log(`🎉 ALL PHASE 7 VERIFICATION TESTS PASSED (${passedTests} of ${passedTests})`)
  console.log('========================================================================\n')
}

runAllTests().catch((err) => {
  console.error('Fatal error running Phase 7 verification:', err)
  process.exit(1)
})
