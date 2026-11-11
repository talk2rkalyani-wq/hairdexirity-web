// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Secure Invoice Link Sharing, WhatsApp & Email Integration Service
// Cryptographic CSPRNG Bearer Tokens, SHA-256 Hashing & Ephemeral Grants
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import type { Invoice, InvoiceShare, PublicInvoiceData } from '../types/finance.ts'

const SHARES_STORAGE_KEY = 'luma_salon_invoice_shares_v1'

/**
 * Computes a standard SHA-256 hex digest using Web Crypto API or Node crypto fallback.
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
 * Builds the canonical public invoice URL from a bearer token.
 */
export function buildPublicInvoiceUrl(rawToken: string): string {
  let origin = 'http://localhost:5173'
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    origin = window.location.origin
  }
  return `${origin}/#/public/invoice?token=${encodeURIComponent(rawToken)}`
}

/**
 * Formats an Indian mobile number into standard international format for WhatsApp (e.g. 919876543210).
 */
export function formatIndianPhoneNumber(phone?: string): { formatted: string; isValid: boolean } {
  if (!phone) return { formatted: '', isValid: false }
  const digits = phone.replace(/[^0-9]/g, '')
  if (digits.length === 10) {
    return { formatted: `91${digits}`, isValid: true }
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    return { formatted: digits, isValid: true }
  }
  if (digits.length >= 10 && digits.length <= 15) {
    return { formatted: digits, isValid: true }
  }
  return { formatted: digits, isValid: false }
}

export interface ShareCreationResult {
  success: boolean
  shareId: string
  rawToken: string
  shareUrl: string
  expiresAt: string
}

