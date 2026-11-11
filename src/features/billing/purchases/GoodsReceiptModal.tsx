// ==============================================================================
// Luma Salon — Goods Receipt Note (GRN) Intake Modal
// Phase 6: Physical Stock Intake & Accepted vs Rejected Quantities
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, PurchaseOrder, GoodsReceiptItem } from '../../../types/purchases.ts'
import type { InventoryProduct } from '../../../types/inventory.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, PlusIcon, TrashIcon, CheckCircleIcon } from '../../../components/Icons'
import './GoodsReceiptModal.css'

interface Props {
  isOpen: boolean
  preselectedPoId?: string
  onClose: () => void
  onSuccess: (receiptId: string, grnNumber: string) => void
}

export const GoodsReceiptModal: React.FC<Props> = ({
  isOpen,
  preselectedPoId,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [catalogProducts, setCatalogProducts] = useState<InventoryProduct[]>([])

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('')
  const [selectedPoId, setSelectedPoId] = useState<string>(preselectedPoId || '')
  const [receivedBy, setReceivedBy] = useState<string>('Front Desk')
  const [notes, setNotes] = useState<string>('')

  const [items, setItems] = useState<GoodsReceiptItem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    purchaseService.getSuppliers({ status: 'active' }).then(setSuppliers).catch(console.error)
    purchaseService.getPurchaseOrders().then((list) => {
      setPurchaseOrders(list.filter((o) => o.status === 'submitted' || o.status === 'partially_received'))
    }).catch(console.error)
    inventoryService.fetchInventoryProducts().then(setCatalogProducts).catch(console.error)
  }, [isOpen])

  // When PO is selected, populate items
  useEffect(() => {
    if (!selectedPoId) return
    purchaseService.getPurchaseOrderById(selectedPoId).then((po) => {
      if (!po) return
      setSelectedSupplierId(po.supplierId)
      const mapped: GoodsReceiptItem[] = (po.items || []).map((it) => {
        const remaining = Math.max(0, it.orderedQuantity - (it.receivedQuantity || 0))
        return {
          poItemId: it.id,
          productId: it.productId || '',
          productName: it.name,
          orderedQuantity: it.orderedQuantity,
          receivedQuantity: remaining,
          acceptedQuantity: remaining,
          rejectedQuantity: 0,
          rejectionReason: '',
          unitCost: it.unitCost,
        }
      })
      setItems(mapped)
    }).catch(console.error)
  }, [selectedPoId])

  const handleItemChange = (index: number, field: keyof GoodsReceiptItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev]
      const cur = { ...copy[index], [field]: val }

      if (field === 'receivedQuantity') {
        const recv = Math.max(0, Number(val) || 0)
        cur.receivedQuantity = recv
        cur.acceptedQuantity = recv - cur.rejectedQuantity
      } else if (field === 'acceptedQuantity') {
        const acc = Math.max(0, Number(val) || 0)
        cur.acceptedQuantity = acc
        cur.rejectedQuantity = Math.max(0, cur.receivedQuantity - acc)
      } else if (field === 'rejectedQuantity') {
        const rej = Math.max(0, Number(val) || 0)
        cur.rejectedQuantity = rej
        cur.acceptedQuantity = Math.max(0, cur.receivedQuantity - rej)
      }

      copy[index] = cur
      return copy
    })
  }

  const handleAddDirectItem = () => {
    setItems((prev) => [
      ...prev,
      {
        productId: catalogProducts[0]?.id || '',
        productName: catalogProducts[0]?.name || '',
        orderedQuantity: 0,
        receivedQuantity: 1,
        acceptedQuantity: 1,
        rejectedQuantity: 0,
        rejectionReason: '',
        unitCost: catalogProducts[0]?.purchasePrice || 0,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) {
      setError('Please select a supplier')
      return
    }
    if (items.length === 0) {
      setError('Please add at least one received item')
      return
    }
    const invalid = items.find((it) => !it.productId || it.receivedQuantity <= 0)
    if (invalid) {
      setError('Every item must have a valid product and received quantity > 0')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await purchaseService.recordGoodsReceipt({
        supplierId: selectedSupplierId,
        poId: selectedPoId || undefined,
        receivedBy: receivedBy.trim() || 'Front Desk',
        notes: notes.trim() || undefined,
        items,
      })

      if (!res.success || !res.receiptId) {
        setError(res.error || 'Failed to record goods receipt')
        setSaving(false)
        return
      }

      onSuccess(res.receiptId, res.grnNumber || '')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error occurred while recording goods receipt')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="grn-modal-backdrop" onClick={onClose}>
      <div className="grn-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="grn-modal-header">
          <div>
            <h2>Record Goods Receipt Note (GRN)</h2>
            <p className="subtitle">Physical stock intake and quality inspection</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="grn-modal-body">
          {error && <div className="grn-error-banner">{error}</div>}

          <div className="grn-form-grid">
            <div className="form-field">
              <label>Select Purchase Order (Optional)</label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
              >
                <option value="">-- Direct Purchase (No PO) --</option>
                {purchaseOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.poNumber} — {o.supplierName} (Total: Rs. {o.totalAmount.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Supplier *</label>
              <select
                disabled={Boolean(selectedPoId)}
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                required
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplierCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Received By *</label>
              <input
                type="text"
                required
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Staff Name"
              />
            </div>
          </div>

          {/* Items Table */}
          <div className="grn-items-section">
            <div className="items-header">
              <h3>Items Received & Quality Inspection</h3>
              {!selectedPoId && (
                <button type="button" className="btn-add-line" onClick={handleAddDirectItem}>
                  <PlusIcon size={14} /> Add Product
                </button>
              )}
            </div>

            <table className="grn-items-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Product</th>
                  {selectedPoId && <th>Ordered</th>}
                  <th>Received Qty</th>
                  <th>Accepted (To Stock)</th>
                  <th>Rejected / Damaged</th>
                  <th>Rejection Reason</th>
                  {!selectedPoId && <th style={{ width: '40px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4">No items listed. Add direct items or select an active Purchase Order.</td>
                  </tr>
                ) : (
                  items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        {selectedPoId ? (
                          <strong>{it.productName}</strong>
                        ) : (
                          <select
                            value={it.productId}
                            onChange={(e) => {
                              const prod = catalogProducts.find((p) => p.id === e.target.value)
                              handleItemChange(idx, 'productId', e.target.value)
                              if (prod) {
                                handleItemChange(idx, 'productName', prod.name)
                                handleItemChange(idx, 'unitCost', prod.purchasePrice || 0)
                              }
                            }}
                          >
                            {catalogProducts.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.sku})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      {selectedPoId && (
                        <td><span className="font-bold">{it.orderedQuantity}</span></td>
                      )}
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          value={it.receivedQuantity}
                          onChange={(e) => handleItemChange(idx, 'receivedQuantity', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          className="input-accepted"
                          value={it.acceptedQuantity}
                          onChange={(e) => handleItemChange(idx, 'acceptedQuantity', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          className="input-rejected"
                          value={it.rejectedQuantity}
                          onChange={(e) => handleItemChange(idx, 'rejectedQuantity', parseFloat(e.target.value) || 0)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          placeholder="e.g. Broken seal, expired batch"
                          disabled={it.rejectedQuantity <= 0}
                          value={it.rejectionReason || ''}
                          onChange={(e) => handleItemChange(idx, 'rejectionReason', e.target.value)}
                        />
                      </td>
                      {!selectedPoId && (
                        <td>
                          <button
                            type="button"
                            className="btn-trash"
                            onClick={() => handleRemoveItem(idx)}
                          >
                            <TrashIcon size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="stock-notice-box">
              <CheckCircleIcon size={16} />
              <span>
                <strong>Stock Update Policy:</strong> Submitting this receipt will immediately increment available inventory stock by <strong>Accepted Quantity</strong>. Rejected quantities will be tracked for vendor return and will NOT enter available stock.
              </span>
            </div>
          </div>

          <div className="form-field full">
            <label>Intake Notes / Delivery Challan Reference</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Received via BlueDart courier, Challan #BLR-901"
            />
          </div>

          <div className="grn-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-save-grn">
              {saving ? 'Processing Intake...' : 'Confirm Goods Receipt & Update Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
