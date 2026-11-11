// ==============================================================================
// Luma Salon — Financial, Invoicing & Payment Domain Models (Phase 7)
// Commercial Billing, Tax (GST), Payments & Cash Flow Records
// ==============================================================================

export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank' | 'split' | 'advance' | 'credit_note' | 'other'

export type SinglePaymentMethod = 'cash' | 'upi' | 'card' | 'bank' | 'advance' | 'credit_note' | 'other'

export type PaymentStatus = 'paid' | 'partial' | 'partially_paid' | 'unpaid' | 'refunded' | 'cancelled' | 'draft'

export type DiscountType = 'flat' | 'percentage'

export type TaxTreatment = 'exclusive' | 'inclusive' | 'non_gst'

export interface PaymentSplit {
  method: SinglePaymentMethod
  amount: number
  reference?: string
}

export interface PaymentRecord {
  id: string
  salonId: string
  invoiceId: string
  paymentMethod: SinglePaymentMethod
  amount: number
  transactionReference?: string
  notes?: string
  receivedBy?: string
  idempotencyKey?: string
  createdAt: string // ISO Timestamp
}

export interface InvoiceLineItem {
  id?: string
  description: string
  name?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  total?: number
  lineTotal?: number
  itemType: 'service' | 'product'
  serviceId?: string
  productId?: string
  staffId?: string
  staffName?: string
  discountAmount?: number
  taxRate?: number
  taxAmount?: number
}

export interface Invoice {
  id: string
  salonId: string
  invoiceNumber: string // Formatted e.g. "INV-2026-0042" or "DRAFT-XXXX"
  appointmentId?: string
  clientId?: string
  clientName: string
  clientPhone?: string
  clientEmail?: string
  staffId: string
  staffName: string
  serviceId?: string
  serviceName?: string
  date: string // YYYY-MM-DD (Asia/Kolkata)
  lineItems: InvoiceLineItem[]
  subtotal: number
  discountAmount: number
  discountType?: 'flat' | 'percentage'
  discountValue?: number
  discountReason?: string
  taxRate: number // e.g. 0.18 for 18% GST
  taxAmount: number
  cgstAmount: number // 9% Central GST
  sgstAmount: number // 9% State GST
  totalAmount: number
  paidAmount: number
  balanceDue: number
  paymentStatus: PaymentStatus
  status?: PaymentStatus // Alias for paymentStatus
  primaryPaymentMethod: PaymentMethod
  paymentMethod?: PaymentMethod // Alias for primaryPaymentMethod
  payments: PaymentRecord[]
  isGstInvoice?: boolean
  taxTreatment?: TaxTreatment
  isDraft?: boolean
  draftVersion?: number
  walkInGuest?: boolean
  notes?: string
  authorizedBy?: string
  authorizationGrantId?: string
  idempotencyKey?: string
  voidReason?: string
  createdAt: string // ISO Timestamp
  updatedAt: string // ISO Timestamp
}

export class StaleDraftError extends Error {
  readonly code = 'STALE_DRAFT_CONFLICT'
  readonly draftId: string
  readonly expectedVersion?: number
  readonly currentVersion?: number

  constructor(message: string, draftId: string, expectedVersion?: number, currentVersion?: number) {
    super(message)
    this.name = 'StaleDraftError'
    this.draftId = draftId
    this.expectedVersion = expectedVersion
    this.currentVersion = currentVersion
    Object.setPrototypeOf(this, StaleDraftError.prototype)
  }
}

export interface FinancialSummaryKpis {
  totalCollectedRevenue: number
  totalInvoicedAmount: number
  outstandingReceivables: number
  totalTaxCollected: number
  totalCgstCollected: number
  totalSgstCollected: number
  totalDiscountsGiven: number
  averageTicketValue: number
  totalInvoicesCount: number
  paidInvoicesCount: number
  unpaidInvoicesCount: number
  cashCollected: number
  digitalCollected: number
  digitalSharePercentage: number
}

