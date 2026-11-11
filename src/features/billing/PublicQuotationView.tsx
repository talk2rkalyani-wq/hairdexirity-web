// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Customer-Facing Public Quotation Approval View (`#/public/quotation?token=...`)
// High-Security Token-Validated Digital Estimate with One-Click Customer Approval
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { PublicQuotationData, Quotation } from '../../types/finance.ts'
import { quotationService } from '../../services/quotationService.ts'
import { downloadQuotationPdf } from '../../services/quotationPdfService.ts'
import { formatPdfCurrency } from '../../services/pdfService.ts'
import {
  DownloadIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
  PhoneIcon,
  MailIcon,
  CloseIcon,
  ScissorsIcon,
} from '../../components/Icons.tsx'
import './PublicQuotationView.css'

export const PublicQuotationView: React.FC = () => {
  const [data, setData] = useState<PublicQuotationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [token, setToken] = useState<string>('')

  // Action Modals State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false)
  const [actionType, setActionType] = useState<'accept' | 'reject'>('accept')
  const [customerComment, setCustomerComment] = useState('')
  const [isSubmittingAction, setIsSubmittingAction] = useState(false)
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadPublicQuotation() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        let rawToken = ''
        if (typeof window !== 'undefined') {
          const hash = window.location.hash
          const match = hash.match(/[?&]token=([a-zA-Z0-9_-]+)/)
          if (match && match[1]) {
            rawToken = match[1]
          } else {
            const params = new URLSearchParams(window.location.search)
            rawToken = params.get('token') || ''
          }
        }

        if (!rawToken) {
          throw new Error('This quotation link is missing an access token. Please verify the link received from Hair Dexirity.')
        }

        setToken(rawToken)
        const publicData = await quotationService.fetchPublicQuotation(rawToken)
        setData(publicData)
      } catch (err: any) {
        console.warn('Public quotation load failed:', err)
        if (err.message?.includes('REVOKED')) {
          setErrorMessage('This quotation link has been revoked by the salon. Please contact Hair Dexirity for an updated estimate.')
        } else if (err.message?.includes('EXPIRED') || err.message?.includes('LINK_EXPIRED')) {
          setErrorMessage('This quotation link has expired. Please contact Hair Dexirity to refresh your estimate.')
        } else {
          setErrorMessage('This quotation link is invalid or no longer accessible. Please contact Hair Dexirity.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadPublicQuotation()
  }, [])

  const handleDownloadPdf = () => {
    if (!data) return
    const quoteForPdf: Quotation = {
      id: data.quotation.id,
      salonId: 'salon-luma-01',
      quotationNumber: data.quotation.quotation_number,
      clientName: data.quotation.client_name,
      clientPhone: data.quotation.client_phone,
      clientEmail: data.quotation.client_email,
      isWalkIn: false,
      issueDate: data.quotation.issue_date,
      validUntil: data.quotation.valid_until,
      subtotal: data.quotation.subtotal,
      discountAmount: data.quotation.discount_amount,
      discountType: data.quotation.discount_type,
      taxTreatment: 'exclusive',
      taxRate: data.quotation.tax_rate,
      taxAmount: data.quotation.tax_amount,
      cgstAmount: data.quotation.cgst_amount,
      sgstAmount: data.quotation.sgst_amount,
      totalAmount: data.quotation.total_amount,
      status: data.quotation.status,
      customerNotes: data.quotation.customer_notes,
      termsAndConditions: data.quotation.terms_and_conditions,
      advanceRequired: data.quotation.advance_required,
      version: 1,
      createdAt: data.quotation.issue_date,
      updatedAt: data.quotation.issue_date,
      items: data.line_items.map((li) => ({
        itemType: li.item_type,
        name: li.name,
        description: li.description,
        staffName: li.staff_name,
        quantity: li.quantity,
        unitPrice: li.unit_price,
        discountAmount: li.discount_amount,
        taxableAmount: li.taxable_amount,
        taxRate: li.tax_rate,
        taxAmount: li.tax_amount,
        totalPrice: li.total_price,
        isCustom: li.is_custom,
      })),
    }

    downloadQuotationPdf(quoteForPdf, {
      name: data.salon.name,
      phone: data.salon.phone,
      email: data.salon.email,
      gstin: data.salon.gstin,
    })
  }

  const handleOpenActionModal = (type: 'accept' | 'reject') => {
    setActionType(type)
    setCustomerComment('')
    setIsConfirmModalOpen(true)
  }

  const handleSubmitResponse = async () => {
    if (!token) return
    setIsSubmittingAction(true)
    try {
      const res = await quotationService.respondToQuotation(token, actionType, customerComment)
      setIsConfirmModalOpen(false)
      if (actionType === 'accept') {
        setActionSuccessMessage('Thank you! You have accepted this quotation. The salon team has been notified and will be in touch to finalize your booking.')
      } else {
        setActionSuccessMessage('Thank you for letting us know. Your feedback has been recorded.')
      }
      // Refresh local quote status
      if (data) {
        setData({
          ...data,
          quotation: {
            ...data.quotation,
            status: res.status,
          },
        })
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit response')
    } finally {
      setIsSubmittingAction(false)
    }
  }

  if (isLoading) {
    return (
      <div className="public-quote-loader">
        <div className="spinner-gold" />
        <p>Loading your personalized quotation from Hair Dexirity...</p>
      </div>
    )
  }

  if (errorMessage || !data) {
    return (
      <div className="public-quote-error-view">
        <div className="error-card">
          <AlertTriangleIcon size={44} className="err-icon" />
          <h2>Estimate Unavailable</h2>
          <p>{errorMessage || 'This quotation cannot be displayed.'}</p>
          <div className="error-salon-contacts">
            <p>Need assistance? Contact Hair Dexirity concierge:</p>
            <div className="contacts-pills">
              <a href="tel:+919876543210" className="pill-contact">
                <PhoneIcon size={14} />
                <span>+91 98765 43210</span>
              </a>
              <a href="mailto:contact@hairdexirity.example.com" className="pill-contact">
                <MailIcon size={14} />
                <span>contact@hairdexirity.example.com</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const quote = data.quotation
  const isActionable = quote.status === 'sent' || quote.status === 'viewed'

  return (
    <div className="public-quotation-page">
      {/* Top Header / Branding */}
      <header className="public-quote-topbar">
        <div className="topbar-content">
          <div className="salon-brand-identity">
            <span className="brand-luma">HAIR</span>
            <span className="brand-sub">DEXIRITY</span>
          </div>
          <button type="button" className="btn-topbar-pdf" onClick={handleDownloadPdf}>
            <DownloadIcon size={16} />
            <span>Download Vector PDF</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="public-quote-container">
        {/* Amber "Not A Tax Invoice" Banner */}
        <div className="quote-public-banner">
          <span className="banner-tag">OFFICIAL ESTIMATE</span>
          <span className="banner-sep">•</span>
          <span>QUOTATION — NOT A TAX INVOICE</span>
        </div>

        {actionSuccessMessage && (
          <div className="action-success-alert">
            <CheckCircleIcon size={20} />
            <span>{actionSuccessMessage}</span>
          </div>
        )}

        {/* Status Callout if already resolved */}
        {quote.status === 'accepted' && (
          <div className="status-callout callout-accepted">
            <CheckCircleIcon size={20} />
            <div>
              <strong>Quotation Accepted</strong>
              <p>You have approved this estimate. We look forward to pampering you at Hair Dexirity!</p>
            </div>
          </div>
        )}
        {quote.status === 'rejected' && (
          <div className="status-callout callout-rejected">
            <XCircleIcon size={20} />
            <div>
              <strong>Quotation Declined</strong>
              <p>This quotation was marked as declined. Please contact us if you would like an updated quote.</p>
            </div>
          </div>
        )}
        {quote.status === 'expired' && (
          <div className="status-callout callout-expired">
            <AlertTriangleIcon size={20} />
            <div>
              <strong>Quotation Expired</strong>
              <p>This estimate passed its validity period ({quote.valid_until}). Please contact Hair Dexirity for updated pricing.</p>
            </div>
          </div>
        )}
        {quote.status === 'converted' && (
          <div className="status-callout callout-converted">
            <ScissorsIcon size={20} />
            <div>
              <strong>Converted to Official Invoice</strong>
              <p>This estimate has been transitioned to an active salon appointment & tax invoice.</p>
            </div>
          </div>
        )}

        {/* Quotation Header Card */}
        <div className="public-quote-header-card">
          <div className="quote-card-top">
            <div>
              <span className="quote-number-title">{quote.quotation_number}</span>
              <h1 className="quote-client-name">Prepared for {quote.client_name}</h1>
            </div>
            <div className="quote-totals-badge">
              <span className="totals-label">ESTIMATED TOTAL</span>
              <span className="totals-val">{formatPdfCurrency(quote.total_amount)}</span>
            </div>
          </div>

          <div className="quote-meta-row">
            <div>
              <span className="meta-k">Issue Date:</span>
              <span className="meta-v">{quote.issue_date}</span>
            </div>
            <div>
              <span className="meta-k">Valid Until:</span>
              <span className="meta-v gold">{quote.valid_until}</span>
            </div>
            <div>
              <span className="meta-k">Salon Location:</span>
              <span className="meta-v">{data.salon.name}, {data.salon.address}</span>
            </div>
          </div>
        </div>

        {/* Itemized Services Breakdown Table */}
        <div className="public-items-card">
          <h2 className="items-card-title">Treatment & Service Breakdown</h2>
          <div className="table-responsive">
            <table className="public-items-table">
              <thead>
                <tr>
                  <th>Item / Treatment</th>
                  <th>Stylist</th>
                  <th className="text-center">Qty</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.line_items.map((item, idx) => (
                  <tr key={item.id || idx}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.description && item.description !== item.name && (
                        <div className="item-sub-desc">{item.description}</div>
                      )}
                    </td>
                    <td>{item.staff_name || 'Hair Dexirity Stylist'}</td>
                    <td className="text-center">{item.quantity}</td>
                    <td className="text-right">{formatPdfCurrency(item.unit_price)}</td>
                    <td className="text-right bold gold">{formatPdfCurrency(item.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown */}
          <div className="public-financial-summary">
            <div className="f-summary-row">
              <span>Subtotal:</span>
              <span>{formatPdfCurrency(quote.subtotal)}</span>
            </div>
            {quote.discount_amount > 0 && (
              <div className="f-summary-row text-red">
                <span>Special Courtesy Discount:</span>
                <span>-{formatPdfCurrency(quote.discount_amount)}</span>
              </div>
            )}
            <div className="f-summary-row">
              <span>Estimated GST (18%):</span>
              <span>{formatPdfCurrency(quote.tax_amount)}</span>
            </div>
            <div className="f-summary-row grand-total">
              <span>Total Estimated Investment:</span>
              <span className="gold">{formatPdfCurrency(quote.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* Advance Payment Notice */}
        {quote.advance_required && quote.advance_required > 0 ? (
          <div className="public-advance-box">
            <strong>Advance Deposit Requirement:</strong>
            <p>
              An advance deposit of <strong>{formatPdfCurrency(quote.advance_required)}</strong> is requested upon confirmation to reserve your stylist and bespoke treatment room.
            </p>
          </div>
        ) : null}

        {/* Customer Notes & Terms */}
        <div className="public-notes-terms-grid">
          {quote.customer_notes && (
            <div className="notes-card">
              <h3>Notes for you:</h3>
              <p>{quote.customer_notes}</p>
            </div>
          )}
          {quote.terms_and_conditions && (
            <div className="notes-card">
              <h3>Terms & Salon Policy:</h3>
              <p className="pre-wrap">{quote.terms_and_conditions}</p>
            </div>
          )}
        </div>

        {/* Customer Action Bar (Only visible if quotation is actionable) */}
        {isActionable && (
          <div className="customer-action-bar">
            <div className="action-bar-text">
              <strong>Ready to reserve your appointment?</strong>
              <p>You can securely accept or decline this estimate directly below.</p>
            </div>
            <div className="action-buttons-group">
              <button
                type="button"
                className="btn-customer-reject"
                onClick={() => handleOpenActionModal('reject')}
              >
                <XCircleIcon size={16} />
                <span>Decline Estimate</span>
              </button>
              <button
                type="button"
                className="btn-customer-accept"
                onClick={() => handleOpenActionModal('accept')}
              >
                <CheckCircleIcon size={18} />
                <span>Accept Quotation</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && (
        <div className="luma-modal-overlay" onClick={() => setIsConfirmModalOpen(false)}>
          <div className="customer-decision-modal" onClick={(e) => e.stopPropagation()}>
            <div className="decision-header">
              <h3>{actionType === 'accept' ? 'Accept Quotation' : 'Decline Quotation'}</h3>
              <button type="button" onClick={() => setIsConfirmModalOpen(false)}>
                <CloseIcon size={20} />
              </button>
            </div>

            <div className="decision-body">
              <p>
                {actionType === 'accept'
                  ? `Are you sure you want to approve estimate ${quote.quotation_number} for ${formatPdfCurrency(quote.total_amount)}?`
                  : `Are you sure you want to decline estimate ${quote.quotation_number}?`}
              </p>

              <div className="comment-field-group">
                <label>Optional Comments or Preferred Appointment Times:</label>
                <textarea
                  rows={3}
                  placeholder={
                    actionType === 'accept'
                      ? 'e.g. Saturday afternoon works best for me...'
                      : 'e.g. Budget adjustment requested...'
                  }
                  value={customerComment}
                  onChange={(e) => setCustomerComment(e.target.value)}
                />
              </div>
            </div>

            <div className="decision-footer">
              <button
                type="button"
                className="btn-decision-cancel"
                onClick={() => setIsConfirmModalOpen(false)}
                disabled={isSubmittingAction}
              >
                Cancel
              </button>
              <button
                type="button"
                className={actionType === 'accept' ? 'btn-decision-confirm-accept' : 'btn-decision-confirm-reject'}
                onClick={handleSubmitResponse}
                disabled={isSubmittingAction}
              >
                {isSubmittingAction
                  ? 'Submitting...'
                  : actionType === 'accept'
                  ? 'Confirm Acceptance'
                  : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

