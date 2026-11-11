import React from 'react'
import type { ProfitLossStatement } from '../../../../../types/financialIntelligence.ts'

interface ProfitLossStatementTableProps {
  pnl: ProfitLossStatement
  taxCollected: number
}

export const ProfitLossStatementTable: React.FC<ProfitLossStatementTableProps> = ({
  pnl,
  taxCollected,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="fin-section-container">
      <div className="fin-section-header">
        <div>
          <h3 className="fin-section-title">Owner Profit & Loss Statement (Operating Contribution)</h3>
          <p className="fin-section-subtitle">
            Itemized waterfall statement tracking revenue recognition, direct product costs, and internal consumables
          </p>
        </div>
      </div>

      <div className="pnl-table-wrapper">
        <table className="pnl-table">
          <thead>
            <tr>
              <th>Line Item</th>
              <th className="text-center">Operation</th>
              <th className="text-right">Amount (INR)</th>
              <th>Accounting Description</th>
            </tr>
          </thead>
          <tbody>
            {/* Gross Sales */}
            <tr className="pnl-row-base">
              <td className="pnl-label bold">Gross Sales (Services + Retail)</td>
              <td className="text-center text-muted">+</td>
              <td className="text-right bold">{formatInr(pnl.grossSales)}</td>
              <td className="text-muted">Total accrual value of completed salon services and retail merchandise</td>
            </tr>

            {/* Discounts */}
            <tr className="pnl-row-deduct">
              <td className="pnl-label">Less: Customer Discounts</td>
              <td className="text-center text-danger">-</td>
              <td className="text-right text-danger">({formatInr(pnl.discounts)})</td>
              <td className="text-muted">Promotional and authorized discounts granted at POS checkout</td>
            </tr>

            {/* Net Sales */}
            <tr className="pnl-row-subtotal">
              <td className="pnl-label bold">Net Sales (Revenue)</td>
              <td className="text-center bold">=</td>
              <td className="text-right bold primary-highlight">{formatInr(pnl.netSales)}</td>
              <td className="text-muted">Gross revenue less discounts (excluding GST collections)</td>
            </tr>

            {/* Refunds */}
            <tr className="pnl-row-deduct">
              <td className="pnl-label">Less: Customer Refunds Completed</td>
              <td className="text-center text-danger">-</td>
              <td className="text-right text-danger">({formatInr(pnl.refunds)})</td>
              <td className="text-muted">Processed customer service dissatisfaction reversals & adjustments</td>
            </tr>

            {/* Effective Revenue */}
            <tr className="pnl-row-subtotal">
              <td className="pnl-label bold">Effective Operating Revenue</td>
              <td className="text-center bold">=</td>
              <td className="text-right bold">{formatInr(pnl.effectiveRevenue)}</td>
              <td className="text-muted">Realized sales revenue after customer returns and refunds</td>
            </tr>

            {/* COGS (Retail) */}
            <tr className="pnl-row-deduct">
              <td className="pnl-label">Less: Cost of Goods Sold (Retail Products)</td>
              <td className="text-center text-danger">-</td>
              <td className="text-right text-danger">({formatInr(pnl.cogsRetail)})</td>
              <td className="text-muted">Purchase acquisition cost of retail products sold across the counter</td>
            </tr>

            {/* Consumables Cost */}
            <tr className="pnl-row-deduct">
              <td className="pnl-label">Less: Salon Consumables Usage Cost</td>
              <td className="text-center text-danger">-</td>
              <td className="text-right text-danger">({formatInr(pnl.consumableUsageCost)})</td>
              <td className="text-muted">Cost of color tubes, developers, foil and treatment products consumed in services</td>
            </tr>

            {/* Gross Profit */}
            <tr className="pnl-row-total gross-profit">
              <td className="pnl-label bold">Estimated Gross Profit</td>
              <td className="text-center bold">=</td>
              <td className="text-right bold text-success">{formatInr(pnl.grossProfit)}</td>
              <td className="bold text-success">
                Gross Margin: {pnl.grossMarginPercentage}% of Effective Revenue
              </td>
            </tr>

            {/* Stock Losses */}
            <tr className="pnl-row-deduct">
              <td className="pnl-label">Less: Stock Losses & Wastage</td>
              <td className="text-center text-danger">-</td>
              <td className="text-right text-danger">({formatInr(pnl.stockLosses)})</td>
              <td className="text-muted">Damaged bottles, expired batches, and recorded service mixing spillage</td>
            </tr>

            {/* Recorded Operating Contribution */}
            <tr className="pnl-row-total net-contribution">
              <td className="pnl-label bold">Recorded Operating Contribution</td>
              <td className="text-center bold">=</td>
              <td className="text-right bold text-gold">{formatInr(pnl.recordedOperatingContribution)}</td>
              <td className="bold text-gold">
                Contribution Margin: {pnl.contributionMarginPercentage}%
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Statutory Taxation Notice */}
      <div className="statutory-tax-callout">
        <div className="tax-callout-icon">🏛️</div>
        <div className="tax-callout-content">
          <strong>Statutory Tax Accounting:</strong> Total GST collected in this period is{' '}
          <strong>{formatInr(taxCollected)}</strong> (CGST 9% + SGST 9%). In strict compliance with Indian GST regulations, this amount is held as a government statutory fiduciary liability and is <strong>strictly excluded</strong> from salon revenue and operating profit figures.
        </div>
      </div>

      {/* Accounting Scope Disclaimer */}
      <div className="pnl-disclaimer-card">
        <span className="disclaimer-badge">Scope Note</span>
        <span className="disclaimer-text">{pnl.disclaimer}</span>
      </div>
    </div>
  )
}
