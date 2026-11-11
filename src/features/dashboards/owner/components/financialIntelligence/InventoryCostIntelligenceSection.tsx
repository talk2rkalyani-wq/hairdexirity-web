import React from 'react'
import type { NavId } from '../../../../../types/salon.ts'
import type {
  InventoryFinancialIntelligence,
  FinancialOverviewKpis,
} from '../../../../../types/financialIntelligence.ts'

interface InventoryCostIntelligenceSectionProps {
  inventory: InventoryFinancialIntelligence
  kpis: FinancialOverviewKpis
  onNavigate?: (route: NavId) => void
}

export const InventoryCostIntelligenceSection: React.FC<InventoryCostIntelligenceSectionProps> = ({
  inventory,
  kpis,
  onNavigate,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const inv = inventory

  return (
    <div className="fin-section-container">
      <div className="fin-section-header">
        <div>
          <h3 className="fin-section-title">Inventory Valuation & Cost Intelligence</h3>
          <p className="fin-section-subtitle">
            Capital allocation across retail and salon consumables, cost of goods sold, usage tracking, and stock wastage
          </p>
        </div>
        <button
          type="button"
          className="panel-action-btn"
          onClick={() => onNavigate?.('inventory')}
        >
          Open Live Inventory Register →
        </button>
      </div>

      {/* Top Cost & Valuation Summary Cards */}
      <div className="inv-cost-summary-grid">
        <div className="inv-cost-card">
          <span className="inv-card-label">Total Inventory Asset Value</span>
          <span className="inv-card-amount primary">{formatInr(inv.totalValuation)}</span>
          <span className="inv-card-sub">
            Retail: {formatInr(inv.retailValuation)} • Consumables: {formatInr(inv.consumableValuation)}
          </span>
        </div>

        <div className="inv-cost-card">
          <span className="inv-card-label">Cost of Goods Sold (Retail)</span>
          <span className="inv-card-amount danger">{formatInr(kpis.cogsRetail)}</span>
          <span className="inv-card-sub">Purchase acquisition cost of retail items sold</span>
        </div>

        <div className="inv-cost-card">
          <span className="inv-card-label">Salon Consumables Usage Cost</span>
          <span className="inv-card-amount warning">{formatInr(kpis.consumableUsageCost)}</span>
          <span className="inv-card-sub">Internal product usage in styling & treatments</span>
        </div>

        <div className="inv-cost-card">
          <span className="inv-card-label">Total Stock Loss & Wastage</span>
          <span className="inv-card-amount danger">{formatInr(kpis.stockLossValue)}</span>
          <span className="inv-card-sub">Damaged, expired and spillage disposals</span>
        </div>
      </div>

      <div className="inv-sub-panels-grid">
        {/* Category Valuation Breakdown */}
        <div className="inv-sub-panel">
          <h4 className="panel-subheading">Valuation Breakdown by Category</h4>
          {inv.valuationByCategory.length === 0 ? (
            <div className="empty-subtext">No inventory categories found.</div>
          ) : (
            <table className="mini-data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="text-center">Type</th>
                  <th className="text-center">Products</th>
                  <th className="text-right">Total Stock</th>
                  <th className="text-right">Asset Value</th>
                </tr>
              </thead>
              <tbody>
                {inv.valuationByCategory.map((c) => (
                  <tr key={c.category + c.itemType}>
                    <td className="bold">{c.category}</td>
                    <td className="text-center">
                      <span className={`type-tag ${c.itemType}`}>{c.itemType.toUpperCase()}</span>
                    </td>
                    <td className="text-center">{c.productCount}</td>
                    <td className="text-right">{c.totalStock}</td>
                    <td className="text-right bold">{formatInr(c.totalValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Stock Loss by Type */}
        <div className="inv-sub-panel">
          <h4 className="panel-subheading">Stock Loss & Wastage by Reason</h4>
          {inv.stockLossByType.length === 0 ? (
            <div className="empty-subtext">No stock losses or wastage logged in this period. Clean operations!</div>
          ) : (
            <div className="loss-type-list">
              {inv.stockLossByType.map((lt) => (
                <div key={lt.lossType} className="loss-type-row">
                  <div className="loss-type-info">
                    <span className="loss-badge">{lt.lossType.toUpperCase()}</span>
                    <span className="loss-count">{lt.count} record{lt.count === 1 ? '' : 's'} ({lt.quantity} units)</span>
                  </div>
                  <span className="loss-value text-danger">{formatInr(lt.totalLossValue)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Dead Stock Warning */}
          <div className="dead-stock-box">
            <h5 className="dead-stock-title">Dead Stock Alert (Zero Movement in 60+ Days)</h5>
            {inv.deadStock.length === 0 ? (
              <div className="empty-subtext">Zero dead stock identified. Inventory rotation is healthy.</div>
            ) : (
              <div className="dead-stock-list">
                {inv.deadStock.slice(0, 5).map((ds) => (
                  <div key={ds.productId} className="dead-stock-item">
                    <div>
                      <span className="ds-name">{ds.name}</span>
                      <span className="ds-meta">{ds.category} • SKU: {ds.sku}</span>
                    </div>
                    <div className="text-right">
                      <span className="ds-value">{formatInr(ds.totalValue)}</span>
                      <span className="ds-qty">{ds.currentStock} units</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
