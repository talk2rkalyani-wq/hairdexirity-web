// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Quotations, Estimates & Proforma Invoicing Service
// Lifecycle Management, Vector PDF Sharing, Customer Approval & POS Conversion
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import { formatPdfCurrency } from './pdfService.ts'
import type {
  Quotation,
  QuotationItem,
  QuotationStatus,
  PublicQuotationData,
  ProformaInvoice,
} from '../types/finance.ts'

const QUOTATIONS_STORAGE_KEY = 'luma_salon_quotations_v1'

/**
 * Computes a standard SHA-256 hex digest using Web Crypto API.
 */
export async function computeSha256Hex(input: string): Promise<string> {
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : undefined) || (globalThis as any).crypto
  if (cryptoObj && cryptoObj.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  throw new Error('Cryptographic hashing engine unavailable')
}

/**
 * Generates a cryptographically secure random token (32 random bytes -> 64-char hex string).
 */
export function generateSecureRandomToken(): string {
  const bytes = new Uint8Array(32)
  const cryptoObj = (typeof window !== 'undefined' ? window.crypto : undefined) || (globalThis as any).crypto
  if (cryptoObj && cryptoObj.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 32; i++) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Builds the canonical customer-facing URL for quotation review & approval.
 */
export function buildPublicQuotationUrl(rawToken: string): string {
  let origin = 'http://localhost:5173'
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    origin = window.location.origin
  }
  return `${origin}/#/public/quotation?token=${encodeURIComponent(rawToken)}`
}

export interface CreateQuotationParams {
  salonId?: string
  clientId?: string
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  isWalkIn?: boolean
  issueDate?: string
  validUntil?: string
  subtotal: number
  discountAmount?: number
  discountType?: 'flat' | 'percentage'
  discountValue?: number
  discountReason?: string
  authorizationGrantId?: string
  taxTreatment?: 'exclusive' | 'inclusive' | 'non_gst'
  taxRate?: number
  taxAmount?: number
  cgstAmount?: number
  sgstAmount?: number
  totalAmount: number
  customerNotes?: string
  internalNotes?: string
  termsAndConditions?: string
  advanceRequired?: number
  estimatedDurationMinutes?: number
  lineItems: QuotationItem[]
}

export interface UpdateQuotationParams {
  expectedVersion: number
  subtotal: number
  discountAmount: number
  discountType: 'flat' | 'percentage'
  discountValue?: number
  discountReason?: string
  taxRate: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  totalAmount: number
  customerNotes?: string
  internalNotes?: string
  termsAndConditions?: string
  validUntil?: string
  lineItems: QuotationItem[]
}

export interface QuotationShareResult {
  success: boolean
  shareId: string
  rawToken: string
  shareUrl: string
  expiresAt: string
}

export interface QuotationFilters {
  status?: QuotationStatus | 'all'
  searchQuery?: string
  startDate?: string
  endDate?: string
  sortBy?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
}

export class QuotationService {
  private getActiveSalonId(overrideSalonId?: string): string {
    return (
      overrideSalonId ||
      sessionService.getCurrentSession()?.salonId ||
      'salon-luma-01'
    )
  }

  // --------------------------------------------------------------------------
  // Quotation Management & Retrieval
  // --------------------------------------------------------------------------

  async listQuotations(filters?: QuotationFilters, salonIdOverride?: string): Promise<Quotation[]> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase
          .from('quotations')
          .select(`
            *,
            items:quotation_items(*)
          `)
          .eq('salon_id', salonId)

        if (filters?.status && filters.status !== 'all') {
          query = query.eq('status', filters.status)
        }
        if (filters?.startDate) {
          query = query.gte('issue_date', filters.startDate)
        }
        if (filters?.endDate) {
          query = query.lte('issue_date', filters.endDate)
        }
        if (filters?.searchQuery) {
          const s = filters.searchQuery.trim()
          query = query.or(`quotation_number.ilike.%${s}%,client_name.ilike.%${s}%,client_phone.ilike.%${s}%`)
        }

        query = query.order('created_at', { ascending: false })

