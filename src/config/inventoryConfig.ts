// ==============================================================================
// Luma Salon — Product Inventory Configuration
// Phase 2: Category Definitions & Reusable Business Rules
// ==============================================================================

import type { ProductCategory, ProductStatus, InventoryProduct } from '../types/inventory.ts'

export interface CategoryConfig {
  id: ProductCategory
  label: string
  description: string
  badgeColor: string
}

/**
 * 9 Core Salon Product Categories per Phase 2 requirements.
 * Decoupled from UI components for extensibility.
 */
export const PRODUCT_CATEGORIES: readonly ProductCategory[] = [
  'Hair Care',
  'Hair Styling',
  'Hair Treatment',
  'Nail Products',
  'Makeup Products',
  'Pedicure Products',
  'Manicure Products',
  'Beautician Products',
  'Other Salon Products',
] as const

/**
 * Standard measurement units for salon inventory.
 */
export const STANDARD_PRODUCT_UNITS = [
  'bottle',
  'tube',
  'pcs',
  'box',
  'kit',
  'pack',
  'ml',
  'g',
  'kg',
  'oz',
] as const

export type StandardProductUnit = (typeof STANDARD_PRODUCT_UNITS)[number]

/**
 * Structured metadata for each salon product category.
 */
export const PRODUCT_CATEGORY_CONFIGS: readonly CategoryConfig[] = [
  {
    id: 'Hair Care',
    label: 'Hair Care',
    description: 'Shampoos, conditioners, hair masks, and scalp care formulations.',
    badgeColor: '#38bdf8', // Light blue
  },
  {
    id: 'Hair Styling',
    label: 'Hair Styling',
    description: 'Hairsprays, waxes, pomades, mousses, and styling gels.',
    badgeColor: '#818cf8', // Indigo
  },
  {
    id: 'Hair Treatment',
    label: 'Hair Treatment',
    description: 'Keratin, bond rebuilders, deep nourishment, and hair botox.',
    badgeColor: '#c084fc', // Purple
  },
  {
    id: 'Nail Products',
    label: 'Nail Products',
    description: 'Gel polishes, nail art supplies, acrylic powders, and primers.',
    badgeColor: '#f472b6', // Pink
  },
  {
    id: 'Makeup Products',
    label: 'Makeup Products',
    description: 'Foundations, concealers, palettes, lipsticks, and setting sprays.',
    badgeColor: '#fb7185', // Rose
  },
  {
    id: 'Pedicure Products',
    label: 'Pedicure Products',
    description: 'Foot soaks, scrubs, callus removers, cuticle oils, and lotions.',
    badgeColor: '#34d399', // Emerald
  },
  {
    id: 'Manicure Products',
    label: 'Manicure Products',
    description: 'Hand creams, cuticle softeners, nail files, and buffers.',
    badgeColor: '#2dd4bf', // Teal
  },
  {
    id: 'Beautician Products',
    label: 'Beautician Products',
    description: 'Facial kits, serums, waxes, facial clays, and skin peels.',
    badgeColor: '#fbbf24', // Amber
  },
  {
    id: 'Other Salon Products',
    label: 'Other Salon Products',
    description: 'Disposables, foils, sanitizers, developer liquids, and towels.',
    badgeColor: '#94a3b8', // Slate
  },
] as const

/**
 * Validates whether a given string is a valid ProductCategory.
 */
export function isValidCategory(value: unknown): value is ProductCategory {
  return typeof value === 'string' && PRODUCT_CATEGORIES.includes(value as ProductCategory)
}

/**
 * Validates whether a given string is a valid StandardProductUnit.
 */
export function isValidUnit(value: unknown): value is StandardProductUnit {
  return typeof value === 'string' && STANDARD_PRODUCT_UNITS.includes(value as StandardProductUnit)
}

/**
 * Formats a numeric price into localized salon currency (₹ INR).
 */
export function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0'
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/**
 * Determines whether a product's current stock has fallen to or below the minimum threshold.
 */
export function isLowStock(product: Pick<InventoryProduct, 'currentStock' | 'minStockThreshold'>): boolean {
  return product.currentStock > 0 && product.currentStock <= product.minStockThreshold
}

/**
 * Determines whether a product is completely out of stock.
 */
export function isOutOfStock(product: Pick<InventoryProduct, 'currentStock'>): boolean {
  return product.currentStock <= 0
}

/**
 * Returns human-friendly badge information for product status.
 */
export function getStatusBadgeInfo(
  status: ProductStatus,
  currentStock?: number,
  minThreshold?: number
): { label: string; className: string } {
  if (status === 'archived') {
    return { label: 'Archived', className: 'status-archived' }
  }
  if (status === 'inactive') {
    return { label: 'Inactive', className: 'status-inactive' }
  }
  if (currentStock !== undefined && currentStock <= 0) {
    return { label: 'Out of Stock', className: 'status-out-of-stock' }
  }
  if (
    currentStock !== undefined &&
    minThreshold !== undefined &&
    currentStock <= minThreshold
  ) {
    return { label: 'Low Stock', className: 'status-low-stock' }
  }

  switch (status) {
    case 'active':
      return { label: 'Active', className: 'status-active' }
    case 'low_stock':
      return { label: 'Low Stock', className: 'status-low-stock' }
    case 'out_of_stock':
      return { label: 'Out of Stock', className: 'status-out-of-stock' }
    default:
      return { label: 'Active', className: 'status-active' }
  }
}

