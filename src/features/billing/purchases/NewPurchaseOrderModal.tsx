// ==============================================================================
// Luma Salon — New Purchase Order Modal
// Phase 6: Purchase Order Creation & Submission
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, PurchaseOrderItem } from '../../../types/purchases.ts'
import type { InventoryProduct } from '../../../types/inventory.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, PlusIcon, TrashIcon } from '../../../components/Icons'
import './NewPurchaseOrderModal.css'

interface Props {
  isOpen: boolean
  preselectedSupplierId?: string
  onClose: () => void
  onSuccess: (poId: string, poNumber: string) => void
}

export const NewPurchaseOrderModal: React.FC<Props> = ({
  isOpen,
  preselectedSupplierId,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [catalogProducts, setCatalogProducts] = useState<InventoryProduct[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preselectedSupplierId || '')
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('')
  const [notes, setNotes] = useState<string>('')
  const [terms, setTerms] = useState<string>('Standard 30-day payment term upon invoice verification.')

  const [items, setItems] = useState<PurchaseOrderItem[]>([
    {
      itemType: 'product',
      name: '',
      sku: '',
      unit: 'pcs',
      orderedQuantity: 10,
      unitCost: 0,
      discountAmount: 0,
      taxRate: 0.18,
      taxAmount: 0,
      totalCost: 0,
    },
  ])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    purchaseService.getSuppliers({ status: 'active' }).then(setSuppliers).catch(console.error)
    inventoryService.fetchInventoryProducts().then(setCatalogProducts).catch(console.error)
    if (preselectedSupplierId) {
      setSelectedSupplierId(preselectedSupplierId)
    }
  }, [isOpen, preselectedSupplierId])

  const handleProductSelect = (index: number, productId: string) => {
    const prod = catalogProducts.find((p) => p.id === productId)
    if (!prod) return

    setItems((prev) => {
      const copy = [...prev]
      const cur = copy[index]
      cur.productId = prod.id
      cur.name = prod.name
      cur.sku = prod.sku
      cur.unit = prod.unit
      cur.unitCost = prod.purchasePrice || 0
      cur.taxRate = 0.18
      const taxable = cur.orderedQuantity * cur.unitCost
      cur.taxAmount = taxable * cur.taxRate
      cur.totalCost = taxable + cur.taxAmount
      return copy
    })
  }

  const handleItemChange = (index: number, field: keyof PurchaseOrderItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev]
      const cur = { ...copy[index], [field]: val }

      const qty = Number(cur.orderedQuantity) || 0
      const cost = Number(cur.unitCost) || 0
      const disc = Number(cur.discountAmount) || 0
      const rate = Number(cur.taxRate) || 0.18

      const taxable = Math.max(0, qty * cost - disc)
      const tax = taxable * rate
      cur.taxableAmount = taxable
      cur.taxAmount = tax
      cur.totalCost = taxable + tax

      copy[index] = cur
      return copy
    })
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        itemType: 'product',
        name: '',
        sku: '',
        unit: 'pcs',
        orderedQuantity: 5,
        unitCost: 0,
        discountAmount: 0,
        taxRate: 0.18,
        taxAmount: 0,
        totalCost: 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Calculate totals
  const subtotal = items.reduce((sum, it) => sum + (it.orderedQuantity * it.unitCost), 0)
  const discountTotal = items.reduce((sum, it) => sum + (it.discountAmount || 0), 0)
  const taxTotal = items.reduce((sum, it) => sum + (it.taxAmount || 0), 0)
  const cgstAmount = taxTotal / 2
  const sgstAmount = taxTotal / 2
  const grandTotal = subtotal - discountTotal + taxTotal

  const handleSubmit = async (submitDirectly: boolean) => {
    if (!selectedSupplierId) {
      setError('Please select a supplier')
      return
    }
    const invalidItem = items.find((it) => !it.name.trim() || it.orderedQuantity <= 0 || it.unitCost < 0)
    if (invalidItem) {
      setError('All items must have valid name, quantity > 0, and cost >= 0')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await purchaseService.createPurchaseOrder({
        supplierId: selectedSupplierId,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        cgstAmount,
        sgstAmount,
        igstAmount: 0,
        totalAmount: grandTotal,
        notes,
        terms,
        items,
      })

      if (!res.success || !res.poId) {
        setError(res.error || 'Failed to create purchase order')
        setSaving(false)
        return
      }

      if (submitDirectly) {
        await purchaseService.submitPurchaseOrder(res.poId)
      }

      onSuccess(res.poId, res.poNumber || '')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error creating purchase order')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="po-modal-backdrop" onClick={onClose}>
      <div className="po-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="po-modal-header">
          <h2>Create Purchase Order</h2>
          <button type="button" className="close-btn" onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <div className="po-modal-body">
          {error && <div className="po-error-banner">{error}</div>}

          <div className="po-form-grid">
            <div className="form-field">
              <label>Select Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">-- Choose Active Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplierCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="po-items-section">
            <div className="items-header">
              <h3>Order Line Items</h3>
              <button type="button" className="btn-add-line" onClick={handleAddItem}>
                <PlusIcon size={14} /> Add Line Item
              </button>
            </div>

            <table className="po-items-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Product / Consumable</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Unit Cost (Rs.)</th>
                  <th>GST %</th>
                  <th className="text-right">Total (Rs.)</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <div className="product-input-cell">
                        <select
                          className="catalog-select"
                          value={it.productId || ''}
                          onChange={(e) => handleProductSelect(idx, e.target.value)}
                        >
                          <option value="">-- Pick Catalog Product --</option>
                          {catalogProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.sku})
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Or enter custom item name"
                          value={it.name}
                          onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                        />
                      </div>
                    </td>
                    <td>
                      <input
                        type="text"
                        placeholder="SKU"
                        value={it.sku || ''}
                        onChange={(e) => handleItemChange(idx, 'sku', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={it.orderedQuantity}
                        onChange={(e) => handleItemChange(idx, 'orderedQuantity', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <select
                        value={it.unit}
                        onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                      >
                        <option value="pcs">pcs</option>
                        <option value="bottle">bottle</option>
                        <option value="box">box</option>
                        <option value="pack">pack</option>
                        <option value="tube">tube</option>
                        <option value="ml">ml</option>
                        <option value="kg">kg</option>
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={it.unitCost}
                        onChange={(e) => handleItemChange(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td>
                      <select
                        value={it.taxRate}
                        onChange={(e) => handleItemChange(idx, 'taxRate', parseFloat(e.target.value))}
                      >
                        <option value="0.05">5%</option>
                        <option value="0.12">12%</option>
                        <option value="0.18">18%</option>
                        <option value="0.28">28%</option>
                        <option value="0">0%</option>
                      </select>
                    </td>
                    <td className="text-right font-bold">
                      Rs. {it.totalCost.toFixed(2)}
                    </td>
                    <td>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="btn-trash"
                          onClick={() => handleRemoveItem(idx)}
                        >
                          <TrashIcon size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes & Summary */}
          <div className="po-footer-grid">
            <div className="po-notes-col">
              <div className="form-field">
                <label>Order Notes</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Special packaging or delivery instructions..."
                />
              </div>
              <div className="form-field">
                <label>Terms & Conditions</label>
                <textarea
                  rows={2}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </div>
            </div>

            <div className="po-totals-card">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Total Tax (GST):</span>
                <span>Rs. {taxTotal.toFixed(2)}</span>
              </div>
              <div className="total-row grand">
                <span>Grand Total:</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="po-modal-actions">
          <button type="button" className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            className="btn-draft"
            onClick={() => handleSubmit(false)}
          >
            {saving ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="button"
            disabled={saving}
            className="btn-submit"
            onClick={() => handleSubmit(true)}
          >
            {saving ? 'Submitting...' : 'Save & Submit Order'}
          </button>
        </div>
      </div>
    </div>
  )
}
