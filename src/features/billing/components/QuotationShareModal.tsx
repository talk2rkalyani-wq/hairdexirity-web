// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Quotation Sharing & Link Management Modal Component
// Supports Vector PDF Download, WhatsApp, Email, Link Copying & Revocation
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import type { Quotation } from '../../../types/finance.ts'
import { quotationService } from '../../../services/quotationService.ts'
import { downloadQuotationPdf } from '../../../services/quotationPdfService.ts'
import { formatIndianPhoneNumber } from '../../../services/invoiceShareService.ts'
import {
  CloseIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
  AlertTriangleIcon,
} from '../../../components/Icons.tsx'
import './QuotationShareModal.css'

interface QuotationShareModalProps {
  isOpen: boolean
  quotation: Quotation | null
  onClose: () => void
  onQuotationUpdated?: () => void
}

export const QuotationShareModal: React.FC<QuotationShareModalProps> = ({
  isOpen,
  quotation,
  onClose,
  onQuotationUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'whatsapp' | 'email' | 'revoke'>('link')
  const [shareUrl, setShareUrl] = useState<string>('')
  const [shareId, setShareId] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const [phoneInput, setPhoneInput] = useState<string>('')
  const [emailInput, setEmailInput] = useState<string>('')

  const initOrGenerateLink = useCallback(async () => {
    if (!quotation) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await quotationService.createShareLink(quotation.id, 14, quotation.salonId)
      setShareUrl(res.shareUrl)
      setShareId(res.shareId)
      setExpiresAt(res.expiresAt)
      onQuotationUpdated?.()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate quotation sharing link')
    } finally {
      setIsLoading(false)
    }
  }, [quotation, onQuotationUpdated])

  useEffect(() => {
    if (isOpen && quotation) {
      setPhoneInput(quotation.clientPhone || '')
      setEmailInput(quotation.clientEmail || '')
      void initOrGenerateLink()
    } else {
      setShareUrl('')
      setShareId('')
      setExpiresAt('')
      setErrorMessage(null)
      setSuccessMessage(null)
      setIsCopied(false)
      setActiveTab('link')
    }
  }, [isOpen, quotation, initOrGenerateLink])

  if (!isOpen || !quotation) return null

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2500)
    } catch {
      setErrorMessage('Could not copy link to clipboard automatically')
    }
  }

  const handleDownloadPdf = () => {
    downloadQuotationPdf(quotation)
  }

  const handleRevoke = async () => {
    if (!shareId) return
    setIsLoading(true)
    setErrorMessage(null)
    try {
      await quotationService.revokeShareLink(shareId)
      setSuccessMessage('This quotation link has been successfully revoked.')
      setShareUrl('')
      setShareId('')
      onQuotationUpdated?.()
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to revoke link')
    } finally {
      setIsLoading(false)
    }
  }

  // WhatsApp prefill
  const waMessage = shareUrl ? quotationService.generateWhatsAppMessage(quotation, shareUrl) : ''
  const phoneValidation = formatIndianPhoneNumber(phoneInput)
  const waHref = phoneValidation.isValid
    ? `https://wa.me/${phoneValidation.formatted}?text=${encodeURIComponent(waMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(waMessage)}`

  // Email prefill
  const emailData = shareUrl ? quotationService.generateEmailMessage(quotation, shareUrl) : { subject: '', body: '' }
  const mailtoHref = `mailto:${encodeURIComponent(emailInput)}?subject=${encodeURIComponent(
    emailData.subject
  )}&body=${encodeURIComponent(emailData.body)}`

  return (
    <div className="luma-modal-overlay" onClick={onClose}>
      <div className="luma-share-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <div>
            <h2 className="share-modal-title">Share Quotation & Estimate</h2>
            <p className="share-modal-subtitle">
              {quotation.quotationNumber} — {quotation.clientName} (₹{quotation.totalAmount.toLocaleString('en-IN')})
            </p>
          </div>
          <button type="button" className="share-close-btn" onClick={onClose} aria-label="Close modal">
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Status Alerts */}
        {errorMessage && (
          <div className="share-alert alert-error">
            <AlertTriangleIcon size={16} />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="share-alert alert-success">
            <CheckIcon size={16} />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="share-tabs-nav">
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            <CopyIcon size={16} />
            <span>Secure Link</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
          >
            <PhoneIcon size={16} />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            <MailIcon size={16} />
            <span>Email</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'revoke' ? 'active' : ''}`}
            onClick={() => setActiveTab('revoke')}
          >
            <AlertTriangleIcon size={16} />
            <span>Manage Link</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="share-tab-body">
          {activeTab === 'link' && (
            <div className="tab-pane">
              <p className="tab-desc">
                Generate a high-security CSPRNG token link allowing the client to review the estimate, see stylist details, and accept or decline online.
              </p>
              <div className="link-copy-box">
                <input
                  type="text"
                  readOnly
                  className="link-input"
                  value={isLoading ? 'Generating secure link...' : shareUrl || 'No active link generated'}
                />
                <button
                  type="button"
                  className="link-copy-btn"
                  onClick={handleCopy}
                  disabled={!shareUrl || isLoading}
                >
                  {isCopied ? (
                    <>
                      <CheckIcon size={16} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon size={16} />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
              {expiresAt && (
                <div className="link-meta-text">
                  Expires on: <strong>{new Date(expiresAt).toLocaleDateString()}</strong> (Auto-expires after 14 days)
                </div>
              )}
            </div>
          )}

          {activeTab === 'whatsapp' && (
            <div className="tab-pane">
              <div className="form-field-group">
                <label className="field-label">Recipient Mobile Number</label>
                <input
                  type="tel"
                  className="field-input"
                  placeholder="e.g. 9876543210"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                />
                <span className="field-helper">
                  {phoneValidation.isValid
                    ? `Prefilling for international number +${phoneValidation.formatted}`
                    : 'Enter 10-digit mobile number for WhatsApp redirect'}
                </span>
              </div>
              <div className="message-preview-box">
                <div className="message-preview-header">Message Preview:</div>
                <pre className="message-preview-text">{waMessage}</pre>
              </div>
              <div className="tab-actions-row">
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-whatsapp-open"
                >
                  <PhoneIcon size={16} />
                  <span>Open WhatsApp Web / App</span>
                </a>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <div className="tab-pane">
              <div className="form-field-group">
                <label className="field-label">Recipient Email Address</label>
                <input
                  type="email"
                  className="field-input"
                  placeholder="client@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                />
              </div>
              <div className="form-field-group">
                <label className="field-label">Subject</label>
                <input type="text" readOnly className="field-input" value={emailData.subject} />
              </div>
              <div className="message-preview-box">
                <div className="message-preview-header">Email Body Preview:</div>
                <pre className="message-preview-text">{emailData.body}</pre>
              </div>
              <div className="tab-actions-row">
                <a href={mailtoHref} className="btn-email-open">
                  <MailIcon size={16} />
                  <span>Open Default Email Client</span>
                </a>
              </div>
            </div>
          )}

          {activeTab === 'revoke' && (
            <div className="tab-pane">
              <p className="tab-desc">
                If this link was sent in error or needs to be invalidated, you can revoke it immediately. Anyone clicking the link will receive a revocation notice.
              </p>
              {shareUrl ? (
                <div className="revoke-confirmation-box">
                  <div className="revoke-warning">
                    <AlertTriangleIcon size={20} />
                    <div>
                      <strong>Active Link:</strong>
                      <p className="truncate-text">{shareUrl}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-revoke-danger"
                    onClick={handleRevoke}
                    disabled={isLoading}
                  >
                    Revoke This Sharing Link
                  </button>
                </div>
              ) : (
                <div className="no-active-link-msg">
                  There is currently no active sharing link for this quotation.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="share-modal-footer">
          <button type="button" className="btn-secondary-pdf" onClick={handleDownloadPdf}>
            <DownloadIcon size={16} />
            <span>Download Vector PDF</span>
          </button>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

