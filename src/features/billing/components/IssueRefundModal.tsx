// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Issue Controlled Refund Modal Component (with Owner Auth Gate for > ₹2,000)
// ==============================================================================

import React, { useState, useEffect } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { billingService } from '../../../services/billingService.ts'
import type { Invoice, SinglePaymentMethod } from '../../../types/finance.ts'
import { CloseIcon, AlertTriangleIcon, ShieldCheckIcon } from '../../../components/Icons.tsx'
import './IssueRefundModal.css'

interface IssueRefundModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedInvoiceId?: string
}

export const IssueRefundModal: React.FC<IssueRefundModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedInvoiceId,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceId, setInvoiceId] = useState(preselectedInvoiceId || '')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [amount, setAmount] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<SinglePaymentMethod>('cash')
  const [reason, setReason] = useState('')
  const [ownerEmail, setOwnerEmail] = useState('')
  const [ownerPassword, setOwnerPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      billingService
        .fetchInvoicesAsync()
        .then((list) => {
          // Filter to finalized invoices with payments
          const eligible = list.filter((inv) => !inv.isDraft && (inv.paidAmount || 0) > 0)
          setInvoices(eligible)
          if (preselectedInvoiceId) {
            setInvoiceId(preselectedInvoiceId)
            const matched = eligible.find((i) => i.id === preselectedInvoiceId)
            setSelectedInvoice(matched || null)
            if (matched) {
              setAmount(String(matched.paidAmount || ''))
            }
          }
        })
        .catch(console.error)

      setAmount('')
      setPaymentMethod('cash')
      setReason('')
      setOwnerEmail('')
      setOwnerPassword('')
      setError(null)
    }
  }, [isOpen, preselectedInvoiceId])

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id)
    const matched = invoices.find((inv) => inv.id === id) || null
    setSelectedInvoice(matched)
    if (matched) {
      setAmount(String(matched.paidAmount || ''))
    }
  }

  if (!isOpen) return null

  const numAmount = parseFloat(amount) || 0
  const isOwnerAuthRequired = numAmount > 2000

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!invoiceId) {
      setError('Please select an invoice to refund.')
      return
    }
    if (numAmount <= 0) {
      setError('Please enter a valid refund amount greater than ₹0.')
      return
    }
    if (selectedInvoice && numAmount > (selectedInvoice.paidAmount || 0)) {
      setError(
        `Refund amount cannot exceed the total amount paid on the invoice (₹${selectedInvoice.paidAmount}).`
      )
      return
    }
    if (!reason.trim()) {
      setError('A mandatory reason is required to process this refund.')
      return
    }
    if (isOwnerAuthRequired && (!ownerEmail.trim() || !ownerPassword)) {
      setError('Owner authorization (email and password) is strictly required for refunds exceeding ₹2,000.')
      return
    }

    try {
      setIsSubmitting(true)
      await customerLedgerService.issueRefund({
        invoiceId,
        amount: numAmount,
        paymentMethod,
        reason: reason.trim(),
        ownerEmail: isOwnerAuthRequired ? ownerEmail.trim() : undefined,
        ownerPassword: isOwnerAuthRequired ? ownerPassword : undefined,
      })
      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to issue refund')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="issue-refund-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Issue Invoice Refund</h3>
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

          <div className="form-group">
            <label htmlFor="ref-invoice-select">Invoice <span className="req">*</span></label>
            <select
              id="ref-invoice-select"
              value={invoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="form-control"
              required
            >
              <option value="">-- Select Invoice --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  #{inv.invoiceNumber} — {inv.clientName} (Paid: ₹{inv.paidAmount})
                </option>
              ))}
            </select>
          </div>

          {selectedInvoice && (
            <div className="invoice-context-card">
              <div className="context-item">
                <span className="context-label">Client:</span>
                <span className="context-val">{selectedInvoice.clientName}</span>
              </div>
              <div className="context-item">
                <span className="context-label">Total Invoiced:</span>
                <span className="context-val">₹{selectedInvoice.totalAmount}</span>
              </div>
              <div className="context-item">
                <span className="context-label">Paid to Date:</span>
                <span className="context-val text-success">₹{selectedInvoice.paidAmount}</span>
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="ref-amount">Refund Amount (₹) <span className="req">*</span></label>
              <input
                id="ref-amount"
                type="number"
                step="0.01"
                min="1"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-control"
                required
              />
            </div>
            <div className="form-group flex-1">
              <label htmlFor="ref-payment-method">Refund Tender <span className="req">*</span></label>
              <select
                id="ref-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SinglePaymentMethod)}
                className="form-control"
              >
                <option value="cash">Cash Out</option>
                <option value="upi">UPI Reversal</option>
                <option value="card">Card Reversal</option>
                <option value="bank">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="ref-reason">Refund Reason <span className="req">*</span></label>
            <textarea
              id="ref-reason"
              rows={2}
              placeholder="e.g. Service dissatisfaction, billing adjustment, duplicate payment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="form-control"
              required
            />
          </div>

          {isOwnerAuthRequired && (
            <div className="owner-gate-section">
              <div className="owner-gate-header">
                <ShieldCheckIcon size={18} />
                <span>Owner Authorization Required (&gt; ₹2,000)</span>
              </div>
              <p className="owner-gate-hint">
                Refund amounts exceeding ₹2,000 must be authenticated with valid Owner credentials.
              </p>
              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="ref-owner-email">Owner Email <span className="req">*</span></label>
                  <input
                    id="ref-owner-email"
                    type="email"
                    placeholder="owner@luma.com"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="form-control"
                    required={isOwnerAuthRequired}
                  />
                </div>
                <div className="form-group flex-1">
                  <label htmlFor="ref-owner-password">Owner Password <span className="req">*</span></label>
                  <input
                    id="ref-owner-password"
                    type="password"
                    placeholder="••••••••"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    className="form-control"
                    required={isOwnerAuthRequired}
                  />
                </div>
              </div>
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
              className="btn btn-danger-action"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Processing...' : 'Authorize & Issue Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

