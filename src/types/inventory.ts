// ==============================================================================
// Luma Salon — Product Inventory Data Models
// Phase 2: Domain Types & Reusable Interfaces
// ==============================================================================

/**
 * Standard salon inventory product categories.
 * Distinct 9 core categories per salon requirements.
 */
export type ProductCategory =
  | 'Hair Care'
  | 'Hair Styling'
  | 'Hair Treatment'
  | 'Nail Products'
  | 'Makeup Products'
  | 'Pedicure Products'
  | 'Manicure Products'
  | 'Beautician Products'
  | 'Other Salon Products'

/**
 * Product stock and availability lifecycle statuses.
 */
export type ProductStatus = 'active' | 'inactive' | 'low_stock' | 'out_of_stock' | 'archived'

/**
 * Standard salon product measurement units.
 */
export type ProductUnit =
  | 'ml'
  | 'g'
  | 'kg'
  | 'oz'
  | 'pcs'
  | 'bottle'
  | 'box'
  | 'kit'
  | 'tube'
  | 'pack'
  | string

/**
 * Salon Inventory Product Domain Model.
 * Fully typed with mandatory tracking fields and appropriate optional fields.
 */
export interface InventoryProduct {
  /** Unique product identifier (e.g., prod-1793361234-5678) */
  id: string

  /** Product title / name (e.g., "Moroccanoil Treatment Original") */
  name: string

  /** Product category from configured salon categories */
  category: ProductCategory

  /** Optional subcategory for fine-grained categorization (e.g., "Argan Oil Serum") */
  subcategory?: string

  /** Manufacturer or brand name (e.g., "L'Oréal Professionnel", "Olaplex", "OPI") */
  brand: string

  /** Detailed product description, usage instructions, or ingredients */
  description?: string

  /** Unit of measurement for volume/weight/packaging (e.g., "ml", "pcs", "bottle") */
  unit: ProductUnit

  /** Unique Stock Keeping Unit / barcode / internal product code */
  sku: string

  /** Optional optical barcode string (UPC, EAN, Code128, QR) */
  barcode?: string

  /** Cost price paid to distributor/supplier per unit (in salon currency) */
  purchasePrice: number

  /** Retail or client service selling price per unit (in salon currency) */
  sellingPrice: number

  /** Current on-hand inventory quantity */
  currentStock: number

  /** Threshold quantity that triggers low-stock warnings */
  minStockThreshold: number

  /** Reorder trigger quantity threshold */
  reorderLevel?: number

  /** Maximum recommended stock capacity */
  maxStockThreshold?: number

  /** Reserved stock for upcoming appointments/orders */
  reservedStock?: number

  /** Whether this product requires batch & expiry monitoring */
  isBatchTracked?: boolean

  /** Weighted Average Cost for financial valuation */
  weightedAverageCost?: number

  /** Product classification: retail merchandise vs salon consumable */
  itemType?: 'retail' | 'consumable'

  /** Default or preferred supplier ID */
  defaultSupplierId?: string

  /** Product GST tax rate (e.g. 0.18) */
  taxRate?: number

  /** Current operational status of the product */
  status: ProductStatus

  /** ISO 8601 creation timestamp */
  createdAt: string

  /** ISO 8601 last update timestamp */
  updatedAt?: string

  /** ISO 8601 archive timestamp (when status is archived) */
  archivedAt?: string

  /** User ID who archived this product */
  archivedBy?: string

  /** Synchronization state with Supabase backend */
  syncStatus?: 'synced' | 'pending' | 'failed'
}

/**
 * Search and filter criteria for inventory queries.
 */
export interface InventoryFilterOptions {
  searchQuery: string
  category: 'ALL' | ProductCategory
  status?: 'ALL' | ProductStatus
}

/**
 * Item in the Live Mode barcode scanner pending batch.
 */
export interface ScannedProductItem {
  id: string
  barcode: string
  name: string
  brand: string
  category: ProductCategory
  sku: string
  unit: ProductUnit
  purchasePrice: number
  sellingPrice: number
  quantity: number
  isNewProduct: boolean
  existingStock?: number
}

/**
 * Valid stock movement audit types
 */
export type StockMovementType =
  | 'OPENING_STOCK'
  | 'STOCK_RECEIVED'
  | 'PURCHASE_RECEIPT'
  | 'STOCK_ADJUSTMENT_IN'
  | 'STOCK_ADJUSTMENT_OUT'
  | 'STOCK_RETURN'
  | 'PURCHASE_RETURN'
  | 'SALE_DEDUCTION'
  | 'CONSUMABLE_USAGE'
  | 'DAMAGE'
  | 'EXPIRY'
  | 'WASTAGE'
  | 'CUSTOMER_RETURN'
  | 'STOCK_TRANSFER'

/**
 * Input payload for manual stock adjustment
 */
