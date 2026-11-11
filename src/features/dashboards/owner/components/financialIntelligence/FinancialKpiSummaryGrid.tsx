import React from 'react'
import type { FinancialOverviewKpis } from '../../../../../types/financialIntelligence.ts'

interface FinancialKpiSummaryGridProps {
  kpis: FinancialOverviewKpis
  onDrillDown?: (targetTab: string) => void
}

export const FinancialKpiSummaryGrid: React.FC<FinancialKpiSummaryGridProps> = ({
  kpis,
  onDrillDown,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="fin-kpi-grid">
      {/* Gross Sales */}
      <div className="fin-kpi-card" onClick={() => onDrillDown?.('overview')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Gross Sales</span>
          <span className="fin-kpi-badge neutral">Accrual</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.grossSales)}</div>
        <div className="fin-kpi-subtext">
          Discounts: -{formatInr(kpis.discountsTotal)} • Invoices: {kpis.invoicesCount}
        </div>
      </div>

      {/* Net Sales */}
      <div className="fin-kpi-card accent-primary" onClick={() => onDrillDown?.('overview')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Net Sales</span>
          <span className="fin-kpi-badge primary">Realized</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.netSales)}</div>
        <div className="fin-kpi-subtext">
          Tax (18% GST): +{formatInr(kpis.taxCollected)}
        </div>
      </div>

      {/* Actual Cash Collections */}
      <div className="fin-kpi-card accent-success" onClick={() => onDrillDown?.('overview')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Total Collections</span>
          <span className="fin-kpi-badge success">Cash Inflow</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.totalCollections)}</div>
        <div className="fin-kpi-subtext">
          Paid Invoices: {kpis.paidInvoicesCount} • Unpaid: {kpis.unpaidInvoicesCount}
        </div>
      </div>

      {/* Customer Receivables */}
      <div className="fin-kpi-card accent-warning" onClick={() => onDrillDown?.('receivables')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Customer Outstanding</span>
          <span className="fin-kpi-badge warning">Receivables</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.customerOutstanding)}</div>
        <div className="fin-kpi-subtext">
          Advances Held: {formatInr(kpis.customerAdvancesBalance)} • Credit Notes: {formatInr(kpis.creditNotesBalance)}
        </div>
      </div>

      {/* Supplier Payables */}
      <div className="fin-kpi-card accent-danger" onClick={() => onDrillDown?.('receivables')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Supplier Outstanding</span>
          <span className="fin-kpi-badge danger">Payables</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.supplierOutstanding)}</div>
        <div className="fin-kpi-subtext">
          Purchases (Period): {formatInr(kpis.purchaseExpenses)}
        </div>
      </div>

      {/* Total Inventory Asset */}
      <div className="fin-kpi-card" onClick={() => onDrillDown?.('inventory')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Inventory Valuation</span>
          <span className="fin-kpi-badge info">Asset</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.inventoryTotalValue)}</div>
        <div className="fin-kpi-subtext">
          Retail: {formatInr(kpis.inventoryRetailValue)} • Consumables: {formatInr(kpis.inventoryConsumableValue)}
        </div>
      </div>

      {/* Estimated Gross Profit */}
      <div className="fin-kpi-card accent-profit" onClick={() => onDrillDown?.('overview')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Estimated Gross Profit</span>
          <span className="fin-kpi-badge profit">Margin</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.estimatedGrossProfit)}</div>
        <div className="fin-kpi-subtext">
          COGS: -{formatInr(kpis.cogsRetail)} • Consumables: -{formatInr(kpis.consumableUsageCost)}
        </div>
      </div>

      {/* Recorded Operating Contribution */}
      <div className="fin-kpi-card accent-contribution" onClick={() => onDrillDown?.('overview')}>
        <div className="fin-kpi-header">
          <span className="fin-kpi-label">Operating Contribution</span>
          <span className="fin-kpi-badge gold">Contribution</span>
        </div>
        <div className="fin-kpi-value">{formatInr(kpis.recordedOperatingContribution)}</div>
        <div className="fin-kpi-subtext">
          Stock Losses: -{formatInr(kpis.stockLossValue)} • Refunds: -{formatInr(kpis.refundsTotal)}
        </div>
      </div>
    </div>
  )
}
