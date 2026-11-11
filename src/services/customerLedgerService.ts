// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Customer Ledger, Advances, Allocations, Refunds, Credit Notes & Reconciliation
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import type {
  CustomerAdvance,
  AdvanceAllocation,
  RefundRecord,
  CreditNote,
  CreditNoteAllocation,
  PaymentReminder,
  PaymentReconciliation,
  CustomerLedgerData,
  CustomerLedgerEvent,
  SinglePaymentMethod,
  PaymentRecord,
} from '../types/finance.ts'

const ADVANCES_KEY = 'luma_salon_customer_advances_v1'
const REFUNDS_KEY = 'luma_salon_refunds_v1'
const CREDIT_NOTES_KEY = 'luma_salon_credit_notes_v1'
const RECONCILIATIONS_KEY = 'luma_salon_reconciliations_v1'
const REMINDERS_KEY = 'luma_salon_payment_reminders_v1'

export interface RecordAdvanceParams {
  salonId?: string
  clientId: string
  amount: number
  paymentMethod: SinglePaymentMethod
  transactionReference?: string
  notes?: string
}

export interface AllocateAdvanceParams {
  salonId?: string
  advanceId: string
  invoiceId: string
  amount: number
}

export interface IssueRefundParams {
  salonId?: string
  invoiceId: string
  paymentId?: string
  amount: number
  paymentMethod: SinglePaymentMethod
  reason: string
  ownerEmail?: string
  ownerPassword?: string
}

export interface CreateCreditNoteParams {
  salonId?: string
  originalInvoiceId: string
  reason: string
  items: Array<{
    description: string
    quantity: number
    unitPrice: number
    taxRate?: number
  }>
}

export interface AllocateCreditNoteParams {
  salonId?: string
  creditNoteId: string
  targetInvoiceId: string
  amount: number
}

export interface RecordReconciliationParams {
  salonId?: string
  reconciliationDate: string
  openingCash: number
  actualCash: number
  notes?: string
}

export interface RecordReminderParams {
  salonId?: string
  invoiceId: string
  clientId?: string
  channel: 'whatsapp' | 'email'
  recipientContact: string
  balanceDue: number
}

export class CustomerLedgerService {
  private getActiveSalonId(overrideSalonId?: string): string {
    return (
      overrideSalonId ||
      sessionService.getCurrentSession()?.salonId ||
      'salon-luma-01'
    )
  }

  // --------------------------------------------------------------------------
  // 1. CUSTOMER ADVANCES
  // --------------------------------------------------------------------------

