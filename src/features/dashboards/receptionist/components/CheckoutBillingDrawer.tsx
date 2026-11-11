// ==============================================================================
// Luma Salon — Front Desk Checkout Billing Drawer (Phase 7)
// Commercial Payment Collection, Multi-Tender Selection & Invoice Generation
// ==============================================================================

import React, { useState, useMemo } from 'react'
import type { EnrichedAppointment } from '../../../../types/models.ts'
import type { SinglePaymentMethod, PaymentMethod, Invoice } from '../../../../types/finance.ts'
import { billingService } from '../../../../services/billingService.ts'
import { appointmentService } from '../../../../services/appointmentService.ts'
import { formatCurrency, formatTime12h } from '../../../../utils/formatters.ts'
import {
  CloseIcon,
  CheckCircleIcon,
  ScissorsIcon,
  UsersIcon,
  ClockIcon,
  TagIcon,
  InfoIcon,
} from '../../../../components/Icons.tsx'
import './CheckoutBillingDrawer.css'

interface CheckoutBillingDrawerProps {
  appointment: EnrichedAppointment
  onClose: () => void
  onSuccess: (invoice: Invoice) => void
}

export const CheckoutBillingDrawer: React.FC<CheckoutBillingDrawerProps> = ({
  appointment,
  onClose,
  onSuccess,
}) => {
  const [paymentMode, setPaymentMode] = useState<PaymentMethod>('upi')
  const [applyTax, setApplyTax] = useState<boolean>(true)

  // Discount
  const [hasDiscount, setHasDiscount] = useState<boolean>(false)
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState<string>('')

  // Tender-specific inputs
  const [upiRef, setUpiRef] = useState<string>('')
  const [cardLast4, setCardLast4] = useState<string>('')
  const [cashTendered, setCashTendered] = useState<number>(appointment.price || 0)

  // Split tenders
  const [splitCash, setSplitCash] = useState<number>(0)
  const [splitUpi, setSplitUpi] = useState<number>(0)

  // Processing state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const rawPrice = appointment.price || 1500

  // Financial calculations
  const { subtotal, discountAmount, taxAmount, cgstAmount, sgstAmount, totalAmount } =
    useMemo(() => {
      // Base service price without tax
      const baseSubtotal = applyTax
        ? Math.round((rawPrice / 1.18) * 100) / 100
        : rawPrice

      let disc = 0
      if (hasDiscount && discountValue > 0) {
        if (discountType === 'percentage') {
          disc = Math.round(((baseSubtotal * Math.min(100, discountValue)) / 100) * 100) / 100
        } else {
          disc = Math.min(baseSubtotal, discountValue)
        }
      }

      const postDiscount = Math.max(0, baseSubtotal - disc)
      const tax = applyTax ? Math.round(postDiscount * 0.18 * 100) / 100 : 0
      const cgst = Math.round((tax / 2) * 100) / 100
      const sgst = Math.round((tax - cgst) * 100) / 100
      const total = Math.round((postDiscount + tax) * 100) / 100

      return {
        subtotal: baseSubtotal,
        discountAmount: disc,
        discountedSubtotal: postDiscount,
        taxAmount: tax,
        cgstAmount: cgst,
        sgstAmount: sgst,
        totalAmount: total,
      }
    }, [rawPrice, applyTax, hasDiscount, discountType, discountValue])

  // Change calculation for cash
  const cashChangeDue = Math.max(0, Math.round((cashTendered - totalAmount) * 100) / 100)

  // Split balance check
  const splitTotalPaid = splitCash + splitUpi
  const splitBalanceRemaining = Math.round((totalAmount - splitTotalPaid) * 100) / 100

  // Durable, persistent checkout idempotency key across drawer reopening, network retries & refreshes
  const idempotencyKey = useMemo(() => {
    const storageKey = `luma_checkout_idem_${appointment.id}`
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const existing = window.localStorage.getItem(storageKey)
        if (existing) {
          return existing
        }
        const generatedKey = `chk-inv-${appointment.id}`
        window.localStorage.setItem(storageKey, generatedKey)
        return generatedKey
      }
    } catch {
      // fallback if storage disabled
    }
    return `chk-inv-${appointment.id}`
  }, [appointment.id])

  const handleProcessCheckout = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Validation
    if (paymentMode === 'cash' && cashTendered < totalAmount) {
      setErrorMessage(`Cash tendered (${formatCurrency(cashTendered)}) is less than total bill (${formatCurrency(totalAmount)}).`)
      return
    }

    if (paymentMode === 'split' && splitTotalPaid < totalAmount) {
      setErrorMessage(`Total split payment (${formatCurrency(splitTotalPaid)}) is less than bill (${formatCurrency(totalAmount)}). Remaining: ${formatCurrency(splitBalanceRemaining)}`)
      return
    }

    let createdInvoice: Invoice | null = null

    try {
      setIsSubmitting(true)

      // Build payment tender array with deterministic child keys
      const paymentsPayload: Array<{
        method: SinglePaymentMethod
        amount: number
        transactionReference?: string
        notes?: string
        idempotencyKey?: string
      }> = []

      if (paymentMode === 'upi') {
        paymentsPayload.push({
          method: 'upi',
          amount: totalAmount,
          transactionReference: upiRef.trim() || `UPI-${Date.now().toString().slice(-8)}`,
          idempotencyKey: `${idempotencyKey}-tender-upi`,
        })
      } else if (paymentMode === 'card') {
        paymentsPayload.push({
          method: 'card',
          amount: totalAmount,
          transactionReference: cardLast4.trim() ? `CARD-****-${cardLast4.trim()}` : `CARD-${Date.now().toString().slice(-6)}`,
          idempotencyKey: `${idempotencyKey}-tender-card`,
        })
      } else if (paymentMode === 'cash') {
        paymentsPayload.push({
          method: 'cash',
          amount: totalAmount,
          notes: cashTendered > totalAmount ? `Tendered: ${formatCurrency(cashTendered)}, Change: ${formatCurrency(cashChangeDue)}` : undefined,
          idempotencyKey: `${idempotencyKey}-tender-cash`,
        })
      } else if (paymentMode === 'split') {
        if (splitCash > 0) {
          paymentsPayload.push({
            method: 'cash',
            amount: splitCash,
            notes: 'Split payment portion (Cash)',
            idempotencyKey: `${idempotencyKey}-tender-split-cash`,
          })
        }
        if (splitUpi > 0) {
          paymentsPayload.push({
            method: 'upi',
            amount: splitUpi,
            transactionReference: `UPI-SPLIT-${Date.now().toString().slice(-6)}`,
            notes: 'Split payment portion (UPI)',
            idempotencyKey: `${idempotencyKey}-tender-split-upi`,
          })
        }
      }

      // 1. Create Invoice in Billing Store (with durable idempotency protection)
      createdInvoice = await billingService.createInvoice({
        appointmentId: appointment.id,
        clientId: appointment.clientId,
        clientName: appointment.clientName || 'Valued Guest',
        clientPhone: appointment.clientPhone,
        clientEmail: appointment.clientEmail,
        staffId: appointment.staffId,
        staffName: appointment.staffName || 'Stylist',
        serviceId: appointment.serviceId,
        serviceName: appointment.serviceName || 'Salon Service',
        subtotal,
        discountAmount,
        discountType: hasDiscount ? discountType : undefined,
        discountReason: hasDiscount ? discountReason : undefined,
        applyTax,
        primaryPaymentMethod: paymentMode,
        payments: paymentsPayload,
        idempotencyKey,
      })

      // 2. Mark Appointment as Completed (with Rollback on Failure)
      try {
        await appointmentService.completeServiceAppointment(appointment.id)
      } catch (aptErr: any) {
        console.error('Failed to complete appointment after creating invoice, rolling back transaction:', aptErr)
        if (createdInvoice) {
          await billingService.voidInvoice(createdInvoice.id, 'Rollback: appointment completion failed')
        }
        throw new Error(`Failed to complete appointment: ${aptErr.message || 'Unknown error'}. Transaction voided to prevent orphaned billing.`)
      }

      // 3. Clean up durable idempotency key on successful settlement
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(`luma_checkout_idem_${appointment.id}`)
        }
      } catch {
        // ignore
      }

      // 4. Callback success
      onSuccess(createdInvoice)
    } catch (err: any) {
      console.error('Error processing checkout payment:', err)
      setErrorMessage(err.message || 'Failed to finalize checkout and invoice.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="billing-drawer-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="billing-drawer-container" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="billing-drawer-header">
          <div className="header-meta-group">
            <span className="drawer-pretitle">Front Desk Checkout & Billing</span>
            <h2 className="drawer-title">Finalize Service & Collect Payment</h2>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close billing drawer"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleProcessCheckout} className="billing-drawer-form">
          {/* Client & Service Snapshot Card */}
          <div className="checkout-summary-card">
            <div className="summary-col">
              <div className="summary-field">
                <UsersIcon size={14} className="field-icon" />
                <span className="field-text font-bold">{appointment.clientName || 'Guest'}</span>
              </div>
              {appointment.clientPhone && (
                <span className="field-subtext">{appointment.clientPhone}</span>
              )}
            </div>

            <div className="summary-divider" />

            <div className="summary-col">
              <div className="summary-field">
                <ScissorsIcon size={14} className="field-icon text-purple" />
                <span className="field-text text-purple font-semibold">
                  {appointment.serviceName || 'Service'}
                </span>
              </div>
              <span className="field-subtext">Stylist: {appointment.staffName || 'Assigned Stylist'}</span>
            </div>

            <div className="summary-divider" />

            <div className="summary-col">
              <div className="summary-field">
                <ClockIcon size={14} className="field-icon" />
                <span className="field-text">
                  {formatTime12h(appointment.startTime)} – {formatTime12h(appointment.endTime)}
                </span>
              </div>
              <span className="field-subtext">Base Fee: {formatCurrency(rawPrice)}</span>
            </div>
          </div>

          {/* Discount Section */}
          <div className="billing-section-box">
            <div className="section-row-header">
              <div className="section-title-wrap">
                <TagIcon size={15} />
                <span className="section-title">Promotional Discount</span>
              </div>
              <label className="toggle-switch-label">
                <input
                  type="checkbox"
                  checked={hasDiscount}
                  onChange={(e) => setHasDiscount(e.target.checked)}
                />
                <span className="toggle-slider" />
                <span className="toggle-text">{hasDiscount ? 'Applied' : 'No Discount'}</span>
              </label>
            </div>

            {hasDiscount && (
              <div className="discount-inputs-grid">
                <div className="discount-type-pills">
                  <button
                    type="button"
                    className={`type-pill ${discountType === 'flat' ? 'active' : ''}`}
                    onClick={() => setDiscountType('flat')}
                  >
                    Flat (₹)
                  </button>
                  <button
                    type="button"
                    className={`type-pill ${discountType === 'percentage' ? 'active' : ''}`}
                    onClick={() => setDiscountType('percentage')}
                  >
                    Percent (%)
                  </button>
                </div>

                <div className="discount-input-field">
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percentage' ? 100 : rawPrice}
                    step={discountType === 'percentage' ? '1' : '50'}
                    value={discountValue || ''}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    placeholder={discountType === 'percentage' ? 'e.g. 10%' : 'e.g. ₹200'}
                    className="billing-text-input"
                  />
                </div>

                <div className="discount-reason-field">
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason (e.g. Opening Offer, Loyalty Promo)"
                    className="billing-text-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tax / GST Section */}
          <div className="billing-section-box">
            <div className="section-row-header">
              <div className="section-title-wrap">
                <InfoIcon size={15} />
                <span className="section-title">GST Tax Calculation (18%)</span>
              </div>
              <label className="toggle-switch-label">
                <input
                  type="checkbox"
                  checked={applyTax}
                  onChange={(e) => setApplyTax(e.target.checked)}
                />
                <span className="toggle-slider" />
                <span className="toggle-text">{applyTax ? '18% GST Enabled' : 'Tax Exempt'}</span>
              </label>
            </div>

            {applyTax && (
              <div className="tax-breakdown-subtext">
                <span>Central GST (CGST 9%): {formatCurrency(cgstAmount)}</span>
                <span>&bull;</span>
                <span>State GST (SGST 9%): {formatCurrency(sgstAmount)}</span>
              </div>
            )}
          </div>

          {/* Payment Method Selector */}
          <div className="billing-section-box">
            <span className="section-micro-heading">Select Payment Tender</span>
            <div className="tender-mode-tabs">
              <button
                type="button"
                className={`tender-tab ${paymentMode === 'upi' ? 'active' : ''}`}
                onClick={() => setPaymentMode('upi')}
              >
                <span>📱 UPI / QR</span>
              </button>
              <button
                type="button"
                className={`tender-tab ${paymentMode === 'cash' ? 'active' : ''}`}
                onClick={() => {
                  setPaymentMode('cash')
                  setCashTendered(totalAmount)
                }}
              >
                <span>💵 Cash</span>
              </button>
              <button
                type="button"
                className={`tender-tab ${paymentMode === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMode('card')}
              >
                <span>💳 Card (POS)</span>
              </button>
              <button
                type="button"
                className={`tender-tab ${paymentMode === 'split' ? 'active' : ''}`}
                onClick={() => {
                  setPaymentMode('split')
                  setSplitCash(Math.floor(totalAmount / 2))
                  setSplitUpi(totalAmount - Math.floor(totalAmount / 2))
                }}
              >
                <span>⚡ Split Tender</span>
              </button>
            </div>

            {/* Tender-Specific Input Views */}
            <div className="tender-input-container">
              {/* 1. UPI Mode */}
              {paymentMode === 'upi' && (
                <div className="tender-detail-block">
                  <label className="input-label" htmlFor="upi-ref-input">
                    UPI Transaction ID / UTR (Optional)
                  </label>
                  <input
                    id="upi-ref-input"
                    type="text"
                    placeholder="e.g. 431289104523 (GPay / PhonePe / Paytm)"
                    value={upiRef}
                    onChange={(e) => setUpiRef(e.target.value)}
                    className="billing-text-input"
                  />
                  <span className="input-hint">Customer scans salon QR code and confirms payment.</span>
                </div>
              )}

              {/* 2. Cash Mode */}
              {paymentMode === 'cash' && (
                <div className="tender-detail-block">
                  <div className="cash-input-row">
                    <div className="cash-field">
                      <label className="input-label" htmlFor="cash-tendered-input">
                        Cash Tendered by Customer (₹)
                      </label>
                      <input
                        id="cash-tendered-input"
                        type="number"
                        min={totalAmount}
                        step="50"
                        value={cashTendered || ''}
                        onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                        className="billing-text-input"
                      />
                    </div>
                    <div className="cash-field change-due">
                      <span className="input-label">Change Return Due</span>
                      <span className="change-due-val gold">{formatCurrency(cashChangeDue)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Card Mode */}
              {paymentMode === 'card' && (
                <div className="tender-detail-block">
                  <label className="input-label" htmlFor="card-last4-input">
                    Card Last 4 Digits / Auth Slip # (Optional)
                  </label>
                  <input
                    id="card-last4-input"
                    type="text"
                    maxLength={4}
                    placeholder="e.g. 8842"
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                    className="billing-text-input"
                  />
                  <span className="input-hint">Processed through salon POS card terminal.</span>
                </div>
              )}

              {/* 4. Split Mode */}
              {paymentMode === 'split' && (
                <div className="tender-detail-block">
                  <div className="split-inputs-row">
                    <div className="split-field">
                      <label className="input-label" htmlFor="split-cash-input">
                        Cash Tender Portion (₹)
                      </label>
                      <input
                        id="split-cash-input"
                        type="number"
                        min="0"
                        max={totalAmount}
                        value={splitCash || ''}
                        onChange={(e) => setSplitCash(parseFloat(e.target.value) || 0)}
                        className="billing-text-input"
                      />
                    </div>
                    <div className="split-field">
                      <label className="input-label" htmlFor="split-upi-input">
                        UPI / Digital Portion (₹)
                      </label>
                      <input
                        id="split-upi-input"
                        type="number"
                        min="0"
                        max={totalAmount}
                        value={splitUpi || ''}
                        onChange={(e) => setSplitUpi(parseFloat(e.target.value) || 0)}
                        className="billing-text-input"
                      />
                    </div>
                  </div>

                  <div className="split-status-row">
                    <span>
                      Total Paid: <strong>{formatCurrency(splitTotalPaid)}</strong>
                    </span>
                    <span className={splitBalanceRemaining === 0 ? 'text-emerald' : 'text-rose'}>
                      {splitBalanceRemaining === 0
                        ? '✓ Exact Split Balanced'
                        : `Remaining to cover: ${formatCurrency(splitBalanceRemaining)}`}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Grand Total Summary Box */}
          <div className="checkout-total-card">
            <div className="total-breakdown-row">
              <span className="breakdown-label">Service Subtotal:</span>
              <span className="breakdown-val">{formatCurrency(subtotal)}</span>
            </div>

            {discountAmount > 0 && (
              <div className="total-breakdown-row discount">
                <span className="breakdown-label">Discount:</span>
                <span className="breakdown-val text-emerald">-{formatCurrency(discountAmount)}</span>
              </div>
            )}

            {applyTax && (
              <div className="total-breakdown-row">
                <span className="breakdown-label">18% GST (CGST + SGST):</span>
                <span className="breakdown-val">{formatCurrency(taxAmount)}</span>
              </div>
            )}

            <div className="total-divider" />

            <div className="total-grand-row">
              <span className="grand-label">Total Amount Payable:</span>
              <span className="grand-val gold">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          {/* Error Message Alert */}
          {errorMessage && <div className="checkout-error-alert">{errorMessage}</div>}

          {/* Drawer Actions */}
          <div className="drawer-actions-row">
            <button
              type="button"
              className="btn-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-checkout-submit"
              disabled={isSubmitting}
            >
              <CheckCircleIcon size={16} />
              <span>{isSubmitting ? 'Processing Invoice...' : `Collect ${formatCurrency(totalAmount)} & Complete`}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
