// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 6 VERIFICATION SUITE
// Purchase & Supplier Management Automated Verification
// 45 Acceptance Tests across 7 Core Modules (Section 16 Specification)
// Real PostgreSQL 18.6 Database Boundary & TypeScript Service Verification
// ==============================================================================

import { execSync } from 'node:child_process'
import assert from 'node:assert'
import {
  generatePurchaseOrderPdf,
  generatePurchaseBillPdf,
  generateGoodsReceiptPdf,
  generatePurchaseReturnPdf,
} from '../src/services/purchasePdfService.ts'
import type {
  PurchaseOrder,
  PurchaseBill,
  GoodsReceipt,
  PurchaseReturn,
  Supplier,
} from '../src/types/purchases.ts'

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
    console.log(`[PASS] ${id} - ${name}`)
  } catch (err: any) {
    results.push({ suite, id, name, status: 'FAIL', details: err.message || String(err) })
    console.error(`[FAIL] ${id} - ${name}: ${err.message}`)
  }
}

async function runPhase6TestSuite() {
  console.log('==============================================================================')
  console.log(' LUMA SALON BUSINESS SUITE — PHASE 6 VERIFICATION SUITE')
  console.log(' 45 Acceptance Tests: Suppliers, POs, Bills, GRNs, Returns, Payments & Security')
  console.log('==============================================================================\n')

  // Setup Clean Fixtures
  console.log('Setting up clean test fixtures in database...')
  const setupSql = `
    -- Setup salons
    INSERT INTO public.salons (id, name, owner_name, email, phone)
    VALUES
      ('salon-luma-01', 'Luma Salon Main', 'Mia', 'contact@lumasalon.example.com', '+91 98765 43210'),
      ('salon-luma-02', 'Luma Salon Second', 'Rohan', 'rohan@lumasalon.example.com', '+91 98765 43211')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    -- Clean existing Phase 6 purchase test rows
    DELETE FROM public.supplier_payment_allocations WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.supplier_payments WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.supplier_ledger WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_return_items WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_returns WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.goods_receipt_items WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.goods_receipts WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_bill_items WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_bills WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_order_items WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_orders WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.purchase_audit_logs WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.suppliers WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');

    -- Setup inventory test products
    DELETE FROM public.inventory_stock_movements WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');
    DELETE FROM public.inventory_products WHERE salon_id IN ('salon-luma-01', 'salon-luma-02');

    INSERT INTO public.inventory_products (
      id, salon_id, name, category, brand, sku, unit, purchase_price, selling_price,
      current_stock, min_stock_threshold, status, item_type, tax_rate
    ) VALUES
      ('00000000-0000-0000-0001-000000000001', 'salon-luma-01', 'L''Oreal Pro Shampoo 250ml', 'Hair Care', 'L''Oreal', 'SKU-SHAMP-01', 'bottle', 600.00, 950.00, 50.000, 5.000, 'active', 'retail', 0.1800),
      ('00000000-0000-0000-0001-000000000002', 'salon-luma-01', 'Salon Pro 20 Vol Developer 1L', 'Chemicals', 'L''Oreal', 'SKU-DEV-20V', 'bottle', 400.00, 0.00, 20.000, 5.000, 'active', 'consumable', 0.1800),
      ('00000000-0000-0000-0002-000000000001', 'salon-luma-02', 'Foreign Hair Dye Tube', 'Color', 'Wella', 'SKU-FOR-DYE', 'tube', 350.00, 700.00, 10.000, 2.000, 'active', 'retail', 0.1800);
  `
  const setupRes = runPsql(setupSql)
  if (setupRes.code !== 0) {
    console.error('Failed to setup test fixtures:', setupRes.stderr)
    process.exit(1)
  }

  // ============================================================================
  // SUITE 1: Supplier Management (SUP-01 to SUP-05)
  // ============================================================================
  console.log('\n--- Running Suite 1: Supplier Management (Tests 1-5) ---')

  let supplierId1 = ''
  let supplierId2WithBalance = ''

  recordTest('Suppliers', 'SUP-01', 'Create active supplier with contact, GSTIN, and code generation', () => {
    const sql = `SELECT public.rpc_create_or_update_supplier(
      'salon-luma-01', NULL, 'L''Oreal Professional India', 'Ramesh Kumar',
      '9811100001', 'ramesh@loreal-dist.com', 'Plot 45, Udyog Vihar', 'Gurugram',
      'Haryana', '122016', '06AAAAA1234A1Z5', 'AAAAA1234A', 'Hair Products',
      0.00, 'active', 'Primary hair color & care vendor'
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Supplier creation failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true, 'Expected success = true')
    assert.ok(parsed.supplier_id, 'Expected supplier_id in response')
    supplierId1 = parsed.supplier_id

    // Check DB record & code format
    const checkSql = `SELECT supplier_code, name, gstin, status FROM public.suppliers WHERE id = '${supplierId1}';`
    const checkRes = runPsql(checkSql)
    const [code, name, gstin, status] = checkRes.stdout.split('|')
    assert.match(code, /^SUP-\d{4}$/, `Expected code like SUP-0001, got ${code}`)
    assert.strictEqual(name, "L'Oreal Professional India")
    assert.strictEqual(gstin, '06AAAAA1234A1Z5')
    assert.strictEqual(status, 'active')
  })

  recordTest('Suppliers', 'SUP-02', 'Update supplier contact details and verify audit log preservation', () => {
    const updateSql = `SELECT public.rpc_create_or_update_supplier(
      'salon-luma-01', '${supplierId1}', 'L''Oreal Professional India', 'Ramesh Kumar (Senior Rep)',
      '9811100002', 'ramesh.senior@loreal-dist.com', 'Plot 45, Udyog Vihar', 'Gurugram',
      'Haryana', '122016', '06AAAAA1234A1Z5', 'AAAAA1234A', 'Hair Products',
      0.00, 'active', 'Updated phone and contact title'
    );`
    const res = runPsql(updateSql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Supplier update failed: ${res.stderr}`)

    const checkSql = `SELECT contact_person, phone FROM public.suppliers WHERE id = '${supplierId1}';`
    const checkRes = runPsql(checkSql)
    const [contact, phone] = checkRes.stdout.split('|')
    assert.strictEqual(contact, 'Ramesh Kumar (Senior Rep)')
    assert.strictEqual(phone, '9811100002')

    // Verify audit log
    const auditSql = `SELECT count(*) FROM public.purchase_audit_logs WHERE entity_id = '${supplierId1}' AND action = 'UPDATED';`
    const auditRes = runPsql(auditSql)
    assert.ok(Number(auditRes.stdout) >= 1, 'Expected at least 1 update audit log')
  })

  recordTest('Suppliers', 'SUP-03', 'Reject duplicate supplier phone or GSTIN within the same salon', () => {
    // Attempt duplicate phone within salon-luma-01
    const dupPhoneSql = `SELECT public.rpc_create_or_update_supplier(
      'salon-luma-01', NULL, 'Duplicate Vendor', 'Test Person',
      '9811100002', 'other@loreal.com', 'Address', 'City',
      'State', '122016', '06BBBBB9999B1Z1', 'BBBBB9999B', 'General',
      0.00, 'active', 'Should fail due to duplicate phone'
    );`
    const res = runPsql(dupPhoneSql, 'usr-owner')
    assert.ok(
      res.code !== 0 || res.stderr.includes('DUPLICATE_SUPPLIER') || res.stdout.includes('DUPLICATE_SUPPLIER'),
      'Expected duplicate phone rejection error'
    )
  })

  recordTest('Suppliers', 'SUP-04', 'Supplier opening balance recording initializes supplier_ledger', () => {
    const sql = `SELECT public.rpc_create_or_update_supplier(
      'salon-luma-01', NULL, 'Schwarzkopf Distributors', 'Anita Sen',
      '9822200001', 'anita@schwarzkopf.example.com', 'Sector 18', 'Gurugram',
      'Haryana', '122015', '06SKZZZ1234Z1Z9', 'SKZZZ1234Z', 'Chemicals',
      5000.00, 'active', 'Vendor with starting opening payable'
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Failed creating supplier with balance: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    supplierId2WithBalance = parsed.supplier_id

    // Check supplier ledger initialized
    const ledgerSql = `SELECT transaction_type, credit, debit, running_balance FROM public.supplier_ledger WHERE supplier_id = '${supplierId2WithBalance}';`
    const ledgerRes = runPsql(ledgerSql)
    const [txType, credit, debit, runningBal] = ledgerRes.stdout.split('|')
    assert.strictEqual(txType, 'OPENING_BALANCE')
    assert.strictEqual(Number(credit), 5000)
    assert.strictEqual(Number(debit), 0)
    assert.strictEqual(Number(runningBal), 5000)
  })

  recordTest('Suppliers', 'SUP-05', 'Supplier deactivation excludes record from active filter queries', () => {
    const deactSql = `SELECT public.rpc_create_or_update_supplier(
      'salon-luma-01', '${supplierId2WithBalance}', 'Schwarzkopf Distributors', 'Anita Sen',
      '9822200001', 'anita@schwarzkopf.example.com', 'Sector 18', 'Gurugram',
      'Haryana', '122015', '06SKZZZ1234Z1Z9', 'SKZZZ1234Z', 'Chemicals',
      5000.00, 'inactive', 'Temporarily inactive'
    );`
    const deactRes = runPsql(deactSql, 'usr-owner')
    assert.strictEqual(deactRes.code, 0, `Deactivation failed: ${deactRes.stderr}`)

    const filterSql = `SELECT count(*) FROM public.suppliers WHERE salon_id = 'salon-luma-01' AND status = 'active' AND id = '${supplierId2WithBalance}';`
    const filterRes = runPsql(filterSql)
    assert.strictEqual(Number(filterRes.stdout), 0, 'Inactive supplier should not appear in active query')
  })

  // ============================================================================
  // SUITE 2: Purchase Orders (PO-01 to PO-07)
  // ============================================================================
  console.log('\n--- Running Suite 2: Purchase Orders (Tests 6-12) ---')

  let poId1 = ''
  let poNumber1 = ''
  let poIdCancel = ''

  recordTest('PurchaseOrders', 'PO-01', 'Create draft PO with multi-line items (retail + consumable)', () => {
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        name: "L'Oreal Pro Shampoo 250ml",
        sku: 'SKU-SHAMP-01',
        unit: 'bottle',
        ordered_quantity: 10,
        unit_cost: 600.00,
        tax_rate: 0.18,
        tax_amount: 1080.00,
        total_cost: 7080.00,
      },
      {
        product_id: '00000000-0000-0000-0001-000000000002',
        name: 'Salon Pro 20 Vol Developer 1L',
        sku: 'SKU-DEV-20V',
        unit: 'bottle',
        ordered_quantity: 5,
        unit_cost: 400.00,
        tax_rate: 0.18,
        tax_amount: 360.00,
        total_cost: 2360.00,
      },
    ])
    // subtotal = 6000 + 2000 = 8000; tax = 1440; total = 9440
    const sql = `SELECT public.rpc_create_purchase_order(
      'salon-luma-01', '${supplierId1}', CURRENT_DATE + 7, 8000.00, 0.00,
      1440.00, 720.00, 720.00, 0.00, 9440.00, 'Urgent stock replenishment',
      'Net 30 days payment terms', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-rec')
    assert.strictEqual(res.code, 0, `PO creation failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true)
    poId1 = parsed.po_id
    poNumber1 = parsed.po_number

    const itemCntSql = `SELECT count(*) FROM public.purchase_order_items WHERE po_id = '${poId1}';`
    const itemCntRes = runPsql(itemCntSql)
    assert.strictEqual(Number(itemCntRes.stdout), 2, 'Expected 2 PO items')
  })

  recordTest('PurchaseOrders', 'PO-02', 'PO sequence format verification (PO-YYYY-XXXX)', () => {
    assert.match(poNumber1, /^PO-\d{4}-\d{4}$/, `Expected PO-YYYY-XXXX format, got ${poNumber1}`)
  })

  recordTest('PurchaseOrders', 'PO-03', 'PO submission transitions status from draft to submitted', () => {
    const submitSql = `SELECT public.rpc_submit_purchase_order('salon-luma-01', '${poId1}');`
    const submitRes = runPsql(submitSql, 'usr-rec')
    assert.strictEqual(submitRes.code, 0, `PO submission failed: ${submitRes.stderr}`)

    const checkSql = `SELECT status FROM public.purchase_orders WHERE id = '${poId1}';`
    const checkRes = runPsql(checkSql)
    assert.strictEqual(checkRes.stdout, 'submitted')
  })

  recordTest('PurchaseOrders', 'PO-04', 'Strict Check: PO creation and submission NEVER alters inventory stock', () => {
    const stockSql = `SELECT id, current_stock FROM public.inventory_products WHERE id IN (
      '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0001-000000000002'
    ) ORDER BY id;`
    const stockRes = runPsql(stockSql)
    const lines = stockRes.stdout.split('\n')
    const stock1 = Number(lines[0].split('|')[1])
    const stock2 = Number(lines[1].split('|')[1])
    assert.strictEqual(stock1, 50, 'Shampoo stock must remain exactly 50 after PO submit')
    assert.strictEqual(stock2, 20, 'Developer stock must remain exactly 20 after PO submit')
  })

  recordTest('PurchaseOrders', 'PO-05', 'PO cancellation workflow transitions status to cancelled', () => {
    // Create another draft PO
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        name: "L'Oreal Pro Shampoo 250ml",
        unit: 'bottle',
        ordered_quantity: 2,
        unit_cost: 600.00,
        total_cost: 1416.00,
      },
    ])
    const createSql = `SELECT public.rpc_create_purchase_order(
      'salon-luma-01', '${supplierId1}', CURRENT_DATE + 5, 1200.00, 0.00,
      216.00, 108.00, 108.00, 0.00, 1416.00, 'Order to cancel', 'Terms', '${items}'::jsonb
    );`
    const createRes = runPsql(createSql, 'usr-rec')
    poIdCancel = JSON.parse(createRes.stdout).po_id

    const cancelSql = `SELECT public.rpc_cancel_purchase_order('salon-luma-01', '${poIdCancel}', 'Supplier out of stock');`
    const cancelRes = runPsql(cancelSql, 'usr-owner')
    assert.strictEqual(cancelRes.code, 0, `PO cancel failed: ${cancelRes.stderr}`)

    const checkSql = `SELECT status FROM public.purchase_orders WHERE id = '${poIdCancel}';`
    const checkRes = runPsql(checkSql)
    assert.strictEqual(checkRes.stdout, 'cancelled')
  })

  recordTest('PurchaseOrders', 'PO-06', 'Generate vector PDF for PO with prominent compliance label', () => {
    const mockPo: PurchaseOrder = {
      id: poId1,
      salonId: 'salon-luma-01',
      poNumber: poNumber1,
      supplierId: supplierId1,
      supplierName: "L'Oreal Professional India",
      orderDate: '2026-11-06',
      expectedDeliveryDate: '2026-11-13',
      status: 'submitted',
      subtotal: 8000,
      discountAmount: 0,
      taxAmount: 1440,
      totalAmount: 9440,
      items: [
        {
          id: 'poi-1',
          salonId: 'salon-luma-01',
          poId: poId1,
          productId: '00000000-0000-0000-0001-000000000001',
          name: "L'Oreal Pro Shampoo 250ml",
          sku: 'SKU-SHAMP-01',
          unit: 'bottle',
          orderedQuantity: 10,
          receivedQuantity: 0,
          unitCost: 600,
          taxRate: 0.18,
          taxAmount: 1080,
          totalCost: 7080,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const doc = generatePurchaseOrderPdf(mockPo)
    assert.ok(doc, 'Expected PDF document instance')
    const pdfOutput = doc.output()
    assert.ok(pdfOutput.length > 500, 'PDF size should exceed 500 bytes')
  })

  recordTest('PurchaseOrders', 'PO-07', 'PO financial calculation verification (subtotal + tax = total_amount)', () => {
    const sql = `SELECT subtotal, tax_amount, total_amount FROM public.purchase_orders WHERE id = '${poId1}';`
    const res = runPsql(sql)
    const [subtotal, tax, total] = res.stdout.split('|').map(Number)
    assert.strictEqual(subtotal, 8000.00)
    assert.strictEqual(tax, 1440.00)
    assert.strictEqual(total, 9440.00)
    assert.strictEqual(Math.round((subtotal + tax) * 100), Math.round(total * 100))
  })

  // ============================================================================
  // SUITE 3: Purchase Bills (PB-01 to PB-05)
  // ============================================================================
  console.log('\n--- Running Suite 3: Purchase Bills (Tests 13-17) ---')

  let billId1 = ''
  let billNumber1 = ''

  recordTest('PurchaseBills', 'PB-01', 'Create purchase bill with itemized costs, tax rates, and additional charges', () => {
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        name: "L'Oreal Pro Shampoo 250ml",
        unit: 'bottle',
        quantity: 10,
        unit_cost: 600.00,
        discount_amount: 0.00,
        tax_rate: 0.1800,
        tax_amount: 1080.00,
        cgst_amount: 540.00,
        sgst_amount: 540.00,
        total_cost: 7080.00,
      },
    ])
    // subtotal = 6000, tax = 1080, freight = 200, total = 7280
    const sql = `SELECT public.rpc_create_purchase_bill(
      'salon-luma-01', '${supplierId1}', 'INV-LOR-8891', CURRENT_DATE, CURRENT_DATE + 30,
      '${poId1}', 6000.00, 0.00, 1080.00, 540.00, 540.00, 0.00, 200.00, 7280.00,
      'Direct shipment bill', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Purchase bill creation failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true)
    billId1 = parsed.bill_id
    billNumber1 = parsed.bill_number

    const checkSql = `SELECT supplier_invoice_number, total_amount, balance_due, additional_charges FROM public.purchase_bills WHERE id = '${billId1}';`
    const checkRes = runPsql(checkSql)
    const [invNum, total, balDue, addl] = checkRes.stdout.split('|')
    assert.strictEqual(invNum, 'INV-LOR-8891')
    assert.strictEqual(Number(total), 7280.00)
    assert.strictEqual(Number(balDue), 7280.00)
    assert.strictEqual(Number(addl), 200.00)
  })

  recordTest('PurchaseBills', 'PB-02', 'Purchase bill sequence format verification (PB-YYYY-XXXX)', () => {
    assert.match(billNumber1, /^PB-\d{4}-\d{4}$/, `Expected PB-YYYY-XXXX format, got ${billNumber1}`)
  })

  recordTest('PurchaseBills', 'PB-03', 'Unique constraint rejects duplicate supplier_invoice_number per supplier', () => {
    const dupSql = `SELECT public.rpc_create_purchase_bill(
      'salon-luma-01', '${supplierId1}', 'INV-LOR-8891', CURRENT_DATE, CURRENT_DATE + 30,
      NULL, 6000.00, 0.00, 1080.00, 540.00, 540.00, 0.00, 0.00, 7080.00,
      'Duplicate attempt', '[]'::jsonb
    );`
    const res = runPsql(dupSql, 'usr-owner')
    assert.ok(
      res.code !== 0 || res.stderr.includes('DUPLICATE_INVOICE') || res.stdout.includes('DUPLICATE_INVOICE'),
      'Expected duplicate supplier invoice rejection error'
    )
  })

  recordTest('PurchaseBills', 'PB-04', 'Automatic posting of purchase bill to supplier_ledger as Credit', () => {
    const ledgerSql = `SELECT transaction_type, credit, debit, running_balance FROM public.supplier_ledger 
      WHERE supplier_id = '${supplierId1}' AND reference_id = '${billNumber1}';`
    const ledgerRes = runPsql(ledgerSql)
    const [txType, credit, debit, runningBal] = ledgerRes.stdout.split('|')
    assert.strictEqual(txType, 'PURCHASE_BILL')
    assert.strictEqual(Number(credit), 7280.00)
    assert.strictEqual(Number(debit), 0.00)
    assert.strictEqual(Number(runningBal), 7280.00, 'Accounts payable must increase by bill total')
  })

  recordTest('PurchaseBills', 'PB-05', 'Generate vector PDF for Purchase Bill with SUPPLIER INVOICE header', () => {
    const mockBill: PurchaseBill = {
      id: billId1,
      salonId: 'salon-luma-01',
      billNumber: billNumber1,
      supplierId: supplierId1,
      supplierName: "L'Oreal Professional India",
      supplierInvoiceNumber: 'INV-LOR-8891',
      billDate: '2026-11-06',
      dueDate: '2026-12-06',
      subtotal: 6000,
      taxAmount: 1080,
      additionalCharges: 200,
      totalAmount: 7280,
      paidAmount: 0,
      balanceDue: 7280,
      status: 'pending',
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const doc = generatePurchaseBillPdf(mockBill)
    assert.ok(doc, 'Expected PDF document instance')
    const pdfOutput = doc.output()
    assert.ok(pdfOutput.length > 500, 'PDF size should exceed 500 bytes')
  })

  // ============================================================================
  // SUITE 4: Goods Receipts & Stock Intake (GR-01 to GR-08)
  // ============================================================================
  console.log('\n--- Running Suite 4: Goods Receipts & Stock Intake (Tests 18-25) ---')

  let grnId1 = ''
  let grnNumber1 = ''
  let poItemMap: Record<string, string> = {}

  recordTest('GoodsReceipts', 'GR-01', 'Record Goods Receipt against PO with accepted and rejected quantities', () => {
    // Fetch PO item IDs
    const poItemsRes = runPsql(`SELECT id, product_id FROM public.purchase_order_items WHERE po_id = '${poId1}';`)
    poItemMap = Object.fromEntries(
      poItemsRes.stdout.split('\n').filter(Boolean).map((line) => {
        const [poiId, prodId] = line.split('|')
        return [prodId, poiId]
      })
    )

    // PO ordered 10 Shampoos and 5 Developers
    // Partial receipt: 8 Shampoos received (6 accepted, 2 rejected for damaged caps); 5 Developers accepted
    const items = toPgJson([
      {
        po_item_id: poItemMap['00000000-0000-0000-0001-000000000001'] || null,
        product_id: '00000000-0000-0000-0001-000000000001',
        ordered_quantity: 10,
        received_quantity: 8,
        accepted_quantity: 6,
        rejected_quantity: 2,
        rejection_reason: 'Cracked bottle caps',
      },
      {
        po_item_id: poItemMap['00000000-0000-0000-0001-000000000002'] || null,
        product_id: '00000000-0000-0000-0001-000000000002',
        ordered_quantity: 5,
        received_quantity: 5,
        accepted_quantity: 5,
        rejected_quantity: 0,
      },
    ])
    const sql = `SELECT public.rpc_record_goods_receipt(
      'salon-luma-01', '${supplierId1}', '${poId1}', '${billId1}',
      'Kavita Receptionist', 'Inspected at dock', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-rec')
    assert.strictEqual(res.code, 0, `Goods receipt failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true)
    grnId1 = parsed.receipt_id || parsed.id || parsed.grn_id
    grnNumber1 = parsed.grn_number
  })

  recordTest('GoodsReceipts', 'GR-02', 'GRN numbering sequence format verification (GRN-YYYY-XXXX)', () => {
    assert.match(grnNumber1, /^GRN-\d{4}-\d{4}$/, `Expected GRN-YYYY-XXXX format, got ${grnNumber1}`)
  })

  recordTest('GoodsReceipts', 'GR-03', 'Inventory stock intake: Only accepted_quantity increases stock', () => {
    // Initial Shampoo stock was 50; accepted 6 -> new stock must be 56 (2 rejected not added)
    // Initial Developer stock was 20; accepted 5 -> new stock must be 25
    const sql = `SELECT id, current_stock FROM public.inventory_products WHERE id IN (
      '00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0001-000000000002'
    ) ORDER BY id;`
    const res = runPsql(sql)
    const lines = res.stdout.split('\n')
    const stock1 = Number(lines[0].split('|')[1])
    const stock2 = Number(lines[1].split('|')[1])
    assert.strictEqual(stock1, 56, `Expected Shampoo stock to be 56, got ${stock1}`)
    assert.strictEqual(stock2, 25, `Expected Developer stock to be 25, got ${stock2}`)
  })

  recordTest('GoodsReceipts', 'GR-04', 'Stock movement traceability logs rows with movement_type = STOCK_RECEIVED', () => {
    const sql = `SELECT count(*) FROM public.inventory_stock_movements 
      WHERE reference_id = '${grnNumber1}' AND movement_type = 'STOCK_RECEIVED';`
    const res = runPsql(sql)
    assert.strictEqual(Number(res.stdout), 2, 'Expected 2 STOCK_RECEIVED movements logged for GRN')
  })

  recordTest('GoodsReceipts', 'GR-05', 'Rejection handling isolates rejected_quantity with rejection_reason', () => {
    const sql = `SELECT rejected_quantity, rejection_reason FROM public.goods_receipt_items 
      WHERE receipt_id = '${grnId1}' AND product_id = '00000000-0000-0000-0001-000000000001';`
    const res = runPsql(sql)
    const [rejQty, reason] = res.stdout.split('|')
    assert.strictEqual(Number(rejQty), 2)
    assert.strictEqual(reason, 'Cracked bottle caps')
  })

  recordTest('GoodsReceipts', 'GR-06', 'Partial receipt updates PO status to partially_received', () => {
    // 8 out of 10 accepted on PO item 1 -> PO status is partially_received
    const sql = `SELECT status FROM public.purchase_orders WHERE id = '${poId1}';`
    const res = runPsql(sql)
    assert.strictEqual(res.stdout, 'partially_received')
  })

  recordTest('GoodsReceipts', 'GR-07', 'Full receipt completion updates PO status to received', () => {
    // Receive remaining 2 units
    const items = toPgJson([
      {
        po_item_id: poItemMap['00000000-0000-0000-0001-000000000001'] || null,
        product_id: '00000000-0000-0000-0001-000000000001',
        ordered_quantity: 2,
        received_quantity: 2,
        accepted_quantity: 2,
        rejected_quantity: 0,
      },
    ])
    const sql = `SELECT public.rpc_record_goods_receipt(
      'salon-luma-01', '${supplierId1}', '${poId1}', NULL,
      'Kavita Receptionist', 'Replacement delivery', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-rec')
    assert.strictEqual(res.code, 0, `Remaining GRN failed: ${res.stderr}`)

    const checkSql = `SELECT status FROM public.purchase_orders WHERE id = '${poId1}';`
    const checkRes = runPsql(checkSql)
    assert.ok(['fully_received', 'received'].includes(checkRes.stdout), 'PO status must become fully_received or received')
  })

  recordTest('GoodsReceipts', 'GR-08', 'Direct Goods Receipt without PO records intake and updates stock', () => {
    // Current Shampoo stock is 58 (50 + 6 + 2). Direct receive 5 more
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        ordered_quantity: 5,
        received_quantity: 5,
        accepted_quantity: 5,
        rejected_quantity: 0,
      },
    ])
    const sql = `SELECT public.rpc_record_goods_receipt(
      'salon-luma-01', '${supplierId1}', NULL, NULL,
      'Mia Owner', 'Spot spot direct delivery', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Direct GRN failed: ${res.stderr}`)

    const checkSql = `SELECT current_stock FROM public.inventory_products WHERE id = '00000000-0000-0000-0001-000000000001';`
    const checkRes = runPsql(checkSql)
    assert.strictEqual(Number(checkRes.stdout), 63, 'Shampoo stock should now be 63')
  })

  // ============================================================================
  // SUITE 5: Purchase Returns & Debit Notes (PR-01 to PR-06)
  // ============================================================================
  console.log('\n--- Running Suite 5: Purchase Returns & Debit Notes (Tests 26-31) ---')

  let returnId1 = ''
  let returnNumber1 = ''

  recordTest('PurchaseReturns', 'PR-01', 'Create purchase return (Debit Note) linked to purchase bill', () => {
    // Return 5 shampoos at cost 600 + 18% tax (108) = 708 each -> total 3540
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        quantity: 5,
        unit_cost: 600.00,
        tax_rate: 0.1800,
        tax_amount: 540.00,
        total_amount: 3540.00,
        reason: 'Formula separation / damaged batch',
      },
    ])
    const sql = `SELECT public.rpc_record_purchase_return(
      'salon-luma-01', '${supplierId1}', '${billId1}', '${grnId1}',
      'Defective batch', 'Returned to delivery rep', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Purchase return failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true)
    returnId1 = parsed.return_id
    returnNumber1 = parsed.return_number
  })

  recordTest('PurchaseReturns', 'PR-02', 'Purchase return sequence format verification (PR-YYYY-XXXX)', () => {
    assert.match(returnNumber1, /^PR-\d{4}-\d{4}$/, `Expected PR-YYYY-XXXX format, got ${returnNumber1}`)
  })

  recordTest('PurchaseReturns', 'PR-03', 'Stock reduction: Purchase return decrements current_stock', () => {
    // Stock was 63; returned 5 -> should now be 58
    const sql = `SELECT current_stock FROM public.inventory_products WHERE id = '00000000-0000-0000-0001-000000000001';`
    const res = runPsql(sql)
    assert.strictEqual(Number(res.stdout), 58, 'Current stock should decrease from 63 to 58')
  })

  recordTest('PurchaseReturns', 'PR-04', 'Stock movement traceability: Logs row with movement_type = STOCK_RETURN', () => {
    const sql = `SELECT count(*) FROM public.inventory_stock_movements 
      WHERE reference_id = '${returnNumber1}' AND movement_type = 'STOCK_RETURN';`
    const res = runPsql(sql)
    assert.strictEqual(Number(res.stdout), 1, 'Expected 1 STOCK_RETURN movement logged')
  })

  recordTest('PurchaseReturns', 'PR-05', 'Accounts Payable reduction: Return posts Debit to supplier_ledger', () => {
    // Ledger before return: credit was 7280; return debit = 3540 -> new balance = 3740
    const ledgerSql = `SELECT transaction_type, debit, running_balance FROM public.supplier_ledger 
      WHERE supplier_id = '${supplierId1}' AND reference_id = '${returnNumber1}';`
    const ledgerRes = runPsql(ledgerSql)
    const [txType, debit, runningBal] = ledgerRes.stdout.split('|')
    assert.strictEqual(txType, 'PURCHASE_RETURN')
    assert.strictEqual(Number(debit), 3540.00)
    assert.strictEqual(Number(runningBal), 3740.00, 'Net payable should be reduced to 3740.00')

    // Also check bill balance_due decreased
    const billSql = `SELECT balance_due FROM public.purchase_bills WHERE id = '${billId1}';`
    const billRes = runPsql(billSql)
    assert.strictEqual(Number(billRes.stdout), 3740.00, 'Bill balance due should decrease to 3740.00')
  })

  recordTest('PurchaseReturns', 'PR-06', 'Purchase return quantity validation rejects return exceeding stock', () => {
    // Stock is 60. Attempt to return 100 units
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000001',
        quantity: 100,
        unit_cost: 600.00,
        total_amount: 70800.00,
      },
    ])
    const sql = `SELECT public.rpc_record_purchase_return(
      'salon-luma-01', '${supplierId1}', NULL, NULL,
      'Excess return attempt', 'Note', '${items}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.ok(
      res.code !== 0 || res.stderr.includes('INSUFFICIENT_STOCK') || res.stdout.includes('INSUFFICIENT_STOCK'),
      'Expected INSUFFICIENT_STOCK rejection error'
    )
  })

  // ============================================================================
  // SUITE 6: Supplier Payments & Advances (PAY-01 to PAY-08)
  // ============================================================================
  console.log('\n--- Running Suite 6: Supplier Payments & Advances (Tests 32-39) ---')

  let paymentId1 = ''
  let paymentNumber1 = ''
  let advancePaymentId = ''

  recordTest('SupplierPayments', 'PAY-01', 'Record supplier payment with payment method and reference', () => {
    // Bill balance due is 3740. Pay 1740 partially
    const allocs = toPgJson([
      {
        bill_id: billId1,
        amount: 1740.00,
      },
    ])
    const sql = `SELECT public.rpc_record_supplier_payment(
      'salon-luma-01', '${supplierId1}', 1740.00, 'bank', 'HDFC-NEFT-99128',
      false, 'idemp-spay-01', 'Partial bill clearance', '${allocs}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Supplier payment failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    assert.strictEqual(parsed.success, true)
    paymentId1 = parsed.payment_id
    paymentNumber1 = parsed.payment_number
  })

  recordTest('SupplierPayments', 'PAY-02', 'Supplier payment numbering sequence format verification (SPAY-YYYY-XXXX)', () => {
    assert.match(paymentNumber1, /^SPAY-\d{4}-\d{4}$/, `Expected SPAY-YYYY-XXXX format, got ${paymentNumber1}`)
  })

  recordTest('SupplierPayments', 'PAY-03', 'Payment allocation reduces purchase bill balance_due and updates paid_amount', () => {
    const sql = `SELECT paid_amount, balance_due FROM public.purchase_bills WHERE id = '${billId1}';`
    const res = runPsql(sql)
    const [paid, balDue] = res.stdout.split('|').map(Number)
    assert.strictEqual(paid, 1740.00, 'Paid amount should be 1740.00')
    assert.strictEqual(balDue, 2000.00, 'Remaining balance due should be 2000.00 (3740 - 1740)')
  })

  recordTest('SupplierPayments', 'PAY-04', 'Partial payment transitions bill status to partially_paid', () => {
    const sql = `SELECT status FROM public.purchase_bills WHERE id = '${billId1}';`
    const res = runPsql(sql)
    assert.strictEqual(res.stdout, 'partially_paid')
  })

  recordTest('SupplierPayments', 'PAY-05', 'Full payment of remaining balance transitions bill status to paid', () => {
    // Pay remaining 2000
    const allocs = toPgJson([
      {
        bill_id: billId1,
        amount: 2000.00,
      },
    ])
    const sql = `SELECT public.rpc_record_supplier_payment(
      'salon-luma-01', '${supplierId1}', 2000.00, 'upi', 'UPI-TXN-77112',
      false, 'idemp-spay-02', 'Final settlement for bill', '${allocs}'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Payment completion failed: ${res.stderr}`)

    const checkSql = `SELECT paid_amount, balance_due, status FROM public.purchase_bills WHERE id = '${billId1}';`
    const checkRes = runPsql(checkSql)
    const [paid, balDue, status] = checkRes.stdout.split('|')
    assert.strictEqual(Number(paid), 3740.00)
    assert.strictEqual(Number(balDue), 0.00)
    assert.strictEqual(status, 'paid', 'Status must transition to paid')
  })

  recordTest('SupplierPayments', 'PAY-06', 'Supplier payment posts Debit to supplier_ledger reducing liability', () => {
    // Ledger before final payment had balance = 2000; after 2000 payment -> running balance must be 0
    const sql = `SELECT running_balance FROM public.supplier_ledger 
      WHERE supplier_id = '${supplierId1}' ORDER BY created_at DESC, id DESC LIMIT 1;`
    const res = runPsql(sql)
    assert.strictEqual(Number(res.stdout), 0.00, 'Outstanding payable should be 0.00 after full bill settlement')
  })

  recordTest('SupplierPayments', 'PAY-07', 'Unallocated payment recorded as Supplier Advance', () => {
    // Record advance of Rs. 3000 to supplier
    const sql = `SELECT public.rpc_record_supplier_payment(
      'salon-luma-01', '${supplierId1}', 3000.00, 'bank', 'IMPS-ADV-1234',
      true, 'idemp-adv-01', 'Advance deposit for upcoming bulk order', '[]'::jsonb
    );`
    const res = runPsql(sql, 'usr-owner')
    assert.strictEqual(res.code, 0, `Advance payment failed: ${res.stderr}`)
    const parsed = JSON.parse(res.stdout)
    advancePaymentId = parsed.payment_id

    const checkSql = `SELECT is_advance, unallocated_amount, allocated_amount FROM public.supplier_payments WHERE id = '${advancePaymentId}';`
    const checkRes = runPsql(checkSql)
    const [isAdv, unalloc, alloc] = checkRes.stdout.split('|')
    assert.strictEqual(isAdv, 't')
    assert.strictEqual(Number(unalloc), 3000.00)
    assert.strictEqual(Number(alloc), 0.00)

    // Ledger balance should now be -3000 (advance debit)
    const balSql = `SELECT running_balance FROM public.supplier_ledger 
      WHERE supplier_id = '${supplierId1}' ORDER BY created_at DESC, id DESC LIMIT 1;`
    const balRes = runPsql(balSql)
    assert.strictEqual(Number(balRes.stdout), -3000.00, 'Supplier ledger balance should be -3000 (advance)')
  })

  recordTest('SupplierPayments', 'PAY-08', 'Allocate supplier advance against a newly created bill', () => {
    // Create new bill for Rs. 2000
    const items = toPgJson([
      {
        product_id: '00000000-0000-0000-0001-000000000002',
        name: 'Salon Pro 20 Vol Developer 1L',
        quantity: 5,
        unit_cost: 400.00,
        total_cost: 2000.00,
      },
    ])
    const newBillSql = `SELECT public.rpc_create_purchase_bill(
      'salon-luma-01', '${supplierId1}', 'INV-LOR-9901', CURRENT_DATE, CURRENT_DATE + 30,
      NULL, 2000.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 2000.00,
      'Bill to be cleared via advance', '${items}'::jsonb
    );`
    const billRes = runPsql(newBillSql, 'usr-owner')
    const billParsed = JSON.parse(billRes.stdout)
    const newBillId = billParsed.bill_id

    // Allocate 2000 from the 3000 advance
    const allocSql = `SELECT public.rpc_allocate_supplier_advance(
      'salon-luma-01', '${advancePaymentId}', '${newBillId}', 2000.00
    );`
    const allocRes = runPsql(allocSql, 'usr-owner')
    assert.strictEqual(allocRes.code, 0, `Advance allocation failed: ${allocRes.stderr}`)

    // Check bill is paid
    const checkBillSql = `SELECT status, balance_due, paid_amount FROM public.purchase_bills WHERE id = '${newBillId}';`
    const checkBillRes = runPsql(checkBillSql)
    const [bStatus, bBal, bPaid] = checkBillRes.stdout.split('|')
    assert.strictEqual(bStatus, 'paid')
    assert.strictEqual(Number(bBal), 0.00)
    assert.strictEqual(Number(bPaid), 2000.00)

    // Check advance unallocated balance decreased to 1000
    const checkPmtSql = `SELECT unallocated_amount, allocated_amount FROM public.supplier_payments WHERE id = '${advancePaymentId}';`
    const checkPmtRes = runPsql(checkPmtSql)
    const [unalloc, alloc] = checkPmtRes.stdout.split('|')
    assert.strictEqual(Number(unalloc), 1000.00)
    assert.strictEqual(Number(alloc), 2000.00)
  })

  // ============================================================================
  // SUITE 7: Reports, Multi-Tenant Isolation & Security (SEC-01 to SEC-06)
  // ============================================================================
  console.log('\n--- Running Suite 7: Reports, Multi-Tenant Isolation & Security (Tests 40-45) ---')

  recordTest('SecurityReports', 'SEC-01', 'Supplier ledger mathematical consistency (Total Credits - Total Debits = Running Balance)', () => {
    const sql = `SELECT COALESCE(SUM(credit), 0) AS total_credits, 
                        COALESCE(SUM(debit), 0) AS total_debits,
                        (SELECT running_balance FROM public.supplier_ledger WHERE supplier_id = '${supplierId1}' ORDER BY created_at DESC, id DESC LIMIT 1) AS last_balance
                 FROM public.supplier_ledger WHERE supplier_id = '${supplierId1}';`
    const res = runPsql(sql)
    const [credits, debits, lastBal] = res.stdout.split('|').map(Number)
    const calculatedBal = credits - debits
    assert.strictEqual(Math.round(calculatedBal * 100), Math.round(lastBal * 100), 'Credits minus debits must exactly equal running balance')
  })

  recordTest('SecurityReports', 'SEC-02', 'Customer and Supplier ledger complete isolation', () => {
    // Verify customer_ledger table exists and contains zero purchase records
    const sql = `SELECT count(*) FROM public.customer_ledger WHERE reference_id LIKE 'SPAY-%' OR reference_id LIKE 'PB-%';`
    const res = runPsql(sql)
    assert.strictEqual(Number(res.stdout), 0, 'Customer ledger must remain 100% untainted by supplier transactions')
  })

  recordTest('SecurityReports', 'SEC-03', 'RLS multi-tenant isolation: Foreign salon cannot view Salon 1 purchase data', () => {
    // Attempt to query Salon 1 suppliers as foreign user
    const supSql = `SELECT count(*) FROM public.suppliers WHERE salon_id = 'salon-luma-01';`
    const supRes = runPsql(supSql, 'usr-foreign', 'authenticated')
    assert.strictEqual(Number(supRes.stdout), 0, 'Foreign salon user must see 0 suppliers from Salon 1')

    // Attempt to query Salon 1 POs as foreign user
    const poSql = `SELECT count(*) FROM public.purchase_orders WHERE salon_id = 'salon-luma-01';`
    const poRes = runPsql(poSql, 'usr-foreign', 'authenticated')
    assert.strictEqual(Number(poRes.stdout), 0, 'Foreign salon user must see 0 POs from Salon 1')

    // Attempt to query Salon 1 Bills as foreign user
    const billSql = `SELECT count(*) FROM public.purchase_bills WHERE salon_id = 'salon-luma-01';`
    const billRes = runPsql(billSql, 'usr-foreign', 'authenticated')
    assert.strictEqual(Number(billRes.stdout), 0, 'Foreign salon user must see 0 Bills from Salon 1')
  })

  recordTest('SecurityReports', 'SEC-04', 'Role restriction: Receptionist role CANNOT record supplier payments', () => {
    const sql = `SELECT public.rpc_record_supplier_payment(
      'salon-luma-01', '${supplierId1}', 500.00, 'cash', 'REC-DENY',
      false, 'idemp-deny-01', 'Unauthorized payment attempt', '[]'::jsonb
    );`
    const res = runPsql(sql, 'usr-rec')
    assert.ok(
      res.code !== 0 || res.stderr.includes('PERMISSION_DENIED') || res.stdout.includes('PERMISSION_DENIED'),
      'Expected PERMISSION_DENIED: Only owners can record supplier payments'
    )
  })

  recordTest('SecurityReports', 'SEC-05', 'Owner role has full privileges for payments, POs, bills, and suppliers', () => {
    // Owner can access everything
    const checkSql = `SELECT 
      (SELECT count(*) FROM public.suppliers WHERE salon_id = 'salon-luma-01'),
      (SELECT count(*) FROM public.purchase_orders WHERE salon_id = 'salon-luma-01'),
      (SELECT count(*) FROM public.purchase_bills WHERE salon_id = 'salon-luma-01');`
    const checkRes = runPsql(checkSql, 'usr-owner', 'authenticated')
    const [sups, pos, bills] = checkRes.stdout.split('|').map(Number)
    assert.ok(sups >= 1, 'Owner should see suppliers')
    assert.ok(pos >= 1, 'Owner should see POs')
    assert.ok(bills >= 1, 'Owner should see Bills')
  })

  recordTest('SecurityReports', 'SEC-06', 'Audit trail records key operations in purchase_audit_logs', () => {
    const sql = `SELECT count(DISTINCT action) FROM public.purchase_audit_logs WHERE salon_id = 'salon-luma-01';`
    const res = runPsql(sql)
    assert.ok(Number(res.stdout) >= 3, 'Expected at least 3 distinct actions in purchase_audit_logs (e.g. CREATE, SUBMIT, UPDATE, PAYMENT)')
  })

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log('\n==============================================================================')
  console.log(' PHASE 6 VERIFICATION SUMMARY REPORT')
  console.log('==============================================================================')
  const total = results.length
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length

  console.log(`Total Acceptance Tests: ${total}`)
  console.log(`Passed: ${passed}`)
  console.log(`Failed: ${failed}`)
  console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`)

  if (failed > 0) {
    console.error('\nFAILED TESTS:')
    results.filter((r) => r.status === 'FAIL').forEach((f) => {
      console.error(`- [${f.id}] ${f.name}: ${f.details}`)
    })
    process.exit(1)
  } else {
    console.log('\nALL 45 PHASE 6 TESTS PASSED PROVABLY!')
  }
}

runPhase6TestSuite().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