  async recordCustomerAdvance(params: RecordAdvanceParams): Promise<CustomerAdvance> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_record_customer_advance', {
        p_salon_id: salonId,
        p_client_id: params.clientId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod,
        p_transaction_reference: params.transactionReference || null,
        p_notes: params.notes || null,
      })

      if (error) {
        console.error('[RPC Error] rpc_record_customer_advance failed:', error)
        throw new Error(error.message || 'Failed to record customer advance')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        clientId: data.client_id,
        advanceNumber: data.advance_number,
        amount: Number(data.amount),
        remainingAmount: Number(data.remaining_amount),
        paymentMethod: data.payment_method,
        transactionReference: data.transaction_reference,
        notes: data.notes,
        createdAt: data.created_at,
      }
    }

    // Local fallback
    const advance: CustomerAdvance = {
      id: `adv-${Date.now()}`,
      salonId,
      clientId: params.clientId,
      advanceNumber: `ADV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      amount: params.amount,
      remainingAmount: params.amount,
      paymentMethod: params.paymentMethod,
      transactionReference: params.transactionReference,
      notes: params.notes,
      createdAt: new Date().toISOString(),
    }
    const current = this.getLocalStore<CustomerAdvance>(ADVANCES_KEY)
    current.unshift(advance)
    this.saveLocalStore(ADVANCES_KEY, current)
    return advance
  }

  async listCustomerAdvances(salonId?: string, clientId?: string): Promise<CustomerAdvance[]> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('customer_advances')
        .select(`
          id,
          salon_id,
          client_id,
          advance_number,
          amount,
          remaining_amount,
          payment_method,
          transaction_reference,
          notes,
          created_by,
          created_at,
          clients ( name )
        `)
        .eq('salon_id', activeSalonId)
        .order('created_at', { ascending: false })

      if (clientId) {
        query = query.eq('client_id', clientId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[Supabase Error] listCustomerAdvances failed:', error)
        throw error
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        clientId: row.client_id,
        advanceNumber: row.advance_number,
        amount: Number(row.amount),
        remainingAmount: Number(row.remaining_amount),
        paymentMethod: row.payment_method,
        transactionReference: row.transaction_reference,
        notes: row.notes,
        createdBy: row.created_by,
        createdAt: row.created_at,
        clientName: row.clients?.name,
      }))
    }

    const localList = this.getLocalStore<CustomerAdvance>(ADVANCES_KEY).filter(
      (a) => a.salonId === activeSalonId && (!clientId || a.clientId === clientId)
    )
    return localList
  }

  async allocateCustomerAdvance(params: AllocateAdvanceParams): Promise<AdvanceAllocation> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_allocate_customer_advance', {
        p_salon_id: salonId,
        p_advance_id: params.advanceId,
        p_invoice_id: params.invoiceId,
        p_amount: params.amount,
      })

      if (error) {
        console.error('[RPC Error] rpc_allocate_customer_advance failed:', error)
        throw new Error(error.message || 'Failed to allocate customer advance')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        advanceId: data.advance_id,
        invoiceId: data.invoice_id,
        paymentId: data.payment_id,
        amount: Number(data.amount),
        allocatedAt: data.allocated_at,
      }
    }

    // Local fallback
    return {
      id: `alloc-${Date.now()}`,
      salonId,
      advanceId: params.advanceId,
      invoiceId: params.invoiceId,
      amount: params.amount,
      allocatedAt: new Date().toISOString(),
    }
  }

  // --------------------------------------------------------------------------
  // 2. REFUND MANAGEMENT
  // --------------------------------------------------------------------------

  async issueRefund(params: IssueRefundParams): Promise<RefundRecord> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_issue_refund', {
        p_salon_id: salonId,
        p_invoice_id: params.invoiceId,
        p_amount: params.amount,
        p_payment_method: params.paymentMethod,
        p_reason: params.reason,
        p_payment_id: params.paymentId || null,
        p_owner_email: params.ownerEmail || null,
        p_owner_password: params.ownerPassword || null,
      })

      if (error) {
        console.error('[RPC Error] rpc_issue_refund failed:', error)
        throw new Error(error.message || 'Failed to issue refund')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        refundNumber: data.refund_number,
        clientId: data.client_id,
        invoiceId: data.invoice_id,
        paymentId: data.payment_id,
        amount: Number(data.amount),
        paymentMethod: data.payment_method,
        reason: data.reason,
        status: data.status,
        createdBy: data.created_by,
        approvedBy: data.approved_by,
        createdAt: data.created_at,
      }
    }

    const refund: RefundRecord = {
      id: `ref-${Date.now()}`,
      salonId,
      refundNumber: `REF-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      invoiceId: params.invoiceId,
      paymentId: params.paymentId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      reason: params.reason,
      status: 'completed',
      createdAt: new Date().toISOString(),
    }
    const current = this.getLocalStore<RefundRecord>(REFUNDS_KEY)
    current.unshift(refund)
    this.saveLocalStore(REFUNDS_KEY, current)
    return refund
  }

  async listRefunds(salonId?: string, clientId?: string, invoiceId?: string): Promise<RefundRecord[]> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('refunds')
        .select(`
          id,
          salon_id,
          refund_number,
          client_id,
          invoice_id,
          payment_id,
          amount,
          payment_method,
          reason,
          status,
          created_by,
          approved_by,
          created_at,
          invoices ( invoice_number ),
          clients ( name )
        `)
        .eq('salon_id', activeSalonId)
        .order('created_at', { ascending: false })

      if (clientId) {
        query = query.eq('client_id', clientId)
      }
      if (invoiceId) {
        query = query.eq('invoice_id', invoiceId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[Supabase Error] listRefunds failed:', error)
        throw error
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        refundNumber: row.refund_number,
        clientId: row.client_id,
        invoiceId: row.invoice_id,
        paymentId: row.payment_id,
        amount: Number(row.amount),
        paymentMethod: row.payment_method,
        reason: row.reason,
        status: row.status,
        createdBy: row.created_by,
        approvedBy: row.approved_by,
        createdAt: row.created_at,
        invoiceNumber: row.invoices?.invoice_number,
        clientName: row.clients?.name,
      }))
    }

    return this.getLocalStore<RefundRecord>(REFUNDS_KEY).filter(
      (r) =>
        r.salonId === activeSalonId &&
        (!clientId || r.clientId === clientId) &&
        (!invoiceId || r.invoiceId === invoiceId)
    )
  }

  // --------------------------------------------------------------------------
  // 3. CREDIT NOTES
  // --------------------------------------------------------------------------

  async createCreditNote(params: CreateCreditNoteParams): Promise<CreditNote> {
    const salonId = this.getActiveSalonId(params.salonId)

    const subtotal = params.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0)
    const taxAmount = Math.round(subtotal * 0.18 * 100) / 100
    const total = subtotal + taxAmount

    if (isSupabaseConfigured() && supabase) {
      const itemsPayload = params.items.map((it) => ({
        description: it.description,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        tax_rate: it.taxRate ?? 0.18,
      }))

      const { data, error } = await supabase.rpc('rpc_create_credit_note', {
        p_salon_id: salonId,
        p_original_invoice_id: params.originalInvoiceId,
        p_amount: total,
        p_reason: params.reason,
        p_items: itemsPayload,
      })

      if (error) {
        console.error('[RPC Error] rpc_create_credit_note failed:', error)
        throw new Error(error.message || 'Failed to create credit note')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        creditNoteNumber: data.credit_note_number,
        originalInvoiceId: data.original_invoice_id,
        clientId: data.client_id,
        issueDate: data.issue_date,
        reason: data.reason,
        subtotal: Number(data.subtotal),
        taxAmount: Number(data.tax_amount),
        totalAmount: Number(data.total_amount),
        allocatedAmount: Number(data.allocated_amount),
        remainingAmount: Number(data.remaining_amount),
        status: data.status,
        createdAt: data.created_at,
      }
    }

    const cn: CreditNote = {
      id: `cn-${Date.now()}`,
      salonId,
      creditNoteNumber: `CN-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`,
      originalInvoiceId: params.originalInvoiceId,
      issueDate: new Date().toISOString().slice(0, 10),
      reason: params.reason,
      subtotal,
      taxAmount,
      totalAmount: total,
      allocatedAmount: 0,
      remainingAmount: total,
      status: 'active',
      createdAt: new Date().toISOString(),
    }
    const current = this.getLocalStore<CreditNote>(CREDIT_NOTES_KEY)
    current.unshift(cn)
    this.saveLocalStore(CREDIT_NOTES_KEY, current)
    return cn
  }

  async listCreditNotes(salonId?: string, clientId?: string): Promise<CreditNote[]> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('credit_notes')
        .select(`
          id,
          salon_id,
          credit_note_number,
          original_invoice_id,
          client_id,
          issue_date,
          reason,
          subtotal,
          tax_amount,
          total_amount,
          allocated_amount,
          remaining_amount,
          status,
          created_by,
          created_at,
          invoices ( invoice_number ),
          clients ( name )
        `)
        .eq('salon_id', activeSalonId)
        .order('created_at', { ascending: false })

      if (clientId) {
        query = query.eq('client_id', clientId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[Supabase Error] listCreditNotes failed:', error)
        throw error
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        creditNoteNumber: row.credit_note_number,
        originalInvoiceId: row.original_invoice_id,
        clientId: row.client_id,
        issueDate: row.issue_date,
        reason: row.reason,
        subtotal: Number(row.subtotal),
        taxAmount: Number(row.tax_amount),
        totalAmount: Number(row.total_amount),
        allocatedAmount: Number(row.allocated_amount),
        remainingAmount: Number(row.remaining_amount),
        status: row.status,
        createdBy: row.created_by,
        createdAt: row.created_at,
        invoiceNumber: row.invoices?.invoice_number,
        clientName: row.clients?.name,
      }))
    }

    return this.getLocalStore<CreditNote>(CREDIT_NOTES_KEY).filter(
      (cn) => cn.salonId === activeSalonId && (!clientId || cn.clientId === clientId)
    )
  }

  async allocateCreditNote(params: AllocateCreditNoteParams): Promise<CreditNoteAllocation> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_allocate_credit_note', {
        p_salon_id: salonId,
        p_credit_note_id: params.creditNoteId,
        p_target_invoice_id: params.targetInvoiceId,
        p_amount: params.amount,
      })

      if (error) {
        console.error('[RPC Error] rpc_allocate_credit_note failed:', error)
        throw new Error(error.message || 'Failed to allocate credit note')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        creditNoteId: data.credit_note_id,
        targetInvoiceId: data.target_invoice_id,
        paymentId: data.payment_id,
        amount: Number(data.amount),
        allocatedAt: data.allocated_at,
      }
    }

    return {
      id: `cn-alloc-${Date.now()}`,
      salonId,
      creditNoteId: params.creditNoteId,
      targetInvoiceId: params.targetInvoiceId,
      amount: params.amount,
      allocatedAt: new Date().toISOString(),
    }
  }

  // --------------------------------------------------------------------------
  // 4. CUSTOMER LEDGER & ACCOUNT STATEMENT
  // --------------------------------------------------------------------------

  async getCustomerLedger(
    clientId: string,
    salonId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<CustomerLedgerData> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_get_customer_ledger', {
        p_salon_id: activeSalonId,
        p_client_id: clientId,
        p_start_date: startDate || null,
        p_end_date: endDate || null,
      })

      if (error) {
        console.error('[RPC Error] rpc_get_customer_ledger failed:', error)
        throw new Error(error.message || 'Failed to fetch customer ledger')
      }

      // Calculate running balance chronologically
      let running = 0
      const transactions: CustomerLedgerEvent[] = (data.transactions || []).map(
        (ev: any) => {
          const debit = Number(ev.debit_amount) || 0
          const credit = Number(ev.credit_amount) || 0
          running += debit - credit
          return {
            event_date: ev.event_date,
            event_timestamp: ev.event_timestamp,
            transaction_type: ev.transaction_type,
            reference: ev.reference,
            description: ev.description,
            debit_amount: debit,
            credit_amount: credit,
            payment_method: ev.payment_method,
            running_balance: Math.round(running * 100) / 100,
          }
        }
      )

      return {
        client: data.client,
        summary: {
          total_invoiced: Number(data.summary.total_invoiced) || 0,
          total_paid: Number(data.summary.total_paid) || 0,
          total_outstanding: Number(data.summary.total_outstanding) || 0,
          total_advance: Number(data.summary.total_advance) || 0,
          available_advance: Number(data.summary.available_advance) || 0,
          total_refunds: Number(data.summary.total_refunds) || 0,
          total_credit_notes: Number(data.summary.total_credit_notes) || 0,
          available_credit: Number(data.summary.available_credit) || 0,
          net_customer_balance: Number(data.summary.net_customer_balance) || 0,
        },
        transactions,
      }
    }

    // Local fallback stub
    return {
      client: { id: clientId, name: 'Client' },
      summary: {
        total_invoiced: 0,
        total_paid: 0,
        total_outstanding: 0,
        total_advance: 0,
        available_advance: 0,
        total_refunds: 0,
        total_credit_notes: 0,
        available_credit: 0,
        net_customer_balance: 0,
      },
      transactions: [],
    }
  }

  // --------------------------------------------------------------------------
  // 5. PAYMENT HISTORY REGISTER
  // --------------------------------------------------------------------------

  async listPayments(
    salonId?: string,
    filters?: {
      clientId?: string
      invoiceId?: string
      method?: string
      startDate?: string
      endDate?: string
    }
  ): Promise<
    Array<
      PaymentRecord & {
        invoiceNumber?: string
        clientName?: string
        clientId?: string
      }
    >
  > {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('payments')
        .select(`
          id,
          salon_id,
          invoice_id,
          amount,
          payment_method,
          transaction_reference,
          notes,
          created_at,
          invoices (
            invoice_number,
            client_id,
            clients ( name )
          )
        `)
        .eq('salon_id', activeSalonId)
        .order('created_at', { ascending: false })

      if (filters?.invoiceId) {
        query = query.eq('invoice_id', filters.invoiceId)
      }
      if (filters?.method && filters.method !== 'all') {
        query = query.eq('payment_method', filters.method)
      }
      if (filters?.startDate) {
        query = query.gte('created_at', `${filters.startDate}T00:00:00Z`)
      }
      if (filters?.endDate) {
        query = query.lte('created_at', `${filters.endDate}T23:59:59Z`)
      }

      const { data, error } = await query
      if (error) {
        console.error('[Supabase Error] listPayments failed:', error)
        throw error
      }

      const results = (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        invoiceId: row.invoice_id,
        amount: Number(row.amount),
        paymentMethod: row.payment_method,
        transactionReference: row.transaction_reference,
        notes: row.notes,
        createdAt: row.created_at,
        invoiceNumber: row.invoices?.invoice_number,
        clientId: row.invoices?.client_id,
        clientName: row.invoices?.clients?.name,
      }))

      if (filters?.clientId) {
        return results.filter((r) => r.clientId === filters.clientId)
      }

      return results
    }

    return []
  }

  // --------------------------------------------------------------------------
  // 6. PAYMENT REMINDERS
  // --------------------------------------------------------------------------

  async recordPaymentReminder(params: RecordReminderParams): Promise<PaymentReminder> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('payment_reminders')
        .insert({
          salon_id: salonId,
          invoice_id: params.invoiceId,
          client_id: params.clientId || null,
          channel: params.channel,
          recipient_contact: params.recipientContact,
          balance_due: params.balanceDue,
          status: 'sent',
        })
        .select()
        .single()

      if (error) {
        console.error('[Supabase Error] recordPaymentReminder failed:', error)
        throw error
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        invoiceId: data.invoice_id,
        clientId: data.client_id,
        channel: data.channel,
        recipientContact: data.recipient_contact,
        balanceDue: Number(data.balance_due),
        status: data.status,
        sentAt: data.sent_at,
      }
    }

    const rem: PaymentReminder = {
      id: `rem-${Date.now()}`,
      salonId,
      invoiceId: params.invoiceId,
      clientId: params.clientId,
      channel: params.channel,
      recipientContact: params.recipientContact,
      balanceDue: params.balanceDue,
      status: 'sent',
      sentAt: new Date().toISOString(),
    }
    const current = this.getLocalStore<PaymentReminder>(REMINDERS_KEY)
    current.unshift(rem)
    this.saveLocalStore(REMINDERS_KEY, current)
    return rem
  }

  async listPaymentReminders(salonId?: string, invoiceId?: string): Promise<PaymentReminder[]> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('payment_reminders')
        .select(`
          id,
          salon_id,
          invoice_id,
          client_id,
          channel,
          recipient_contact,
          balance_due,
          status,
          sent_at,
          invoices ( invoice_number ),
          clients ( name )
        `)
        .eq('salon_id', activeSalonId)
        .order('sent_at', { ascending: false })

      if (invoiceId) {
        query = query.eq('invoice_id', invoiceId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[Supabase Error] listPaymentReminders failed:', error)
        throw error
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        invoiceId: row.invoice_id,
        clientId: row.client_id,
        channel: row.channel,
        recipientContact: row.recipient_contact,
        balanceDue: Number(row.balance_due),
        status: row.status,
        sentAt: row.sent_at,
        invoiceNumber: row.invoices?.invoice_number,
        clientName: row.clients?.name,
      }))
    }

    return this.getLocalStore<PaymentReminder>(REMINDERS_KEY).filter(
      (r) => r.salonId === activeSalonId && (!invoiceId || r.invoiceId === invoiceId)
    )
  }

  buildWhatsAppReminderUrl(params: {
    phone: string
    clientName: string
    invoiceNumber: string
    balanceDue: number
    salonName: string
    invoicePublicUrl?: string
  }): string {
    const cleanPhone = params.phone.replace(/[^0-9]/g, '')
    const targetPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone

    const formattedAmount = `Rs. ${params.balanceDue.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

    let text = `Dear ${params.clientName},\n\n`
    text += `Greetings from ${params.salonName}!\n\n`
    text += `This is a gentle payment reminder for Invoice #${params.invoiceNumber}.\n`
    text += `Outstanding Balance: *${formattedAmount}*.\n\n`
    if (params.invoicePublicUrl) {
      text += `View your invoice online:\n${params.invoicePublicUrl}\n\n`
    }
    text += `Kindly settle the balance at your earliest convenience. Thank you!`

    return `https://api.whatsapp.com/send?phone=${encodeURIComponent(
      targetPhone
    )}&text=${encodeURIComponent(text)}`
  }

  buildEmailReminderMailto(params: {
    email: string
    clientName: string
    invoiceNumber: string
    balanceDue: number
    salonName: string
    invoicePublicUrl?: string
  }): string {
    const formattedAmount = `Rs. ${params.balanceDue.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

    const subject = `Payment Reminder: Invoice #${params.invoiceNumber} - ${params.salonName}`
    let body = `Dear ${params.clientName},\n\n`
    body += `This is a reminder regarding the outstanding balance for invoice #${params.invoiceNumber} from ${params.salonName}.\n\n`
    body += `Balance Due: ${formattedAmount}\n\n`
    if (params.invoicePublicUrl) {
      body += `You can review your bill here: ${params.invoicePublicUrl}\n\n`
    }
    body += `Thank you for choosing ${params.salonName}.\nWarm regards,\nManagement`

    return `mailto:${encodeURIComponent(params.email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`
  }

  // --------------------------------------------------------------------------
  // 7. DAILY PAYMENT RECONCILIATION
  // --------------------------------------------------------------------------

  async getDailyReconciliationPreview(dateStr: string, salonId?: string): Promise<{
    date: string
    cashCollected: number
    upiCollected: number
    cardCollected: number
    bankCollected: number
    refundsTotal: number
    netCollections: number
  }> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      // Fetch payments for the date
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('payment_method, amount')
        .eq('salon_id', activeSalonId)
        .gte('created_at', `${dateStr}T00:00:00Z`)
        .lte('created_at', `${dateStr}T23:59:59Z`)

      // Fetch refunds for the date
      const { data: refundsData } = await supabase
        .from('refunds')
        .select('amount')
        .eq('salon_id', activeSalonId)
        .eq('status', 'completed')
        .gte('created_at', `${dateStr}T00:00:00Z`)
        .lte('created_at', `${dateStr}T23:59:59Z`)

      let cash = 0
      let upi = 0
      let card = 0
      let bank = 0

      for (const p of paymentsData || []) {
        const amt = Number(p.amount) || 0
        if (p.payment_method === 'cash') cash += amt
        else if (p.payment_method === 'upi') upi += amt
        else if (p.payment_method === 'card') card += amt
        else if (p.payment_method === 'bank') bank += amt
      }

      let refundsTotal = 0
      for (const r of refundsData || []) {
        refundsTotal += Number(r.amount) || 0
      }

      const netCollections = cash + upi + card + bank - refundsTotal

      return {
        date: dateStr,
        cashCollected: cash,
        upiCollected: upi,
        cardCollected: card,
        bankCollected: bank,
        refundsTotal,
        netCollections,
      }
    }

    return {
      date: dateStr,
      cashCollected: 0,
      upiCollected: 0,
      cardCollected: 0,
      bankCollected: 0,
      refundsTotal: 0,
      netCollections: 0,
    }
  }

  async recordPaymentReconciliation(params: RecordReconciliationParams): Promise<PaymentReconciliation> {
    const salonId = this.getActiveSalonId(params.salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_record_payment_reconciliation', {
        p_salon_id: salonId,
        p_reconciliation_date: params.reconciliationDate,
        p_opening_cash: params.openingCash,
        p_actual_cash: params.actualCash,
        p_notes: params.notes || null,
      })

      if (error) {
        console.error('[RPC Error] rpc_record_payment_reconciliation failed:', error)
        throw new Error(error.message || 'Failed to record daily payment reconciliation')
      }

      return {
        id: data.id,
        salonId: data.salon_id,
        reconciliationDate: data.reconciliation_date,
        openingCash: Number(data.opening_cash),
        cashCollected: Number(data.cash_collected),
        upiCollected: Number(data.upi_collected),
        cardCollected: Number(data.card_collected),
        bankCollected: Number(data.bank_collected),
        refundsTotal: Number(data.refunds_total),
        netCollections: Number(data.net_collections),
        expectedCash: Number(data.expected_cash),
        actualCash: Number(data.actual_cash),
        discrepancy: Number(data.discrepancy),
        status: data.status,
        notes: data.notes,
        preparedBy: data.prepared_by,
        reviewedBy: data.reviewed_by,
        createdAt: data.created_at,
      }
    }

    const rec: PaymentReconciliation = {
      id: `rec-${Date.now()}`,
      salonId,
      reconciliationDate: params.reconciliationDate,
      openingCash: params.openingCash,
      cashCollected: 0,
      upiCollected: 0,
      cardCollected: 0,
      bankCollected: 0,
      refundsTotal: 0,
      netCollections: 0,
      expectedCash: params.openingCash,
      actualCash: params.actualCash,
      discrepancy: params.actualCash - params.openingCash,
      status: params.actualCash === params.openingCash ? 'balanced' : 'discrepancy_reported',
      notes: params.notes,
      createdAt: new Date().toISOString(),
    }
    const current = this.getLocalStore<PaymentReconciliation>(RECONCILIATIONS_KEY)
    current.unshift(rec)
    this.saveLocalStore(RECONCILIATIONS_KEY, current)
    return rec
  }

  async listPaymentReconciliations(salonId?: string): Promise<PaymentReconciliation[]> {
    const activeSalonId = this.getActiveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('payment_reconciliations')
        .select('*')
        .eq('salon_id', activeSalonId)
        .order('reconciliation_date', { ascending: false })

      if (error) {
        console.error('[Supabase Error] listPaymentReconciliations failed:', error)
        throw error
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        salonId: row.salon_id,
        reconciliationDate: row.reconciliation_date,
        openingCash: Number(row.opening_cash),
        cashCollected: Number(row.cash_collected),
        upiCollected: Number(row.upi_collected),
        cardCollected: Number(row.card_collected),
        bankCollected: Number(row.bank_collected),
        refundsTotal: Number(row.refunds_total),
        netCollections: Number(row.net_collections),
        expectedCash: Number(row.expected_cash),
        actualCash: Number(row.actual_cash),
        discrepancy: Number(row.discrepancy),
        status: row.status,
        notes: row.notes,
        preparedBy: row.prepared_by,
        reviewedBy: row.reviewed_by,
        createdAt: row.created_at,
      }))
    }

    return this.getLocalStore<PaymentReconciliation>(RECONCILIATIONS_KEY).filter(
      (r) => r.salonId === activeSalonId
    )
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getLocalStore<T>(key: string): T[] {
    try {
      if (typeof window === 'undefined') return []
      const raw = localStorage.getItem(key)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  private saveLocalStore<T>(key: string, data: T[]): void {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(key, JSON.stringify(data))
    } catch (err) {
      console.warn('LocalStorage save failed:', err)
    }
  }
}

export const customerLedgerService = new CustomerLedgerService()
