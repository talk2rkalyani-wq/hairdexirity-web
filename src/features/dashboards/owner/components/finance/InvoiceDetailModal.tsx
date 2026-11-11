// ==============================================================================
// Luma Salon — Invoice & Tax Receipt Detail Modal (Phase 7)
// Printable Salon Tax Invoice with Line Items, GST & Multi-Tender Records
// ==============================================================================

import React, { useEffect } from 'react'
import type { Invoice } from '../../../../../types/finance.ts'
import { formatCurrency, formatDate } from '../../../../../utils/formatters.ts'
import { CloseIcon, CheckCircleIcon, ScissorsIcon } from '../../../../../components/Icons.tsx'

interface InvoiceDetailModalProps {
  invoice: Invoice | null
  onClose: () => void
}

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!invoice) return null

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print()
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="inv-status-pill paid">PAID IN FULL</span>
      case 'partial':
        return <span className="inv-status-pill partial">PARTIALLY PAID</span>
      case 'unpaid':
        return <span className="inv-status-pill unpaid">UNPAID</span>
      case 'refunded':
        return <span className="inv-status-pill refunded">REFUNDED</span>
      default:
        return <span className="inv-status-pill">{status.toUpperCase()}</span>
    }
  }

  return (
    <div className="invoice-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="invoice-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Top Control Bar */}
        <div className="invoice-top-bar">
          <div className="top-bar-left">
            <span className="receipt-kicker">TAX INVOICE & RECEIPT</span>
            <span className="invoice-seq-pill">{invoice.invoiceNumber}</span>
          </div>
          <div className="top-bar-actions">
            <button
              type="button"
              className="btn-print-receipt"
              onClick={handlePrint}
              title="Print or Save PDF"
            >
              <span>🖨️ Print Receipt</span>
            </button>
            <button
              type="button"
              className="btn-close-modal"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Printable Invoice Document Body */}
        <div className="printable-invoice-body">
          {/* Salon Header Branding */}
          <div className="salon-brand-header">
            <div className="brand-col">
              <div className="salon-brand-name">
                <ScissorsIcon size={20} className="brand-scissors" />
                <span>HAIR DEXIRITY</span>
              </div>
              <span className="salon-brand-tagline">Luxury Hair & Beauty Sanctuary</span>
              <span className="salon-brand-address">
                Level 2, Galleria Market, DLF Phase IV, Gurugram, Haryana 122009
              </span>
              <span className="salon-gstin">GSTIN: 06AAAPL1234M1Z9</span>
            </div>

            <div className="invoice-meta-col">
              <div className="meta-row">
                <span className="meta-lbl">Invoice #:</span>
                <span className="meta-val bold">{invoice.invoiceNumber}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Date:</span>
                <span className="meta-val">{formatDate(invoice.date)}</span>
              </div>
              <div className="meta-row">
                <span className="meta-lbl">Time:</span>
                <span className="meta-val">
                  {new Date(invoice.createdAt).toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </span>
              </div>
              <div className="meta-row status-row">{getStatusBadge(invoice.paymentStatus)}</div>
            </div>
          </div>

          <div className="doc-divider" />

          {/* Client & Staff Info Columns */}
          <div className="bill-to-section">
            <div className="bill-party-col">
              <span className="party-title">BILLED TO:</span>
              <span className="party-name">{invoice.clientName}</span>
              {invoice.clientPhone && <span className="party-sub">Phone: {invoice.clientPhone}</span>}
              {invoice.clientEmail && <span className="party-sub">Email: {invoice.clientEmail}</span>}
            </div>

            <div className="bill-party-col">
              <span className="party-title">SERVICED BY:</span>
              <span className="party-name">{invoice.staffName}</span>
              <span className="party-sub">Hair Dexirity Specialist</span>
              {invoice.appointmentId && (
                <span className="party-sub">Booking Ref: #{invoice.appointmentId}</span>
              )}
            </div>
          </div>

          {/* Itemized Services & Products Table */}
          <table className="invoice-line-items-table">
            <thead>
              <tr>
                <th className="th-desc">Item Description</th>
                <th className="th-qty">Qty</th>
                <th className="th-rate">Rate</th>
                <th className="th-total">Total (₹)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lineItems.map((item) => (
                <tr key={item.id}>
                  <td className="td-desc">
                    <span className="item-title">{item.description}</span>
                    <span className="item-tag">{item.itemType === 'service' ? 'Service' : 'Product'}</span>
                  </td>
                  <td className="td-qty">{item.quantity}</td>
                  <td className="td-rate">{formatCurrency(item.unitPrice)}</td>
                  <td className="td-total">{formatCurrency(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals & Tax Calculation Breakdown */}
          <div className="invoice-totals-section">
            <div className="totals-left-notes">
              <span className="notes-label">Payment & Remarks:</span>
              <p className="notes-text">
                Primary Tender: <strong>{invoice.primaryPaymentMethod.toUpperCase()}</strong>.
                {invoice.notes && ` Note: ${invoice.notes}`}
              </p>
              {invoice.discountReason && (
                <span className="discount-note text-emerald">
                  Discount Reason: {invoice.discountReason}
                </span>
              )}
            </div>

            <div className="totals-right-breakdown">
              <div className="totals-row">
                <span className="tot-lbl">Subtotal:</span>
                <span className="tot-val">{formatCurrency(invoice.subtotal)}</span>
              </div>

              {invoice.discountAmount > 0 && (
                <div className="totals-row discount">
                  <span className="tot-lbl">Discount:</span>
                  <span className="tot-val text-emerald">-{formatCurrency(invoice.discountAmount)}</span>
                </div>
              )}

              {invoice.taxAmount > 0 && (
                <>
                  <div className="totals-row">
                    <span className="tot-lbl">CGST (9.0%):</span>
                    <span className="tot-val">{formatCurrency(invoice.cgstAmount)}</span>
                  </div>
                  <div className="totals-row">
                    <span className="tot-lbl">SGST (9.0%):</span>
                    <span className="tot-val">{formatCurrency(invoice.sgstAmount)}</span>
                  </div>
                </>
              )}

              <div className="doc-divider thin" />

              <div className="totals-row grand-total">
                <span className="tot-lbl">Grand Total:</span>
                <span className="tot-val gold">{formatCurrency(invoice.totalAmount)}</span>
              </div>

              <div className="totals-row paid">
                <span className="tot-lbl">Amount Paid:</span>
                <span className="tot-val text-emerald">{formatCurrency(invoice.paidAmount)}</span>
              </div>

              {invoice.balanceDue > 0 && (
                <div className="totals-row due">
                  <span className="tot-lbl">Balance Due:</span>
                  <span className="tot-val text-rose">{formatCurrency(invoice.balanceDue)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Recorded Payment Receipts */}
          {invoice.payments.length > 0 && (
            <div className="invoice-payments-audit-card">
              <span className="audit-section-title">Settled Payment Transactions</span>
              <div className="payments-receipt-list">
                {invoice.payments.map((p) => (
                  <div key={p.id} className="payment-receipt-row">
                    <div className="receipt-left">
                      <CheckCircleIcon size={14} className="text-emerald" />
                      <span className="receipt-method">{p.paymentMethod.toUpperCase()}</span>
                      {p.transactionReference && (
                        <span className="receipt-ref">Ref: {p.transactionReference}</span>
                      )}
                    </div>
                    <span className="receipt-amount gold">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formal Footer */}
          <div className="invoice-footer-thanks">
            <span>Thank you for choosing Hair Dexirity!</span>
            <span className="footer-sub">
              For appointments and queries, call +91 98765 43210 &bull; contact@hairdexirity.example.com
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
