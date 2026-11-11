// ==============================================================================
// Luma Salon — Purchase & Supplier Management Service
// Phase 6: Suppliers, Purchase Orders, Bills, Goods Receipts, Returns & Ledger
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import type {
  Supplier,
  SupplierFilterOptions,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseBill,
  PurchaseBillItem,
  GoodsReceipt,
  GoodsReceiptItem,
  PurchaseReturn,
  PurchaseReturnItem,
  SupplierPayment,
  SupplierLedgerEntry,
  PurchaseKPIs,
} from '../types/purchases.ts'

export class PurchaseService {
  private getSalonId(): string {
    const session = sessionService.getCurrentSession()
    return session?.salonId || 'salon-luma-01'
  }

  private get client() {
    if (!isSupabaseConfigured() || !supabase) {
      return null
    }
    return supabase
  }

  // ============================================================================
  // 1. SUPPLIERS
  // ============================================================================

  async getSuppliers(filters?: Partial<SupplierFilterOptions>): Promise<Supplier[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) {
      return []
    }

    let query = sb
      .from('suppliers')
      .select('*')
      .eq('salon_id', salonId)
      .order('name', { ascending: true })

    if (filters?.status && filters.status !== 'ALL') {
      query = query.eq('status', filters.status)
    }
    if (filters?.category && filters.category !== 'ALL') {
      query = query.eq('category', filters.category)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch suppliers:', error)
      return []
    }

    // Map rows and enrich with financial aggregates
    const suppliers: Supplier[] = []
    for (const row of data || []) {
      const s = this.mapDbSupplier(row)
      // Fetch latest running balance
      const { data: ledgerData } = await sb
        .from('supplier_ledger')
        .select('running_balance')
        .eq('salon_id', salonId)
        .eq('supplier_id', s.id)
        .order('created_at', { ascending: false })
        .limit(1)

      s.outstandingPayable = ledgerData && ledgerData.length > 0 ? Number(ledgerData[0].running_balance) : s.openingBalance

      // Fetch unallocated advance
      const { data: pmtData } = await sb
        .from('supplier_payments')
        .select('unallocated_amount')
        .eq('salon_id', salonId)
        .eq('supplier_id', s.id)

      s.unallocatedAdvance = (pmtData || []).reduce((acc, p) => acc + Number(p.unallocated_amount || 0), 0)

      suppliers.push(s)
    }

