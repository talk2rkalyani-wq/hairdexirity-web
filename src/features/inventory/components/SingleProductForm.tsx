import React, { useState } from 'react'
import type { InventoryProduct, ProductCategory, ProductUnit } from '../../../types/inventory'
import { PRODUCT_CATEGORIES, STANDARD_PRODUCT_UNITS } from '../../../config/inventoryConfig'
import {
  validateSingleProduct,
  roundPrice,
  roundQuantity,
  isDecimalAllowedForUnit,
  type SingleProductValidationErrors,
} from '../../../utils/inventoryValidation'

interface SingleProductFormProps {
  existingProducts?: InventoryProduct[]
  onSave: (product: InventoryProduct) => Promise<void> | void
  onCancel: () => void
}

interface FormState {
  name: string
  category: ProductCategory
  subcategory: string
  brand: string
  unit: ProductUnit
  barcode: string
  sku: string
  purchasePrice: string
  sellingPrice: string
  currentStock: string
  minStockThreshold: string
  description: string
}

export const SingleProductForm: React.FC<SingleProductFormProps> = ({
  existingProducts = [],
  onSave,
  onCancel,
}) => {
  const [formData, setFormData] = useState<FormState>({
    name: '',
    category: 'Hair Care',
    subcategory: '',
    brand: '',
    unit: 'bottle',
    barcode: '',
    sku: '',
    purchasePrice: '',
    sellingPrice: '',
    currentStock: '',
    minStockThreshold: '5',
    description: '',
  })

  const [errors, setErrors] = useState<SingleProductValidationErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleValidate = (): boolean => {
    setSubmitError(null)
    const result = validateSingleProduct(
      {
        name: formData.name,
        brand: formData.brand,
        category: formData.category,
        unit: formData.unit,
        purchasePrice: formData.purchasePrice,
        sellingPrice: formData.sellingPrice,
        currentStock: formData.currentStock,
        barcode: formData.barcode,
        sku: formData.sku,
        minStockThreshold: formData.minStockThreshold,
        subcategory: formData.subcategory,
        description: formData.description,
      },
      existingProducts
    )

    setErrors(result.errors)
    return result.isValid
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!handleValidate()) {
      return
    }

    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const timestamp = Date.now()
      const autoSku = formData.sku.trim() || `SKU-${timestamp.toString().slice(-6)}`
      const purchase = roundPrice(Number(formData.purchasePrice))
      const selling = roundPrice(Number(formData.sellingPrice))
      const stock = roundQuantity(Number(formData.currentStock), formData.unit)
      const threshold = formData.minStockThreshold !== '' ? Math.max(0, Number(formData.minStockThreshold)) : 5

      const newProduct: InventoryProduct = {
        id: `prod-${timestamp}-${Math.floor(1000 + Math.random() * 9000)}`,
        name: formData.name.trim(),
        category: formData.category,
        subcategory: formData.subcategory.trim() || undefined,
        brand: formData.brand.trim(),
        unit: formData.unit.trim(),
        barcode: formData.barcode.trim() || undefined,
        sku: autoSku,
        purchasePrice: purchase,
        sellingPrice: selling,
        currentStock: stock,
        minStockThreshold: threshold,
        status: stock <= 0 ? 'out_of_stock' : stock <= threshold ? 'low_stock' : 'active',
        description: formData.description.trim() || undefined,
        createdAt: new Date().toISOString(),
      }

      await onSave(newProduct)
    } catch (err: any) {
      setSubmitError(err?.message || 'Failed to save product to inventory. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const allowsDecimalStock = isDecimalAllowedForUnit(formData.unit)

  return (
    <form className="single-product-form" onSubmit={handleSubmit} noValidate>
      {submitError && (
        <div
          role="alert"
          style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '0.86rem',
            fontWeight: 500,
            marginBottom: '1rem',
          }}
        >
          ⚠️ {submitError}
        </div>
      )}

      {/* 1. Basic Information */}
      <div className="form-grid-2col">
        <div className="form-group">
          <label className="form-label" htmlFor="sp-name">
            Product Name <span className="req">*</span>
          </label>
          <input
            id="sp-name"
            type="text"
            className={`form-input ${errors.name ? 'has-error' : ''}`}
            placeholder="e.g. Keratin Smooth Shampoo"
            value={formData.name}
            onChange={(e) => {
              setFormData({ ...formData, name: e.target.value })
              if (errors.name) setErrors({ ...errors, name: undefined })
            }}
            required
            autoFocus
          />
          {errors.name && <span className="form-error-msg">{errors.name}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-brand">
            Brand <span className="req">*</span>
          </label>
          <input
            id="sp-brand"
            type="text"
            className={`form-input ${errors.brand ? 'has-error' : ''}`}
            placeholder="e.g. L'Oréal Professionnel, Olaplex"
            value={formData.brand}
            onChange={(e) => {
              setFormData({ ...formData, brand: e.target.value })
              if (errors.brand) setErrors({ ...errors, brand: undefined })
            }}
            required
          />
          {errors.brand && <span className="form-error-msg">{errors.brand}</span>}
        </div>
      </div>

      {/* 2. Categorization & Packaging */}
      <div className="form-grid-3col">
        <div className="form-group">
          <label className="form-label" htmlFor="sp-category">
            Category <span className="req">*</span>
          </label>
          <select
            id="sp-category"
            className={`form-select ${errors.category ? 'has-error' : ''}`}
            value={formData.category}
            onChange={(e) => {
              setFormData({ ...formData, category: e.target.value as ProductCategory })
              if (errors.category) setErrors({ ...errors, category: undefined })
            }}
          >
            {PRODUCT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          {errors.category && <span className="form-error-msg">{errors.category}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-subcategory">
            Subcategory <span className="opt">(Optional)</span>
          </label>
          <input
            id="sp-subcategory"
            type="text"
            className="form-input"
            placeholder="e.g. Color Radiance"
            value={formData.subcategory}
            onChange={(e) => setFormData({ ...formData, subcategory: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-unit">
            Unit <span className="req">*</span>
          </label>
          <select
            id="sp-unit"
            className={`form-select ${errors.unit ? 'has-error' : ''}`}
            value={formData.unit}
            onChange={(e) => {
              setFormData({ ...formData, unit: e.target.value })
              if (errors.unit) setErrors({ ...errors, unit: undefined })
              if (errors.currentStock) setErrors({ ...errors, currentStock: undefined })
            }}
          >
            {STANDARD_PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          {errors.unit && <span className="form-error-msg">{errors.unit}</span>}
        </div>
      </div>

      {/* 3. Pricing & Stock Levels */}
      <div className="form-grid-3col">
        <div className="form-group">
          <label className="form-label" htmlFor="sp-purchase-price">
            Purchase Price (₹) <span className="req">*</span>
          </label>
          <input
            id="sp-purchase-price"
            type="number"
            min="0"
            step="any"
            className={`form-input ${errors.purchasePrice ? 'has-error' : ''}`}
            placeholder="e.g. 850 (0 allowed)"
            value={formData.purchasePrice}
            onChange={(e) => {
              setFormData({ ...formData, purchasePrice: e.target.value })
              if (errors.purchasePrice) setErrors({ ...errors, purchasePrice: undefined })
            }}
            required
          />
          {errors.purchasePrice && <span className="form-error-msg">{errors.purchasePrice}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-selling-price">
            Selling Price (₹) <span className="req">*</span>
          </label>
          <input
            id="sp-selling-price"
            type="number"
            min="0"
            step="any"
            className={`form-input ${errors.sellingPrice ? 'has-error' : ''}`}
            placeholder="e.g. 1400"
            value={formData.sellingPrice}
            onChange={(e) => {
              setFormData({ ...formData, sellingPrice: e.target.value })
              if (errors.sellingPrice) setErrors({ ...errors, sellingPrice: undefined })
            }}
            required
          />
          {errors.sellingPrice && <span className="form-error-msg">{errors.sellingPrice}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-stock">
            Opening Stock <span className="req">*</span>
          </label>
          <input
            id="sp-stock"
            type="number"
            min="0"
            step={allowsDecimalStock ? '0.01' : '1'}
            className={`form-input ${errors.currentStock ? 'has-error' : ''}`}
            placeholder={allowsDecimalStock ? 'e.g. 15.5' : 'e.g. 15'}
            value={formData.currentStock}
            onChange={(e) => {
              setFormData({ ...formData, currentStock: e.target.value })
              if (errors.currentStock) setErrors({ ...errors, currentStock: undefined })
            }}
            required
          />
          {errors.currentStock && <span className="form-error-msg">{errors.currentStock}</span>}
          <span className="form-hint">
            {allowsDecimalStock ? 'Fractional quantities allowed for volume/mass.' : 'Whole number only for discrete units.'}
          </span>
        </div>
      </div>

      {/* 4. Barcode & SKU (Strictly Separate Fields per Section 2 & 3) */}
      <div className="form-grid-2col">
        <div className="form-group">
          <label className="form-label" htmlFor="sp-barcode">
            Barcode <span className="opt">(Optional, optical scanner code)</span>
          </label>
          <input
            id="sp-barcode"
            type="text"
            className={`form-input ${errors.barcode ? 'has-error' : ''}`}
            placeholder="e.g. 8901234567890"
            value={formData.barcode}
            onChange={(e) => {
              setFormData({ ...formData, barcode: e.target.value })
              if (errors.barcode) setErrors({ ...errors, barcode: undefined })
            }}
          />
          {errors.barcode && <span className="form-error-msg">{errors.barcode}</span>}
          <span className="form-hint">Physical barcode scanned by USB/Bluetooth barcode reader.</span>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-sku">
            SKU / Product Code <span className="opt">(Optional, auto-generated if blank)</span>
          </label>
          <input
            id="sp-sku"
            type="text"
            className={`form-input ${errors.sku ? 'has-error' : ''}`}
            placeholder="e.g. LOR-KRT-250ML"
            value={formData.sku}
            onChange={(e) => {
              setFormData({ ...formData, sku: e.target.value })
              if (errors.sku) setErrors({ ...errors, sku: undefined })
            }}
          />
          {errors.sku && <span className="form-error-msg">{errors.sku}</span>}
          <span className="form-hint">Internal salon inventory code for quick search and identification.</span>
        </div>
      </div>

      {/* 5. Minimum Stock Threshold & Description */}
      <div className="form-grid-2col">
        <div className="form-group">
          <label className="form-label" htmlFor="sp-min-threshold">
            Minimum Stock Threshold <span className="opt">(Low stock warning trigger)</span>
          </label>
          <input
            id="sp-min-threshold"
            type="number"
            min="0"
            step="1"
            className={`form-input ${errors.minStockThreshold ? 'has-error' : ''}`}
            placeholder="Default: 5"
            value={formData.minStockThreshold}
            onChange={(e) => {
              setFormData({ ...formData, minStockThreshold: e.target.value })
              if (errors.minStockThreshold) setErrors({ ...errors, minStockThreshold: undefined })
            }}
          />
          {errors.minStockThreshold && <span className="form-error-msg">{errors.minStockThreshold}</span>}
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="sp-desc">
            Product Description <span className="opt">(Optional)</span>
          </label>
          <textarea
            id="sp-desc"
            className="form-textarea"
            placeholder="Brief details regarding formulation, target hair/skin type, or salon backbar usage..."
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="create-inv-footer" style={{ padding: '0', background: 'transparent', borderTop: 'none' }}>
        <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </button>
        <button type="submit" className="btn-primary" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Product'}
        </button>
      </div>
    </form>
  )
}
