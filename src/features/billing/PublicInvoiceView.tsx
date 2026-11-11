// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Customer-Facing Public Secure Invoice View (`#/public/invoice?token=...`)
// High-Security Token-Validated Digital Receipt with Direct Vector PDF Download
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { PublicInvoiceData, Invoice } from '../../types/finance.ts'
import { invoiceShareService } from '../../services/invoiceShareService.ts'
import { downloadInvoicePdf } from '../../services/pdfService.ts'
import {
  DownloadIcon,
  AlertTriangleIcon,
  PhoneIcon,
  MailIcon,
} from '../../components/Icons.tsx'
import './PublicInvoiceView.css'

export const PublicInvoiceView: React.FC = () => {
  const [data, setData] = useState<PublicInvoiceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadPublicInvoice() {
      setIsLoading(true)
      setErrorMessage(null)

      try {
        // Extract raw token from hash query parameters e.g. #/public/invoice?token=abc...
        let token = ''
        if (typeof window !== 'undefined') {
          const hash = window.location.hash
          const match = hash.match(/[?&]token=([a-zA-Z0-9_-]+)/)
          if (match && match[1]) {
            token = match[1]
          } else {
            // Check standard search params
            const params = new URLSearchParams(window.location.search)
            token = params.get('token') || ''
          }
        }

        if (!token) {
          throw new Error('This invoice link is missing an access token. Please check the full link received from Hair Dexirity.')
        }

        const publicData = await invoiceShareService.fetchPublicInvoice(token)
        setData(publicData)
      } catch (err: any) {
        console.warn('Public invoice load failed:', err)
        if (err.message?.includes('REVOKED')) {
          setErrorMessage('This invoice link has been revoked by the salon. Please request a new link.')
        } else if (err.message?.includes('EXPIRED')) {
          setErrorMessage('This invoice link has expired. Please contact Hair Dexirity for an updated invoice.')
        } else {
          setErrorMessage('This invoice link is invalid or no longer available. Please verify the URL or contact Hair Dexirity.')
        }
      } finally {
        setIsLoading(false)
      }
    }

    void loadPublicInvoice()
  }, [])

  // Generate downloadable PDF from public invoice projection
  const handleDownloadPdf = () => {
    if (!data) return
    const mockInvoiceForPdf: Invoice = {
      id: `pub-${data.invoice.invoice_number}`,
      salonId: 'salon-luma-01',
      invoiceNumber: data.invoice.invoice_number,
      clientName: data.invoice.client_name,
      staffId: 'staff-luma',
      staffName: 'Hair Dexirity Team',
      date: data.invoice.date,
      subtotal: data.invoice.subtotal,
      discountAmount: data.invoice.discount_amount,
      discountType: data.invoice.discount_type,
      taxRate: data.invoice.tax_rate,
      taxAmount: data.invoice.tax_amount,
      cgstAmount: data.invoice.cgst_amount,
      sgstAmount: data.invoice.sgst_amount,
      totalAmount: data.invoice.total_amount,
      paidAmount: data.invoice.paid_amount,
      balanceDue: data.invoice.balance_due,
      paymentStatus: data.invoice.payment_status,
      primaryPaymentMethod: data.invoice.primary_payment_method,
      isGstInvoice: data.invoice.is_gst_invoice,
      taxTreatment: data.invoice.tax_treatment,
      lineItems: data.line_items.map((li) => ({
        description: li.description,
        name: li.description,
        quantity: li.quantity,
        unitPrice: li.unit_price,
        totalPrice: li.total_price,
        itemType: li.item_type,
        staffName: li.staff_name,
        taxRate: li.tax_rate,
        taxAmount: li.tax_amount,
        discountAmount: li.discount_amount,
      })),
      payments: data.payments.map((p, idx) => ({
        id: `pmt-${idx}`,
        salonId: 'salon-luma-01',
        invoiceId: `pub-${data.invoice.invoice_number}`,
        paymentMethod: p.payment_method as any,
        amount: p.amount,
        createdAt: p.created_at,
      })),
      createdAt: data.invoice.created_at,
      updatedAt: data.invoice.created_at,
    }

    downloadInvoicePdf(mockInvoiceForPdf, {
      name: data.salon.name,
      phone: data.salon.phone,
      email: data.salon.email,
      gstin: data.salon.gstin,
    })
  }

  // 1. Loading State
  if (isLoading) {
    return (
      <div className="public-invoice-page-container">
        <div className="public-loading-card">
          <div className="public-spinner" />
          <h3 className="loading-title">Verifying Secure Invoice Access</h3>
          <p className="loading-sub">Authenticating bearer security token...</p>
        </div>
      </div>
    )
  }

  // 2. Error / Expired / Invalid State
  if (errorMessage || !data) {
    return (
      <div className="public-invoice-page-container">
        <div className="public-error-card">
          <div className="error-icon-badge">
            <AlertTriangleIcon size={32} />
          </div>
          <h2 className="error-title">Invoice Unavailable</h2>
          <p className="error-description">{errorMessage}</p>
          <div className="salon-support-box">
            <span className="support-heading">Hair Dexirity Customer Support</span>
            <div className="support-links">
              <a href="tel:+919876543210" className="support-link">
                <PhoneIcon size={14} />
                <span>+91 98765 43210</span>
              </a>
              <a href="mailto:contact@hairdexirity.example.com" className="support-link">
                <MailIcon size={14} />
                <span>contact@hairdexirity.example.com</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const { salon, invoice, line_items, payments } = data
  const isPaid = invoice.payment_status === 'paid'
  const isPartiallyPaid = invoice.payment_status === 'partially_paid' || invoice.payment_status === 'partial'

  return (
    <div className="public-invoice-page-container">
      {/* Top Floating App Banner */}
      <header className="public-top-nav">
        <div className="brand-mark">
          <span className="brand-primary">HAIR</span>
          <span className="brand-secondary">DEXIRITY</span>
        </div>
        <button
          type="button"
          className="btn-public-download-top"
          onClick={handleDownloadPdf}
        >
          <DownloadIcon size={15} />
          <span>Download PDF</span>
        </button>
      </header>

      {/* Main Digital Invoice Container */}
      <main className="public-invoice-card">
        {/* Brand Stripe */}
        <div className="card-brand-stripe" />

        {/* Header Section */}
        <div className="public-header-section">
          <div className="salon-details">
            <h1 className="salon-name">{salon.name.toUpperCase()}</h1>
            <span className="salon-tag">HAUTE COIFFURE &amp; BEAUTY LOUNGE</span>
            <p className="salon-meta-text">
              {salon.address}<br />
              Phone: {salon.phone} &bull; Email: {salon.email}
              {salon.gstin && <><br />GSTIN: {salon.gstin}</>}
            </p>
          </div>

          <div className="invoice-meta-right">
            <div className="doc-type-pill">
              {invoice.is_gst_invoice ? 'OFFICIAL TAX INVOICE' : 'COMMERCIAL INVOICE'}
            </div>
            <div className="inv-code-display">{invoice.invoice_number}</div>
            <div className="inv-date-display">Date: {invoice.date}</div>
            <div className="status-badge-wrap">
              <span className={`public-status-badge ${isPaid ? 'paid' : isPartiallyPaid ? 'partial' : 'unpaid'}`}>
                {isPaid ? 'PAID IN FULL' : isPartiallyPaid ? 'PARTIALLY PAID' : 'UNPAID'}
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Settlement Bar */}
        <div className="customer-banner">
          <div className="cust-left">
            <span className="section-label">Billed To</span>
            <strong className="customer-name">{invoice.client_name}</strong>
          </div>
          <div className="cust-right">
            <span className="section-label">Primary Tender</span>
            <strong className="tender-name">
              {(invoice.primary_payment_method || 'cash').toUpperCase()}
            </strong>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="table-wrapper">
          <table className="public-items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item / Service</th>
                <th>Stylist</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Tax</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {line_items.map((item, idx) => {
                const total = Number(item.total_price) || (item.unit_price * item.quantity)
                return (
                  <tr key={idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <div className="item-name-bold">{item.description}</div>
                      <span className="item-type-tag">{item.item_type}</span>
                    </td>
                    <td>{item.staff_name || 'Stylist'}</td>
                    <td className="text-right">{item.quantity}</td>
                    <td className="text-right">₹{Number(item.unit_price).toFixed(2)}</td>
                    <td className="text-right">
                      {item.tax_amount && item.tax_amount > 0 ? `₹${Number(item.tax_amount).toFixed(2)}` : '-'}
                    </td>
                    <td className="text-right item-total-col">
                      ₹{total.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Financial Summary */}
        <div className="financials-split">
          <div className="left-policies-col">
            <h4 className="settlement-title">Payment Settlement</h4>
            {payments && payments.length > 0 ? (
              <div className="payments-list">
                {payments.map((p, idx) => (
                  <div key={idx} className="payment-row">
                    <span className="p-method">{p.payment_method.toUpperCase()}</span>
                    <span className="p-amt">₹{Number(p.amount).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="payment-row">
                <span className="p-method">{(invoice.primary_payment_method || 'cash').toUpperCase()}</span>
                <span className="p-amt">₹{invoice.paid_amount.toFixed(2)}</span>
              </div>
            )}

            <div className="salon-terms">
              <strong>Salon Policies:</strong>
              <p>
                1. Salon services rendered are non-refundable.<br />
                2. Retail products may be exchanged within 7 days in original condition.<br />
                3. Thank you for visiting Hair Dexirity!
              </p>
            </div>
          </div>

          <div className="right-breakdown-box">
            <div className="breakdown-row">
              <span>Subtotal:</span>
              <span>₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount_amount > 0 && (
              <div className="breakdown-row discount">
                <span>Discount:</span>
                <span>-₹{invoice.discount_amount.toFixed(2)}</span>
              </div>
            )}
            {invoice.is_gst_invoice && invoice.tax_amount > 0 ? (
              <>
                <div className="breakdown-row">
                  <span>CGST (9.00%):</span>
                  <span>₹{(invoice.cgst_amount || invoice.tax_amount / 2).toFixed(2)}</span>
                </div>
                <div className="breakdown-row">
                  <span>SGST (9.00%):</span>
                  <span>₹{(invoice.sgst_amount || invoice.tax_amount / 2).toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="breakdown-row">
                <span>Tax:</span>
                <span>₹0.00</span>
              </div>
            )}
            <div className="breakdown-row total-highlight">
              <span>Grand Total:</span>
              <span className="gold-text">₹{invoice.total_amount.toFixed(2)}</span>
            </div>
            <div className="breakdown-row paid-highlight">
              <span>Amount Paid:</span>
              <span className="green-text">₹{invoice.paid_amount.toFixed(2)}</span>
            </div>
            {invoice.balance_due > 0 ? (
              <div className="breakdown-row balance-highlight">
                <span>Balance Due:</span>
                <span className="red-text">₹{invoice.balance_due.toFixed(2)}</span>
              </div>
            ) : (
              <div className="breakdown-row settled">
                <span>Balance Due:</span>
                <span>₹0.00 (Fully Settled)</span>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer with Download CTA */}
        <div className="public-card-footer">
          <button
            type="button"
            className="btn-download-pdf-large"
            onClick={handleDownloadPdf}
          >
            <DownloadIcon size={18} />
            <span>Download Official PDF Receipt</span>
          </button>
          <div className="security-guarantee-note">
            🔒 Verified Digital Receipt &bull; Issued securely by Hair Dexirity
          </div>
        </div>
      </main>
    </div>
  )
}