    if (filters?.searchQuery) {
      const q = filters.searchQuery.toLowerCase().trim()
      return suppliers.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.supplierCode.toLowerCase().includes(q) ||
          s.phone.toLowerCase().includes(q) ||
          (s.contactPerson && s.contactPerson.toLowerCase().includes(q)) ||
          (s.gstin && s.gstin.toLowerCase().includes(q))
      )
    }

    return suppliers
  }

  async getSupplierById(supplierId: string): Promise<Supplier | null> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return null

    const { data, error } = await sb
      .from('suppliers')
      .select('*')
      .eq('salon_id', salonId)
      .eq('id', supplierId)
      .maybeSingle()

    if (error || !data) return null
    const supplier = this.mapDbSupplier(data)

    // Calculate totals
    const { data: bills } = await sb
      .from('purchase_bills')
      .select('total_amount, paid_amount, balance_due')
      .eq('salon_id', salonId)
      .eq('supplier_id', supplierId)

    supplier.totalPurchases = (bills || []).reduce((sum, b) => sum + Number(b.total_amount || 0), 0)

    const { data: pmts } = await sb
      .from('supplier_payments')
      .select('amount, unallocated_amount')
      .eq('salon_id', salonId)
      .eq('supplier_id', supplierId)

    supplier.totalPayments = (pmts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0)
    supplier.unallocatedAdvance = (pmts || []).reduce((sum, p) => sum + Number(p.unallocated_amount || 0), 0)

    const { data: rets } = await sb
      .from('purchase_returns')
      .select('total_amount')
      .eq('salon_id', salonId)
      .eq('supplier_id', supplierId)

    supplier.totalReturns = (rets || []).reduce((sum, r) => sum + Number(r.total_amount || 0), 0)

    const { data: ledger } = await sb
      .from('supplier_ledger')
      .select('running_balance')
      .eq('salon_id', salonId)
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
      .limit(1)

    supplier.outstandingPayable = ledger && ledger.length > 0 ? Number(ledger[0].running_balance) : supplier.openingBalance

    return supplier
  }

  async saveSupplier(supplierData: Partial<Supplier>): Promise<{ success: boolean; supplierId?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const { data, error } = await sb.rpc('rpc_create_or_update_supplier', {
      p_salon_id: salonId,
      p_supplier_id: supplierData.id || null,
      p_name: supplierData.name,
      p_contact_person: supplierData.contactPerson || null,
      p_phone: supplierData.phone,
      p_email: supplierData.email || null,
      p_address: supplierData.address || null,
      p_city: supplierData.city || null,
      p_state: supplierData.state || null,
      p_pincode: supplierData.pincode || null,
      p_gstin: supplierData.gstin || null,
      p_pan: supplierData.pan || null,
      p_category: supplierData.category || 'General',
      p_opening_balance: supplierData.openingBalance || 0.0,
      p_status: supplierData.status || 'active',
      p_notes: supplierData.notes || null,
    })

    if (error) {
      console.error('Error saving supplier:', error)
      return { success: false, error: error.message }
    }

    return { success: true, supplierId: data.supplier_id }
  }

  // ============================================================================
  // 2. PURCHASE ORDERS
  // ============================================================================

  async getPurchaseOrders(statusFilter?: string): Promise<PurchaseOrder[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    let query = sb
      .from('purchase_orders')
      .select('*, suppliers(name)')
      .eq('salon_id', salonId)
      .order('order_date', { ascending: false })

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch POs:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      poNumber: row.po_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name || 'Unknown Supplier',
      orderDate: row.order_date,
      expectedDeliveryDate: row.expected_delivery_date,
      status: row.status,
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discount_amount),
      taxAmount: Number(row.tax_amount),
      cgstAmount: Number(row.cgst_amount),
      sgstAmount: Number(row.sgst_amount),
      igstAmount: Number(row.igst_amount),
      totalAmount: Number(row.total_amount),
      notes: row.notes,
      termsAndConditions: row.terms_and_conditions,
      createdBy: row.created_by,
      submittedAt: row.submitted_at,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async getPurchaseOrderById(poId: string): Promise<PurchaseOrder | null> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return null

    const { data, error } = await sb
      .from('purchase_orders')
      .select('*, suppliers(name)')
      .eq('salon_id', salonId)
      .eq('id', poId)
      .maybeSingle()

    if (error || !data) return null

    const { data: items } = await sb
      .from('purchase_order_items')
      .select('*')
      .eq('salon_id', salonId)
      .eq('po_id', poId)
      .order('sort_order', { ascending: true })

    return {
      id: data.id,
      salonId: data.salon_id,
      poNumber: data.po_number,
      supplierId: data.supplier_id,
      supplierName: data.suppliers?.name || 'Unknown Supplier',
      orderDate: data.order_date,
      expectedDeliveryDate: data.expected_delivery_date,
      status: data.status,
      subtotal: Number(data.subtotal),
      discountAmount: Number(data.discount_amount),
      taxAmount: Number(data.tax_amount),
      cgstAmount: Number(data.cgst_amount),
      sgstAmount: Number(data.sgst_amount),
      igstAmount: Number(data.igst_amount),
      totalAmount: Number(data.total_amount),
      notes: data.notes,
      termsAndConditions: data.terms_and_conditions,
      createdBy: data.created_by,
      submittedAt: data.submitted_at,
      cancelledAt: data.cancelled_at,
      cancellationReason: data.cancellation_reason,
      version: data.version,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      items: (items || []).map((it) => ({
        id: it.id,
        poId: it.po_id,
        productId: it.product_id,
        itemType: it.item_type,
        name: it.name,
        sku: it.sku,
        unit: it.unit,
        orderedQuantity: Number(it.ordered_quantity),
        receivedQuantity: Number(it.received_quantity || 0),
        unitCost: Number(it.unit_cost),
        discountAmount: Number(it.discount_amount),
        taxableAmount: Number(it.taxable_amount),
        taxRate: Number(it.tax_rate),
        taxAmount: Number(it.tax_amount),
        totalCost: Number(it.total_cost),
        sortOrder: it.sort_order,
      })),
    }
  }

  async createPurchaseOrder(po: {
    supplierId: string
    expectedDeliveryDate?: string
    subtotal: number
    discountAmount: number
    taxAmount: number
    cgstAmount: number
    sgstAmount: number
    igstAmount: number
    totalAmount: number
    notes?: string
    terms?: string
    items: PurchaseOrderItem[]
  }): Promise<{ success: boolean; poId?: string; poNumber?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const mappedItems = po.items.map((it, idx) => ({
      product_id: it.productId || null,
      item_type: it.itemType || 'product',
      name: it.name,
      sku: it.sku || null,
      unit: it.unit || 'pcs',
      ordered_quantity: it.orderedQuantity,
      unit_cost: it.unitCost,
      discount_amount: it.discountAmount || 0,
      taxable_amount: it.taxableAmount || it.orderedQuantity * it.unitCost,
      tax_rate: it.taxRate || 0.18,
      tax_amount: it.taxAmount || 0,
      total_cost: it.totalCost,
      sort_order: idx + 1,
    }))

    const { data, error } = await sb.rpc('rpc_create_purchase_order', {
      p_salon_id: salonId,
      p_supplier_id: po.supplierId,
      p_expected_delivery_date: po.expectedDeliveryDate || null,
      p_subtotal: po.subtotal,
      p_discount_amount: po.discountAmount,
      p_tax_amount: po.taxAmount,
      p_cgst_amount: po.cgstAmount,
      p_sgst_amount: po.sgstAmount,
      p_igst_amount: po.igstAmount,
      p_total_amount: po.totalAmount,
      p_notes: po.notes || null,
      p_terms: po.terms || null,
      p_items: mappedItems,
    })

    if (error) {
      console.error('Error creating purchase order:', error)
      return { success: false, error: error.message }
    }

    return { success: true, poId: data.po_id, poNumber: data.po_number }
  }

  async submitPurchaseOrder(poId: string): Promise<{ success: boolean; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const { error } = await sb.rpc('rpc_submit_purchase_order', {
      p_salon_id: salonId,
      p_po_id: poId,
    })

    if (error) {
      console.error('Error submitting purchase order:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  async cancelPurchaseOrder(poId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const { error } = await sb.rpc('rpc_cancel_purchase_order', {
      p_salon_id: salonId,
      p_po_id: poId,
      p_reason: reason,
    })

    if (error) {
      console.error('Error cancelling purchase order:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  // ============================================================================
  // 3. GOODS RECEIPTS (STOCK INTAKE)
  // ============================================================================

  async getGoodsReceipts(): Promise<GoodsReceipt[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    const { data, error } = await sb
      .from('goods_receipts')
      .select('*, suppliers(name), purchase_orders(po_number)')
      .eq('salon_id', salonId)
      .order('received_date', { ascending: false })

    if (error) {
      console.error('Failed to fetch goods receipts:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      grnNumber: row.grn_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name || 'Unknown Supplier',
      poId: row.po_id,
      poNumber: row.purchase_orders?.po_number,
      billId: row.bill_id,
      receivedDate: row.received_date,
      receivedBy: row.received_by,
      notes: row.notes,
      createdAt: row.created_at,
    }))
  }

  async recordGoodsReceipt(receipt: {
    supplierId: string
    poId?: string
    billId?: string
    receivedBy: string
    notes?: string
    items: GoodsReceiptItem[]
  }): Promise<{ success: boolean; receiptId?: string; grnNumber?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const mappedItems = receipt.items.map((it, idx) => ({
      po_item_id: it.poItemId || null,
      product_id: it.productId,
      ordered_quantity: it.orderedQuantity || 0,
      received_quantity: it.receivedQuantity,
      accepted_quantity: it.acceptedQuantity,
      rejected_quantity: it.rejectedQuantity || 0,
      rejection_reason: it.rejectionReason || null,
      unit_cost: it.unitCost || 0,
      sort_order: idx + 1,
    }))

    const { data, error } = await sb.rpc('rpc_record_goods_receipt', {
      p_salon_id: salonId,
      p_supplier_id: receipt.supplierId,
      p_po_id: receipt.poId || null,
      p_bill_id: receipt.billId || null,
      p_received_by: receipt.receivedBy,
      p_notes: receipt.notes || null,
      p_items: mappedItems,
    })

    if (error) {
      console.error('Error recording goods receipt:', error)
      return { success: false, error: error.message }
    }

    return { success: true, receiptId: data.receipt_id, grnNumber: data.grn_number }
  }

  // ============================================================================
  // 4. PURCHASE BILLS (SUPPLIER INVOICES)
  // ============================================================================

  async getPurchaseBills(statusFilter?: string): Promise<PurchaseBill[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    let query = sb
      .from('purchase_bills')
      .select('*, suppliers(name), purchase_orders(po_number)')
      .eq('salon_id', salonId)
      .order('bill_date', { ascending: false })

    if (statusFilter && statusFilter !== 'ALL') {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch purchase bills:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      billNumber: row.bill_number,
      supplierInvoiceNumber: row.supplier_invoice_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name || 'Unknown Supplier',
      poId: row.po_id,
      poNumber: row.purchase_orders?.po_number,
      billDate: row.bill_date,
      dueDate: row.due_date,
      status: row.status,
      subtotal: Number(row.subtotal),
      discountAmount: Number(row.discount_amount),
      taxAmount: Number(row.tax_amount),
      cgstAmount: Number(row.cgst_amount),
      sgstAmount: Number(row.sgst_amount),
      igstAmount: Number(row.igst_amount),
      additionalCharges: Number(row.additional_charges),
      totalAmount: Number(row.total_amount),
      paidAmount: Number(row.paid_amount),
      balanceDue: Number(row.balance_due),
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
  }

  async createPurchaseBill(bill: {
    supplierId: string
    supplierInvoiceNumber: string
    billDate?: string
    dueDate?: string
    poId?: string
    subtotal: number
    discountAmount: number
    taxAmount: number
    cgstAmount: number
    sgstAmount: number
    igstAmount: number
    additionalCharges: number
    totalAmount: number
    notes?: string
    items: PurchaseBillItem[]
  }): Promise<{ success: boolean; billId?: string; billNumber?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const mappedItems = bill.items.map((it, idx) => ({
      product_id: it.productId || null,
      item_type: it.itemType || 'product',
      name: it.name,
      sku: it.sku || null,
      unit: it.unit || 'pcs',
      quantity: it.quantity,
      unit_cost: it.unitCost,
      discount_amount: it.discountAmount || 0,
      taxable_amount: it.taxableAmount || it.quantity * it.unitCost,
      tax_rate: it.taxRate || 0.18,
      tax_amount: it.taxAmount || 0,
      total_cost: it.totalCost,
      sort_order: idx + 1,
    }))

    const { data, error } = await sb.rpc('rpc_create_purchase_bill', {
      p_salon_id: salonId,
      p_supplier_id: bill.supplierId,
      p_supplier_invoice_number: bill.supplierInvoiceNumber,
      p_bill_date: bill.billDate || null,
      p_due_date: bill.dueDate || null,
      p_po_id: bill.poId || null,
      p_subtotal: bill.subtotal,
      p_discount_amount: bill.discountAmount,
      p_tax_amount: bill.taxAmount,
      p_cgst_amount: bill.cgstAmount,
      p_sgst_amount: bill.sgstAmount,
      p_igst_amount: bill.igstAmount,
      p_additional_charges: bill.additionalCharges,
      p_total_amount: bill.totalAmount,
      p_notes: bill.notes || null,
      p_items: mappedItems,
    })

    if (error) {
      console.error('Error creating purchase bill:', error)
      return { success: false, error: error.message }
    }

    return { success: true, billId: data.bill_id, billNumber: data.bill_number }
  }

  // ============================================================================
  // 5. PURCHASE RETURNS
  // ============================================================================

  async getPurchaseReturns(): Promise<PurchaseReturn[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    const { data, error } = await sb
      .from('purchase_returns')
      .select('*, suppliers(name)')
      .eq('salon_id', salonId)
      .order('return_date', { ascending: false })

    if (error) {
      console.error('Failed to fetch returns:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      returnNumber: row.return_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name || 'Unknown Supplier',
      billId: row.bill_id,
      receiptId: row.receipt_id,
      returnDate: row.return_date,
      status: row.status,
      totalAmount: Number(row.total_amount),
      reason: row.reason,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  async recordPurchaseReturn(returnPayload: {
    supplierId: string
    billId?: string
    receiptId?: string
    reason: string
    notes?: string
    items: PurchaseReturnItem[]
  }): Promise<{ success: boolean; returnId?: string; returnNumber?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const mappedItems = returnPayload.items.map((it, idx) => ({
      product_id: it.productId,
      quantity: it.quantity,
      unit_cost: it.unitCost,
      tax_rate: it.taxRate || 0.18,
      tax_amount: it.taxAmount || 0,
      total_amount: it.totalAmount,
      reason: it.reason || returnPayload.reason,
      sort_order: idx + 1,
    }))

    const { data, error } = await sb.rpc('rpc_record_purchase_return', {
      p_salon_id: salonId,
      p_supplier_id: returnPayload.supplierId,
      p_bill_id: returnPayload.billId || null,
      p_receipt_id: returnPayload.receiptId || null,
      p_reason: returnPayload.reason,
      p_notes: returnPayload.notes || null,
      p_items: mappedItems,
    })

    if (error) {
      console.error('Error recording purchase return:', error)
      return { success: false, error: error.message }
    }

    return { success: true, returnId: data.return_id, returnNumber: data.return_number }
  }

  // ============================================================================
  // 6. SUPPLIER PAYMENTS & ADVANCES
  // ============================================================================

  async getSupplierPayments(supplierId?: string): Promise<SupplierPayment[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    let query = sb
      .from('supplier_payments')
      .select('*, suppliers(name)')
      .eq('salon_id', salonId)
      .order('payment_date', { ascending: false })

    if (supplierId) {
      query = query.eq('supplier_id', supplierId)
    }

    const { data, error } = await query
    if (error) {
      console.error('Failed to fetch supplier payments:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      paymentNumber: row.payment_number,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.name || 'Unknown Supplier',
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
      transactionReference: row.transaction_reference,
      allocatedAmount: Number(row.allocated_amount),
      unallocatedAmount: Number(row.unallocated_amount),
      isAdvance: Boolean(row.is_advance),
      idempotencyKey: row.idempotency_key,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  async recordSupplierPayment(payload: {
    supplierId: string
    amount: number
    paymentMethod: 'cash' | 'upi' | 'bank' | 'card' | 'advance' | 'other'
    transactionReference?: string
    isAdvance?: boolean
    idempotencyKey?: string
    notes?: string
    allocations?: { billId: string; amount: number }[]
  }): Promise<{ success: boolean; paymentId?: string; paymentNumber?: string; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const mappedAllocations = (payload.allocations || []).map((a) => ({
      bill_id: a.billId,
      amount: a.amount,
    }))

    const { data, error } = await sb.rpc('rpc_record_supplier_payment', {
      p_salon_id: salonId,
      p_supplier_id: payload.supplierId,
      p_amount: payload.amount,
      p_payment_method: payload.paymentMethod,
      p_transaction_reference: payload.transactionReference || null,
      p_is_advance: Boolean(payload.isAdvance),
      p_idempotency_key: payload.idempotencyKey || null,
      p_notes: payload.notes || null,
      p_allocations: mappedAllocations,
    })

    if (error) {
      console.error('Error recording supplier payment:', error)
      return { success: false, error: error.message }
    }

    return { success: true, paymentId: data.payment_id, paymentNumber: data.payment_number }
  }

  async allocateSupplierAdvance(paymentId: string, billId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return { success: false, error: 'Database unavailable' }

    const { error } = await sb.rpc('rpc_allocate_supplier_advance', {
      p_salon_id: salonId,
      p_payment_id: paymentId,
      p_bill_id: billId,
      p_amount: amount,
    })

    if (error) {
      console.error('Error allocating supplier advance:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  }

  // ============================================================================
  // 7. SUPPLIER LEDGER
  // ============================================================================

  async getSupplierLedger(supplierId: string): Promise<SupplierLedgerEntry[]> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) return []

    const { data, error } = await sb
      .from('supplier_ledger')
      .select('*')
      .eq('salon_id', salonId)
      .eq('supplier_id', supplierId)
      .order('transaction_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Failed to fetch supplier ledger:', error)
      return []
    }

    return (data || []).map((row) => ({
      id: row.id,
      salonId: row.salon_id,
      supplierId: row.supplier_id,
      transactionType: row.transaction_type,
      transactionDate: row.transaction_date,
      referenceId: row.reference_id,
      description: row.description,
      debit: Number(row.debit),
      credit: Number(row.credit),
      runningBalance: Number(row.running_balance),
      createdBy: row.created_by,
      createdAt: row.created_at,
    }))
  }

  // ============================================================================
  // 8. PURCHASE KPIS
  // ============================================================================

  async getPurchaseKPIs(): Promise<PurchaseKPIs> {
    const salonId = this.getSalonId()
    const sb = this.client
    if (!sb) {
      return {
        totalPurchases: 0,
        pendingOrdersCount: 0,
        partiallyReceivedOrdersCount: 0,
        outstandingBillsValue: 0,
        outstandingBillsCount: 0,
        paymentsMadeTotal: 0,
        supplierAdvancesTotal: 0,
        returnsTotal: 0,
        totalPayableBalance: 0,
      }
    }

    const { data: bills } = await sb
      .from('purchase_bills')
      .select('total_amount, balance_due, status')
      .eq('salon_id', salonId)

    const totalPurchases = (bills || []).reduce((acc, b) => acc + Number(b.total_amount || 0), 0)
    const unpaidBills = (bills || []).filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
    const outstandingBillsValue = unpaidBills.reduce((acc, b) => acc + Number(b.balance_due || 0), 0)
    const outstandingBillsCount = unpaidBills.length

    const { data: orders } = await sb
      .from('purchase_orders')
      .select('status')
      .eq('salon_id', salonId)

    const pendingOrdersCount = (orders || []).filter((o) => o.status === 'draft' || o.status === 'submitted').length
    const partiallyReceivedOrdersCount = (orders || []).filter((o) => o.status === 'partially_received').length

    const { data: payments } = await sb
      .from('supplier_payments')
      .select('amount, unallocated_amount')
      .eq('salon_id', salonId)

    const paymentsMadeTotal = (payments || []).reduce((acc, p) => acc + Number(p.amount || 0), 0)
    const supplierAdvancesTotal = (payments || []).reduce((acc, p) => acc + Number(p.unallocated_amount || 0), 0)

    const { data: returns } = await sb
      .from('purchase_returns')
      .select('total_amount')
      .eq('salon_id', salonId)

    const returnsTotal = (returns || []).reduce((acc, r) => acc + Number(r.total_amount || 0), 0)

    // Calculate total net payable across all suppliers
    const { data: suppliers } = await sb
      .from('suppliers')
      .select('id, opening_balance')
      .eq('salon_id', salonId)

    let totalPayableBalance = 0
    for (const sup of suppliers || []) {
      const { data: lastLedger } = await sb
        .from('supplier_ledger')
        .select('running_balance')
        .eq('salon_id', salonId)
        .eq('supplier_id', sup.id)
        .order('created_at', { ascending: false })
        .limit(1)

      totalPayableBalance += lastLedger && lastLedger.length > 0 ? Number(lastLedger[0].running_balance) : Number(sup.opening_balance || 0)
    }

    return {
      totalPurchases,
      pendingOrdersCount,
      partiallyReceivedOrdersCount,
      outstandingBillsValue,
      outstandingBillsCount,
      paymentsMadeTotal,
      supplierAdvancesTotal,
      returnsTotal,
      totalPayableBalance,
    }
  }

  private mapDbSupplier(row: Record<string, unknown>): Supplier {
    return {
      id: String(row.id),
      salonId: String(row.salon_id),
      supplierCode: String(row.supplier_code),
      name: String(row.name),
      contactPerson: row.contact_person ? String(row.contact_person) : undefined,
      phone: String(row.phone),
      email: row.email ? String(row.email) : undefined,
      address: row.address ? String(row.address) : undefined,
      city: row.city ? String(row.city) : undefined,
      state: row.state ? String(row.state) : undefined,
      pincode: row.pincode ? String(row.pincode) : undefined,
      gstin: row.gstin ? String(row.gstin) : undefined,
      pan: row.pan ? String(row.pan) : undefined,
      category: String(row.category || 'General'),
      openingBalance: Number(row.opening_balance || 0),
      status: row.status as Supplier['status'],
      notes: row.notes ? String(row.notes) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    }
  }
}

export const purchaseService = new PurchaseService()
