// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Allocate Customer Advance against Outstanding Bill Modal Component
// ==============================================================================

import React, { useState, useEffect } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { billingService } from '../../../services/billingService.ts'
import type { CustomerAdvance, Invoice } from '../../../types/finance.ts'
import { CloseIcon, AlertTriangleIcon } from '../../../components/Icons.tsx'
import './AllocateCreditNoteModal.css'

interface AllocateAdvanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  advance: CustomerAdvance | null
}

export const AllocateAdvanceModal: React.FC<AllocateAdvanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  advance,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [targetInvoiceId, setTargetInvoiceId] = useState('')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && advance) {
      billingService
        .fetchInvoicesAsync()
        .then((list) => {
          const eligible = list.filter(
            (inv) =>
              !inv.isDraft &&
              (inv.balanceDue || 0) > 0 &&
              (!advance.clientId || inv.clientId === advance.clientId)
          )
          setInvoices(eligible)
          if (eligible.length > 0) {
            setTargetInvoiceId(eligible[0].id)
            setSelectedInvoice(eligible[0])
            const maxAlloc = Math.min(advance.remainingAmount, eligible[0].balanceDue || 0)
            setAmount(String(maxAlloc))
          } else {
            setTargetInvoiceId('')
            setSelectedInvoice(null)
            setAmount('')
          }
        })
        .catch(console.error)

      setError(null)
    }
  }, [isOpen, advance])

  if (!isOpen || !advance) return null

  const handleInvoiceSelect = (id: string) => {
    setTargetInvoiceId(id)
    const matched = invoices.find((inv) => inv.id === id) || null
    setSelectedInvoice(matched)
    if (matched) {
      const maxAlloc = Math.min(advance.remainingAmount, matched.balanceDue || 0)
      setAmount(String(maxAlloc))
    }
  }

  const numAmount = parseFloat(amount) || 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!targetInvoiceId) {
      setError('Please select an invoice with an outstanding balance.')
      return
    }
    if (numAmount <= 0) {
      setError('Allocation amount must be greater than ₹0.')
      return
    }
    if (numAmount > advance.remainingAmount) {
      setError(`Allocation cannot exceed remaining advance deposit of ₹${advance.remainingAmount}.`)
      return
    }
    if (selectedInvoice && numAmount > (selectedInvoice.balanceDue || 0)) {
      setError(`Allocation cannot exceed the outstanding balance of ₹${selectedInvoice.balanceDue}.`)
      return
    }

    try {
      setIsSubmitting(true)
      await customerLedgerService.allocateCustomerAdvance({
        advanceId: advance.id,
        invoiceId: targetInvoiceId,
        amount: numAmount,
      })
      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to allocate customer advance')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="allocate-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Apply Customer Advance to Invoice</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="modal-alert modal-alert-danger">
              <AlertTriangleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="credit-summary-card">
            <div className="summary-field">
              <span className="summary-label">Advance #:</span>
              <span className="summary-val">{advance.advanceNumber}</span>
            </div>
            <div className="summary-field">
              <span className="summary-label">Client:</span>
              <span className="summary-val">{advance.clientName || 'General Client'}</span>
            </div>
            <div className="summary-field">
              <span className="summary-label">Available Advance:</span>
              <span className="summary-val text-gold">₹{advance.remainingAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="alloc-adv-target-invoice">Target Outstanding Invoice <span className="req">*</span></label>
            {invoices.length === 0 ? (
              <p className="no-invoices-notice">
                No outstanding invoices found for this customer with a balance due.
              </p>
            ) : (
              <select
                id="alloc-adv-target-invoice"
                value={targetInvoiceId}
                onChange={(e) => handleInvoiceSelect(e.target.value)}
                className="form-control"
                required
              >
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    #{inv.invoiceNumber} — Balance Due: ₹{inv.balanceDue} (Total: ₹{inv.totalAmount})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedInvoice && (
            <div className="form-group">
              <label htmlFor="alloc-adv-amount">Amount to Apply (₹) <span className="req">*</span></label>
              <input
                id="alloc-adv-amount"
                type="number"
                step="0.01"
                min="1"
                max={Math.min(advance.remainingAmount, selectedInvoice.balanceDue || 0)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-control"
                required
              />
              <span className="field-hint">
                Max applicable: ₹
                {Math.min(advance.remainingAmount, selectedInvoice.balanceDue || 0).toFixed(2)}
              </span>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || invoices.length === 0}
            >
              {isSubmitting ? 'Allocating...' : 'Apply Advance to Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

