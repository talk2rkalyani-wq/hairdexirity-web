import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { Service } from '../../../types/models.ts'
import type { InventoryProduct } from '../../../types/inventory.ts'
import type { InvoiceLineItem } from '../../../types/finance.ts'
import { serviceService } from '../../../services/serviceService.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import {
  ScissorsIcon,
  PackageIcon,
  SearchIcon,
  BarcodeIcon,
  PlusIcon,
  ClockIcon,
  CheckIcon,
} from '../../../components/Icons.tsx'
import './PosItemSelector.css'

interface PosItemSelectorProps {
  onAddService: (service: Service) => void
  onAddProduct: (product: InventoryProduct) => void
  cartItems: InvoiceLineItem[]
}

type TabType = 'services' | 'products'

export const PosItemSelector: React.FC<PosItemSelectorProps> = ({
  onAddService,
  onAddProduct,
  cartItems,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('services')
  const [services, setServices] = useState<Service[]>([])
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [barcodeInput, setBarcodeInput] = useState('')
  const [barcodeMessage, setBarcodeMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [selectedServiceCategory, setSelectedServiceCategory] = useState<string>('ALL')
  const [selectedProductCategory, setSelectedProductCategory] = useState<string>('ALL')
  const [isLoading, setIsLoading] = useState(true)
  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Load catalog data
  useEffect(() => {
    let mounted = true
    setIsLoading(true)

    Promise.all([
      serviceService.getServices(),
      inventoryService.fetchInventoryProducts(),
    ])
      .then(([srvList, prodList]) => {
        if (!mounted) return
        setServices(srvList.filter((s) => s.active))
        // Only active/low_stock/out_of_stock products (exclude archived)
        setProducts(prodList.filter((p) => p.status !== 'archived'))
      })
      .catch((err) => {
        console.error('Failed to load items catalog for POS:', err)
      })
      .finally(() => {
        if (mounted) setIsLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  // Cart counts map for quick lookup
  const cartCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const item of cartItems) {
      const key = item.itemType === 'service' ? `srv-${item.serviceId}` : `prod-${item.productId}`
      map.set(key, (map.get(key) || 0) + item.quantity)
    }
    return map
  }, [cartItems])

  // Filtered Services
  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return services.filter((s) => {
      const matchesCategory =
        selectedServiceCategory === 'ALL' || s.category === selectedServiceCategory
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q)
      return matchesCategory && matchesQuery
    })
  }, [services, selectedServiceCategory, searchQuery])

  // Filtered Products
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return products.filter((p) => {
      const matchesCategory =
        selectedProductCategory === 'ALL' || p.category === selectedProductCategory
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      return matchesCategory && matchesQuery
    })
  }, [products, selectedProductCategory, searchQuery])

  // Handle Barcode Scan Submit
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = barcodeInput.trim()
    if (!code) return

    const found = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === code.toLowerCase()) ||
        p.sku.toLowerCase() === code.toLowerCase()
    )

    if (found) {
      const currentInCart = cartCounts.get(`prod-${found.id}`) || 0
      if (found.currentStock <= currentInCart) {
        setBarcodeMessage({
          text: `"${found.name}" reached max available stock (${found.currentStock}).`,
          isError: true,
        })
      } else {
        onAddProduct(found)
        setBarcodeMessage({
          text: `Added: ${found.name}`,
          isError: false,
        })
      }
      setBarcodeInput('')
    } else {
      setBarcodeMessage({
        text: `No product found with barcode/SKU: ${code}`,
        isError: true,
      })
    }

    setTimeout(() => {
      setBarcodeMessage(null)
    }, 3000)
  }

  // Available Categories
  const serviceCategories = ['ALL', 'haircut', 'color', 'styling', 'treatment', 'extensions'] as const
  const productCategories = [
    'ALL',
    'Hair Care',
    'Hair Styling',
    'Hair Treatment',
    'Nail Products',
    'Makeup Products',
    'Other Salon Products',
  ]

  return (
    <div className="pos-item-selector-container">
      {/* Tab Switcher */}
      <div className="pos-selector-tabs">
        <button
          type="button"
          className={`pos-tab-btn ${activeTab === 'services' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('services')
            setSearchQuery('')
          }}
        >
          <ScissorsIcon size={18} />
          <span>Services</span>
          <span className="tab-badge">{services.length}</span>
        </button>
        <button
          type="button"
          className={`pos-tab-btn ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => {
            setActiveTab('products')
            setSearchQuery('')
          }}
        >
          <PackageIcon size={18} />
          <span>Retail Products</span>
          <span className="tab-badge">{products.length}</span>
        </button>
      </div>

      {/* Search Bar & Barcode Scanner */}
      <div className="pos-search-section">
        <div className="pos-search-input-wrap">
          <SearchIcon size={16} className="search-icon" />
          <input
            type="text"
            className="pos-search-input"
            placeholder={
              activeTab === 'services'
                ? 'Search services by name or category...'
                : 'Search products by name, brand, SKU or barcode...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="pos-clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>

        {/* Barcode scanner input (products tab) */}
        {activeTab === 'products' && (
          <form onSubmit={handleBarcodeSubmit} className="pos-barcode-form">
            <div className="barcode-input-wrapper">
              <BarcodeIcon size={16} className="barcode-icon" />
              <input
                ref={barcodeInputRef}
                type="text"
                className="pos-barcode-input"
                placeholder="Scan barcode / enter SKU & press Enter"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
            </div>
            {barcodeMessage && (
              <div className={`barcode-feedback-chip ${barcodeMessage.isError ? 'error' : 'success'}`}>
                {barcodeMessage.text}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Category Filter Pills */}
      <div className="pos-category-pills-bar">
        {activeTab === 'services'
          ? serviceCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`category-pill ${selectedServiceCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedServiceCategory(cat)}
              >
                {cat === 'ALL' ? 'All Services' : cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))
          : productCategories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`category-pill ${selectedProductCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedProductCategory(cat)}
              >
                {cat === 'ALL' ? 'All Categories' : cat}
              </button>
            ))}
      </div>

      {/* Items Grid / List */}
      <div className="pos-items-scroll-area">
        {isLoading ? (
          <div className="pos-loading-state">
            <div className="pos-spinner" />
            <p>Loading salon catalog...</p>
          </div>
        ) : activeTab === 'services' ? (
          filteredServices.length === 0 ? (
            <div className="pos-empty-catalog">
              <ScissorsIcon size={32} />
              <p>No services match your search or filter.</p>
            </div>
          ) : (
            <div className="pos-catalog-grid">
              {filteredServices.map((service) => {
                const countInCart = cartCounts.get(`srv-${service.id}`) || 0
                return (
                  <div key={service.id} className="pos-catalog-card service-card">
                    <div className="card-top">
                      <div className="item-title-row">
                        <span className="item-category-tag">{service.category}</span>
                        {countInCart > 0 && (
                          <span className="in-cart-indicator">
                            <CheckIcon size={12} /> {countInCart} in bill
                          </span>
                        )}
                      </div>
                      <h4 className="item-title">{service.name}</h4>
                      {service.description && (
                        <p className="item-desc">{service.description}</p>
                      )}
                    </div>
                    <div className="card-bottom">
                      <div className="item-meta">
                        <span className="item-price">₹{service.price.toFixed(2)}</span>
                        <span className="item-duration">
                          <ClockIcon size={12} /> {service.duration} min
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-add-item"
                        onClick={() => onAddService(service)}
                        title="Add service to bill"
                      >
                        <PlusIcon size={14} />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        ) : filteredProducts.length === 0 ? (
          <div className="pos-empty-catalog">
            <PackageIcon size={32} />
            <p>No retail products match your search or filter.</p>
          </div>
        ) : (
          <div className="pos-catalog-grid">
            {filteredProducts.map((product) => {
              const countInCart = cartCounts.get(`prod-${product.id}`) || 0
              const isOutOfStock = product.currentStock <= 0
              const isStockDepleted = product.currentStock <= countInCart
              return (
                <div
                  key={product.id}
                  className={`pos-catalog-card product-card ${isOutOfStock ? 'out-of-stock' : ''}`}
                >
                  <div className="card-top">
                    <div className="item-title-row">
                      <span className="item-brand-tag">{product.brand}</span>
                      <span
                        className={`item-stock-tag ${
                          isOutOfStock ? 'danger' : product.currentStock <= product.minStockThreshold ? 'warn' : 'ok'
                        }`}
                      >
                        {isOutOfStock ? 'Out of stock' : `${product.currentStock} ${product.unit || 'in stock'}`}
                      </span>
                    </div>
                    <h4 className="item-title">{product.name}</h4>
                    <div className="item-sku-code">SKU: {product.sku}</div>
                  </div>
                  <div className="card-bottom">
                    <div className="item-meta">
                      <span className="item-price">₹{product.sellingPrice.toFixed(2)}</span>
                      {countInCart > 0 && (
                        <span className="in-cart-indicator">
                          <CheckIcon size={12} /> {countInCart} in bill
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="btn-add-item"
                      disabled={isOutOfStock || isStockDepleted}
                      onClick={() => onAddProduct(product)}
                      title={
                        isOutOfStock
                          ? 'Product is out of stock'
                          : isStockDepleted
                          ? 'Maximum stock reached in cart'
                          : 'Add retail product to bill'
                      }
                    >
                      <PlusIcon size={14} />
                      <span>{isOutOfStock ? 'Sold Out' : 'Add'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
