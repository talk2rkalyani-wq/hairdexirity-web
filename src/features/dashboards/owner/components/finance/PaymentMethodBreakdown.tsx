// ==============================================================================
// Luma Salon — Payment Method Breakdown Component (Phase 7)
// Tender Distribution: UPI vs Card vs Cash Visual Breakdown
// ==============================================================================

import React from 'react'
import type { PaymentMethodShare } from '../../../../../types/finance.ts'
import { formatCurrency } from '../../../../../utils/formatters.ts'
import { AwardIcon } from '../../../../../components/Icons.tsx'

interface PaymentMethodBreakdownProps {
  methodShares: PaymentMethodShare[]
  totalRevenue: number
}

export const PaymentMethodBreakdown: React.FC<PaymentMethodBreakdownProps> = ({
  methodShares,
  totalRevenue,
}) => {
  const getMethodBadgeClass = (method: string) => {
    switch (method) {
      case 'upi':
        return 'tender-upi'
      case 'card':
        return 'tender-card'
      case 'cash':
        return 'tender-cash'
      default:
        return 'tender-default'
    }
  }

  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'upi':
        return '📱'
      case 'card':
        return '💳'
      case 'cash':
        return '💵'
      default:
        return '⚡'
    }
  }

  return (
    <div className="payment-breakdown-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <span className="card-main-title">
            <AwardIcon size={16} />
            <span>Tender Method Allocation</span>
          </span>
          <span className="card-subtitle">
            Revenue split across Cash, UPI & Card terminals ({formatCurrency(totalRevenue)} total)
          </span>
        </div>
      </div>

      <div className="tender-bars-list">
        {methodShares.length === 0 ? (
          <div className="empty-tender-hint">No payment transactions recorded in this period</div>
        ) : (
          methodShares.map((item) => (
            <div key={item.method} className="tender-row-item">
              <div className="tender-row-header">
                <div className="tender-name-group">
                  <span className="tender-icon">{getMethodIcon(item.method)}</span>
                  <span className="tender-name">{item.label}</span>
                </div>
                <div className="tender-values">
                  <span className="tender-count">{item.count} txns</span>
                  <span className="tender-amount gold">{formatCurrency(item.amount)}</span>
                  <span className={`tender-pill ${getMethodBadgeClass(item.method)}`}>
                    {item.percentage}%
                  </span>
                </div>
              </div>
              <div className="tender-progress-track">
                <div
                  className={`tender-progress-fill ${getMethodBadgeClass(item.method)}`}
                  style={{ width: `${Math.min(100, Math.max(3, item.percentage))}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

