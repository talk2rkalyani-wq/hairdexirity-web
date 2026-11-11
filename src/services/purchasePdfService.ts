// ==============================================================================
// Luma Salon — Purchase Documents PDF Generation Service
// Phase 6: Vector PDFs for Purchase Orders, Bills, Receipts & Returns
// ==============================================================================

import { jsPDF } from 'jspdf'
import type {
  PurchaseOrder,
  PurchaseBill,
  GoodsReceipt,
  PurchaseReturn,
  Supplier,
} from '../types/purchases.ts'

const SALON_INFO = {
  name: 'HAIR DEXIRITY',
  tagline: 'Luxury Hair, Beauty & Wellness',
  address: '104 Elegance Boulevard, Indiranagar',
  city: 'Bengaluru, Karnataka 560038',
  phone: '+91 98450 12345',
  email: 'accounts@hairdexirity.in',
  gstin: '29ABCDE1234F1Z5',
}

const PRIMARY_COLOR: [number, number, number] = [183, 110, 121] // Rose gold #b76e79
const TEXT_DARK: [number, number, number] = [30, 41, 59] // Slate 800
const TEXT_MUTED: [number, number, number] = [100, 116, 139] // Slate 500

interface ColumnConfig {
  header: string
  width: number
  align?: 'left' | 'right' | 'center'
}

