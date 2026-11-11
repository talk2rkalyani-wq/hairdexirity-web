// ==============================================================================
// Luma Salon — Product Inventory Validation Utilities
// Phase 4: Product Creation Workflow & Data Validation
// ==============================================================================

import type { InventoryProduct, ScannedProductItem } from '../types/inventory.ts'
import {
  PRODUCT_CATEGORIES,
  STANDARD_PRODUCT_UNITS,
  isValidCategory,
  isValidUnit,
} from '../config/inventoryConfig.ts'

/**
 * Standard units where fractional/decimal quantities are physically appropriate.
 * Volume (ml, oz) and mass/weight (g, kg).
 */
export const DECIMAL_ALLOWED_UNITS: readonly string[] = ['ml', 'g', 'kg', 'oz'] as const

/**
 * Checks whether a measurement unit supports decimal/fractional quantities.
 */
export function isDecimalAllowedForUnit(unit: string): boolean {
  if (!unit) return false
  return DECIMAL_ALLOWED_UNITS.includes(unit.trim().toLowerCase())
}

/**
 * High-precision rounding to eliminate floating-point representation drift (e.g. 0.1 + 0.2 = 0.30000000000000004).
 * Rounds currency values safely to 2 decimal places.
 */
export function roundPrice(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * High-precision quantity rounding based on unit capabilities.
 * Enforces strict integers for discrete units, allows up to 3 decimals for volume/weight.
 */
export function roundQuantity(qty: number, unit?: string): number {
  if (isNaN(qty) || !isFinite(qty)) return 0
  if (unit && !isDecimalAllowedForUnit(unit)) {
    return Math.round(qty)
  }
  return Math.round((qty + Number.EPSILON) * 1000) / 1000
}

/**
 * Validates a quantity value against a specific measurement unit.
 */
export function validateQuantityForUnit(
  quantity: number,
  unit: string
): { isValid: boolean; error?: string } {
  if (isNaN(quantity) || !isFinite(quantity)) {
    return { isValid: false, error: 'Quantity must be a valid number.' }
  }

  if (quantity < 0) {
    return { isValid: false, error: 'Quantity cannot be negative.' }
  }

  const allowsDecimal = isDecimalAllowedForUnit(unit)
  if (!allowsDecimal && !Number.isInteger(quantity)) {
    return {
      isValid: false,
      error: `Unit "${unit}" requires a whole number quantity (fractional/decimal values not allowed).`,
    }
  }

  return { isValid: true }
}

/**
 * Checks if a barcode already exists in the current inventory catalog or pending intake batch.
 */
export function isDuplicateBarcode(
  barcode: string,
  existingProducts: InventoryProduct[] = [],
  pendingBatch: ScannedProductItem[] = [],
  excludeProductId?: string
): boolean {
  const trimmed = barcode?.trim()
  if (!trimmed) return false

  const lower = trimmed.toLowerCase()

  // 1. Check existing catalog
  const existsInCatalog = existingProducts.some((p) => {
    if (excludeProductId && p.id === excludeProductId) return false
    return p.barcode ? p.barcode.trim().toLowerCase() === lower : false
  })
  if (existsInCatalog) return true

  // 2. Check pending scanned batch
  const existsInBatch = pendingBatch.some((item) => {
    if (excludeProductId && item.id === excludeProductId) return false
    return item.barcode.trim().toLowerCase() === lower
  })

  return existsInBatch
}

/**
 * Checks if a SKU already exists in the current inventory catalog.
 */
export function isDuplicateSku(
  sku: string,
  existingProducts: InventoryProduct[] = [],
  excludeProductId?: string
): boolean {
  const trimmed = sku?.trim()
  if (!trimmed) return false

  const lower = trimmed.toLowerCase()

  return existingProducts.some((p) => {
    if (excludeProductId && p.id === excludeProductId) return false
    return p.sku ? p.sku.trim().toLowerCase() === lower : false
  })
}

/**
 * Searches for an existing product in the catalog by exact barcode, SKU, or ID.
 */
export function findProductByBarcodeOrSku(
  code: string,
  products: InventoryProduct[] = []
): InventoryProduct | undefined {
  const raw = code?.trim()
  if (!raw) return undefined
  const lower = raw.toLowerCase()

  return products.find(
    (p) =>
      (p.barcode && p.barcode.trim().toLowerCase() === lower) ||
      (p.sku && p.sku.trim().toLowerCase() === lower) ||
      p.id.toLowerCase() === lower
  )
}

/**
 * Input fields for Single Product Form validation.
 */
export interface SingleProductInput {
  name: string
  brand: string
  category: string
  unit: string
  purchasePrice: string | number
  sellingPrice: string | number
  currentStock: string | number
  barcode?: string
  sku?: string
  minStockThreshold?: string | number
  subcategory?: string
  description?: string
}

/**
 * Field-by-field error map for Single Product Form.
 */
export interface SingleProductValidationErrors {
  name?: string
  brand?: string
  category?: string
  unit?: string
  purchasePrice?: string
  sellingPrice?: string
  currentStock?: string
  minStockThreshold?: string
  barcode?: string
  sku?: string
  general?: string
}

/**
 * Comprehensive validator for Single Product Creation.
 * Enforces all Section 3 and Section 7 requirements.
 */
export function validateSingleProduct(
  input: SingleProductInput,
  existingProducts: InventoryProduct[] = [],
  options?: { excludeProductId?: string }
): { isValid: boolean; errors: SingleProductValidationErrors } {
  const errors: SingleProductValidationErrors = {}

  // 1. Product Name (required, non-empty)
  const trimmedName = typeof input.name === 'string' ? input.name.trim() : ''
  if (!trimmedName) {
    errors.name = 'Product name is required.'
  }

  // 2. Brand (required, non-empty)
  const trimmedBrand = typeof input.brand === 'string' ? input.brand.trim() : ''
  if (!trimmedBrand) {
    errors.brand = 'Brand name is required.'
  }

  // 3. Category (required, must be one of 9 configured categories)
  if (!input.category || !isValidCategory(input.category)) {
    errors.category = `Please select a valid category from: ${PRODUCT_CATEGORIES.join(', ')}.`
  }

  // 4. Unit (required, must be from STANDARD_PRODUCT_UNITS)
  const trimmedUnit = typeof input.unit === 'string' ? input.unit.trim() : ''
  if (!trimmedUnit || !isValidUnit(trimmedUnit)) {
    errors.unit = `Unit must be one of: ${STANDARD_PRODUCT_UNITS.join(', ')}.`
  }

  // 5. Purchase Price (required, non-negative, zero allowed)
  const rawPurchase = input.purchasePrice
  if (rawPurchase === '' || rawPurchase === undefined || rawPurchase === null) {
    errors.purchasePrice = 'Purchase price is required.'
  } else {
    const numPurchase = Number(rawPurchase)
    if (isNaN(numPurchase) || !isFinite(numPurchase)) {
      errors.purchasePrice = 'Purchase price must be a valid number.'
    } else if (numPurchase < 0) {
      errors.purchasePrice = 'Purchase price cannot be negative.'
    }
  }

  // 6. Selling Price (required, non-negative)
  const rawSelling = input.sellingPrice
  if (rawSelling === '' || rawSelling === undefined || rawSelling === null) {
    errors.sellingPrice = 'Selling price is required.'
  } else {
    const numSelling = Number(rawSelling)
    if (isNaN(numSelling) || !isFinite(numSelling)) {
      errors.sellingPrice = 'Selling price must be a valid number.'
    } else if (numSelling < 0) {
      errors.sellingPrice = 'Selling price cannot be negative.'
    }
  }

  // 7. Opening Stock (required, non-negative, whole number for discrete units)
  const rawStock = input.currentStock
  if (rawStock === '' || rawStock === undefined || rawStock === null) {
    errors.currentStock = 'Opening stock quantity is required.'
  } else {
    const numStock = Number(rawStock)
    if (isNaN(numStock) || !isFinite(numStock)) {
      errors.currentStock = 'Opening stock must be a valid number.'
    } else if (numStock < 0) {
      errors.currentStock = 'Opening stock cannot be negative.'
    } else {
      const unitForCheck = trimmedUnit || 'pcs'
      const check = validateQuantityForUnit(numStock, unitForCheck)
      if (!check.isValid) {
        errors.currentStock = check.error
      }
    }
  }

  // 8. Minimum Stock Threshold (optional, defaults to 5, must be non-negative)
  const rawMin = input.minStockThreshold
  if (rawMin !== '' && rawMin !== undefined && rawMin !== null) {
    const numMin = Number(rawMin)
    if (isNaN(numMin) || !isFinite(numMin)) {
      errors.minStockThreshold = 'Minimum threshold must be a valid number.'
    } else if (numMin < 0) {
      errors.minStockThreshold = 'Minimum stock threshold cannot be negative.'
    }
  }

  // 9. Barcode uniqueness (optional, but must be unique if provided)
  const trimmedBarcode = typeof input.barcode === 'string' ? input.barcode.trim() : ''
  if (trimmedBarcode) {
    if (isDuplicateBarcode(trimmedBarcode, existingProducts, [], options?.excludeProductId)) {
      errors.barcode = `A product with barcode "${trimmedBarcode}" already exists in inventory.`
    }
  }

  // 10. SKU uniqueness (optional, but must be unique if provided)
  const trimmedSku = typeof input.sku === 'string' ? input.sku.trim() : ''
  if (trimmedSku) {
    if (isDuplicateSku(trimmedSku, existingProducts, options?.excludeProductId)) {
      errors.sku = `A product with SKU "${trimmedSku}" already exists in inventory.`
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Input fields for Unknown Product Modal validation in Live Mode.
 */
export interface UnknownProductInput {
  barcode: string
  name: string
  brand: string
  category: string
  unit: string
  sellingPrice: string | number
  purchasePrice?: string | number
  quantity?: string | number
  sku?: string
}

export interface UnknownProductValidationErrors {
  barcode?: string
  name?: string
  brand?: string
  category?: string
  unit?: string
  sellingPrice?: string
  purchasePrice?: string
  quantity?: string
  sku?: string
}

/**
 * Validates unknown product registration in Live Mode.
 * Enforces Section 4 & Section 6 requirements.
 */
export function validateUnknownProduct(
  input: UnknownProductInput,
  existingProducts: InventoryProduct[] = [],
  pendingBatch: ScannedProductItem[] = []
): { isValid: boolean; errors: UnknownProductValidationErrors } {
  const errors: UnknownProductValidationErrors = {}

  // 1. Barcode preservation and non-empty check
  const rawBarcode = typeof input.barcode === 'string' ? input.barcode : ''
  const trimmedBarcode = rawBarcode.trim()
  if (!trimmedBarcode) {
    errors.barcode = 'Barcode is required.'
  } else {
    // Check if barcode already exists in catalog
    const inCatalog = existingProducts.some(
      (p) => p.barcode && p.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase()
    )
    if (inCatalog) {
      errors.barcode = `Barcode "${trimmedBarcode}" already belongs to an existing inventory product.`
    }

    // Check if barcode is already in the pending batch
    const inBatch = pendingBatch.some(
      (item) => item.barcode.trim().toLowerCase() === trimmedBarcode.toLowerCase()
    )
    if (inBatch) {
      errors.barcode = `Barcode "${trimmedBarcode}" is already in your pending scanned batch.`
    }
  }

  // 2. Product Name (required)
  const trimmedName = typeof input.name === 'string' ? input.name.trim() : ''
  if (!trimmedName) {
    errors.name = 'Product name is required.'
  }

  // 3. Brand (required)
  const trimmedBrand = typeof input.brand === 'string' ? input.brand.trim() : ''
  if (!trimmedBrand) {
    errors.brand = 'Brand name is required.'
  }

  // 4. Category (required, valid)
  if (!input.category || !isValidCategory(input.category)) {
    errors.category = `Please select a valid category from: ${PRODUCT_CATEGORIES.join(', ')}.`
  }

  // 5. Unit (required, valid)
  const trimmedUnit = typeof input.unit === 'string' ? input.unit.trim() : ''
  if (!trimmedUnit || !isValidUnit(trimmedUnit)) {
    errors.unit = `Unit must be one of: ${STANDARD_PRODUCT_UNITS.join(', ')}.`
  }

  // 6. Selling Price (required, non-negative)
  const rawSelling = input.sellingPrice
  if (rawSelling === '' || rawSelling === undefined || rawSelling === null) {
    errors.sellingPrice = 'Selling price is required.'
  } else {
    const numSelling = Number(rawSelling)
    if (isNaN(numSelling) || !isFinite(numSelling)) {
      errors.sellingPrice = 'Selling price must be a valid number.'
    } else if (numSelling < 0) {
      errors.sellingPrice = 'Selling price cannot be negative.'
    }
  }

  // 7. Purchase Price (optional, but non-negative if provided)
  const rawPurchase = input.purchasePrice
  if (rawPurchase !== '' && rawPurchase !== undefined && rawPurchase !== null) {
    const numPurchase = Number(rawPurchase)
    if (isNaN(numPurchase) || !isFinite(numPurchase)) {
      errors.purchasePrice = 'Purchase price must be a valid number.'
    } else if (numPurchase < 0) {
      errors.purchasePrice = 'Purchase price cannot be negative.'
    }
  }

  // 8. Quantity / Opening stock (defaults to 1, must be > 0 and unit-validated)
  const rawQty = input.quantity
  const numQty = rawQty !== '' && rawQty !== undefined && rawQty !== null ? Number(rawQty) : 1
  if (isNaN(numQty) || !isFinite(numQty)) {
    errors.quantity = 'Quantity must be a valid number.'
  } else if (numQty <= 0) {
    errors.quantity = 'Intake quantity must be greater than zero.'
  } else {
    const unitForCheck = trimmedUnit || 'bottle'
    const check = validateQuantityForUnit(numQty, unitForCheck)
    if (!check.isValid) {
      errors.quantity = check.error
    }
  }

  // 9. SKU uniqueness (optional)
  const trimmedSku = typeof input.sku === 'string' ? input.sku.trim() : ''
  if (trimmedSku) {
    if (isDuplicateSku(trimmedSku, existingProducts)) {
      errors.sku = `A product with SKU "${trimmedSku}" already exists in inventory.`
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  }
}
