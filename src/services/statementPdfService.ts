// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Customer Account Statement PDF Generator
// Client-Side High-Fidelity Vector PDF Generation via jsPDF
// ==============================================================================

import { jsPDF } from 'jspdf'
import type { CustomerLedgerSummary, CustomerLedgerEvent } from '../types/finance.ts'
import { formatPdfCurrency, type SalonPdfInfo } from './pdfService.ts'

export interface CustomerStatementPdfData {
  salon?: Partial<SalonPdfInfo>
  client: {
    id: string
    name: string
    phone?: string
    email?: string
  }
  startDate?: string
  endDate?: string
  summary: CustomerLedgerSummary
  transactions: CustomerLedgerEvent[]
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
 * Generates an official, luxury-styled Luma Salon PDF statement for a customer.
 */
export function generateStatementPdf(data: CustomerStatementPdfData): jsPDF {
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
    ...(data.salon || {}),
  }

  let currentY = 14

  // Helper to add top brand bar & header
  const renderHeader = () => {
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

    // Statement Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(26, 29, 32)
    doc.text('CUSTOMER ACCOUNT STATEMENT', pageWidth - rightMargin, currentY + 2, {
      align: 'right',
    })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(100, 105, 115)
    const periodText =
      data.startDate || data.endDate
        ? `Period: ${data.startDate || 'Beginning'} to ${data.endDate || 'Present'}`
        : 'All Transactions to Date'
    doc.text(periodText, pageWidth - rightMargin, currentY + 7, { align: 'right' })

    currentY += 13

    // Separator line
    doc.setDrawColor(230, 233, 238)
    doc.setLineWidth(0.3)
    doc.line(leftMargin, currentY, pageWidth - rightMargin, currentY)
    currentY += 6
  }

  renderHeader()

  // --------------------------------------------------------------------------
  // Salon & Customer Meta Block
  // --------------------------------------------------------------------------
  const metaColWidth = contentWidth / 2

  // Left: Salon Info
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(26, 29, 32)
  doc.text('ISSUED BY:', leftMargin, currentY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 85, 95)
  let salonTextY = currentY + 4
  const salonAddress = [salon.street, salon.city, salon.state, salon.postalCode]
    .filter(Boolean)
    .join(', ')
  if (salonAddress) {
    doc.text(salonAddress, leftMargin, salonTextY)
    salonTextY += 3.8
  }
  doc.text(`Phone: ${salon.phone}  |  Email: ${salon.email}`, leftMargin, salonTextY)
  salonTextY += 3.8
  if (salon.gstin) {
    doc.text(`GSTIN: ${salon.gstin}`, leftMargin, salonTextY)
  }

  // Right: Customer Info
  const rightColX = leftMargin + metaColWidth + 6
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(26, 29, 32)
  doc.text('STATEMENT FOR:', rightColX, currentY)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(26, 29, 32)
  doc.text(data.client.name, rightColX, currentY + 4.5)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(80, 85, 95)
  let clientTextY = currentY + 8.5
  if (data.client.phone) {
    doc.text(`Phone: ${data.client.phone}`, rightColX, clientTextY)
    clientTextY += 3.8
  }
  if (data.client.email) {
    doc.text(`Email: ${data.client.email}`, rightColX, clientTextY)
    clientTextY += 3.8
  }
  doc.text(`Statement Date: ${new Date().toLocaleDateString('en-IN')}`, rightColX, clientTextY)

  currentY = Math.max(salonTextY, clientTextY) + 6

  // --------------------------------------------------------------------------
  // Financial Summary Cards
  // --------------------------------------------------------------------------
  doc.setFillColor(248, 249, 250)
  doc.roundedRect(leftMargin, currentY, contentWidth, 20, 2, 2, 'F')
  doc.setDrawColor(230, 233, 238)
  doc.roundedRect(leftMargin, currentY, contentWidth, 20, 2, 2, 'S')

  const cardWidth = contentWidth / 4

  const summaryCols = [
    { label: 'TOTAL INVOICED', value: formatPdfCurrency(data.summary.total_invoiced) },
    { label: 'TOTAL PAID', value: formatPdfCurrency(data.summary.total_paid) },
    {
      label: 'AVAILABLE CREDITS',
      value: formatPdfCurrency(
        (data.summary.available_advance || 0) + (data.summary.available_credit || 0)
      ),
    },
    {
      label: 'NET OUTSTANDING',
      value: formatPdfCurrency(data.summary.net_customer_balance),
      highlight: true,
    },
  ]

