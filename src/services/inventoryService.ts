// ==============================================================================
// Luma Salon — Product Inventory Persistence Service
// Phase 5.1 Hardened: Supabase Database Integration & Persistent Storage
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import type {
  InventoryProduct,
  ProductCategory,
  ProductUnit,
  ScannedProductItem,
  StockAdjustmentInput,
  StockAdjustmentResult,
  StockMovementType,
  InventoryBatch,
  ConsumableUsage,
  StockLossRecord,
  StockAuditSession,
  StockAuditItem,
  InventoryKPIs,
  InventorySettings,
} from '../types/inventory.ts'
import type { UserSession } from '../types/models.ts'
import { sessionService } from './sessionService.ts'
import { roundPrice, roundQuantity } from '../utils/inventoryValidation.ts'

/**
 * Raw Database Representation for `public.inventory_products` table
 */
export interface DatabaseInventoryProduct {
  id: string
  salon_id: string
  name: string
  category: string
  subcategory?: string | null
  brand: string
  description?: string | null
  barcode?: string | null
  sku: string
  unit: string
  purchase_price: number | string
  selling_price: number | string
  current_stock: number | string
  min_stock_threshold: number | string
  status: string
  archived_at?: string | null
  archived_by?: string | null
  created_at: string
  updated_at?: string
  created_by?: string | null
  updated_by?: string | null
  item_type?: string | null
  default_supplier_id?: string | null
  tax_rate?: number | string | null
  reorder_level?: number | string | null
  max_stock_threshold?: number | string | null
  reserved_stock?: number | string | null
  is_batch_tracked?: boolean | null
  weighted_average_cost?: number | string | null
}

/**
 * Domain representation of an inventory stock movement record
 */
export interface StockMovementRecord {
  id: string
  salonId: string
  productId: string
  productName?: string
  sku?: string
  movementType: StockMovementType
  quantity: number
  previousStock: number
  newStock: number
  referenceId?: string
  notes?: string
  createdBy?: string
  createdAt: string
  batchId?: string
  unitCost?: number
  totalCost?: number
  sourceDocument?: string
}

/**
 * Result payload returned from committing an intake batch
 */
export interface BatchCommitResult {
  success: boolean
  idempotencyKey: string
  salonId: string
  committedCount: number
  totalUnits: number
  committedAt: string
}

export interface CreateProductInput {
  name: string
  brand: string
  category: ProductCategory
  subcategory?: string
  description?: string
  unit: ProductUnit
  barcode?: string
  sku: string
  purchasePrice: number
  sellingPrice: number
  openingStock: number
  minStockThreshold?: number
  itemType?: 'retail' | 'consumable'
  reorderLevel?: number
  maxStockThreshold?: number
  isBatchTracked?: boolean
  defaultSupplierId?: string
  taxRate?: number
}

// Memory listeners for reactive UI updates
type InventoryListener = (products: InventoryProduct[]) => void
const listeners = new Set<InventoryListener>()

/**
 * Maps raw PostgreSQL row to domain InventoryProduct
 */
export function mapDbProductToDomain(row: DatabaseInventoryProduct): InventoryProduct {
  const purchase = roundPrice(Number(row.purchase_price))
  const selling = roundPrice(Number(row.selling_price))
  const stock = roundQuantity(Number(row.current_stock), row.unit)
  const threshold = Number(row.min_stock_threshold || 5)

  let status = row.status as InventoryProduct['status']

  // Preserve explicit 'archived' or 'inactive' status without overriding
  if (status !== 'archived' && status !== 'inactive') {
    if (stock <= 0) {
      status = 'out_of_stock'
    } else if (stock <= threshold) {
      status = 'low_stock'
    } else {
      status = 'active'
    }
  }

  return {
    id: row.id,
    name: row.name,
    category: row.category as ProductCategory,
    subcategory: row.subcategory || undefined,
    brand: row.brand,
    description: row.description || undefined,
    unit: row.unit as ProductUnit,
    sku: row.sku,
    barcode: row.barcode || undefined,
    purchasePrice: purchase,
    sellingPrice: selling,
    currentStock: stock,
    minStockThreshold: threshold,
    reorderLevel: row.reorder_level !== undefined && row.reorder_level !== null ? Number(row.reorder_level) : threshold,
    maxStockThreshold: row.max_stock_threshold !== undefined && row.max_stock_threshold !== null ? Number(row.max_stock_threshold) : undefined,
    reservedStock: row.reserved_stock !== undefined && row.reserved_stock !== null ? Number(row.reserved_stock) : 0,
    isBatchTracked: Boolean(row.is_batch_tracked),
    weightedAverageCost: row.weighted_average_cost !== undefined && row.weighted_average_cost !== null ? Number(row.weighted_average_cost) : purchase,
    itemType: (row.item_type as 'retail' | 'consumable') || 'retail',
    defaultSupplierId: row.default_supplier_id || undefined,
    taxRate: row.tax_rate !== undefined && row.tax_rate !== null ? Number(row.tax_rate) : 0.18,
    status: status || 'active',
    archivedAt: row.archived_at || undefined,
    archivedBy: row.archived_by || undefined,
    syncStatus: 'synced',
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
  }
}

/**
 * Resolves current salon ID strictly from session or explicit parameter.
 * NEVER falls back to hardcoded default salon to prevent cross-tenant contamination.
 */
export function resolveSalonId(explicitSalonId?: string, session?: UserSession | null): string {
  if (explicitSalonId && explicitSalonId.trim()) return explicitSalonId.trim()
  const s = session !== undefined ? session : sessionService.getCurrentSession()
  const resolved = (s as any)?.salonId
  if (!resolved || !resolved.trim()) {
    throw new Error('Active salon context is required. No salon ID found in session.')
  }
  return resolved.trim()
}

// Scoped Storage Keys
const getInventoryStorageKey = (salonId: string) => `luma_salon_${salonId}_inventory_products_v1`
const getMovementsStorageKey = (salonId: string) => `luma_salon_${salonId}_stock_movements_v1`
const getIdempotencyStorageKey = (salonId: string) => `luma_salon_${salonId}_batch_commits_v1`

// Scoped In-Memory Fallbacks (Per Salon)
const memoryInventory: Record<string, InventoryProduct[]> = {}
const memoryStockMovements: Record<string, StockMovementRecord[]> = {}
const memoryBatchCommits: Record<string, Record<string, BatchCommitResult>> = {}

/**
 * Helper to read local cache strictly scoped by salon ID
 */
function getLocalInventory(salonId: string): InventoryProduct[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(getInventoryStorageKey(salonId))
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
    }
  } catch (err) {
    console.warn(`[InventoryService] Failed to read local inventory for ${salonId}:`, err)
  }
  return memoryInventory[salonId] || []
}

