// ==============================================================================
// Luma Salon — Financial Reports & Analytics Service (Phase 7)
// Executive Revenue Reconciliation, Cash Flow Trends & Accounting Export Engine
// ==============================================================================

import type {
  Invoice,
  FinancialSummaryKpis,
  PaymentMethodShare,
  DailyCashFlowPoint,
  PaymentMethod,
} from '../types/finance.ts'
import { billingService } from './billingService.ts'
import type { DateRange } from './ownerDashboardService.ts'
import { addDaysToDate, getSalonDateStr } from '../utils/formatters.ts'

const METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: 'UPI (GPay / PhonePe / Paytm)',
  card: 'Credit / Debit Card',
  cash: 'Cash Tendered',
  bank: 'Bank Transfer (NEFT / IMPS)',
  split: 'Split Multi-Tender',
  advance: 'Advance Allocation',
  credit_note: 'Credit Note Allocation',
  other: 'Other Methods',
}

export const financialReportsService = {
  /**
   * Generates high-level executive financial metrics across a date range
   */
  getFinancialSummary(dateRange: DateRange): FinancialSummaryKpis {
    const allInvoices = billingService.getAllInvoices()
    const rangeInvoices = allInvoices.filter(
      (inv) =>
        inv.date >= dateRange.startDate &&
        inv.date <= dateRange.endDate &&
        inv.paymentStatus !== 'draft'
    )

    let totalCollectedRevenue = 0
    let totalInvoicedAmount = 0
    let outstandingReceivables = 0
    let totalTaxCollected = 0
    let totalCgstCollected = 0
    let totalSgstCollected = 0
    let totalDiscountsGiven = 0
    let paidInvoicesCount = 0
    let unpaidInvoicesCount = 0
    let cashCollected = 0
    let digitalCollected = 0

    for (const inv of rangeInvoices) {
      totalInvoicedAmount += inv.totalAmount
      outstandingReceivables += inv.balanceDue
      totalTaxCollected += inv.taxAmount
      totalCgstCollected += inv.cgstAmount
      totalSgstCollected += inv.sgstAmount
      totalDiscountsGiven += inv.discountAmount

      if (inv.paymentStatus === 'paid') {
        paidInvoicesCount++
      } else {
        unpaidInvoicesCount++
      }

      // Sum payments recorded
      for (const p of inv.payments) {
        totalCollectedRevenue += p.amount
        if (p.paymentMethod === 'cash') {
          cashCollected += p.amount
        } else if (p.paymentMethod === 'upi' || p.paymentMethod === 'card' || p.paymentMethod === 'bank') {
          digitalCollected += p.amount
        }
      }
    }

    const totalInvoicesCount = rangeInvoices.length
    const averageTicketValue =
      totalInvoicesCount > 0 ? Math.round(totalInvoicedAmount / totalInvoicesCount) : 0
    const digitalSharePercentage =
      totalCollectedRevenue > 0
        ? Math.round((digitalCollected / totalCollectedRevenue) * 1000) / 10
        : 0

    const roundedCgst = Math.round(totalCgstCollected * 100) / 100
    const roundedSgst = Math.round(totalSgstCollected * 100) / 100
    const roundedTax = Math.round((roundedCgst + roundedSgst) * 100) / 100

    return {
      totalCollectedRevenue: Math.round(totalCollectedRevenue * 100) / 100,
      totalInvoicedAmount: Math.round(totalInvoicedAmount * 100) / 100,
      outstandingReceivables: Math.round(outstandingReceivables * 100) / 100,
      totalTaxCollected: roundedTax,
      totalCgstCollected: roundedCgst,
      totalSgstCollected: roundedSgst,
      totalDiscountsGiven: Math.round(totalDiscountsGiven * 100) / 100,
      averageTicketValue,
      totalInvoicesCount,
      paidInvoicesCount,
      unpaidInvoicesCount,
      cashCollected: Math.round(cashCollected * 100) / 100,
      digitalCollected: Math.round(digitalCollected * 100) / 100,
      digitalSharePercentage,
    }
  },

  /**
   * Computes payment method distribution and share percentages
   */
  getPaymentMethodBreakdown(dateRange: DateRange): PaymentMethodShare[] {
    const allInvoices = billingService.getAllInvoices()
    const rangeInvoices = allInvoices.filter(
      (inv) =>
        inv.date >= dateRange.startDate &&
        inv.date <= dateRange.endDate &&
        inv.paymentStatus !== 'draft'
    )

    const map = new Map<PaymentMethod, { amount: number; count: number }>()
    map.set('upi', { amount: 0, count: 0 })
    map.set('card', { amount: 0, count: 0 })
    map.set('cash', { amount: 0, count: 0 })
    map.set('bank', { amount: 0, count: 0 })

    let totalCollected = 0

    for (const inv of rangeInvoices) {
      for (const p of inv.payments) {
        totalCollected += p.amount
        const key: PaymentMethod = p.paymentMethod
        const entry = map.get(key) || { amount: 0, count: 0 }
        entry.amount += p.amount
        entry.count++
        map.set(key, entry)
      }
    }

    const result: PaymentMethodShare[] = []
    map.forEach((val, key) => {
      const percentage =
        totalCollected > 0 ? Math.round((val.amount / totalCollected) * 1000) / 10 : 0
      result.push({
        method: key,
        label: METHOD_LABELS[key] || key.toUpperCase(),
        amount: Math.round(val.amount * 100) / 100,
        count: val.count,
        percentage,
      })
    })

    result.sort((a, b) => b.amount - a.amount)
    return result
  },

  /**
   * Computes daily cash flow trends (Cash vs Digital receipts) for charts
   */
  getCashFlowDailyTrends(dateRange: DateRange): DailyCashFlowPoint[] {
    const allInvoices = billingService.getAllInvoices()
    const rangeInvoices = allInvoices.filter(
      (inv) =>
        inv.date >= dateRange.startDate &&
        inv.date <= dateRange.endDate &&
        inv.paymentStatus !== 'draft'
    )

    const points: DailyCashFlowPoint[] = []
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const todayStr = getSalonDateStr(0)
    const endBoundary = dateRange.endDate > todayStr ? todayStr : dateRange.endDate

    let cur = dateRange.startDate
    let guard = 0

    while (cur <= endBoundary && guard < 60) {
      guard++
      const dayInvoices = rangeInvoices.filter((i) => i.date === cur)
      let cashAmount = 0
      let upiAmount = 0
      let cardAmount = 0
      let totalCollected = 0

      for (const inv of dayInvoices) {
        for (const p of inv.payments) {
          totalCollected += p.amount
          if (p.paymentMethod === 'cash') cashAmount += p.amount
          else if (p.paymentMethod === 'upi') upiAmount += p.amount
          else if (p.paymentMethod === 'card' || p.paymentMethod === 'bank') cardAmount += p.amount
        }
      }

      const dObj = new Date(`${cur}T12:00:00+05:30`)
      const dayOfWeek = dayNames[dObj.getDay()]
      const [, mStr, dStr] = cur.split('-')
      const displayDate = `${dStr}/${mStr}`

      points.push({
        date: cur,
        displayDate,
        dayOfWeek,
        cashAmount: Math.round(cashAmount * 100) / 100,
        upiAmount: Math.round(upiAmount * 100) / 100,
        cardAmount: Math.round(cardAmount * 100) / 100,
        totalCollected: Math.round(totalCollected * 100) / 100,
        invoiceCount: dayInvoices.length,
      })

      cur = addDaysToDate(cur, 1)
    }

    return points
  },

  /**
   * Generates RFC 4180 compliant CSV export for accounting and tax reconciliation
   */
  exportInvoicesToCsv(invoices: Invoice[]): string {
    const headers = [
      'Invoice Number',
      'Date',
      'Client Name',
      'Phone',
      'Staff / Stylist',
      'Service Description',
      'Subtotal (INR)',
      'Discount (INR)',
      'Discount Reason',
      'Tax Rate',
      'Tax Amount (INR)',
      'CGST 9% (INR)',
      'SGST 9% (INR)',
      'Total Amount (INR)',
      'Paid Amount (INR)',
      'Balance Due (INR)',
      'Payment Status',
      'Primary Tender',
      'Created At',
    ]

    const escapeCsv = (val?: string | number | null) => {
      if (val === null || val === undefined) return '""'
      const str = String(val).replace(/"/g, '""')
      return `"${str}"`
    }

    const rows = invoices.map((inv) => [
      escapeCsv(inv.invoiceNumber),
      escapeCsv(inv.date),
      escapeCsv(inv.clientName),
      escapeCsv(inv.clientPhone || ''),
      escapeCsv(inv.staffName),
      escapeCsv(inv.serviceName || ''),
      escapeCsv(inv.subtotal),
      escapeCsv(inv.discountAmount),
      escapeCsv(inv.discountReason || ''),
      escapeCsv(`${inv.taxRate * 100}%`),
      escapeCsv(inv.taxAmount),
      escapeCsv(inv.cgstAmount),
      escapeCsv(inv.sgstAmount),
      escapeCsv(inv.totalAmount),
      escapeCsv(inv.paidAmount),
      escapeCsv(inv.balanceDue),
      escapeCsv(inv.paymentStatus.toUpperCase()),
      escapeCsv(inv.primaryPaymentMethod.toUpperCase()),
      escapeCsv(inv.createdAt),
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  },
}
