import React from 'react'
import type { InventoryProduct } from '../../../types/inventory'
import { formatCurrency, getStatusBadgeInfo, isLowStock, isOutOfStock } from '../../../config/inventoryConfig'

interface ProductTableRowProps {
  product: InventoryProduct
  onSelect?: (product: InventoryProduct) => void
  onOpenAdjust?: (product: InventoryProduct) => void
  onOpenEdit?: (product: InventoryProduct) => void
}

export const ProductTableRow: React.FC<ProductTableRowProps> = ({
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
    <tr
      className={`inventory-table-row ${isOut ? 'row-out-of-stock' : isLow ? 'row-low-stock' : ''}`}
      onClick={() => onSelect?.(product)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect?.(product)
        }
      }}
      tabIndex={0}
      role="row"
      style={{ cursor: 'pointer' }}
    >
      {/* 1. Product (Name and Brand) */}
      <td className="cell-product">
        <div className="product-info-wrap">
          <div className="product-icon-avatar" aria-hidden="true">
            {product.name.charAt(0).toUpperCase()}
          </div>
          <div className="product-text-details">
            <span className="product-name" title={product.name}>
              {product.name}
            </span>
            <span className="product-brand" title={product.brand}>
              {product.brand}
              {product.subcategory && (
                <span className="product-subcategory"> • {product.subcategory}</span>
              )}
            </span>
          </div>
        </div>
      </td>

      {/* 2. Category */}
      <td className="cell-category">
        <span className="category-tag">{product.category}</span>
      </td>

      {/* 3. SKU */}
      <td className="cell-sku">
        <code className="sku-code">{product.sku}</code>
      </td>

      {/* 4. Stock (Quantity and Unit) */}
      <td className="cell-stock">
        <div className="stock-info">
          <span className={`stock-quantity ${isOut ? 'text-danger' : isLow ? 'text-warning' : ''}`}>
            {product.currentStock} {product.unit}
          </span>
          {isLow && !isOut && (
            <span className="stock-warning-badge" title={`Min threshold: ${product.minStockThreshold} ${product.unit}`}>
              Low
            </span>
          )}
          {isOut && (
            <span className="stock-danger-badge">Empty</span>
          )}
        </div>
      </td>

      {/* 5. Purchase Price */}
      <td className="cell-price purchase-price">
        <span className="price-amount">{formatCurrency(product.purchasePrice)}</span>
      </td>

      {/* 6. Selling Price */}
      <td className="cell-price selling-price">
        <span className="price-amount bold">{formatCurrency(product.sellingPrice)}</span>
      </td>

      {/* 7. Status */}
      <td className="cell-status">
        <span className={`status-pill ${badgeInfo.className}`}>
          <span className="status-dot" aria-hidden="true" />
          <span>{badgeInfo.label}</span>
        </span>
      </td>

      {/* 8. Quick Actions */}
      <td className="cell-actions" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
          {!isArchived && onOpenAdjust && (
            <button
              type="button"
              className="btn-row-action"
              style={{
                background: 'rgba(197, 160, 89, 0.12)',
                border: '1px solid rgba(197, 160, 89, 0.35)',
                color: '#f1f5f9',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => onOpenAdjust(product)}
              title="Adjust stock quantity"
            >
              Adjust
            </button>
          )}
          {onOpenEdit && (
            <button
              type="button"
              className="btn-row-action"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                padding: '0.3rem 0.6rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              onClick={() => onOpenEdit(product)}
              title="Edit product information"
            >
              Edit
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

