// ==============================================================================
// Luma Salon — Create Inventory Batch Modal
// Phase 7: Batch, Expiry & Shelf-Life Management
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { InventoryProduct } from '../../../types/inventory.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, TagIcon } from '../../../components/Icons.tsx'
import './CreateInventoryBatchModal.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedProductId?: string
}

export const CreateInventoryBatchModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedProductId,
}) => {
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [selectedProductId, setSelectedProductId] = useState<string>(preselectedProductId || '')
  const [batchNumber, setBatchNumber] = useState<string>('')
  const [manufacturingDate, setManufacturingDate] = useState<string>('')
  const [expiryDate, setExpiryDate] = useState<string>('')
  const [initialQuantity, setInitialQuantity] = useState<number>(10)
  const [unitCost, setUnitCost] = useState<number>(0)
  const [storageLocation, setStorageLocation] = useState<string>('Main Stockroom Shelf A')
  const [notes, setNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadProducts()
      // Generate default batch number
      const autoNum = `BATCH-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`
      setBatchNumber(autoNum)

      // Default expiry date 1 year from now
      const d = new Date()
      d.setFullYear(d.getFullYear() + 1)
      setExpiryDate(d.toISOString().slice(0, 10))
    }
  }, [isOpen])

  useEffect(() => {
    if (preselectedProductId) {
      setSelectedProductId(preselectedProductId)
    }
  }, [preselectedProductId])

  const loadProducts = async () => {
    try {
      const all = await inventoryService.fetchInventoryProducts()
      setProducts(all.filter((p) => p.status !== 'archived'))
      if (!selectedProductId && all.length > 0) {
        setSelectedProductId(all[0].id)
        setUnitCost(all[0].purchasePrice || 0)
      }
    } catch (err: any) {
      console.error(err)
    }
  }

  const handleProductChange = (prodId: string) => {
    setSelectedProductId(prodId)
    const prod = products.find((p) => p.id === prodId)
    if (prod) {
      setUnitCost(prod.purchasePrice || 0)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedProductId) {
      setError('Please select an inventory product.')
      return
    }
    if (!batchNumber.trim()) {
      setError('Please enter a batch identifier.')
      return
    }
    if (!expiryDate) {
      setError('Please select an expiry date.')
      return
    }
    if (initialQuantity <= 0) {
      setError('Batch initial quantity must be greater than zero.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await inventoryService.createInventoryBatch({
        productId: selectedProductId,
        batchNumber: batchNumber.trim(),
        manufacturingDate: manufacturingDate || undefined,
        expiryDate,
        receivedQuantity: initialQuantity,
        currentQuantity: initialQuantity,
        unitCost,
        notes: notes.trim() ? `${storageLocation ? `Location: ${storageLocation.trim()}. ` : ''}${notes.trim()}` : (storageLocation ? `Location: ${storageLocation.trim()}` : undefined),
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create inventory batch')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="create-batch-modal-overlay">
      <div className="create-batch-modal-content">
        <div className="create-batch-modal-header">
          <div className="header-title">
            <TagIcon size={20} className="icon-batch" />
            <h3>Register Inventory Batch & Expiry</h3>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="create-batch-form">
          {error && <div className="batch-error-banner">{error}</div>}

          <div className="form-group">
            <label>Inventory Product *</label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              required
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku}) — {p.itemType}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Batch / Lot Number *</label>
              <input
                type="text"
                value={batchNumber}
                onChange={(e) => setBatchNumber(e.target.value)}
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Storage Location</label>
              <input
                type="text"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="e.g. Rack B, Shelf 2"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Manufacture Date (Optional)</label>
              <input
                type="date"
                value={manufacturingDate}
                onChange={(e) => setManufacturingDate(e.target.value)}
              />
            </div>
            <div className="form-group flex-1">
              <label>Expiry Date *</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label>Batch Quantity *</label>
              <input
                type="number"
                step="any"
                min="0.001"
                value={initialQuantity}
                onChange={(e) => setInitialQuantity(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div className="form-group flex-1">
              <label>Unit Cost (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Batch Notes (Optional)</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received via Delivery Slip #992; inspected upon arrival"
            />
          </div>

          <div className="create-batch-modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Register Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