function renderSimpleTable(
  doc: jsPDF,
  startY: number,
  columns: ColumnConfig[],
  rows: (string | number)[][],
  headerBgColor: [number, number, number]
): number {
  let y = startY
  const leftX = 14
  const rowHeight = 7

  // Draw header row
  const totalWidth = columns.reduce((acc, col) => acc + col.width, 0)
  doc.setFillColor(...headerBgColor)
  doc.rect(leftX, y, totalWidth, rowHeight, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(255, 255, 255)

  let curX = leftX
  columns.forEach((col) => {
    let textX = curX + 2
    const alignOpt: 'left' | 'right' | 'center' = col.align || 'left'
    if (alignOpt === 'right') {
      textX = curX + col.width - 2
    } else if (alignOpt === 'center') {
      textX = curX + col.width / 2
    }
    doc.text(String(col.header), textX, y + 4.8, { align: alignOpt })
    curX += col.width
  })

  y += rowHeight

  // Draw rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_DARK)

  rows.forEach((row, rowIndex) => {
    // Alternating background
    if (rowIndex % 2 === 1) {
      doc.setFillColor(248, 249, 250)
      doc.rect(leftX, y, totalWidth, rowHeight, 'F')
    }
    // Bottom border
    doc.setDrawColor(235, 238, 242)
    doc.setLineWidth(0.2)
    doc.line(leftX, y + rowHeight, leftX + totalWidth, y + rowHeight)

    let rX = leftX
    columns.forEach((col, cIdx) => {
      const cellText = String(row[cIdx] ?? '')
      let textX = rX + 2
      const alignOpt: 'left' | 'right' | 'center' = col.align || 'left'
      if (alignOpt === 'right') {
        textX = rX + col.width - 2
      } else if (alignOpt === 'center') {
        textX = rX + col.width / 2
      }
      doc.text(cellText, textX, y + 4.8, { align: alignOpt })
      rX += col.width
    })
    y += rowHeight
  })

  return y
}

function addHeader(
  doc: jsPDF,
  title: string,
  docNumber: string,
  dateStr: string,
  badgeText: string
) {
  // Brand Header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(SALON_INFO.name, 14, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(SALON_INFO.tagline, 14, 25)
  doc.text(`${SALON_INFO.address}, ${SALON_INFO.city}`, 14, 29)
  doc.text(`GSTIN: ${SALON_INFO.gstin} | Phone: ${SALON_INFO.phone}`, 14, 33)

  // Document Title & Number (Right aligned)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...TEXT_DARK)
  doc.text(title, 196, 20, { align: 'right' })

  doc.setFontSize(10)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(docNumber, 196, 26, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Date: ${dateStr}`, 196, 32, { align: 'right' })

  // Prominent compliance badge
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(220, 38, 38) // Red
  doc.text(badgeText, 196, 37, { align: 'right' })

  // Divider
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.5)
  doc.line(14, 42, 196, 42)
}

function addPartyInfo(
  doc: jsPDF,
  partyLabel: string,
  supplier?: Partial<Supplier> | null,
  supplierName?: string
) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text(partyLabel.toUpperCase(), 14, 49)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_DARK)
  const name = supplier?.name || supplierName || 'Supplier'
  doc.text(name, 14, 55)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  let y = 60
  if (supplier?.contactPerson) {
    doc.text(`Contact: ${supplier.contactPerson}`, 14, y)
    y += 4
  }
  if (supplier?.phone) {
    doc.text(`Phone: ${supplier.phone}`, 14, y)
    y += 4
  }
  if (supplier?.email) {
    doc.text(`Email: ${supplier.email}`, 14, y)
    y += 4
  }
  if (supplier?.gstin) {
    doc.text(`GSTIN: ${supplier.gstin}`, 14, y)
    y += 4
  }
}

// ==============================================================================
// 1. PURCHASE ORDER PDF
// ==============================================================================
export function generatePurchaseOrderPdf(
  po: PurchaseOrder,
  supplier?: Supplier | null
): jsPDF {
  const doc = new jsPDF()

  addHeader(
    doc,
    'PURCHASE ORDER',
    po.poNumber,
    po.orderDate,
    'PURCHASE ORDER — NOT A TAX INVOICE'
  )

  addPartyInfo(doc, 'Vendor / Supplier', supplier, po.supplierName)

  // Status & Delivery
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('ORDER DETAILS', 120, 49)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Status: ${po.status.toUpperCase()}`, 120, 55)
  if (po.expectedDeliveryDate) {
    doc.text(`Expected Delivery: ${po.expectedDeliveryDate}`, 120, 59)
  }

  // Items Table
  const tableRows = (po.items || []).map((it, idx) => [
    idx + 1,
    it.name,
    it.sku || '-',
    `${it.orderedQuantity} ${it.unit}`,
    `Rs. ${it.unitCost.toFixed(2)}`,
    `${(it.taxRate ? it.taxRate * 100 : 18)}%`,
    `Rs. ${it.totalCost.toFixed(2)}`,
  ])

  const columns: ColumnConfig[] = [
    { header: '#', width: 10, align: 'center' },
    { header: 'Item Description', width: 64, align: 'left' },
    { header: 'SKU', width: 24, align: 'left' },
    { header: 'Qty', width: 20, align: 'right' },
    { header: 'Unit Cost', width: 24, align: 'right' },
    { header: 'GST Rate', width: 18, align: 'right' },
    { header: 'Total Cost', width: 22, align: 'right' },
  ]

  const endY = renderSimpleTable(doc, 75, columns, tableRows, PRIMARY_COLOR)

  // Summary Totals
  const finalY = endY + 8
  const rightX = 196

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Subtotal: Rs. ${po.subtotal.toFixed(2)}`, rightX, finalY, { align: 'right' })
  doc.text(`Total Tax: Rs. ${po.taxAmount.toFixed(2)}`, rightX, finalY + 5, { align: 'right' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...TEXT_DARK)
  doc.text(`Total Order Value: Rs. ${po.totalAmount.toFixed(2)}`, rightX, finalY + 12, { align: 'right' })

  // Footer compliance note
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(
    'This is a commercial purchase order authorizing delivery. Not a GST sales invoice.',
    14,
    285
  )

  return doc
}

// ==============================================================================
// 2. PURCHASE BILL PDF
// ==============================================================================
export function generatePurchaseBillPdf(
  bill: PurchaseBill,
  supplier?: Supplier | null
): jsPDF {
  const doc = new jsPDF()

  addHeader(
    doc,
    'PURCHASE BILL',
    bill.billNumber,
    bill.billDate,
    'PURCHASE BILL — SUPPLIER INVOICE'
  )

  addPartyInfo(doc, 'Vendor / Supplier', supplier, bill.supplierName)

  // Bill References
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('BILL DETAILS', 120, 49)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Supplier Inv #: ${bill.supplierInvoiceNumber}`, 120, 55)
  doc.text(`Due Date: ${bill.dueDate}`, 120, 59)
  doc.text(`Payment Status: ${bill.status.toUpperCase()}`, 120, 63)
  if (bill.poNumber) {
    doc.text(`Ref PO: ${bill.poNumber}`, 120, 67)
  }

  // Items Table
  const tableRows = (bill.items || []).map((it, idx) => [
    idx + 1,
    it.name,
    `${it.quantity} ${it.unit}`,
    `Rs. ${it.unitCost.toFixed(2)}`,
    `Rs. ${(it.discountAmount || 0).toFixed(2)}`,
    `Rs. ${(it.taxAmount || 0).toFixed(2)}`,
    `Rs. ${it.totalCost.toFixed(2)}`,
  ])

  const columns: ColumnConfig[] = [
    { header: '#', width: 10, align: 'center' },
    { header: 'Item Description', width: 68, align: 'left' },
    { header: 'Qty', width: 18, align: 'right' },
    { header: 'Unit Cost', width: 22, align: 'right' },
    { header: 'Discount', width: 20, align: 'right' },
    { header: 'GST', width: 20, align: 'right' },
    { header: 'Total Cost', width: 24, align: 'right' },
  ]

  const endY = renderSimpleTable(doc, 75, columns, tableRows, [71, 85, 105])

  // Summary Totals
  const finalY = endY + 8
  const rightX = 196

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Subtotal: Rs. ${bill.subtotal.toFixed(2)}`, rightX, finalY, { align: 'right' })
  doc.text(`Tax: Rs. ${bill.taxAmount.toFixed(2)}`, rightX, finalY + 4, { align: 'right' })
  let nextY = finalY + 8
  if (bill.additionalCharges > 0) {
    doc.text(`Addl Charges: Rs. ${bill.additionalCharges.toFixed(2)}`, rightX, nextY, { align: 'right' })
    nextY += 4
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_DARK)
  doc.text(`Bill Total: Rs. ${bill.totalAmount.toFixed(2)}`, rightX, nextY, { align: 'right' })
  doc.text(`Paid Amount: Rs. ${bill.paidAmount.toFixed(2)}`, rightX, nextY + 5, { align: 'right' })

  doc.setTextColor(220, 38, 38)
  doc.text(`Balance Due: Rs. ${bill.balanceDue.toFixed(2)}`, rightX, nextY + 10, { align: 'right' })

  return doc
}

// ==============================================================================
// 3. GOODS RECEIPT NOTE (GRN) PDF
// ==============================================================================
export function generateGoodsReceiptPdf(
  grn: GoodsReceipt,
  supplier?: Supplier | null
): jsPDF {
  const doc = new jsPDF()

  addHeader(
    doc,
    'GOODS RECEIPT NOTE',
    grn.grnNumber,
    grn.receivedDate,
    'GOODS RECEIPT NOTE (GRN) — INTERNAL DOCUMENT'
  )

  addPartyInfo(doc, 'Vendor / Supplier', supplier, grn.supplierName)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('RECEIPT DETAILS', 120, 49)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Received By: ${grn.receivedBy}`, 120, 55)
  if (grn.poNumber) {
    doc.text(`Ref PO: ${grn.poNumber}`, 120, 59)
  }

  const tableRows = (grn.items || []).map((it, idx) => [
    idx + 1,
    it.productName || 'Inventory Product',
    it.orderedQuantity,
    it.receivedQuantity,
    it.acceptedQuantity,
    it.rejectedQuantity,
    it.rejectionReason || '-',
  ])

  const columns: ColumnConfig[] = [
    { header: '#', width: 10, align: 'center' },
    { header: 'Product', width: 62, align: 'left' },
    { header: 'Ordered', width: 18, align: 'right' },
    { header: 'Received', width: 18, align: 'right' },
    { header: 'Accepted', width: 18, align: 'right' },
    { header: 'Rejected', width: 18, align: 'right' },
    { header: 'Reason', width: 38, align: 'left' },
  ]

  renderSimpleTable(doc, 75, columns, tableRows, [16, 185, 129])

  return doc
}

