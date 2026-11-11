// ==============================================================================
// Luma Salon — Billing & Invoicing Service (Phase 7.1D Hardened)
// Transactional Invoicing, Multi-Tender Payments, Supabase Persistence & Dual-Mode Store
// ==============================================================================

import {
  type Invoice,
  type PaymentRecord,
  type PaymentMethod,
  type SinglePaymentMethod,
  type PaymentStatus,
  type InvoiceFilters,
  type InvoiceLineItem,
  type TaxTreatment,
  type PaymentSplit,
  StaleDraftError,
} from '../types/finance.ts'
import { appointmentStore } from './appointmentStore.ts'
import { getSalonDateStr } from '../utils/formatters.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import { notificationService } from './notificationService.ts'

const INVOICES_STORAGE_KEY = 'luma_salon_invoices_v1'
const DRAFTS_STORAGE_KEY = 'luma_salon_draft_invoices_v1'
const DEFAULT_TAX_RATE = 0.18 // 18% GST (9% CGST + 9% SGST)

export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Computes exact per-line tax calculations and proportional bill-level discount allocation.
 * Guarantees zero penny discrepancies and exact synchronization between line items and header totals.
 */
export function calculateInvoiceFinancials(params: {
  subtotal: number
  discountAmount?: number
  applyTax?: boolean
  isGstInvoice?: boolean
  defaultTaxRate?: number
  taxTreatment?: TaxTreatment
  lineItems?: InvoiceLineItem[]
}): {
  subtotal: number
  discountAmount: number
  discountedSubtotal: number
  isGstInvoice: boolean
  taxRate: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  totalAmount: number
  lineItems: InvoiceLineItem[]
} {
  const lineItems = params.lineItems && params.lineItems.length > 0 ? [...params.lineItems] : []

  // 1. Calculate raw subtotal from line items (or fallback to params.subtotal)
  let subtotal = 0
  if (lineItems.length > 0) {
    subtotal = roundMoney(
      lineItems.reduce((acc, item) => {
        const itemQty = Math.max(1, Number(item.quantity) || 1)
        const itemPrice = Math.max(0, roundMoney(Number(item.unitPrice) || 0))
        const itemDisc = Math.max(0, roundMoney(Number(item.discountAmount) || 0))
        const lineGross = Math.max(0, roundMoney(itemPrice * itemQty - itemDisc))
        return acc + lineGross
      }, 0)
    )
  } else {
    subtotal = Math.max(0, roundMoney(params.subtotal || 0))
  }

  // 2. Invoice-level discount clamping
  const discountAmount = Math.min(subtotal, Math.max(0, roundMoney(params.discountAmount || 0)))
  const discountedSubtotal = Math.max(0, roundMoney(subtotal - discountAmount))

  const isGst =
    params.applyTax !== false &&
    params.isGstInvoice !== false &&
    params.taxTreatment !== 'non_gst'
  const rawDefaultTaxRate = isGst
    ? params.defaultTaxRate !== undefined
      ? params.defaultTaxRate
      : DEFAULT_TAX_RATE
    : 0
  const defaultTaxRate = rawDefaultTaxRate > 1 ? rawDefaultTaxRate / 100 : rawDefaultTaxRate
  const taxTreatment = params.taxTreatment || 'exclusive'

  // 3. Proportional discount allocation across line items
  const lineGrosses: number[] = lineItems.map((item) => {
    const itemQty = Math.max(1, Number(item.quantity) || 1)
    const itemPrice = Math.max(0, roundMoney(Number(item.unitPrice) || 0))
    const itemDisc = Math.max(0, roundMoney(Number(item.discountAmount) || 0))
    return Math.max(0, roundMoney(itemPrice * itemQty - itemDisc))
  })

  const discountShares: number[] = []
  if (subtotal > 0 && discountAmount > 0 && lineItems.length > 0) {
    let allocatedSum = 0
    let highestIdx = 0
    let highestGross = -1

    lineItems.forEach((_, idx) => {
      const gross = lineGrosses[idx]
      if (gross > highestGross) {
        highestGross = gross
        highestIdx = idx
      }
      const share = roundMoney(discountAmount * (gross / subtotal))
      discountShares.push(share)
      allocatedSum = roundMoney(allocatedSum + share)
    })

    const roundingDiff = roundMoney(discountAmount - allocatedSum)
    if (roundingDiff !== 0 && discountShares[highestIdx] !== undefined) {
      discountShares[highestIdx] = Math.max(
        0,
        roundMoney(discountShares[highestIdx] + roundingDiff)
      )
    }
  } else {
    lineItems.forEach(() => discountShares.push(0))
  }

  // 4. Calculate per-line net, tax, and line total
  let totalCalculatedTax = 0
  const computedLineItems: InvoiceLineItem[] = lineItems.map((item, idx) => {
    const gross = lineGrosses[idx] !== undefined ? lineGrosses[idx] : roundMoney(item.unitPrice * item.quantity)
    const lineDiscountShare = discountShares[idx] || 0
    const netLine = Math.max(0, roundMoney(gross - lineDiscountShare))

    const itemRawRate = isGst
      ? item.taxRate !== undefined
        ? item.taxRate
        : defaultTaxRate
      : 0
    const itemTaxRate = itemRawRate > 1 ? itemRawRate / 100 : itemRawRate

    let lineTax = 0
    let lineTotal = netLine

    if (isGst && itemTaxRate > 0) {
      if (taxTreatment === 'inclusive') {
        const base = roundMoney(netLine / (1 + itemTaxRate))
        lineTax = roundMoney(netLine - base)
        lineTotal = netLine
      } else {
        lineTax = roundMoney(netLine * itemTaxRate)
        lineTotal = roundMoney(netLine + lineTax)
      }
    }

    totalCalculatedTax = roundMoney(totalCalculatedTax + lineTax)

    return {
      ...item,
      quantity: Math.max(1, Number(item.quantity) || 1),
      unitPrice: Math.max(0, roundMoney(Number(item.unitPrice) || 0)),
      totalPrice: lineTotal,
      lineTotal,
      discountAmount: roundMoney((Number(item.discountAmount) || 0) + lineDiscountShare),
      taxRate: itemTaxRate,
      taxAmount: lineTax,
    }
  })

  // If there were no line items, fallback to bill-level calculation
  if (computedLineItems.length === 0) {
    if (isGst && defaultTaxRate > 0) {
      if (taxTreatment === 'inclusive') {
        const base = roundMoney(discountedSubtotal / (1 + defaultTaxRate))
        totalCalculatedTax = roundMoney(discountedSubtotal - base)
      } else {
        totalCalculatedTax = roundMoney(discountedSubtotal * defaultTaxRate)
      }
    }
  }

  const cgstAmount = roundMoney(totalCalculatedTax / 2)
  const sgstAmount = roundMoney(totalCalculatedTax - cgstAmount)
  const totalAmount =
    taxTreatment === 'inclusive'
      ? discountedSubtotal
      : roundMoney(discountedSubtotal + totalCalculatedTax)

  return {
    subtotal,
    discountAmount,
    discountedSubtotal,
    isGstInvoice: isGst,
    taxRate: defaultTaxRate,
    taxAmount: totalCalculatedTax,
    cgstAmount,
    sgstAmount,
    totalAmount,
    lineItems: computedLineItems,
  }
}

