import React, { useState } from 'react'
import type { InventoryProduct, ProductCategory, ProductUnit, ScannedProductItem } from '../../../types/inventory'
import { PRODUCT_CATEGORIES, STANDARD_PRODUCT_UNITS } from '../../../config/inventoryConfig'
import { CloseIcon, BarcodeIcon } from '../../../components/Icons'
import {
  validateUnknownProduct,
  roundPrice,
  roundQuantity,
  isDecimalAllowedForUnit,
  type UnknownProductValidationErrors,
} from '../../../utils/inventoryValidation'

interface UnknownProductModalProps {
  barcode: string
  existingProducts?: InventoryProduct[]
  pendingBatch?: ScannedProductItem[]
  onConfirm: (item: ScannedProductItem) => void
  onCancel: () => void
}

export const UnknownProductModal: React.FC<UnknownProductModalProps> = ({
  barcode,
  existingProducts = [],
  pendingBatch = [],
  onConfirm,
  onCancel,
}) => {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState<ProductCategory>('Hair Care')
  const [unit, setUnit] = useState<ProductUnit>('bottle')
  const [sellingPrice, setSellingPrice] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [sku, setSku] = useState('')
  const [errors, setErrors] = useState<UnknownProductValidationErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleValidate = (): boolean => {
    const result = validateUnknownProduct(
      {
        barcode,
        name,
        brand,
        category,
        unit,
        sellingPrice,
        purchasePrice,
        quantity,
        sku,
      },
      existingProducts,
      pendingBatch
    )
    setErrors(result.errors)
    return result.isValid
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return

    if (!handleValidate()) return

    setIsSubmitting(true)
    try {
      const timestamp = Date.now()
      const finalSku = sku.trim() || `SKU-${timestamp.toString().slice(-6)}`
      const finalPurchase = purchasePrice !== '' ? roundPrice(Number(purchasePrice)) : 0
      const finalSelling = roundPrice(Number(sellingPrice))
      const finalQty = roundQuantity(Number(quantity || '1'), unit)

      const item: ScannedProductItem = {
        id: `scanned-new-${timestamp}-${Math.floor(1000 + Math.random() * 9000)}`,
        barcode: barcode, // Preserved exactly as scanned
        sku: finalSku,
        name: name.trim(),
        brand: brand.trim(),
        category,
        unit,
        purchasePrice: finalPurchase,
        sellingPrice: finalSelling,
        quantity: finalQty > 0 ? finalQty : 1,
        isNewProduct: true,
      }

      onConfirm(item)
    } finally {
      setIsSubmitting(false)
    }
  }

  const allowsDecimalStock = isDecimalAllowedForUnit(unit)

  return (
    <div className="unknown-modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="unknown-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="unknown-modal-header">
          <div>
            <span className="create-inv-kicker">New Barcode Identified</span>
            <h3 className="create-inv-title" style={{ fontSize: '1.25rem' }}>
              Product Details Required
            </h3>
            <div className="unknown-barcode-badge">
              <BarcodeIcon size={16} />
              <span>Barcode: <strong>{barcode}</strong></span>
            </div>
          </div>
          <button
            type="button"
            className="create-inv-close-btn"
            onClick={onCancel}
            aria-label="Cancel barcode details"
            disabled={isSubmitting}
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {errors.barcode && (
          <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            {errors.barcode}
          </div>
        )}

        <p style={{ margin: '0', fontSize: '0.86rem', color: '#94a3b8', lineHeight: 1.45 }}>
          This barcode does not exist in your salon inventory. Review and complete the product details below to add it to your intake batch.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} noValidate>
          {/* 1. Product Name */}
          <div className="form-group">
            <label className="form-label" htmlFor="un-name">
              Product Name <span className="req">*</span>
            </label>
            <input
              id="un-name"
              type="text"
              className={`form-input ${errors.name ? 'has-error' : ''}`}
              placeholder="e.g. Argan Oil Hair Mask"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
              required
              autoFocus
            />
            {errors.name && <span className="form-error-msg">{errors.name}</span>}
          </div>

          {/* 2. Brand & Category */}
          <div className="form-grid-2col">
            <div className="form-group">
              <label className="form-label" htmlFor="un-brand">
                Brand <span className="req">*</span>
              </label>
              <input
                id="un-brand"
                type="text"
                className={`form-input ${errors.brand ? 'has-error' : ''}`}
                placeholder="e.g. Schwarzkopf, L'Oréal"
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value)
                  if (errors.brand) setErrors({ ...errors, brand: undefined })
                }}
                required
              />
              {errors.brand && <span className="form-error-msg">{errors.brand}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="un-category">
                Category <span className="req">*</span>
              </label>
              <select
                id="un-category"
                className={`form-select ${errors.category ? 'has-error' : ''}`}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value as ProductCategory)
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
          </div>

          {/* 3. Unit, Selling Price, Purchase Price */}
          <div className="form-grid-3col">
            <div className="form-group">
              <label className="form-label" htmlFor="un-unit">
                Unit <span className="req">*</span>
              </label>
              <select
                id="un-unit"
                className={`form-select ${errors.unit ? 'has-error' : ''}`}
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value as ProductUnit)
                  if (errors.unit) setErrors({ ...errors, unit: undefined })
                  if (errors.quantity) setErrors({ ...errors, quantity: undefined })
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

            <div className="form-group">
              <label className="form-label" htmlFor="un-selling">
                Selling Price (₹) <span className="req">*</span>
              </label>
              <input
                id="un-selling"
                type="number"
                min="0"
                step="any"
                className={`form-input ${errors.sellingPrice ? 'has-error' : ''}`}
                placeholder="e.g. 1200"
                value={sellingPrice}
                onChange={(e) => {
                  setSellingPrice(e.target.value)
                  if (errors.sellingPrice) setErrors({ ...errors, sellingPrice: undefined })
                }}
                required
              />
              {errors.sellingPrice && <span className="form-error-msg">{errors.sellingPrice}</span>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="un-purchase">
                Purchase Cost (₹) <span className="opt">(0 allowed)</span>
              </label>
              <input
                id="un-purchase"
                type="number"
                min="0"
                step="any"
                className={`form-input ${errors.purchasePrice ? 'has-error' : ''}`}
                placeholder="e.g. 750"
                value={purchasePrice}
                onChange={(e) => {
                  setPurchasePrice(e.target.value)
                  if (errors.purchasePrice) setErrors({ ...errors, purchasePrice: undefined })
                }}
              />
              {errors.purchasePrice && <span className="form-error-msg">{errors.purchasePrice}</span>}
            </div>
          </div>

          {/* 4. Intake Quantity & SKU */}
          <div className="form-grid-2col">
            <div className="form-group">
              <label className="form-label" htmlFor="un-qty">
                Intake Quantity <span className="req">*</span>
              </label>
              <input
                id="un-qty"
                type="number"
                min="0.01"
                step={allowsDecimalStock ? '0.01' : '1'}
                className={`form-input ${errors.quantity ? 'has-error' : ''}`}
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value)
                  if (errors.quantity) setErrors({ ...errors, quantity: undefined })
                }}
                required
              />
              {errors.quantity && <span className="form-error-msg">{errors.quantity}</span>}
              <span className="form-hint">
                {allowsDecimalStock ? 'Fractional quantities supported for ml/g/kg/oz.' : 'Whole number integer required.'}
              </span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="un-sku">
                SKU <span className="opt">(Optional, auto-generated if blank)</span>
              </label>
              <input
                id="un-sku"
                type="text"
                className={`form-input ${errors.sku ? 'has-error' : ''}`}
                placeholder="e.g. SCH-MSK-500"
                value={sku}
                onChange={(e) => {
                  setSku(e.target.value)
                  if (errors.sku) setErrors({ ...errors, sku: undefined })
                }}
              />
              {errors.sku && <span className="form-error-msg">{errors.sku}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn-secondary" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add to Scanned Batch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