export interface PaymentMethodShare {
  method: PaymentMethod
  label: string
  amount: number
  count: number
  percentage: number
}

export interface DailyCashFlowPoint {
  date: string // YYYY-MM-DD
  displayDate: string // DD/MM
  dayOfWeek: string // Mon, Tue...
  cashAmount: number
  upiAmount: number
  cardAmount: number
  totalCollected: number
  invoiceCount: number
}

export interface InvoiceFilters {
  status?: PaymentStatus | 'all'
  paymentMethod?: PaymentMethod | 'all'
  searchQuery?: string
  startDate?: string
  endDate?: string
  sortBy?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
}

/**
 * Raw PostgreSQL database row representations for Phase 7.1 Supabase persistence
 */
export interface DatabaseInvoice {
  id: string
  salon_id: string
  invoice_number: string
  appointment_id?: string | null
  client_id: string
  client_name: string
  client_phone?: string | null
  client_email?: string | null
  staff_id: string
  staff_name: string
  service_id?: string | null
  service_name: string
  date: string
  subtotal: number | string
  discount_amount: number | string
  discount_type?: 'flat' | 'percentage' | null
  discount_reason?: string | null
  tax_rate: number | string
  tax_amount: number | string
  cgst_amount: number | string
  sgst_amount: number | string
  total_amount: number | string
  paid_amount: number | string
  balance_due: number | string
  payment_status: PaymentStatus
  primary_payment_method: PaymentMethod
  is_gst_invoice?: boolean
  tax_treatment?: string
  is_draft?: boolean
  draft_version?: number
  authorized_by?: string | null
  notes?: string | null
  idempotency_key?: string | null
  created_at: string
  updated_at: string
}

export interface DatabaseInvoiceLineItem {
  id: string
  salon_id: string
  invoice_id: string
  description: string
  quantity: number | string
  unit_price: number | string
  total_price: number | string
  item_type: 'service' | 'product'
  product_id?: string | null
  service_id?: string | null
  staff_id?: string | null
  discount_amount?: number | string
  tax_rate?: number | string
  tax_amount?: number | string
  created_at: string
}

export interface DatabasePayment {
  id: string
  salon_id: string
  invoice_id: string
  payment_method: SinglePaymentMethod
  amount: number | string
  transaction_reference?: string | null
  notes?: string | null
  received_by?: string | null
  idempotency_key?: string | null
  created_at: string
}

export interface InvoiceShare {
  id: string
  salonId: string
  invoiceId: string
  tokenHash: string
  createdBy?: string
  createdAt: string
  expiresAt: string
  revokedAt?: string
  revokedBy?: string
  lastAccessedAt?: string
  accessCount: number
  isActive: boolean
}

export interface PublicInvoiceData {
  valid: boolean
  salon: {
    name: string
    phone: string
    email: string
    address: string
    gstin?: string
    ownerName?: string
  }
  invoice: {
    invoice_number: string
    date: string
    created_at: string
    client_name: string
    subtotal: number
    discount_amount: number
    discount_type?: 'flat' | 'percentage'
    is_gst_invoice: boolean
    tax_treatment: TaxTreatment
    tax_rate: number
    cgst_amount: number
    sgst_amount: number
    tax_amount: number
    total_amount: number
    paid_amount: number
    balance_due: number
    payment_status: PaymentStatus
    primary_payment_method: PaymentMethod
    notes?: string
  }
  line_items: Array<{
    description: string
    quantity: number
    unit_price: number
    total_price: number
    item_type: 'service' | 'product'
    staff_name?: string
    tax_rate?: number
    tax_amount?: number
    discount_amount?: number
  }>
  payments: Array<{
    payment_method: string
    amount: number
    created_at: string
  }>
  share_metadata: {
    expires_at: string
    access_count: number
  }
}

// ==============================================================================
// Phase 4: Customer Advances, Refunds, Credit Notes, Ledger & Reconciliation
// ==============================================================================