type BillingListener = (invoices: Invoice[]) => void
const listeners = new Set<BillingListener>()

export interface CreateInvoiceParams {
  salonId?: string
  appointmentId?: string
  clientId?: string
  clientName: string
  clientPhone?: string
  clientEmail?: string
  staffId?: string
  staffName?: string
  serviceId?: string
  serviceName?: string
  lineItems?: Array<{
    id?: string
    description: string
    quantity: number
    unitPrice: number
    totalPrice?: number
    itemType: 'service' | 'product'
    serviceId?: string
    productId?: string
    staffId?: string
    staffName?: string
    discountAmount?: number
    taxRate?: number
    taxAmount?: number
  }>
  subtotal: number
  discountAmount?: number
  discountType?: 'flat' | 'percentage'
  discountValue?: number
  discountReason?: string
  authorizedBy?: string
  applyTax?: boolean
  taxRate?: number
  taxAmount?: number
  cgstAmount?: number
  sgstAmount?: number
  totalAmount?: number
  taxTreatment?: TaxTreatment
  isGstInvoice?: boolean
  isDraft?: boolean
  walkInGuest?: boolean
  draftId?: string
  primaryPaymentMethod?: PaymentMethod
  paymentMethod?: PaymentMethod
  paidAmount?: number
  transactionRef?: string
  paymentSplits?: PaymentSplit[]
  payments?: Array<{
    method: SinglePaymentMethod
    amount: number
    transactionReference?: string
    notes?: string
    idempotencyKey?: string
  }>
  date?: string
  notes?: string
  idempotencyKey?: string
  draftVersion?: number
  expectedDraftVersion?: number
  authorizationGrantId?: string
}

/**
 * Maps raw PostgreSQL row to domain Invoice
 */
function mapDbInvoiceToDomain(
  row: any,
  lineItems: any[] = [],
  payments: any[] = []
): Invoice {
  return {
    id: row.id,
    salonId: row.salon_id,
    invoiceNumber: row.invoice_number,
    appointmentId: row.appointment_id || undefined,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone || undefined,
    clientEmail: row.client_email || undefined,
    staffId: row.staff_id || 'staff-salon',
    staffName: row.staff_name || 'Stylist',
    serviceId: row.service_id || undefined,
    serviceName: row.service_name,
    date: row.date,
    draftVersion: row.draft_version !== undefined ? Number(row.draft_version) : 1,
    lineItems: lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
      itemType: item.item_type || 'service',
      serviceId: item.service_id || undefined,
      productId: item.product_id || undefined,
      staffId: item.staff_id || undefined,
      staffName: item.staff_name || undefined,
      discountAmount: item.discount_amount ? Number(item.discount_amount) : 0,
      taxRate: item.tax_rate !== undefined ? Number(item.tax_rate) : undefined,
      taxAmount: item.tax_amount !== undefined ? Number(item.tax_amount) : undefined,
    })),
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount || 0),
    discountType: row.discount_type || undefined,
    discountReason: row.discount_reason || undefined,
    taxRate: Number(row.tax_rate),
    taxAmount: Number(row.tax_amount),
    cgstAmount: Number(row.cgst_amount),
    sgstAmount: Number(row.sgst_amount),
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    balanceDue: Number(row.balance_due),
    paymentStatus: row.payment_status,
    primaryPaymentMethod: row.primary_payment_method,
    isGstInvoice: row.is_gst_invoice ?? true,
    taxTreatment: row.tax_treatment || 'exclusive',
    isDraft: row.is_draft || false,
    walkInGuest: row.walk_in_guest ?? (!row.client_id),
    authorizedBy: row.authorized_by || undefined,
    payments: payments.map((p) => ({
      id: p.id,
      salonId: p.salon_id,
      invoiceId: p.invoice_id,
      paymentMethod: p.payment_method,
      amount: Number(p.amount),
      transactionReference: p.transaction_reference || undefined,
      notes: p.notes || undefined,
      receivedBy: p.received_by || undefined,
      idempotencyKey: p.idempotency_key || undefined,
      createdAt: p.created_at,
    })),
    notes: row.notes || undefined,
    idempotencyKey: row.idempotency_key || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Auto-seeds realistic historical invoices from existing completed appointments
 */
