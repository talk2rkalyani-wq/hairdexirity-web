// ==============================================================================
// Luma Salon — Financial Intelligence Export Service (Phase 8)
// 8 RFC-4180 Compliant CSV Reports & High-Fidelity Executive Summary PDF
// ==============================================================================

import { jsPDF } from 'jspdf'
import type { OwnerFinancialIntelligenceReport } from '../types/financialIntelligence.ts'

const escapeCsv = (val?: string | number | null): string => {
  if (val === null || val === undefined) return '""'
  const str = String(val).replace(/"/g, '""')
  return `"${str}"`
}

export const financialIntelligenceExportService = {
  // --------------------------------------------------------------------------
  // 1. Financial Summary CSV
  // --------------------------------------------------------------------------
  exportFinancialSummaryCsv(report: OwnerFinancialIntelligenceReport): string {
    const k = report.kpis
    const pnl = report.pnlStatement

    const lines: string[] = [
      `"HAIR DEXIRITY — FINANCIAL INTELLIGENCE SUMMARY"`,
      `"Period",${escapeCsv(report.dateRange.label)},"From",${escapeCsv(report.period.startDate)},"To",${escapeCsv(report.period.endDate)}`,
      `"Salon ID",${escapeCsv(report.salonId)}`,
      `""`,
      `"METRIC CATEGORY","METRIC NAME","AMOUNT (INR)","DETAILS"`,
      `"Revenue","Gross Sales",${k.grossSales},"Accrual revenue before discounts"`,
      `"Revenue","Discounts Given",${k.discountsTotal},"Discounts granted on sales"`,
      `"Revenue","Net Sales",${k.netSales},"Gross Sales minus Discounts"`,
      `"Taxation","CGST Collected",${k.cgstCollected},"9% Central GST (Statutory liability)"`,
      `"Taxation","SGST Collected",${k.sgstCollected},"9% State GST (Statutory liability)"`,
      `"Taxation","Total GST Collected",${k.taxCollected},"Excluded from business revenue"`,
      `"Revenue","Total Invoiced Amount",${k.totalInvoiced},"Net Sales plus GST"`,
      `"Collections","Actual Cash Collections",${k.totalCollections},"Total payment tenders received"`,
      `"Receivables","Customer Outstanding",${k.customerOutstanding},"Unpaid & partial invoice balances"`,
      `"Receivables","Customer Advances Credit",${k.customerAdvancesBalance},"Unallocated customer advances"`,
      `"Reversals","Customer Refunds",${k.refundsTotal},"Processed and completed refunds"`,
      `"Reversals","Credit Notes Active",${k.creditNotesBalance},"Remaining active credit note balance"`,
      `"Procurement","Purchase Bills Expense",${k.purchaseExpenses},"Total vendor procurement bills"`,
      `"Payables","Supplier Outstanding",${k.supplierOutstanding},"Unpaid accounts payable balance"`,
      `"Payables","Supplier Advances Held",${k.supplierAdvancesBalance},"Unallocated payments to suppliers"`,
      `"Inventory","Total Stock Valuation",${k.inventoryTotalValue},"Live inventory capital"`,
      `"Inventory","Retail Stock Value",${k.inventoryRetailValue},"Stock intended for client sale"`,
      `"Inventory","Consumables Value",${k.inventoryConsumableValue},"Stock for internal salon services"`,
      `"Cost of Sales","Cost of Goods Sold (COGS)",${k.cogsRetail},"Retail purchase cost of goods sold"`,
      `"Cost of Sales","Consumables Usage Cost",${k.consumableUsageCost},"Cost of consumables used in services"`,
      `"Losses","Stock Losses & Wastage",${k.stockLossValue},"Damaged, expired and spilled stock"`,
      `"Profitability","Estimated Gross Profit",${k.estimatedGrossProfit},"${pnl.grossMarginPercentage}% gross margin"`,
      `"Profitability","Recorded Operating Contribution",${k.recordedOperatingContribution},"${pnl.contributionMarginPercentage}% contribution margin"`,
      `""`,
      `"DISCLAIMER",${escapeCsv(pnl.disclaimer)}`,
    ]

    return lines.join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 2. Revenue Report CSV
  // --------------------------------------------------------------------------
  exportRevenueReportCsv(report: OwnerFinancialIntelligenceReport): string {
    const headers = [
      'Date',
      'Display Date',
      'Day',
      'Gross Sales (INR)',
      'Net Sales (INR)',
      'Tax Amount (INR)',
      'Total Invoiced (INR)',
      'Invoices Count',
    ]

    const rows = report.revenueVsCollections.map((r) => [
      escapeCsv(r.date),
      escapeCsv(r.displayDate),
      escapeCsv(r.dayOfWeek),
      escapeCsv(r.grossSales.toFixed(2)),
      escapeCsv(r.netSales.toFixed(2)),
      escapeCsv(r.taxAmount.toFixed(2)),
      escapeCsv(r.totalInvoiced.toFixed(2)),
      escapeCsv(r.invoicesCount),
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 3. Collections Report CSV
  // --------------------------------------------------------------------------
  exportCollectionsReportCsv(report: OwnerFinancialIntelligenceReport): string {
    const headers = [
      'Date',
      'Display Date',
      'Day',
      'Total Collections (INR)',
      'Cash (INR)',
      'UPI (INR)',
      'Card (INR)',
      'Bank Transfer (INR)',
    ]

    const rows = report.revenueVsCollections.map((r) => [
      escapeCsv(r.date),
      escapeCsv(r.displayDate),
      escapeCsv(r.dayOfWeek),
      escapeCsv(r.collections.toFixed(2)),
      escapeCsv(r.cashCollections.toFixed(2)),
      escapeCsv(r.upiCollections.toFixed(2)),
      escapeCsv(r.cardCollections.toFixed(2)),
      escapeCsv(r.bankCollections.toFixed(2)),
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 4. Profit & Loss Report CSV
  // --------------------------------------------------------------------------
  exportProfitLossCsv(report: OwnerFinancialIntelligenceReport): string {
    const p = report.pnlStatement

    const lines: string[] = [
      `"HAIR DEXIRITY — OWNER PROFIT & LOSS STATEMENT"`,
      `"Period",${escapeCsv(report.dateRange.label)},"From",${escapeCsv(report.period.startDate)},"To",${escapeCsv(report.period.endDate)}`,
      `""`,
      `"LINE ITEM","SIGN","AMOUNT (INR)","NOTE"`,
      `"Gross Sales","+",${p.grossSales.toFixed(2)},"Accrual service and retail product sales"`,
      `"Customer Discounts","-",${p.discounts.toFixed(2)},"Total promotional and authorized discounts"`,
      `"Net Sales","=",${p.netSales.toFixed(2)},"Gross sales less discounts (excluding GST)"`,
      `"Customer Refunds","-",${p.refunds.toFixed(2)},"Approved and completed customer reversals"`,
      `"Effective Revenue","=",${p.effectiveRevenue.toFixed(2)},"Net realized operational revenue"`,
      `"Cost of Goods Sold (Retail)","-",${p.cogsRetail.toFixed(2)},"Purchase cost of retail inventory sold"`,
      `"Consumables Usage Cost","-",${p.consumableUsageCost.toFixed(2)},"Cost of products consumed in salon services"`,
      `"Estimated Gross Profit","=",${p.grossProfit.toFixed(2)},"Gross Margin: ${p.grossMarginPercentage}%"`,
      `"Stock Losses & Wastage","-",${p.stockLosses.toFixed(2)},"Damaged, expired and spilled inventory"`,
      `"Recorded Operating Contribution","=",${p.recordedOperatingContribution.toFixed(2)},"Contribution Margin: ${p.contributionMarginPercentage}%"`,
      `""`,
      `"STATUTORY NOTE","Taxes collected (${report.kpis.taxCollected.toFixed(2)} INR) are held as government liabilities and strictly excluded from income."`,
      `"DISCLAIMER",${escapeCsv(p.disclaimer)}`,
    ]

    return lines.join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 5. Customer Outstanding Report CSV
  // --------------------------------------------------------------------------
  exportCustomerOutstandingCsv(report: OwnerFinancialIntelligenceReport): string {
    const cr = report.customerReceivables

    const lines: string[] = [
      `"HAIR DEXIRITY — CUSTOMER OUTSTANDING & RECEIVABLES REPORT"`,
      `"Generated On",${escapeCsv(new Date().toISOString())}`,
      `"Total Customer Outstanding",${cr.totalOutstanding.toFixed(2)}`,
      `"0-30 Days (Current)",${cr.ageing.current0To30.toFixed(2)}`,
      `"31-60 Days",${cr.ageing.age31To60.toFixed(2)}`,
      `"61-90 Days",${cr.ageing.age61To90.toFixed(2)}`,
      `"90+ Days (Overdue)",${cr.ageing.over90.toFixed(2)}`,
      `""`,
      `"Client ID","Client Name","Phone","Invoices Count","Total Billed (INR)","Total Paid (INR)","Balance Due (INR)"`,
      ...cr.topDebtors.map((d) =>
        [
          escapeCsv(d.clientId),
          escapeCsv(d.clientName),
          escapeCsv(d.clientPhone),
          escapeCsv(d.invoiceCount),
          escapeCsv(d.totalInvoiced.toFixed(2)),
          escapeCsv(d.totalPaid.toFixed(2)),
          escapeCsv(d.balanceDue.toFixed(2)),
        ].join(',')
      ),
    ]

    return lines.join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 6. Supplier Outstanding Report CSV
  // --------------------------------------------------------------------------
  exportSupplierOutstandingCsv(report: OwnerFinancialIntelligenceReport): string {
    const sp = report.supplierPayables

    const lines: string[] = [
      `"HAIR DEXIRITY — SUPPLIER OUTSTANDING & PAYABLES REPORT"`,
      `"Generated On",${escapeCsv(new Date().toISOString())}`,
      `"Total Accounts Payable (Supplier Outstanding)",${sp.totalOutstanding.toFixed(2)}`,
      `"Total Purchases (Period)",${sp.totalPurchases.toFixed(2)}`,
      `"Total Payments Made",${sp.totalPaid.toFixed(2)}`,
      `"Total Supplier Advances Held",${sp.totalAdvances.toFixed(2)}`,
      `"Total Purchase Returns (Debit Notes)",${sp.totalReturns.toFixed(2)}`,
      `""`,
      `"Supplier ID","Supplier Name","Bills Count","Total Billed (INR)","Total Paid (INR)","Balance Due (INR)"`,
      ...sp.topCreditors.map((c) =>
        [
          escapeCsv(c.supplierId),
          escapeCsv(c.supplierName),
          escapeCsv(c.billCount),
          escapeCsv(c.totalBilled.toFixed(2)),
          escapeCsv(c.totalPaid.toFixed(2)),
          escapeCsv(c.balanceDue.toFixed(2)),
        ].join(',')
      ),
    ]

    return lines.join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 7. Inventory Valuation Report CSV
  // --------------------------------------------------------------------------
  exportInventoryValuationCsv(report: OwnerFinancialIntelligenceReport): string {
    const inv = report.inventoryAnalytics

    const lines: string[] = [
      `"HAIR DEXIRITY — INVENTORY VALUATION REPORT"`,
      `"Total Inventory Valuation",${inv.totalValuation.toFixed(2)}`,
      `"Retail Stock Value",${inv.retailValuation.toFixed(2)}`,
      `"Consumables Stock Value",${inv.consumableValuation.toFixed(2)}`,
      `""`,
      `"CATEGORY BREAKDOWN"`,
      `"Category","Item Type","Products Count","Total Stock Qty","Total Value (INR)"`,
      ...inv.valuationByCategory.map((vc) =>
        [
          escapeCsv(vc.category),
          escapeCsv(vc.itemType.toUpperCase()),
          escapeCsv(vc.productCount),
          escapeCsv(vc.totalStock.toFixed(2)),
          escapeCsv(vc.totalValue.toFixed(2)),
        ].join(',')
      ),
      `""`,
      `"DEAD STOCK (Zero Movement in 60+ Days)"`,
      `"SKU","Product Name","Category","Current Stock","Unit Cost (INR)","Total Value (INR)","Last Movement"`,
      ...inv.deadStock.map((ds) =>
        [
          escapeCsv(ds.sku),
          escapeCsv(ds.name),
          escapeCsv(ds.category),
          escapeCsv(ds.currentStock.toFixed(2)),
          escapeCsv(ds.unitCost.toFixed(2)),
          escapeCsv(ds.totalValue.toFixed(2)),
          escapeCsv(ds.lastMovementDate),
        ].join(',')
      ),
    ]

    return lines.join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 8. Employee Performance Report CSV
  // --------------------------------------------------------------------------
  exportEmployeePerformanceCsv(report: OwnerFinancialIntelligenceReport): string {
    const headers = [
      'Staff ID',
      'Staff Name',
      'Role',
      'Service Revenue (INR)',
      'Product Sales (INR)',
      'Total Revenue (INR)',
      'Services Count',
      'Products Sold Count',
      'Discounts Authorized (INR)',
    ]

    const rows = report.staffPerformance.map((s) => [
      escapeCsv(s.staffId),
      escapeCsv(s.staffName),
      escapeCsv(s.role.toUpperCase()),
      escapeCsv(s.serviceRevenue.toFixed(2)),
      escapeCsv(s.productRevenue.toFixed(2)),
      escapeCsv(s.totalRevenue.toFixed(2)),
      escapeCsv(s.serviceCount),
      escapeCsv(s.productCount),
      escapeCsv(s.lineDiscounts.toFixed(2)),
    ])

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n')
  },

  // --------------------------------------------------------------------------
  // 9. Executive Summary Vector PDF
  // --------------------------------------------------------------------------
  async generateFinancialSummaryPdf(
    report: OwnerFinancialIntelligenceReport,
    salonName: string = 'HAIR DEXIRITY'
  ): Promise<Blob> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    })

    const k = report.kpis
    const pnl = report.pnlStatement

    // Header styling
    doc.setFillColor(30, 41, 59) // Slate 800
    doc.rect(0, 0, 595.28, 80, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(salonName.toUpperCase(), 40, 35)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`EXECUTIVE FINANCIAL INTELLIGENCE REPORT • ${report.dateRange.label.toUpperCase()}`, 40, 55)
    doc.text(`Period: ${report.period.startDate} to ${report.period.endDate}`, 40, 70)

    let y = 105

    // Section 1: Executive KPIs Table
    doc.setTextColor(30, 41, 59)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('1. Executive Financial Snapshot', 40, y)
    y += 15

    const kpiRows = [
      ['Gross Sales (Accrual)', `INR ${k.grossSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Discounts Granted', `INR ${k.discountsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Net Sales', `INR ${k.netSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['GST Collected (18%)', `INR ${k.taxCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Statutory Liability)`],
      ['Total Invoiced Amount', `INR ${k.totalInvoiced.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Total Cash Collections', `INR ${k.totalCollections.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Actual Receipts)`],
      ['Customer Outstanding (AR)', `INR ${k.customerOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Supplier Outstanding (AP)', `INR ${k.supplierOutstanding.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
      ['Total Inventory Asset Value', `INR ${k.inventoryTotalValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`],
    ]

    doc.setFontSize(9)
    kpiRows.forEach(([title, val], idx) => {
      const rowY = y + idx * 16
      doc.setFillColor(idx % 2 === 0 ? 248 : 255, idx % 2 === 0 ? 250 : 255, idx % 2 === 0 ? 252 : 255)
      doc.rect(40, rowY - 10, 515, 16, 'F')
      doc.setFont('helvetica', 'normal')
      doc.text(title, 48, rowY + 2)
      doc.setFont('helvetica', 'bold')
      doc.text(val, 545, rowY + 2, { align: 'right' })
    })

    y += kpiRows.length * 16 + 25

    // Section 2: Owner P&L Waterfall
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text('2. Profit & Loss Statement (Contribution Margin)', 40, y)
    y += 15

    const pnlRows = [
      ['Gross Sales', `+ INR ${pnl.grossSales.toFixed(2)}`],
      ['Discounts Given', `- INR ${pnl.discounts.toFixed(2)}`],
      ['Net Sales', `= INR ${pnl.netSales.toFixed(2)}`],
      ['Customer Refunds Completed', `- INR ${pnl.refunds.toFixed(2)}`],
      ['Effective Revenue', `= INR ${pnl.effectiveRevenue.toFixed(2)}`],
      ['Cost of Goods Sold (Retail)', `- INR ${pnl.cogsRetail.toFixed(2)}`],
      ['Salon Consumables Usage Cost', `- INR ${pnl.consumableUsageCost.toFixed(2)}`],
      ['Estimated Gross Profit', `= INR ${pnl.grossProfit.toFixed(2)} (${pnl.grossMarginPercentage}%)`],
      ['Stock Losses & Wastage', `- INR ${pnl.stockLosses.toFixed(2)}`],
      ['Recorded Operating Contribution', `= INR ${pnl.recordedOperatingContribution.toFixed(2)} (${pnl.contributionMarginPercentage}%)`],
    ]

    doc.setFontSize(9)
    pnlRows.forEach(([title, val], idx) => {
      const rowY = y + idx * 16
      const isTotal = title.includes('Profit') || title.includes('Contribution') || title.includes('Net Sales')
      doc.setFillColor(isTotal ? 241 : (idx % 2 === 0 ? 248 : 255), isTotal ? 245 : 250, isTotal ? 249 : 252)
      doc.rect(40, rowY - 10, 515, 16, 'F')
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal')
      doc.text(title, 48, rowY + 2)
      doc.text(val, 545, rowY + 2, { align: 'right' })
    })

    y += pnlRows.length * 16 + 25

    // Disclaimer
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(100, 116, 139)
    const disclaimerLines = doc.splitTextToSize(`* Note: ${pnl.disclaimer}`, 515)
    doc.text(disclaimerLines, 40, y)

    return doc.output('blob')
  },
}