/**
 * Helper to persist local cache strictly scoped by salon ID
 */
function saveLocalInventory(salonId: string, products: InventoryProduct[]) {
  memoryInventory[salonId] = products
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getInventoryStorageKey(salonId), JSON.stringify(products))
    }
  } catch (err) {
    console.warn(`[InventoryService] Failed to persist local inventory for ${salonId}:`, err)
  }
  notifyListeners(products)
}

function getLocalStockMovements(salonId: string): StockMovementRecord[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(getMovementsStorageKey(salonId))
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) return parsed
      }
    }
  } catch (err) {
    console.warn(`[InventoryService] Failed to read stock movements for ${salonId}:`, err)
  }
  return memoryStockMovements[salonId] || []
}

function saveLocalStockMovements(salonId: string, movements: StockMovementRecord[]) {
  memoryStockMovements[salonId] = movements
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(getMovementsStorageKey(salonId), JSON.stringify(movements))
    }
  } catch (err) {
    console.warn(`[InventoryService] Failed to persist stock movements for ${salonId}:`, err)
  }
}

function notifyListeners(products: InventoryProduct[]) {
  listeners.forEach((fn) => {
    try {
      fn(products)
    } catch (err) {
      console.error('[InventoryService] Error in inventory listener:', err)
    }
  })
}

// Broadcast channel / cross-tab sync
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key && event.key.startsWith('luma_salon_') && event.key.includes('_inventory_products_v1') && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          notifyListeners(parsed)
        }
      } catch (err) {
        console.warn('[InventoryService] Storage event parse error:', err)
      }
    }
  })
}

