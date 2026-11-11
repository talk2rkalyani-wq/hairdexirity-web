// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Professional Quotation & Proforma Invoice PDF Generator
// Client-Side High-Fidelity Vector PDF Generation via jsPDF
// Strictly Labeled: "QUOTATION — NOT A TAX INVOICE" / "PROFORMA INVOICE — NOT A TAX INVOICE"
// ==============================================================================

import { jsPDF } from 'jspdf'
import type { Quotation, ProformaInvoice } from '../types/finance.ts'
import type { Salon } from '../types/models.ts'
import { formatPdfCurrency, type SalonPdfInfo } from './pdfService.ts'

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
 * Generates an official, luxury-styled Luma Salon Quotation PDF document.
 * Strictly displays "QUOTATION — NOT A TAX INVOICE" and strips internal notes.
 */
export function generateQuotationPdf(
  quotation: Quotation,
  salonOverride?: Partial<Salon | SalonPdfInfo>
): jsPDF {
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

  const salon: SalonPdfInfo = {
    ...DEFAULT_SALON_INFO,
    ...(salonOverride as any),
    street: (salonOverride as any)?.address?.street || (salonOverride as any)?.street || DEFAULT_SALON_INFO.street,
    city: (salonOverride as any)?.address?.city || (salonOverride as any)?.city || DEFAULT_SALON_INFO.city,
    state: (salonOverride as any)?.address?.state || (salonOverride as any)?.state || DEFAULT_SALON_INFO.state,
    postalCode: (salonOverride as any)?.address?.postalCode || (salonOverride as any)?.postalCode || DEFAULT_SALON_INFO.postalCode,
    country: (salonOverride as any)?.address?.country || (salonOverride as any)?.country || DEFAULT_SALON_INFO.country,
  }

  let currentY = 14

  // Helper to render top header
  const renderHeader = () => {
    // Brand Gold Top Accent
    doc.setFillColor(197, 160, 89)
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

    // Document Title Badge (Right-aligned)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(26, 29, 32)
    doc.text('ESTIMATE / QUOTATION', pageWidth - rightMargin, currentY + 2, { align: 'right' })

    // Quotation Number Badge
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(197, 160, 89)
    doc.text(quotation.quotationNumber, pageWidth - rightMargin, currentY + 8, { align: 'right' })

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

    // Quotation Dates (Right Column)
    const dateY = currentY - (salon.gstin ? 12 : 8)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(70, 75, 85)
    doc.text(`Issue Date: ${quotation.issueDate}`, pageWidth - rightMargin, dateY, { align: 'right' })
    doc.text(`Valid Until: ${quotation.validUntil}`, pageWidth - rightMargin, dateY + 4, { align: 'right' })
    doc.text(`Status: ${quotation.status.toUpperCase()}`, pageWidth - rightMargin, dateY + 8, { align: 'right' })

    currentY += 4

    // Prominent "QUOTATION — NOT A TAX INVOICE" Amber Banner
    doc.setFillColor(254, 249, 238) // Light warm gold banner
    doc.setDrawColor(197, 160, 89)
    doc.roundedRect(leftMargin, currentY, contentWidth, 7, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(150, 95, 15)
    doc.text('QUOTATION — NOT A TAX INVOICE', pageWidth / 2, currentY + 4.8, { align: 'center' })
    currentY += 11

    // Divider Line
    doc.setDrawColor(220, 224, 230)
    doc.setLineWidth(0.3)
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY)
    currentY += 5
  }

  // Render initial page header
  renderHeader()

  // Customer Information Box
  doc.setFillColor(248, 249, 251)
  doc.roundedRect(leftMargin, currentY, contentWidth, 18, 2, 2, 'F')
  doc.setDrawColor(230, 233, 238)
  doc.roundedRect(leftMargin, currentY, contentWidth, 18, 2, 2, 'D')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 105, 115)
  doc.text('QUOTATION PREPARED FOR:', leftMargin + 4, currentY + 5)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(26, 29, 32)
  doc.text(quotation.clientName || 'Walk-in Guest', leftMargin + 4, currentY + 11)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(70, 75, 85)
  const contactParts: string[] = []
  if (quotation.clientPhone) contactParts.push(`Phone: ${quotation.clientPhone}`)
  if (quotation.clientEmail) contactParts.push(`Email: ${quotation.clientEmail}`)
  if (quotation.isWalkIn) contactParts.push('(Walk-in Guest)')
  doc.text(contactParts.join('   |   ') || 'No contact details registered', leftMargin + 4, currentY + 15)

  currentY += 23

  // Table Column Definitions
  // Total width: 182mm
  // Item (65mm), Stylist (35mm), Qty (14mm), Rate (24mm), Disc (20mm), Total (24mm)
  const colX = {
    desc: leftMargin + 3,
    stylist: leftMargin + 70,
    qty: leftMargin + 105,
    rate: leftMargin + 120,
    discount: leftMargin + 145,
    total: pageWidth - rightMargin - 3,
  }

  const renderTableHeader = () => {
    doc.setFillColor(240, 242, 245)
    doc.rect(leftMargin, currentY, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(50, 55, 65)

    doc.text('ITEM / SERVICE & DESCRIPTION', colX.desc, currentY + 4.8)
    doc.text('STYLIST / ASSIGNED', colX.stylist, currentY + 4.8)
    doc.text('QTY', colX.qty, currentY + 4.8, { align: 'center' })
    doc.text('PRICE', colX.rate, currentY + 4.8, { align: 'right' })
    doc.text('DISC.', colX.discount, currentY + 4.8, { align: 'right' })
    doc.text('TOTAL', colX.total, currentY + 4.8, { align: 'right' })
    currentY += 8
  }

  renderTableHeader()

  const items = quotation.items || []
  let rowIndex = 0

  for (const item of items) {
    // Check for page overflow
    if (currentY > pageHeight - 55) {
      doc.addPage()
      currentY = 14
      renderHeader()
      renderTableHeader()
    }

    if (rowIndex % 2 === 1) {
      doc.setFillColor(252, 253, 254)
      doc.rect(leftMargin, currentY - 1, contentWidth, 8, 'F')
    }

    // Line description & custom tag
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(26, 29, 32)
    const displayName = item.name || item.description || 'Quotation Item'
    const customSuffix = item.isCustom ? ' (Custom Line)' : ''
    doc.text(`${displayName}${customSuffix}`, colX.desc, currentY + 3.5)

    // Sub-description or item type
    if (item.description && item.description !== item.name) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(110, 115, 125)
      doc.text(item.description, colX.desc, currentY + 6.8)
    }

    // Stylist
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 75, 85)
    doc.text(item.staffName || '—', colX.stylist, currentY + 3.5)

    // Qty
    doc.text(String(item.quantity || 1), colX.qty, currentY + 3.5, { align: 'center' })

    // Price
    doc.text(formatPdfCurrency(item.unitPrice), colX.rate, currentY + 3.5, { align: 'right' })

    // Discount
    if (item.discountAmount && item.discountAmount > 0) {
      doc.setTextColor(180, 50, 40)
      doc.text(`-${formatPdfCurrency(item.discountAmount)}`, colX.discount, currentY + 3.5, { align: 'right' })
    } else {
      doc.setTextColor(140, 145, 155)
      doc.text('—', colX.discount, currentY + 3.5, { align: 'right' })
    }

    // Total
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 29, 32)
    doc.text(formatPdfCurrency(item.totalPrice), colX.total, currentY + 3.5, { align: 'right' })

    const rowHeight = (item.description && item.description !== item.name) ? 9 : 6.5
    currentY += rowHeight
    rowIndex++

    // Light line divider
    doc.setDrawColor(240, 242, 246)
    doc.setLineWidth(0.2)
    doc.line(leftMargin, currentY - 0.5, pageWidth - rightMargin, currentY - 0.5)
  }

  currentY += 4

  // Check overflow before rendering totals
  if (currentY > pageHeight - 65) {
    doc.addPage()
    currentY = 14
    renderHeader()
  }

  // Financial Breakdown Box (Right Aligned)
  const totalsBoxWidth = 85
  const totalsBoxX = pageWidth - rightMargin - totalsBoxWidth

  doc.setFillColor(248, 249, 251)
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, 42, 2, 2, 'F')
  doc.setDrawColor(230, 233, 238)
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, 42, 2, 2, 'D')

  let totalY = currentY + 5

  const renderSummaryRow = (label: string, amount: string, isBold: boolean = false, isDiscount: boolean = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')
    doc.setFontSize(8)
    if (isDiscount) {
      doc.setTextColor(180, 50, 40)
    } else {
      doc.setTextColor(isBold ? 26 : 70, isBold ? 29 : 75, isBold ? 32 : 85)
    }
    doc.text(label, totalsBoxX + 4, totalY)
    doc.text(amount, totalsBoxX + totalsBoxWidth - 4, totalY, { align: 'right' })
    totalY += 4.5
  }

  renderSummaryRow('Subtotal:', formatPdfCurrency(quotation.subtotal))

  if (quotation.discountAmount > 0) {
    const discLabel = quotation.discountType === 'percentage'
      ? `Discount (${quotation.discountValue}%):`
      : 'Quotation Discount:'
    renderSummaryRow(discLabel, `-${formatPdfCurrency(quotation.discountAmount)}`, false, true)
  }

  const isGst = quotation.taxTreatment !== 'non_gst'
  if (isGst && quotation.taxAmount > 0) {
    const cgst = Number(quotation.cgstAmount) || quotation.taxAmount / 2
    const sgst = Number(quotation.sgstAmount) || quotation.taxAmount / 2
    renderSummaryRow('Central GST (CGST 9%):', formatPdfCurrency(cgst))
    renderSummaryRow('State GST (SGST 9%):', formatPdfCurrency(sgst))
  } else {
    renderSummaryRow('Applicable Tax (GST):', 'Rs. 0.00 (Non-GST / Exempt)')
  }

  // Grand Total Line
  doc.setDrawColor(197, 160, 89)
  doc.setLineWidth(0.4)
  doc.line(totalsBoxX + 3, totalY, totalsBoxX + totalsBoxWidth - 3, totalY)
  totalY += 4.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(197, 160, 89)
  doc.text('ESTIMATED TOTAL:', totalsBoxX + 4, totalY)
  doc.text(formatPdfCurrency(quotation.totalAmount), totalsBoxX + totalsBoxWidth - 4, totalY, { align: 'right' })

  // Left Side Notes & Advance Payment Requirement
  const notesWidth = contentWidth - totalsBoxWidth - 8
  let noteY = currentY + 3

  if (quotation.advanceRequired && quotation.advanceRequired > 0) {
    doc.setFillColor(254, 243, 235)
    doc.roundedRect(leftMargin, noteY, notesWidth, 12, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(180, 85, 20)
    doc.text('ADVANCE PAYMENT REQUIREMENT', leftMargin + 3, noteY + 4)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(70, 75, 85)
    doc.text(`An advance deposit of ${formatPdfCurrency(quotation.advanceRequired)} is requested upon booking confirmation.`, leftMargin + 3, noteY + 8.5)
    noteY += 15
  }

  if (quotation.customerNotes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(70, 75, 85)
    doc.text('Customer Notes:', leftMargin, noteY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(100, 105, 115)
    const splitNotes = doc.splitTextToSize(quotation.customerNotes, notesWidth)
    doc.text(splitNotes, leftMargin, noteY + 4)
    noteY += splitNotes.length * 4 + 3
  }

  if (quotation.termsAndConditions) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 125, 135)
    doc.text('Terms & Conditions:', leftMargin, noteY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.setTextColor(130, 135, 145)
    const splitTerms = doc.splitTextToSize(quotation.termsAndConditions, notesWidth)
    doc.text(splitTerms, leftMargin, noteY + 3.5)
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setDrawColor(230, 233, 238)
    doc.setLineWidth(0.3)
    doc.line(leftMargin, pageHeight - 12, pageWidth - rightMargin, pageHeight - 12)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(140, 145, 155)
    doc.text(
      'This document is a price estimate / quotation only and does not constitute a Tax Invoice. Rates valid until specified date.',
      leftMargin,
      pageHeight - 8
    )
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - rightMargin, pageHeight - 8, { align: 'right' })
  }

  return doc
}

