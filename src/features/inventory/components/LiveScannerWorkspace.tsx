import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { InventoryProduct, ScannedProductItem } from '../../../types/inventory'
import { formatCurrency } from '../../../config/inventoryConfig'
import { UnknownProductModal } from './UnknownProductModal'
import { BarcodeIcon, PlusIcon, TrashIcon } from '../../../components/Icons'
import { roundQuantity } from '../../../utils/inventoryValidation'

interface LiveScannerWorkspaceProps {
  existingProducts?: InventoryProduct[]
  scannedItems: ScannedProductItem[]
  onUpdateScannedItems: (items: ScannedProductItem[]) => void
  onAddBatchToInventory: (items: ScannedProductItem[], idempotencyKey?: string) => Promise<void> | void
  onExitLiveMode: () => void
}

export const LiveScannerWorkspace: React.FC<LiveScannerWorkspaceProps> = ({
  existingProducts = [],
  scannedItems,
  onUpdateScannedItems,
  onAddBatchToInventory,
  onExitLiveMode,
}) => {
  const [barcodeInput, setBarcodeInput] = useState('')
  const [scanFeedback, setScanFeedback] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null)
  const [unknownBarcode, setUnknownBarcode] = useState<string | null>(null)
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastScanTimeRef = useRef<number>(0)

  // Automatically focus barcode input when Live Mode opens
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const focusScannerInput = useCallback(() => {
    // Only focus if no modal overlay is active
    if (!unknownBarcode) {
      inputRef.current?.focus()
    }
  }, [unknownBarcode])

  const showFeedback = (message: string, type: 'success' | 'info' | 'warning') => {
    setScanFeedback({ message, type })
    setTimeout(() => {
      setScanFeedback(null)
    }, 3500)
  }

  // Core Barcode Processing Logic
  const handleProcessBarcode = (codeToProcess: string) => {
    const raw = codeToProcess.trim()
    if (!raw) return

    // Debounce rapid scanner hardware triggers (< 150ms)
    const now = Date.now()
    if (now - lastScanTimeRef.current < 150) {
      return
    }
    lastScanTimeRef.current = now

    // 1. Search existing inventory catalog for matching barcode or SKU
    const matchedProduct = existingProducts.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === raw.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === raw.toLowerCase()) ||
        p.id.toLowerCase() === raw.toLowerCase()
    )

    if (matchedProduct) {
      // 2. Existing product identified: update pending batch quantity
      const existingBatchIndex = scannedItems.findIndex(
        (item) => item.barcode.toLowerCase() === raw.toLowerCase() || item.id === matchedProduct.id
      )

      if (existingBatchIndex > -1) {
        // Increment pending quantity for already-scanned item
        const updated = [...scannedItems]
        const currentItem = updated[existingBatchIndex]
        const nextQty = roundQuantity(currentItem.quantity + 1, currentItem.unit)
        updated[existingBatchIndex] = {
          ...currentItem,
          quantity: nextQty,
        }
        onUpdateScannedItems(updated)
        showFeedback(
          `Increased quantity for "${matchedProduct.name}" (${nextQty} ${matchedProduct.unit})`,
          'success'
        )
      } else {
        // Add new batch row for identified product, preserving original ID and details
        const newItem: ScannedProductItem = {
          id: matchedProduct.id,
          barcode: raw,
          sku: matchedProduct.sku,
          name: matchedProduct.name,
          brand: matchedProduct.brand,
          category: matchedProduct.category,
          unit: matchedProduct.unit,
          purchasePrice: matchedProduct.purchasePrice,
          sellingPrice: matchedProduct.sellingPrice,
          quantity: 1,
          isNewProduct: false,
          existingStock: matchedProduct.currentStock,
        }
        onUpdateScannedItems([newItem, ...scannedItems])
        showFeedback(`Identified: "${matchedProduct.name}" by ${matchedProduct.brand}`, 'success')
      }

      setBarcodeInput('')
      setTimeout(focusScannerInput, 50)
      return
    }

    // 3. Not in existing catalog — check if already present in pending batch
    const pendingBatchIndex = scannedItems.findIndex(
      (item) =>
        item.barcode.toLowerCase() === raw.toLowerCase() ||
        (item.sku && item.sku.toLowerCase() === raw.toLowerCase())
    )

    if (pendingBatchIndex > -1) {
      // Barcode already registered in this intake session — increment batch quantity!
      const updated = [...scannedItems]
      const currentItem = updated[pendingBatchIndex]
      const nextQty = roundQuantity(currentItem.quantity + 1, currentItem.unit)
      updated[pendingBatchIndex] = {
        ...currentItem,
        quantity: nextQty,
      }
      onUpdateScannedItems(updated)
      showFeedback(
        `Increased quantity for "${currentItem.name}" (${nextQty} ${currentItem.unit}) in pending batch`,
        'success'
      )
      setBarcodeInput('')
      setTimeout(focusScannerInput, 50)
      return
    }

    // 4. Truly unknown barcode: open details capture modal (preserving original barcode string exactly)
    setUnknownBarcode(raw)
  }

  // Handle Form Submission / Scanner Enter Key
  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    handleProcessBarcode(barcodeInput)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleProcessBarcode(barcodeInput)
    }
  }

  // Quantity Stepper Controls
  const handleAdjustQuantity = (index: number, delta: number) => {
    const updated = [...scannedItems]
    const currentItem = updated[index]
    const nextQty = roundQuantity(currentItem.quantity + delta, currentItem.unit)
    if (nextQty <= 0) {
      handleRemoveItem(index)
      return
    }
    updated[index] = { ...currentItem, quantity: nextQty }
    onUpdateScannedItems(updated)
  }

  // Remove Item
  const handleRemoveItem = (index: number) => {
    const updated = scannedItems.filter((_, i) => i !== index)
    onUpdateScannedItems(updated)
  }

  // Clear List with Confirmation Dialog
  const handleClearAllScanned = () => {
    if (scannedItems.length === 0) return
    const confirmed = window.confirm(
      `Are you sure you want to clear all ${scannedItems.length} scanned items from your pending batch?`
    )
    if (confirmed) {
      onUpdateScannedItems([])
      showFeedback('Scanned batch cleared.', 'info')
      focusScannerInput()
    }
  }

  // Handle Confirming Unknown Product Details
  const handleConfirmUnknownProduct = (item: ScannedProductItem) => {
    setUnknownBarcode(null)
    onUpdateScannedItems([item, ...scannedItems])
    setBarcodeInput('')
    showFeedback(`Added new product "${item.name}" to batch!`, 'success')
    setTimeout(focusScannerInput, 100)
  }

  const idempotencyKeyRef = useRef<string | null>(null)

  const handleCommitBatch = async () => {
    if (isSubmittingBatch || scannedItems.length === 0) return
    setIsSubmittingBatch(true)
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = `batch-idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    }
    try {
      await onAddBatchToInventory(scannedItems, idempotencyKeyRef.current)
      idempotencyKeyRef.current = null
    } catch (err: any) {
      showFeedback(`Commit failed: ${err?.message || 'Error committing batch'}`, 'warning')
    } finally {
      setIsSubmittingBatch(false)
    }
  }

  // Live Summary Calculations
  const uniqueCount = scannedItems.length
  const totalUnits = scannedItems.reduce((acc, item) => roundQuantity(acc + item.quantity), 0)
  const newProductsCount = scannedItems.filter((item) => item.isNewProduct).length

  return (
    <div className="live-scanner-workspace">
      {/* 1. Device Connection Section */}
      <section className="live-device-status-banner" aria-label="Scanner Hardware Status">
        <div className="live-device-info">
          <div className="live-device-icon-wrap" aria-hidden="true">
            <BarcodeIcon size={22} />
          </div>
          <div className="live-device-text">
            <span className="live-device-title">Live Inventory Mode</span>
            <span className="live-device-instruction">
              Connect your USB or Bluetooth barcode scanner and scan a product barcode.
            </span>
          </div>
        </div>

        <div className="live-connection-badge" role="status" title="Keyboard-wedge barcode scanner ready">
          <span className="status-dot" aria-hidden="true" />
          <span>Scanner input ready</span>
        </div>
      </section>

      {/* 2. Barcode Scanning Input Area */}
      <section className="live-barcode-input-section">
        <form onSubmit={handleScanSubmit} className="live-barcode-input-row">
          <div className="live-input-wrap">
            <BarcodeIcon size={20} className="live-barcode-icon" />
            <input
              ref={inputRef}
              type="text"
              className="live-barcode-input"
              placeholder="Scan or enter barcode (e.g. 8901234567890)..."
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck="false"
              aria-label="Scan or enter product barcode"
            />
          </div>

          <button type="submit" className="btn-scan-action" disabled={!barcodeInput.trim()}>
            <PlusIcon size={16} />
            <span>Scan Product</span>
          </button>
        </form>

        {/* Scan Feedback Banner */}
        {scanFeedback && (
          <div
            style={{
              padding: '0.5rem 0.85rem',
              borderRadius: '8px',
              fontSize: '0.82rem',
              fontWeight: 500,
              background:
                scanFeedback.type === 'success'
                  ? 'rgba(34, 197, 94, 0.15)'
                  : scanFeedback.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(59, 130, 246, 0.15)',
              border: `1px solid ${
                scanFeedback.type === 'success'
                  ? 'rgba(34, 197, 94, 0.35)'
                  : scanFeedback.type === 'warning'
                  ? 'rgba(245, 158, 11, 0.35)'
                  : 'rgba(59, 130, 246, 0.35)'
              }`,
              color:
                scanFeedback.type === 'success'
                  ? '#4ade80'
                  : scanFeedback.type === 'warning'
                  ? '#fbbf24'
                  : '#93c5fd',
            }}
          >
            {scanFeedback.message}
          </div>
        )}
      </section>

      {/* 3. Scanned Products List */}
      <section className="scanned-products-section" aria-label="Scanned Products List">
        <div className="scanned-header-row">
          <div className="scanned-heading">
            <span>Pending Scanned Batch</span>
            <span className="scanned-count-pill">{uniqueCount} items</span>
          </div>

          {uniqueCount > 0 && (
            <button
              type="button"
              className="btn-clear-scanned"
              onClick={handleClearAllScanned}
              aria-label="Clear all scanned products"
            >
              Clear List
            </button>
          )}
        </div>

        {uniqueCount === 0 ? (
          /* Empty Scan Queue */
          <div className="scanned-empty-box">
            <BarcodeIcon size={34} style={{ opacity: 0.5, color: '#dfbe7c' }} />
            <h4 className="scanned-empty-title">Ready to Scan</h4>
            <p className="scanned-empty-desc">
              Point your barcode scanner at any retail or backbar item. Existing products will be identified,
              and unknown barcodes will be flagged for details.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Scanned Table (> 768px) */}
            <div className="scanned-table-wrap">
              <table className="scanned-table" aria-label="Scanned products list">
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Category</th>
                    <th scope="col">Type</th>
                    <th scope="col">Selling Price</th>
                    <th scope="col">Intake Qty</th>
                    <th scope="col" style={{ width: '40px' }} aria-label="Actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {scannedItems.map((item, idx) => (
                    <tr
                      key={`${item.barcode}-${idx}`}
                      className={`scanned-table-row ${item.isNewProduct ? 'row-new-product' : ''}`}
                    >
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontWeight: 600, color: '#ffffff' }}>{item.name}</span>
                          <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                            {item.brand} • <code style={{ color: '#38bdf8' }}>{item.barcode}</code>
                          </span>
                        </div>
                      </td>

                      <td>
                        <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{item.category}</span>
                      </td>

                      <td>
                        {item.isNewProduct ? (
                          <span className="tag-new">New Product</span>
                        ) : (
                          <span className="tag-existing">In Catalog</span>
                        )}
                      </td>

                      <td>
                        <span style={{ fontWeight: 600, color: '#dfbe7c' }}>
                          {formatCurrency(item.sellingPrice)}
                        </span>
                      </td>

                      <td>
                        <div className="quantity-stepper">
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => handleAdjustQuantity(idx, -1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            -
                          </button>
                          <span className="qty-value">{item.quantity}</span>
                          <button
                            type="button"
                            className="qty-btn"
                            onClick={() => handleAdjustQuantity(idx, 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn-remove-scanned"
                          onClick={() => handleRemoveItem(idx)}
                          aria-label={`Remove ${item.name} from scanned list`}
                          title="Remove item"
                        >
                          <TrashIcon size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Scanned Cards (<= 768px) */}
            <div className="scanned-cards-container">
              {scannedItems.map((item, idx) => (
                <div key={`mob-${item.barcode}-${idx}`} className="scanned-item-card">
                  <div className="scanned-item-top">
                    <div>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                        {item.brand}
                      </span>
                      <div style={{ fontWeight: 600, color: '#ffffff', fontSize: '0.92rem' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                        Barcode: <code style={{ color: '#38bdf8' }}>{item.barcode}</code>
                      </div>
                    </div>

                    {item.isNewProduct ? (
                      <span className="tag-new">New</span>
                    ) : (
                      <span className="tag-existing">Catalog</span>
                    )}
                  </div>

                  <div className="scanned-item-bottom">
                    <div style={{ fontWeight: 600, color: '#dfbe7c', fontSize: '0.92rem' }}>
                      {formatCurrency(item.sellingPrice)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div className="quantity-stepper">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => handleAdjustQuantity(idx, -1)}
                          aria-label="Decrease"
                        >
                          -
                        </button>
                        <span className="qty-value">{item.quantity}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => handleAdjustQuantity(idx, 1)}
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn-remove-scanned"
                        onClick={() => handleRemoveItem(idx)}
                        aria-label="Remove item"
                      >
                        <TrashIcon size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* 4. Live Inventory Summary Bar */}
      <section className="live-summary-bar" aria-label="Batch Summary">
        <div className="summary-metric">
          <span className="summary-label">Unique Products</span>
          <span className="summary-value">{uniqueCount}</span>
        </div>

        <div className="summary-metric">
          <span className="summary-label">Total Units</span>
          <span className="summary-value">{totalUnits}</span>
        </div>

        <div className="summary-metric">
          <span className="summary-label">New Products</span>
          <span className="summary-value" style={{ color: newProductsCount > 0 ? '#c084fc' : '#94a3b8' }}>
            {newProductsCount}
          </span>
        </div>
      </section>

      {/* 5. Live Mode Action Controls */}
      <div className="create-inv-footer" style={{ padding: '0', background: 'transparent', borderTop: 'none' }}>
        <button type="button" className="btn-secondary" onClick={onExitLiveMode}>
          Exit Live Mode
        </button>

        <button
          type="button"
          className="btn-primary"
          disabled={uniqueCount === 0 || isSubmittingBatch}
          onClick={handleCommitBatch}
        >
          {isSubmittingBatch
            ? 'Adding to Inventory...'
            : `Add Scanned Products to Inventory (${totalUnits} Units)`}
        </button>
      </div>

      {/* Unknown Barcode Capture Dialog */}
      {unknownBarcode && (
        <UnknownProductModal
          barcode={unknownBarcode}
          existingProducts={existingProducts}
          pendingBatch={scannedItems}
          onConfirm={handleConfirmUnknownProduct}
          onCancel={() => {
            setUnknownBarcode(null)
            setBarcodeInput('')
            focusScannerInput()
          }}
        />
      )}
    </div>
  )
}
