import React, { useState, useMemo, useEffect } from 'react'
import type {
  InvoiceLineItem,
  TaxTreatment,
  PaymentMethod,
  DiscountType,
  PaymentSplit,
} from '../../../types/finance.ts'
import type { UserRole } from '../../../types/models.ts'
import { roundMoney, calculateInvoiceFinancials } from '../../../services/billingService.ts'
import { OwnerAuthModal } from './OwnerAuthModal.tsx'
import {
  ShieldCheckIcon,
  CheckCircleIcon,
  FileTextIcon,
  SlidersIcon,
} from '../../../components/Icons.tsx'
import './PosPaymentSummary.css'

interface PosPaymentSummaryProps {
  lineItems: InvoiceLineItem[]
  userRole?: UserRole
  onSaveDraft: (billingData: FinalizeBillingPayload) => Promise<void>
  onFinalizeInvoice: (billingData: FinalizeBillingPayload) => Promise<void>
  isSaving: boolean
  initialDraftData?: Partial<FinalizeBillingPayload> | null
}

export interface FinalizeBillingPayload {
  subtotal: number
  discountType: DiscountType
  discountValue: number
  discountAmount: number
  isGstInvoice: boolean
  taxRate: number
  taxTreatment: TaxTreatment
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  totalAmount: number
  paymentMethod: PaymentMethod
  paidAmount: number
  balanceDue: number
  cashTendered?: number
  cashChange?: number
  transactionRef?: string
  paymentSplits?: PaymentSplit[]
  notes?: string
  authorizedBy?: string
  authorizationGrantId?: string
  draftVersion?: number
  expectedDraftVersion?: number
}