/**
 * Downloads a Quotation vector PDF file to the client's browser.
 */
export function downloadQuotationPdf(
  quotation: Quotation,
  salonOverride?: Partial<Salon | SalonPdfInfo>
): void {
  const doc = generateQuotationPdf(quotation, salonOverride)
  const filename = `HairDexirity-Quotation-${quotation.quotationNumber || 'Estimate'}.pdf`
  doc.save(filename)
}

/**
 * Generates an official, luxury-styled Luma Salon Proforma Invoice PDF document.
 * Strictly displays "PROFORMA INVOICE — NOT A TAX INVOICE".
 */
export function generateProformaPdf(
  proforma: ProformaInvoice,
  salonOverride?: Partial<Salon | SalonPdfInfo>
): jsPDF {
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
  const contentWidth = pageWidth - leftMargin - rightMargin

  const salon: SalonPdfInfo = {
    ...DEFAULT_SALON_INFO,
    ...(salonOverride as any),
  }

  let currentY = 14

  // Top Accent
  doc.setFillColor(197, 160, 89)
  doc.rect(leftMargin, currentY, contentWidth, 2, 'F')
  currentY += 6

  // Brand Name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(26, 29, 32)
  doc.text(salon.name.toUpperCase(), leftMargin, currentY + 2)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 105, 115)
  doc.text('HAUTE COIFFURE & LUXURY BEAUTY LOUNGE', leftMargin, currentY + 7)

  // Title
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(26, 29, 32)
  doc.text('PROFORMA INVOICE', pageWidth - rightMargin, currentY + 2, { align: 'right' })

  // Number
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(197, 160, 89)
  doc.text(proforma.proformaNumber, pageWidth - rightMargin, currentY + 8, { align: 'right' })

  currentY += 13

  // Salon Details
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

  // Dates
  const dateY = currentY - (salon.gstin ? 12 : 8)
  doc.text(`Date: ${proforma.issueDate}`, pageWidth - rightMargin, dateY, { align: 'right' })
  doc.text(`Valid Until: ${proforma.validUntil}`, pageWidth - rightMargin, dateY + 4, { align: 'right' })
  doc.text(`Status: ${proforma.status.toUpperCase()}`, pageWidth - rightMargin, dateY + 8, { align: 'right' })

  currentY += 4

  // Prominent "PROFORMA INVOICE — NOT A TAX INVOICE" Banner
  doc.setFillColor(254, 245, 235)
  doc.setDrawColor(210, 120, 20)
  doc.roundedRect(leftMargin, currentY, contentWidth, 7, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(180, 85, 20)
  doc.text('PROFORMA INVOICE — NOT A TAX INVOICE', pageWidth / 2, currentY + 4.8, { align: 'center' })
  currentY += 11

  // Customer Box
  doc.setFillColor(248, 249, 251)
  doc.roundedRect(leftMargin, currentY, contentWidth, 16, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(100, 105, 115)
  doc.text('PREPARED FOR:', leftMargin + 4, currentY + 5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(26, 29, 32)
  doc.text(proforma.clientName || 'Valued Customer', leftMargin + 4, currentY + 11)
  currentY += 21

  // Items Header
  doc.setFillColor(240, 242, 245)
  doc.rect(leftMargin, currentY, contentWidth, 7, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(50, 55, 65)
  doc.text('ITEM & DESCRIPTION', leftMargin + 3, currentY + 4.8)
  doc.text('QTY', leftMargin + 105, currentY + 4.8, { align: 'center' })
  doc.text('RATE', leftMargin + 130, currentY + 4.8, { align: 'right' })
  doc.text('TAX', leftMargin + 155, currentY + 4.8, { align: 'right' })
  doc.text('TOTAL', pageWidth - rightMargin - 3, currentY + 4.8, { align: 'right' })
  currentY += 8

  const items = proforma.items || []
  for (const item of items) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(26, 29, 32)
    doc.text(item.name || item.description || 'Line Item', leftMargin + 3, currentY + 3.5)
    doc.text(String(item.quantity || 1), leftMargin + 105, currentY + 3.5, { align: 'center' })
    doc.text(formatPdfCurrency(item.unitPrice), leftMargin + 130, currentY + 3.5, { align: 'right' })
    doc.text(formatPdfCurrency(item.taxAmount), leftMargin + 155, currentY + 3.5, { align: 'right' })
    doc.setFont('helvetica', 'bold')
    doc.text(formatPdfCurrency(item.totalPrice), pageWidth - rightMargin - 3, currentY + 3.5, { align: 'right' })
    currentY += 6.5
  }

  currentY += 4

  // Totals Box
  const totalsBoxWidth = 85
  const totalsBoxX = pageWidth - rightMargin - totalsBoxWidth
  doc.setFillColor(248, 249, 251)
  doc.roundedRect(totalsBoxX, currentY, totalsBoxWidth, 28, 2, 2, 'F')
  let totY = currentY + 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(70, 75, 85)
  doc.text('Subtotal:', totalsBoxX + 4, totY)
  doc.text(formatPdfCurrency(proforma.subtotal), totalsBoxX + totalsBoxWidth - 4, totY, { align: 'right' })
  totY += 4.5

  if (proforma.discountAmount > 0) {
    doc.setTextColor(180, 50, 40)
    doc.text('Discount:', totalsBoxX + 4, totY)
    doc.text(`-${formatPdfCurrency(proforma.discountAmount)}`, totalsBoxX + totalsBoxWidth - 4, totY, { align: 'right' })
    totY += 4.5
  }

  doc.setTextColor(70, 75, 85)
  doc.text('Tax (GST 18%):', totalsBoxX + 4, totY)
  doc.text(formatPdfCurrency(proforma.taxAmount), totalsBoxX + totalsBoxWidth - 4, totY, { align: 'right' })
  totY += 5

  doc.setDrawColor(197, 160, 89)
  doc.line(totalsBoxX + 3, totY, totalsBoxX + totalsBoxWidth - 3, totY)
  totY += 4.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(197, 160, 89)
  doc.text('PROFORMA TOTAL:', totalsBoxX + 4, totY)
  doc.text(formatPdfCurrency(proforma.totalAmount), totalsBoxX + totalsBoxWidth - 4, totY, { align: 'right' })

  // Footer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(140, 145, 155)
  doc.text(
    'PROFORMA INVOICE ONLY — This is not a tax invoice and cannot be used for input tax credit. Final tax invoice issued upon settlement.',
    leftMargin,
    pageHeight - 8
  )

  return doc
}

/**
 * Downloads a Proforma Invoice vector PDF file to the client's browser.
 */
export function downloadProformaPdf(
  proforma: ProformaInvoice,
  salonOverride?: Partial<Salon | SalonPdfInfo>
): void {
  const doc = generateProformaPdf(proforma, salonOverride)
  const filename = `HairDexirity-Proforma-${proforma.proformaNumber || 'Proforma'}.pdf`
  doc.save(filename)
}
