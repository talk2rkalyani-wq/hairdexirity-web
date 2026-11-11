// ==============================================================================
// Luma Salon — Product Inventory & Stock Control Workspace
// Phase 7: Complete Inventory Control, Consumables, Batches, Audits & Valuation
// ==============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import type {
  InventoryProduct,
  ProductCategory,
  ScannedProductItem,
  StockAdjustmentResult,
  ProductFilterTab,
  StockMovement,
  InventoryBatch,
  ConsumableUsage,
  StockLossRecord,
  StockAuditSession,
  InventoryKPIs,
} from '../../types/inventory.ts'
import { PRODUCT_CATEGORIES } from '../../config/inventoryConfig.ts'
import { inventoryService } from '../../services/inventoryService.ts'
import { ProductTableRow } from './components/ProductTableRow.tsx'
import { ProductCard } from './components/ProductCard.tsx'
import { CreateInventoryModal } from './components/CreateInventoryModal.tsx'
import { ProductDetailModal } from './components/ProductDetailModal.tsx'
import { StockAdjustmentModal } from './components/StockAdjustmentModal.tsx'
import { EditProductModal } from './components/EditProductModal.tsx'
import { RecordConsumableUsageModal } from './components/RecordConsumableUsageModal.tsx'
import { RecordStockLossModal } from './components/RecordStockLossModal.tsx'
import { StockAuditModal } from './components/StockAuditModal.tsx'
import { CreateInventoryBatchModal } from './components/CreateInventoryBatchModal.tsx'
import { inventoryReportExporter } from './utils/inventoryReports.ts'
import {
  PackageIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  ClipboardCheckIcon,
  AlertTriangleIcon,
  TagIcon,
  DownloadIcon,
  RefreshCwIcon,
} from '../../components/Icons.tsx'
import './ProductInventoryView.css'

export type InventorySubnavTab =
  | 'register'
  | 'movements'
  | 'batches'
  | 'consumables'
  | 'losses'
  | 'audits'
  | 'reports'

interface ProductInventoryViewProps {
  initialProducts?: InventoryProduct[]
}