export const PosPaymentSummary: React.FC<PosPaymentSummaryProps> = ({
  lineItems,
  userRole = 'RECEPTIONIST',
  onSaveDraft,
  onFinalizeInvoice,
  isSaving,
  initialDraftData,
}) => {
  // Discount States
  const [discountType, setDiscountType] = useState<DiscountType>(
    initialDraftData?.discountType || 'percentage'
  )
  const [discountValue, setDiscountValue] = useState<number>(
    initialDraftData?.discountValue || 0
  )
  const [authorizedBy, setAuthorizedBy] = useState<string | undefined>(
    initialDraftData?.authorizedBy
  )
  const [authorizationGrantId, setAuthorizationGrantId] = useState<string | undefined>(
    initialDraftData?.authorizationGrantId
  )
  const [authorizedDiscountAmount, setAuthorizedDiscountAmount] = useState<number>(
    initialDraftData?.authorizationGrantId ? initialDraftData.discountAmount || 0 : 0
  )
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // Tax States
  const [isGstInvoice, setIsGstInvoice] = useState<boolean>(
    initialDraftData?.isGstInvoice !== undefined ? initialDraftData.isGstInvoice : true
  )
  const [taxRate, setTaxRate] = useState<number>(
    initialDraftData?.taxRate !== undefined ? initialDraftData.taxRate : 18
  )
  const [taxTreatment, setTaxTreatment] = useState<TaxTreatment>(
    initialDraftData?.taxTreatment || 'exclusive'
  )

  // Payment States
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initialDraftData?.paymentMethod || 'cash'
  )
  const [cashTendered, setCashTendered] = useState<number>(
    initialDraftData?.cashTendered || 0
  )
  const [transactionRef, setTransactionRef] = useState<string>(
    initialDraftData?.transactionRef || ''
  )
  const [notes, setNotes] = useState<string>(initialDraftData?.notes || '')

  // Split Payment Allocations
  const [splitCash, setSplitCash] = useState<number>(0)
  const [splitUpi, setSplitUpi] = useState<number>(0)
  const [splitCard, setSplitCard] = useState<number>(0)
  const [splitBank, setSplitBank] = useState<number>(0)

  // Partial Payment override (if user wants to accept partial payment)
  const [isPartialPayment, setIsPartialPayment] = useState<boolean>(
    initialDraftData?.balanceDue ? initialDraftData.balanceDue > 0 : false
  )
  const [customPaidAmount, setCustomPaidAmount] = useState<number>(
    initialDraftData?.paidAmount || 0
  )

  // 1. Items Subtotal
  const subtotal = useMemo(() => {
    return roundMoney(
      lineItems.reduce(
        (acc, item) => acc + (item.lineTotal ?? item.totalPrice ?? item.unitPrice * item.quantity),
        0
      )
    )
  }, [lineItems])

  // 2. Bill-level Discount Calculation
  const discountAmount = useMemo(() => {
    if (subtotal <= 0 || discountValue <= 0) return 0
    if (discountType === 'percentage') {
      const pct = Math.min(100, Math.max(0, discountValue))
      return roundMoney(subtotal * (pct / 100))
    }
    return roundMoney(Math.min(subtotal, Math.max(0, discountValue)))
  }, [subtotal, discountType, discountValue])

  const discountPercentEquivalent = useMemo(() => {
    if (subtotal <= 0) return 0
    return (discountAmount / subtotal) * 100
  }, [discountAmount, subtotal])

  // Invalidate authorization grant if discount or subtotal increases beyond authorized amount
  useEffect(() => {
    if (authorizationGrantId && discountAmount > authorizedDiscountAmount + 0.01) {
      setAuthorizationGrantId(undefined)
      setAuthorizedBy(undefined)
    }
  }, [discountAmount, authorizedDiscountAmount, authorizationGrantId])

  // Need owner authorization if Receptionist sets > 10% discount
  const isOwner = userRole === 'OWNER'
  const needsOwnerAuth = !isOwner && discountPercentEquivalent > 10.0 && !authorizationGrantId

  // 3. Exact Financial Calculations (supports per-line tax and proportional discount allocation)
  const financials = useMemo(() => {
    return calculateInvoiceFinancials({
      subtotal,
      discountAmount,
      isGstInvoice,
      defaultTaxRate: taxRate,
      taxTreatment,
      lineItems,
    })
  }, [subtotal, discountAmount, isGstInvoice, taxRate, taxTreatment, lineItems])

  const { taxAmount, cgstAmount, sgstAmount, totalAmount } = financials

  // 5. Payment Tender & Balance Due
  const effectivePaidAmount = useMemo(() => {
    if (paymentMethod === 'split') {
      return roundMoney(splitCash + splitUpi + splitCard + splitBank)
    }
    if (isPartialPayment) {
      return roundMoney(Math.min(totalAmount, Math.max(0, customPaidAmount)))
    }
    return totalAmount
  }, [paymentMethod, isPartialPayment, customPaidAmount, totalAmount, splitCash, splitUpi, splitCard, splitBank])

  const balanceDue = useMemo(() => {
    return roundMoney(Math.max(0, totalAmount - effectivePaidAmount))
  }, [totalAmount, effectivePaidAmount])

  // 6. Cash Change Calculation
  const cashChange = useMemo(() => {
    if (paymentMethod === 'cash') {
      if (cashTendered > totalAmount) {
        return roundMoney(cashTendered - totalAmount)
      }
    }
    return 0
  }, [paymentMethod, cashTendered, totalAmount])

  // Initialize customPaidAmount to totalAmount when totalAmount updates
  useEffect(() => {
    if (!isPartialPayment && !initialDraftData) {
      setCustomPaidAmount(totalAmount)
      if (cashTendered === 0 || cashTendered < totalAmount) {
        setCashTendered(totalAmount)
      }
    }
  }, [totalAmount, isPartialPayment, initialDraftData])

  // Split payment allocations builder
  const paymentSplits: PaymentSplit[] | undefined = useMemo(() => {
    if (paymentMethod !== 'split') return undefined
    const splits: PaymentSplit[] = []
    if (splitCash > 0) splits.push({ method: 'cash', amount: splitCash })
    if (splitUpi > 0) splits.push({ method: 'upi', amount: splitUpi, reference: transactionRef })
    if (splitCard > 0) splits.push({ method: 'card', amount: splitCard, reference: transactionRef })
    if (splitBank > 0) splits.push({ method: 'bank', amount: splitBank, reference: transactionRef })
    return splits
  }, [paymentMethod, splitCash, splitUpi, splitCard, splitBank, transactionRef])

  // Helper to compile payload
  const buildPayload = (): FinalizeBillingPayload => {
    return {
      subtotal,
      discountType,
      discountValue,
      discountAmount,
      isGstInvoice,
      taxRate: isGstInvoice ? taxRate : 0,
      taxTreatment,
      taxAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      paymentMethod,
      paidAmount: effectivePaidAmount,
      balanceDue,
      cashTendered: paymentMethod === 'cash' ? cashTendered : undefined,
      cashChange: paymentMethod === 'cash' ? cashChange : undefined,
      transactionRef: transactionRef.trim() || undefined,
      paymentSplits,
      notes: notes.trim() || undefined,
      authorizedBy: authorizedBy || (isOwner ? 'Owner' : undefined),
      authorizationGrantId,
      draftVersion: initialDraftData?.draftVersion,
      expectedDraftVersion: initialDraftData?.draftVersion,
    }
  }

  const handleFinalize = async () => {
    if (lineItems.length === 0) return
    if (needsOwnerAuth) {
      setIsAuthModalOpen(true)
      return
    }
    await onFinalizeInvoice(buildPayload())
  }

  const handleDraft = async () => {
    if (lineItems.length === 0) return
    await onSaveDraft(buildPayload())
  }

  return (
    <div className="pos-payment-summary-card">
      <div className="summary-section-header">
        <SlidersIcon size={16} />
        <h4>Billing & Settlement</h4>
      </div>

      <div className="pos-summary-body">
        {/* Subtotal */}
        <div className="summary-calc-row">
          <span className="label">Items Subtotal</span>
          <span className="value">₹{subtotal.toFixed(2)}</span>
        </div>

        {/* Bill-level Discount */}
        <div className="summary-calc-box">
          <div className="box-title-row">
            <span className="box-label">Bill Discount</span>
            <div className="discount-type-toggle">
              <button
                type="button"
                className={`toggle-btn ${discountType === 'percentage' ? 'active' : ''}`}
                onClick={() => {
                  setDiscountType('percentage')
                  setDiscountValue(0)
                  setAuthorizedBy(undefined)
                }}
              >
                %
              </button>
              <button
                type="button"
                className={`toggle-btn ${discountType === 'flat' ? 'active' : ''}`}
                onClick={() => {
                  setDiscountType('flat')
                  setDiscountValue(0)
                  setAuthorizedBy(undefined)
                }}
              >
                ₹
              </button>
            </div>
          </div>

          <div className="discount-input-row">
            <input
              type="number"
              min="0"
              max={discountType === 'percentage' ? 100 : subtotal}
              className="pos-input discount-val-input"
              placeholder="0"
              value={discountValue || ''}
              onChange={(e) => {
                const val = parseFloat(e.target.value) || 0
                setDiscountValue(Math.max(0, val))
                setAuthorizedBy(undefined) // Reset auth on change
              }}
            />
            <span className="computed-discount-text">
              -₹{discountAmount.toFixed(2)}
            </span>
          </div>

          {/* Authorization Indicator or Warning */}
          {needsOwnerAuth && (
            <div className="discount-auth-prompt">
              <span className="auth-alert-text">
                &gt;10% discount requires Manager authorization ({discountPercentEquivalent.toFixed(1)}%).
              </span>
              <button
                type="button"
                className="btn-auth-trigger"
                onClick={() => setIsAuthModalOpen(true)}
              >
                <ShieldCheckIcon size={14} />
                <span>Authorize</span>
              </button>
            </div>
          )}

          {authorizedBy && (
            <div className="discount-auth-badge">
              <CheckCircleIcon size={13} />
              <span>Authorized by {authorizedBy}</span>
            </div>
          )}
        </div>

        {/* GST & Tax Regime */}
        <div className="summary-calc-box tax-box">
          <div className="box-title-row">
            <span className="box-label">Tax Regime</span>
            <div className="gst-toggle-wrap">
              <label className="switch-label">
                <input
                  type="checkbox"
                  checked={isGstInvoice}
                  onChange={(e) => setIsGstInvoice(e.target.checked)}
                />
                <span className="switch-text">{isGstInvoice ? 'GST Bill (18%)' : 'Non-GST'}</span>
              </label>
            </div>
          </div>

          {isGstInvoice && (
            <div className="tax-config-details">
              <div className="tax-mode-selector">
                <button
                  type="button"
                  className={`tax-mode-btn ${taxTreatment === 'exclusive' ? 'active' : ''}`}
                  onClick={() => setTaxTreatment('exclusive')}
                >
                  Exclusive (+Tax)
                </button>
                <button
                  type="button"
                  className={`tax-mode-btn ${taxTreatment === 'inclusive' ? 'active' : ''}`}
                  onClick={() => setTaxTreatment('inclusive')}
                >
                  Inclusive (Net)
                </button>
                <select
                  className="pos-input tax-rate-select"
                  style={{ width: '80px', padding: '0.25rem 0.4rem', fontSize: '0.75rem' }}
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value) || 18)}
                  title="Configurable GST Rate"
                >
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18%</option>
                  <option value={28}>28%</option>
                </select>
              </div>

              <div className="tax-split-display">
                <div className="split-col">
                  <span className="split-name">CGST ({(taxRate / 2).toFixed(1)}%)</span>
                  <span className="split-val">₹{cgstAmount.toFixed(2)}</span>
                </div>
                <div className="split-col">
                  <span className="split-name">SGST ({(taxRate / 2).toFixed(1)}%)</span>
                  <span className="split-val">₹{sgstAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Grand Total Bar */}
        <div className="summary-grand-total-row">
          <div className="total-label-wrap">
            <span className="total-title">Grand Total</span>
            <span className="tax-status-note">
              {isGstInvoice ? `Includes ₹${taxAmount.toFixed(2)} GST` : 'Zero Tax / Composition'}
            </span>
          </div>
          <div className="total-amount-display">
            <span className="currency">₹</span>
            <span className="figure">{totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Payment Tender Selector */}
        <div className="payment-tender-section">
          <label className="section-label">Payment Tender</label>
          <div className="tender-buttons-grid">
            {(['cash', 'upi', 'card', 'bank', 'split'] as const).map((method) => (
              <button
                key={method}
                type="button"
                className={`tender-btn ${paymentMethod === method ? 'active' : ''}`}
                onClick={() => setPaymentMethod(method)}
              >
                {method.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Tender-specific Fields */}
          {paymentMethod === 'cash' && (
            <div className="cash-tender-fields">
              <div className="tender-field-group">
                <label className="tender-sublabel">Cash Tendered (₹)</label>
                <input
                  type="number"
                  min="0"
                  className="pos-input"
                  placeholder={totalAmount.toFixed(2)}
                  value={cashTendered || ''}
                  onChange={(e) => setCashTendered(parseFloat(e.target.value) || 0)}
                />
              </div>
              {cashChange > 0 && (
                <div className="cash-change-chip">
                  <span>Change to Return:</span>
                  <strong className="change-num">₹{cashChange.toFixed(2)}</strong>
                </div>
              )}
            </div>
          )}

          {(paymentMethod === 'upi' || paymentMethod === 'card' || paymentMethod === 'bank') && (
            <div className="tender-field-group">
              <label className="tender-sublabel">
                {paymentMethod === 'upi' ? 'UPI UTR / Reference ID' : paymentMethod === 'card' ? 'Card Transaction / Last 4 Digits' : 'Bank Transfer Reference'}
              </label>
              <input
                type="text"
                className="pos-input"
                placeholder="Optional reference code"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
              />
            </div>
          )}

          {paymentMethod === 'split' && (
            <div className="split-payment-fields">
              <div className="split-input-row">
                <span className="split-label">Cash:</span>
                <input
                  type="number"
                  min="0"
                  className="pos-input split-input"
                  value={splitCash || ''}
                  placeholder="0.00"
                  onChange={(e) => setSplitCash(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="split-input-row">
                <span className="split-label">UPI:</span>
                <input
                  type="number"
                  min="0"
                  className="pos-input split-input"
                  value={splitUpi || ''}
                  placeholder="0.00"
                  onChange={(e) => setSplitUpi(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="split-input-row">
                <span className="split-label">Card:</span>
                <input
                  type="number"
                  min="0"
                  className="pos-input split-input"
                  value={splitCard || ''}
                  placeholder="0.00"
                  onChange={(e) => setSplitCard(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="split-input-row">
                <span className="split-label">Bank:</span>
                <input
                  type="number"
                  min="0"
                  className="pos-input split-input"
                  value={splitBank || ''}
                  placeholder="0.00"
                  onChange={(e) => setSplitBank(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
          )}

          {/* Partial Payment Toggle */}
          {paymentMethod !== 'split' && (
            <div className="partial-payment-toggle-wrap">
              <label className="partial-checkbox-label">
                <input
                  type="checkbox"
                  checked={isPartialPayment}
                  onChange={(e) => {
                    setIsPartialPayment(e.target.checked)
                    if (!e.target.checked) {
                      setCustomPaidAmount(totalAmount)
                    }
                  }}
                />
                <span>Record Partial Payment / Balance Due</span>
              </label>

              {isPartialPayment && (
                <div className="partial-amount-input-box">
                  <label className="tender-sublabel">Amount Paid Today (₹)</label>
                  <input
                    type="number"
                    min="0"
                    max={totalAmount}
                    className="pos-input"
                    value={customPaidAmount || ''}
                    placeholder="0.00"
                    onChange={(e) => setCustomPaidAmount(parseFloat(e.target.value) || 0)}
                  />
                  <div className="balance-due-alert">
                    <span>Remaining Balance:</span>
                    <strong>₹{balanceDue.toFixed(2)}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Optional Notes */}
        <div className="tender-field-group">
          <label className="tender-sublabel">Billing Notes (Optional)</label>
          <input
            type="text"
            className="pos-input"
            placeholder="Special instructions or customer remarks..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Action Buttons */}
        <div className="summary-actions-grid">
          <button
            type="button"
            className="btn-pos-draft"
            disabled={lineItems.length === 0 || isSaving}
            onClick={handleDraft}
            title="Save as Draft (no official invoice number assigned)"
          >
            <FileTextIcon size={16} />
            <span>Save Draft</span>
          </button>
          <button
            type="button"
            className="btn-pos-finalize"
            disabled={lineItems.length === 0 || isSaving}
            onClick={handleFinalize}
            title="Finalize invoice, assign tax invoice number, and collect payment"
          >
            <CheckCircleIcon size={18} />
            <span>{isSaving ? 'Processing...' : 'Finalize & Collect'}</span>
          </button>
        </div>
      </div>

      {/* Owner Auth Modal for >10% discount */}
      <OwnerAuthModal
        isOpen={isAuthModalOpen}
        requestedDiscountPercent={discountPercentEquivalent}
        requestedDiscountAmount={discountAmount}
        subtotal={subtotal}
        invoiceId={(initialDraftData as any)?.id || (initialDraftData as any)?.draftId}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthorized={(grantId, owner) => {
          setAuthorizationGrantId(grantId)
          setAuthorizedBy(owner)
          setAuthorizedDiscountAmount(discountAmount)
          setIsAuthModalOpen(false)
        }}
      />
    </div>
  )
}