export interface CustomerAdvance {
  id: string
  salonId: string
  clientId: string
  advanceNumber: string
  amount: number
  remainingAmount: number
  paymentMethod: SinglePaymentMethod
  transactionReference?: string
  notes?: string
  createdBy?: string
  createdAt: string
  clientName?: string
}

export interface AdvanceAllocation {
  id: string
  salonId: string
  advanceId: string
  invoiceId: string
  paymentId?: string
  amount: number
  allocatedAt: string
  createdBy?: string
  invoiceNumber?: string
}

export interface RefundRecord {
  id: string
  salonId: string
  refundNumber: string
  clientId?: string
  invoiceId: string
  paymentId?: string
  amount: number
  paymentMethod: SinglePaymentMethod
  reason: string
  status: 'pending_approval' | 'approved' | 'completed' | 'rejected'
  createdBy?: string
  approvedBy?: string
  createdAt: string
  invoiceNumber?: string
  clientName?: string
}

export interface CreditNoteItem {
  id?: string
  creditNoteId?: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  taxRate: number
  taxAmount: number
}

export interface CreditNote {
  id: string
  salonId: string
  creditNoteNumber: string
  originalInvoiceId: string
  clientId?: string
  issueDate: string
  reason: string
  subtotal: number
  taxAmount: number
  totalAmount: number
  allocatedAmount: number
  remainingAmount: number
  status: 'active' | 'fully_applied' | 'cancelled'
  createdBy?: string
  createdAt: string
  invoiceNumber?: string
  clientName?: string
  items?: CreditNoteItem[]
}

export interface CreditNoteAllocation {
  id: string
  salonId: string
  creditNoteId: string
  targetInvoiceId: string
  paymentId?: string
  amount: number
  allocatedAt: string
  createdBy?: string
  targetInvoiceNumber?: string
}

export interface PaymentReminder {
  id: string
  salonId: string
  invoiceId: string
  clientId?: string
  channel: 'whatsapp' | 'email'
  recipientContact: string
  balanceDue: number
  status: 'sent' | 'failed'
  sentAt: string
  createdBy?: string
  clientName?: string
  invoiceNumber?: string
}

export interface PaymentReconciliation {
  id: string
  salonId: string
  reconciliationDate: string
  openingCash: number
  cashCollected: number
  upiCollected: number
  cardCollected: number
  bankCollected: number
  refundsTotal: number
  netCollections: number
  expectedCash: number
  actualCash: number
  discrepancy: number
  status: 'balanced' | 'discrepancy_reported' | 'reviewed'
  notes?: string
  preparedBy?: string
  reviewedBy?: string
  createdAt: string
}

export interface CustomerLedgerEvent {
  event_date: string
  event_timestamp: string
  transaction_type: 'INVOICE' | 'PAYMENT' | 'ADVANCE_RECEIVED' | 'REFUND' | 'CREDIT_NOTE'
  reference: string
  description: string
  debit_amount: number
  credit_amount: number
  payment_method?: string | null
  running_balance?: number
}

export interface CustomerLedgerSummary {
  total_invoiced: number
  total_paid: number
  total_outstanding: number
  total_advance: number
  available_advance: number
  total_refunds: number
  total_credit_notes: number
  available_credit: number
  net_customer_balance: number
}

export interface CustomerLedgerData {
  client: {
    id: string
    name: string
    phone?: string
    email?: string
  }
  summary: CustomerLedgerSummary
  transactions: CustomerLedgerEvent[]
}

export interface CustomerStatementData {
  salon: {
    name: string
    phone: string
    email: string
    address: string
    gstin?: string
  }
  client: {
    id: string
    name: string
    phone?: string
    email?: string
  }
  startDate?: string
  endDate?: string
  generatedAt: string
  summary: CustomerLedgerSummary
  transactions: CustomerLedgerEvent[]
}

// ==============================================================================
// Phase 5: Estimates, Quotations & Proforma Invoicing
// ==============================================================================

