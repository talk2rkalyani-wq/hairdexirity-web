import React, { useState } from 'react'
import type { InventoryProduct } from '../../../types/inventory'
import { formatCurrency, getStatusBadgeInfo } from '../../../config/inventoryConfig'
import { StockHistoryTimeline } from './StockHistoryTimeline'
import { CloseIcon, EditIcon } from '../../../components/Icons'
import './ProductDetailModal.css'

interface ProductDetailModalProps {
  isOpen: boolean
  product: InventoryProduct | null
  onClose: () => void
  onOpenEdit: (product: InventoryProduct) => void
  onOpenAdjust: (product: InventoryProduct) => void
  onToggleArchive: (product: InventoryProduct) => void
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  isOpen,
  product,
  onClose,
  onOpenEdit,
  onOpenAdjust,
  onToggleArchive,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'history'>('overview')

  if (!isOpen || !product) return null

  const isArchived = product.status === 'archived'
  const badgeInfo = getStatusBadgeInfo(product.status, product.currentStock, product.minStockThreshold)

  // Gross profit margin calculation: ((selling - purchase) / selling) * 100
  let grossMargin = '0.0%'
  if (product.sellingPrice > 0) {
    const margin = ((product.sellingPrice - product.purchasePrice) / product.sellingPrice) * 100
    grossMargin = `${margin.toFixed(1)}%`
  }

  return (
    <div className="prod-detail-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="prod-detail-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="prod-detail-header">
          <div className="prod-detail-heading-area">
            <h2 className="prod-detail-title">{product.name}</h2>
            <div className="prod-detail-subtitle">
              <span>{product.brand}</span>
              <span>•</span>
              <span className={`status-pill ${badgeInfo.className}`}>
                <span className="status-dot" aria-hidden="true" />
                <span>{badgeInfo.label}</span>
              </span>
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close drawer">
            <CloseIcon size={20} />
          </button>
        </div>

        <div className="prod-detail-tabs-bar" role="tablist">
          <button
            type="button"
            className={`prod-detail-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            role="tab"
            aria-selected={activeTab === 'overview'}
          >
            Product Overview
          </button>
          <button
            type="button"
            className={`prod-detail-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
            role="tab"
            aria-selected={activeTab === 'history'}
          >
            Stock Movement History
          </button>
        </div>

        <div className="prod-detail-content">
          {activeTab === 'overview' ? (
            <>
              {/* Metrics Grid */}
              <div className="prod-overview-metrics-grid">
                <div className="prod-metric-box">
                  <span className="prod-metric-label">Current Stock</span>
                  <span className="prod-metric-value text-gold">
                    {product.currentStock} {product.unit}
                  </span>
                  <span className="prod-metric-sub">
                    Min alert: {product.minStockThreshold} {product.unit}
                  </span>
                </div>

                <div className="prod-metric-box">
                  <span className="prod-metric-label">Selling Price</span>
                  <span className="prod-metric-value">
                    {formatCurrency(product.sellingPrice)}
                  </span>
                  <span className="prod-metric-sub">
                    Cost: {formatCurrency(product.purchasePrice)}
                  </span>
                </div>

                <div className="prod-metric-box">
                  <span className="prod-metric-label">Gross Margin</span>
                  <span className="prod-metric-value" style={{ color: '#34d399' }}>
                    {grossMargin}
                  </span>
                  <span className="prod-metric-sub">
                    Markup per unit
                  </span>
                </div>
              </div>

              {/* Specifications Card */}
              <div className="prod-specs-card">
                <h3 className="prod-specs-title">Catalog Information</h3>
                <div className="prod-specs-row">
                  <span className="prod-specs-key">Category:</span>
                  <span className="prod-specs-val">{product.category}</span>
                </div>
                {product.subcategory && (
                  <div className="prod-specs-row">
                    <span className="prod-specs-key">Subcategory:</span>
                    <span className="prod-specs-val">{product.subcategory}</span>
                  </div>
                )}
                <div className="prod-specs-row">
                  <span className="prod-specs-key">SKU Code:</span>
                  <span className="prod-specs-val font-mono">{product.sku}</span>
                </div>
                <div className="prod-specs-row">
                  <span className="prod-specs-key">Barcode:</span>
                  <span className="prod-specs-val font-mono">{product.barcode || 'Not Assigned'}</span>
                </div>
                <div className="prod-specs-row">
                  <span className="prod-specs-key">Unit of Measure:</span>
                  <span className="prod-specs-val">{product.unit}</span>
                </div>
                {product.description && (
                  <div className="prod-specs-row" style={{ flexDirection: 'column', gap: '0.25rem' }}>
                    <span className="prod-specs-key">Description:</span>
                    <span className="prod-specs-val" style={{ fontWeight: 400, color: '#cbd5e1' }}>
                      {product.description}
                    </span>
                  </div>
                )}
              </div>

              {/* Audit Timestamps */}
              <div className="prod-specs-card">
                <h3 className="prod-specs-title">Lifecycle & Audit</h3>
                <div className="prod-specs-row">
                  <span className="prod-specs-key">Created At:</span>
                  <span className="prod-specs-val">
                    {new Date(product.createdAt).toLocaleString('en-IN')}
                  </span>
                </div>
                {product.updatedAt && (
                  <div className="prod-specs-row">
                    <span className="prod-specs-key">Last Updated:</span>
                    <span className="prod-specs-val">
                      {new Date(product.updatedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
                {product.archivedAt && (
                  <div className="prod-specs-row">
                    <span className="prod-specs-key">Archived At:</span>
                    <span className="prod-specs-val text-danger">
                      {new Date(product.archivedAt).toLocaleString('en-IN')}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <StockHistoryTimeline productId={product.id} productUnit={product.unit} />
          )}
        </div>

        <div className="prod-detail-footer">
          <button
            type="button"
            className={isArchived ? 'btn-detail-unarchive' : 'btn-detail-archive'}
            onClick={() => onToggleArchive(product)}
          >
            {isArchived ? 'Restore / Unarchive' : 'Archive Product'}
          </button>

          <div className="prod-detail-actions-right">
            {!isArchived && (
              <button
                type="button"
                className="btn-detail-adjust"
                onClick={() => onOpenAdjust(product)}
              >
                Adjust Stock
              </button>
            )}
            <button
              type="button"
              className="btn-detail-edit"
              onClick={() => onOpenEdit(product)}
            >
              <EditIcon size={14} />
              <span>Edit Details</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

