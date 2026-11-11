// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Record Customer Advance Modal Component
// ==============================================================================

import React, { useState, useEffect } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { clientService } from '../../../services/clientService.ts'
import type { Client } from '../../../types/models.ts'
import type { SinglePaymentMethod } from '../../../types/finance.ts'
import { CloseIcon, AlertTriangleIcon } from '../../../components/Icons.tsx'
import './RecordAdvanceModal.css'

interface RecordAdvanceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedClientId?: string
}

export const RecordAdvanceModal: React.FC<RecordAdvanceModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedClientId,
}) => {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState(preselectedClientId || '')
  const [amount, setAmount] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<SinglePaymentMethod>('cash')
  const [transactionReference, setTransactionReference] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      clientService.getClients().then(setClients).catch(console.error)
      if (preselectedClientId) {
        setClientId(preselectedClientId)
      }
      setAmount('')
      setPaymentMethod('cash')
      setTransactionReference('')
      setNotes('')
      setError(null)
    }
  }, [isOpen, preselectedClientId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const numAmount = parseFloat(amount)
    if (!clientId) {
      setError('Please select a customer.')
      return
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid advance amount greater than ₹0.')
      return
    }

    try {
      setIsSubmitting(true)
      await customerLedgerService.recordCustomerAdvance({
        clientId,
        amount: numAmount,
        paymentMethod,
        transactionReference: transactionReference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to record customer advance')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="record-advance-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Record Customer Advance</h3>
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
            <label htmlFor="adv-client-select">Customer <span className="req">*</span></label>
            <select
              id="adv-client-select"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="form-control"
              required
            >
              <option value="">-- Select Customer --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone || 'No phone'})
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="adv-amount">Advance Amount (₹) <span className="req">*</span></label>
              <input
                id="adv-amount"
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
              <label htmlFor="adv-payment-method">Payment Tender <span className="req">*</span></label>
              <select
                id="adv-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SinglePaymentMethod)}
                className="form-control"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR Code</option>
                <option value="card">Card (POS / Debit / Credit)</option>
                <option value="bank">Bank Transfer / NEFT</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="adv-tx-ref">Transaction / UPI Reference #</label>
            <input
              id="adv-tx-ref"
              type="text"
              placeholder="e.g. UPI-12345678 or Txn Ref"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              className="form-control"
            />
          </div>

          <div className="form-group">
            <label htmlFor="adv-notes">Notes / Purpose</label>
            <textarea
              id="adv-notes"
              rows={2}
              placeholder="e.g. Advance deposit for bridal package or future services"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="form-control"
            />
          </div>

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
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Recording...' : 'Record Advance Deposit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