export type QuotationStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'converted'
  | 'cancelled'

export type QuotationItemType = 'service' | 'product' | 'custom'

export interface QuotationItem {
  id?: string
  quotationId?: string
  itemType: QuotationItemType
  serviceId?: string
  productId?: string
  staffId?: string
  staffName?: string
  name: string
  description?: string
  isCustom?: boolean
  quantity: number
  unitPrice: number
  discountAmount: number
  taxableAmount: number
  taxRate: number
  taxAmount: number
  totalPrice: number
  sortOrder?: number
}

export interface Quotation {
  id: string
  salonId: string
  quotationNumber: string
  clientId?: string
  clientName: string
  clientPhone?: string
  clientEmail?: string
  isWalkIn: boolean
  issueDate: string // YYYY-MM-DD
  validUntil: string // YYYY-MM-DD
  subtotal: number
  discountAmount: number
  discountType?: DiscountType
  discountValue?: number
  discountReason?: string
  authorizedBy?: string
  authorizationGrantId?: string
  taxTreatment: TaxTreatment
  taxRate: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  totalAmount: number
  status: QuotationStatus
  customerNotes?: string
  internalNotes?: string
  termsAndConditions?: string
  advanceRequired?: number
  estimatedDurationMinutes?: number
  convertedInvoiceId?: string
  convertedAt?: string
  acceptedAt?: string
  rejectedAt?: string
  customerResponseComment?: string
  version: number
  createdBy?: string
  createdAt: string
  updatedAt: string
  items?: QuotationItem[]
}

export interface QuotationShare {
  id: string
  salonId: string
  quotationId: string
  tokenHash: string
  createdBy?: string
  createdAt: string
  expiresAt: string
  revokedAt?: string
  revokedBy?: string
  lastAccessedAt?: string
  accessCount: number
  isActive?: boolean
}

export interface PublicQuotationData {
  valid: boolean
  salon: {
    name: string
    phone: string
    email: string
    address: string
    gstin?: string
    owner_name?: string
  }
  quotation: {
    id: string
    quotation_number: string
    client_name: string
    client_phone?: string
    client_email?: string
    issue_date: string
    valid_until: string
    status: QuotationStatus
    subtotal: number
    discount_amount: number
    discount_type?: DiscountType
    tax_rate: number
    tax_amount: number
    cgst_amount: number
    sgst_amount: number
    total_amount: number
    customer_notes?: string
    terms_and_conditions?: string
    advance_required?: number
    estimated_duration_minutes?: number
    accepted_at?: string
    rejected_at?: string
  }
  line_items: Array<{
    id?: string
    item_type: QuotationItemType
    name: string
    description?: string
    staff_name?: string
    quantity: number
    unit_price: number
    discount_amount: number
    taxable_amount: number
    tax_rate: number
    tax_amount: number
    total_price: number
    is_custom?: boolean
  }>
  share_metadata: {
    expires_at: string
    access_count: number
  }
}

export interface ProformaItem {
  id?: string
  proformaId?: string
  name: string
  description?: string
  itemType: string
  staffName?: string
  quantity: number
  unitPrice: number
  discountAmount: number
  taxRate: number
  taxAmount: number
  totalPrice: number
  sortOrder?: number
}

export interface ProformaInvoice {
  id: string
  salonId: string
  proformaNumber: string
  quotationId?: string
  clientId?: string
  clientName: string
  clientPhone?: string
  clientEmail?: string
  issueDate: string
  validUntil: string
  subtotal: number
  discountAmount: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  totalAmount: number
  status: 'issued' | 'expired' | 'cancelled'
  notes?: string
  termsAndConditions?: string
  createdBy?: string
  createdAt: string
  items?: ProformaItem[]
}

export interface QuotationAuditLog {
  id: string
  salonId: string
  quotationId?: string
  proformaId?: string
  action: string
  actorId?: string
  actorRole?: string
  details: Record<string, any>
  createdAt: string
}




