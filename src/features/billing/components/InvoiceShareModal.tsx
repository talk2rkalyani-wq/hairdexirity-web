// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Invoice Sharing & Link Management Modal Component
// Supports PDF Download, WhatsApp, Email, Link Copying & Revocation
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import type { Invoice, InvoiceShare } from '../../../types/finance.ts'
import {
  invoiceShareService,
  formatIndianPhoneNumber,
} from '../../../services/invoiceShareService.ts'
import { downloadInvoicePdf } from '../../../services/pdfService.ts'
import {
  CloseIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
  EyeIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from '../../../components/Icons.tsx'
import './InvoiceShareModal.css'

interface InvoiceShareModalProps {
  isOpen: boolean
  invoice: Invoice | null
  userRole?: string
  onClose: () => void
  onOpenPreview?: (invoice: Invoice) => void
}

export const InvoiceShareModal: React.FC<InvoiceShareModalProps> = ({
  isOpen,
  invoice,
  userRole: _userRole = 'RECEPTIONIST',
  onClose,
  onOpenPreview,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'whatsapp' | 'email' | 'manage'>('link')
  const [shareUrl, setShareUrl] = useState<string>('')
  const [shareId, setShareId] = useState<string>('')
  const [expiresAt, setExpiresAt] = useState<string>('')
  const [isLoadingLink, setIsLoadingLink] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // WhatsApp state
  const [phoneInput, setPhoneInput] = useState<string>('')
  // Email state
  const [emailInput, setEmailInput] = useState<string>('')

  // Historic shares for link management tab
  const [sharesHistory, setSharesHistory] = useState<InvoiceShare[]>([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)

  // Initialize or fetch existing active share link when modal opens
  const initializeShareLink = useCallback(async (inv: Invoice, forceNew = false) => {
    setIsLoadingLink(true)
    setErrorMessage(null)
    try {
      if (!forceNew) {
        // Try fetching active shares first
        const existing = await invoiceShareService.listSharesForInvoice(inv.id)
        const active = existing.find((s) => s.isActive && new Date(s.expiresAt).getTime() > Date.now())
        if (active) {
          // If active share exists, create fresh link to keep raw token safe
          setShareId(active.id)
          setExpiresAt(active.expiresAt)
        }
      }

      // Generate a new secure link
      const res = await invoiceShareService.createShareLink(inv, 7)
      if (res.success) {
        setShareUrl(res.shareUrl)
        setShareId(res.shareId)
        setExpiresAt(res.expiresAt)
      }
    } catch (err: any) {
      setErrorMessage(`Failed to create secure sharing link: ${err.message}`)
    } finally {
      setIsLoadingLink(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen && invoice) {
      setPhoneInput(invoice.clientPhone || '')
      setEmailInput(invoice.clientEmail || '')
      setIsCopied(false)
      setErrorMessage(null)
      setSuccessMessage(null)
      void initializeShareLink(invoice)
    }
  }, [isOpen, invoice, initializeShareLink])

  const loadHistory = useCallback(async () => {
    if (!invoice) return
    setIsLoadingHistory(true)
    try {
      const history = await invoiceShareService.listSharesForInvoice(invoice.id)
      setSharesHistory(history)
    } catch (err: any) {
      console.warn('Failed loading shares history:', err)
    } finally {
      setIsLoadingHistory(false)
    }
  }, [invoice])

  useEffect(() => {
    if (activeTab === 'manage' && invoice) {
      void loadHistory()
    }
  }, [activeTab, invoice, loadHistory])

  if (!isOpen || !invoice) return null

  // 1. Download PDF Action
  const handleDownloadPdf = () => {
    try {
      downloadInvoicePdf(invoice)
      setSuccessMessage(`Invoice PDF downloaded: HairDexirity_${invoice.invoiceNumber}.pdf`)
      setTimeout(() => setSuccessMessage(null), 4000)
    } catch (err: any) {
      setErrorMessage(`Failed to generate PDF: ${err.message}`)
    }
  }

  // 2. Copy Link Action
  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const input = document.createElement('input')
        input.value = shareUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
      }
      setIsCopied(true)
      setSuccessMessage('Secure invoice link copied to clipboard!')
      setTimeout(() => {
        setIsCopied(false)
        setSuccessMessage(null)
      }, 3500)
    } catch {
      setErrorMessage('Could not copy link automatically. Please select and copy manually.')
    }
  }

  // 3. WhatsApp Share Action
  const whatsAppShareData = invoiceShareService.generateWhatsAppShare(
    invoice,
    shareUrl,
    phoneInput
  )

  const handleOpenWhatsApp = () => {
    if (!shareUrl) return
    window.open(whatsAppShareData.url, '_blank', 'noopener,noreferrer')
  }

  // 4. Email Share Action
  const emailShareData = invoiceShareService.generateEmailShare(
    invoice,
    shareUrl,
    emailInput
  )

  const handleOpenEmail = () => {
    if (!shareUrl) return
    window.location.href = emailShareData.mailtoUrl
  }

  // 5. Revoke Link Action (Owner / Receptionist)
  const handleRevokeLink = async (targetShareId: string) => {
    if (!confirm('Are you sure you want to revoke this link? Anyone with the link will lose access immediately.')) {
      return
    }
    try {
      const ok = await invoiceShareService.revokeShareLink(targetShareId)
      if (ok) {
        setSuccessMessage('Invoice share link revoked successfully.')
        if (targetShareId === shareId) {
          setShareUrl('')
          setShareId('')
        }
        await loadHistory()
      } else {
        setErrorMessage('Failed to revoke link.')
      }
    } catch (err: any) {
      setErrorMessage(`Revocation error: ${err.message}`)
    }
  }

  // 6. Generate Replacement Link Action
  const handleGenerateReplacement = async () => {
    await initializeShareLink(invoice, true)
    setSuccessMessage('New replacement link generated! Previous link was invalidated.')
    if (activeTab === 'manage') {
      await loadHistory()
    }
  }

  const { isValid: isPhoneValid } = formatIndianPhoneNumber(phoneInput)

  return (
    <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pos-modal-card share-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="share-modal-header">
          <div className="header-meta">
            <h3 className="modal-title">Share &amp; Export Invoice</h3>
            <span className="invoice-meta-sub">
              <strong>{invoice.invoiceNumber}</strong> &bull; {invoice.clientName} &bull; ₹{invoice.totalAmount.toFixed(2)}
            </span>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Close dialog">
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Status Messages */}
        {successMessage && (
          <div className="share-alert success-alert" role="status">
            <CheckIcon size={16} />
            <span>{successMessage}</span>
          </div>
        )}
        {errorMessage && (
          <div className="share-alert error-alert" role="alert">
            <AlertTriangleIcon size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="share-tabs-nav">
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'link' ? 'active' : ''}`}
            onClick={() => setActiveTab('link')}
          >
            <CopyIcon size={15} />
            <span>Secure Link</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'whatsapp' ? 'active' : ''}`}
            onClick={() => setActiveTab('whatsapp')}
          >
            <PhoneIcon size={15} />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'email' ? 'active' : ''}`}
            onClick={() => setActiveTab('email')}
          >
            <MailIcon size={15} />
            <span>Email</span>
          </button>
          <button
            type="button"
            className={`share-tab-btn ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            <RefreshCwIcon size={15} />
            <span>Link Controls</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="share-modal-content">
          {/* TAB 1: SECURE LINK & PDF DOWNLOAD */}
          {activeTab === 'link' && (
            <div className="tab-pane link-tab-pane">
              <div className="quick-actions-bar">
                <button
                  type="button"
                  className="btn-download-pdf-hero"
                  onClick={handleDownloadPdf}
                  title="Download vector PDF invoice"
                >
                  <DownloadIcon size={18} />
                  <span>Download Official PDF</span>
                </button>
                {onOpenPreview && (
                  <button
                    type="button"
                    className="btn-preview-hero"
                    onClick={() => {
                      onClose()
                      onOpenPreview(invoice)
                    }}
                    title="View visual digital invoice"
                  >
                    <EyeIcon size={16} />
                    <span>Live Preview</span>
                  </button>
                )}
              </div>

              <div className="link-box-container">
                <label className="link-input-label">Public Customer Invoice Link:</label>
                <div className="link-input-group">
                  <input
                    type="text"
                    readOnly
                    value={isLoadingLink ? 'Generating secure cryptographic link...' : shareUrl}
                    className="link-input-field"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    type="button"
                    className={`btn-copy-link ${isCopied ? 'copied' : ''}`}
                    onClick={handleCopyLink}
                    disabled={isLoadingLink || !shareUrl}
                  >
                    {isCopied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                    <span>{isCopied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div className="link-security-note">
                  <small>
                    🔒 <strong>Cryptographically Secure:</strong> Powered by a 256-bit CSPRNG bearer token.
                    Only the SHA-256 hash is recorded in the database.
                    {expiresAt && (
                      <> Expires on <strong>{new Date(expiresAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>.</>
                    )}
                  </small>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WHATSAPP SHARING */}
          {activeTab === 'whatsapp' && (
            <div className="tab-pane whatsapp-tab-pane">
              <div className="form-group-row">
                <label htmlFor="wa-phone-input">Customer Phone Number:</label>
                <div className="phone-input-wrap">
                  <input
                    id="wa-phone-input"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="input-text-standard"
                  />
                  {phoneInput && !isPhoneValid && (
                    <span className="input-hint warn">Format: 10-digit Indian mobile number</span>
                  )}
                </div>
              </div>

              <div className="message-preview-container">
                <label className="preview-label">Prefilled Message Preview:</label>
                <div className="message-bubble whatsapp-bubble">
                  <pre>{whatsAppShareData.message}</pre>
                </div>
              </div>

              <div className="share-actions-row">
                <button
                  type="button"
                  className="btn-share-channel whatsapp"
                  onClick={handleOpenWhatsApp}
                  disabled={!shareUrl}
                >
                  <PhoneIcon size={16} />
                  <span>Open in WhatsApp</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: EMAIL SHARING */}
          {activeTab === 'email' && (
            <div className="tab-pane email-tab-pane">
              <div className="form-group-row">
                <label htmlFor="email-input">Customer Email Address:</label>
                <input
                  id="email-input"
                  type="email"
                  placeholder="e.g. customer@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="input-text-standard"
                />
              </div>

              <div className="message-preview-container">
                <label className="preview-label">Subject: {emailShareData.subject}</label>
                <div className="message-bubble email-bubble">
                  <pre>{emailShareData.body}</pre>
                </div>
              </div>

              <div className="share-actions-row">
                <button
                  type="button"
                  className="btn-share-channel email"
                  onClick={handleOpenEmail}
                  disabled={!shareUrl}
                >
                  <MailIcon size={16} />
                  <span>Open in Email App</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: LINK CONTROLS & REVOCATION */}
          {activeTab === 'manage' && (
            <div className="tab-pane manage-tab-pane">
              <div className="manage-header-actions">
                <div>
                  <h4 className="manage-section-title">Active &amp; Historic Sharing Links</h4>
                  <p className="manage-sub">
                    Revoking a link immediately blocks all public customer access.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary-action"
                  onClick={handleGenerateReplacement}
                >
                  <RefreshCwIcon size={14} />
                  <span>Generate New Link</span>
                </button>
              </div>

              {isLoadingHistory ? (
                <div className="loading-history-spinner">Loading links history...</div>
              ) : sharesHistory.length === 0 ? (
                <div className="empty-history-box">
                  <p>No share links recorded for this invoice yet.</p>
                </div>
              ) : (
                <div className="shares-table-wrap">
                  <table className="shares-table">
                    <thead>
                      <tr>
                        <th>Created</th>
                        <th>Expires</th>
                        <th>Views</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharesHistory.map((s) => {
                        const isExpired = new Date(s.expiresAt).getTime() < Date.now()
                        const isRevoked = Boolean(s.revokedAt)
                        const isActive = !isRevoked && !isExpired

                        return (
                          <tr key={s.id}>
                            <td>{new Date(s.createdAt).toLocaleDateString('en-IN')}</td>
                            <td>{new Date(s.expiresAt).toLocaleDateString('en-IN')}</td>
                            <td>{s.accessCount || 0}</td>
                            <td>
                              <span className={`share-status-pill ${isActive ? 'active' : isRevoked ? 'revoked' : 'expired'}`}>
                                {isRevoked ? 'REVOKED' : isExpired ? 'EXPIRED' : 'ACTIVE'}
                              </span>
                            </td>
                            <td>
                              {isActive ? (
                                <button
                                  type="button"
                                  className="btn-revoke-share"
                                  onClick={() => handleRevokeLink(s.id)}
                                  title="Revoke link immediately"
                                >
                                  Revoke
                                </button>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="share-modal-footer">
          <button type="button" className="btn-done" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
