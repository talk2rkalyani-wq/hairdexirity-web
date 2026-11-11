import React, { useState } from 'react'
import type { InventoryProduct, StockAdjustmentResult } from '../../../types/inventory'
import { inventoryService } from '../../../services/inventoryService'
import { isDecimalAllowedForUnit, roundQuantity } from '../../../utils/inventoryValidation'
import { CloseIcon } from '../../../components/Icons'
import './StockAdjustmentModal.css'

interface StockAdjustmentModalProps {
  isOpen: boolean
  product: InventoryProduct | null
  onClose: () => void
  onSuccess: (result: StockAdjustmentResult) => void
}

type AdjustmentType = 'STOCK_ADJUSTMENT_IN' | 'STOCK_ADJUSTMENT_OUT' | 'STOCK_RETURN'

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  product,
  onClose,
  onSuccess,
}) => {
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('STOCK_ADJUSTMENT_IN')
  const [quantityStr, setQuantityStr] = useState('1')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  if (!isOpen || !product) return null

  const isDecimalAllowed = isDecimalAllowedForUnit(product.unit)
  const currentStock = product.currentStock
  const quantityNum = parseFloat(quantityStr) || 0

  let projectedStock = currentStock
  if (adjustmentType === 'STOCK_ADJUSTMENT_IN' || adjustmentType === 'STOCK_RETURN') {
    projectedStock = roundQuantity(currentStock + quantityNum, product.unit)
  } else if (adjustmentType === 'STOCK_ADJUSTMENT_OUT') {
    projectedStock = roundQuantity(currentStock - quantityNum, product.unit)
  }

  const isInsufficient = adjustmentType === 'STOCK_ADJUSTMENT_OUT' && currentStock < quantityNum

  const handleQuickReason = (reason: string) => {
    setNotes(reason)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (quantityNum <= 0) {
      setErrorMessage('Adjustment quantity must be greater than zero.')
      return
    }

    if (!isDecimalAllowed && !Number.isInteger(quantityNum)) {
      setErrorMessage(`Fractional stock is not permitted for unit "${product.unit}".`)
      return
    }

    if (isInsufficient) {
      setErrorMessage(`Cannot deduct ${quantityNum} units from current stock of ${currentStock} ${product.unit}.`)
      return
    }

    if (!notes.trim() || notes.trim().length < 5) {
      setErrorMessage('Please provide an adjustment reason of at least 5 characters.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await inventoryService.adjustStock({
        productId: product.id,
        adjustmentType,
        quantity: quantityNum,
        notes: notes.trim(),
      })
      onSuccess(result)
      onClose()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to adjust stock')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="stock-adj-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="stock-adj-card" onClick={(e) => e.stopPropagation()}>
        <div className="stock-adj-header">
          <h2 className="stock-adj-title">Adjust Stock Level</h2>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close modal">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="stock-adj-product-summary">
          <div>
            <div className="stock-adj-prod-name">{product.name}</div>
            <div className="stock-adj-prod-meta">
              {product.brand} • SKU: {product.sku}
            </div>
          </div>
          <div className="stock-adj-current-badge">
            <div className="stock-adj-current-label">Current Stock</div>
            <div className="stock-adj-current-val">
              {product.currentStock} {product.unit}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="stock-adj-body">
            {errorMessage && (
              <div className="form-error-banner" role="alert">
                <span>⚠️ {errorMessage}</span>
              </div>
            )}

            {/* Adjustment Type Picker */}
            <div className="stock-adj-field">
              <label className="stock-adj-label">Adjustment Type</label>
              <div className="stock-adj-type-toggle">
                <button
                  type="button"
                  className={`stock-adj-type-btn ${adjustmentType === 'STOCK_ADJUSTMENT_IN' ? 'active add' : ''}`}
                  onClick={() => setAdjustmentType('STOCK_ADJUSTMENT_IN')}
                >
                  ➕ Add Stock
                </button>
                <button
                  type="button"
                  className={`stock-adj-type-btn ${adjustmentType === 'STOCK_ADJUSTMENT_OUT' ? 'active deduct' : ''}`}
                  onClick={() => setAdjustmentType('STOCK_ADJUSTMENT_OUT')}
                >
                  ➖ Deduct Stock
                </button>
                <button
                  type="button"
                  className={`stock-adj-type-btn ${adjustmentType === 'STOCK_RETURN' ? 'active return' : ''}`}
                  onClick={() => setAdjustmentType('STOCK_RETURN')}
                >
                  🔄 Return
                </button>
              </div>
            </div>

            {/* Quantity Input */}
            <div className="stock-adj-field">
              <label className="stock-adj-label">Quantity to Adjust</label>
              <div className="stock-adj-input-row">
                <input
                  type="number"
                  step={isDecimalAllowed ? '0.001' : '1'}
                  min="0.001"
                  className="stock-adj-input"
                  value={quantityStr}
                  onChange={(e) => setQuantityStr(e.target.value)}
                  required
                />
                <span className="stock-adj-unit-tag">{product.unit}</span>
              </div>
            </div>

            {/* Real-time Calculation Preview */}
            <div className="stock-adj-preview">
              <span>Projected New Balance:</span>
              <span className={`stock-adj-preview-val ${isInsufficient ? 'text-danger' : 'text-gold'}`}>
                {isInsufficient ? 'Insufficient Stock!' : `${projectedStock} ${product.unit}`}
              </span>
            </div>

            {/* Mandatory Reason Notes */}
            <div className="stock-adj-field">
              <label className="stock-adj-label">Reason / Audit Notes (Required)</label>
              <textarea
                className="stock-adj-textarea"
                placeholder="Explain the reason for this inventory adjustment (min 5 characters)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                required
              />
              <div className="stock-adj-chips">
                <button
                  type="button"
                  className="stock-adj-chip"
                  onClick={() => handleQuickReason('Inventory physical audit reconciliation')}
                >
                  Audit Reconciliation
                </button>
                <button
                  type="button"
                  className="stock-adj-chip"
                  onClick={() => handleQuickReason('Damaged or broken bottle')}
                >
                  Damaged Goods
                </button>
                <button
                  type="button"
                  className="stock-adj-chip"
                  onClick={() => handleQuickReason('Used as tester in salon')}
                >
                  Salon Tester
                </button>
                <button
                  type="button"
                  className="stock-adj-chip"
                  onClick={() => handleQuickReason('Supplier delivery bonus unit')}
                >
                  Supplier Bonus
                </button>
                <button
                  type="button"
                  className="stock-adj-chip"
                  onClick={() => handleQuickReason('Returned defective product to distributor')}
                >
                  Distributor Return
                </button>
              </div>
            </div>
          </div>

          <div className="stock-adj-footer">
            <button type="button" className="btn-adj-cancel" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-adj-confirm"
              disabled={isSubmitting || isInsufficient || quantityNum <= 0}
            >
              {isSubmitting ? (
                <>
                  <div className="btn-spinner" />
                  <span>Adjusting...</span>
                </>
              ) : (
                <span>Confirm Adjustment</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