export const ProductInventoryView: React.FC<ProductInventoryViewProps> = ({
  initialProducts = [],
}) => {
  const [products, setProducts] = useState<InventoryProduct[]>(initialProducts)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<'ALL' | ProductCategory>('ALL')
  const [selectedItemType, setSelectedItemType] = useState<'ALL' | 'retail' | 'consumable'>('ALL')
  const [activeTab, setActiveTab] = useState<ProductFilterTab>('ACTIVE')
  const [activeSubnav, setActiveSubnav] = useState<InventorySubnavTab>('register')

  // Additional data collections
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [batches, setBatches] = useState<InventoryBatch[]>([])
  const [consumables, setConsumables] = useState<ConsumableUsage[]>([])
  const [losses, setLosses] = useState<StockLossRecord[]>([])
  const [auditSessions, setAuditSessions] = useState<StockAuditSession[]>([])
  const [kpis, setKpis] = useState<InventoryKPIs | null>(null)

  // Modal visibility states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isConsumableModalOpen, setIsConsumableModalOpen] = useState(false)
  const [isStockLossModalOpen, setIsStockLossModalOpen] = useState(false)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [selectedProductForDetail, setSelectedProductForDetail] = useState<InventoryProduct | null>(null)
  const [selectedProductForAdjust, setSelectedProductForAdjust] = useState<InventoryProduct | null>(null)
  const [selectedProductForEdit, setSelectedProductForEdit] = useState<InventoryProduct | null>(null)

  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3500)
  }

  // Load KPI data & active subnav records
  const loadKpisAndData = useCallback(async () => {
    try {
      const k = await inventoryService.getDashboardKpis()
      setKpis(k)

      if (activeSubnav === 'movements') {
        const mv = await inventoryService.fetchStockMovementHistory()
        setMovements(mv)
      } else if (activeSubnav === 'batches') {
        const b = await inventoryService.getInventoryBatches()
        setBatches(b)
      } else if (activeSubnav === 'consumables') {
        const c = await inventoryService.getConsumableUsages()
        setConsumables(c)
      } else if (activeSubnav === 'losses') {
        const l = await inventoryService.getStockLossRecords()
        setLosses(l)
      } else if (activeSubnav === 'audits') {
        const a = await inventoryService.getStockAuditSessions()
        setAuditSessions(a)
      }
    } catch (err: any) {
      console.warn('[ProductInventoryView] Failed to load secondary inventory data:', err)
    }
  }, [activeSubnav])

  // Reload products based on active tab
  const refreshProducts = useCallback(async () => {
    setIsLoading(true)
    try {
      const fetched = await inventoryService.fetchInventoryProducts(undefined, activeTab === 'ARCHIVED')
      setProducts(fetched)
      await loadKpisAndData()
    } catch (err: any) {
      console.warn('[ProductInventoryView] Failed to load inventory:', err)
      showToast(`⚠️ ${err.message || 'Failed to load inventory'}`)
    } finally {
      setIsLoading(false)
    }
  }, [activeTab, loadKpisAndData])

  useEffect(() => {
    let isMounted = true
    const load = async () => {
      setIsLoading(true)
      try {
        const fetched = await inventoryService.fetchInventoryProducts(undefined, activeTab === 'ARCHIVED')
        if (isMounted) {
          setProducts(fetched)
          await loadKpisAndData()
        }
      } catch (err: any) {
        if (isMounted) console.warn('[ProductInventoryView] Failed to load inventory:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    load()

    const unsubscribe = inventoryService.subscribe((updated) => {
      if (isMounted) {
        setProducts(activeTab === 'ARCHIVED' ? updated : updated.filter((p) => p.status !== 'archived'))
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [activeTab, activeSubnav, loadKpisAndData])

  const handleOpenCreateModal = () => setIsCreateModalOpen(true)
  const handleCloseCreateModal = () => setIsCreateModalOpen(false)

  const handleProductCreated = async (newProduct: InventoryProduct) => {
    try {
      const created = await inventoryService.createProduct({
        name: newProduct.name,
        brand: newProduct.brand,
        category: newProduct.category,
        subcategory: newProduct.subcategory,
        description: newProduct.description,
        unit: newProduct.unit,
        barcode: newProduct.barcode,
        sku: newProduct.sku,
        purchasePrice: newProduct.purchasePrice,
        sellingPrice: newProduct.sellingPrice,
        openingStock: newProduct.currentStock,
        minStockThreshold: newProduct.minStockThreshold,
        itemType: newProduct.itemType || 'retail',
        reorderLevel: newProduct.reorderLevel || newProduct.minStockThreshold || 5,
        maxStockThreshold: newProduct.maxStockThreshold || 50,
      })
      setProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      await refreshProducts()
      showToast(`✨ Product "${created.name}" created and opening stock registered!`)
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
      throw err
    }
  }

  const handleBatchCreated = async (items: ScannedProductItem[], idempotencyKey?: string) => {
    try {
      const result = await inventoryService.commitScannedBatch(items, idempotencyKey)
      await refreshProducts()
      showToast(
        `⚡ Added ${result.committedCount} items (${result.totalUnits} total units) to inventory intake batch!`
      )
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
      throw err
    }
  }

  const handleSelectProduct = (product: InventoryProduct) => setSelectedProductForDetail(product)
  const handleOpenAdjust = (product: InventoryProduct) => setSelectedProductForAdjust(product)
  const handleOpenEdit = (product: InventoryProduct) => setSelectedProductForEdit(product)

  const handleAdjustSuccess = async (result: StockAdjustmentResult) => {
    await refreshProducts()
    if (selectedProductForDetail && selectedProductForDetail.id === result.productId) {
      const refreshed = await inventoryService.fetchProductById(result.productId)
      if (refreshed) setSelectedProductForDetail(refreshed)
    }
    showToast(`✅ Stock adjusted: ${result.productName} is now ${result.newStock} units.`)
  }

  const handleEditSuccess = async (updated: InventoryProduct) => {
    await refreshProducts()
    if (selectedProductForDetail && selectedProductForDetail.id === updated.id) {
      setSelectedProductForDetail(updated)
    }
    showToast(`✨ Product "${updated.name}" updated successfully!`)
  }

  const handleToggleArchive = async (product: InventoryProduct) => {
    try {
      if (product.status === 'archived') {
        const unarchived = await inventoryService.unarchiveProduct(product.id)
        await refreshProducts()
        setSelectedProductForDetail(null)
        showToast(`🔄 Product "${unarchived.name}" unarchived and restored to active catalog.`)
      } else {
        const archived = await inventoryService.archiveProduct(product.id)
        await refreshProducts()
        setSelectedProductForDetail(null)
        showToast(`📦 Product "${archived.name}" archived. It is now hidden from active inventory.`)
      }
    } catch (err: any) {
      showToast(`❌ Error: ${err.message}`)
    }
  }

  const handleClearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('ALL')
    setSelectedItemType('ALL')
  }

  const isFilteringActive =
    searchQuery.trim() !== '' || selectedCategory !== 'ALL' || selectedItemType !== 'ALL'

  // Filter products by category, itemType, query, tab
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (activeTab === 'ACTIVE' && product.status === 'archived') return false
      if (activeTab === 'ARCHIVED' && product.status !== 'archived') return false

      if (selectedItemType !== 'ALL') {
        const pType = product.itemType || 'retail'
        if (pType !== selectedItemType) return false
      }

      if (selectedCategory !== 'ALL' && product.category !== selectedCategory) return false

      const query = searchQuery.trim().toLowerCase()
      if (query) {
        const nameMatch = product.name.toLowerCase().includes(query)
        const brandMatch = product.brand.toLowerCase().includes(query)
        const skuMatch = product.sku.toLowerCase().includes(query)
        const barcodeMatch = product.barcode ? product.barcode.toLowerCase().includes(query) : false
        return nameMatch || brandMatch || skuMatch || barcodeMatch
      }

      return true
    })
  }, [products, searchQuery, selectedCategory, selectedItemType, activeTab])

  const totalCount = products.length
  const filteredCount = filteredProducts.length

  // Quick fallback KPI sums
  const retailCount = products.filter((p) => p.itemType !== 'consumable').length
  const consumableCount = products.filter((p) => p.itemType === 'consumable').length
  const totalUnits = products.reduce((acc, p) => acc + (p.currentStock || 0), 0)
  const totalValuation = products.reduce(
    (acc, p) => acc + (p.currentStock || 0) * (p.weightedAverageCost || p.purchasePrice || 0),
    0
  )
  const lowStockCount = products.filter((p) => p.currentStock <= (p.reorderLevel || p.minStockThreshold || 0)).length
  const outOfStockCount = products.filter((p) => p.currentStock <= 0).length

  return (
    <div className="inventory-workspace">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="inventory-toast" role="status" aria-live="polite">
          <span className="toast-dot" aria-hidden="true" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <header className="inventory-header-section">
        <div className="inventory-header-info">
          <div className="inventory-title-row">
            <h1 className="inventory-main-title">Inventory & Stock Control</h1>
            <span className="inventory-count-badge">
              {products.length} SKUs ({retailCount} Retail / {consumableCount} Consumables)
            </span>
          </div>
          <p className="inventory-subtitle">
            Comprehensive stock control, FEFO batch expiry, salon consumable usage tracking, physical audits, and WAC valuation.
          </p>
        </div>

        {/* Global Quick Action Buttons */}
        <div className="inventory-actions-row">
          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => setIsConsumableModalOpen(true)}
          >
            <PackageIcon size={16} />
            <span>Record Consumables</span>
          </button>

          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => setIsStockLossModalOpen(true)}
          >
            <AlertTriangleIcon size={16} />
            <span>Report Loss / Waste</span>
          </button>

          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => setIsAuditModalOpen(true)}
          >
            <ClipboardCheckIcon size={16} />
            <span>Physical Audit</span>
          </button>

          <button
            type="button"
            className="btn-secondary-action"
            onClick={() => setIsBatchModalOpen(true)}
          >
            <TagIcon size={16} />
            <span>Add Batch</span>
          </button>

          <button
            type="button"
            className="btn-create-inventory"
            onClick={handleOpenCreateModal}
            aria-label="Create Inventory Item"
          >
            <PlusIcon size={18} />
            <span>+ Create Item</span>
          </button>
        </div>
      </header>

      {/* KPI Overview Strip */}
      <section className="inventory-kpi-grid">
        <div className="inventory-kpi-card gold">
          <span className="kpi-label">Stock Valuation (WAC)</span>
          <span className="kpi-value">
            ₹{(kpis?.totalValuation || totalValuation).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          </span>
          <span className="kpi-subtext">Total capital tied in physical inventory</span>
        </div>

        <div className="inventory-kpi-card">
          <span className="kpi-label">Units in Stock</span>
          <span className="kpi-value">{kpis?.totalUnits ?? totalUnits}</span>
          <span className="kpi-subtext">Across {products.length} active SKUs</span>
        </div>

        <div className="inventory-kpi-card">
          <span className="kpi-label">Retail vs Consumables</span>
          <span className="kpi-value">
            {kpis?.retailSkus ?? retailCount} / {kpis?.consumableSkus ?? consumableCount}
          </span>
          <span className="kpi-subtext">Client sale vs backbar salon use</span>
        </div>

        <div className={`inventory-kpi-card ${lowStockCount > 0 ? 'warning' : 'success'}`}>
          <span className="kpi-label">Low Stock Alerts</span>
          <span className="kpi-value">{kpis?.lowStockCount ?? lowStockCount}</span>
          <span className="kpi-subtext">At or below threshold ({outOfStockCount} out of stock)</span>
        </div>

        <div className={`inventory-kpi-card ${(kpis?.expiredBatchesCount || 0) > 0 ? 'danger' : 'success'}`}>
          <span className="kpi-label">Batch Expiry Watch</span>
          <span className="kpi-value">
            {kpis?.nearExpiryBatchesCount || 0} Near / {kpis?.expiredBatchesCount || 0} Exp
          </span>
          <span className="kpi-subtext">Tracked under FEFO protocol</span>
        </div>
      </section>

      {/* Subnav Navigation Tabs */}
      <nav className="inventory-subnav-tabs" aria-label="Inventory Workspaces">
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'register' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('register')}
        >
          Live Stock Register
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'movements' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('movements')}
        >
          Movement Ledger
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'batches' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('batches')}
        >
          Batches & Expiry
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'consumables' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('consumables')}
        >
          Consumables Log
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'losses' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('losses')}
        >
          Loss & Waste Log
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'audits' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('audits')}
        >
          Physical Audits
        </button>
        <button
          type="button"
          className={`inventory-subnav-btn ${activeSubnav === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveSubnav('reports')}
        >
          Reports & Valuation
        </button>
      </nav>

      {/* TAB CONTENT: 1. Live Stock Register */}
      {activeSubnav === 'register' && (
        <>
          {/* View Mode Tabs (Active vs Archived) + Item Classification Selector */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                style={{
                  background: activeTab === 'ACTIVE' ? 'rgba(197, 160, 89, 0.15)' : 'transparent',
                  border: activeTab === 'ACTIVE' ? '1px solid #c5a059' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'ACTIVE' ? '#c5a059' : '#94a3b8',
                  borderRadius: '8px',
                  padding: '0.45rem 0.9rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTab('ACTIVE')}
              >
                Active Inventory ({products.filter((p) => p.status !== 'archived').length})
              </button>
              <button
                type="button"
                style={{
                  background: activeTab === 'ARCHIVED' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  border: activeTab === 'ARCHIVED' ? '1px solid #f87171' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'ARCHIVED' ? '#f87171' : '#94a3b8',
                  borderRadius: '8px',
                  padding: '0.45rem 0.9rem',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTab('ARCHIVED')}
              >
                Archived ({products.filter((p) => p.status === 'archived').length})
              </button>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>Filter Type:</span>
              <button
                type="button"
                style={{
                  background: selectedItemType === 'ALL' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: selectedItemType === 'ALL' ? '#ffffff' : '#94a3b8',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedItemType('ALL')}
              >
                All
              </button>
              <button
                type="button"
                style={{
                  background: selectedItemType === 'retail' ? 'rgba(197, 160, 89, 0.2)' : 'transparent',
                  border: '1px solid rgba(197, 160, 89, 0.4)',
                  color: selectedItemType === 'retail' ? '#c5a059' : '#94a3b8',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedItemType('retail')}
              >
                🛍️ Retail
              </button>
              <button
                type="button"
                style={{
                  background: selectedItemType === 'consumable' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  color: selectedItemType === 'consumable' ? '#60a5fa' : '#94a3b8',
                  borderRadius: '6px',
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedItemType('consumable')}
              >
                🧪 Consumable
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <section className="inventory-toolbar" aria-label="Inventory Filters">
            <div className="inventory-search-row">
              <div className="inventory-search-box">
                <SearchIcon size={17} className="inventory-search-icon" />
                <input
                  type="text"
                  className="inventory-search-input"
                  placeholder="Search by product name, brand, barcode, or SKU code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search product inventory"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="btn-clear-search"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search input"
                  >
                    <CloseIcon size={16} />
                  </button>
                )}
              </div>

              {isFilteringActive && (
                <button
                  type="button"
                  className="btn-clear-all-filters"
                  onClick={handleClearFilters}
                  aria-label="Reset all search and category filters"
                >
                  <CloseIcon size={14} />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>

            {/* Categories Scroll List */}
            <div className="inventory-categories-row" role="tablist" aria-label="Category Filters">
              <button
                type="button"
                className={`inventory-category-chip ${selectedCategory === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
                role="tab"
                aria-selected={selectedCategory === 'ALL'}
              >
                All Categories ({totalCount})
              </button>

              {PRODUCT_CATEGORIES.map((cat) => {
                const countForCat = products.filter((p) => p.category === cat).length
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`inventory-category-chip ${selectedCategory === cat ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(cat)}
                    role="tab"
                    aria-selected={selectedCategory === cat}
                  >
                    {cat} {totalCount > 0 ? `(${countForCat})` : ''}
                  </button>
                )
              })}
            </div>

            {/* Active Filter Indicator */}
            {isFilteringActive && (
              <div className="inventory-active-filters-bar" role="status">
                <span>
                  Showing {filteredCount} of {totalCount} items
                  {selectedCategory !== 'ALL' && ` in "${selectedCategory}"`}
                  {selectedItemType !== 'ALL' && ` (${selectedItemType.toUpperCase()})`}
                  {searchQuery.trim() && ` matching "${searchQuery.trim()}"`}
                </span>
                <button
                  type="button"
                  className="btn-clear-search"
                  onClick={handleClearFilters}
                  title="Clear all active filters"
                >
                  <CloseIcon size={14} />
                </button>
              </div>
            )}
          </section>

          {/* Main Listing */}
          <main className="inventory-listing-area">
            {isLoading && totalCount === 0 ? (
              <div className="inventory-empty-state" role="status">
                <p className="inventory-empty-desc">Loading salon inventory...</p>
              </div>
            ) : totalCount === 0 ? (
              <div className="inventory-empty-state" role="region" aria-label="Empty Inventory">
                <div className="inventory-empty-icon-wrap" aria-hidden="true">
                  <PackageIcon size={38} />
                </div>
                <h2 className="inventory-empty-title">
                  {activeTab === 'ARCHIVED' ? 'No Archived Products' : 'No Products in Inventory'}
                </h2>
                <p className="inventory-empty-desc">
                  Your salon inventory is currently empty. Get started by adding your retail hair products, treatments, or backbar salon supplies.
                </p>
                {activeTab === 'ACTIVE' && (
                  <div className="empty-state-actions">
                    <button
                      type="button"
                      className="btn-empty-create"
                      onClick={handleOpenCreateModal}
                    >
                      <PlusIcon size={18} />
                      <span>Create Inventory</span>
                    </button>
                  </div>
                )}
              </div>
            ) : filteredCount === 0 ? (
              <div className="inventory-empty-state" role="region" aria-label="No Filter Results">
                <div className="inventory-empty-icon-wrap" aria-hidden="true">
                  <SearchIcon size={36} />
                </div>
                <h2 className="inventory-empty-title">No Matching Items</h2>
                <p className="inventory-empty-desc">
                  No inventory items matched your active search and category filters.
                </p>
                <div className="empty-state-actions">
                  <button
                    type="button"
                    className="btn-empty-reset"
                    onClick={handleClearFilters}
                  >
                    <CloseIcon size={16} />
                    <span>Clear All Filters</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="inventory-table-container">
                  <table className="inventory-table" aria-label="Products Table">
                    <thead>
                      <tr>
                        <th scope="col">Product & Type</th>
                        <th scope="col">Category</th>
                        <th scope="col">SKU</th>
                        <th scope="col">Stock</th>
                        <th scope="col">Unit Cost (WAC)</th>
                        <th scope="col">Selling Price</th>
                        <th scope="col">Status</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.map((product) => (
                        <ProductTableRow
                          key={product.id}
                          product={product}
                          onSelect={handleSelectProduct}
                          onOpenAdjust={handleOpenAdjust}
                          onOpenEdit={handleOpenEdit}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="inventory-cards-container" aria-label="Products Cards List">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onSelect={handleSelectProduct}
                      onOpenAdjust={handleOpenAdjust}
                      onOpenEdit={handleOpenEdit}
                    />
                  ))}
                </div>
              </>
            )}
          </main>
        </>
      )}

      {/* TAB CONTENT: 2. Stock Movement Ledger */}
      {activeSubnav === 'movements' && (
        <section className="inventory-table-container" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>Stock Movement Audit Ledger</h3>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={() => inventoryReportExporter.exportStockMovements(movements)}
            >
              <DownloadIcon size={16} />
              <span>Export Movements CSV</span>
            </button>
          </div>
          {movements.length === 0 ? (
            <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
              No stock movements recorded yet.
            </p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Movement Type</th>
                  <th>Item / Product</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th style={{ textAlign: 'right' }}>Balance After</th>
                  <th>Source / Document</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(m.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: m.movementType.includes('OUT') || m.movementType === 'SALE_DEDUCTION' || m.movementType === 'CONSUMABLE_USAGE' || m.movementType === 'DAMAGE' || m.movementType === 'EXPIRY'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : 'rgba(34, 197, 94, 0.15)',
                          color: m.movementType.includes('OUT') || m.movementType === 'SALE_DEDUCTION' || m.movementType === 'CONSUMABLE_USAGE' || m.movementType === 'DAMAGE' || m.movementType === 'EXPIRY'
                            ? '#f87171'
                            : '#4ade80',
                        }}
                      >
                        {m.movementType}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{m.productName || m.productId}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{m.sku || ''}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {m.quantityIn ? `+${m.quantityIn}` : m.quantityOut ? `-${m.quantityOut}` : m.quantity}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#c5a059' }}>
                      {m.newStock}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                      {m.sourceDocument || m.referenceId || '-'}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{m.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB CONTENT: 3. Batches & Expiry */}
      {activeSubnav === 'batches' && (
        <section className="inventory-table-container" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>Tracked Batches & Expiry (FEFO)</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => inventoryReportExporter.exportBatchExpiryReport(batches)}
              >
                <DownloadIcon size={16} />
                <span>Export Batches CSV</span>
              </button>
              <button
                type="button"
                className="btn-create-inventory"
                onClick={() => setIsBatchModalOpen(true)}
              >
                <PlusIcon size={16} />
                <span>+ Register Batch</span>
              </button>
            </div>
          </div>
          {batches.length === 0 ? (
            <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
              No inventory batches registered yet.
            </p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Batch Number</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Current Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit Cost</th>
                  <th>Expiry Date</th>
                  <th>Shelf-Life Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const now = new Date().getTime()
                  const exp = new Date(b.expiryDate).getTime()
                  const days = Math.round((exp - now) / (1000 * 60 * 60 * 24))
                  return (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 700, color: '#f8fafc' }}>{b.batchNumber}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{b.productName || b.productId}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{b.currentQuantity}</td>
                      <td style={{ textAlign: 'right' }}>₹{b.unitCost.toFixed(2)}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{b.expiryDate}</div>
                        <div style={{ fontSize: '0.75rem', color: days < 0 ? '#f87171' : days <= 30 ? '#fbbf24' : '#94a3b8' }}>
                          {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days} days remaining`}
                        </div>
                      </td>
                      <td>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: b.status === 'expired'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : b.status === 'near_expiry'
                              ? 'rgba(245, 158, 11, 0.2)'
                              : b.status === 'quarantined'
                              ? 'rgba(168, 85, 247, 0.2)'
                              : 'rgba(34, 197, 94, 0.2)',
                            color: b.status === 'expired'
                              ? '#f87171'
                              : b.status === 'near_expiry'
                              ? '#fbbf24'
                              : b.status === 'quarantined'
                              ? '#c084fc'
                              : '#4ade80',
                          }}
                        >
                          {b.status.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {b.status !== 'quarantined' && (
                          <button
                            type="button"
                            style={{
                              background: 'transparent',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#94a3b8',
                              borderRadius: '4px',
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                            onClick={async () => {
                              await inventoryService.updateBatchStatus(b.id, 'quarantined', 'Quarantined by staff inspection')
                              await loadKpisAndData()
                            }}
                          >
                            Quarantine
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB CONTENT: 4. Consumables Log */}
      {activeSubnav === 'consumables' && (
        <section className="inventory-table-container" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>Salon Consumable Usage Log</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => inventoryReportExporter.exportConsumableUsage(consumables)}
              >
                <DownloadIcon size={16} />
                <span>Export Usages CSV</span>
              </button>
              <button
                type="button"
                className="btn-create-inventory"
                onClick={() => setIsConsumableModalOpen(true)}
              >
                <PlusIcon size={16} />
                <span>+ Record Usage</span>
              </button>
            </div>
          </div>
          {consumables.length === 0 ? (
            <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
              No consumable usages recorded yet.
            </p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Usage #</th>
                  <th>Date</th>
                  <th>Consumable Item</th>
                  <th style={{ textAlign: 'right' }}>Qty Used</th>
                  <th>Service / Purpose</th>
                  <th style={{ textAlign: 'right' }}>Cost Impact</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {consumables.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 700, color: '#c5a059' }}>{u.usageNumber}</td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.productName || u.productId}</div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {u.quantity} {u.unit}
                    </td>
                    <td style={{ color: '#e2e8f0' }}>{u.reason}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                      ₹{(u.totalCost || 0).toFixed(2)}
                    </td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{u.recordedBy || 'Staff'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB CONTENT: 5. Loss & Waste Log */}
      {activeSubnav === 'losses' && (
        <section className="inventory-table-container" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>Stock Loss & Wastage Log</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => inventoryReportExporter.exportStockLossSummary(losses)}
              >
                <DownloadIcon size={16} />
                <span>Export Losses CSV</span>
              </button>
              <button
                type="button"
                className="btn-create-inventory"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#ffffff' }}
                onClick={() => setIsStockLossModalOpen(true)}
              >
                <AlertTriangleIcon size={16} />
                <span>Report Stock Loss</span>
              </button>
            </div>
          </div>
          {losses.length === 0 ? (
            <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
              No stock losses or wastages recorded yet.
            </p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Loss #</th>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Loss Type</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Total Loss</th>
                  <th>Reason</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {losses.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 700, color: '#f87171' }}>{l.lossNumber}</td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(l.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ fontWeight: 600 }}>{l.productName || l.productId}</td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.15)',
                          color: '#f87171',
                        }}
                      >
                        {l.lossType}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{l.quantity}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#f87171' }}>
                      ₹{l.totalCost.toFixed(2)}
                    </td>
                    <td style={{ color: '#cbd5e1' }}>{l.reason}</td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{l.recordedBy || 'Staff'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB CONTENT: 6. Stock Audits */}
      {activeSubnav === 'audits' && (
        <section className="inventory-table-container" style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ffffff' }}>Physical Stock Audit Sessions</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary-action"
                onClick={() => inventoryReportExporter.exportStockAuditHistory(auditSessions)}
              >
                <DownloadIcon size={16} />
                <span>Export Audits CSV</span>
              </button>
              <button
                type="button"
                className="btn-create-inventory"
                onClick={() => setIsAuditModalOpen(true)}
              >
                <ClipboardCheckIcon size={16} />
                <span>+ Start Audit Session</span>
              </button>
            </div>
          </div>
          {auditSessions.length === 0 ? (
            <p style={{ color: '#94a3b8', padding: '2rem', textAlign: 'center' }}>
              No physical audit sessions found. Click &quot;Start Audit Session&quot; to begin.
            </p>
          ) : (
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Audit #</th>
                  <th>Date</th>
                  <th>Title / Scope</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Items Counted</th>
                  <th style={{ textAlign: 'right' }}>Discrepancies</th>
                  <th style={{ textAlign: 'right' }}>Net Variance Value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {auditSessions.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 700, color: '#c5a059' }}>{s.auditNumber}</td>
                    <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      {new Date(s.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{s.title}</div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        {s.categoryFilter || s.itemTypeFilter || 'Entire Inventory'}
                      </div>
                    </td>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: s.status === 'reconciled'
                            ? 'rgba(34, 197, 94, 0.2)'
                            : 'rgba(245, 158, 11, 0.2)',
                          color: s.status === 'reconciled' ? '#4ade80' : '#fbbf24',
                        }}
                      >
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.totalItemsCounted}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: s.totalDiscrepancies > 0 ? '#fbbf24' : '#4ade80' }}>
                      {s.totalDiscrepancies}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: s.netVarianceValue < 0 ? '#f87171' : s.netVarianceValue > 0 ? '#4ade80' : '#cbd5e1' }}>
                      ₹{s.netVarianceValue.toFixed(2)}
                    </td>
                    <td>
                      <button
                        type="button"
                        style={{
                          background: 'rgba(197, 160, 89, 0.15)',
                          border: '1px solid rgba(197, 160, 89, 0.3)',
                          color: '#c5a059',
                          borderRadius: '4px',
                          padding: '0.3rem 0.6rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        onClick={() => setIsAuditModalOpen(true)}
                      >
                        {s.status === 'reconciled' ? 'View Details' : 'Continue Count'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {/* TAB CONTENT: 7. Reports & Valuation */}
      {activeSubnav === 'reports' && (
        <section style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#ffffff' }}>Inventory Intelligence & Valuation Reports</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                Generate real-time exports for audit compliance, supplier negotiations, and fiscal reporting.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary-action"
              onClick={refreshProducts}
            >
              <RefreshCwIcon size={16} />
              <span>Refresh Metrics</span>
            </button>
          </div>

          <div className="inventory-reports-grid">
            <div className="inventory-report-card">
              <div>
                <h4>1. Stock Summary Report</h4>
                <p>Complete product catalog with stock on hand, reserved stock, valuation, and pricing.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportStockSummary(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>2. Low Stock & Reorder Report</h4>
                <p>Identifies items below min threshold with suggested order quantities and supplier info.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportLowStockReorder(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>3. Stock Movement Audit Log</h4>
                <p>Detailed chronological audit trail of all receipts, sales, service usages, and adjustments.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportStockMovements(movements)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>4. Consumable Usage by Service</h4>
                <p>Tracks salon supplies consumed during client appointments and daily salon operations.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportConsumableUsage(consumables)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>5. Inventory Valuation (WAC)</h4>
                <p>Asset valuation broken down by category using the Weighted Average Cost methodology.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportValuationReport(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>6. Batch Expiry & Shelf-Life</h4>
                <p>Batch tracking with remaining days to expiration, storage locations, and quarantine status.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportBatchExpiryReport(batches)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>7. Stock Loss & Wastage Summary</h4>
                <p>Write-off log covering damaged goods, past-expiry disposal, and salon operational spillage.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportStockLossSummary(losses)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>8. Dead Stock Analysis</h4>
                <p>Highlights non-moving inventory tying up working capital and shelf storage space.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportDeadStockAnalysis(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>9. Stock Discrepancy & Audits</h4>
                <p>Historical variance analysis between physical stock counts and theoretical system levels.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportStockAuditHistory(auditSessions)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>10. GRN vs PO Variance</h4>
                <p>Comparison of received goods quantities against original purchase order requests.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportGrnPoVariance(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>11. Purchase Return Stock Impact</h4>
                <p>Inventory reductions resulting from supplier returns, damaged deliveries, and credit notes.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportPurchaseReturnImpact(movements)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>

            <div className="inventory-report-card">
              <div>
                <h4>12. Retail vs Consumable Ratio</h4>
                <p>Capital distribution and turnover velocity between retail merchandise and salon consumables.</p>
              </div>
              <button
                type="button"
                className="btn-csv-download"
                onClick={() => inventoryReportExporter.exportRetailVsConsumableRatio(products)}
              >
                <DownloadIcon size={14} /> Export CSV
              </button>
            </div>
          </div>
        </section>
      )}

      {/* MODALS */}
      {/* 1. Create Inventory Modal */}
      <CreateInventoryModal
        isOpen={isCreateModalOpen}
        existingProducts={products}
        onClose={handleCloseCreateModal}
        onProductCreated={handleProductCreated}
        onBatchCreated={handleBatchCreated}
      />

      {/* 2. Record Consumable Usage Modal */}
      <RecordConsumableUsageModal
        isOpen={isConsumableModalOpen}
        onClose={() => setIsConsumableModalOpen(false)}
        onSuccess={async () => {
          await refreshProducts()
          showToast('✅ Consumable usage recorded and stock deducted successfully.')
        }}
      />

      {/* 3. Record Stock Loss Modal */}
      <RecordStockLossModal
        isOpen={isStockLossModalOpen}
        onClose={() => setIsStockLossModalOpen(false)}
        onSuccess={async () => {
          await refreshProducts()
          showToast('⚠️ Stock loss / wastage recorded.')
        }}
      />

      {/* 4. Physical Stock Audit Modal */}
      <StockAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onSuccess={async () => {
          await refreshProducts()
          showToast('📋 Physical stock audit updated.')
        }}
      />

      {/* 5. Create Inventory Batch Modal */}
      <CreateInventoryBatchModal
        isOpen={isBatchModalOpen}
        onClose={() => setIsBatchModalOpen(false)}
        onSuccess={async () => {
          await refreshProducts()
          showToast('🏷️ New inventory batch registered successfully.')
        }}
      />

      {/* 6. Product Detail & Stock History Drawer */}
      <ProductDetailModal
        isOpen={Boolean(selectedProductForDetail)}
        product={selectedProductForDetail}
        onClose={() => setSelectedProductForDetail(null)}
        onOpenEdit={(prod) => {
          setSelectedProductForDetail(null)
          setSelectedProductForEdit(prod)
        }}
        onOpenAdjust={(prod) => {
          setSelectedProductForDetail(null)
          setSelectedProductForAdjust(prod)
        }}
        onToggleArchive={handleToggleArchive}
      />

      {/* 7. Stock Adjustment Modal */}
      <StockAdjustmentModal
        isOpen={Boolean(selectedProductForAdjust)}
        product={selectedProductForAdjust}
        onClose={() => setSelectedProductForAdjust(null)}
        onSuccess={handleAdjustSuccess}
      />

      {/* 8. Edit Product Modal */}
      <EditProductModal
        isOpen={Boolean(selectedProductForEdit)}
        product={selectedProductForEdit}
        existingProducts={products}
        onClose={() => setSelectedProductForEdit(null)}
        onSuccess={handleEditSuccess}
      />
    </div>
  )
}