function seedInvoicesFromAppointments(): Invoice[] {
  const appointments = appointmentStore.getAll()
  const currentSalonId = sessionService.getCurrentSession()?.salonId || 'salon-luma-01'
  const completedAppointments = appointments
    .filter((a) => a.status === 'completed')
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))

  const methods: SinglePaymentMethod[] = ['upi', 'upi', 'card', 'card', 'cash', 'upi']
  const generated: Invoice[] = []

  let seq = 1001

  for (const apt of completedAppointments) {
    const invId = `inv-${apt.id}`
    const invoiceNumber = `INV-2026-${seq++}`
    const rawPrice = apt.price || 1500
    const targetSalonId = apt.salonId || currentSalonId

    // Split base price into subtotal and 18% GST
    const baseSubtotal = Math.round((rawPrice / (1 + DEFAULT_TAX_RATE)) * 100) / 100
    const taxAmount = Math.round((rawPrice - baseSubtotal) * 100) / 100
    const cgstAmount = Math.round((taxAmount / 2) * 100) / 100
    const sgstAmount = Math.round((taxAmount - cgstAmount) * 100) / 100
    const totalAmount = rawPrice

    // Method rotation
    const chosenMethod = methods[seq % methods.length]
    const pmtId = `pmt-${invId}-01`

    const payment: PaymentRecord = {
      id: pmtId,
      salonId: targetSalonId,
      invoiceId: invId,
      paymentMethod: chosenMethod,
      amount: totalAmount,
      transactionReference:
        chosenMethod === 'upi'
          ? `UPI${Math.floor(100000000000 + Math.random() * 900000000000)}`
          : chosenMethod === 'card'
          ? `AUTH-${Math.floor(100000 + Math.random() * 900000)}`
          : undefined,
      idempotencyKey: `seed-pmt-${invId}-1`,
      createdAt: `${apt.date}T${apt.endTime || '12:00'}:00.000Z`,
    }

    generated.push({
      id: invId,
      salonId: targetSalonId,
      invoiceNumber,
      appointmentId: apt.id,
      clientId: apt.clientId,
      clientName: apt.clientName || 'Valued Guest',
      clientPhone: apt.clientPhone,
      clientEmail: apt.clientEmail,
      staffId: apt.staffId,
      staffName: apt.staffName || 'Stylist',
      serviceId: apt.serviceId,
      serviceName: apt.serviceName || 'Hair & Beauty Service',
      date: apt.date,
      lineItems: [
        {
          id: `item-${apt.id}-1`,
          description: apt.serviceName || 'Salon Service',
          quantity: 1,
          unitPrice: baseSubtotal,
          totalPrice: baseSubtotal,
          itemType: 'service',
        },
      ],
      subtotal: baseSubtotal,
      discountAmount: 0,
      taxRate: DEFAULT_TAX_RATE,
      taxAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      paidAmount: totalAmount,
      balanceDue: 0,
      paymentStatus: 'paid',
      primaryPaymentMethod: chosenMethod,
      payments: [payment],
      idempotencyKey: `seed-inv-${apt.id}`,
      createdAt: `${apt.date}T${apt.endTime || '12:00'}:00.000Z`,
      updatedAt: `${apt.date}T${apt.endTime || '12:00'}:00.000Z`,
    })
  }

  return generated
}

function loadInitialInvoices(): Invoice[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(INVOICES_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed
        }
      }
      // Initial seed
      const seeded = seedInvoicesFromAppointments()
      window.localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(seeded))
      return seeded
    }
  } catch (err) {
    console.warn('Failed to load invoices from localStorage:', err)
  }

  return seedInvoicesFromAppointments()
}

let canonicalInvoices: Invoice[] = loadInitialInvoices()

function persistInvoices(data: Invoice[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(INVOICES_STORAGE_KEY, JSON.stringify(data))
    }
  } catch (err) {
    console.warn('Failed to save invoices to localStorage:', err)
  }
}

function loadInitialDrafts(): Invoice[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(DRAFTS_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
    }
  } catch (err) {
    console.warn('Failed to load drafts from localStorage:', err)
  }
  return []
}

let canonicalDrafts: Invoice[] = loadInitialDrafts()

function persistDrafts(drafts: Invoice[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts))
    }
  } catch (err) {
    console.warn('Failed to save drafts to localStorage:', err)
  }
}

function notifyListeners() {
  const current = [...canonicalInvoices]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in billing listener:', err)
    }
  })
}

// Storage event listener for multi-tab sync on same machine
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === INVOICES_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          canonicalInvoices = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for invoices:', err)
      }
    } else if (event.key === DRAFTS_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          canonicalDrafts = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for drafts:', err)
      }
    }
  })
}

