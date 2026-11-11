// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Invoice Settlement & Export Success Modal Component
// Supports Immediate PDF Download, WhatsApp/Email Sharing, and Digital Preview
// ==============================================================================

import React, { useState } from 'react'
import type { Invoice } from '../../../types/finance.ts'
import { downloadInvoicePdf } from '../../../services/pdfService.ts'
import { InvoiceShareModal } from './InvoiceShareModal.tsx'
import { InvoicePreviewModal } from './InvoicePreviewModal.tsx'
import {
  CheckCircleIcon,
  CloseIcon,
  FileTextIcon,
  PlusIcon,
  ActivityIcon,
  DownloadIcon,
  ShareIcon,
  EyeIcon,
} from '../../../components/Icons.tsx'
import './QuickClientModal.css'

interface InvoiceSuccessModalProps {
  isOpen: boolean
  isDraft: boolean
  invoice: Invoice | null
  draftNumber?: string
  changeAmount?: number
  onClose: () => void
  onNewBill: () => void
  onViewOverview: () => void
}

export const InvoiceSuccessModal: React.FC<InvoiceSuccessModalProps> = ({
  isOpen,
  isDraft,
  invoice,
  draftNumber,
  changeAmount = 0,
  onClose,
  onNewBill,
  onViewOverview,
}) => {
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [downloadSuccessNotice, setDownloadSuccessNotice] = useState<string | null>(null)

  if (!isOpen || !invoice) return null

  const referenceNumber = isDraft ? (draftNumber || invoice.invoiceNumber) : invoice.invoiceNumber
  const status = invoice.status || invoice.paymentStatus || 'paid'
  const isPartiallyPaid = status === 'partially_paid' || status === 'partial'
  const isPaid = status === 'paid'

  const handleDownloadPdf = () => {
    try {
      downloadInvoicePdf(invoice)
      setDownloadSuccessNotice(`Downloaded HairDexirity_${invoice.invoiceNumber}.pdf`)
      setTimeout(() => setDownloadSuccessNotice(null), 3500)
    } catch (err: any) {
      console.warn('PDF download failed:', err)
    }
  }

  return (
    <>
      <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
        <div className="pos-modal-card success-card" onClick={(e) => e.stopPropagation()}>
          <div className="pos-modal-header">
            <div className="modal-header-left">
              <span className={`modal-icon-badge ${isDraft ? 'warning' : 'success'}`}>
                {isDraft ? <FileTextIcon size={20} /> : <CheckCircleIcon size={20} />}
              </span>
              <div>
                <h3 className="modal-title">
                  {isDraft ? 'Draft Invoice Saved' : 'Bill Finalized Successfully'}
                </h3>
                <span className="modal-subtitle">
                  {isDraft ? 'Draft can be resumed anytime from Overview' : 'Payment recorded & financial ledger updated'}
                </span>
              </div>
            </div>
            <button type="button" className="btn-close-modal" onClick={onClose} aria-label="Close dialog">
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="invoice-success-body">
            {/* Main Badge / Big Amount */}
            <div className="invoice-receipt-header">
              <div className="receipt-pill">
                {isDraft ? 'DRAFT BILL' : (isPaid ? 'PAID IN FULL' : (isPartiallyPaid ? 'PARTIALLY PAID' : 'UNPAID'))}
              </div>
              <div className="receipt-ref-code">{referenceNumber}</div>
              <div className="receipt-amount-display">
                <span className="currency">₹</span>
                <span className="amount">{invoice.totalAmount.toFixed(2)}</span>
              </div>
              <div className="receipt-client-name">
                Customer: <strong>{invoice.clientName}</strong>
              </div>
            </div>

            {/* Breakdown Card */}
            <div className="receipt-details-table">
              <div className="receipt-row">
                <span className="label">Subtotal</span>
                <span className="val">₹{invoice.subtotal.toFixed(2)}</span>
              </div>
              {invoice.discountAmount > 0 && (
                <div className="receipt-row discount-row">
                  <span className="label">
                    Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}
                  </span>
                  <span className="val">-₹{invoice.discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="receipt-row">
                <span className="label">
                  GST / Tax {invoice.isGstInvoice ? `(${invoice.taxRate}%)` : '(Non-GST)'}
                </span>
                <span className="val">₹{invoice.taxAmount.toFixed(2)}</span>
              </div>
              <div className="receipt-row total-row">
                <span className="label">Grand Total</span>
                <span className="val">₹{invoice.totalAmount.toFixed(2)}</span>
              </div>
              <div className="receipt-row paid-row">
                <span className="label">
                  Amount Paid ({(invoice.paymentMethod || invoice.primaryPaymentMethod || 'cash').toUpperCase()})
                </span>
                <span className="val highlight">₹{invoice.paidAmount.toFixed(2)}</span>
              </div>
              {invoice.balanceDue > 0 && (
                <div className="receipt-row balance-row">
                  <span className="label">Outstanding Balance Due</span>
                  <span className="val warn">₹{invoice.balanceDue.toFixed(2)}</span>
                </div>
              )}
              {changeAmount > 0 && (
                <div className="receipt-row change-row">
                  <span className="label">Cash Change Returned</span>
                  <span className="val change">₹{changeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Line items mini summary */}
            <div className="receipt-items-summary">
              <div className="summary-title">Billed Items ({invoice.lineItems.length}):</div>
              <div className="summary-chips">
                {invoice.lineItems.map((item, idx) => {
                  const linePrice = item.lineTotal ?? item.totalPrice ?? (item.unitPrice * item.quantity)
                  return (
                    <div key={idx} className="item-chip">
                      <span className="item-name">{item.name || item.description}</span>
                      <span className="item-qty">x{item.quantity}</span>
                      <span className="item-sub">₹{linePrice.toFixed(2)}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {downloadSuccessNotice && (
              <div style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 600, textAlign: 'center', margin: '8px 0' }}>
                ✓ {downloadSuccessNotice}
              </div>
            )}

            {/* Phase 3 Export Actions Bar */}
            <div className="export-actions-row" style={{ display: 'flex', gap: '8px', margin: '14px 0 6px' }}>
              <button
                type="button"
                className="btn-pos-export-pdf"
                onClick={handleDownloadPdf}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#1a1d20',
                  color: '#ffffff',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <DownloadIcon size={15} />
                <span>Download PDF</span>
              </button>

              <button
                type="button"
                className="btn-pos-export-share"
                onClick={() => setIsShareModalOpen(true)}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  background: '#c5a059',
                  color: '#1a1d20',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                <ShareIcon size={15} />
                <span>Share Invoice</span>
              </button>

              <button
                type="button"
                className="btn-pos-export-preview"
                onClick={() => setIsPreviewModalOpen(true)}
                title="Preview digital invoice on screen"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  color: '#334155',
                  cursor: 'pointer',
                }}
              >
                <EyeIcon size={16} />
              </button>
            </div>

            {/* Standard Navigation Actions */}
            <div className="invoice-success-actions">
              <button
                type="button"
                className="btn-pos-action secondary"
                onClick={onViewOverview}
              >
                <ActivityIcon size={16} />
                <span>Billing Overview</span>
              </button>
              <button
                type="button"
                className="btn-pos-action primary"
                onClick={onNewBill}
              >
                <PlusIcon size={16} />
                <span>New Bill</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Sub-Modals */}
      <InvoiceShareModal
        isOpen={isShareModalOpen}
        invoice={invoice}
        onClose={() => setIsShareModalOpen(false)}
        onOpenPreview={() => {
          setIsShareModalOpen(false)
          setIsPreviewModalOpen(true)
        }}
      />

      <InvoicePreviewModal
        isOpen={isPreviewModalOpen}
        invoice={invoice}
        onClose={() => setIsPreviewModalOpen(false)}
        onOpenShareModal={() => {
          setIsPreviewModalOpen(false)
          setIsShareModalOpen(true)
        }}
      />
    </>
  )
}