        const { data, error } = await query
        if (!error && data) {
          return data.map(this.mapDbQuotation)
        }
      } catch (err) {
        console.warn('Database fetch failed for quotations, falling back to local storage:', err)
      }
    }

    // Local Storage Fallback
    try {
      const stored = localStorage.getItem(QUOTATIONS_STORAGE_KEY)
      let quotes: Quotation[] = stored ? JSON.parse(stored) : []
      quotes = quotes.filter((q) => q.salonId === salonId)

      if (filters?.status && filters.status !== 'all') {
        quotes = quotes.filter((q) => q.status === filters.status)
      }
      if (filters?.searchQuery) {
        const sq = filters.searchQuery.toLowerCase().trim()
        quotes = quotes.filter(
          (q) =>
            q.quotationNumber.toLowerCase().includes(sq) ||
            q.clientName.toLowerCase().includes(sq) ||
            (q.clientPhone && q.clientPhone.includes(sq))
        )
      }
      return quotes
    } catch {
      return []
    }
  }

  async getQuotationById(quotationId: string, salonIdOverride?: string): Promise<Quotation | null> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('quotations')
          .select(`
            *,
            items:quotation_items(*)
          `)
          .eq('id', quotationId)
          .eq('salon_id', salonId)
          .single()

        if (!error && data) {
          return this.mapDbQuotation(data)
        }
      } catch (err) {
        console.warn('Database fetch quotation by ID failed:', err)
      }
    }

    try {
      const stored = localStorage.getItem(QUOTATIONS_STORAGE_KEY)
      const quotes: Quotation[] = stored ? JSON.parse(stored) : []
      return quotes.find((q) => q.id === quotationId && q.salonId === salonId) || null
    } catch {
      return null
    }
  }

  // --------------------------------------------------------------------------
  // Quotation Creation & Modification
  // --------------------------------------------------------------------------

  async createQuotation(params: CreateQuotationParams): Promise<Quotation> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_quotation', {
        p_salon_id: salonId,
        p_client_id: params.clientId || null,
        p_client_name: params.clientName || null,
        p_client_phone: params.clientPhone || null,
        p_client_email: params.clientEmail || null,
        p_is_walk_in: Boolean(params.isWalkIn),
        p_issue_date: params.issueDate || new Date().toISOString().split('T')[0],
        p_valid_until: params.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
        p_subtotal: params.subtotal,
        p_discount_amount: params.discountAmount || 0,
        p_discount_type: params.discountType || 'flat',
        p_discount_value: params.discountValue || 0,
        p_discount_reason: params.discountReason || null,
        p_authorization_grant_id: params.authorizationGrantId || null,
        p_tax_treatment: params.taxTreatment || 'exclusive',
        p_tax_rate: params.taxRate ?? 0.18,
        p_tax_amount: params.taxAmount || 0,
        p_cgst_amount: params.cgstAmount || 0,
        p_sgst_amount: params.sgstAmount || 0,
        p_total_amount: params.totalAmount,
        p_customer_notes: params.customerNotes || null,
        p_internal_notes: params.internalNotes || null,
        p_terms_and_conditions: params.termsAndConditions || null,
        p_advance_required: params.advanceRequired || 0,
        p_estimated_duration_minutes: params.estimatedDurationMinutes || 0,
        p_line_items: params.lineItems.map((li) => ({
          item_type: li.itemType,
          service_id: li.serviceId || null,
          product_id: li.productId || null,
          staff_id: li.staffId || null,
          staff_name: li.staffName || null,
          name: li.name,
          description: li.description || null,
          is_custom: Boolean(li.isCustom),
          quantity: li.quantity,
          unit_price: li.unitPrice,
          discount_amount: li.discountAmount || 0,
          taxable_amount: li.taxableAmount,
          tax_rate: li.taxRate,
          tax_amount: li.taxAmount || 0,
          total_price: li.totalPrice,
          sort_order: li.sortOrder || 0,
        })),
      })

      if (error) {
        throw new Error(error.message)
      }

      // Fetch the newly created record with its items
      const quoteId = data.quotation_id || data.id
      const fullQuote = await this.getQuotationById(quoteId, salonId)
      if (fullQuote) return fullQuote
    }

    // Local Storage Mock Creation
    const newId = `quote-${Date.now()}`
    const quoteNum = `QT-2026-${Math.floor(1000 + Math.random() * 9000)}`
    const newQuote: Quotation = {
      id: newId,
      salonId,
      quotationNumber: quoteNum,
      clientId: params.clientId,
      clientName: params.clientName || 'Walk-in Guest',
      clientPhone: params.clientPhone,
      clientEmail: params.clientEmail,
      isWalkIn: Boolean(params.isWalkIn),
      issueDate: params.issueDate || new Date().toISOString().split('T')[0],
      validUntil: params.validUntil || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      subtotal: params.subtotal,
      discountAmount: params.discountAmount || 0,
      discountType: params.discountType,
      discountValue: params.discountValue,
      discountReason: params.discountReason,
      taxTreatment: params.taxTreatment || 'exclusive',
      taxRate: params.taxRate ?? 0.18,
      taxAmount: params.taxAmount || 0,
      cgstAmount: params.cgstAmount || 0,
      sgstAmount: params.sgstAmount || 0,
      totalAmount: params.totalAmount,
      status: 'draft',
      customerNotes: params.customerNotes,
      internalNotes: params.internalNotes,
      termsAndConditions: params.termsAndConditions,
      advanceRequired: params.advanceRequired,
      estimatedDurationMinutes: params.estimatedDurationMinutes,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      items: params.lineItems.map((li, idx) => ({ ...li, id: `item-${Date.now()}-${idx}` })),
    }

    try {
      const stored = localStorage.getItem(QUOTATIONS_STORAGE_KEY)
      const list: Quotation[] = stored ? JSON.parse(stored) : []
      list.unshift(newQuote)
      localStorage.setItem(QUOTATIONS_STORAGE_KEY, JSON.stringify(list))
    } catch {}

    return newQuote
  }

  async updateQuotation(
    quotationId: string,
    expectedVersion: number,
    params: UpdateQuotationParams,
    salonIdOverride?: string
  ): Promise<Quotation> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.rpc('rpc_update_quotation', {
        p_salon_id: salonId,
        p_quotation_id: quotationId,
        p_expected_version: expectedVersion,
        p_subtotal: params.subtotal,
        p_discount_amount: params.discountAmount,
        p_discount_type: params.discountType,
        p_discount_value: params.discountValue || 0,
        p_discount_reason: params.discountReason || null,
        p_tax_rate: params.taxRate,
        p_tax_amount: params.taxAmount,
        p_cgst_amount: params.cgstAmount,
        p_sgst_amount: params.sgstAmount,
        p_total_amount: params.totalAmount,
        p_customer_notes: params.customerNotes || null,
        p_internal_notes: params.internalNotes || null,
        p_terms_and_conditions: params.termsAndConditions || null,
        p_valid_until: params.validUntil || null,
        p_line_items: params.lineItems.map((li) => ({
          item_type: li.itemType,
          service_id: li.serviceId || null,
          product_id: li.productId || null,
          staff_id: li.staffId || null,
          staff_name: li.staffName || null,
          name: li.name,
          description: li.description || null,
          is_custom: Boolean(li.isCustom),
          quantity: li.quantity,
          unit_price: li.unitPrice,
          discount_amount: li.discountAmount || 0,
          taxable_amount: li.taxableAmount,
          tax_rate: li.taxRate,
          tax_amount: li.taxAmount || 0,
          total_price: li.totalPrice,
          sort_order: li.sortOrder || 0,
        })),
      })

      if (error) {
        throw new Error(error.message)
      }

      const updated = await this.getQuotationById(quotationId, salonId)
      if (updated) return updated
    }

    throw new Error('Update requires connected database')
  }

  // --------------------------------------------------------------------------
  // Secure Sharing & Bearer Tokens
  // --------------------------------------------------------------------------

  async createShareLink(
    quotationId: string,
    expiryDays: number = 14,
    salonIdOverride?: string
  ): Promise<QuotationShareResult> {
    const salonId = this.getActiveSalonId(salonIdOverride)
    const rawToken = generateSecureRandomToken()
    const tokenHash = await computeSha256Hex(rawToken)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_quotation_share_link', {
        p_salon_id: salonId,
        p_quotation_id: quotationId,
        p_token_hash: tokenHash,
        p_expiry_days: expiryDays,
      })

      if (error) {
        throw new Error(error.message)
      }

      const shareUrl = buildPublicQuotationUrl(rawToken)
      return {
        success: true,
        shareId: data.share_id,
        rawToken,
        shareUrl,
        expiresAt: data.expires_at,
      }
    }

    // Local Storage Mock
    const shareUrl = buildPublicQuotationUrl(rawToken)
    const expiresAt = new Date(Date.now() + expiryDays * 86400000).toISOString()
    return {
      success: true,
      shareId: `share-${Date.now()}`,
      rawToken,
      shareUrl,
      expiresAt,
    }
  }

  async revokeShareLink(shareId: string): Promise<boolean> {
    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.rpc('rpc_revoke_quotation_share_link', {
        p_share_id: shareId,
      })
      if (error) throw new Error(error.message)
      return true
    }
    return true
  }

  async fetchPublicQuotation(rawToken: string): Promise<PublicQuotationData> {
    const tokenHash = await computeSha256Hex(rawToken)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_get_public_quotation', {
        p_token_hash: tokenHash,
      })

      if (error) {
        throw new Error(error.message)
      }

      return data as PublicQuotationData
    }

    throw new Error('Public quotation viewing requires active database connection')
  }

  async respondToQuotation(
    rawToken: string,
    action: 'accept' | 'reject',
    customerComment?: string
  ): Promise<{ success: boolean; status: QuotationStatus; quotationId: string }> {
    const tokenHash = await computeSha256Hex(rawToken)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_respond_to_quotation', {
        p_token_hash: tokenHash,
        p_action: action,
        p_customer_comment: customerComment || null,
      })

      if (error) {
        throw new Error(error.message)
      }

      return {
        success: true,
        status: data.status,
        quotationId: data.quotation_id,
      }
    }

    throw new Error('Quotation approval requires active database connection')
  }

  // --------------------------------------------------------------------------
  // Conversion to POS Invoice
  // --------------------------------------------------------------------------

  async convertToInvoice(
    quotationId: string,
    salonIdOverride?: string
  ): Promise<{ invoiceId: string; invoiceNumber: string; totalAmount: number }> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_convert_quotation_to_invoice', {
        p_salon_id: salonId,
        p_quotation_id: quotationId,
      })

      if (error) {
        throw new Error(error.message)
      }

      return {
        invoiceId: data.invoice_id,
        invoiceNumber: data.invoice_number,
        totalAmount: Number(data.total_amount),
      }
    }

    throw new Error('Quotation conversion requires active database connection')
  }

  // --------------------------------------------------------------------------
  // Proforma Invoicing
  // --------------------------------------------------------------------------

  async createProformaInvoice(
    quotationId: string,
    salonIdOverride?: string
  ): Promise<{ proformaId: string; proformaNumber: string; totalAmount: number }> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_proforma_invoice', {
        p_salon_id: salonId,
        p_quotation_id: quotationId,
      })

      if (error) {
        throw new Error(error.message)
      }

      return {
        proformaId: data.proforma_id,
        proformaNumber: data.proforma_number,
        totalAmount: Number(data.total_amount),
      }
    }

    throw new Error('Proforma generation requires active database connection')
  }

  async listProformaInvoices(quotationId?: string, salonIdOverride?: string): Promise<ProformaInvoice[]> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      try {
        let query = supabase
          .from('proforma_invoices')
          .select(`
            *,
            items:proforma_invoice_items(*)
          `)
          .eq('salon_id', salonId)

        if (quotationId) {
          query = query.eq('quotation_id', quotationId)
        }

        query = query.order('created_at', { ascending: false })

        const { data, error } = await query
        if (!error && data) {
          return data.map((d: any) => ({
            id: d.id,
            salonId: d.salon_id,
            proformaNumber: d.proforma_number,
            quotationId: d.quotation_id,
            clientId: d.client_id,
            clientName: d.client_name,
            clientPhone: d.client_phone,
            clientEmail: d.client_email,
            issueDate: d.issue_date,
            validUntil: d.valid_until,
            subtotal: Number(d.subtotal),
            discountAmount: Number(d.discount_amount),
            taxAmount: Number(d.tax_amount),
            cgstAmount: Number(d.cgst_amount),
            sgstAmount: Number(d.sgst_amount),
            totalAmount: Number(d.total_amount),
            status: d.status,
            notes: d.notes,
            termsAndConditions: d.terms_and_conditions,
            createdBy: d.created_by,
            createdAt: d.created_at,
            items: (d.items || []).map((i: any) => ({
              id: i.id,
              proformaId: i.proforma_id,
              name: i.name,
              description: i.description,
              itemType: i.item_type,
              staffName: i.staff_name,
              quantity: Number(i.quantity),
              unitPrice: Number(i.unit_price),
              discountAmount: Number(i.discount_amount),
              taxRate: Number(i.tax_rate),
              taxAmount: Number(i.tax_amount),
              totalPrice: Number(i.total_price),
            })),
          }))
        }
      } catch (err) {
        console.warn('Failed to list proforma invoices from db:', err)
      }
    }
    return []
  }

  // --------------------------------------------------------------------------
  // Customer History & Client Integration
  // --------------------------------------------------------------------------

  async getQuotationsForClient(clientId: string, salonIdOverride?: string): Promise<Quotation[]> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('quotations')
          .select(`
            *,
            items:quotation_items(*)
          `)
          .eq('salon_id', salonId)
          .eq('client_id', clientId)
          .order('created_at', { ascending: false })

        if (!error && data) {
          return data.map(this.mapDbQuotation)
        }
      } catch (err) {
        console.warn('Failed to fetch quotations for client from db:', err)
      }
    }

    try {
      const stored = localStorage.getItem(QUOTATIONS_STORAGE_KEY)
      const list: Quotation[] = stored ? JSON.parse(stored) : []
      return list.filter((q) => q.salonId === salonId && q.clientId === clientId)
    } catch {
      return []
    }
  }

  // --------------------------------------------------------------------------
  // Sharing Message Templates (WhatsApp & Email)
  // --------------------------------------------------------------------------

  generateWhatsAppMessage(quote: Quotation, shareUrl: string): string {
    const formattedAmount = formatPdfCurrency(quote.totalAmount)
    return `Hello ${quote.clientName},

Thank you for consulting with Hair Dexirity. Here is your personalized price estimate:

*Estimate Number:* ${quote.quotationNumber}
*Total Amount:* ${formattedAmount}
*Valid Until:* ${quote.validUntil}

Review your itemized estimate and accept online here:
${shareUrl}

If you have any questions or would like to reserve an appointment, please reply to this message.

Warm regards,
*Hair Dexirity Team*`
  }

  generateEmailMessage(quote: Quotation, shareUrl: string): { subject: string; body: string } {
    const formattedAmount = formatPdfCurrency(quote.totalAmount)
    const subject = `Your Personalized Beauty Estimate ${quote.quotationNumber} from Hair Dexirity`
    const body = `Dear ${quote.clientName},

Thank you for choosing Hair Dexirity. We have prepared your tailored quotation for your upcoming salon services and beauty treatments.

ESTIMATE DETAILS:
- Estimate Number: ${quote.quotationNumber}
- Issue Date: ${quote.issueDate}
- Total Estimated Amount: ${formattedAmount}
- Valid Until: ${quote.validUntil}

VIEW & APPROVE YOUR QUOTATION:
You can review the full itemized treatment breakdown, stylist assignments, and securely approve or decline your quote online at:
${shareUrl}

Please let us know if you would like any modifications to your services. We look forward to welcoming you.

Warmest regards,
The Hair Dexirity Concierge Team
Level 2, Galleria Market, DLF Phase IV, Gurugram
Phone: +91 98765 43210`

    return { subject, body }
  }

  // --------------------------------------------------------------------------
  // Private Helpers
  // --------------------------------------------------------------------------

  private mapDbQuotation(d: any): Quotation {
    return {
      id: d.id,
      salonId: d.salon_id,
      quotationNumber: d.quotation_number,
      clientId: d.client_id,
      clientName: d.client_name,
      clientPhone: d.client_phone,
      clientEmail: d.client_email,
      isWalkIn: Boolean(d.is_walk_in),
      issueDate: d.issue_date,
      validUntil: d.valid_until,
      subtotal: Number(d.subtotal),
      discountAmount: Number(d.discount_amount),
      discountType: d.discount_type,
      discountValue: Number(d.discount_value || 0),
      discountReason: d.discount_reason,
      authorizedBy: d.authorized_by,
      authorizationGrantId: d.authorization_grant_id,
      taxTreatment: d.tax_treatment || 'exclusive',
      taxRate: Number(d.tax_rate),
      taxAmount: Number(d.tax_amount),
      cgstAmount: Number(d.cgst_amount),
      sgstAmount: Number(d.sgst_amount),
      totalAmount: Number(d.total_amount),
      status: d.status,
      customerNotes: d.customer_notes,
      internalNotes: d.internal_notes,
      termsAndConditions: d.terms_and_conditions,
      advanceRequired: Number(d.advance_required || 0),
      estimatedDurationMinutes: Number(d.estimated_duration_minutes || 0),
      convertedInvoiceId: d.converted_invoice_id,
      convertedAt: d.converted_at,
      acceptedAt: d.accepted_at,
      rejectedAt: d.rejected_at,
      customerResponseComment: d.customer_response_comment,
      version: Number(d.version || 1),
      createdBy: d.created_by,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
      items: (d.items || []).map((i: any) => ({
        id: i.id,
        quotationId: i.quotation_id,
        itemType: i.item_type,
        serviceId: i.service_id,
        productId: i.product_id,
        staffId: i.staff_id,
        staffName: i.staff_name,
        name: i.name,
        description: i.description,
        isCustom: Boolean(i.is_custom),
        quantity: Number(i.quantity),
        unitPrice: Number(i.unit_price),
        discountAmount: Number(i.discount_amount),
        taxableAmount: Number(i.taxable_amount),
        taxRate: Number(i.tax_rate),
        taxAmount: Number(i.tax_amount),
        totalPrice: Number(i.total_price),
        sortOrder: Number(i.sort_order || 0),
      })),
    }
  }
}

export const quotationService = new QuotationService()
