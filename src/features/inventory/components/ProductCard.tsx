import React from 'react'
import type { InventoryProduct } from '../../../types/inventory'
import { formatCurrency, getStatusBadgeInfo, isLowStock, isOutOfStock } from '../../../config/inventoryConfig'

interface ProductCardProps {
  product: InventoryProduct
  onSelect?: (product: InventoryProduct) => void
  onOpenAdjust?: (product: InventoryProduct) => void
  onOpenEdit?: (product: InventoryProduct) => void
}

export const ProductCard: React.FC<ProductCardProps> = ({
  product,
  onSelect,
  onOpenAdjust,
  onOpenEdit,
}) => {
  const badgeInfo = getStatusBadgeInfo(product.status, product.currentStock, product.minStockThreshold)
  const isLow = isLowStock(product)
  const isOut = isOutOfStock(product)
  const isArchived = product.status === 'archived'

  return (
    <article
      className={`inventory-product-card ${isOut ? 'card-out-of-stock' : isLow ? 'card-low-stock' : ''}`}
      onClick={() => onSelect?.(product)}
      role="button"
      tabIndex={0}
      aria-label={`${product.name} by ${product.brand}`}
      style={{ cursor: 'pointer' }}
    >
      {/* Top Header: Name, Brand, and Status */}
      <div className="product-card-top">
        <div className="product-card-title-group">
          <span className="product-card-brand">{product.brand}</span>
          <h3 className="product-card-name">{product.name}</h3>
        </div>
        <span className={`status-pill ${badgeInfo.className}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{badgeInfo.label}</span>
        </span>
      </div>

      {/* Meta Chips: Category & SKU */}
      <div className="product-card-meta">
        <span className="category-tag">{product.category}</span>
        <code className="sku-code">{product.sku}</code>
      </div>

      {/* Description if present */}
      {product.description && (
        <p className="product-card-desc">{product.description}</p>
      )}

      {/* Bottom Metrics: Stock and Selling Price */}
      <div className="product-card-footer">
        <div className="product-card-metric">
          <span className="metric-label">Stock</span>
          <span className={`metric-value ${isOut ? 'text-danger' : isLow ? 'text-warning' : ''}`}>
            {product.currentStock} {product.unit}
            {isLow && !isOut && <span className="card-low-indicator"> (Low)</span>}
          </span>
        </div>

        <div className="product-card-metric align-right">
          <span className="metric-label">Selling Price</span>
          <span className="metric-value price-highlight">{formatCurrency(product.sellingPrice)}</span>
        </div>
      </div>

      {/* Mobile Quick Action Buttons */}
      <div
        className="product-card-actions-row"
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginTop: '0.75rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {!isArchived && onOpenAdjust && (
          <button
            type="button"
            style={{
              flex: 1,
              background: 'rgba(197, 160, 89, 0.15)',
              border: '1px solid rgba(197, 160, 89, 0.4)',
              color: '#f1f5f9',
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => onOpenAdjust(product)}
          >
            Adjust Stock
          </button>
        )}
        {onOpenEdit && (
          <button
            type="button"
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              padding: '0.45rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
            onClick={() => onOpenEdit(product)}
          >
            Edit
          </button>
        )}
      </div>
    </article>
  )
}

