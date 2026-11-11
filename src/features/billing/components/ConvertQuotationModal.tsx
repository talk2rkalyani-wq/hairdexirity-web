// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Quotation to POS Invoice Conversion Modal
// Atomic, Idempotent Transition from Accepted Estimate to Official Invoice
// ==============================================================================

import React, { useState } from 'react'
import type { Quotation } from '../../../types/finance.ts'
import { quotationService } from '../../../services/quotationService.ts'
import { formatPdfCurrency } from '../../../services/pdfService.ts'
import {
  CloseIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  ScissorsIcon,
} from '../../../components/Icons.tsx'
import './ConvertQuotationModal.css'

interface ConvertQuotationModalProps {
  isOpen: boolean
  quotation: Quotation | null
  onClose: () => void
  onSuccess: (invoiceId: string, invoiceNumber: string) => void
}

export const ConvertQuotationModal: React.FC<ConvertQuotationModalProps> = ({
  isOpen,
  quotation,
  onClose,
  onSuccess,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [conversionResult, setConversionResult] = useState<{
    invoiceId: string
    invoiceNumber: string
    totalAmount: number
  } | null>(null)

  if (!isOpen || !quotation) return null

  const handleConvert = async () => {
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const res = await quotationService.convertToInvoice(quotation.id, quotation.salonId)
      setConversionResult(res)
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to convert quotation to invoice')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProceedToInvoice = () => {
    if (conversionResult) {
      onSuccess(conversionResult.invoiceId, conversionResult.invoiceNumber)
    }
  }

  return (
    <div className="luma-modal-overlay" onClick={onClose}>
      <div className="convert-quote-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="convert-modal-header">
          <div>
            <h2 className="convert-modal-title">Convert Quotation to Invoice</h2>
            <p className="convert-modal-subtitle">
              Quotation {quotation.quotationNumber} — Status: {quotation.status.toUpperCase()}
            </p>
          </div>
          <button type="button" className="convert-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={20} />
          </button>
        </div>

        {errorMessage && (
          <div className="convert-alert alert-error">
            <AlertTriangleIcon size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        <div className="convert-modal-body">
          {conversionResult ? (
            <div className="conversion-success-view">
              <div className="success-icon-badge">
                <CheckCircleIcon size={36} />
              </div>
              <h3 className="success-title">Quotation Converted Successfully!</h3>
              <p className="success-desc">
                An official tax invoice has been generated with all stored price, stylist, and GST snapshots.
              </p>

              <div className="success-invoice-box">
                <div className="success-row">
                  <span className="success-label">New Official Invoice:</span>
                  <span className="success-val gold">{conversionResult.invoiceNumber}</span>
                </div>
                <div className="success-row">
                  <span className="success-label">Client Name:</span>
                  <span className="success-val">{quotation.clientName}</span>
                </div>
                <div className="success-row">
                  <span className="success-label">Amount Payable:</span>
                  <span className="success-val">{formatPdfCurrency(conversionResult.totalAmount)}</span>
                </div>
                <div className="success-row">
                  <span className="success-label">Payment Status:</span>
                  <span className="status-pill-unpaid">UNPAID (Ready for POS Payment)</span>
                </div>
              </div>

              <div className="success-actions">
                <button
                  type="button"
                  className="btn-proceed-billing"
                  onClick={handleProceedToInvoice}
                >
                  <span>Go to Invoices / Collect Payment</span>
                  <ScissorsIcon size={16} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="convert-summary-card">
                <div className="summary-col">
                  <span className="summary-label">Client Name</span>
                  <span className="summary-value">{quotation.clientName}</span>
                  {quotation.clientPhone && <span className="summary-sub">{quotation.clientPhone}</span>}
                </div>
                <div className="summary-col">
                  <span className="summary-label">Items Count</span>
                  <span className="summary-value">{quotation.items?.length || 0} line items</span>
                </div>
                <div className="summary-col">
                  <span className="summary-label">Total Amount</span>
                  <span className="summary-value gold">{formatPdfCurrency(quotation.totalAmount)}</span>
                </div>
              </div>

              <div className="convert-notice-box">
                <h4 className="notice-title">Financial & Invoicing Invariants:</h4>
                <ul className="notice-list">
                  <li>
                    A sequential tax invoice number (<code>INV-YYYY-XXXX</code>) will be generated.
                  </li>
                  <li>
                    All pricing, stylist attributions, discounts, and GST rates from the quotation are copied as permanent snapshots.
                  </li>
                  <li>
                    The invoice will be placed in <strong>Unpaid</strong> status. Zero fake payments are recorded, and no customer advances are altered.
                  </li>
                  <li>
                    Front desk receptionists can immediately collect payment via Cash, UPI, Card, or Split Tender at the POS.
                  </li>
                  <li>
                    This quotation will transition to <strong>Converted</strong> and remain permanently linked.
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {!conversionResult && (
          <div className="convert-modal-footer">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-confirm-convert"
              onClick={handleConvert}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Converting...' : 'Confirm & Convert to Invoice'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
