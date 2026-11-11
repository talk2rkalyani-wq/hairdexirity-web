// ==============================================================================
// Luma Salon — Operations Management: Zone 4 Floor Inventory Alert Card
// ==============================================================================

import React from 'react'
import type { InventoryProduct } from '../../../../../types/inventory.ts'
import type { NavId } from '../../../../../types/salon.ts'
import { PackageIcon, CheckIcon } from '../../../../../components/Icons.tsx'

interface FloorInventoryAlertCardProps {
  floorInventoryRisks: {
    outOfStock: InventoryProduct[]
    lowStock: InventoryProduct[]
    totalRiskCount: number
  }
  onNavigate: (route: NavId) => void
}

export const FloorInventoryAlertCard: React.FC<FloorInventoryAlertCardProps> = ({
  floorInventoryRisks,
  onNavigate,
}) => {
  const { outOfStock, lowStock, totalRiskCount } = floorInventoryRisks

  return (
    <div className="ops-inventory-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <PackageIcon size={18} />
          <h3 className="workload-title">Floor Inventory & Treatment Supplies</h3>
        </div>
        <button
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => onNavigate('inventory')}
        >
          Open Product Inventory →
        </button>
      </div>

      {totalRiskCount === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: '8px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          color: '#34d399',
          fontSize: '0.85rem',
        }}>
          <CheckIcon size={18} />
          <span>All salon floor supplies and retail products are above minimum operational stock thresholds.</span>
        </div>
      ) : (
        <div className="ops-inv-grid">
          {/* Out of Stock Items */}
          {outOfStock.map((prod) => (
            <div key={prod.id} className="ops-inv-item risk-out">
              <div>
                <div className="ops-inv-name">{prod.name}</div>
                <div className="ops-inv-meta">
                  {prod.brand} • {prod.category}
                </div>
              </div>
              <span className="ops-inv-badge badge-stock-zero">
                Out of Stock (0 {prod.unit})
              </span>
            </div>
          ))}

          {/* Low Stock Items */}
          {lowStock.map((prod) => (
            <div key={prod.id} className="ops-inv-item risk-low">
              <div>
                <div className="ops-inv-name">{prod.name}</div>
                <div className="ops-inv-meta">
                  {prod.brand} • Min: {prod.minStockThreshold} {prod.unit}
                </div>
              </div>
              <span className="ops-inv-badge badge-stock-low">
                Low: {prod.currentStock} {prod.unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