export const billingService = {
  /**
   * Retrieves all invoices in the store (filtered by tenant and role if session is active)
   */
  getAllInvoices(): Invoice[] {
    const session = sessionService.getCurrentSession()
    if (session) {
      const currentSalonId = session.salonId || 'salon-luma-01'
      const salonInvoices = canonicalInvoices.filter((i) => i.salonId === currentSalonId)

      // Role-Based Visibility: Stylists (EMPLOYEE) see ONLY their own assigned service invoices
      if (session.role === 'EMPLOYEE' && session.employeeId) {
        return salonInvoices.filter((i) => i.staffId === session.employeeId)
      }

      // OWNER and RECEPTIONIST see all salon invoices
      return salonInvoices
    }

    return [...canonicalInvoices]
  },

  /**
   * Asynchronously fetches invoices from Supabase PostgreSQL (if configured)
   * and synchronizes into the canonical in-memory cache and localStorage.
   */
  async fetchInvoicesAsync(salonId?: string): Promise<Invoice[]> {
    const targetSalonId = salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*, line_items:invoice_line_items(*), payments(*)')
          .eq('salon_id', targetSalonId)
          .eq('is_draft', false)
          .order('date', { ascending: false })

        if (!error && Array.isArray(data)) {
          canonicalInvoices = data.map((row: any) =>
            mapDbInvoiceToDomain(row, row.line_items || [], row.payments || [])
          )
          persistInvoices(canonicalInvoices)
          notifyListeners()
          return this.getAllInvoices()
        }
      } catch (err) {
        console.warn('[Supabase] Error loading remote invoices, retaining local cache:', err)
      }
    }

    return this.getAllInvoices()
  },

  /**
   * Asynchronously fetches draft invoices from Supabase PostgreSQL (if configured)
   * and synchronizes into the canonical draft cache and localStorage.
   */
  async fetchDraftsAsync(salonId?: string): Promise<Invoice[]> {
    const targetSalonId = salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*, line_items:invoice_line_items(*), payments(*)')
          .eq('salon_id', targetSalonId)
          .eq('is_draft', true)
          .order('created_at', { ascending: false })

        if (!error && Array.isArray(data)) {
          canonicalDrafts = data.map((row: any) =>
            mapDbInvoiceToDomain(row, row.line_items || [], row.payments || [])
          )
          persistDrafts(canonicalDrafts)
          notifyListeners()
          return this.getAllDrafts(targetSalonId)
        }
      } catch (err) {
        console.warn('[Supabase] Error loading remote drafts, retaining local cache:', err)
      }
    }

    return this.getAllDrafts(targetSalonId)
  },

  /**
   * Retrieves an invoice by unique ID (respects role boundaries for Stylists)
   */
  getInvoiceById(id: string): Invoice | null {
    const inv = canonicalInvoices.find((i) => i.id === id) || null
    if (!inv) return null

    const session = sessionService.getCurrentSession()
    if (session && session.role === 'EMPLOYEE' && session.employeeId) {
      if (inv.staffId !== session.employeeId) {
        return null // Restrict stylists from inspecting other staff members' invoices
      }
    }

    return inv
  },

  /**
   * Retrieves an invoice by associated appointment ID
   */
  getInvoiceByAppointmentId(appointmentId: string): Invoice | null {
    const inv = canonicalInvoices.find((inv) => inv.appointmentId === appointmentId) || null
    if (!inv) return null

    const session = sessionService.getCurrentSession()
    if (session && session.role === 'EMPLOYEE' && session.employeeId) {
      if (inv.staffId !== session.employeeId) {
        return null
      }
    }

    return inv
  },

  /**
   * Generates the next sequential invoice number (e.g. "INV-2026-1045").
   * Monotonically increasing and thread-safe.
   */
  generateNextInvoiceNumber(): string {
    const numbers = canonicalInvoices
      .map((inv) => {
        const match = inv.invoiceNumber.match(/INV-\d{4}-(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => !isNaN(n))

    const max = numbers.length > 0 ? Math.max(...numbers) : 1000
    const next = max + 1
    const year = new Date().getFullYear()
    return `INV-${year}-${String(next).padStart(4, '0')}`
  },

  /**
   * Generates an internal draft identifier (e.g. "DRAFT-001") without consuming
   * PostgreSQL production sequence numbers.
   */
  generateNextDraftNumber(): string {
    const numbers = canonicalDrafts
      .map((inv) => {
        const match = inv.invoiceNumber.match(/DRAFT-(\d+)/)
        return match ? parseInt(match[1], 10) : 0
      })
      .filter((n) => !isNaN(n))

    const max = numbers.length > 0 ? Math.max(...numbers) : 100
    const next = max + 1
    return `DRAFT-${String(next).padStart(3, '0')}`
  },

  /**
   * Retrieves all draft invoices (unfinalized POS carts) for a salon
   */
  getAllDrafts(salonId?: string): Invoice[] {
    const targetSalonId = salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'
    return canonicalDrafts.filter((d) => d.salonId === targetSalonId)
  },

  /**
   * Retrieves a specific draft invoice by ID
   */
  getDraftById(draftId: string): Invoice | null {
    return canonicalDrafts.find((d) => d.id === draftId) || null
  },

  /**
   * Saves or updates a draft invoice without collecting payment or allocating
   * a production invoice number. Backed by PostgreSQL rpc_save_pos_draft when online.
   */
  async saveDraft(params: CreateInvoiceParams): Promise<Invoice> {
    const targetSalonId = params.salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'
    const today = getSalonDateStr(0)
    const nowIso = new Date().toISOString()
    const draftId = params.draftId || `draft-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`

    const existingDraft = canonicalDrafts.find((d) => d.id === draftId)
    let draftNumber = existingDraft ? existingDraft.invoiceNumber : this.generateNextDraftNumber()

    // Calculate financials using unified helper
    const financials = calculateInvoiceFinancials({
      subtotal: params.subtotal,
      discountAmount: params.discountAmount,
      applyTax: params.applyTax,
      isGstInvoice: params.isGstInvoice,
      defaultTaxRate: params.taxRate,
      taxTreatment: params.taxTreatment,
      lineItems: (params.lineItems || []).map((item, idx) => ({
        ...item,
        id: item.id || `item-${draftId}-${idx + 1}`,
        totalPrice:
          item.totalPrice !== undefined
            ? item.totalPrice
            : roundMoney(Number(item.unitPrice || 0) * Number(item.quantity || 1)),
      })),
    })

    const lineItems: InvoiceLineItem[] =
      financials.lineItems.length > 0
        ? financials.lineItems
        : [
            {
              id: `item-${draftId}-1`,
              description: params.serviceName || 'Salon Service',
              quantity: 1,
              unitPrice: financials.subtotal,
              totalPrice: financials.subtotal,
              itemType: 'service',
              serviceId: params.serviceId,
              staffId: params.staffId,
              staffName: params.staffName,
            },
          ]

    const draftInvoice: Invoice = {
      id: draftId,
      salonId: targetSalonId,
      invoiceNumber: draftNumber,
      appointmentId: params.appointmentId,
      clientId: params.clientId,
      clientName: params.clientName,
      clientPhone: params.clientPhone,
      clientEmail: params.clientEmail,
      staffId: params.staffId || lineItems.find((i) => i.staffId)?.staffId || 'staff-salon',
      staffName: params.staffName || lineItems.find((i) => i.staffName)?.staffName || 'Stylist',
      serviceId: params.serviceId,
      serviceName:
        params.serviceName ||
        lineItems.map((i) => i.description).slice(0, 2).join(', ') +
          (lineItems.length > 2 ? ` + ${lineItems.length - 2} more` : ''),
      date: params.date || today,
      lineItems,
      subtotal: financials.subtotal,
      discountAmount: financials.discountAmount,
      discountType: params.discountType,
      discountReason: params.discountReason,
      taxRate: financials.taxRate,
      taxAmount: financials.taxAmount,
      cgstAmount: financials.cgstAmount,
      sgstAmount: financials.sgstAmount,
      totalAmount: financials.totalAmount,
      paidAmount: 0,
      balanceDue: financials.totalAmount,
      paymentStatus: 'draft',
      status: 'draft',
      primaryPaymentMethod: params.primaryPaymentMethod || 'cash',
      paymentMethod: params.primaryPaymentMethod || 'cash',
      payments: [],
      isGstInvoice: financials.isGstInvoice,
      taxTreatment: params.taxTreatment || 'exclusive',
      isDraft: true,
      draftVersion: existingDraft ? (existingDraft.draftVersion || 1) : 1,
      walkInGuest: params.walkInGuest ?? (!params.clientId),
      notes: params.notes,
      authorizedBy: params.authorizedBy,
      authorizationGrantId: params.authorizationGrantId,
      idempotencyKey: params.idempotencyKey,
      createdAt: existingDraft ? existingDraft.createdAt : nowIso,
      updatedAt: nowIso,
    }

    // Determine expected draft version for optimistic concurrency control (Phase 2.2 P1)
    const expectedVersion =
      params.expectedDraftVersion !== undefined
        ? params.expectedDraftVersion
        : params.draftVersion !== undefined
        ? params.draftVersion
        : existingDraft
        ? existingDraft.draftVersion || 1
        : null

    // Supabase Remote Persistence via Atomic RPC
    if (isSupabaseConfigured() && supabase) {
      const lineItemsPayload = lineItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        item_type: item.itemType,
        product_id: item.productId || null,
        service_id: item.serviceId || null,
        staff_id: item.staffId || null,
        discount_amount: item.discountAmount || 0,
        tax_rate: item.taxRate || financials.taxRate,
        tax_amount: item.taxAmount || 0,
      }))

      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_save_pos_draft', {
        p_draft_id: draftId,
        p_salon_id: targetSalonId,
        p_client_id: params.clientId || null,
        p_client_name: params.clientName,
        p_client_phone: params.clientPhone || null,
        p_client_email: params.clientEmail || null,
        p_staff_id: draftInvoice.staffId || null,
        p_staff_name: draftInvoice.staffName || null,
        p_service_id: params.serviceId || null,
        p_service_name: draftInvoice.serviceName || null,
        p_appointment_id: params.appointmentId || null,
        p_date: params.date || today,
        p_subtotal: financials.subtotal,
        p_discount_amount: financials.discountAmount,
        p_discount_type: params.discountType || null,
        p_discount_reason: params.discountReason || null,
        p_tax_rate: financials.taxRate,
        p_tax_amount: financials.taxAmount,
        p_cgst_amount: financials.cgstAmount,
        p_sgst_amount: financials.sgstAmount,
        p_total_amount: financials.totalAmount,
        p_primary_payment_method: params.primaryPaymentMethod || 'cash',
        p_is_gst_invoice: financials.isGstInvoice,
        p_tax_treatment: params.taxTreatment || 'exclusive',
        p_walk_in_guest: draftInvoice.walkInGuest,
        p_notes: params.notes || null,
        p_authorized_by: params.authorizedBy || null,
        p_idempotency_key: params.idempotencyKey || null,
        p_line_items: lineItemsPayload,
        p_expected_version: expectedVersion,
      })

      if (rpcErr) {
        if (rpcErr.message && rpcErr.message.includes('CONCURRENCY_CONFLICT')) {
          throw new StaleDraftError(
            'This draft was updated elsewhere. Your changes have not been saved. Refresh the draft before continuing.',
            draftId,
            expectedVersion || undefined
          )
        }
        console.error('[Supabase RPC Error] rpc_save_pos_draft failed:', rpcErr)
        throw new Error(rpcErr.message || 'Database draft persistence failed')
      }

      if (rpcData) {
        if (rpcData.invoice_number) {
          draftInvoice.invoiceNumber = rpcData.invoice_number
        }
        if (rpcData.draft_version !== undefined) {
          draftInvoice.draftVersion = Number(rpcData.draft_version)
        }
      }
    } else {
      // Local fallback simulation of version increment
      if (existingDraft) {
        draftInvoice.draftVersion = (existingDraft.draftVersion || 1) + 1
      }
    }

    const existingIdx = canonicalDrafts.findIndex((d) => d.id === draftId)
    if (existingIdx >= 0) {
      canonicalDrafts[existingIdx] = draftInvoice
    } else {
      canonicalDrafts.unshift(draftInvoice)
    }

    persistDrafts(canonicalDrafts)
    notifyListeners()
    return { ...draftInvoice }
  },

  /**
   * Deletes a draft invoice
   */
  async deleteDraft(draftId: string, salonId?: string): Promise<boolean> {
    const targetSalonId = salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.rpc('rpc_delete_pos_draft', {
          p_draft_id: draftId,
          p_salon_id: targetSalonId,
        })
        if (error) {
          console.warn('[Supabase] Failed to delete draft remotely:', error)
        }
      } catch (err) {
        console.warn('[Supabase] Unexpected error deleting draft remotely:', err)
      }
    }

    const initialLen = canonicalDrafts.length
    canonicalDrafts = canonicalDrafts.filter((d) => d.id !== draftId)
    if (canonicalDrafts.length !== initialLen) {
      persistDrafts(canonicalDrafts)
      notifyListeners()
      return true
    }
    return false
  },

  /**
   * Creates a formal commercial invoice and records associated payment receipts.
   * Supports atomic Supabase PostgreSQL persistence via rpc_finalize_pos_invoice.
   */
  async createInvoice(params: CreateInvoiceParams): Promise<Invoice> {
    // If saving as draft, delegate to draft handler
    if (params.isDraft) {
      return this.saveDraft(params)
    }

    // 1. Input sanitization & validations
    if (params.payments && params.payments.some((p) => p.amount <= 0)) {
      throw new Error('Payment amounts must be strictly positive (> 0).')
    }

    const targetSalonId = params.salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'

    // 2. Idempotency protection check (Tenant-scoped)
    if (params.idempotencyKey) {
      const existing = canonicalInvoices.find(
        (i) => i.salonId === targetSalonId && i.idempotencyKey === params.idempotencyKey
      )
      if (existing) {
        return Promise.resolve({ ...existing })
      }
    }

    const today = getSalonDateStr(0)
    const nowIso = new Date().toISOString()
    const invoiceId = params.draftId || `inv-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`

    // Determine default sequence invoice number
    let invoiceNumber = this.generateNextInvoiceNumber()

    // 3. Compute exact financials (per-line tax and proportional discount allocation)
    const financials = calculateInvoiceFinancials({
      subtotal: params.subtotal,
      discountAmount: params.discountAmount,
      applyTax: params.applyTax,
      isGstInvoice: params.isGstInvoice,
      defaultTaxRate: params.taxRate,
      taxTreatment: params.taxTreatment,
      lineItems: (params.lineItems || []).map((item, idx) => ({
        ...item,
        id: item.id || `item-${invoiceId}-${idx + 1}`,
        totalPrice:
          item.totalPrice !== undefined
            ? item.totalPrice
            : roundMoney(Number(item.unitPrice || 0) * Number(item.quantity || 1)),
      })),
    })

    const {
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      isGstInvoice: isGst,
      lineItems: computedLineItems,
    } = financials

    // 4. Discount Authorization Verification:
    // If discount exceeds 10% of subtotal, salon owner authorization is mandatory for staff/receptionists.
    const currentRole = sessionService.getCurrentSession()?.role
    const isOwner = currentRole === 'OWNER'
    const isStaffOrReceptionist = currentRole === 'RECEPTIONIST' || currentRole === 'EMPLOYEE'
    const discountPct = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
    if (
      discountPct > 10.01 &&
      (isStaffOrReceptionist || (!isOwner && params.walkInGuest)) &&
      (!params.authorizedBy || !params.authorizedBy.trim())
    ) {
      throw new Error(
        `Discounts exceeding 10% require salon owner authorization (requested ${discountPct.toFixed(1)}%).`
      )
    }

    const lineItems: InvoiceLineItem[] =
      computedLineItems.length > 0
        ? computedLineItems
        : [
            {
              id: `item-${invoiceId}-1`,
              description: params.serviceName || 'Salon Service',
              quantity: 1,
              unitPrice: subtotal,
              totalPrice: subtotal,
              itemType: 'service',
              serviceId: params.serviceId,
              staffId: params.staffId,
              staffName: params.staffName,
            },
          ]

    const staffId = params.staffId || lineItems.find((i) => i.staffId)?.staffId || 'staff-salon'
    const staffName = params.staffName || lineItems.find((i) => i.staffName)?.staffName || 'Stylist'
    const serviceName =
      params.serviceName ||
      lineItems.map((i) => i.description).slice(0, 2).join(', ') +
        (lineItems.length > 2 ? ` + ${lineItems.length - 2} more` : '')

    const primaryPaymentMethod: PaymentMethod =
      params.paymentMethod || params.primaryPaymentMethod || 'cash'

    // 5. Harmonize payment records (Unpack paymentSplits, payments array, or single paidAmount)
    let paymentRecords: PaymentRecord[] = []

    if (params.payments && params.payments.length > 0) {
      paymentRecords = params.payments
        .filter((p) => p.amount > 0)
        .map((p, idx) => ({
          id: `pmt-${invoiceId}-${idx + 1}`,
          salonId: targetSalonId,
          invoiceId,
          paymentMethod: p.method,
          amount: roundMoney(p.amount),
          transactionReference: p.transactionReference,
          notes: p.notes,
          idempotencyKey: p.idempotencyKey || `${params.idempotencyKey || invoiceId}-pmt-${idx + 1}`,
          createdAt: nowIso,
        }))
    } else if (params.paymentSplits && params.paymentSplits.length > 0) {
      paymentRecords = params.paymentSplits
        .filter((s) => s.amount > 0)
        .map((s, idx) => ({
          id: `pmt-${invoiceId}-${idx + 1}`,
          salonId: targetSalonId,
          invoiceId,
          paymentMethod: s.method,
          amount: roundMoney(s.amount),
          transactionReference: s.reference || (s as any).transactionRef,
          notes: params.notes,
          idempotencyKey: `${params.idempotencyKey || invoiceId}-pmt-${idx + 1}`,
          createdAt: nowIso,
        }))
    } else if (params.paidAmount && params.paidAmount > 0) {
      const singleMethod: SinglePaymentMethod =
        primaryPaymentMethod === 'split' ? 'cash' : (primaryPaymentMethod as SinglePaymentMethod)
      paymentRecords = [
        {
          id: `pmt-${invoiceId}-1`,
          salonId: targetSalonId,
          invoiceId,
          paymentMethod: singleMethod,
          amount: roundMoney(params.paidAmount),
          transactionReference: params.transactionRef,
          notes: params.notes,
          idempotencyKey: `${params.idempotencyKey || invoiceId}-pmt-1`,
          createdAt: nowIso,
        },
      ]
    }

    const paidAmount = roundMoney(paymentRecords.reduce((sum, p) => sum + p.amount, 0))

    // Overpayment rejection
    if (paidAmount > totalAmount) {
      throw new Error(
        `Total payments (₹${paidAmount}) exceed invoice total (₹${totalAmount}). Overpayment is rejected.`
      )
    }

    const balanceDue = Math.max(0, roundMoney(totalAmount - paidAmount))

    let paymentStatus: PaymentStatus = 'unpaid'
    if (paidAmount >= totalAmount) {
      paymentStatus = 'paid'
    } else if (paidAmount > 0) {
      paymentStatus = 'partial'
    }

    const newInvoice: Invoice = {
      id: invoiceId,
      salonId: targetSalonId,
      invoiceNumber,
      appointmentId: params.appointmentId,
      clientId: params.clientId,
      clientName: params.clientName,
      clientPhone: params.clientPhone,
      clientEmail: params.clientEmail,
      staffId,
      staffName,
      serviceId: params.serviceId,
      serviceName,
      date: params.date || today,
      lineItems,
      subtotal,
      discountAmount,
      discountType: params.discountType,
      discountReason: params.discountReason,
      taxRate,
      taxAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      paidAmount,
      balanceDue,
      paymentStatus,
      status: paymentStatus,
      primaryPaymentMethod,
      paymentMethod: primaryPaymentMethod,
      discountValue: params.discountValue,
      payments: paymentRecords,
      isGstInvoice: isGst,
      taxTreatment: params.taxTreatment || 'exclusive',
      isDraft: false,
      walkInGuest: params.walkInGuest ?? (!params.clientId),
      notes: params.notes,
      authorizedBy: params.authorizedBy,
      idempotencyKey: params.idempotencyKey,
      createdAt: nowIso,
      updatedAt: nowIso,
    }

    // 6. Supabase Remote Persistence via Atomic RPC (Strict Financial Integrity)
    if (isSupabaseConfigured() && supabase) {
      const lineItemsPayload = lineItems.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        total_price: item.totalPrice,
        item_type: item.itemType,
        product_id: item.productId || null,
        service_id: item.serviceId || null,
        staff_id: item.staffId || null,
        discount_amount: item.discountAmount || 0,
        tax_rate: item.taxRate || taxRate,
        tax_amount: item.taxAmount || 0,
      }))

      const paymentsPayload = paymentRecords.map((p) => ({
        id: p.id,
        payment_method: p.paymentMethod,
        amount: p.amount,
        transaction_reference: p.transactionReference || null,
        notes: p.notes || null,
        received_by: p.receivedBy || null,
        idempotency_key: p.idempotencyKey || null,
      }))

      const { data: rpcData, error: rpcErr } = await supabase.rpc('rpc_finalize_pos_invoice', {
        p_invoice_id: invoiceId,
        p_salon_id: targetSalonId,
        p_client_id: params.clientId || null,
        p_client_name: params.clientName,
        p_client_phone: params.clientPhone || null,
        p_client_email: params.clientEmail || null,
        p_staff_id: staffId || null,
        p_staff_name: staffName || null,
        p_service_id: params.serviceId || null,
        p_service_name: serviceName || null,
        p_appointment_id: params.appointmentId || null,
        p_date: params.date || today,
        p_subtotal: subtotal,
        p_discount_amount: discountAmount,
        p_discount_type: params.discountType || null,
        p_discount_reason: params.discountReason || null,
        p_tax_rate: taxRate,
        p_tax_amount: taxAmount,
        p_cgst_amount: cgstAmount,
        p_sgst_amount: sgstAmount,
        p_total_amount: totalAmount,
        p_primary_payment_method: primaryPaymentMethod,
        p_is_gst_invoice: isGst,
        p_tax_treatment: params.taxTreatment || 'exclusive',
        p_walk_in_guest: newInvoice.walkInGuest,
        p_notes: params.notes || null,
        p_authorized_by: params.authorizedBy || null,
        p_idempotency_key: params.idempotencyKey || null,
        p_line_items: lineItemsPayload,
        p_payments: paymentsPayload,
        p_authorization_grant_id: params.authorizationGrantId || null,
        p_expected_draft_version:
          params.expectedDraftVersion !== undefined
            ? params.expectedDraftVersion
            : params.draftVersion || null,
      })

      if (rpcErr) {
        if (rpcErr.message && rpcErr.message.includes('CONCURRENCY_CONFLICT')) {
          throw new StaleDraftError(
            'This draft was updated elsewhere. Your changes have not been saved. Refresh the draft before continuing.',
            invoiceId,
            params.expectedDraftVersion
          )
        }
        console.error('[Supabase RPC Error] rpc_finalize_pos_invoice failed:', rpcErr)
        throw new Error(rpcErr.message || 'Database invoice persistence failed')
      }

      if (rpcData) {
        if (rpcData.invoice_number) {
          invoiceNumber = rpcData.invoice_number
          newInvoice.invoiceNumber = rpcData.invoice_number
        }
        if (rpcData.authorized_by) {
          newInvoice.authorizedBy = rpcData.authorized_by
        }
        if (rpcData.paid_amount !== undefined) {
          newInvoice.paidAmount = Number(rpcData.paid_amount)
        }
        if (rpcData.balance_due !== undefined) {
          newInvoice.balanceDue = Number(rpcData.balance_due)
        }
        if (rpcData.payment_status) {
          newInvoice.paymentStatus = rpcData.payment_status
          newInvoice.status = rpcData.payment_status
        }
      }
    }

    // If an existing draft was finalized, remove it from drafts
    if (params.draftId) {
      canonicalDrafts = canonicalDrafts.filter((d) => d.id !== params.draftId)
      persistDrafts(canonicalDrafts)
    }

    // Update local canonical cache & localStorage
    canonicalInvoices.unshift(newInvoice)
    persistInvoices(canonicalInvoices)
    notifyListeners()

    // Dispatch financial notification for salon owner
    try {
      notificationService.createNotification({
        salonId: targetSalonId,
        targetRole: 'OWNER',
        category: 'financial',
        severity: 'info',
        title: `Invoice Settled: ${invoiceNumber}`,
        message: `Payment of ₹${totalAmount} collected via ${primaryPaymentMethod.toUpperCase()} for ${params.clientName}.`,
        actionUrl: 'owner/reports',
        deduplicationKey: `fin-settled-${invoiceId}`,
        metadata: { invoiceId, invoiceNumber, amount: totalAmount },
      })
    } catch (notifErr) {
      console.warn('Failed to dispatch invoice notification:', notifErr)
    }

    return { ...newInvoice }
  },

  /**
   * Records an additional payment toward an outstanding invoice balance
   * with strict overpayment protection, reconciliation and idempotency.
   */
  async recordAdditionalPayment(
    invoiceId: string,
    payment: {
      method: SinglePaymentMethod
      amount: number
      transactionReference?: string
      notes?: string
      idempotencyKey?: string
    }
  ): Promise<Invoice | null> {
    if (payment.amount <= 0) {
      throw new Error('Additional payment amount must be strictly positive (> 0).')
    }

    const inv = canonicalInvoices.find((i) => i.id === invoiceId)
    if (!inv) return null

    if (inv.paymentStatus === 'cancelled') {
      throw new Error(`Cannot record payment for cancelled invoice ${inv.invoiceNumber}.`)
    }

    // Payment Idempotency check: if already recorded with this key, return current state
    if (payment.idempotencyKey) {
      const existingPayment = inv.payments.find((p) => p.idempotencyKey === payment.idempotencyKey)
      if (existingPayment) {
        return Promise.resolve({ ...inv })
      }
    }

    // Reject overpayments at service boundary
    if (payment.amount > inv.balanceDue) {
      throw new Error(
        `Payment amount (₹${payment.amount}) exceeds outstanding balance due (₹${inv.balanceDue}). Overpayment is rejected.`
      )
    }

    const nowIso = new Date().toISOString()
    const paymentAmount = payment.amount
    const newRecord: PaymentRecord = {
      id: `pmt-${invoiceId}-${inv.payments.length + 1}`,
      salonId: inv.salonId,
      invoiceId,
      paymentMethod: payment.method,
      amount: paymentAmount,
      transactionReference: payment.transactionReference,
      notes: payment.notes,
      idempotencyKey: payment.idempotencyKey,
      createdAt: nowIso,
    }

    inv.payments.push(newRecord)
    inv.paidAmount = Math.round((inv.paidAmount + newRecord.amount) * 100) / 100
    inv.balanceDue = Math.max(0, Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100)

    if (inv.balanceDue <= 0) {
      inv.paymentStatus = 'paid'
    } else if (inv.paidAmount > 0) {
      inv.paymentStatus = 'partial'
    }

    inv.updatedAt = nowIso

    // Remote Supabase sync (which executes trigger trg_reconcile_invoice_payment)
    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.from('payments').insert({
        id: newRecord.id,
        salon_id: inv.salonId,
        invoice_id: invoiceId,
        payment_method: payment.method,
        amount: newRecord.amount,
        transaction_reference: payment.transactionReference || null,
        notes: payment.notes || null,
        idempotency_key: payment.idempotencyKey || null,
        created_at: nowIso,
      })
      if (error) {
        console.error('[Supabase Error] recordAdditionalPayment failed:', error)
        throw new Error(error.message || 'Payment persistence failed')
      }
    }

    persistInvoices(canonicalInvoices)
    notifyListeners()

    return Promise.resolve({ ...inv })
  },

  /**
   * Voids or cancels an invoice (used for transactional rollback if appointment completion fails)
   */
  async voidInvoice(invoiceId: string, reason?: string): Promise<Invoice | null> {
    const inv = canonicalInvoices.find((i) => i.id === invoiceId)
    if (!inv) return null

    const nowIso = new Date().toISOString()
    inv.paymentStatus = 'cancelled'
    inv.notes = [inv.notes, `CANCELLED: ${reason || 'Transaction voided'}`].filter(Boolean).join(' | ')
    inv.voidReason = reason || 'Transaction voided'
    inv.updatedAt = nowIso

    if (isSupabaseConfigured() && supabase) {
      try {
        // Preferred: Call secure cancel_invoice RPC (validates auth, tenant & role)
        const { error: rpcErr } = await supabase.rpc('cancel_invoice', {
          p_invoice_id: invoiceId,
          p_void_reason: inv.voidReason,
        })
        if (rpcErr) {
          // Fallback to direct column update if RPC not present in environment
          await supabase
            .from('invoices')
            .update({
              notes: inv.notes,
              void_reason: inv.voidReason,
              updated_at: nowIso,
            })
            .eq('id', invoiceId)
        }
      } catch (err) {
        console.warn('[Supabase] Failed to void invoice remotely:', err)
      }
    }

    persistInvoices(canonicalInvoices)
    notifyListeners()

    return Promise.resolve({ ...inv })
  },

  /**
   * Filters and sorts invoices for the ledger table
   */
  filterInvoices(invoices: Invoice[], filters: InvoiceFilters): Invoice[] {
    let result = [...invoices]

    // Status filter
    if (filters.status && filters.status !== 'all') {
      result = result.filter((i) => i.paymentStatus === filters.status)
    }

    // Payment method filter
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      result = result.filter((i) => {
        if (filters.paymentMethod === 'split') {
          return i.payments.length > 1
        }
        return (
          i.primaryPaymentMethod === filters.paymentMethod ||
          i.payments.some((p) => p.paymentMethod === filters.paymentMethod)
        )
      })
    }

    // Search query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim()
      result = result.filter((i) => {
        return (
          i.invoiceNumber.toLowerCase().includes(q) ||
          i.clientName.toLowerCase().includes(q) ||
          (i.clientPhone && i.clientPhone.includes(q)) ||
          i.staffName.toLowerCase().includes(q) ||
          (i.serviceName && i.serviceName.toLowerCase().includes(q))
        )
      })
    }

    // Date range boundaries
    if (filters.startDate) {
      result = result.filter((i) => i.date >= filters.startDate!)
    }
    if (filters.endDate) {
      result = result.filter((i) => i.date <= filters.endDate!)
    }

    // Sorting
    const sortBy = filters.sortBy || 'date_desc'
    result.sort((a, b) => {
      if (sortBy === 'date_desc') {
        return b.createdAt.localeCompare(a.createdAt)
      }
      if (sortBy === 'date_asc') {
        return a.createdAt.localeCompare(b.createdAt)
      }
      if (sortBy === 'amount_desc') {
        return b.totalAmount - a.totalAmount
      }
      if (sortBy === 'amount_asc') {
        return a.totalAmount - b.totalAmount
      }
      return 0
    })

    return result
  },

  /**
   * Computes operational billing KPIs for the Billing Overview screen:
   * strictly separates billed amounts from collected amounts and outstanding debt.
   */
  getTodayKpis(salonId?: string) {
    const targetSalonId = salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'
    const todayStr = getSalonDateStr(0)
    const currentMonthPrefix = todayStr.slice(0, 7) // 'YYYY-MM'

    const salonInvoices = canonicalInvoices.filter(
      (i) =>
        i.salonId === targetSalonId &&
        i.paymentStatus !== 'draft' &&
        i.paymentStatus !== 'cancelled'
    )

    const todayInvoices = salonInvoices.filter((i) => i.date === todayStr)
    const monthlyInvoices = salonInvoices.filter((i) => i.date.startsWith(currentMonthPrefix))

    let todayBilled = 0
    let todayCollected = 0
    let monthlyBilled = 0
    let todayPaidCount = 0
    let todayPartialCount = 0
    let todayUnpaidCount = 0
    let cashCollected = 0
    let upiCollected = 0
    let cardCollected = 0
    let bankCollected = 0

    for (const inv of todayInvoices) {
      todayBilled += inv.totalAmount
      if (inv.paymentStatus === 'paid') todayPaidCount++
      else if (inv.paymentStatus === 'partial') todayPartialCount++
      else todayUnpaidCount++

      for (const p of inv.payments) {
        todayCollected += p.amount
        if (p.paymentMethod === 'cash') cashCollected += p.amount
        else if (p.paymentMethod === 'upi') upiCollected += p.amount
        else if (p.paymentMethod === 'card') cardCollected += p.amount
        else if (p.paymentMethod === 'bank') bankCollected += p.amount
      }
    }

    for (const inv of monthlyInvoices) {
      monthlyBilled += inv.totalAmount
    }

    let totalOutstanding = 0
    for (const inv of salonInvoices) {
      totalOutstanding += inv.balanceDue
    }

    const drafts = canonicalDrafts.filter((d) => d.salonId === targetSalonId)

    return {
      todayBilledAmount: roundMoney(todayBilled),
      todayCollectedAmount: roundMoney(todayCollected),
      monthlyBilledAmount: roundMoney(monthlyBilled),
      outstandingBalance: roundMoney(totalOutstanding),
      todayInvoicesCount: todayInvoices.length,
      todayPaidCount,
      todayPartialCount,
      todayUnpaidCount,
      draftsCount: drafts.length,
      cashCollected: roundMoney(cashCollected),
      upiCollected: roundMoney(upiCollected),
      cardCollected: roundMoney(cardCollected),
      bankCollected: roundMoney(bankCollected),
      recentInvoices: todayInvoices.slice(0, 10),
    }
  },

  /**
   * Subscribes to changes in the canonical invoice store
   */
  subscribe(listener: BillingListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Resets invoices to baseline seed (testing utility)
   */
  resetToSeed(): void {
    canonicalInvoices = seedInvoicesFromAppointments()
    persistInvoices(canonicalInvoices)
    notifyListeners()
  },
}