// ==============================================================================
// 4. PURCHASE RETURN & DEBIT NOTE PDF
// ==============================================================================
export function generatePurchaseReturnPdf(
  ret: PurchaseReturn,
  supplier?: Supplier | null
): jsPDF {
  const doc = new jsPDF()

  addHeader(
    doc,
    'PURCHASE RETURN',
    ret.returnNumber,
    ret.returnDate,
    'PURCHASE RETURN & DEBIT NOTE'
  )

  addPartyInfo(doc, 'Vendor / Supplier', supplier, ret.supplierName)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...PRIMARY_COLOR)
  doc.text('RETURN DETAILS', 120, 49)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...TEXT_MUTED)
  doc.text(`Reason: ${ret.reason}`, 120, 55)
  doc.text(`Status: ${ret.status.toUpperCase()}`, 120, 59)

  const tableRows = (ret.items || []).map((it, idx) => [
    idx + 1,
    it.productName || 'Item',
    it.quantity,
    `Rs. ${it.unitCost.toFixed(2)}`,
    `Rs. ${(it.taxAmount || 0).toFixed(2)}`,
    `Rs. ${it.totalAmount.toFixed(2)}`,
    it.reason || ret.reason,
  ])

  const columns: ColumnConfig[] = [
    { header: '#', width: 10, align: 'center' },
    { header: 'Product', width: 56, align: 'left' },
    { header: 'Qty', width: 16, align: 'right' },
    { header: 'Unit Cost', width: 22, align: 'right' },
    { header: 'Tax Adj', width: 20, align: 'right' },
    { header: 'Total Credit', width: 24, align: 'right' },
    { header: 'Reason', width: 34, align: 'left' },
  ]

  const endY = renderSimpleTable(doc, 75, columns, tableRows, [225, 29, 72])

  const finalY = endY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...TEXT_DARK)
  doc.text(`Total Debit / Credit Note: Rs. ${ret.totalAmount.toFixed(2)}`, 196, finalY, { align: 'right' })

  return doc
}

// Download helpers
export function downloadPurchaseOrderPdf(po: PurchaseOrder, supplier?: Supplier | null): void {
  const doc = generatePurchaseOrderPdf(po, supplier)
  doc.save(`${po.poNumber}.pdf`)
}

export function downloadPurchaseBillPdf(bill: PurchaseBill, supplier?: Supplier | null): void {
  const doc = generatePurchaseBillPdf(bill, supplier)
  doc.save(`${bill.billNumber}.pdf`)
}

export function downloadGoodsReceiptPdf(grn: GoodsReceipt, supplier?: Supplier | null): void {
  const doc = generateGoodsReceiptPdf(grn, supplier)
  doc.save(`${grn.grnNumber}.pdf`)
}

export function downloadPurchaseReturnPdf(ret: PurchaseReturn, supplier?: Supplier | null): void {
  const doc = generatePurchaseReturnPdf(ret, supplier)
  doc.save(`${ret.returnNumber}.pdf`)
}