export interface StockAdjustmentInput {
  productId: string
  adjustmentType: 'STOCK_ADJUSTMENT_IN' | 'STOCK_ADJUSTMENT_OUT' | 'STOCK_RETURN'
  quantity: number
  notes: string
}

/**
 * Result returned from a committed stock adjustment
 */
export interface StockAdjustmentResult {
  success: boolean
  productId: string
  productName: string
  movementId: string
  adjustmentType: StockMovementType
  quantity: number
  previousStock: number
  newStock: number
  status: ProductStatus
  adjustedAt: string
}

export interface StockMovement {
  id: string
  salonId: string
  productId: string
  productName?: string
  sku?: string
  movementType: StockMovementType
  quantity: number
  quantityIn?: number
  quantityOut?: number
  previousStock: number
  newStock: number
  balanceAfter?: number
  referenceId?: string
  notes?: string
  createdBy?: string
  createdAt: string
  batchId?: string
  unitCost?: number
  totalCost?: number
  sourceDocument?: string
  referenceDocument?: string
}

/**
 * Tab filter for inventory catalog views
 */
export type ProductFilterTab = 'ACTIVE' | 'ARCHIVED'

/**
 * Inventory Batch Model (Shelf-life & Expiry Monitoring)
 */
export interface InventoryBatch {
  id: string
  salonId: string
  productId: string
  productName?: string
  productSku?: string
  batchNumber: string
  supplierId?: string
  supplierName?: string
  goodsReceiptId?: string
  purchaseBillId?: string
  receivedQuantity: number
  currentQuantity: number
  unitCost: number
  manufacturingDate?: string
  expiryDate: string
  status: 'active' | 'near_expiry' | 'expired' | 'quarantined' | 'depleted'
  notes?: string
  createdAt: string
  updatedAt: string
}

/**
 * Salon Consumable Usage Record
 */
export interface ConsumableUsage {
  id: string
  salonId: string
  usageNumber: string
  productId: string
  productName?: string
  productSku?: string
  batchId?: string
  batchNumber?: string
  quantity: number
  unit: string
  appointmentId?: string
  serviceId?: string
  serviceName?: string
  staffId?: string
  staffName?: string
  unitCost: number
  totalCost: number
  reason?: string
  notes?: string
  recordedBy?: string
  createdAt: string
}

/**
 * Stock Loss & Wastage Record
 */
export interface StockLossRecord {
  id: string
  salonId: string
  lossNumber: string
  productId: string
  productName?: string
  productSku?: string
  batchId?: string
  batchNumber?: string
  lossType: 'DAMAGE' | 'EXPIRY' | 'WASTAGE' | 'INTERNAL_LOSS' | 'REJECTION'
  quantity: number
  unitCost: number
  totalCost: number
  reason: string
  supportingNotes?: string
  recordedBy?: string
  approvedBy?: string
  createdAt: string
}

/**
 * Physical Stock Audit Session Header
 */
export interface StockAuditSession {
  id: string
  salonId: string
  auditNumber: string
  title: string
  categoryFilter: string
  itemTypeFilter: string
  status: 'draft' | 'in_progress' | 'completed' | 'reconciled' | 'cancelled'
  totalItemsCounted: number
  totalDiscrepancies: number
  netVarianceQuantity: number
  netVarianceValue: number
  countedBy?: string
  reviewedBy?: string
  approvedBy?: string
  notes?: string
  auditDate: string
  reconciledAt?: string
  createdAt: string
  updatedAt: string
  items?: StockAuditItem[]
}

/**
 * Physical Stock Audit Line Item
 */
export interface StockAuditItem {
  id: string
  salonId: string
  auditId: string
  productId: string
  productName?: string
  sku?: string
  category?: string
  systemQuantity: number
  countedQuantity?: number
  varianceQuantity?: number
  unitCost: number
  varianceValue?: number
  discrepancyReason?: string
  isReconciled: boolean
  createdAt: string
}

/**
 * Inventory Overview KPI aggregates
 */
export interface InventoryKPIs {
  totalProducts: number
  retailSkus: number
  consumableSkus: number
  totalUnits: number
  totalValuation: number
  retailValuation: number
  consumableValuation: number
  lowStockCount: number
  outOfStockCount: number
  expiredBatchesCount: number
  nearExpiryBatchesCount: number
  quarantinedBatchesCount: number
  recentMovements: Array<{
    id: string
    movementType: string
    quantity: number
    previousStock: number
    newStock: number
    referenceId?: string
    createdAt: string
    productName: string
    sku: string
  }>
}

/**
 * Salon Inventory Settings
 */
export interface InventorySettings {
  salonId: string
  allowNegativeStock: boolean
  defaultValuationMethod: 'WAC' | 'FIFO'
  nearExpiryDays: number
  highValueLossThreshold: number
}




