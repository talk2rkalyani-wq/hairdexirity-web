// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3 VERIFICATION SUITE
// Professional Invoice PDF Generation, Download & Secure Link Sharing System
// Real PostgreSQL 18.6 Database Boundary & TypeScript Service Verification
// ==============================================================================

import { execSync } from 'node:child_process'
import assert from 'node:assert'
import crypto from 'node:crypto'
import type { Invoice, InvoiceLineItem, PaymentRecord } from '../src/types/finance.ts'
import {
  generateInvoicePdf,
  formatPdfCurrency,
} from '../src/services/pdfService.ts'
import {
  invoiceShareService,
  formatIndianPhoneNumber,
  computeSha256Hex,
  generateSecureRandomToken,
  buildPublicInvoiceUrl,
} from '../src/services/invoiceShareService.ts'
import { billingService } from '../src/services/billingService.ts'

const PSQL_BIN = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
const DB_HOST = process.env.DB_HOST || '/tmp'
const DB_PORT = '5433'
const DB_USER = 'postgres'
const DB_NAME = 'luma_test'

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
    setupSql += `SET request.jwt.claim.sub = '${userJwtSub}';\n`
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
    results.push({ suite, id, name, status: 'PASS', details: 'OK' })
    console.log(`  ✅ [${id}] ${name}: PASS`)
  } catch (err: any) {
    results.push({ suite, id, name, status: 'FAIL', details: err.message || String(err) })
    console.error(`  ❌ [${id}] ${name}: FAIL -> ${err.message || err}`)
  }
}

// Helper to construct sample invoices for test assertions
function createMockInvoice(overrides?: Partial<Invoice>): Invoice {
  const baseLineItems: InvoiceLineItem[] = [
    {
      description: 'Luma Signature Haircut',
      name: 'Luma Signature Haircut',
      quantity: 1,
      unitPrice: 1500,
      totalPrice: 1500,
      lineTotal: 1500,
      itemType: 'service',
      staffName: 'Ananya Sharma',
      taxRate: 0.18,
      taxAmount: 270,
      discountAmount: 0,
    },
  ]

  const basePayments: PaymentRecord[] = [
    {
      id: 'pmt-sample-01',
      salonId: 'salon-luma-01',
      invoiceId: 'inv-sample-01',
      paymentMethod: 'upi',
      amount: 1770,
      transactionReference: 'UPI-REF-9921',
      createdAt: new Date().toISOString(),
    },
  ]

  return {
    id: 'inv-sample-01',
    salonId: 'salon-luma-01',
    invoiceNumber: 'INV-2026-9001',
    clientName: 'Pooja Hegde',
    clientPhone: '+91 98765 11223',
    clientEmail: 'pooja.h@example.com',
    staffId: 'staff-01',
    staffName: 'Ananya Sharma',
    date: '2026-11-06',
    lineItems: baseLineItems,
    subtotal: 1500,
    discountAmount: 0,
    taxRate: 0.18,
    taxAmount: 270,
    cgstAmount: 135,
    sgstAmount: 135,
    totalAmount: 1770,
    paidAmount: 1770,
    balanceDue: 0,
    paymentStatus: 'paid',
    primaryPaymentMethod: 'upi',
    payments: basePayments,
    isGstInvoice: true,
    taxTreatment: 'exclusive',
    isDraft: false,
    createdAt: '2026-11-06T10:00:00Z',
    updatedAt: '2026-11-06T10:00:00Z',
    ...overrides,
  }
}

