import React, { useState, useEffect } from 'react'
import type { StockMovementRecord } from '../../../services/inventoryService'
import { inventoryService } from '../../../services/inventoryService'
import './StockHistoryTimeline.css'

interface StockHistoryTimelineProps {
  productId: string
  salonId?: string
  productUnit?: string
}

export const StockHistoryTimeline: React.FC<StockHistoryTimelineProps> = ({
  productId,
  salonId,
  productUnit = 'units',
}) => {
  const [movements, setMovements] = useState<StockMovementRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    const loadHistory = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const records = await inventoryService.fetchStockMovementHistory(productId, salonId)
        if (isMounted) {
          setMovements(records)
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Failed to load stock movements')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    loadHistory()

    return () => {
      isMounted = false
    }
  }, [productId, salonId])

  const getBadgeClass = (type: string) => {
    switch (type) {
      case 'OPENING_STOCK':
        return 'movement-badge opening'
      case 'STOCK_RECEIVED':
        return 'movement-badge received'
      case 'STOCK_ADJUSTMENT_IN':
        return 'movement-badge adjustment-in'
      case 'STOCK_ADJUSTMENT_OUT':
        return 'movement-badge adjustment-out'
      case 'STOCK_RETURN':
        return 'movement-badge return'
      default:
        return 'movement-badge'
    }
  }

  const getFriendlyLabel = (type: string) => {
    switch (type) {
      case 'OPENING_STOCK':
        return 'Opening Stock'
      case 'STOCK_RECEIVED':
        return 'Stock Received (Batch)'
      case 'STOCK_ADJUSTMENT_IN':
        return 'Manual Addition'
      case 'STOCK_ADJUSTMENT_OUT':
        return 'Manual Deduction'
      case 'STOCK_RETURN':
        return 'Vendor / Client Return'
      default:
        return type
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  if (isLoading) {
    return (
      <div className="stock-history-loading">
        <div className="btn-spinner" style={{ margin: '0 auto 0.75rem auto' }} />
        <p>Loading stock movement history...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="stock-history-empty" style={{ borderColor: '#ef4444' }}>
        <p style={{ color: '#f87171' }}>❌ {error}</p>
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <div className="stock-history-empty">
        <p>No historical stock movements found for this product.</p>
      </div>
    )
  }

  return (
    <div className="stock-history-container">
      <div className="stock-history-table-wrap">
        <table className="stock-history-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Type</th>
              <th>Delta</th>
              <th>Balance</th>
              <th>Reference / Reason</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => {
              const isPositive =
                m.movementType === 'OPENING_STOCK' ||
                m.movementType === 'STOCK_RECEIVED' ||
                m.movementType === 'STOCK_ADJUSTMENT_IN' ||
                m.movementType === 'STOCK_RETURN'

              return (
                <tr key={m.id}>
                  <td>{formatDate(m.createdAt)}</td>
                  <td>
                    <span className={getBadgeClass(m.movementType)}>
                      {getFriendlyLabel(m.movementType)}
                    </span>
                  </td>
                  <td>
                    <span className={`stock-delta ${isPositive ? 'positive' : 'negative'}`}>
                      {isPositive ? `+${m.quantity}` : `-${m.quantity}`} {productUnit}
                    </span>
                  </td>
                  <td>
                    <span>{m.newStock} {productUnit}</span>
                    <span className="stock-transition">(from {m.previousStock})</span>
                  </td>
                  <td>
                    <div className="movement-notes" title={m.notes || m.referenceId}>
                      {m.notes || <span className="movement-ref">{m.referenceId || 'N/A'}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

