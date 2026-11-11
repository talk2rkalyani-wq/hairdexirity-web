// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Professional Invoice PDF Generator & Local Download Engine
// Client-Side High-Fidelity Vector PDF Generation via jsPDF
// ==============================================================================

import { jsPDF } from 'jspdf'
import type { Invoice, InvoiceLineItem } from '../types/finance.ts'
import type { Salon } from '../types/models.ts'

export interface SalonPdfInfo {
  name: string
  ownerName?: string
  phone: string
  email: string
  street?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  gstin?: string
}

const DEFAULT_SALON_INFO: SalonPdfInfo = {
  name: 'Hair Dexirity',
  ownerName: 'Mia',
  phone: '+91 98765 43210',
  email: 'contact@hairdexirity.example.com',
  street: 'Level 2, Galleria Market, DLF Phase IV',
  city: 'Gurugram',
  state: 'Haryana',
  postalCode: '122009',
  country: 'India',
  gstin: '06AAAAA0000A1Z5',
}

/**
 * Format currency with Indian Rupee representation (e.g. "Rs. 1,500.00")
 * Uses ASCII-safe "Rs." for high-compatibility standard font embedding in jsPDF
 */
export function formatPdfCurrency(amount: number): string {
  const num = Number(amount) || 0
  return `Rs. ${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/**
 * Generates an official, luxury-styled Luma Salon PDF document for a given invoice.
 */
export function generateInvoicePdf(invoice: Invoice, salonOverride?: Partial<Salon | SalonPdfInfo>): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    putOnlyUsedFonts: true,
  })

  const pageWidth = 210
  const pageHeight = 297
  const leftMargin = 14
  const rightMargin = 14
  const contentWidth = pageWidth - leftMargin - rightMargin // 182mm

  // Merge salon details
  const salon: SalonPdfInfo = {
    ...DEFAULT_SALON_INFO,
    ...(salonOverride as any),
    street: (salonOverride as any)?.address?.street || (salonOverride as any)?.street || DEFAULT_SALON_INFO.street,
    city: (salonOverride as any)?.address?.city || (salonOverride as any)?.city || DEFAULT_SALON_INFO.city,
    state: (salonOverride as any)?.address?.state || (salonOverride as any)?.state || DEFAULT_SALON_INFO.state,
    postalCode: (salonOverride as any)?.address?.postalCode || (salonOverride as any)?.postalCode || DEFAULT_SALON_INFO.postalCode,
    country: (salonOverride as any)?.address?.country || (salonOverride as any)?.country || DEFAULT_SALON_INFO.country,
  }

  const isDraft = Boolean(invoice.isDraft || invoice.paymentStatus === 'draft')
  const status = invoice.status || invoice.paymentStatus || 'paid'
  const isPaid = status === 'paid'
  const isPartiallyPaid = status === 'partially_paid' || status === 'partial'

  let currentY = 14

  // Helper to add header on each page
  const renderHeader = (_pageNumber: number, _totalPages: number) => {
    // Top Gold Brand Bar
    doc.setFillColor(197, 160, 89) // Brand Gold
    doc.rect(leftMargin, currentY, contentWidth, 2, 'F')
    currentY += 6

    // Brand Name & Tagline
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(26, 29, 32)
    doc.text(salon.name.toUpperCase(), leftMargin, currentY + 2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 105, 115)
    doc.text('HAUTE COIFFURE & LUXURY BEAUTY LOUNGE', leftMargin, currentY + 7)

    // Invoice Title / Type Badge (Right-aligned)
    const titleText = isDraft ? 'DRAFT ESTIMATE' : (invoice.isGstInvoice !== false ? 'TAX INVOICE' : 'COMMERCIAL INVOICE')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    if (isDraft) {
      doc.setTextColor(180, 110, 20)
    } else {
      doc.setTextColor(26, 29, 32)
    }
    doc.text(titleText, pageWidth - rightMargin, currentY + 2, { align: 'right' })

    // Invoice Number Badge
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(197, 160, 89)
    doc.text(invoice.invoiceNumber, pageWidth - rightMargin, currentY + 8, { align: 'right' })

    currentY += 13

    // Salon Contact Details (Left Column)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(70, 75, 85)
    const salonAddr = `${salon.street || ''}, ${salon.city || ''}, ${salon.state || ''} ${salon.postalCode || ''}`.trim()
    doc.text(salonAddr, leftMargin, currentY)
    currentY += 4
    doc.text(`Phone: ${salon.phone}  |  Email: ${salon.email}`, leftMargin, currentY)
    currentY += 4
    if (salon.gstin) {
      doc.text(`GSTIN: ${salon.gstin}`, leftMargin, currentY)
      currentY += 4
    }

    // Invoice Date & Meta (Right Column aligned)
    const dateY = currentY - (salon.gstin ? 12 : 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(70, 75, 85)
    doc.text(`Date: ${invoice.date || new Date().toISOString().split('T')[0]}`, pageWidth - rightMargin, dateY, { align: 'right' })
    if (invoice.appointmentId) {
      doc.text(`Appointment Ref: ${invoice.appointmentId}`, pageWidth - rightMargin, dateY + 4, { align: 'right' })
    }

    // Status Pill on top right
    const statusLabel = isDraft ? 'DRAFT CART' : (isPaid ? 'PAID IN FULL' : (isPartiallyPaid ? 'PARTIALLY PAID' : 'UNPAID'))
    const statusY = dateY + (invoice.appointmentId ? 8 : 4)
    if (isPaid && !isDraft) {
      doc.setFillColor(235, 247, 238)
      doc.setDrawColor(46, 133, 64)
      doc.setTextColor(46, 133, 64)
    } else if (isPartiallyPaid && !isDraft) {
      doc.setFillColor(254, 247, 230)
      doc.setDrawColor(180, 110, 20)
      doc.setTextColor(180, 110, 20)
    } else {
      doc.setFillColor(245, 245, 245)
      doc.setDrawColor(120, 120, 120)
      doc.setTextColor(80, 80, 80)
    }
    doc.roundedRect(pageWidth - rightMargin - 32, statusY - 3, 32, 5.5, 1, 1, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.text(statusLabel, pageWidth - rightMargin - 16, statusY + 0.8, { align: 'center' })

    currentY += 4

    // Horizontal Divider
    doc.setDrawColor(220, 224, 230)
    doc.setLineWidth(0.3)
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY)
    currentY += 5
  }

  // Render Page 1 Header
  renderHeader(1, 1)

  // Draft Watermark if draft
  if (isDraft) {
    doc.saveGraphicsState()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(36)
    doc.setTextColor(230, 220, 200)
    doc.text('DRAFT — NOT A TAX INVOICE', pageWidth / 2, 140, {
      align: 'center',
      angle: 35,
    })
    doc.restoreGraphicsState()
  }

  // ==============================================================================
  // Customer & Billing To Information Box
  // ==============================================================================
  doc.setFillColor(249, 250, 252)
  doc.setDrawColor(230, 234, 240)
  doc.roundedRect(leftMargin, currentY, contentWidth, 18, 1.5, 1.5, 'FD')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(197, 160, 89)
  doc.text('BILLED TO / CUSTOMER DETAILS', leftMargin + 4, currentY + 4.5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 29, 32)
  const clientName = invoice.clientName || 'Walk-in Guest'
  doc.text(clientName, leftMargin + 4, currentY + 9)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 95, 105)
  let contactStr = invoice.walkInGuest ? 'Guest Walk-in Customer' : 'Registered Client'
  if (invoice.clientPhone) contactStr += `  |  Mobile: ${invoice.clientPhone}`
  if (invoice.clientEmail) contactStr += `  |  Email: ${invoice.clientEmail}`
  doc.text(contactStr, leftMargin + 4, currentY + 13.5)

  // Payment method indicator on right of box
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const methodLabel = (invoice.paymentMethod || invoice.primaryPaymentMethod || 'cash').toUpperCase()
  doc.text(`Tender: ${methodLabel}`, pageWidth - rightMargin - 4, currentY + 9, { align: 'right' })
  if (invoice.authorizedBy) {
    doc.text(`Authorized by: ${invoice.authorizedBy}`, pageWidth - rightMargin - 4, currentY + 13.5, { align: 'right' })
  }

  currentY += 23

  // ==============================================================================
  // Itemized Billing Table
  // ==============================================================================
  // Table Column Definitions (Total Width: 182mm)
  // # (8mm) | Description (62mm) | Stylist / Staff (32mm) | Qty (12mm) | Rate (20mm) | Disc (14mm) | Tax (14mm) | Total (20mm)
  const colX = {
    idx: leftMargin + 2,
    desc: leftMargin + 10,
    stylist: leftMargin + 72,
    qty: leftMargin + 104,
    rate: leftMargin + 124,
    disc: leftMargin + 144,
    tax: leftMargin + 158,
    total: leftMargin + 180, // right aligned at 14 + 182 = 196
  }

  // Header Row Background
  doc.setFillColor(26, 29, 32)
  doc.rect(leftMargin, currentY, contentWidth, 7, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text('#', colX.idx, currentY + 4.8)
  doc.text('ITEM DESCRIPTION', colX.desc, currentY + 4.8)
  doc.text('STYLIST / STAFF', colX.stylist, currentY + 4.8)
  doc.text('QTY', colX.qty, currentY + 4.8, { align: 'right' })
  doc.text('RATE', colX.rate, currentY + 4.8, { align: 'right' })
  doc.text('DISC', colX.disc, currentY + 4.8, { align: 'right' })
  doc.text('TAX', colX.tax, currentY + 4.8, { align: 'right' })
  doc.text('TOTAL', colX.total, currentY + 4.8, { align: 'right' })

  currentY += 7

  const lineItems: InvoiceLineItem[] = invoice.lineItems || []
  let rowIndex = 0

  for (const item of lineItems) {
    rowIndex++

    // Check for page overflow
    if (currentY > pageHeight - 65) {
      doc.addPage()
      currentY = 14
      renderHeader(doc.getNumberOfPages(), doc.getNumberOfPages())
      // Repeat table header
      doc.setFillColor(26, 29, 32)
      doc.rect(leftMargin, currentY, contentWidth, 7, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(255, 255, 255)
      doc.text('#', colX.idx, currentY + 4.8)
      doc.text('ITEM DESCRIPTION', colX.desc, currentY + 4.8)
      doc.text('STYLIST / STAFF', colX.stylist, currentY + 4.8)
      doc.text('QTY', colX.qty, currentY + 4.8, { align: 'right' })
      doc.text('RATE', colX.rate, currentY + 4.8, { align: 'right' })
      doc.text('DISC', colX.disc, currentY + 4.8, { align: 'right' })
      doc.text('TAX', colX.tax, currentY + 4.8, { align: 'right' })
      doc.text('TOTAL', colX.total, currentY + 4.8, { align: 'right' })
      currentY += 7
    }

    // Row alternating background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(250, 251, 253)
      doc.rect(leftMargin, currentY, contentWidth, 6.5, 'F')
    }

    const itemTitle = item.name || item.description || 'Service'
    const truncatedDesc = itemTitle.length > 36 ? `${itemTitle.substring(0, 34)}...` : itemTitle
    const staffName = item.staffName || invoice.staffName || (item.itemType === 'product' ? 'Retail' : 'Salon Team')
    const truncatedStaff = staffName.length > 18 ? `${staffName.substring(0, 16)}...` : staffName
    const qty = Math.max(1, Number(item.quantity) || 1)
    const unitPrice = Number(item.unitPrice) || 0
    const disc = Number(item.discountAmount) || 0
    const tax = Number(item.taxAmount) || 0
    const lineTotal = Number(item.lineTotal ?? item.totalPrice ?? (unitPrice * qty - disc + tax))

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(50, 55, 65)

    doc.text(String(rowIndex), colX.idx, currentY + 4.3)
    doc.text(truncatedDesc, colX.desc, currentY + 4.3)
    doc.text(truncatedStaff, colX.stylist, currentY + 4.3)
    doc.text(String(qty), colX.qty, currentY + 4.3, { align: 'right' })
    doc.text(unitPrice.toFixed(2), colX.rate, currentY + 4.3, { align: 'right' })
    doc.text(disc > 0 ? `-${disc.toFixed(2)}` : '-', colX.disc, currentY + 4.3, { align: 'right' })
    doc.text(tax > 0 ? tax.toFixed(2) : '-', colX.tax, currentY + 4.3, { align: 'right' })

    doc.setFont('helvetica', 'bold')
    doc.text(lineTotal.toFixed(2), colX.total, currentY + 4.3, { align: 'right' })

    // Subtle bottom border
    doc.setDrawColor(235, 238, 242)
    doc.setLineWidth(0.2)
    doc.line(leftMargin, currentY + 6.5, pageWidth - rightMargin, currentY + 6.5)

    currentY += 6.5
  }

  currentY += 4

  // Check if summary fits, otherwise push to new page
  if (currentY > pageHeight - 75) {
    doc.addPage()
    currentY = 14
    renderHeader(doc.getNumberOfPages(), doc.getNumberOfPages())
  }

  // ==============================================================================
  // Financial Summary & Tenders Block
  // Left: Tenders + Terms | Right: Totals Breakdown Box
  // ==============================================================================
  const summaryBoxY = currentY
  const rightColWidth = 78
  const rightColX = pageWidth - rightMargin - rightColWidth

  // --- Left Column: Payment Tenders & Note ---
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(26, 29, 32)
  doc.text('PAYMENT SETTLEMENT & TENDERS', leftMargin, currentY + 3)

  let tenderY = currentY + 7
  if (invoice.payments && invoice.payments.length > 0) {
    for (const p of invoice.payments) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(70, 75, 85)
      const tenderTitle = p.paymentMethod.toUpperCase()
      const pmtRef = p.transactionReference ? ` (Ref: ${p.transactionReference})` : ''
      doc.text(`• ${tenderTitle}${pmtRef}:`, leftMargin + 2, tenderY)
      doc.setFont('helvetica', 'bold')
      doc.text(formatPdfCurrency(p.amount), leftMargin + 75, tenderY, { align: 'right' })
      tenderY += 4
    }
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 75, 85)
    const tenderTitle = (invoice.paymentMethod || invoice.primaryPaymentMethod || 'cash').toUpperCase()
    doc.text(`• ${tenderTitle} Tender:`, leftMargin + 2, tenderY)
    doc.setFont('helvetica', 'bold')
    doc.text(formatPdfCurrency(invoice.paidAmount), leftMargin + 75, tenderY, { align: 'right' })
    tenderY += 4
  }

  // Terms and conditions note
  tenderY += 3
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(197, 160, 89)
  doc.text('TERMS & SALON POLICIES:', leftMargin, tenderY)
  tenderY += 3.5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(110, 115, 125)
  doc.text('1. Salon services once rendered are non-refundable.', leftMargin, tenderY)
  tenderY += 3
  doc.setFont('helvetica', 'normal')
  doc.text('2. Unopened retail products may be exchanged within 7 days with this invoice.', leftMargin, tenderY)
  tenderY += 3
  doc.setFont('helvetica', 'normal')
  doc.text('3. Thank you for your patronage! We look forward to seeing you again.', leftMargin, tenderY)

  // --- Right Column: Financial Breakdown Box ---
  doc.setFillColor(249, 250, 252)
  doc.setDrawColor(220, 225, 235)
  doc.roundedRect(rightColX, summaryBoxY, rightColWidth, 54, 1.5, 1.5, 'FD')

  let rowY = summaryBoxY + 5

  const addSummaryRow = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(7.5)
    if (color) {
      doc.setTextColor(color[0], color[1], color[2])
    } else {
      doc.setTextColor(bold ? 26 : 80, bold ? 29 : 85, bold ? 32 : 95)
    }
    doc.text(label, rightColX + 4, rowY)
    doc.text(value, pageWidth - rightMargin - 4, rowY, { align: 'right' })
    rowY += 4.5
  }

  addSummaryRow('Gross Subtotal:', formatPdfCurrency(invoice.subtotal))

  if (invoice.discountAmount > 0) {
    const discLabel = invoice.discountType === 'percentage'
      ? `Discount (${invoice.discountValue || ''}%):`
      : 'Total Discount:'
    addSummaryRow(discLabel, `-${formatPdfCurrency(invoice.discountAmount)}`, false, [180, 50, 50])
  }

  if (invoice.isGstInvoice !== false && invoice.taxAmount > 0) {
    const halfTax = invoice.taxAmount / 2
    addSummaryRow('CGST (9.00%):', formatPdfCurrency(invoice.cgstAmount || halfTax))
    addSummaryRow('SGST (9.00%):', formatPdfCurrency(invoice.sgstAmount || halfTax))
  } else if (invoice.taxTreatment === 'non_gst') {
    addSummaryRow('Tax (Non-GST):', formatPdfCurrency(0))
  }

  // Divider inside summary box
  doc.setDrawColor(210, 215, 225)
  doc.setLineWidth(0.3)
  doc.line(rightColX + 3, rowY, pageWidth - rightMargin - 3, rowY)
  rowY += 3.5

  // Grand Total Row (Highlighted in Gold/Black)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 29, 32)
  doc.text('GRAND TOTAL:', rightColX + 4, rowY + 1)
  doc.setTextColor(197, 160, 89)
  doc.text(formatPdfCurrency(invoice.totalAmount), pageWidth - rightMargin - 4, rowY + 1, { align: 'right' })
  rowY += 6

  addSummaryRow('Amount Paid:', formatPdfCurrency(invoice.paidAmount), true, [46, 133, 64])

  if (invoice.balanceDue > 0) {
    addSummaryRow('Balance Due:', formatPdfCurrency(invoice.balanceDue), true, [180, 50, 50])
  } else {
    addSummaryRow('Balance Due:', formatPdfCurrency(0), false, [100, 105, 115])
  }

  // ==============================================================================
  // Page Footer (Render on all pages)
  // ==============================================================================
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    const footerY = pageHeight - 10

    // Footer Divider
    doc.setDrawColor(225, 228, 235)
    doc.setLineWidth(0.3)
    doc.line(leftMargin, footerY - 2, pageWidth - rightMargin, footerY - 2)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(130, 135, 145)
    doc.text(
      'This is a computer-generated commercial invoice by Hair Dexirity Business Management Suite.',
      leftMargin,
      footerY + 2
    )
    doc.text(
      `Page ${p} of ${totalPages}`,
      pageWidth - rightMargin,
      footerY + 2,
      { align: 'right' }
    )
  }

  return doc
}

/**
 * Generates and triggers local browser download of the PDF invoice.
 * Filename format: `HairDexirity_INV-2026-1016.pdf`
 */
export function downloadInvoicePdf(invoice: Invoice, salonOverride?: Partial<Salon | SalonPdfInfo>): void {
  const doc = generateInvoicePdf(invoice, salonOverride)
  const safeNum = (invoice.invoiceNumber || 'INV-000').replace(/[^a-zA-Z0-9_-]/g, '_')
  const filename = `HairDexirity_${safeNum}.pdf`
  doc.save(filename)
}

/**
 * Returns the PDF document as a Blob (useful for previews and tests).
 */
export function getInvoicePdfBlob(invoice: Invoice, salonOverride?: Partial<Salon | SalonPdfInfo>): Blob {
  const doc = generateInvoicePdf(invoice, salonOverride)
  return doc.output('blob')
}

/**
 * Returns the PDF document as a base64 Data URI string.
 */
export function getInvoicePdfDataUri(invoice: Invoice, salonOverride?: Partial<Salon | SalonPdfInfo>): string {
  const doc = generateInvoicePdf(invoice, salonOverride)
  return doc.output('datauristring')
}