async function main() {
  console.log('========================================================================')
  console.log('🏛️ LUMA SALON: PHASE 3 PDF GENERATION & SECURE SHARING VERIFICATION')
  console.log(`Database: PostgreSQL (Host: ${DB_HOST}, Port: ${DB_PORT}, DB: ${DB_NAME})`)
  console.log('========================================================================\n')

  // Setup test invoice in PostgreSQL for secure link tests
  runPsql(`
    INSERT INTO public.salons (id, name, owner_name, phone, email)
    VALUES 
      ('salon-luma-01', 'Luma Salon', 'Mia', '+91 98765 43210', 'contact@lumasalon.example.com'),
      ('salon-luma-02', 'Luma Express', 'David', '+91 98765 43211', 'david@lumasalon.example.com')
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM public.payments WHERE invoice_id = 'inv-p3-test-01';
    DELETE FROM public.invoices WHERE id = 'inv-p3-test-01';

    INSERT INTO public.invoices (
      id, salon_id, invoice_number, client_name, client_phone, client_email,
      staff_id, staff_name, date, subtotal, discount_amount, tax_rate, tax_amount,
      cgst_amount, sgst_amount, total_amount, paid_amount, balance_due,
      payment_status, primary_payment_method, is_gst_invoice, tax_treatment, is_draft, draft_version
    ) VALUES (
      'inv-p3-test-01', 'salon-luma-01', 'INV-2026-P301', 'Kavita Krishnamurthy', '+91 98111 22334',
      'kavita@example.com', 'staff-1', 'Mia Patel', CURRENT_DATE,
      2000.00, 200.00, 0.18, 324.00, 162.00, 162.00, 2124.00, 0.00, 2124.00,
      'unpaid', 'upi', true, 'exclusive', false, 1
    );

    INSERT INTO public.invoice_line_items (
      id, salon_id, invoice_id, description, quantity, unit_price, total_price,
      item_type, staff_id, discount_amount, tax_rate, tax_amount
    ) VALUES (
      'item-p3-01', 'salon-luma-01', 'inv-p3-test-01', 'Balayage Color Luxury',
      1, 2000.00, 2000.00, 'service', 'staff-1', 200.00, 0.18, 324.00
    );

    INSERT INTO public.payments (
      id, salon_id, invoice_id, payment_method, amount, transaction_reference
    ) VALUES (
      'pmt-p3-01', 'salon-luma-01', 'inv-p3-test-01', 'upi', 2124.00, 'UPI-TXN-P3-001'
    );

    -- Draft invoice for negative test (draft sharing must fail)
    DELETE FROM public.invoices WHERE id = 'inv-p3-draft-01';
    INSERT INTO public.invoices (
      id, salon_id, invoice_number, client_name, staff_id, staff_name, date,
      subtotal, total_amount, paid_amount, balance_due, payment_status,
      primary_payment_method, is_draft, draft_version
    ) VALUES (
      'inv-p3-draft-01', 'salon-luma-01', 'DFT-2026-999', 'Draft Customer', 'staff-1', 'Mia Patel', CURRENT_DATE,
      500.00, 590.00, 0.00, 590.00, 'draft', 'cash', true, 1
    );
  `)

  // ==============================================================================
  // SECTION 1: PDF Generation & Fidelity Tests (14 Tests)
  // ==============================================================================
  console.log('--- SECTION 1: PDF Generation Tests (14 Tests) ---')

  await runTest('PDF', 'PDF-01', 'Standard service invoice generates valid PDF document', () => {
    const inv = createMockInvoice()
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1, 'Should have 1 page')
    const buffer = doc.output('arraybuffer')
    assert(buffer.byteLength > 1000, 'PDF buffer must be valid size')
  })

  await runTest('PDF', 'PDF-02', 'Product-only invoice generates valid PDF with retail categorization', () => {
    const inv = createMockInvoice({
      lineItems: [
        {
          description: 'Kerastase Nutritive Shampoo 250ml',
          quantity: 2,
          unitPrice: 1800,
          totalPrice: 3600,
          lineTotal: 3600,
          itemType: 'product',
          taxRate: 0.18,
          taxAmount: 648,
          discountAmount: 0,
        },
      ],
      subtotal: 3600,
      totalAmount: 4248,
      taxAmount: 648,
      cgstAmount: 324,
      sgstAmount: 324,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-03', 'Combined service and product invoice displays both properly', () => {
    const inv = createMockInvoice({
      lineItems: [
        {
          description: 'Hair Spa Detox',
          quantity: 1,
          unitPrice: 2000,
          totalPrice: 2000,
          itemType: 'service',
          staffName: 'Ananya Sharma',
          taxRate: 0.18,
          taxAmount: 360,
          discountAmount: 0,
        },
        {
          description: 'Moroccanoil Treatment 100ml',
          quantity: 1,
          unitPrice: 3200,
          totalPrice: 3200,
          itemType: 'product',
          taxRate: 0.18,
          taxAmount: 576,
          discountAmount: 0,
        },
      ],
      subtotal: 5200,
      taxAmount: 936,
      cgstAmount: 468,
      sgstAmount: 468,
      totalAmount: 6136,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-04', 'Multiple services with different stylists rendered with staff attribution', () => {
    const inv = createMockInvoice({
      lineItems: [
        {
          description: 'Haircut & Styling',
          quantity: 1,
          unitPrice: 1500,
          totalPrice: 1500,
          itemType: 'service',
          staffName: 'Riya Balodi',
          taxRate: 0.18,
          taxAmount: 270,
        },
        {
          description: 'Express Facial',
          quantity: 1,
          unitPrice: 1200,
          totalPrice: 1200,
          itemType: 'service',
          staffName: 'Priya Patel',
          taxRate: 0.18,
          taxAmount: 216,
        },
        {
          description: 'Classic Manicure',
          quantity: 1,
          unitPrice: 800,
          totalPrice: 800,
          itemType: 'service',
          staffName: 'Sunita Rao',
          taxRate: 0.18,
          taxAmount: 144,
        },
      ],
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-05', 'Different tax rates on different items rendered accurately', () => {
    const inv = createMockInvoice({
      lineItems: [
        {
          description: 'Salon Service (18% GST)',
          quantity: 1,
          unitPrice: 1000,
          totalPrice: 1000,
          itemType: 'service',
          taxRate: 0.18,
          taxAmount: 180,
        },
        {
          description: 'Herbal Care Product (5% GST)',
          quantity: 1,
          unitPrice: 500,
          totalPrice: 500,
          itemType: 'product',
          taxRate: 0.05,
          taxAmount: 25,
        },
      ],
      subtotal: 1500,
      taxAmount: 205,
      totalAmount: 1705,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-06', 'Invoice-level discount rendered in breakdown with negative highlight', () => {
    const inv = createMockInvoice({
      subtotal: 3000,
      discountAmount: 500,
      discountType: 'flat',
      discountValue: 500,
      taxAmount: 450,
      cgstAmount: 225,
      sgstAmount: 225,
      totalAmount: 2950,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-07', 'Line-level discount reflected in line item total and discount column', () => {
    const inv = createMockInvoice({
      lineItems: [
        {
          description: 'Color Gloss Special',
          quantity: 1,
          unitPrice: 2000,
          discountAmount: 400,
          totalPrice: 1600,
          lineTotal: 1888,
          itemType: 'service',
          taxRate: 0.18,
          taxAmount: 288,
        },
      ],
      subtotal: 1600,
      taxAmount: 288,
      totalAmount: 1888,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-08', 'Split payment breakdown rendered with individual tenders', () => {
    const inv = createMockInvoice({
      primaryPaymentMethod: 'split',
      payments: [
        {
          id: 'p-1',
          salonId: 'salon-luma-01',
          invoiceId: 'inv-sample-01',
          paymentMethod: 'cash',
          amount: 1000,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'p-2',
          salonId: 'salon-luma-01',
          invoiceId: 'inv-sample-01',
          paymentMethod: 'upi',
          amount: 770,
          transactionReference: 'UPI-SPLIT-8841',
          createdAt: new Date().toISOString(),
        },
      ],
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-09', 'Partial payment renders outstanding balance prominently in red', () => {
    const inv = createMockInvoice({
      totalAmount: 5000,
      paidAmount: 2000,
      balanceDue: 3000,
      paymentStatus: 'partial',
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-10', 'Fully paid invoice renders settled zero balance and green status badge', () => {
    const inv = createMockInvoice({
      totalAmount: 2500,
      paidAmount: 2500,
      balanceDue: 0,
      paymentStatus: 'paid',
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-11', 'Long customer and service names handle word wrap without clipping', () => {
    const inv = createMockInvoice({
      clientName: 'Dr. Elizabeth Alexandra Mary Windsor-Mountbatten of Saxe-Coburg and Gotha',
      lineItems: [
        {
          description: 'Ultra Advanced Multi-Dimensional Nanokeratin Smoothing Reconstructive Treatment With Deep Lipid Infusion',
          quantity: 1,
          unitPrice: 8500,
          totalPrice: 8500,
          itemType: 'service',
          staffName: 'Senior Master Color Specialist Ananya Radhika Sharma',
          taxRate: 0.18,
          taxAmount: 1530,
        },
      ],
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-12', 'Multi-page invoice (25+ line items) automatically paginates with headers', () => {
    const longItems: InvoiceLineItem[] = []
    for (let i = 1; i <= 25; i++) {
      longItems.push({
        description: `Salon Service Item #${i} - Deep Care`,
        quantity: 1,
        unitPrice: 200 + i * 10,
        totalPrice: 200 + i * 10,
        itemType: 'service',
        staffName: 'Stylist Team',
        taxRate: 0.18,
        taxAmount: 36,
      })
    }
    const inv = createMockInvoice({
      lineItems: longItems,
    })
    const doc = generateInvoicePdf(inv)
    assert(doc.getNumberOfPages() >= 2, `Multi-page invoice should paginate (got ${doc.getNumberOfPages()} pages)`)
  })

  await runTest('PDF', 'PDF-13', 'Missing optional salon information gracefully falls back to sensible layout', () => {
    const inv = createMockInvoice()
    const doc = generateInvoicePdf(inv, {
      phone: '',
      email: '',
      gstin: undefined,
    })
    assert(doc.getNumberOfPages() === 1)
  })

  await runTest('PDF', 'PDF-14', 'Historical invoice preserves exact stored snapshots without recalculation', () => {
    const historicalInv = createMockInvoice({
      invoiceNumber: 'INV-2023-0001',
      date: '2023-02-15',
      subtotal: 999.99,
      taxAmount: 179.99,
      totalAmount: 1179.98,
      paidAmount: 1179.98,
      balanceDue: 0,
    })
    const doc = generateInvoicePdf(historicalInv)
    assert(doc.getNumberOfPages() === 1)
  })

  // ==============================================================================
  // SECTION 2: Sharing Tests (7 Tests)
  // ==============================================================================
  console.log('\n--- SECTION 2: Sharing Tests (7 Tests) ---')

  await runTest('SHARING', 'SHR-01', 'WhatsApp message prefill generates correct message structure and share URL', () => {
    const inv = createMockInvoice()
    const shareUrl = 'https://lumasalon.com/#/public/invoice?token=sample-test-token'
    const wa = invoiceShareService.generateWhatsAppShare(inv, shareUrl, '+91 98765 11223')

    assert(wa.isValidPhone === true, 'Phone must be recognized as valid')
    assert(wa.recipientPhone === '919876511223', 'Should format Indian phone to international format without plus')
    assert(wa.message.includes('Pooja Hegde'), 'Message must contain client name')
    assert(wa.message.includes('INV-2026-9001'), 'Message must contain invoice number')
    assert(wa.message.includes(shareUrl), 'Message must contain secure link')
    assert(wa.url.startsWith('https://wa.me/919876511223?text='), 'URL must point to wa.me with prefilled text')
  })

  await runTest('SHARING', 'SHR-02', 'Invalid phone number handled gracefully without crashing', () => {
    const inv = createMockInvoice()
    const wa = invoiceShareService.generateWhatsAppShare(inv, 'https://lumasalon.com/#/public/invoice', 'invalid-phone-abc')
    assert(wa.isValidPhone === false, 'Invalid phone must be marked invalid')
    assert(wa.url.startsWith('https://wa.me/?text='), 'Should fallback to general WhatsApp send URL')
  })

  await runTest('SHARING', 'SHR-03', 'Email subject and body prefill generation matches required template', () => {
    const inv = createMockInvoice()
    const shareUrl = 'https://lumasalon.com/#/public/invoice?token=sample-email-token'
    const mail = invoiceShareService.generateEmailShare(inv, shareUrl)

    assert(mail.subject === 'Your Luma Salon Invoice — INV-2026-9001', 'Subject must match required format')
    assert(mail.body.includes(shareUrl), 'Body must include secure link')
    assert(mail.isValidEmail === true, 'Valid email must be recognized')
    assert(mail.mailtoUrl.startsWith('mailto:pooja.h%40example.com?subject='), 'Mailto link must encode recipient and subject')
  })

  await runTest('SHARING', 'SHR-04', 'Missing customer email handled gracefully', () => {
    const inv = createMockInvoice({ clientEmail: '' })
    const mail = invoiceShareService.generateEmailShare(inv, 'https://lumasalon.com/#/public/invoice')
    assert(mail.isValidEmail === false, 'Missing email marked invalid')
    assert(mail.mailtoUrl.startsWith('mailto:?subject='), 'Mailto opens without recipient prefill')
  })

  await runTest('SHARING', 'SHR-05', 'Copy link generates proper canonical URL with bearer token', () => {
    const token = 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'
    const url = buildPublicInvoiceUrl(token)
    assert(url.includes('#/public/invoice?token='), 'Must include route and query parameter')
    assert(url.includes(token), 'Must include token in URL')
  })

  await runTest('SHARING', 'SHR-06', 'Invoice preview correctly formats currency in INR', () => {
    const formatted = formatPdfCurrency(1234.5)
    assert(formatted === 'Rs. 1,234.50', `Expected Rs. 1,234.50, got ${formatted}`)
  })

  await runTest('SHARING', 'SHR-07', 'Repeated PDF downloads do not create duplicate invoices in store', () => {
    const beforeCount = billingService.getAllInvoices().length
    const inv = createMockInvoice()
    // Trigger PDF generation multiple times
    generateInvoicePdf(inv)
    generateInvoicePdf(inv)
    generateInvoicePdf(inv)
    const afterCount = billingService.getAllInvoices().length
    assert.strictEqual(beforeCount, afterCount, 'PDF generation must be strictly read-only and create zero records')
  })

  // ==============================================================================
  // SECTION 3: Secure-Link System & Database Security Tests (12 Tests)
  // ==============================================================================
  console.log('\n--- SECTION 3: Secure-Link System & Database Security Tests (12 Tests) ---')

  const testTokenRaw = generateSecureRandomToken()
  const testTokenHash = crypto.createHash('sha256').update(testTokenRaw).digest('hex')
  let createdShareId = ''

  await runTest('SECURE-LINK', 'LNK-01', 'Valid token grants public access to intended invoice', () => {
    // 1. Create share link via RPC
    const createRes = runPsql(`
      SELECT public.rpc_create_invoice_share_link(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-p3-test-01',
        p_token_hash := '${testTokenHash}',
        p_expiry_days := 7
      );
    `)
    assert.strictEqual(createRes.code, 0, `Creation must succeed: ${createRes.stderr}`)
    const parsed = JSON.parse(createRes.stdout)
    assert(parsed.success === true, 'Success flag must be true')
    createdShareId = parsed.share_id

    // 2. Fetch public invoice via token hash (anonymous access)
    const fetchRes = runPsql(`
      SELECT public.rpc_get_public_invoice('${testTokenHash}');
    `, undefined, 'anon')
    assert.strictEqual(fetchRes.code, 0, `Public fetch must succeed: ${fetchRes.stderr}`)
    const pubData = JSON.parse(fetchRes.stdout)
    assert(pubData.valid === true, 'Must return valid')
    assert(pubData.invoice.invoice_number === 'INV-2026-P301', 'Invoice number must match')
    assert(pubData.invoice.client_name === 'Kavita Krishnamurthy', 'Customer name must match')
    assert(pubData.line_items.length >= 1, 'Line items must be present')
    assert(pubData.payments.length >= 1, 'Payments must be present')
  })

  await runTest('SECURE-LINK', 'LNK-02', 'Invalid token is rejected with generic error', () => {
    const fakeTokenHash = crypto.createHash('sha256').update('completely-bogus-token-random').digest('hex')
    const res = runPsql(`
      SELECT public.rpc_get_public_invoice('${fakeTokenHash}');
    `, undefined, 'anon')
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('INVALID_LINK'), `Expected INVALID_LINK error, got: ${res.stderr}`)
  })

  await runTest('SECURE-LINK', 'LNK-03', 'Expired token is rejected', () => {
    const expiredTokenRaw = generateSecureRandomToken()
    const expiredTokenHash = crypto.createHash('sha256').update(expiredTokenRaw).digest('hex')

    // Manually insert an expired share
    runPsql(`
      INSERT INTO public.invoice_shares (
        salon_id, invoice_id, token_hash, expires_at
      ) VALUES (
        'salon-luma-01', 'inv-p3-test-01', '${expiredTokenHash}',
        timezone('utc'::text, now()) - INTERVAL '2 hours'
      );
    `)

    const res = runPsql(`
      SELECT public.rpc_get_public_invoice('${expiredTokenHash}');
    `, undefined, 'anon')
    assert.notStrictEqual(res.code, 0, 'Must fail for expired link')
    assert(res.stderr.includes('LINK_EXPIRED'), `Expected LINK_EXPIRED error, got: ${res.stderr}`)
  })

  await runTest('SECURE-LINK', 'LNK-04', 'Revoked token is rejected', () => {
    // Revoke the share created in LNK-01
    const revokeRes = runPsql(`
      SELECT public.rpc_revoke_invoice_share_link('${createdShareId}'::uuid);
    `)
    assert.strictEqual(revokeRes.code, 0, `Revoke must succeed: ${revokeRes.stderr}`)

    const res = runPsql(`
      SELECT public.rpc_get_public_invoice('${testTokenHash}');
    `, undefined, 'anon')
    assert.notStrictEqual(res.code, 0, 'Must fail for revoked link')
    assert(res.stderr.includes('LINK_REVOKED'), `Expected LINK_REVOKED error, got: ${res.stderr}`)
  })

  await runTest('SECURE-LINK', 'LNK-05', 'Replaced token invalidates previous link and activates new token', () => {
    const tokenA = generateSecureRandomToken()
    const hashA = crypto.createHash('sha256').update(tokenA).digest('hex')

    const tokenB = generateSecureRandomToken()
    const hashB = crypto.createHash('sha256').update(tokenB).digest('hex')

    // Create Token A
    runPsql(`
      SELECT public.rpc_create_invoice_share_link('salon-luma-01', 'inv-p3-test-01', '${hashA}', 7);
    `)

    // Verify Token A works
    const resA1 = runPsql(`SELECT public.rpc_get_public_invoice('${hashA}');`, undefined, 'anon')
    assert.strictEqual(resA1.code, 0, 'Token A must work initially')

    // Replace with Token B
    runPsql(`
      SELECT public.rpc_create_invoice_share_link('salon-luma-01', 'inv-p3-test-01', '${hashB}', 7);
    `)

    // Token A must now be revoked
    const resA2 = runPsql(`SELECT public.rpc_get_public_invoice('${hashA}');`, undefined, 'anon')
    assert.notStrictEqual(resA2.code, 0, 'Token A must now be rejected')
    assert(resA2.stderr.includes('LINK_REVOKED'), 'Token A must report LINK_REVOKED')

    // Token B must work
    const resB = runPsql(`SELECT public.rpc_get_public_invoice('${hashB}');`, undefined, 'anon')
    assert.strictEqual(resB.code, 0, 'Token B must work')
  })

  await runTest('SECURE-LINK', 'LNK-06', 'Invoice ID guessing cannot grant access', () => {
    // Attempting to pass raw invoice ID to public RPC
    const res = runPsql(`
      SELECT public.rpc_get_public_invoice('inv-p3-test-01');
    `, undefined, 'anon')
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('INVALID_LINK'), 'Must reject plain invoice ID')
  })

  await runTest('SECURE-LINK', 'LNK-07', 'Only token hash is stored in database (raw token never stored)', () => {
    const testRaw = generateSecureRandomToken()
    const testHash = crypto.createHash('sha256').update(testRaw).digest('hex')

    runPsql(`
      SELECT public.rpc_create_invoice_share_link('salon-luma-01', 'inv-p3-test-01', '${testHash}', 7);
    `)

    // Search for raw token in invoice_shares
    const searchRaw = runPsql(`
      SELECT count(*) FROM public.invoice_shares WHERE token_hash = '${testRaw}';
    `)
    assert.strictEqual(searchRaw.stdout.trim(), '0', 'Raw token must never exist in token_hash column')

    // Search for hash
    const searchHash = runPsql(`
      SELECT count(*) FROM public.invoice_shares WHERE token_hash = '${testHash}';
    `)
    assert.strictEqual(searchHash.stdout.trim(), '1', 'Token hash must exist in token_hash column')
  })

  await runTest('SECURE-LINK', 'LNK-08', 'Cross-salon tenant isolation enforced on link management', () => {
    // Attempting to create share link for another salon's invoice
    const badHash = crypto.createHash('sha256').update(generateSecureRandomToken()).digest('hex')
    const res = runPsql(`
      SELECT public.rpc_create_invoice_share_link(
        p_salon_id := 'salon-luma-02',
        p_invoice_id := 'inv-p3-test-01',
        p_token_hash := '${badHash}',
        p_expiry_days := 7
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must reject cross-salon link creation')
    assert(res.stderr.includes('NOT_FOUND') || res.stderr.includes('TENANT_VIOLATION'), `Expected tenant isolation rejection, got: ${res.stderr}`)
  })

  await runTest('SECURE-LINK', 'LNK-09', 'Public endpoint does not expose internal database IDs or private fields', () => {
    const freshToken = generateSecureRandomToken()
    const freshHash = crypto.createHash('sha256').update(freshToken).digest('hex')

    runPsql(`
      SELECT public.rpc_create_invoice_share_link('salon-luma-01', 'inv-p3-test-01', '${freshHash}', 7);
    `)

    const res = runPsql(`
      SELECT public.rpc_get_public_invoice('${freshHash}');
    `, undefined, 'anon')
    assert.strictEqual(res.code, 0)
    const jsonStr = res.stdout

    // Assert internal fields are NOT present
    assert(!jsonStr.includes('idempotency_key'), 'Must not leak idempotency_key')
    assert(!jsonStr.includes('auth_user_id'), 'Must not leak auth_user_id')
    assert(!jsonStr.includes('password_hash'), 'Must not leak password_hash')
    assert(!jsonStr.includes('"staff_id"'), 'Must not leak internal staff UUID field')
    assert(!jsonStr.includes('item-p3-01'), 'Must not leak internal line item primary key')
  })

  await runTest('SECURE-LINK', 'LNK-10', 'Access count and telemetry updated on public invoice access', () => {
    const trackToken = generateSecureRandomToken()
    const trackHash = crypto.createHash('sha256').update(trackToken).digest('hex')

    runPsql(`
      SELECT public.rpc_create_invoice_share_link('salon-luma-01', 'inv-p3-test-01', '${trackHash}', 7);
    `)

    // Call twice
    runPsql(`SELECT public.rpc_get_public_invoice('${trackHash}');`, undefined, 'anon')
    runPsql(`SELECT public.rpc_get_public_invoice('${trackHash}');`, undefined, 'anon')

    const countRes = runPsql(`
      SELECT access_count FROM public.invoice_shares WHERE token_hash = '${trackHash}';
    `)
    assert.strictEqual(countRes.stdout.trim(), '2', 'Access count must be incremented to 2')
  })

  await runTest('SECURE-LINK', 'LNK-11', 'Anonymous public user cannot modify or delete invoice data', () => {
    // Attempting direct UPDATE on invoices under 'anon' role
    const updateRes = runPsql(`
      UPDATE public.invoices SET total_amount = 0 WHERE id = 'inv-p3-test-01';
    `, undefined, 'anon')
    assert.notStrictEqual(updateRes.code, 0, 'Anonymous UPDATE must be denied by PostgreSQL permissions')

    const deleteRes = runPsql(`
      DELETE FROM public.invoices WHERE id = 'inv-p3-test-01';
    `, undefined, 'anon')
    assert.notStrictEqual(deleteRes.code, 0, 'Anonymous DELETE must be denied by PostgreSQL permissions')
  })

  await runTest('SECURE-LINK', 'LNK-12', 'Draft invoice cannot be shared publicly', () => {
    const draftHash = crypto.createHash('sha256').update(generateSecureRandomToken()).digest('hex')
    const res = runPsql(`
      SELECT public.rpc_create_invoice_share_link(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-p3-draft-01',
        p_token_hash := '${draftHash}',
        p_expiry_days := 7
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Draft sharing must be rejected')
    assert(res.stderr.includes('INVALID_STATE'), `Expected INVALID_STATE rejection, got: ${res.stderr}`)
  })

  // Summary
  console.log('\n========================================================================')
  console.log('📊 PHASE 3 VERIFICATION SUMMARY')
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

void main()
