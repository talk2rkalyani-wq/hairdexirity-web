// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Digital Invoice Live Preview Modal Component
// High-Fidelity Responsive On-Screen Invoice Preview with One-Click Actions
// ==============================================================================

import React from 'react'
import type { Invoice } from '../../../types/finance.ts'
import { downloadInvoicePdf } from '../../../services/pdfService.ts'
import {
  CloseIcon,
  DownloadIcon,
  ShareIcon,
  FileTextIcon,
} from '../../../components/Icons.tsx'
import './InvoicePreviewModal.css'

interface InvoicePreviewModalProps {
  isOpen: boolean
  invoice: Invoice | null
  onClose: () => void
  onOpenShareModal?: (invoice: Invoice) => void
}

export const InvoicePreviewModal: React.FC<InvoicePreviewModalProps> = ({
  isOpen,
  invoice,
  onClose,
  onOpenShareModal,
}) => {
  if (!isOpen || !invoice) return null

  const isDraft = Boolean(invoice.isDraft || invoice.paymentStatus === 'draft')
  const status = invoice.status || invoice.paymentStatus || 'paid'
  const isPaid = status === 'paid'
  const isPartiallyPaid = status === 'partially_paid' || status === 'partial'

  const handleDownload = () => {
    downloadInvoicePdf(invoice)
  }

  const handleShare = () => {
    onClose()
    if (onOpenShareModal) {
      onOpenShareModal(invoice)
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pos-modal-card preview-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Top Control Bar */}
        <div className="preview-toolbar">
          <div className="toolbar-left">
            <FileTextIcon size={18} />
            <span className="toolbar-title">Invoice Preview — {invoice.invoiceNumber}</span>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn-toolbar-action download"
              onClick={handleDownload}
              title="Download official PDF"
            >
              <DownloadIcon size={16} />
              <span>Download PDF</span>
            </button>
            {onOpenShareModal && (
              <button
                type="button"
                className="btn-toolbar-action share"
                onClick={handleShare}
                title="Share via WhatsApp, Email or Link"
              >
                <ShareIcon size={16} />
                <span>Share</span>
              </button>
            )}
            <button
              type="button"
              className="btn-close-modal"
              onClick={onClose}
              aria-label="Close invoice preview"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Scrollable Digital Sheet Container */}
        <div className="preview-sheet-scroll">
          <div className="digital-invoice-sheet">
            {/* Top Brand Bar */}
            <div className="sheet-brand-stripe" />

            {/* Header */}
            <div className="sheet-header">
              <div className="salon-brand-col">
                <h1 className="salon-logo-name">HAIR DEXIRITY</h1>
                <span className="salon-tagline">HAUTE COIFFURE &amp; LUXURY BEAUTY LOUNGE</span>
                <p className="salon-address">
                  Level 2, Galleria Market, DLF Phase IV, Gurugram, Haryana 122009<br />
                  Phone: +91 98765 43210 &bull; Email: contact@hairdexirity.example.com<br />
                  GSTIN: 06AAAAA0000A1Z5
                </p>
              </div>

              <div className="invoice-meta-col">
                <div className="invoice-type-pill">
                  {isDraft ? 'DRAFT ESTIMATE' : (invoice.isGstInvoice !== false ? 'TAX INVOICE' : 'COMMERCIAL INVOICE')}
                </div>
                <div className="sheet-inv-number">{invoice.invoiceNumber}</div>
                <div className="sheet-meta-row">
                  <span className="meta-lbl">Date:</span>
                  <span className="meta-val">{invoice.date}</span>
                </div>
                {invoice.appointmentId && (
                  <div className="sheet-meta-row">
                    <span className="meta-lbl">Appointment:</span>
                    <span className="meta-val">{invoice.appointmentId}</span>
                  </div>
                )}
                <div className="sheet-status-badge">
                  <span className={`status-pill ${isDraft ? 'draft' : isPaid ? 'paid' : isPartiallyPaid ? 'partial' : 'unpaid'}`}>
                    {isDraft ? 'DRAFT' : isPaid ? 'PAID IN FULL' : isPartiallyPaid ? 'PARTIALLY PAID' : 'UNPAID'}
                  </span>
                </div>
              </div>
            </div>

            {/* Customer Box */}
            <div className="sheet-customer-box">
              <div className="customer-info-left">
                <span className="box-section-title">BILLED TO / CUSTOMER</span>
                <div className="cust-name">{invoice.clientName}</div>
                <div className="cust-contacts">
                  {invoice.clientPhone && <span>Phone: {invoice.clientPhone}</span>}
                  {invoice.clientEmail && <span>Email: {invoice.clientEmail}</span>}
                  {invoice.walkInGuest && <span>Walk-in Customer</span>}
                </div>
              </div>
              <div className="customer-info-right">
                <span className="box-section-title">PAYMENT TENDER</span>
                <div className="tender-name">
                  {(invoice.paymentMethod || invoice.primaryPaymentMethod || 'cash').toUpperCase()}
                </div>
                {invoice.authorizedBy && (
                  <div className="auth-note">Authorized by: {invoice.authorizedBy}</div>
                )}
              </div>
            </div>

            {/* Line Items Table */}
            <table className="sheet-items-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Description</th>
                  <th>Stylist / Staff</th>
                  <th className="text-right">Qty</th>
                  <th className="text-right">Rate</th>
                  <th className="text-right">Disc</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, idx) => {
                  const qty = Math.max(1, Number(item.quantity) || 1)
                  const unitPrice = Number(item.unitPrice) || 0
                  const disc = Number(item.discountAmount) || 0
                  const tax = Number(item.taxAmount) || 0
                  const total = Number(item.lineTotal ?? item.totalPrice ?? (unitPrice * qty - disc + tax))
                  const staff = item.staffName || invoice.staffName || (item.itemType === 'product' ? 'Retail' : 'Salon Team')

                  return (
                    <tr key={idx}>
                      <td className="col-idx">{idx + 1}</td>
                      <td className="col-desc">
                        <strong>{item.name || item.description}</strong>
                      </td>
                      <td className="col-staff">{staff}</td>
                      <td className="col-qty text-right">{qty}</td>
                      <td className="col-rate text-right">₹{unitPrice.toFixed(2)}</td>
                      <td className="col-disc text-right">{disc > 0 ? `-₹${disc.toFixed(2)}` : '-'}</td>
                      <td className="col-tax text-right">{tax > 0 ? `₹${tax.toFixed(2)}` : '-'}</td>
                      <td className="col-total text-right"><strong>₹{total.toFixed(2)}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Financial Summary */}
            <div className="sheet-financials-container">
              <div className="sheet-left-block">
                <div className="settlement-subheading">Payment Settlement Details</div>
                {invoice.payments && invoice.payments.length > 0 ? (
                  <ul className="tenders-list">
                    {invoice.payments.map((p, idx) => (
                      <li key={idx}>
                        <span className="tender-type">{p.paymentMethod.toUpperCase()}:</span>
                        <span className="tender-amount">₹{Number(p.amount).toFixed(2)}</span>
                        {p.transactionReference && (
                          <span className="tender-ref">(Ref: {p.transactionReference})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="tender-single">
                    Settled via {(invoice.paymentMethod || invoice.primaryPaymentMethod || 'cash').toUpperCase()}: ₹{invoice.paidAmount.toFixed(2)}
                  </p>
                )}

                <div className="sheet-policies">
                  <strong>Terms &amp; Conditions:</strong>
                  <p>
                    1. Services once rendered are non-refundable.<br />
                    2. Unopened products may be exchanged within 7 days.<br />
                    3. Thank you for your visit to Hair Dexirity!
                  </p>
                </div>
              </div>

              <div className="sheet-right-block">
                <div className="calc-row">
                  <span>Subtotal:</span>
                  <span>₹{invoice.subtotal.toFixed(2)}</span>
                </div>
                {invoice.discountAmount > 0 && (
                  <div className="calc-row discount-row">
                    <span>Discount {invoice.discountType === 'percentage' ? `(${invoice.discountValue}%)` : ''}:</span>
                    <span>-₹{invoice.discountAmount.toFixed(2)}</span>
                  </div>
                )}
                {invoice.isGstInvoice !== false && invoice.taxAmount > 0 ? (
                  <>
                    <div className="calc-row">
                      <span>CGST (9.00%):</span>
                      <span>₹{(invoice.cgstAmount || invoice.taxAmount / 2).toFixed(2)}</span>
                    </div>
                    <div className="calc-row">
                      <span>SGST (9.00%):</span>
                      <span>₹{(invoice.sgstAmount || invoice.taxAmount / 2).toFixed(2)}</span>
                    </div>
                  </>
                ) : (
                  <div className="calc-row">
                    <span>Tax (Non-GST):</span>
                    <span>₹0.00</span>
                  </div>
                )}
                <div className="calc-row grand-total-row">
                  <span>Grand Total:</span>
                  <span className="total-gold">₹{invoice.totalAmount.toFixed(2)}</span>
                </div>
                <div className="calc-row paid-row">
                  <span>Amount Paid:</span>
                  <span className="paid-green">₹{invoice.paidAmount.toFixed(2)}</span>
                </div>
                {invoice.balanceDue > 0 ? (
                  <div className="calc-row balance-row">
                    <span>Balance Due:</span>
                    <span className="balance-red">₹{invoice.balanceDue.toFixed(2)}</span>
                  </div>
                ) : (
                  <div className="calc-row balance-row zero">
                    <span>Balance Due:</span>
                    <span>₹0.00 (Settled)</span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sheet-footer">
              <small>Hair Dexirity Business Suite &bull; Official Digital Commercial Invoice</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

