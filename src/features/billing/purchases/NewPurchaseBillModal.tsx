// ==============================================================================
// Luma Salon — New Purchase Bill (Supplier Invoice) Modal
// Phase 6: Supplier Invoice Entry, Tax Calculations & AP Ledger Update
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, PurchaseOrder, PurchaseBillItem } from '../../../types/purchases.ts'
import type { InventoryProduct } from '../../../types/inventory.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, PlusIcon, TrashIcon } from '../../../components/Icons'
import './NewPurchaseBillModal.css'

interface Props {
  isOpen: boolean
  preselectedSupplierId?: string
  preselectedPoId?: string
  onClose: () => void
  onSuccess: (billId: string, billNumber: string) => void
}

export const NewPurchaseBillModal: React.FC<Props> = ({
  isOpen,
  preselectedSupplierId,
  preselectedPoId,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [catalogProducts, setCatalogProducts] = useState<InventoryProduct[]>([])

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preselectedSupplierId || '')
  const [selectedPoId, setSelectedPoId] = useState<string>(preselectedPoId || '')
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState<string>('')
  const [billDate, setBillDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [additionalCharges, setAdditionalCharges] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')

  const [items, setItems] = useState<PurchaseBillItem[]>([
    {
      itemType: 'product',
      name: '',
      sku: '',
      unit: 'pcs',
      quantity: 1,
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
    purchaseService.getPurchaseOrders().then(setPurchaseOrders).catch(console.error)
    inventoryService.fetchInventoryProducts().then(setCatalogProducts).catch(console.error)
  }, [isOpen])

  // Populate from PO if selected
  useEffect(() => {
    if (!selectedPoId) return
    purchaseService.getPurchaseOrderById(selectedPoId).then((po) => {
      if (!po) return
      setSelectedSupplierId(po.supplierId)
      const mapped: PurchaseBillItem[] = (po.items || []).map((it) => ({
        productId: it.productId,
        itemType: it.itemType,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        quantity: it.orderedQuantity,
        unitCost: it.unitCost,
        discountAmount: it.discountAmount || 0,
        taxableAmount: it.taxableAmount || it.orderedQuantity * it.unitCost,
        taxRate: it.taxRate || 0.18,
        taxAmount: it.taxAmount || 0,
        totalCost: it.totalCost,
      }))
      setItems(mapped)
    }).catch(console.error)
  }, [selectedPoId])

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
      const taxable = cur.quantity * cur.unitCost
      cur.taxAmount = taxable * cur.taxRate
      cur.totalCost = taxable + cur.taxAmount
      return copy
    })
  }

  const handleItemChange = (index: number, field: keyof PurchaseBillItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev]
      const cur = { ...copy[index], [field]: val }

      const qty = Number(cur.quantity) || 0
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
        quantity: 1,
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

  const subtotal = items.reduce((sum, it) => sum + (it.quantity * it.unitCost), 0)
  const discountTotal = items.reduce((sum, it) => sum + (it.discountAmount || 0), 0)
  const taxTotal = items.reduce((sum, it) => sum + (it.taxAmount || 0), 0)
  const grandTotal = subtotal - discountTotal + taxTotal + Number(additionalCharges || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) {
      setError('Please select a supplier')
      return
    }
    if (!supplierInvoiceNumber.trim()) {
      setError('Supplier Invoice Number is mandatory')
      return
    }
    const invalid = items.find((it) => !it.name.trim() || it.quantity <= 0 || it.unitCost < 0)
    if (invalid) {
      setError('Every line item must have valid name, quantity > 0 and cost >= 0')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await purchaseService.createPurchaseBill({
        supplierId: selectedSupplierId,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        billDate,
        dueDate,
        poId: selectedPoId || undefined,
        subtotal,
        discountAmount: discountTotal,
        taxAmount: taxTotal,
        cgstAmount: taxTotal / 2,
        sgstAmount: taxTotal / 2,
        igstAmount: 0,
        additionalCharges: Number(additionalCharges || 0),
        totalAmount: grandTotal,
        notes: notes.trim() || undefined,
        items,
      })

      if (!res.success || !res.billId) {
        setError(res.error || 'Failed to create purchase bill')
        setSaving(false)
        return
      }

      onSuccess(res.billId, res.billNumber || '')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving purchase bill')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="pb-modal-backdrop" onClick={onClose}>
      <div className="pb-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="pb-modal-header">
          <div>
            <h2>Record Purchase Bill (Supplier Invoice)</h2>
            <p className="subtitle">Record supplier invoice and update accounts payable ledger</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="pb-modal-body">
          {error && <div className="pb-error-banner">{error}</div>}

          <div className="pb-form-grid">
            <div className="form-field">
              <label>Supplier *</label>
              <select
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
              <label>Supplier Invoice Number *</label>
              <input
                type="text"
                required
                value={supplierInvoiceNumber}
                onChange={(e) => setSupplierInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-LOR-8921"
              />
            </div>

            <div className="form-field">
              <label>Link Purchase Order (Optional)</label>
              <select
                value={selectedPoId}
                onChange={(e) => setSelectedPoId(e.target.value)}
              >
                <option value="">-- Direct Purchase (No PO) --</option>
                {purchaseOrders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.poNumber} — {o.supplierName} (Rs. {o.totalAmount.toFixed(2)})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Bill / Invoice Date *</label>
              <input
                type="date"
                required
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Payment Due Date *</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label>Freight / Addl Charges (Rs.)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={additionalCharges}
                onChange={(e) => setAdditionalCharges(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Items Section */}
          <div className="pb-items-section">
            <div className="items-header">
              <h3>Billed Line Items</h3>
              <button type="button" className="btn-add-line" onClick={handleAddItem}>
                <PlusIcon size={14} /> Add Line Item
              </button>
            </div>

            <table className="pb-items-table">
              <thead>
                <tr>
                  <th style={{ width: '32%' }}>Item Name</th>
                  <th>SKU</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Cost (Rs.)</th>
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
                        value={it.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
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

          <div className="pb-footer-grid">
            <div className="form-field">
              <label>Bill Remarks & Payment Instructions</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bank account details, dispatch references..."
              />
            </div>

            <div className="pb-totals-card">
              <div className="total-row">
                <span>Subtotal:</span>
                <span>Rs. {subtotal.toFixed(2)}</span>
              </div>
              <div className="total-row">
                <span>Total GST:</span>
                <span>Rs. {taxTotal.toFixed(2)}</span>
              </div>
              {additionalCharges > 0 && (
                <div className="total-row">
                  <span>Additional Charges:</span>
                  <span>Rs. {Number(additionalCharges).toFixed(2)}</span>
                </div>
              )}
              <div className="total-row grand">
                <span>Total Bill Amount:</span>
                <span>Rs. {grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="pb-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-save-bill">
              {saving ? 'Creating Bill...' : 'Create Purchase Bill & Post to Ledger'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
