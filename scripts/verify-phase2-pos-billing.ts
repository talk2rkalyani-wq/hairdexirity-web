// ==============================================================================
// Luma Salon — Phase 2 Verification Suite
// POS Billing Engine, Navigation, Multi-Item Settlement & Financial Integrity
// ==============================================================================

import { getBillingSubmenuItems, isDashboardRoute, isBillingRoute } from '../src/config/navigationConfig.ts'
import { permissionService } from '../src/services/permissionService.ts'
import { billingService, roundMoney } from '../src/services/billingService.ts'
import { credentialService } from '../src/services/credentialService.ts'
import type { UserSession } from '../src/types/models.ts'
import type { InvoiceLineItem, SinglePaymentMethod } from '../src/types/finance.ts'

let passedTests = 0
let failedTests = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passedTests++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failedTests++
  }
}

async function runTestSuite() {
  console.log('\n=============================================================')
  console.log(' LUMA SALON BUSINESS SUITE — PHASE 2 VERIFICATION TEST SUITE')
  console.log(' Receptionist POS & Commercial Billing Engine')
  console.log('=============================================================\n')

  // Setup mock user sessions
  const ownerSession: UserSession = {
    userId: 'usr-owner-01',
    salonId: 'salon-luma-01',
    role: 'OWNER',
    email: 'kalyani@lumasalon.com',
    name: 'Kalyani Owner',
    isAuthenticated: true,
  }

  const receptionistSession: UserSession = {
    userId: 'usr-receptionist-01',
    salonId: 'salon-luma-01',
    role: 'RECEPTIONIST',
    email: 'receptionist@lumasalon.com',
    name: 'Ritu Receptionist',
    isAuthenticated: true,
  }

  const employeeSession: UserSession = {
    userId: 'usr-employee-01',
    salonId: 'salon-luma-01',
    role: 'EMPLOYEE',
    employeeId: 'emp-ananya-01',
    email: 'ananya@lumasalon.com',
    name: 'Ananya Stylist',
    isAuthenticated: true,
  }

  const adminSession: UserSession = {
    userId: 'usr-admin-01',
    salonId: 'salon-luma-01',
    role: 'ADMIN',
    email: 'root@lumasalon.com',
    name: 'Platform Root Admin',
    isAuthenticated: true,
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Navigation Config & RBAC Matrix
  // --------------------------------------------------------------------------
  console.log('--- SUITE 1: Navigation Configuration & RBAC Matrix ---')

  const ownerBillingItems = getBillingSubmenuItems('OWNER')
  assert(ownerBillingItems.length === 9, 'Owner receives all 9 Billing navigation items')
  assert(ownerBillingItems[0].id === 'billing/overview', 'First item is Billing Overview')
  assert(ownerBillingItems[1].id === 'billing/new', 'Second item is New Bill')
  assert(ownerBillingItems[2].badge === 'Soon', 'Upcoming item 3 has "Soon" badge')
  assert(ownerBillingItems[8].badge === 'Soon', 'Upcoming item 9 has "Soon" badge')

  const recBillingItems = getBillingSubmenuItems('RECEPTIONIST')
  assert(recBillingItems.length === 9, 'Receptionist receives all 9 Billing navigation items')

  const empBillingItems = getBillingSubmenuItems('EMPLOYEE')
  assert(empBillingItems.length === 0, 'Employee receives 0 Billing navigation items (strict restriction)')

  const admBillingItems = getBillingSubmenuItems('ADMIN')
  assert(admBillingItems.length === 0, 'Root Admin receives 0 Billing navigation items (separate provisioning)')

  assert(isBillingRoute('billing/overview'), 'isBillingRoute recognizes billing/overview')
  assert(isBillingRoute('billing/new'), 'isBillingRoute recognizes billing/new')
  assert(isDashboardRoute('billing/overview'), 'isDashboardRoute treats billing/overview under Dashboards section')
  assert(isDashboardRoute('billing/new'), 'isDashboardRoute treats billing/new under Dashboards section')

  assert(permissionService.canAccessRoute('billing/overview', ownerSession), 'Owner permitted on billing/overview')
  assert(permissionService.canAccessRoute('billing/new', receptionistSession), 'Receptionist permitted on billing/new')
  assert(!permissionService.canAccessRoute('billing/overview', employeeSession), 'Employee blocked from billing/overview')
  assert(!permissionService.canAccessRoute('billing/new', employeeSession), 'Employee blocked from billing/new')
  assert(!permissionService.canAccessRoute('billing/overview', adminSession), 'Root Admin blocked from salon billing routes')

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Multi-Item & Combined Service + Retail Product Billing
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 2: Multi-Item Combined Service & Retail Billing ---')

  const combinedLineItems: InvoiceLineItem[] = [
    {
      description: 'Luxe Haircut & Styling',
      name: 'Luxe Haircut & Styling',
      quantity: 1,
      unitPrice: 1200,
      totalPrice: 1200,
      itemType: 'service',
      serviceId: 'srv-haircut-01',
      staffId: 'staff-ananya-01',
      staffName: 'Ananya Sharma',
      discountAmount: 0,
      taxRate: 0.18,
    },
    {
      description: 'Moroccanoil Treatment Argan Oil 100ml',
      name: 'Moroccanoil Treatment Argan Oil 100ml',
      quantity: 2,
      unitPrice: 1500,
      totalPrice: 3000,
      itemType: 'product',
      productId: 'prod-argan-01',
      discountAmount: 0,
      taxRate: 0.18,
    },
  ]

  const subtotal = roundMoney(1200 + 3000)
  assert(subtotal === 4200, `Calculated subtotal is ₹4,200.00 (got ₹${subtotal})`)

  const combinedInvoice = await billingService.createInvoice({
    salonId: 'salon-luma-01',
    clientName: 'Shreya Kapoor',
    clientPhone: '+91 98765 00001',
    subtotal: 4200,
    lineItems: combinedLineItems,
    isGstInvoice: true,
    taxTreatment: 'exclusive',
    taxRate: 0.18,
    primaryPaymentMethod: 'card',
    payments: [
      {
        method: 'card',
        amount: roundMoney(4200 * 1.18),
        transactionReference: 'CARD-AUTH-9921',
      },
    ],
  })

  assert(combinedInvoice.lineItems.length === 2, 'Invoice holds both service and retail product lines')
  assert(combinedInvoice.lineItems[0].staffId === 'staff-ananya-01', 'First item assigned to stylist Ananya Sharma')
  assert(combinedInvoice.lineItems[1].itemType === 'product', 'Second item is retail product with SKU/productId')
  assert(combinedInvoice.subtotal === 4200, 'Invoice subtotal is ₹4,200')
  assert(combinedInvoice.taxAmount === roundMoney(4200 * 0.18), `Tax amount is ₹${roundMoney(4200 * 0.18)} (18% GST)`)
  assert(combinedInvoice.totalAmount === roundMoney(4200 * 1.18), `Total amount is ₹${roundMoney(4200 * 1.18)}`)
  assert(combinedInvoice.paymentStatus === 'paid', 'Status is fully paid')

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Configurable GST / Non-GST & Tax Treatments
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 3: Configurable GST / Non-GST & Tax Treatment ---')

  // 3A. GST Exclusive (18%)
  const gstExclInvoice = await billingService.createInvoice({
    clientName: 'Rahul Verma',
    subtotal: 1000,
    isGstInvoice: true,
    taxTreatment: 'exclusive',
    taxRate: 0.18,
    primaryPaymentMethod: 'upi',
    payments: [{ method: 'upi', amount: 1180, transactionReference: 'UPI-REF-001' }],
  })
  assert(gstExclInvoice.taxAmount === 180, 'GST Exclusive: Tax is ₹180 on ₹1,000')
  assert(gstExclInvoice.cgstAmount === 90, 'CGST is ₹90 (9%)')
  assert(gstExclInvoice.sgstAmount === 90, 'SGST is ₹90 (9%)')
  assert(gstExclInvoice.totalAmount === 1180, 'Grand Total is ₹1,180')

  // 3B. GST Inclusive (18%)
  const gstInclInvoice = await billingService.createInvoice({
    clientName: 'Priya Mehra',
    subtotal: 1180,
    isGstInvoice: true,
    taxTreatment: 'inclusive',
    taxRate: 0.18,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1180 }],
  })
  assert(gstInclInvoice.totalAmount === 1180, 'GST Inclusive: Total remains ₹1,180 net')
  assert(gstInclInvoice.taxAmount === 180, 'Tax extracted is ₹180.00')
  assert(gstInclInvoice.cgstAmount === 90, 'Extracted CGST is ₹90.00')
  assert(gstInclInvoice.sgstAmount === 90, 'Extracted SGST is ₹90.00')

  // 3C. Non-GST / Composition (0%)
  const nonGstInvoice = await billingService.createInvoice({
    clientName: 'Deepak Patel',
    subtotal: 1500,
    isGstInvoice: false,
    taxTreatment: 'non_gst',
    taxRate: 0,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1500 }],
  })
  assert(nonGstInvoice.taxAmount === 0, 'Non-GST: Tax amount is exactly ₹0.00')
  assert(nonGstInvoice.totalAmount === 1500, 'Non-GST: Total equals subtotal ₹1,500.00')

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Authorized & Special Discounts
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 4: Discounts & Owner Security Authorization ---')

  // 4A. Flat Discount
  const flatDiscInvoice = await billingService.createInvoice({
    clientName: 'Alia Bhatt',
    subtotal: 2000,
    discountType: 'flat',
    discountAmount: 200,
    isGstInvoice: false,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1800 }],
  })
  assert(flatDiscInvoice.discountAmount === 200, 'Flat discount of ₹200 applied')
  assert(flatDiscInvoice.totalAmount === 1800, 'Net total is ₹1,800')

  // 4B. Percentage Discount
  const pctDiscInvoice = await billingService.createInvoice({
    clientName: 'Varun Dhawan',
    subtotal: 3000,
    discountType: 'percentage',
    discountValue: 10,
    discountAmount: 300,
    isGstInvoice: false,
    primaryPaymentMethod: 'upi',
    payments: [{ method: 'upi', amount: 2700, transactionReference: 'UPI-7711' }],
  })
  assert(pctDiscInvoice.discountAmount === 300, '10% discount gives ₹300')
  assert(pctDiscInvoice.totalAmount === 2700, 'Net total is ₹2,700')

  // 4C. Special Discount > 10% requiring Owner Credential Check
  // Seed owner credentials for testing
  await credentialService.registerUserCredentials('usr-owner-01', 'kalyani@lumasalon.com', 'SalonOwner@2026!')

  // Test password verification against salted hash
  const isValidOwner = await credentialService.verifyPassword('kalyani@lumasalon.com', 'SalonOwner@2026!')
  assert(isValidOwner, 'Credential service verifies legitimate owner password')

  const isInvalidOwner = await credentialService.verifyPassword('kalyani@lumasalon.com', 'wrongpassword')
  assert(!isInvalidOwner, 'Credential service rejects unauthorized/fake password')

  const specialDiscInvoice = await billingService.createInvoice({
    clientName: 'VIP Client',
    subtotal: 5000,
    discountType: 'percentage',
    discountValue: 20,
    discountAmount: 1000,
    authorizedBy: 'Kalyani Owner',
    isGstInvoice: false,
    primaryPaymentMethod: 'card',
    payments: [{ method: 'card', amount: 4000, transactionReference: 'AUTH-VIP-01' }],
  })
  assert(specialDiscInvoice.authorizedBy === 'Kalyani Owner', 'Invoice records authorizing Owner audit trail')
  assert(specialDiscInvoice.discountAmount === 1000, 'Authorized 20% discount applied')
  assert(specialDiscInvoice.totalAmount === 4000, 'Total reflects authorized discount')

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Multi-Tender & Split Payment Settlement
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 5: Multi-Tender & Split Payment Settlement ---')

  // 5A. Bank Transfer Tender
  const bankInvoice = await billingService.createInvoice({
    clientName: 'Corporate Event Account',
    subtotal: 8000,
    isGstInvoice: false,
    primaryPaymentMethod: 'bank',
    payments: [
      {
        method: 'bank',
        amount: 8000,
        transactionReference: 'NEFT-HDFC-0091823',
        notes: 'Corporate direct wire settlement',
      },
    ],
  })
  assert(bankInvoice.primaryPaymentMethod === 'bank', 'Bank Transfer recorded as tender')
  assert(bankInvoice.payments[0].paymentMethod === 'bank', 'Payment record has "bank" method')
  assert(bankInvoice.payments[0].transactionReference === 'NEFT-HDFC-0091823', 'Bank reference recorded')

  // 5B. Split Tender (Cash + UPI + Card)
  const splitInvoice = await billingService.createInvoice({
    clientName: 'Sunita Reddy',
    subtotal: 5000,
    isGstInvoice: false,
    primaryPaymentMethod: 'split',
    payments: [
      { method: 'cash', amount: 1000 },
      { method: 'upi', amount: 2000, transactionReference: 'UPI-SPLIT-1' },
      { method: 'card', amount: 2000, transactionReference: 'CARD-SPLIT-2' },
    ],
  })
  assert(splitInvoice.primaryPaymentMethod === 'split', 'Invoice has split payment tender')
  assert(splitInvoice.payments.length === 3, 'Invoice holds all 3 split payment records')
  assert(splitInvoice.paidAmount === 5000, 'Sum of split payments equals ₹5,000')
  assert(splitInvoice.balanceDue === 0, 'Balance due is ₹0.00')
  assert(splitInvoice.paymentStatus === 'paid', 'Status is fully paid')

  // --------------------------------------------------------------------------
  // TEST SUITE 6: Partial Payments & Outstanding Receivables
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 6: Partial Payments & Outstanding Receivables ---')

  const partialInvoice = await billingService.createInvoice({
    clientName: 'Tanvi Shah',
    subtotal: 4000,
    isGstInvoice: false,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 1500 }],
  })
  assert(partialInvoice.totalAmount === 4000, 'Total bill is ₹4,000')
  assert(partialInvoice.paidAmount === 1500, 'Paid amount is ₹1,500')
  assert(partialInvoice.balanceDue === 2500, 'Balance due is ₹2,500')
  assert(partialInvoice.paymentStatus === 'partial', 'Payment status is partial')

  // Additional payment toward partial invoice
  const settledInvoice = await billingService.recordAdditionalPayment(partialInvoice.id, {
    method: 'upi',
    amount: 2500,
    transactionReference: 'UPI-SETTLE-PARTIAL-1',
  })
  assert(settledInvoice.paidAmount === 4000, 'After additional payment, paid amount is ₹4,000')
  assert(settledInvoice.balanceDue === 0, 'Balance due is now ₹0.00')
  assert(settledInvoice.paymentStatus === 'paid', 'Invoice automatically transitions to paid')

  // --------------------------------------------------------------------------
  // TEST SUITE 7: Draft Cart Persistence vs Sequential Tax Invoices
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 7: Draft Carts vs Official Tax Invoices ---')

  const draft = await billingService.saveDraft({
    clientName: 'Walk-in Draft Guest',
    subtotal: 1800,
    isGstInvoice: true,
    taxRate: 0.18,
    primaryPaymentMethod: 'cash',
    payments: [],
    walkInGuest: true,
  })

  assert(draft.invoiceNumber.startsWith('DRAFT-'), `Draft identifier is formatted as DRAFT-XXX (got ${draft.invoiceNumber})`)
  assert(draft.isDraft === true, 'Draft has isDraft = true')
  assert(draft.paymentStatus === 'draft', 'Draft has paymentStatus = draft')

  const draftsList = billingService.getAllDrafts()
  assert(draftsList.some((d) => d.id === draft.id), 'Draft exists in canonical draft store')

  // Finalize the draft
  const finalizedBill = await billingService.createInvoice({
    draftId: draft.id,
    clientName: 'Walk-in Draft Guest',
    subtotal: 1800,
    isGstInvoice: true,
    taxRate: 0.18,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: roundMoney(1800 * 1.18) }],
  })

  assert(finalizedBill.invoiceNumber.startsWith('INV-2026-'), `Finalized bill has official sequence number: ${finalizedBill.invoiceNumber}`)
  assert(!finalizedBill.isDraft, 'Finalized bill has isDraft = false')

  const updatedDraftsList = billingService.getAllDrafts()
  assert(!updatedDraftsList.some((d) => d.id === draft.id), 'Finalized draft automatically removed from drafts store')

  // --------------------------------------------------------------------------
  // TEST SUITE 8: Walk-in Billing vs Appointment-Linked Billing
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 8: Walk-in Billing vs Appointment-Linked Billing ---')

  // Walk-in Guest (No client ID or appointment ID required)
  const walkInBill = await billingService.createInvoice({
    clientName: 'Walk-in Guest',
    subtotal: 750,
    isGstInvoice: false,
    walkInGuest: true,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: 750 }],
  })
  assert(walkInBill.walkInGuest === true, 'Bill flagged as walk-in guest')
  assert(walkInBill.clientName === 'Walk-in Guest', 'Client name recorded as Walk-in Guest')

  // Appointment-linked Bill
  const apptBill = await billingService.createInvoice({
    appointmentId: 'appt-today-sample-01',
    clientId: 'client-neha-01',
    clientName: 'Neha Sharma',
    clientPhone: '+91 98765 12345',
    subtotal: 1500,
    isGstInvoice: true,
    primaryPaymentMethod: 'upi',
    payments: [{ method: 'upi', amount: roundMoney(1500 * 1.18), transactionReference: 'UPI-APPT-01' }],
  })
  assert(apptBill.appointmentId === 'appt-today-sample-01', 'Appointment ID properly linked')
  assert(apptBill.clientId === 'client-neha-01', 'Registered Client ID properly linked')

  // --------------------------------------------------------------------------
  // TEST SUITE 9: Backward Compatibility & KPI Engine
  // --------------------------------------------------------------------------
  console.log('\n--- SUITE 9: Backward Compatibility & KPI Computation Engine ---')

  // Single-service legacy call from CheckoutBillingDrawer.tsx
  const legacyCheckoutBill = await billingService.createInvoice({
    appointmentId: 'appt-legacy-drawer-01',
    clientId: 'client-legacy-01',
    clientName: 'Legacy Checkout Customer',
    serviceId: 'srv-single-01',
    serviceName: 'Express Blowdry',
    staffId: 'staff-priya-01',
    subtotal: 800,
    applyTax: true,
    primaryPaymentMethod: 'cash',
    payments: [{ method: 'cash', amount: roundMoney(800 * 1.18) }],
  })
  assert(legacyCheckoutBill.lineItems.length === 1, 'Legacy call auto-converts to 1 line item')
  assert(legacyCheckoutBill.lineItems[0].description === 'Express Blowdry', 'Legacy service description preserved')
  assert(legacyCheckoutBill.totalAmount === roundMoney(800 * 1.18), 'Legacy calculation accurate')

  // Test getTodayKpis
  const kpis = billingService.getTodayKpis()
  assert(kpis.todayBilledAmount > 0, `KPIs: Today's Billed is ₹${kpis.todayBilledAmount.toFixed(2)}`)
  assert(kpis.todayCollectedAmount > 0, `KPIs: Today's Collected is ₹${kpis.todayCollectedAmount.toFixed(2)}`)
  assert(kpis.todayInvoicesCount > 0, `KPIs: Invoices count is ${kpis.todayInvoicesCount}`)
  assert(typeof kpis.cashCollected === 'number', 'KPIs: Cash collected metric computed')
  assert(typeof kpis.upiCollected === 'number', 'KPIs: UPI collected metric computed')
  assert(typeof kpis.cardCollected === 'number', 'KPIs: Card collected metric computed')
  assert(typeof kpis.bankCollected === 'number', 'KPIs: Bank collected metric computed')

  console.log('\n=============================================================')
  console.log(` RESULTS: ${passedTests} passed, ${failedTests} failed`)
  console.log('=============================================================\n')

  if (failedTests > 0) {
    process.exit(1)
  }
}

void runTestSuite()
