// ==============================================================================
// Luma Salon — Record Stock Loss & Wastage Modal
// Phase 7: Damaged, Expired & Salon Wastage Stock Disposals
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { InventoryProduct, InventoryBatch } from '../../../types/inventory.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, AlertTriangleIcon } from '../../../components/Icons.tsx'
import './RecordStockLossModal.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedProductId?: string
}

export const RecordStockLossModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedProductId,
}) => {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [batches, setBatches] = useState<InventoryBatch[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>(preselectedProductId || '')
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [quantity, setQuantity] = useState<number>(1)
  const [lossType, setLossType] = useState<'DAMAGE' | 'EXPIRY' | 'WASTAGE'>('DAMAGE')
  const [reason, setReason] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadProducts()
    }
  }, [isOpen])

  useEffect(() => {
    if (preselectedProductId) {
      setSelectedProductId(preselectedProductId)
    }
  }, [preselectedProductId])

  useEffect(() => {
    if (selectedProductId) {
      loadBatches(selectedProductId)
    } else {
      setBatches([])
      setSelectedBatchId('')
    }
  }, [selectedProductId])

  const loadProducts = async () => {
    try {
      const all = await inventoryService.fetchInventoryProducts()
      setProducts(all.filter((p) => p.status !== 'archived'))
      if (!selectedProductId && all.length > 0) {
        setSelectedProductId(all[0].id)
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const loadBatches = async (prodId: string) => {
    try {
      const bList = await inventoryService.getInventoryBatches(prodId)
      // For stock loss, show active, expired, or quarantined batches with stock > 0
      const availableBatches = bList.filter((b) => b.currentQuantity > 0)
      setBatches(availableBatches)
      if (availableBatches.length > 0) {
        setSelectedBatchId(availableBatches[0].id)
      } else {
        setSelectedBatchId('')
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId)
  const unitCost = selectedProduct?.weightedAverageCost || selectedProduct?.purchasePrice || 0
  const estimatedTotalLoss = quantity * unitCost
  const requiresOwnerAuth = estimatedTotalLoss > 2000

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProductId) {
      setError('Please select an inventory item.')
      return
    }
    if (!quantity || quantity <= 0) {
      setError('Quantity must be greater than zero.')
      return
    }
    if (selectedProduct && quantity > selectedProduct.currentStock) {
      setError(
        `Insufficient stock: ${selectedProduct.name} only has ${selectedProduct.currentStock} ${selectedProduct.unit} available.`
      )
      return
    }
    if (!reason.trim()) {
      setError('Please provide a specific reason for stock disposal/loss.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await inventoryService.recordStockLoss({
        productId: selectedProductId,
        batchId: selectedBatchId || undefined,
        quantity,
        lossType,
        reason: reason.trim(),
        supportingNotes: notes.trim() || undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to record stock loss')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="stock-loss-modal-overlay">
      <div className="stock-loss-modal-content">
        <div className="stock-loss-modal-header">
          <div className="header-title">
            <AlertTriangleIcon size={20} className="icon-warning" />
            <h3>Report Stock Loss / Wastage</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="stock-loss-form">
          {error && <div className="loss-error-banner">{error}</div>}

          {requiresOwnerAuth && (
            <div className="loss-warning-banner">
              ⚠️ <strong>Owner Authorization Required:</strong> Estimated loss value (₹
              {estimatedTotalLoss.toFixed(2)}) exceeds the ₹2,000 threshold. An owner approval record
              will be created.
            </div>
          )}

          <div className="form-group">
            <label>Disposal Classification *</label>
            <div className="loss-type-selector">
              <button
                type="button"
                className={`type-btn ${lossType === 'DAMAGE' ? 'active' : ''}`}
                onClick={() => setLossType('DAMAGE')}
              >
                💔 Damage / Broken
              </button>
              <button
                type="button"
                className={`type-btn ${lossType === 'EXPIRY' ? 'active' : ''}`}
                onClick={() => setLossType('EXPIRY')}
              >
                ⏳ Expired Stock
              </button>
              <button
                type="button"
                className={`type-btn ${lossType === 'WASTAGE' ? 'active' : ''}`}
                onClick={() => setLossType('WASTAGE')}
              >
                🧪 Salon Wastage / Spillage
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Inventory Item *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              required
            >
              <option value="">Select item...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — Stock: {p.currentStock} {p.unit} (₹{unitCost.toFixed(2)}/unit)
                </option>
              ))}
            </select>
          </div>

          {batches.length > 0 && (
            <div className="form-group">
              <label>Affected Batch (Optional)</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                <option value="">No specific batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch {b.batchNumber} (Expires: {b.expiryDate}, Qty: {b.currentQuantity})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Quantity to Write Off *</label>
              <input
                type="number"
                step="any"
                min="0.001"
                value={quantity}
                onChange={(e) => setQuantity(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Estimated Total Loss</label>
              <input
                type="text"
                value={`₹${estimatedTotalLoss.toFixed(2)}`}
                disabled
                className="input-disabled"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Reason for Loss / Disposal *</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Broken seal upon opening, past expiry date, dropped bottle"
              required
            />
          </div>

          <div className="form-group">
            <label>Detailed Incident Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Reported by Staff Member; disposed in biological waste bin"
            />
          </div>

          <div className="stock-loss-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-danger" disabled={loading}>
              {loading ? 'Processing Disposal...' : 'Confirm Stock Write-Off'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