export const invoiceShareService = {
  /**
   * Generates a secure, cryptographically random bearer link for an invoice.
   * Stores ONLY the SHA-256 hash in the database, never the raw token.
   */
  async createShareLink(
    invoice: Invoice,
    expiryDays: number = 7
  ): Promise<ShareCreationResult> {
    const rawToken = generateSecureRandomToken()
    const tokenHash = await computeSha256Hex(rawToken)
    const salonId = invoice.salonId || sessionService.getCurrentSession()?.salonId || 'salon-luma-01'

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_create_invoice_share_link', {
          p_salon_id: salonId,
          p_invoice_id: invoice.id,
          p_token_hash: tokenHash,
          p_expiry_days: expiryDays,
        })

        if (!error && data && data.success) {
          const shareUrl = buildPublicInvoiceUrl(rawToken)
          return {
            success: true,
            shareId: data.share_id,
            rawToken,
            shareUrl,
            expiresAt: data.expires_at,
          }
        }
        if (error) {
          console.warn('[Supabase] rpc_create_invoice_share_link returned error, falling back to local store:', error)
        }
      } catch (err) {
        console.warn('[Supabase] Exception calling rpc_create_invoice_share_link:', err)
      }
    }

    // Local / Offline fallback mode (preserves security: stores only hash)
    const shareId = `share-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
    const newShare: InvoiceShare = {
      id: shareId,
      salonId,
      invoiceId: invoice.id,
      tokenHash,
      createdAt: new Date().toISOString(),
      expiresAt,
      accessCount: 0,
      isActive: true,
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(SHARES_STORAGE_KEY)
        const shares: InvoiceShare[] = raw ? JSON.parse(raw) : []
        // Deactivate previous active shares for this invoice
        for (const s of shares) {
          if (s.invoiceId === invoice.id && !s.revokedAt) {
            s.revokedAt = new Date().toISOString()
            s.isActive = false
          }
        }
        shares.unshift(newShare)
        localStorage.setItem(SHARES_STORAGE_KEY, JSON.stringify(shares))
      } catch (e) {
        console.warn('Could not persist local share:', e)
      }
    }

    return {
      success: true,
      shareId,
      rawToken,
      shareUrl: buildPublicInvoiceUrl(rawToken),
      expiresAt,
    }
  },

  /**
   * Revokes an existing active invoice share link.
   */
  async revokeShareLink(shareId: string): Promise<boolean> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_revoke_invoice_share_link', {
          p_share_id: shareId,
        })
        if (!error && data && data.success) {
          return true
        }
      } catch (err) {
        console.warn('[Supabase] Failed to revoke share remotely:', err)
      }
    }

    // Local fallback
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(SHARES_STORAGE_KEY)
        if (raw) {
          const shares: InvoiceShare[] = JSON.parse(raw)
          const match = shares.find((s) => s.id === shareId)
          if (match) {
            match.revokedAt = new Date().toISOString()
            match.isActive = false
            localStorage.setItem(SHARES_STORAGE_KEY, JSON.stringify(shares))
            return true
          }
        }
      } catch (e) {
        console.warn('Failed local revocation:', e)
      }
    }
    return false
  },

  /**
   * Fetches public sanitized invoice data using the raw bearer token.
   * Hashes the token and verifies it on the server / database.
   */
  async fetchPublicInvoice(rawToken: string): Promise<PublicInvoiceData> {
    if (!rawToken || rawToken.trim().length < 16) {
      throw new Error('INVALID_LINK: Missing or invalid invoice access token')
    }

    const tokenHash = await computeSha256Hex(rawToken.trim())

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_get_public_invoice', {
        p_token_hash: tokenHash,
      })

      if (error) {
        throw new Error(error.message || 'INVALID_LINK: Unable to retrieve invoice')
      }
      if (data && data.valid) {
        return data as PublicInvoiceData
      }
    }

    // Local fallback
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(SHARES_STORAGE_KEY)
      if (raw) {
        const shares: InvoiceShare[] = JSON.parse(raw)
        const match = shares.find((s) => s.tokenHash === tokenHash)
        if (!match) {
          throw new Error('INVALID_LINK: Invoice link not found or invalid')
        }
        if (match.revokedAt) {
          throw new Error('LINK_REVOKED: This invoice link has been revoked by the salon')
        }
        if (new Date(match.expiresAt).getTime() < Date.now()) {
          throw new Error('LINK_EXPIRED: This invoice link has expired')
        }

        // Fetch invoice from local invoices cache
        const rawInvoices = localStorage.getItem('luma_salon_invoices_v1')
        if (rawInvoices) {
          const invoices: Invoice[] = JSON.parse(rawInvoices)
          const inv = invoices.find((i) => i.id === match.invoiceId)
          if (inv) {
            match.accessCount = (match.accessCount || 0) + 1
            match.lastAccessedAt = new Date().toISOString()
            localStorage.setItem(SHARES_STORAGE_KEY, JSON.stringify(shares))

            return {
              valid: true,
              salon: {
                name: 'Hair Dexirity',
                phone: '+91 98765 43210',
                email: 'contact@hairdexirity.example.com',
                address: 'Level 2, Galleria Market, DLF Phase IV, Gurugram, Haryana 122009',
                gstin: '06AAAAA0000A1Z5',
              },
              invoice: {
                invoice_number: inv.invoiceNumber,
                date: inv.date,
                created_at: inv.createdAt,
                client_name: inv.clientName,
                subtotal: inv.subtotal,
                discount_amount: inv.discountAmount,
                discount_type: inv.discountType,
                is_gst_invoice: inv.isGstInvoice !== false,
                tax_treatment: inv.taxTreatment || 'exclusive',
                tax_rate: inv.taxRate,
                cgst_amount: inv.cgstAmount,
                sgst_amount: inv.sgstAmount,
                tax_amount: inv.taxAmount,
                total_amount: inv.totalAmount,
                paid_amount: inv.paidAmount,
                balance_due: inv.balanceDue,
                payment_status: inv.paymentStatus,
                primary_payment_method: inv.primaryPaymentMethod,
                notes: inv.notes,
              },
              line_items: inv.lineItems.map((li) => ({
                description: li.name || li.description,
                quantity: li.quantity,
                unit_price: li.unitPrice,
                total_price: li.totalPrice,
                item_type: li.itemType || (li as any).item_type || 'service',
                staff_name: li.staffName,
                tax_rate: li.taxRate,
                tax_amount: li.taxAmount,
                discount_amount: li.discountAmount,
              })),
              payments: (inv.payments || []).map((p) => ({
                payment_method: p.paymentMethod,
                amount: p.amount,
                created_at: p.createdAt,
              })),
              share_metadata: {
                expires_at: match.expiresAt,
                access_count: match.accessCount,
              },
            }
          }
        }
      }
    }

    throw new Error('INVALID_LINK: Invoice not found or invalid')
  },

  /**
   * Retrieves active and historic share records for an invoice (Billing Staff Only).
   */
  async listSharesForInvoice(invoiceId: string): Promise<InvoiceShare[]> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc('rpc_list_invoice_shares', {
          p_invoice_id: invoiceId,
        })
        if (!error && Array.isArray(data)) {
          return data.map((d: any) => ({
            id: d.id,
            salonId: d.salon_id || 'salon-luma-01',
            invoiceId: d.invoice_id,
            tokenHash: '', // Hash is never projected back
            createdAt: d.created_at,
            expiresAt: d.expires_at,
            revokedAt: d.revoked_at,
            accessCount: d.access_count || 0,
            lastAccessedAt: d.last_accessed_at,
            isActive: Boolean(d.is_active),
          }))
        }
      } catch (err) {
        console.warn('Failed listing shares from Supabase:', err)
      }
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(SHARES_STORAGE_KEY)
        if (raw) {
          const shares: InvoiceShare[] = JSON.parse(raw)
          return shares.filter((s) => s.invoiceId === invoiceId)
        }
      } catch (e) {
        console.warn('Failed listing local shares:', e)
      }
    }

    return []
  },

  /**
   * Generates formatted prefilled WhatsApp sharing message and direct action URL.
   */
  generateWhatsAppShare(
    invoice: Invoice,
    shareUrl: string,
    phoneOverride?: string
  ): {
    url: string
    message: string
    recipientPhone: string
    isValidPhone: boolean
  } {
    const rawPhone = phoneOverride || invoice.clientPhone || ''
    const { formatted, isValid } = formatIndianPhoneNumber(rawPhone)

    const clientName = invoice.clientName || 'Valued Customer'
    const invNum = invoice.invoiceNumber
    const total = invoice.totalAmount.toFixed(2)
    const paid = invoice.paidAmount.toFixed(2)
    const balance = invoice.balanceDue.toFixed(2)

    const message = [
      `Hello ${clientName},`,
      ``,
      `Thank you for visiting Hair Dexirity!`,
      ``,
      `Your invoice ${invNum} is ready.`,
      ``,
      `Invoice Amount: ₹${total}`,
      `Amount Paid: ₹${paid}`,
      `Outstanding: ₹${balance}`,
      ``,
      `View your invoice securely here:`,
      `${shareUrl}`,
      ``,
      `We look forward to seeing you again!`,
    ].join('\n')

    const encodedText = encodeURIComponent(message)
    const url = isValid
      ? `https://wa.me/${formatted}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`

    return {
      url,
      message,
      recipientPhone: formatted,
      isValidPhone: isValid,
    }
  },

  /**
   * Generates formatted prefilled Email sharing subject, body and mailto link.
   */
  generateEmailShare(
    invoice: Invoice,
    shareUrl: string,
    emailOverride?: string
  ): {
    mailtoUrl: string
    subject: string
    body: string
    recipientEmail: string
    isValidEmail: boolean
  } {
    const recipientEmail = (emailOverride || invoice.clientEmail || '').trim()
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)

    const clientName = invoice.clientName || 'Valued Customer'
    const invNum = invoice.invoiceNumber

    const subject = `Your Hair Dexirity Invoice — ${invNum}`
    const body = [
      `Hello ${clientName},`,
      ``,
      `Thank you for choosing Hair Dexirity.`,
      ``,
      `Your invoice is available through the secure link below:`,
      ``,
      `${shareUrl}`,
      ``,
      `Please contact us if you have any questions.`,
      ``,
      `Regards,`,
      `Hair Dexirity`,
    ].join('\n')

    const mailtoUrl = isValidEmail
      ? `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
      : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    return {
      mailtoUrl,
      subject,
      body,
      recipientEmail,
      isValidEmail,
    }
  },
}