export const inventoryService = {
  /**
   * Subscribes a listener to inventory changes
   */
  subscribe(listener: InventoryListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Fetches inventory products for a given salon.
   * By default, archived products are excluded from active listings.
   * Real Supabase errors are propagated to the caller without swallowing.
   */
  async fetchInventoryProducts(salonId?: string, includeArchived: boolean = false): Promise<InventoryProduct[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('inventory_products')
        .select('*')
        .eq('salon_id', targetSalonId)
        .order('created_at', { ascending: false })

      if (!includeArchived) {
        query = query.neq('status', 'archived')
      }

      const { data, error } = await query

      if (error) {
        console.error('[InventoryService] Supabase fetch error:', error.message)
        throw new Error(`Failed to load inventory from server: ${error.message}`)
      }

      if (data) {
        const mapped = data.map((row) => mapDbProductToDomain(row as DatabaseInventoryProduct))
        saveLocalInventory(targetSalonId, mapped)
        return mapped
      }
    }

    // Local / Offline fallback (only when Supabase client is not configured)
    const local = getLocalInventory(targetSalonId)
    return includeArchived ? local : local.filter((p) => p.status !== 'archived')
  },

  /**
   * Fetches a single product by ID
   */
  async fetchProductById(productId: string, salonId?: string): Promise<InventoryProduct | null> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('inventory_products')
        .select('*')
        .eq('salon_id', targetSalonId)
        .eq('id', productId)
        .maybeSingle()

      if (error) {
        console.error('[InventoryService] Supabase fetchById error:', error.message)
        throw new Error(`Failed to fetch product: ${error.message}`)
      }

      if (data) {
        return mapDbProductToDomain(data as DatabaseInventoryProduct)
      }
      return null
    }

    const local = getLocalInventory(targetSalonId)
    return local.find((p) => p.id === productId) || null
  },

  /**
   * Searches products within a salon by query (name, brand, SKU, barcode) and optional category
   */
  async searchProducts(
    salonId?: string,
    query?: string,
    category?: ProductCategory | 'ALL',
    includeArchived: boolean = false
  ): Promise<InventoryProduct[]> {
    const all = await this.fetchInventoryProducts(salonId, includeArchived)
    const q = query?.trim().toLowerCase()

    return all.filter((product) => {
      if (category && category !== 'ALL' && product.category !== category) {
        return false
      }
      if (q) {
        const nameMatch = product.name.toLowerCase().includes(q)
        const brandMatch = product.brand.toLowerCase().includes(q)
        const skuMatch = product.sku.toLowerCase().includes(q)
        const barcodeMatch = product.barcode ? product.barcode.toLowerCase().includes(q) : false
        return nameMatch || brandMatch || skuMatch || barcodeMatch
      }
      return true
    })
  },

  /**
   * Finds a product by optical barcode within a salon
   */
  async findProductByBarcode(barcode: string, salonId?: string): Promise<InventoryProduct | null> {
    const clean = barcode?.trim().toLowerCase()
    if (!clean) return null
    const all = await this.fetchInventoryProducts(salonId, true)
    return all.find((p) => p.barcode && p.barcode.trim().toLowerCase() === clean) || null
  },

  /**
   * Finds a product by SKU within a salon
   */
  async findProductBySku(sku: string, salonId?: string): Promise<InventoryProduct | null> {
    const clean = sku?.trim().toLowerCase()
    if (!clean) return null
    const all = await this.fetchInventoryProducts(salonId, true)
    return all.find((p) => p.sku && p.sku.trim().toLowerCase() === clean) || null
  },

  /**
   * Creates a product and its initial opening stock in an atomic database transaction.
   * Real database errors are strictly thrown to the UI.
   */
  async createProduct(
    input: CreateProductInput,
    session?: UserSession | null
  ): Promise<InventoryProduct> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const userId = currentSession?.userId || 'unknown-user'

    // Clean and validate inputs
    if (!input.name || !input.name.trim()) {
      throw new Error('Product name is required and cannot be empty.')
    }
    if (!input.brand || !input.brand.trim()) {
      throw new Error('Brand name is required and cannot be empty.')
    }
    if (!input.sku || !input.sku.trim()) {
      throw new Error('Product SKU is required and cannot be empty.')
    }

    const purchase = roundPrice(input.purchasePrice)
    const selling = roundPrice(input.sellingPrice)
    const stock = roundQuantity(input.openingStock, input.unit)
    const threshold = input.minStockThreshold !== undefined ? Math.max(0, input.minStockThreshold) : 5

    // Check duplicate barcode and SKU locally within this salon
    const existing = await this.fetchInventoryProducts(salonId, true)
    if (input.barcode && input.barcode.trim()) {
      const dupBarcode = existing.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === input.barcode!.trim().toLowerCase()
      )
      if (dupBarcode) {
        throw new Error(`A product with barcode "${input.barcode.trim()}" already exists in this salon.`)
      }
    }
    const dupSku = existing.find((p) => p.sku.trim().toLowerCase() === input.sku.trim().toLowerCase())
    if (dupSku) {
      throw new Error(`A product with SKU "${input.sku.trim()}" already exists in this salon.`)
    }

    // Supabase RPC execution
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_inventory_product_with_opening_stock', {
        p_salon_id: salonId,
        p_name: input.name.trim(),
        p_brand: input.brand.trim(),
        p_category: input.category,
        p_subcategory: input.subcategory?.trim() || null,
        p_description: input.description?.trim() || null,
        p_unit: input.unit.trim(),
        p_barcode: input.barcode?.trim() || null,
        p_sku: input.sku.trim(),
        p_purchase_price: purchase,
        p_selling_price: selling,
        p_opening_stock: stock,
        p_min_stock_threshold: threshold,
        p_user_id: userId,
      })

      if (error) {
        console.error('[InventoryService] Supabase RPC create product failed:', error.message)
        throw new Error(`Database error: ${error.message}`)
      }

      if (data) {
        if (
          input.itemType !== undefined ||
          input.reorderLevel !== undefined ||
          input.maxStockThreshold !== undefined ||
          input.isBatchTracked !== undefined ||
          input.defaultSupplierId !== undefined ||
          input.taxRate !== undefined
        ) {
          await supabase
            .from('inventory_products')
            .update({
              item_type: input.itemType || 'retail',
              reorder_level: input.reorderLevel !== undefined ? input.reorderLevel : threshold,
              max_stock_threshold: input.maxStockThreshold || null,
              is_batch_tracked: Boolean(input.isBatchTracked),
              default_supplier_id: input.defaultSupplierId || null,
              tax_rate: input.taxRate !== undefined ? input.taxRate : 0.18,
            })
            .eq('id', (data as any).id)
            .eq('salon_id', salonId)
        }
        const refetched = await this.fetchProductById((data as any).id, salonId)
        const product = refetched || mapDbProductToDomain(data as DatabaseInventoryProduct)
        product.syncStatus = 'synced'
        const local = getLocalInventory(salonId)
        saveLocalInventory(salonId, [product, ...local.filter((p) => p.id !== product.id)])
        return product
      }

      throw new Error('Database returned empty response during product creation.')
    }

    // Local / Offline Transactional Emulation (only when Supabase is not configured)
    const nowIso = new Date().toISOString()
    const newId = `prod-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const status: InventoryProduct['status'] =
      stock <= 0 ? 'out_of_stock' : stock <= threshold ? 'low_stock' : 'active'

    const newProduct: InventoryProduct = {
      id: newId,
      name: input.name.trim(),
      brand: input.brand.trim(),
      category: input.category,
      subcategory: input.subcategory?.trim() || undefined,
      description: input.description?.trim() || undefined,
      unit: input.unit,
      barcode: input.barcode?.trim() || undefined,
      sku: input.sku.trim(),
      purchasePrice: purchase,
      sellingPrice: selling,
      currentStock: stock,
      minStockThreshold: threshold,
      status,
      syncStatus: 'pending',
      createdAt: nowIso,
      updatedAt: nowIso,
    }

    // Record stock movement
    if (stock > 0) {
      const movement: StockMovementRecord = {
        id: `mov-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
        salonId,
        productId: newId,
        movementType: 'OPENING_STOCK',
        quantity: stock,
        previousStock: 0,
        newStock: stock,
        referenceId: `OPENING-${newId}`,
        notes: 'Initial opening stock registered during product creation.',
        createdBy: userId,
        createdAt: nowIso,
      }
      const existingMovements = getLocalStockMovements(salonId)
      saveLocalStockMovements(salonId, [movement, ...existingMovements])
    }

    const currentInventory = getLocalInventory(salonId)
    saveLocalInventory(salonId, [newProduct, ...currentInventory])
    return newProduct
  },

  /**
   * Updates an existing product's metadata
   */
  async updateProduct(
    productId: string,
    updates: Partial<InventoryProduct>,
    session?: UserSession | null
  ): Promise<InventoryProduct> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const userId = currentSession?.userId || 'unknown-user'

    if (isSupabaseConfigured() && supabase) {
      const payload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
        updated_by: userId,
      }
      if (updates.name !== undefined) payload.name = updates.name.trim()
      if (updates.brand !== undefined) payload.brand = updates.brand.trim()
      if (updates.category !== undefined) payload.category = updates.category
      if (updates.subcategory !== undefined) payload.subcategory = updates.subcategory?.trim() || null
      if (updates.description !== undefined) payload.description = updates.description?.trim() || null
      if (updates.unit !== undefined) payload.unit = updates.unit
      if (updates.barcode !== undefined) payload.barcode = updates.barcode?.trim() || null
      if (updates.sku !== undefined) payload.sku = updates.sku.trim()
      if (updates.purchasePrice !== undefined) payload.purchase_price = roundPrice(updates.purchasePrice)
      if (updates.sellingPrice !== undefined) payload.selling_price = roundPrice(updates.sellingPrice)
      if (updates.minStockThreshold !== undefined) payload.min_stock_threshold = updates.minStockThreshold
      if (updates.status !== undefined) payload.status = updates.status
      if (updates.itemType !== undefined) payload.item_type = updates.itemType
      if (updates.reorderLevel !== undefined) payload.reorder_level = updates.reorderLevel
      if (updates.maxStockThreshold !== undefined) payload.max_stock_threshold = updates.maxStockThreshold
      if (updates.isBatchTracked !== undefined) payload.is_batch_tracked = updates.isBatchTracked
      if (updates.defaultSupplierId !== undefined) payload.default_supplier_id = updates.defaultSupplierId || null
      if (updates.taxRate !== undefined) payload.tax_rate = updates.taxRate

      const { data, error } = await supabase
        .from('inventory_products')
        .update(payload)
        .eq('salon_id', salonId)
        .eq('id', productId)
        .select()
        .single()

      if (error) {
        console.error('[InventoryService] Supabase update error:', error.message)
        throw new Error(`Failed to update product: ${error.message}`)
      }

      if (data) {
        const product = mapDbProductToDomain(data as DatabaseInventoryProduct)
        const local = getLocalInventory(salonId).map((p) => (p.id === productId ? product : p))
        saveLocalInventory(salonId, local)
        return product
      }

      throw new Error('Database returned empty response during product update.')
    }

    // Local fallback
    const local = getLocalInventory(salonId)
    const index = local.findIndex((p) => p.id === productId)
    if (index === -1) {
      throw new Error(`Product with ID "${productId}" not found.`)
    }

    const existing = local[index]
    const updated: InventoryProduct = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    local[index] = updated
    saveLocalInventory(salonId, [...local])
    return updated
  },

  /**
   * Soft-deletes / Archives a product so it no longer appears in normal active listings
   * while permanently preserving all historical stock movements.
   */
  async archiveProduct(productId: string, session?: UserSession | null): Promise<InventoryProduct> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const userId = currentSession?.userId || 'unknown-user'
    const nowIso = new Date().toISOString()

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('inventory_products')
        .update({
          status: 'archived',
          archived_at: nowIso,
          archived_by: userId,
          updated_at: nowIso,
          updated_by: userId,
        })
        .eq('salon_id', salonId)
        .eq('id', productId)
        .select()
        .single()

      if (error) {
        console.error('[InventoryService] Supabase archive product error:', error.message)
        throw new Error(`Failed to archive product: ${error.message}`)
      }

      if (data) {
        const product = mapDbProductToDomain(data as DatabaseInventoryProduct)
        const local = getLocalInventory(salonId).map((p) => (p.id === productId ? product : p))
        saveLocalInventory(salonId, local)
        return product
      }
    }

    return this.updateProduct(
      productId,
      {
        status: 'archived',
        archivedAt: nowIso,
        archivedBy: userId,
      },
      currentSession
    )
  },

  /**
   * Destructively deletes a product only if it has ZERO historical stock movements.
   * If stock movements exist, deletion is strictly blocked and an error is thrown,
   * directing the user to archive the product instead.
   */
  async deleteProduct(productId: string, session?: UserSession | null): Promise<void> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)

    // Check if product has historical stock movements
    const movements = await this.fetchStockMovementHistory(productId, salonId)
    if (movements && movements.length > 0) {
      throw new Error(
        'Cannot delete product with historical stock movements. Please archive the product instead to preserve audit history.'
      )
    }

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase
        .from('inventory_products')
        .delete()
        .eq('salon_id', salonId)
        .eq('id', productId)

      if (error) {
        console.error('[InventoryService] Supabase delete product error:', error.message)
        throw new Error(`Failed to delete product: ${error.message}`)
      }
    }

    const local = getLocalInventory(salonId).filter((p) => p.id !== productId)
    saveLocalInventory(salonId, local)
  },

  /**
   * Manually adjusts product stock (Phase 6).
   * Transactionally updates stock and writes movement audit record via RPC rpc_adjust_inventory_stock.
   */
  async adjustStock(
    input: StockAdjustmentInput,
    session?: UserSession | null
  ): Promise<StockAdjustmentResult> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const userId = currentSession?.userId || 'unknown-user'

    if (!input.productId) throw new Error('Product ID is required for stock adjustment.')
    if (input.quantity <= 0) throw new Error('Adjustment quantity must be greater than zero.')
    if (!input.notes || input.notes.trim().length < 5) {
      throw new Error('Adjustment reason/notes are required and must be at least 5 characters.')
    }

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_adjust_inventory_stock', {
        p_salon_id: salonId,
        p_product_id: input.productId,
        p_adjustment_type: input.adjustmentType,
        p_quantity: input.quantity,
        p_notes: input.notes.trim(),
        p_user_id: userId,
      })

      if (error) {
        console.error('[InventoryService] Supabase adjustStock error:', error.message)
        throw new Error(error.message)
      }

      if (data) {
        // Re-fetch products to sync latest state
        await this.fetchInventoryProducts(salonId)
        return data as StockAdjustmentResult
      }

      throw new Error('Database returned empty response during stock adjustment.')
    }

    // Local / In-memory fallback
    const local = getLocalInventory(salonId)
    const productIndex = local.findIndex((p) => p.id === input.productId)
    if (productIndex === -1) {
      throw new Error(`Product with ID "${input.productId}" not found.`)
    }

    const product = local[productIndex]
    if (product.status === 'archived') {
      throw new Error(`Cannot adjust stock for archived product "${product.name}". Unarchive product first.`)
    }

    const oldStock = product.currentStock
    let newStock = oldStock
    if (input.adjustmentType === 'STOCK_ADJUSTMENT_IN' || input.adjustmentType === 'STOCK_RETURN') {
      newStock = roundQuantity(oldStock + input.quantity, product.unit)
    } else if (input.adjustmentType === 'STOCK_ADJUSTMENT_OUT') {
      if (oldStock < input.quantity) {
        throw new Error(`Insufficient stock: Cannot deduct ${input.quantity} units from current stock of ${oldStock} ${product.unit}.`)
      }
      newStock = roundQuantity(oldStock - input.quantity, product.unit)
    }

    let newStatus = product.status
    if (newStock <= 0) {
      newStatus = 'out_of_stock'
    } else if (newStock <= product.minStockThreshold) {
      newStatus = 'low_stock'
    } else if (product.status === 'inactive') {
      newStatus = 'inactive'
    } else {
      newStatus = 'active'
    }

    const nowIso = new Date().toISOString()
    const updatedProduct: InventoryProduct = {
      ...product,
      currentStock: newStock,
      status: newStatus,
      updatedAt: nowIso,
    }

    local[productIndex] = updatedProduct
    saveLocalInventory(salonId, [...local])

    // Record movement locally
    const movementId = 'adj-mov-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)
    const movement: StockMovementRecord = {
      id: movementId,
      salonId,
      productId: product.id,
      movementType: input.adjustmentType,
      quantity: input.quantity,
      previousStock: oldStock,
      newStock,
      referenceId: 'ADJ-' + Math.random().toString(36).substring(2, 10).toUpperCase(),
      notes: input.notes.trim(),
      createdBy: userId,
      createdAt: nowIso,
    }
    const currentMovements = getLocalStockMovements(salonId)
    saveLocalStockMovements(salonId, [movement, ...currentMovements])

    return {
      success: true,
      productId: product.id,
      productName: product.name,
      movementId,
      adjustmentType: input.adjustmentType,
      quantity: input.quantity,
      previousStock: oldStock,
      newStock,
      status: newStatus,
      adjustedAt: nowIso,
    }
  },

  /**
   * Unarchives a previously archived product, restoring it to active inventory.
   */
  async unarchiveProduct(productId: string, session?: UserSession | null): Promise<InventoryProduct> {
    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const nowIso = new Date().toISOString()

    // Determine target status based on stock
    const existing = await this.fetchProductById(productId, salonId)
    if (!existing) {
      throw new Error(`Product with ID "${productId}" not found.`)
    }

    let targetStatus: InventoryProduct['status'] = 'active'
    if (existing.currentStock <= 0) {
      targetStatus = 'out_of_stock'
    } else if (existing.currentStock <= existing.minStockThreshold) {
      targetStatus = 'low_stock'
    }

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('inventory_products')
        .update({
          status: targetStatus,
          archived_at: null,
          archived_by: null,
          updated_at: nowIso,
          updated_by: currentSession?.userId || 'unknown-user',
        })
        .eq('salon_id', salonId)
        .eq('id', productId)
        .select()
        .single()

      if (error) {
        console.error('[InventoryService] Supabase unarchive product error:', error.message)
        throw new Error(`Failed to unarchive product: ${error.message}`)
      }

      if (data) {
        const product = mapDbProductToDomain(data as DatabaseInventoryProduct)
        const local = getLocalInventory(salonId).map((p) => (p.id === productId ? product : p))
        saveLocalInventory(salonId, local)
        return product
      }
    }

    return this.updateProduct(
      productId,
      {
        status: targetStatus,
        archivedAt: undefined,
        archivedBy: undefined,
      },
      currentSession
    )
  },

  /**
   * Commits an entire scanned batch atomically with multi-tenant idempotency protection.
   * Invokes `rpc_commit_inventory_intake_batch` on Supabase.
   */
  async commitScannedBatch(
    items: ScannedProductItem[],
    idempotencyKey?: string,
    session?: UserSession | null
  ): Promise<BatchCommitResult> {
    if (!items || items.length === 0) {
      throw new Error('Cannot commit an empty scanned batch.')
    }

    const currentSession = session !== undefined ? session : sessionService.getCurrentSession()
    const salonId = resolveSalonId(undefined, currentSession)
    const userId = currentSession?.userId || 'unknown-user'
    const finalIdempotencyKey =
      idempotencyKey?.trim() || `batch-${salonId}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

    // Supabase transactional execution
    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_commit_inventory_intake_batch', {
        p_salon_id: salonId,
        p_idempotency_key: finalIdempotencyKey,
        p_items: items,
        p_user_id: userId,
      })

      if (error) {
        console.error('[InventoryService] Supabase commit batch RPC failed:', error.message)
        throw new Error(`Failed to commit intake batch: ${error.message}`)
      }

      if (data) {
        // Re-fetch all products to sync latest stock
        await this.fetchInventoryProducts(salonId)
        return data as BatchCommitResult
      }

      throw new Error('Database returned empty response during batch commit.')
    }

    // Local / Offline Transactional Emulation with Idempotency Guard
    if (!memoryBatchCommits[salonId]) {
      memoryBatchCommits[salonId] = {}
    }

    if (memoryBatchCommits[salonId][finalIdempotencyKey]) {
      return memoryBatchCommits[salonId][finalIdempotencyKey]
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const commitsRaw = window.localStorage.getItem(getIdempotencyStorageKey(salonId))
        const commits: Record<string, BatchCommitResult> = commitsRaw ? JSON.parse(commitsRaw) : {}
        if (commits[finalIdempotencyKey]) {
          return commits[finalIdempotencyKey]
        }
      }
    } catch (err) {
      console.warn('[InventoryService] Failed to check idempotency store:', err)
    }

    let products = [...getLocalInventory(salonId)]
    const newMovements: StockMovementRecord[] = []
    const nowIso = new Date().toISOString()
    let totalUnits = 0

    for (const item of items) {
      const qty = roundQuantity(item.quantity, item.unit)
      totalUnits += qty

      const existingIndex = products.findIndex(
        (p) =>
          (p.barcode && p.barcode.toLowerCase() === item.barcode.toLowerCase()) ||
          (p.sku && p.sku.toLowerCase() === item.sku.toLowerCase()) ||
          p.id === item.id
      )

      if (existingIndex > -1) {
        // Existing product
        const match = products[existingIndex]
        if (match.status === 'archived') {
          throw new Error(`Cannot intake stock for archived product "${match.name}". Unarchive product first.`)
        }

        const oldStock = match.currentStock
        const newStock = roundQuantity(oldStock + qty, match.unit)
        let status: InventoryProduct['status'] = match.status
        if (status !== 'inactive') {
          status = newStock <= 0 ? 'out_of_stock' : newStock <= match.minStockThreshold ? 'low_stock' : 'active'
        }

        products[existingIndex] = {
          ...match,
          currentStock: newStock,
          status,
          updatedAt: nowIso,
        }

        newMovements.push({
          id: `mov-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          salonId,
          productId: match.id,
          movementType: 'STOCK_RECEIVED',
          quantity: qty,
          previousStock: oldStock,
          newStock,
          referenceId: finalIdempotencyKey,
          notes: 'Live barcode intake batch.',
          createdBy: userId,
          createdAt: nowIso,
        })
      } else {
        // New product
        const newProdId = item.id.startsWith('prod-')
          ? item.id
          : `prod-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
        const status = item.quantity <= 0 ? 'out_of_stock' : 'active'

        const newProd: InventoryProduct = {
          id: newProdId,
          name: item.name,
          brand: item.brand,
          category: item.category,
          unit: item.unit,
          sku: item.sku,
          barcode: item.barcode,
          purchasePrice: roundPrice(item.purchasePrice),
          sellingPrice: roundPrice(item.sellingPrice),
          currentStock: qty,
          minStockThreshold: 5,
          status,
          syncStatus: 'pending',
          createdAt: nowIso,
          updatedAt: nowIso,
        }

        products = [newProd, ...products]

        newMovements.push({
          id: `mov-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
          salonId,
          productId: newProdId,
          movementType: 'OPENING_STOCK',
          quantity: qty,
          previousStock: 0,
          newStock: qty,
          referenceId: finalIdempotencyKey,
          notes: 'New product intake via Live scanner batch.',
          createdBy: userId,
          createdAt: nowIso,
        })
      }
    }

    // Persist products and movements
    saveLocalInventory(salonId, products)
    const existingMovs = getLocalStockMovements(salonId)
    saveLocalStockMovements(salonId, [...newMovements, ...existingMovs])

    const result: BatchCommitResult = {
      success: true,
      idempotencyKey: finalIdempotencyKey,
      salonId,
      committedCount: items.length,
      totalUnits: roundQuantity(totalUnits),
      committedAt: nowIso,
    }

    // Record idempotency
    memoryBatchCommits[salonId][finalIdempotencyKey] = result
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const commitsRaw = window.localStorage.getItem(getIdempotencyStorageKey(salonId))
        const commits: Record<string, BatchCommitResult> = commitsRaw ? JSON.parse(commitsRaw) : {}
        commits[finalIdempotencyKey] = result
        window.localStorage.setItem(getIdempotencyStorageKey(salonId), JSON.stringify(commits))
      }
    } catch (err) {
      console.warn('[InventoryService] Failed to record idempotency key:', err)
    }

    return result
  },

  /**
   * Fetches stock movement history for a product or salon
   */
  async fetchStockMovementHistory(
    productId?: string,
    salonId?: string
  ): Promise<StockMovementRecord[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('inventory_stock_movements')
        .select('*')
        .eq('salon_id', targetSalonId)
        .order('created_at', { ascending: false })

      if (productId) {
        query = query.eq('product_id', productId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[InventoryService] Supabase stock movements fetch error:', error.message)
        throw new Error(`Failed to load stock movements: ${error.message}`)
      }

      if (data) {
        return data.map((row: any) => ({
          id: row.id,
          salonId: row.salon_id,
          productId: row.product_id,
          movementType: row.movement_type,
          quantity: Number(row.quantity),
          previousStock: Number(row.previous_stock),
          newStock: Number(row.new_stock),
          referenceId: row.reference_id || undefined,
          notes: row.notes || undefined,
          createdBy: row.created_by || undefined,
          createdAt: row.created_at,
        }))
      }
    }

    const local = getLocalStockMovements(targetSalonId)
    if (productId) {
      return local.filter((m) => m.productId === productId)
    }
    return local
  },

  /**
   * Fetches aggregate KPIs for the Inventory Overview Dashboard
   */
  async getDashboardKpis(salonId?: string): Promise<InventoryKPIs> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_get_inventory_dashboard_kpis', {
        p_salon_id: targetSalonId,
      })

      if (error) {
        console.error('[InventoryService] rpc_get_inventory_dashboard_kpis error:', error.message)
      } else if (data) {
        return {
          totalProducts: Number(data.total_products || 0),
          retailSkus: Number(data.retail_skus || 0),
          consumableSkus: Number(data.consumable_skus || 0),
          totalUnits: Number(data.total_units || 0),
          totalValuation: Number(data.total_valuation || 0),
          retailValuation: Number(data.retail_valuation || 0),
          consumableValuation: Number(data.consumable_valuation || 0),
          lowStockCount: Number(data.low_stock_count || 0),
          outOfStockCount: Number(data.out_of_stock_count || 0),
          expiredBatchesCount: Number(data.expired_batches_count || 0),
          nearExpiryBatchesCount: Number(data.near_expiry_batches_count || 0),
          quarantinedBatchesCount: Number(data.quarantined_batches_count || 0),
          recentMovements: (data.recent_movements || []).map((m: any) => ({
            id: m.id,
            movementType: m.movement_type,
            quantity: Number(m.quantity || 0),
            previousStock: Number(m.previous_stock || 0),
            newStock: Number(m.new_stock || 0),
            referenceId: m.reference_id,
            createdAt: m.created_at,
            productName: m.product_name,
            sku: m.sku,
          })),
        }
      }
    }

    // Fallback calculation from local state
    const prods = await this.fetchInventoryProducts(targetSalonId)
    const movements = await this.fetchStockMovementHistory(undefined, targetSalonId)

    const retail = prods.filter((p) => p.itemType === 'retail' || !p.itemType)
    const consumable = prods.filter((p) => p.itemType === 'consumable')
    const totalUnits = prods.reduce((acc, p) => acc + p.currentStock, 0)
    const totalVal = prods.reduce((acc, p) => acc + p.currentStock * (p.weightedAverageCost || p.purchasePrice), 0)
    const retailVal = retail.reduce((acc, p) => acc + p.currentStock * (p.weightedAverageCost || p.purchasePrice), 0)
    const consVal = consumable.reduce((acc, p) => acc + p.currentStock * (p.weightedAverageCost || p.purchasePrice), 0)

    return {
      totalProducts: prods.length,
      retailSkus: retail.length,
      consumableSkus: consumable.length,
      totalUnits,
      totalValuation: totalVal,
      retailValuation: retailVal,
      consumableValuation: consVal,
      lowStockCount: prods.filter((p) => p.status === 'low_stock').length,
      outOfStockCount: prods.filter((p) => p.status === 'out_of_stock').length,
      expiredBatchesCount: 0,
      nearExpiryBatchesCount: 0,
      quarantinedBatchesCount: 0,
      recentMovements: movements.slice(0, 5).map((m) => {
        const prod = prods.find((p) => p.id === m.productId)
        return {
          id: m.id,
          movementType: m.movementType,
          quantity: m.quantity,
          previousStock: m.previousStock,
          newStock: m.newStock,
          referenceId: m.referenceId,
          createdAt: m.createdAt,
          productName: prod?.name || 'Inventory Product',
          sku: prod?.sku || '',
        }
      }),
    }
  },

  /**
   * Fetches inventory batches
   */
  async getInventoryBatches(productId?: string, salonId?: string): Promise<InventoryBatch[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('inventory_batches')
        .select('*, product:inventory_products(name, sku), supplier:suppliers(name)')
        .eq('salon_id', targetSalonId)
        .order('expiry_date', { ascending: true })

      if (productId) {
        query = query.eq('product_id', productId)
      }

      const { data, error } = await query
      if (error) {
        console.error('[InventoryService] getInventoryBatches error:', error.message)
        throw new Error(`Failed to load batches: ${error.message}`)
      }

      if (data) {
        return data.map((b: any) => ({
          id: b.id,
          salonId: b.salon_id,
          productId: b.product_id,
          productName: b.product?.name,
          productSku: b.product?.sku,
          batchNumber: b.batch_number,
          supplierId: b.supplier_id || undefined,
          supplierName: b.supplier?.name,
          goodsReceiptId: b.goods_receipt_id || undefined,
          purchaseBillId: b.purchase_bill_id || undefined,
          receivedQuantity: Number(b.received_quantity || 0),
          currentQuantity: Number(b.current_quantity || 0),
          unitCost: Number(b.unit_cost || 0),
          manufacturingDate: b.manufacturing_date || undefined,
          expiryDate: b.expiry_date,
          status: b.status,
          notes: b.notes || undefined,
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        }))
      }
    }
    return []
  },

  /**
   * Registers a new batch
   */
  async createInventoryBatch(batchData: Partial<InventoryBatch>, salonId?: string): Promise<InventoryBatch> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_inventory_batch', {
        p_salon_id: targetSalonId,
        p_product_id: batchData.productId,
        p_batch_number: batchData.batchNumber,
        p_expiry_date: batchData.expiryDate,
        p_received_quantity: batchData.receivedQuantity || 0,
        p_unit_cost: batchData.unitCost || 0,
        p_supplier_id: batchData.supplierId || null,
        p_manufacturing_date: batchData.manufacturingDate || null,
        p_notes: batchData.notes || null,
      })

      if (error) {
        console.error('[InventoryService] rpc_create_inventory_batch error:', error.message)
        throw new Error(`Failed to create batch: ${error.message}`)
      }

      return {
        id: data.batch_id,
        salonId: targetSalonId,
        productId: batchData.productId!,
        batchNumber: data.batch_number,
        receivedQuantity: batchData.receivedQuantity || 0,
        currentQuantity: batchData.receivedQuantity || 0,
        unitCost: batchData.unitCost || 0,
        expiryDate: data.expiry_date,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
    throw new Error('Database not configured')
  },

  /**
   * Toggles or updates batch status (e.g. quarantine / unquarantine)
   */
  async updateBatchStatus(batchId: string, status: 'active' | 'quarantined' | 'expired', salonId?: string): Promise<void> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase
        .from('inventory_batches')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', batchId)
        .eq('salon_id', targetSalonId)

      if (error) {
        throw new Error(`Failed to update batch status: ${error.message}`)
      }
    }
  },

  /**
   * Records salon consumable usage
   */
  async recordConsumableUsage(
    usageData: {
      productId: string
      quantity: number
      unit?: string
      appointmentId?: string
      serviceId?: string
      staffId?: string
      batchId?: string
      reason?: string
      notes?: string
    },
    salonId?: string
  ): Promise<ConsumableUsage> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_record_consumable_usage', {
        p_salon_id: targetSalonId,
        p_product_id: usageData.productId,
        p_quantity: usageData.quantity,
        p_unit: usageData.unit || null,
        p_appointment_id: usageData.appointmentId || null,
        p_service_id: usageData.serviceId || null,
        p_staff_id: usageData.staffId || null,
        p_batch_id: usageData.batchId || null,
        p_reason: usageData.reason || 'Service usage',
        p_notes: usageData.notes || null,
      })

      if (error) {
        console.error('[InventoryService] rpc_record_consumable_usage error:', error.message)
        throw new Error(`Failed to record consumable usage: ${error.message}`)
      }

      return {
        id: data.usage_id,
        salonId: targetSalonId,
        usageNumber: data.usage_number,
        productId: data.product_id,
        quantity: Number(data.quantity),
        unit: usageData.unit || 'units',
        appointmentId: usageData.appointmentId,
        serviceId: usageData.serviceId,
        staffId: usageData.staffId,
        batchId: usageData.batchId,
        unitCost: 0,
        totalCost: 0,
        reason: usageData.reason,
        notes: usageData.notes,
        createdAt: new Date().toISOString(),
      }
    }
    throw new Error('Database not configured')
  },

  /**
   * Fetches consumable usage history
   */
  async getConsumableUsages(
    filters?: { productId?: string; staffId?: string },
    salonId?: string
  ): Promise<ConsumableUsage[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      let query = supabase
        .from('consumable_usages')
        .select('*, product:inventory_products(name, sku), service:services(name), staff:staff(name)')
        .eq('salon_id', targetSalonId)
        .order('created_at', { ascending: false })

      if (filters?.productId) {
        query = query.eq('product_id', filters.productId)
      }
      if (filters?.staffId) {
        query = query.eq('staff_id', filters.staffId)
      }

      const { data, error } = await query
      if (error) {
        throw new Error(`Failed to fetch consumable usages: ${error.message}`)
      }

      return (data || []).map((u: any) => ({
        id: u.id,
        salonId: u.salon_id,
        usageNumber: u.usage_number,
        productId: u.product_id,
        productName: u.product?.name,
        productSku: u.product?.sku,
        batchId: u.batch_id || undefined,
        quantity: Number(u.quantity),
        unit: u.unit,
        appointmentId: u.appointment_id || undefined,
        serviceId: u.service_id || undefined,
        serviceName: u.service?.name,
        staffId: u.staff_id || undefined,
        staffName: u.staff?.name,
        unitCost: Number(u.unit_cost || 0),
        totalCost: Number(u.total_cost || 0),
        reason: u.reason || undefined,
        notes: u.notes || undefined,
        recordedBy: u.recorded_by || undefined,
        createdAt: u.created_at,
      }))
    }
    return []
  },

  /**
   * Records stock loss (damage, expiry, wastage)
   */
  async recordStockLoss(
    lossData: {
      productId: string
      lossType: 'DAMAGE' | 'EXPIRY' | 'WASTAGE' | 'INTERNAL_LOSS' | 'REJECTION'
      quantity: number
      batchId?: string
      reason: string
      supportingNotes?: string
    },
    salonId?: string
  ): Promise<StockLossRecord> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_record_stock_loss', {
        p_salon_id: targetSalonId,
        p_product_id: lossData.productId,
        p_loss_type: lossData.lossType,
        p_quantity: lossData.quantity,
        p_batch_id: lossData.batchId || null,
        p_reason: lossData.reason,
        p_supporting_notes: lossData.supportingNotes || null,
      })

      if (error) {
        console.error('[InventoryService] rpc_record_stock_loss error:', error.message)
        throw new Error(`Failed to record stock loss: ${error.message}`)
      }

      return {
        id: data.loss_id,
        salonId: targetSalonId,
        lossNumber: data.loss_number,
        productId: lossData.productId,
        batchId: lossData.batchId,
        lossType: lossData.lossType,
        quantity: lossData.quantity,
        unitCost: 0,
        totalCost: Number(data.total_loss_value || 0),
        reason: lossData.reason,
        supportingNotes: lossData.supportingNotes,
        createdAt: new Date().toISOString(),
      }
    }
    throw new Error('Database not configured')
  },

  /**
   * Fetches stock loss records
   */
  async getStockLossRecords(salonId?: string): Promise<StockLossRecord[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('stock_loss_records')
        .select('*, product:inventory_products(name, sku)')
        .eq('salon_id', targetSalonId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch stock loss records: ${error.message}`)
      }

      return (data || []).map((l: any) => ({
        id: l.id,
        salonId: l.salon_id,
        lossNumber: l.loss_number,
        productId: l.product_id,
        productName: l.product?.name,
        productSku: l.product?.sku,
        batchId: l.batch_id || undefined,
        lossType: l.loss_type,
        quantity: Number(l.quantity),
        unitCost: Number(l.unit_cost || 0),
        totalCost: Number(l.total_cost || 0),
        reason: l.reason,
        supportingNotes: l.supporting_notes || undefined,
        recordedBy: l.recorded_by || undefined,
        approvedBy: l.approved_by || undefined,
        createdAt: l.created_at,
      }))
    }
    return []
  },

  /**
   * Creates a physical stock audit session
   */
  async createStockAuditSession(
    sessionData: {
      title: string
      categoryFilter?: string
      itemTypeFilter?: string
      notes?: string
    },
    salonId?: string
  ): Promise<StockAuditSession> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase.rpc('rpc_create_stock_audit_session', {
        p_salon_id: targetSalonId,
        p_title: sessionData.title,
        p_category_filter: sessionData.categoryFilter || 'ALL',
        p_item_type_filter: sessionData.itemTypeFilter || 'ALL',
        p_notes: sessionData.notes || null,
      })

      if (error) {
        console.error('[InventoryService] rpc_create_stock_audit_session error:', error.message)
        throw new Error(`Failed to create audit session: ${error.message}`)
      }

      return {
        id: data.audit_id,
        salonId: targetSalonId,
        auditNumber: data.audit_number,
        title: sessionData.title,
        categoryFilter: sessionData.categoryFilter || 'ALL',
        itemTypeFilter: sessionData.itemTypeFilter || 'ALL',
        status: 'draft',
        totalItemsCounted: 0,
        totalDiscrepancies: 0,
        netVarianceQuantity: 0,
        netVarianceValue: 0,
        auditDate: new Date().toISOString().slice(0, 10),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    }
    throw new Error('Database not configured')
  },

  /**
   * Fetches stock audit sessions
   */
  async getStockAuditSessions(salonId?: string): Promise<StockAuditSession[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('stock_audit_sessions')
        .select('*')
        .eq('salon_id', targetSalonId)
        .order('created_at', { ascending: false })

      if (error) {
        throw new Error(`Failed to fetch audit sessions: ${error.message}`)
      }

      return (data || []).map((s: any) => ({
        id: s.id,
        salonId: s.salon_id,
        auditNumber: s.audit_number,
        title: s.title,
        categoryFilter: s.category_filter,
        itemTypeFilter: s.item_type_filter,
        status: s.status,
        totalItemsCounted: Number(s.total_items_counted || 0),
        totalDiscrepancies: Number(s.total_discrepancies || 0),
        netVarianceQuantity: Number(s.net_variance_quantity || 0),
        netVarianceValue: Number(s.net_variance_value || 0),
        countedBy: s.counted_by || undefined,
        reviewedBy: s.reviewed_by || undefined,
        approvedBy: s.approved_by || undefined,
        notes: s.notes || undefined,
        auditDate: s.audit_date,
        reconciledAt: s.reconciled_at || undefined,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      }))
    }
    return []
  },

  /**
   * Fetches items for an audit session
   */
  async getStockAuditItems(auditId: string, salonId?: string): Promise<StockAuditItem[]> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('stock_audit_items')
        .select('*, product:inventory_products(name, sku, category)')
        .eq('audit_id', auditId)
        .eq('salon_id', targetSalonId)

      if (error) {
        throw new Error(`Failed to fetch audit items: ${error.message}`)
      }

      return (data || []).map((it: any) => ({
        id: it.id,
        salonId: it.salon_id,
        auditId: it.audit_id,
        productId: it.product_id,
        productName: it.product?.name,
        sku: it.product?.sku,
        category: it.product?.category,
        systemQuantity: Number(it.system_quantity),
        countedQuantity: it.counted_quantity !== null ? Number(it.counted_quantity) : undefined,
        varianceQuantity: it.variance_quantity !== null ? Number(it.variance_quantity) : undefined,
        unitCost: Number(it.unit_cost || 0),
        varianceValue: it.variance_value !== null ? Number(it.variance_value) : undefined,
        discrepancyReason: it.discrepancy_reason || undefined,
        isReconciled: Boolean(it.is_reconciled),
        createdAt: it.created_at,
      }))
    }
    return []
  },

  /**
   * Submits physical counts for an audit session
   */
  async recordStockAuditCounts(
    auditId: string,
    items: Array<{ productId: string; countedQuantity: number; discrepancyReason?: string }>,
    salonId?: string
  ): Promise<void> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.rpc('rpc_record_stock_audit_counts', {
        p_salon_id: targetSalonId,
        p_audit_id: auditId,
        p_items: items,
      })

      if (error) {
        console.error('[InventoryService] rpc_record_stock_audit_counts error:', error.message)
        throw new Error(`Failed to record audit counts: ${error.message}`)
      }
    }
  },

  /**
   * Reconciles physical stock audit and applies adjustments
   */
  async reconcileStockAudit(auditId: string, notes?: string, salonId?: string): Promise<void> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { error } = await supabase.rpc('rpc_reconcile_stock_audit', {
        p_salon_id: targetSalonId,
        p_audit_id: auditId,
        p_notes: notes || null,
      })

      if (error) {
        console.error('[InventoryService] rpc_reconcile_stock_audit error:', error.message)
        throw new Error(`Failed to reconcile audit: ${error.message}`)
      }
    }
  },

  /**
   * Fetches salon inventory settings
   */
  async getInventorySettings(salonId?: string): Promise<InventorySettings> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const { data, error } = await supabase
        .from('inventory_settings')
        .select('*')
        .eq('salon_id', targetSalonId)
        .single()

      if (!error && data) {
        return {
          salonId: data.salon_id,
          allowNegativeStock: Boolean(data.allow_negative_stock),
          defaultValuationMethod: data.default_valuation_method,
          nearExpiryDays: Number(data.near_expiry_days || 30),
          highValueLossThreshold: Number(data.high_value_loss_threshold || 2000),
        }
      }
    }

    return {
      salonId: targetSalonId,
      allowNegativeStock: false,
      defaultValuationMethod: 'WAC',
      nearExpiryDays: 30,
      highValueLossThreshold: 2000,
    }
  },

  /**
   * Updates salon inventory settings
   */
  async updateInventorySettings(settings: Partial<InventorySettings>, salonId?: string): Promise<void> {
    const targetSalonId = resolveSalonId(salonId)

    if (isSupabaseConfigured() && supabase) {
      const payload: Record<string, any> = {
        updated_at: new Date().toISOString(),
      }
      if (settings.allowNegativeStock !== undefined) payload.allow_negative_stock = settings.allowNegativeStock
      if (settings.defaultValuationMethod !== undefined) payload.default_valuation_method = settings.defaultValuationMethod
      if (settings.nearExpiryDays !== undefined) payload.near_expiry_days = settings.nearExpiryDays
      if (settings.highValueLossThreshold !== undefined) payload.high_value_loss_threshold = settings.highValueLossThreshold

      const { error } = await supabase
        .from('inventory_settings')
        .upsert({ salon_id: targetSalonId, ...payload })

      if (error) {
        throw new Error(`Failed to update inventory settings: ${error.message}`)
      }
    }
  },
}
