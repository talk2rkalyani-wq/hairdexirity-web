// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Daily Payment Reconciliation & Cash Drawer Closing Modal Component
// ==============================================================================

import React, { useState, useEffect } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { CloseIcon, AlertTriangleIcon, CheckCircleIcon } from '../../../components/Icons.tsx'
import './PaymentReconciliationModal.css'

interface PaymentReconciliationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const PaymentReconciliationModal: React.FC<PaymentReconciliationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [dateStr, setDateStr] = useState<string>(new Date().toISOString().slice(0, 10))
  const [openingCash, setOpeningCash] = useState<string>('0')
  const [actualCash, setActualCash] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState<{
    cashCollected: number
    upiCollected: number
    cardCollected: number
    bankCollected: number
    refundsTotal: number
    netCollections: number
  }>({
    cashCollected: 0,
    upiCollected: 0,
    cardCollected: 0,
    bankCollected: 0,
    refundsTotal: 0,
    netCollections: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadDayPreview(dateStr)
      setError(null)
    }
  }, [isOpen, dateStr])

  const loadDayPreview = async (selectedDate: string) => {
    try {
      setIsLoading(true)
      const data = await customerLedgerService.getDailyReconciliationPreview(selectedDate)
      setPreview(data)
      setIsLoading(false)
    } catch (err) {
      console.error(err)
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  const numOpening = parseFloat(openingCash) || 0
  const numActual = parseFloat(actualCash) || 0
  const expectedCash = numOpening + preview.cashCollected
  const discrepancy = numActual - expectedCash

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (isNaN(numOpening) || numOpening < 0) {
      setError('Please specify a valid opening cash balance (>= 0).')
      return
    }
    if (actualCash === '' || isNaN(numActual) || numActual < 0) {
      setError('Please enter the actual physical cash counted in the drawer.')
      return
    }

    try {
      setIsSubmitting(true)
      await customerLedgerService.recordPaymentReconciliation({
        reconciliationDate: dateStr,
        openingCash: numOpening,
        actualCash: numActual,
        notes: notes.trim() || undefined,
      })
      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to submit daily reconciliation')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="reconciliation-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Daily Payment Reconciliation & Drawer Closing</h3>
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
            <label htmlFor="rec-date">Reconciliation Date <span className="req">*</span></label>
            <input
              id="rec-date"
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="reconciliation-collections-grid">
            <div className="recon-tile">
              <span className="recon-tile-label">Cash Collected</span>
              <span className="recon-tile-val">₹{preview.cashCollected.toFixed(2)}</span>
            </div>
            <div className="recon-tile">
              <span className="recon-tile-label">UPI / QR</span>
              <span className="recon-tile-val">₹{preview.upiCollected.toFixed(2)}</span>
            </div>
            <div className="recon-tile">
              <span className="recon-tile-label">Cards</span>
              <span className="recon-tile-val">₹{preview.cardCollected.toFixed(2)}</span>
            </div>
            <div className="recon-tile">
              <span className="recon-tile-label">Bank Transfers</span>
              <span className="recon-tile-val">₹{preview.bankCollected.toFixed(2)}</span>
            </div>
          </div>

          <div className="recon-net-bar">
            <span>Total Refunds: -₹{preview.refundsTotal.toFixed(2)}</span>
            <span className="net-total-text">
              Net Total Collections: ₹{preview.netCollections.toFixed(2)}
            </span>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="rec-opening">Opening Cash Drawer (₹) <span className="req">*</span></label>
              <input
                id="rec-opening"
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                className="form-control"
                required
              />
            </div>
            <div className="form-group flex-1">
              <label htmlFor="rec-expected">Expected Drawer Cash (₹)</label>
              <input
                id="rec-expected"
                type="text"
                readOnly
                value={`₹${expectedCash.toFixed(2)}`}
                className="form-control read-only-input"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="rec-actual">Physical Cash Count (₹) <span className="req">*</span></label>
            <input
              id="rec-actual"
              type="number"
              step="0.01"
              min="0"
              placeholder="Counted cash in drawer"
              value={actualCash}
              onChange={(e) => setActualCash(e.target.value)}
              className="form-control form-control-lg"
              required
            />
          </div>

          {actualCash !== '' && (
            <div
              className={`discrepancy-card ${
                discrepancy === 0
                  ? 'disc-balanced'
                  : discrepancy > 0
                  ? 'disc-surplus'
                  : 'disc-shortage'
              }`}
            >
              <div className="disc-status-line">
                {discrepancy === 0 ? (
                  <>
                    <CheckCircleIcon size={16} />
                    <span>Drawer is Perfectly Balanced</span>
                  </>
                ) : discrepancy > 0 ? (
                  <>
                    <AlertTriangleIcon size={16} />
                    <span>Cash Surplus (Over by ₹{discrepancy.toFixed(2)})</span>
                  </>
                ) : (
                  <>
                    <AlertTriangleIcon size={16} />
                    <span>Cash Shortage (Short by ₹{Math.abs(discrepancy).toFixed(2)})</span>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="rec-notes">Discrepancy Explanation / Notes</label>
            <textarea
              id="rec-notes"
              rows={2}
              placeholder="Reason for discrepancy or shift handover remarks..."
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
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? 'Saving...' : 'Finalize & Close Day'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