  summaryCols.forEach((col, idx) => {
    const colX = leftMargin + idx * cardWidth + 4
    const centerY = currentY + 7

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(120, 125, 135)
    doc.text(col.label, colX, centerY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    if (col.highlight) {
      if (data.summary.net_customer_balance > 0) {
        doc.setTextColor(190, 40, 40) // Red for due
      } else {
        doc.setTextColor(30, 140, 60) // Green for zero or credit
      }
    } else {
      doc.setTextColor(26, 29, 32)
    }
    doc.text(col.value, colX, centerY + 6.5)

    if (idx < 3) {
      doc.setDrawColor(220, 224, 230)
      doc.line(
        leftMargin + (idx + 1) * cardWidth,
        currentY + 3,
        leftMargin + (idx + 1) * cardWidth,
        currentY + 17
      )
    }
  })

  currentY += 26

  // --------------------------------------------------------------------------
  // Transactions Table Header
  // --------------------------------------------------------------------------
  const colDate = 24
  const colType = 32
  const colRef = 32
  const colDesc = 34
  const colDebit = 20
  const colCredit = 20
  const colBalance = 20

  const drawTableHeader = () => {
    doc.setFillColor(240, 243, 246)
    doc.rect(leftMargin, currentY, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(50, 55, 65)

    let x = leftMargin + 2
    doc.text('DATE', x, currentY + 4.8)
    x += colDate
    doc.text('TYPE', x, currentY + 4.8)
    x += colType
    doc.text('REFERENCE', x, currentY + 4.8)
    x += colRef
    doc.text('DESCRIPTION', x, currentY + 4.8)
    x += colDesc
    doc.text('DEBIT', x + colDebit - 4, currentY + 4.8, { align: 'right' })
    x += colDebit
    doc.text('CREDIT', x + colCredit - 4, currentY + 4.8, { align: 'right' })
    x += colCredit
    doc.text('BALANCE', x + colBalance - 4, currentY + 4.8, { align: 'right' })

    currentY += 8
  }

  drawTableHeader()

  // --------------------------------------------------------------------------
  // Transaction Rows
  // --------------------------------------------------------------------------
  let running = 0
  const transactions = data.transactions || []

  if (transactions.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8.5)
    doc.setTextColor(140, 145, 155)
    doc.text('No transactions found for the selected period.', leftMargin + 4, currentY + 6)
    currentY += 14
  } else {
    transactions.forEach((tx, idx) => {
      // Check for page overflow
      if (currentY > pageHeight - 25) {
        doc.addPage()
        currentY = 14
        renderHeader()
        drawTableHeader()
      }

      if (idx % 2 === 1) {
        doc.setFillColor(252, 252, 253)
        doc.rect(leftMargin, currentY - 1, contentWidth, 6.5, 'F')
      }

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(40, 44, 52)

      let x = leftMargin + 2
      // Date
      doc.text(tx.event_date || tx.event_timestamp.slice(0, 10), x, currentY + 3.5)
      x += colDate

      // Type
      doc.text(tx.transaction_type.replace(/_/g, ' '), x, currentY + 3.5)
      x += colType

      // Reference
      doc.text(tx.reference || '—', x, currentY + 3.5)
      x += colRef

      // Description (truncate if too long)
      const desc =
        tx.description.length > 22
          ? `${tx.description.substring(0, 20)}...`
          : tx.description
      doc.text(desc, x, currentY + 3.5)
      x += colDesc

      // Debit
      const debitText = tx.debit_amount > 0 ? formatPdfCurrency(tx.debit_amount) : '—'
      doc.text(debitText, x + colDebit - 4, currentY + 3.5, { align: 'right' })
      x += colDebit

      // Credit
      const creditText = tx.credit_amount > 0 ? formatPdfCurrency(tx.credit_amount) : '—'
      doc.text(creditText, x + colCredit - 4, currentY + 3.5, { align: 'right' })
      x += colCredit

      // Balance
      running += (tx.debit_amount || 0) - (tx.credit_amount || 0)
      const balanceVal =
        tx.running_balance !== undefined ? tx.running_balance : running
      const balanceText = formatPdfCurrency(balanceVal)
      doc.setFont('helvetica', 'bold')
      doc.text(balanceText, x + colBalance - 4, currentY + 3.5, { align: 'right' })

      currentY += 6.5
    })
  }

  // Bottom line
  doc.setDrawColor(210, 215, 222)
  doc.setLineWidth(0.3)
  doc.line(leftMargin, currentY + 2, pageWidth - rightMargin, currentY + 2)
  currentY += 8

  // --------------------------------------------------------------------------
  // Footer Notes & Pagination
  // --------------------------------------------------------------------------
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(140, 145, 155)

    const footerText = `Computer-generated statement for ${data.client.name} — Hair Dexirity`
    doc.text(footerText, leftMargin, pageHeight - 8)

    const pageStr = `Page ${p} of ${totalPages}`
    doc.text(pageStr, pageWidth - rightMargin, pageHeight - 8, { align: 'right' })
  }

  return doc
}

/**
 * Convenience helper to download the statement PDF directly in browser
 */
export function downloadCustomerStatementPdf(
  data: CustomerStatementPdfData,
  filename?: string
): void {
  const doc = generateStatementPdf(data)
  const clientSlug = data.client.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
  const name =
    filename || `Statement_${clientSlug}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(name)
}

