// ==============================================================================
// Luma Salon — Purchase & Supplier Management Types
// Phase 6: Suppliers, Purchase Orders, Bills, Goods Receipts, Returns & AP Ledger
// ==============================================================================

export type SupplierStatus = 'active' | 'inactive' | 'archived'

export interface Supplier {
  id: string
  salonId: string
  supplierCode: string
  name: string
  contactPerson?: string
  phone: string
  email?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  gstin?: string
  pan?: string
  category: string
  openingBalance: number
  status: SupplierStatus
  notes?: string
  totalPurchases?: number
  totalPayments?: number
  totalReturns?: number
  outstandingPayable?: number
  unallocatedAdvance?: number
  lastPurchaseDate?: string
  createdAt: string
  updatedAt: string
}

export interface SupplierFilterOptions {
  searchQuery: string
  status: 'ALL' | SupplierStatus
  category: 'ALL' | string
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'submitted'
  | 'partially_received'
  | 'fully_received'
  | 'cancelled'
  | 'closed'

export interface PurchaseOrderItem {
  id?: string
  poId?: string
  productId?: string
  itemType: 'product' | 'consumable' | 'custom'
  name: string
  sku?: string
  unit: string
  orderedQuantity: number
  receivedQuantity?: number
  unitCost: number
  discountAmount?: number
  taxableAmount?: number
  taxRate?: number
  taxAmount?: number
  totalCost: number
  sortOrder?: number
}

export interface PurchaseOrder {
  id: string
  salonId: string
  poNumber: string
  supplierId: string
  supplierName?: string
  orderDate: string
  expectedDeliveryDate?: string
  status: PurchaseOrderStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalAmount: number
  notes?: string
  termsAndConditions?: string
  items?: PurchaseOrderItem[]
  createdBy?: string
  submittedAt?: string
  cancelledAt?: string
  cancellationReason?: string
  version: number
  createdAt: string
  updatedAt: string
}

export type PurchaseBillStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled'

export interface PurchaseBillItem {
  id?: string
  billId?: string
  productId?: string
  itemType: 'product' | 'consumable' | 'custom'
  name: string
  sku?: string
  unit: string
  quantity: number
  unitCost: number
  discountAmount?: number
  taxableAmount?: number
  taxRate?: number
  taxAmount?: number
  totalCost: number
  sortOrder?: number
}

export interface PurchaseBill {
  id: string
  salonId: string
  billNumber: string
  supplierInvoiceNumber: string
  supplierId: string
  supplierName?: string
  poId?: string
  poNumber?: string
  billDate: string
  dueDate: string
  status: PurchaseBillStatus
  subtotal: number
  discountAmount: number
  taxAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  additionalCharges: number
  totalAmount: number
  paidAmount: number
  balanceDue: number
  notes?: string
  items?: PurchaseBillItem[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface GoodsReceiptItem {
  id?: string
  receiptId?: string
  poItemId?: string
  productId: string
  productName?: string
  orderedQuantity: number
  receivedQuantity: number
  acceptedQuantity: number
  rejectedQuantity: number
  rejectionReason?: string
  unitCost: number
  sortOrder?: number
}

export interface GoodsReceipt {
  id: string
  salonId: string
  grnNumber: string
  supplierId: string
  supplierName?: string
  poId?: string
  poNumber?: string
  billId?: string
  receivedDate: string
  receivedBy: string
  notes?: string
  items?: GoodsReceiptItem[]
  createdAt: string
}

export type PurchaseReturnStatus = 'draft' | 'completed' | 'cancelled'

export interface PurchaseReturnItem {
  id?: string
  returnId?: string
  productId: string
  productName?: string
  quantity: number
  unitCost: number
  taxRate?: number
  taxAmount?: number
  totalAmount: number
  reason?: string
  sortOrder?: number
}

export interface PurchaseReturn {
  id: string
  salonId: string
  returnNumber: string
  supplierId: string
  supplierName?: string
  billId?: string
  receiptId?: string
  returnDate: string
  status: PurchaseReturnStatus
  totalAmount: number
  reason: string
  notes?: string
  items?: PurchaseReturnItem[]
  createdBy?: string
  createdAt: string
}

export interface SupplierPaymentAllocation {
  id?: string
  paymentId?: string
  billId: string
  billNumber?: string
  amount: number
  createdAt?: string
}

export interface SupplierPayment {
  id: string
  salonId: string
  paymentNumber: string
  supplierId: string
  supplierName?: string
  amount: number
  paymentDate: string
  paymentMethod: 'cash' | 'upi' | 'bank' | 'card' | 'advance' | 'other'
  transactionReference?: string
  allocatedAmount: number
  unallocatedAmount: number
  isAdvance: boolean
  idempotencyKey?: string
  notes?: string
  allocations?: SupplierPaymentAllocation[]
  createdBy?: string
  createdAt: string
}

export type SupplierLedgerTransactionType =
  | 'PURCHASE_BILL'
  | 'SUPPLIER_PAYMENT'
  | 'PURCHASE_RETURN'
  | 'SUPPLIER_ADVANCE'
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT'

export interface SupplierLedgerEntry {
  id: string
  salonId: string
  supplierId: string
  transactionType: SupplierLedgerTransactionType
  transactionDate: string
  referenceId: string
  description: string
  debit: number // Payments, returns, advances reduce payable
  credit: number // Bills, opening balances increase payable
  runningBalance: number
  createdBy?: string
  createdAt: string
}

export interface PurchaseKPIs {
  totalPurchases: number
  pendingOrdersCount: number
  partiallyReceivedOrdersCount: number
  outstandingBillsValue: number
  outstandingBillsCount: number
  paymentsMadeTotal: number
  supplierAdvancesTotal: number
  returnsTotal: number
  totalPayableBalance: number
}

export interface PurchaseAuditLog {
  id: string
  salonId: string
  entityType: 'SUPPLIER' | 'PO' | 'BILL' | 'RECEIPT' | 'RETURN' | 'PAYMENT'
  entityId: string
  action: string
  actorId?: string
  actorRole?: string
  details: Record<string, unknown>
  createdAt: string
}

