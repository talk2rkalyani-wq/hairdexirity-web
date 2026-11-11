// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Payment Reminder Modal Component (WhatsApp & Email Prefill)
// ==============================================================================

import React, { useState } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { CloseIcon, AlertTriangleIcon, CheckCircleIcon, ShareIcon, MailIcon } from '../../../components/Icons.tsx'
import './PaymentReminderModal.css'

interface PaymentReminderModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  invoice: {
    id: string
    invoiceNumber: string
    clientName: string
    clientId?: string
    clientPhone?: string
    clientEmail?: string
    balanceDue: number
  } | null
}

export const PaymentReminderModal: React.FC<PaymentReminderModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  invoice,
}) => {
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp')
  const [recipientContact, setRecipientContact] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  React.useEffect(() => {
    if (isOpen && invoice) {
      if (channel === 'whatsapp') {
        setRecipientContact(invoice.clientPhone || '')
      } else {
        setRecipientContact(invoice.clientEmail || '')
      }
      setStatusMessage(null)
      setError(null)
    }
  }, [isOpen, invoice, channel])

  if (!isOpen || !invoice) return null

  const handleSendReminder = async () => {
    setError(null)
    setStatusMessage(null)

    if (!recipientContact.trim()) {
      setError(`Please specify a valid recipient ${channel === 'whatsapp' ? 'phone number' : 'email address'}.`)
      return
    }

    try {
      setIsSubmitting(true)

      // Record reminder in database
      await customerLedgerService.recordPaymentReminder({
        invoiceId: invoice.id,
        clientId: invoice.clientId,
        channel,
        recipientContact: recipientContact.trim(),
        balanceDue: invoice.balanceDue,
      })

      // Generate action link
      if (channel === 'whatsapp') {
        const waUrl = customerLedgerService.buildWhatsAppReminderUrl({
          phone: recipientContact.trim(),
          clientName: invoice.clientName,
          invoiceNumber: invoice.invoiceNumber,
          balanceDue: invoice.balanceDue,
          salonName: 'Hair Dexirity',
        })
        window.open(waUrl, '_blank', 'noopener,noreferrer')
      } else {
        const mailUrl = customerLedgerService.buildEmailReminderMailto({
          email: recipientContact.trim(),
          clientName: invoice.clientName,
          invoiceNumber: invoice.invoiceNumber,
          balanceDue: invoice.balanceDue,
          salonName: 'Hair Dexirity',
        })
        window.location.href = mailUrl
      }

      setStatusMessage('Payment reminder link prepared and recorded successfully.')
      setIsSubmitting(false)
      onSuccess()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to dispatch payment reminder')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="reminder-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Send Payment Reminder</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="modal-form">
          {error && (
            <div className="modal-alert modal-alert-danger">
              <AlertTriangleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          {statusMessage && (
            <div className="modal-alert modal-alert-success">
              <CheckCircleIcon size={16} />
              <span>{statusMessage}</span>
            </div>
          )}

          <div className="reminder-invoice-info">
            <div className="info-row">
              <span className="info-label">Invoice:</span>
              <span className="info-val">#{invoice.invoiceNumber}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Customer:</span>
              <span className="info-val">{invoice.clientName}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Outstanding Balance:</span>
              <span className="info-val text-due">₹{invoice.balanceDue.toFixed(2)}</span>
            </div>
          </div>

          <div className="channel-tabs">
            <button
              type="button"
              className={`channel-tab-btn ${channel === 'whatsapp' ? 'active' : ''}`}
              onClick={() => {
                setChannel('whatsapp')
                setRecipientContact(invoice.clientPhone || '')
              }}
            >
              <ShareIcon size={16} /> WhatsApp
            </button>
            <button
              type="button"
              className={`channel-tab-btn ${channel === 'email' ? 'active' : ''}`}
              onClick={() => {
                setChannel('email')
                setRecipientContact(invoice.clientEmail || '')
              }}
            >
              <MailIcon size={16} /> Email
            </button>
          </div>

          <div className="form-group">
            <label htmlFor="rem-recipient">
              {channel === 'whatsapp' ? 'WhatsApp Phone Number' : 'Recipient Email Address'}{' '}
              <span className="req">*</span>
            </label>
            <input
              id="rem-recipient"
              type={channel === 'whatsapp' ? 'tel' : 'email'}
              placeholder={channel === 'whatsapp' ? '+91 98765 43210' : 'client@example.com'}
              value={recipientContact}
              onChange={(e) => setRecipientContact(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="reminder-preview-box">
            <span className="preview-label">Message Preview:</span>
            <p className="preview-text">
              {channel === 'whatsapp' ? (
                <>
                  Dear {invoice.clientName}, greetings from Hair Dexirity! This is a gentle reminder regarding Invoice #{invoice.invoiceNumber} with an outstanding balance of *₹{invoice.balanceDue.toFixed(2)}*. Kindly settle at your earliest convenience.
                </>
              ) : (
                <>
                  Subject: Payment Reminder: Invoice #{invoice.invoiceNumber} - Hair Dexirity<br /><br />
                  Dear {invoice.clientName}, this is a reminder regarding the outstanding balance of ₹{invoice.balanceDue.toFixed(2)} for invoice #{invoice.invoiceNumber}. Thank you for choosing Hair Dexirity!
                </>
              )}
            </p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSendReminder}
              disabled={isSubmitting}
            >
              {channel === 'whatsapp' ? 'Open in WhatsApp' : 'Open in Mail Client'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

