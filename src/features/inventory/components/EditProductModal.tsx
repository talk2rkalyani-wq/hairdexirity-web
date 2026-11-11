import React, { useState, useEffect } from 'react'
import type { InventoryProduct, ProductCategory, ProductUnit } from '../../../types/inventory'
import { PRODUCT_CATEGORIES, STANDARD_PRODUCT_UNITS } from '../../../config/inventoryConfig'
import { roundPrice } from '../../../utils/inventoryValidation'
import { inventoryService } from '../../../services/inventoryService'
import { CloseIcon } from '../../../components/Icons'
import './EditProductModal.css'

interface EditProductModalProps {
  isOpen: boolean
  product: InventoryProduct | null
  existingProducts?: InventoryProduct[]
  onClose: () => void
  onSuccess: (updatedProduct: InventoryProduct) => void
}

export const EditProductModal: React.FC<EditProductModalProps> = ({
  isOpen,
  product,
  existingProducts = [],
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [category, setCategory] = useState<ProductCategory>('Hair Care')
  const [subcategory, setSubcategory] = useState('')
  const [unit, setUnit] = useState<ProductUnit>('bottle')
  const [sku, setSku] = useState('')
  const [barcode, setBarcode] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [sellingPrice, setSellingPrice] = useState('')
  const [minThreshold, setMinThreshold] = useState('5')
  const [description, setDescription] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (product) {
      setName(product.name || '')
      setBrand(product.brand || '')
      setCategory(product.category || 'Hair Care')
      setSubcategory(product.subcategory || '')
      setUnit(product.unit || 'bottle')
      setSku(product.sku || '')
      setBarcode(product.barcode || '')
      setPurchasePrice(product.purchasePrice !== undefined ? String(product.purchasePrice) : '0')
      setSellingPrice(product.sellingPrice !== undefined ? String(product.sellingPrice) : '0')
      setMinThreshold(product.minStockThreshold !== undefined ? String(product.minStockThreshold) : '5')
      setDescription(product.description || '')
      setErrors({})
      setSubmitError(null)
    }
  }, [product])

  if (!isOpen || !product) return null

  const validate = (): boolean => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Product name is required.'
    if (!brand.trim()) errs.brand = 'Brand is required.'
    if (!sku.trim()) errs.sku = 'SKU is required.'

    const pPrice = parseFloat(purchasePrice)
    if (isNaN(pPrice) || pPrice < 0) {
      errs.purchasePrice = 'Purchase price cannot be negative.'
    }

    const sPrice = parseFloat(sellingPrice)
    if (isNaN(sPrice) || sPrice < 0) {
      errs.sellingPrice = 'Selling price cannot be negative.'
    }

    const thresh = parseFloat(minThreshold)
    if (isNaN(thresh) || thresh < 0) {
      errs.minThreshold = 'Minimum stock threshold cannot be negative.'
    }

    // Uniqueness validation against other products in the salon
    const otherProducts = existingProducts.filter((p) => p.id !== product.id)

    if (sku.trim()) {
      const dupSku = otherProducts.find(
        (p) => p.sku && p.sku.trim().toLowerCase() === sku.trim().toLowerCase()
      )
      if (dupSku) {
        errs.sku = `SKU "${sku}" is already assigned to "${dupSku.name}".`
      }
    }

    if (barcode.trim()) {
      const dupBarcode = otherProducts.find(
        (p) => p.barcode && p.barcode.trim().toLowerCase() === barcode.trim().toLowerCase()
      )
      if (dupBarcode) {
        errs.barcode = `Barcode "${barcode}" is already assigned to "${dupBarcode.name}".`
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setIsSubmitting(true)
    try {
      const updated = await inventoryService.updateProduct(product.id, {
        name: name.trim(),
        brand: brand.trim(),
        category,
        subcategory: subcategory.trim() || undefined,
        unit,
        sku: sku.trim(),
        barcode: barcode.trim() || undefined,
        purchasePrice: roundPrice(parseFloat(purchasePrice)),
        sellingPrice: roundPrice(parseFloat(sellingPrice)),
        minStockThreshold: Math.max(0, parseFloat(minThreshold) || 5),
        description: description.trim() || undefined,
      })

      onSuccess(updated)
      onClose()
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to update product')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="edit-prod-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="edit-prod-card" onClick={(e) => e.stopPropagation()}>
        <div className="edit-prod-header">
          <h2 className="edit-prod-title">Edit Product Details</h2>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close modal">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="edit-prod-body">
            {submitError && (
              <div className="form-error-banner" role="alert">
                <span>⚠️ {submitError}</span>
              </div>
            )}

            <div className="edit-prod-field">
              <label className="edit-prod-label">Product Name *</label>
              <input
                type="text"
                className="edit-prod-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              {errors.name && <span className="edit-prod-field-error">{errors.name}</span>}
            </div>

            <div className="edit-prod-grid-2">
              <div className="edit-prod-field">
                <label className="edit-prod-label">Brand *</label>
                <input
                  type="text"
                  className="edit-prod-input"
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  required
                />
                {errors.brand && <span className="edit-prod-field-error">{errors.brand}</span>}
              </div>

              <div className="edit-prod-field">
                <label className="edit-prod-label">Category *</label>
                <select
                  className="edit-prod-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ProductCategory)}
                >
                  {PRODUCT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="edit-prod-grid-2">
              <div className="edit-prod-field">
                <label className="edit-prod-label">Subcategory (Optional)</label>
                <input
                  type="text"
                  className="edit-prod-input"
                  placeholder="e.g., Argan Serum"
                  value={subcategory}
                  onChange={(e) => setSubcategory(e.target.value)}
                />
              </div>

              <div className="edit-prod-field">
                <label className="edit-prod-label">Unit of Measure *</label>
                <select
                  className="edit-prod-select"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as ProductUnit)}
                >
                  {STANDARD_PRODUCT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="edit-prod-grid-2">
              <div className="edit-prod-field">
                <label className="edit-prod-label">SKU Code *</label>
                <input
                  type="text"
                  className="edit-prod-input"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  required
                />
                {errors.sku && <span className="edit-prod-field-error">{errors.sku}</span>}
              </div>

              <div className="edit-prod-field">
                <label className="edit-prod-label">Barcode (Optional)</label>
                <input
                  type="text"
                  className="edit-prod-input"
                  placeholder="Optical barcode"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                />
                {errors.barcode && <span className="edit-prod-field-error">{errors.barcode}</span>}
              </div>
            </div>

            <div className="edit-prod-grid-2">
              <div className="edit-prod-field">
                <label className="edit-prod-label">Purchase Price (Cost) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="edit-prod-input"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  required
                />
                {errors.purchasePrice && (
                  <span className="edit-prod-field-error">{errors.purchasePrice}</span>
                )}
              </div>

              <div className="edit-prod-field">
                <label className="edit-prod-label">Selling Price (Retail) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="edit-prod-input"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  required
                />
                {errors.sellingPrice && (
                  <span className="edit-prod-field-error">{errors.sellingPrice}</span>
                )}
              </div>
            </div>

            <div className="edit-prod-field">
              <label className="edit-prod-label">Minimum Stock Alert Threshold</label>
              <input
                type="number"
                step="1"
                min="0"
                className="edit-prod-input"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
              />
              {errors.minThreshold && (
                <span className="edit-prod-field-error">{errors.minThreshold}</span>
              )}
            </div>

            <div className="edit-prod-field">
              <label className="edit-prod-label">Description (Optional)</label>
              <textarea
                className="edit-prod-textarea"
                placeholder="Product instructions or usage details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="edit-prod-footer">
            <button type="button" className="btn-edit-cancel" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-edit-confirm" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <div className="btn-spinner" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

