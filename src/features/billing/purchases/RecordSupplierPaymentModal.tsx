// ==============================================================================
// Luma Salon — Record Supplier Payment & Advance Modal
// Phase 6: Supplier Payment Execution, Bill Allocation & AP Ledger Update
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, PurchaseBill } from '../../../types/purchases.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { CloseIcon } from '../../../components/Icons'
import './RecordSupplierPaymentModal.css'

interface Props {
  isOpen: boolean
  preselectedSupplierId?: string
  preselectedBillId?: string
  onClose: () => void
  onSuccess: (paymentId: string, paymentNumber: string) => void
}

export const RecordSupplierPaymentModal: React.FC<Props> = ({
  isOpen,
  preselectedSupplierId,
  preselectedBillId,
  onClose,
  onSuccess,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [bills, setBills] = useState<PurchaseBill[]>([])

  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(preselectedSupplierId || '')
  const [amount, setAmount] = useState<number>(0)
  const [paymentMethod, setPaymentMethod] = useState<'bank' | 'upi' | 'cash' | 'card' | 'advance'>('bank')
  const [transactionRef, setTransactionRef] = useState<string>('')
  const [isAdvance, setIsAdvance] = useState<boolean>(false)
  const [notes, setNotes] = useState<string>('')

  // Map of billId -> allocated amount
  const [allocations, setAllocations] = useState<Record<string, number>>({})

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    purchaseService.getSuppliers({ status: 'active' }).then(setSuppliers).catch(console.error)
    purchaseService.getPurchaseBills().then(setBills).catch(console.error)
  }, [isOpen])

  const unpaidBills = bills.filter(
    (b) => b.supplierId === selectedSupplierId && (b.status === 'unpaid' || b.status === 'partially_paid')
  )

  // Auto-allocate if preselectedBillId
  useEffect(() => {
    if (!preselectedBillId || unpaidBills.length === 0) return
    const target = unpaidBills.find((b) => b.id === preselectedBillId)
    if (target) {
      setAmount(target.balanceDue)
      setAllocations({ [target.id]: target.balanceDue })
    }
  }, [preselectedBillId, unpaidBills.length])

  const handleAllocationChange = (billId: string, allocVal: number) => {
    setAllocations((prev) => {
      const copy = { ...prev }
      if (allocVal <= 0) {
        delete copy[billId]
      } else {
        copy[billId] = allocVal
      }
      return copy
    })
  }

  const handleAutoAllocate = () => {
    let remaining = amount
    const newAlloc: Record<string, number> = {}

    for (const b of unpaidBills) {
      if (remaining <= 0) break
      const toAlloc = Math.min(remaining, b.balanceDue)
      newAlloc[b.id] = toAlloc
      remaining -= toAlloc
    }
    setAllocations(newAlloc)
  }

  const totalAllocated = Object.values(allocations).reduce((sum, v) => sum + v, 0)
  const unallocatedAmount = Math.max(0, amount - totalAllocated)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSupplierId) {
      setError('Please select a supplier')
      return
    }
    if (amount <= 0) {
      setError('Payment amount must be greater than zero')
      return
    }
    if (totalAllocated > amount) {
      setError('Total allocated to bills exceeds payment amount')
      return
    }

    setSaving(true)
    setError(null)

    const allocList = Object.entries(allocations).map(([billId, allocAmt]) => ({
      billId,
      amount: allocAmt,
    }))

    try {
      const res = await purchaseService.recordSupplierPayment({
        supplierId: selectedSupplierId,
        amount,
        paymentMethod,
        transactionReference: transactionRef.trim() || undefined,
        isAdvance: isAdvance || unallocatedAmount > 0,
        idempotencyKey: `spay-idem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        notes: notes.trim() || undefined,
        allocations: allocList,
      })

      if (!res.success || !res.paymentId) {
        setError(res.error || 'Failed to record supplier payment')
        setSaving(false)
        return
      }

      onSuccess(res.paymentId, res.paymentNumber || '')
      onClose()
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving payment')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="spay-modal-backdrop" onClick={onClose}>
      <div className="spay-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="spay-modal-header">
          <div>
            <h2>Record Supplier Payment / Advance</h2>
            <p className="subtitle">Execute vendor payment and settle outstanding purchase bills</p>
          </div>
          <button type="button" className="close-btn" onClick={onClose}><CloseIcon size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="spay-modal-body">
          {error && <div className="spay-error-banner">{error}</div>}

          <div className="spay-form-grid">
            <div className="form-field">
              <label>Select Supplier *</label>
              <select
                value={selectedSupplierId}
                onChange={(e) => {
                  setSelectedSupplierId(e.target.value)
                  setAllocations({})
                }}
                required
              >
                <option value="">-- Choose Supplier --</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.supplierCode}) — Payable: Rs. {(s.outstandingPayable || 0).toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Payment Amount (Rs.) *</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>

            <div className="form-field">
              <label>Payment Tender / Method *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
              >
                <option value="bank">Bank Transfer (NEFT/RTGS/IMPS)</option>
                <option value="upi">UPI / QR Code</option>
                <option value="cash">Cash</option>
                <option value="card">Company Debit / Credit Card</option>
                <option value="advance">Supplier Advance Deduction</option>
              </select>
            </div>

            <div className="form-field">
              <label>Transaction / UTR Reference</label>
              <input
                type="text"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="e.g. UTR #CITI98124912"
              />
            </div>

            <div className="form-field checkbox-field">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={isAdvance}
                  onChange={(e) => setIsAdvance(e.target.checked)}
                />
                <span>Treat as Unallocated Supplier Advance</span>
              </label>
            </div>
          </div>

          {/* Allocation Section */}
          {!isAdvance && unpaidBills.length > 0 && (
            <div className="spay-allocation-section">
              <div className="alloc-header">
                <h3>Allocate to Outstanding Purchase Bills</h3>
                {amount > 0 && (
                  <button type="button" className="btn-auto-alloc" onClick={handleAutoAllocate}>
                    Auto Allocate (Rs. {amount.toFixed(2)})
                  </button>
                )}
              </div>

              <table className="alloc-table">
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Supplier Inv #</th>
                    <th>Due Date</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Balance Due</th>
                    <th className="text-right" style={{ width: '150px' }}>Allocate (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {unpaidBills.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.billNumber}</strong></td>
                      <td>{b.supplierInvoiceNumber}</td>
                      <td>{b.dueDate}</td>
                      <td className="text-right">Rs. {b.totalAmount.toFixed(2)}</td>
                      <td className="text-right text-danger font-bold">Rs. {b.balanceDue.toFixed(2)}</td>
                      <td className="text-right">
                        <input
                          type="number"
                          min="0"
                          max={b.balanceDue}
                          step="0.01"
                          value={allocations[b.id] || ''}
                          placeholder="0.00"
                          onChange={(e) => handleAllocationChange(b.id, parseFloat(e.target.value) || 0)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="alloc-summary-bar">
                <span>Total Payment: <strong>Rs. {amount.toFixed(2)}</strong></span>
                <span>Allocated to Bills: <strong>Rs. {totalAllocated.toFixed(2)}</strong></span>
                <span className={unallocatedAmount > 0 ? 'text-primary font-bold' : ''}>
                  Unallocated Advance: <strong>Rs. {unallocatedAmount.toFixed(2)}</strong>
                </span>
              </div>
            </div>
          )}

          <div className="form-field full" style={{ marginTop: '1rem' }}>
            <label>Payment Remarks / Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Paid via ICICI Current Account, ref order PO-2026-0012"
            />
          </div>

          <div className="spay-modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-save-payment">
              {saving ? 'Processing Payment...' : `Confirm Payment of Rs. ${amount.toFixed(2)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
