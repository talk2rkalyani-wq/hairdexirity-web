import React from 'react'
import type { NavId } from '../../../../../types/salon.ts'
import type {
  CustomerReceivablesIntelligence,
  SupplierPayablesIntelligence,
} from '../../../../../types/financialIntelligence.ts'

interface CustomerSupplierIntelligenceSectionProps {
  customerReceivables: CustomerReceivablesIntelligence
  supplierPayables: SupplierPayablesIntelligence
  onNavigate?: (route: NavId) => void
}

export const CustomerSupplierIntelligenceSection: React.FC<CustomerSupplierIntelligenceSectionProps> = ({
  customerReceivables,
  supplierPayables,
  onNavigate,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const cr = customerReceivables
  const sp = supplierPayables

  return (
    <div className="fin-double-panel-grid">
      {/* -------------------------------------------------------------------- */}
      {/* Panel 1: Customer Receivables Intelligence */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-panel-box">
        <div className="panel-box-header">
          <div>
            <h3 className="panel-box-title">Customer Receivables & Balances</h3>
            <p className="panel-box-subtitle">Accounts Receivable (AR), Ageing Breakdown & Customer Credits</p>
          </div>
          <button
            type="button"
            className="panel-action-btn"
            onClick={() => onNavigate?.('billing/ledger')}
          >
            Open Customer Ledger →
          </button>
        </div>

        {/* Total & Credits Header */}
        <div className="balance-highlights-row">
          <div className="highlight-pill">
            <span className="hl-label">Total Outstanding:</span>
            <span className="hl-val warning">{formatInr(cr.totalOutstanding)}</span>
          </div>
          <div className="highlight-pill">
            <span className="hl-label">Customer Advances:</span>
            <span className="hl-val info">{formatInr(cr.advancesUnallocated)}</span>
          </div>
          <div className="highlight-pill">
            <span className="hl-label">Active Credit Notes:</span>
            <span className="hl-val neutral">{formatInr(cr.creditNotesRemaining)}</span>
          </div>
        </div>

        {/* Ageing Breakdown */}
        <div className="ageing-container">
          <h4 className="sub-heading">Receivables Ageing Schedule</h4>
          <div className="ageing-grid">
            <div className="ageing-card">
              <span className="ageing-bracket">0–30 Days (Current)</span>
              <span className="ageing-amount">{formatInr(cr.ageing.current0To30)}</span>
            </div>
            <div className="ageing-card">
              <span className="ageing-bracket">31–60 Days</span>
              <span className="ageing-amount">{formatInr(cr.ageing.age31To60)}</span>
            </div>
            <div className="ageing-card">
              <span className="ageing-bracket">61–90 Days</span>
              <span className="ageing-amount">{formatInr(cr.ageing.age61To90)}</span>
            </div>
            <div className="ageing-card overdue">
              <span className="ageing-bracket">90+ Days (Overdue)</span>
              <span className="ageing-amount">{formatInr(cr.ageing.over90)}</span>
            </div>
          </div>
        </div>

        {/* Top Debtor Clients Table */}
        <div className="panel-table-wrap">
          <h4 className="sub-heading">Top Outstanding Customer Accounts</h4>
          {cr.topDebtors.length === 0 ? (
            <div className="empty-subtext">No outstanding customer invoices recorded.</div>
          ) : (
            <table className="mini-data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th className="text-center">Bills</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance Due</th>
                </tr>
              </thead>
              <tbody>
                {cr.topDebtors.map((d) => (
                  <tr key={d.clientId + d.clientName}>
                    <td>
                      <div className="client-cell">
                        <span className="client-name">{d.clientName}</span>
                        {d.clientPhone && <span className="client-phone">{d.clientPhone}</span>}
                      </div>
                    </td>
                    <td className="text-center">{d.invoiceCount}</td>
                    <td className="text-right">{formatInr(d.totalInvoiced)}</td>
                    <td className="text-right">{formatInr(d.totalPaid)}</td>
                    <td className="text-right bold text-warning">{formatInr(d.balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Panel 2: Supplier Payables Intelligence */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-panel-box">
        <div className="panel-box-header">
          <div>
            <h3 className="panel-box-title">Supplier Payables & Procurement</h3>
            <p className="panel-box-subtitle">Accounts Payable (AP), Vendor Balances & Purchase Advances</p>
          </div>
          <button
            type="button"
            className="panel-action-btn"
            onClick={() => onNavigate?.('billing/purchases')}
          >
            Open Purchases →
          </button>
        </div>

        {/* Total & Procurement Highlights */}
        <div className="balance-highlights-row">
          <div className="highlight-pill">
            <span className="hl-label">Total Accounts Payable:</span>
            <span className="hl-val danger">{formatInr(sp.totalOutstanding)}</span>
          </div>
          <div className="highlight-pill">
            <span className="hl-label">Total Purchases:</span>
            <span className="hl-val primary">{formatInr(sp.totalPurchases)}</span>
          </div>
          <div className="highlight-pill">
            <span className="hl-label">Supplier Advances:</span>
            <span className="hl-val success">{formatInr(sp.totalAdvances)}</span>
          </div>
        </div>

        {/* Top Creditor Vendors Table */}
        <div className="panel-table-wrap">
          <h4 className="sub-heading">Top Supplier Payable Balances</h4>
          {sp.topCreditors.length === 0 ? (
            <div className="empty-subtext">No outstanding supplier balances. All vendor bills settled!</div>
          ) : (
            <table className="mini-data-table">
              <thead>
                <tr>
                  <th>Supplier Vendor</th>
                  <th className="text-center">Bills</th>
                  <th className="text-right">Total Billed</th>
                  <th className="text-right">Total Paid</th>
                  <th className="text-right">Payable Balance</th>
                </tr>
              </thead>
              <tbody>
                {sp.topCreditors.map((c) => (
                  <tr key={c.supplierId}>
                    <td className="bold">{c.supplierName}</td>
                    <td className="text-center">{c.billCount}</td>
                    <td className="text-right">{formatInr(c.totalBilled)}</td>
                    <td className="text-right">{formatInr(c.totalPaid)}</td>
                    <td className="text-right bold text-danger">{formatInr(c.balanceDue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Purchase Summary Metadata */}
        <div className="procurement-meta-box">
          <div className="proc-meta-item">
            <span className="meta-label">Total Payments Made to Suppliers:</span>
            <span className="meta-val">{formatInr(sp.totalPaid)}</span>
          </div>
          <div className="proc-meta-item">
            <span className="meta-label">Total Purchase Returns (Debit Notes):</span>
            <span className="meta-val">{formatInr(sp.totalReturns)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
