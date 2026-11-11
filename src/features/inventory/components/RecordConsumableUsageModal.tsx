// ==============================================================================
// Luma Salon — Record Consumable Usage Modal
// Phase 7: Service & Operational Consumable Stock Deductions
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { InventoryProduct, InventoryBatch } from '../../../types/inventory.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, PackageIcon } from '../../../components/Icons.tsx'
import './RecordConsumableUsageModal.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedProductId?: string
}

export const RecordConsumableUsageModal: React.FC<Props> = ({
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
  const [reason, setReason] = useState<string>('Client hair treatment service')
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
      // Filter for consumable items or items with available stock
      setProducts(all.filter((p) => p.status !== 'archived'))
      if (!selectedProductId && all.length > 0) {
        const firstConsumable = all.find((p) => p.itemType === 'consumable') || all[0]
        setSelectedProductId(firstConsumable.id)
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const loadBatches = async (prodId: string) => {
    try {
      const bList = await inventoryService.getInventoryBatches(prodId)
      // Only active and non-expired batches
      const activeBatches = bList.filter(
        (b) => b.status === 'active' && new Date(b.expiryDate) >= new Date() && b.currentQuantity > 0
      )
      setBatches(activeBatches)
      if (activeBatches.length > 0) {
        setSelectedBatchId(activeBatches[0].id)
      } else {
        setSelectedBatchId('')
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const selectedProduct = products.find((p) => p.id === selectedProductId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProductId) {
      setError('Please select an inventory product.')
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

    setLoading(true)
    setError(null)

    try {
      await inventoryService.recordConsumableUsage({
        productId: selectedProductId,
        quantity,
        unit: selectedProduct?.unit,
        batchId: selectedBatchId || undefined,
        reason,
        notes,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to record consumable usage')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="consumable-usage-modal-overlay">
      <div className="consumable-usage-modal-content">
        <div className="consumable-usage-modal-header">
          <div className="header-title">
            <PackageIcon size={20} className="icon-package" />
            <h3>Record Salon Consumable Usage</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="consumable-usage-form">
          {error && <div className="usage-error-banner">{error}</div>}

          <div className="form-group">
            <label>Consumable Item *</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              required
            >
              <option value="">Select product / consumable...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — Stock: {p.currentStock} {p.unit}{' '}
                  {p.itemType === 'consumable' ? '[Consumable]' : '[Retail]'}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <span className="field-hint">
                Current Available Stock: <strong>{selectedProduct.currentStock} {selectedProduct.unit}</strong> | Cost: ₹{(selectedProduct.weightedAverageCost || selectedProduct.purchasePrice).toFixed(2)}
              </span>
            )}
          </div>

          {batches.length > 0 && (
            <div className="form-group">
              <label>Inventory Batch (Optional / FEFO Recommended)</label>
              <select
                value={selectedBatchId}
                onChange={(e) => setSelectedBatchId(e.target.value)}
              >
                <option value="">Auto-deduct / Unspecified Batch</option>
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    Batch {b.batchNumber} (Expires: {b.expiryDate}, Avail: {b.currentQuantity})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Quantity Used *</label>
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
              <label>Unit of Measure</label>
              <input
                type="text"
                value={selectedProduct?.unit || 'units'}
                disabled
                className="input-disabled"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Usage Reason / Purpose *</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Hair color formulation, wash station refill, facial kit"
              required
            />
          </div>

          <div className="form-group">
            <label>Internal Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Dispensed to Stylist Ananya for VIP appointment #1042"
            />
          </div>

          <div className="consumable-usage-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Deducting Stock...' : 'Confirm & Deduct Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

