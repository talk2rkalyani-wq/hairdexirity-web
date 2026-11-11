// ==============================================================================
// Luma Salon — New Purchase Return (Debit Note) Modal
// Phase 6: Purchase Return, Stock Reduction & Supplier Balance Adjustment
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, PurchaseBill, PurchaseReturnItem } from '../../../types/purchases.ts'
import type { InventoryProduct } from '../../../types/inventory.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, PlusIcon, TrashIcon } from '../../../components/Icons'
import './NewPurchaseReturnModal.css'

interface Props {
  isOpen: boolean
  preselectedSupplierId?: string
  onClose: () => void
  onSuccess: (returnId: string, returnNumber: string) => void
}

export const NewPurchaseReturnModal: React.FC<Props> = ({
  isOpen,
  preselectedSupplierId,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bills, setBills] = useState<PurchaseBill[]>([])
  const [catalogProducts, setCatalogProducts] = useState<InventoryProduct[]>([])

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preselectedSupplierId || '')
  const [selectedBillId, setSelectedBillId] = useState<string>('')
  const [reason, setReason] = useState<string>('Damaged goods')
  const [notes, setNotes] = useState<string>('')

  const [items, setItems] = useState<PurchaseReturnItem[]>([
    {
      productId: '',
      productName: '',
      quantity: 1,
      unitCost: 0,
      taxRate: 0.18,
      taxAmount: 0,
      totalAmount: 0,
      reason: 'Damaged goods',
    },
  ])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    purchaseService.getSuppliers({ status: 'active' }).then(setSuppliers).catch(console.error)
    purchaseService.getPurchaseBills().then(setBills).catch(console.error)
    inventoryService.fetchInventoryProducts().then(setCatalogProducts).catch(console.error)
  }, [isOpen])

  const supplierBills = bills.filter((b) => b.supplierId === selectedSupplierId)

  const handleProductSelect = (index: number, productId: string) => {
    const prod = catalogProducts.find((p) => p.id === productId)
    if (!prod) return

    setItems((prev) => {
      const copy = [...prev]
      const cur = copy[index]
      cur.productId = prod.id
      cur.productName = prod.name
      cur.unitCost = prod.purchasePrice || 0
      cur.taxRate = 0.18
      const taxable = cur.quantity * cur.unitCost
      cur.taxAmount = taxable * cur.taxRate
      cur.totalAmount = taxable + cur.taxAmount
      return copy
    })
  }

  const handleItemChange = (index: number, field: keyof PurchaseReturnItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev]
      const cur = { ...copy[index], [field]: val }

      const qty = Number(cur.quantity) || 0
      const cost = Number(cur.unitCost) || 0
      const rate = Number(cur.taxRate) || 0.18
      const taxable = qty * cost
      cur.taxAmount = taxable * rate
      cur.totalAmount = taxable + cur.taxAmount

      copy[index] = cur
      return copy
    })
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        productId: '',
        productName: '',
        quantity: 1,
        unitCost: 0,
        taxRate: 0.18,
        taxAmount: 0,
        totalAmount: 0,
        reason,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  const totalReturnAmount = items.reduce((sum, it) => sum + (it.totalAmount || 0), 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) {
      setError('Please select a supplier')
      return
    }
    const invalid = items.find((it) => !it.productId || it.quantity <= 0)
    if (invalid) {
      setError('Please specify a valid product and return quantity > 0 for all lines')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await purchaseService.recordPurchaseReturn({
        supplierId: selectedSupplierId,
        billId: selectedBillId || undefined,
        reason,
        notes: notes.trim() || undefined,
        items,
      })

      if (!res.success || !res.returnId) {
        setError(res.error || 'Failed to record purchase return')
        setSaving(false)
        return
      }

      onSuccess(res.returnId, res.returnNumber || '')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving return')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="ret-modal-backdrop" onClick={onClose}>
      <div className="ret-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="ret-modal-header">
          <div>
            <h2>Record Purchase Return & Debit Note</h2>
            <p className="subtitle">Return damaged or excess goods and reduce supplier balance</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="ret-modal-body">
          {error && <div className="ret-error-banner">{error}</div>}

          <div className="ret-form-grid">
            <div className="form-field">
              <label>Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value)
                  setSelectedBillId('')
                }}
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
              <label>Original Purchase Bill (Optional)</label>
              <select
                value={selectedBillId}
                onChange={(e) => setSelectedBillId(e.target.value)}
              >
                <option value="">-- Not Linked to Specific Bill --</option>
                {supplierBills.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.billNumber} (Inv: {b.supplierInvoiceNumber}) — Rs. {b.totalAmount.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Primary Return Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                <option value="Damaged goods">Damaged goods</option>
                <option value="Incorrect goods">Incorrect goods</option>
                <option value="Expired goods">Expired goods</option>
                <option value="Quality issue">Quality issue</option>
                <option value="Excess quantity">Excess quantity</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Items Section */}
          <div className="ret-items-section">
            <div className="items-header">
              <h3>Returned Line Items</h3>
              <button type="button" className="btn-add-line" onClick={handleAddItem}>
                <PlusIcon size={14} /> Add Return Item
              </button>
            </div>

            <table className="ret-items-table">
              <thead>
                <tr>
                  <th style={{ width: '35%' }}>Product to Return</th>
                  <th>Quantity</th>
                  <th>Unit Cost (Rs.)</th>
                  <th>GST %</th>
                  <th className="text-right">Total Debit (Rs.)</th>
                  <th style={{ width: '40px' }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <select
                        value={it.productId}
                        onChange={(e) => handleProductSelect(idx, e.target.value)}
                        required
                      >
                        <option value="">-- Select Product --</option>
                        {catalogProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (In Stock: {p.currentStock} {p.unit})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        step="0.001"
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      />
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
                        <option value="0.18">18%</option>
                        <option value="0.12">12%</option>
                        <option value="0.05">5%</option>
                        <option value="0">0%</option>
                      </select>
                    </td>
                    <td className="text-right font-bold text-danger">
                      Rs. {it.totalAmount.toFixed(2)}
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

          <div className="stock-notice-box-warning">
            <span>
              <strong>Inventory & Ledger Impact:</strong> Confirming this return will automatically <strong>decrement available stock</strong> in inventory for returned items and post a <strong>Debit (Credit Note)</strong> to the supplier ledger, reducing your outstanding payable balance by <strong>Rs. {totalReturnAmount.toFixed(2)}</strong>.
            </span>
          </div>

          <div className="form-field full" style={{ marginTop: '1rem' }}>
            <label>Return Notes / Vendor RMA Reference</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. RMA #RMA-9021 confirmed with distributor rep"
            />
          </div>

          <div className="ret-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-save-return">
              {saving ? 'Processing Return...' : `Authorize Return & Post Rs. ${totalReturnAmount.toFixed(2)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
