import React, { useState } from 'react'
import type { InventoryProduct, ScannedProductItem } from '../../../types/inventory'
import { SingleProductForm } from './SingleProductForm'
import { LiveScannerWorkspace } from './LiveScannerWorkspace'
import { CloseIcon, BarcodeIcon, EditIcon } from '../../../components/Icons'
import './CreateInventoryModal.css'

export type InventoryCreateMode = 'single' | 'live'

interface CreateInventoryModalProps {
  isOpen: boolean
  existingProducts?: InventoryProduct[]
  onClose: () => void
  onProductCreated?: (product: InventoryProduct) => Promise<void> | void
  onBatchCreated?: (items: ScannedProductItem[], idempotencyKey?: string) => Promise<void> | void
}

export const CreateInventoryModal: React.FC<CreateInventoryModalProps> = ({
  isOpen,
  existingProducts = [],
  onClose,
  onProductCreated,
  onBatchCreated,
}) => {
  // Mode selection state (Default: Single Mode per requirements)
  const [activeMode, setActiveMode] = useState<InventoryCreateMode>('single')

  // Live Mode pending scanned batch state (preserved when switching modes)
  const [scannedBatch, setScannedBatch] = useState<ScannedProductItem[]>([])

  if (!isOpen) return null

  const handleModeSwitch = (newMode: InventoryCreateMode) => {
    setActiveMode(newMode)
  }

  const handleSingleSave = async (product: InventoryProduct) => {
    if (onProductCreated) {
      await onProductCreated(product)
    }
    onClose()
  }

  const handleBatchSubmit = async (items: ScannedProductItem[], idempotencyKey?: string) => {
    if (onBatchCreated) {
      await onBatchCreated(items, idempotencyKey)
    }
    setScannedBatch([])
    onClose()
  }

  return (
    <div
      className="create-inv-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-inv-title"
    >
      <div
        className="create-inv-modal"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Modal Header */}
        <header className="create-inv-header">
          <div className="create-inv-header-top">
            <div className="create-inv-title-area">
              <span className="create-inv-kicker">Salon Inventory Intake</span>
              <h2 id="create-inv-title" className="create-inv-title">
                Create Inventory
              </h2>
              <p className="create-inv-desc">
                {activeMode === 'single'
                  ? 'Add an individual retail product or backbar salon supply to inventory.'
                  : 'Fast-track stock intake using your USB or Bluetooth barcode scanner.'}
              </p>
            </div>

            <button
              type="button"
              className="create-inv-close-btn"
              onClick={onClose}
              aria-label="Close dialog"
            >
              <CloseIcon size={20} />
            </button>
          </div>

          {/* Mode Selector Segmented Control */}
          <div className="create-inv-mode-selector" role="tablist" aria-label="Inventory creation mode">
            <button
              type="button"
              className={`mode-tab-btn ${activeMode === 'single' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('single')}
              role="tab"
              aria-selected={activeMode === 'single'}
            >
              <EditIcon size={16} />
              <span>Single Mode</span>
            </button>

            <button
              type="button"
              className={`mode-tab-btn ${activeMode === 'live' ? 'active' : ''}`}
              onClick={() => handleModeSwitch('live')}
              role="tab"
              aria-selected={activeMode === 'live'}
            >
              <BarcodeIcon size={16} />
              <span>Live Mode</span>
              <span className="mode-live-pill">Scanner</span>
            </button>
          </div>
        </header>

        {/* Modal Body: Transforms completely based on active mode */}
        <div className="create-inv-body">
          {activeMode === 'single' ? (
            /* Mode 1: Single Mode Form */
            <SingleProductForm
              existingProducts={existingProducts}
              onSave={handleSingleSave}
              onCancel={onClose}
            />
          ) : (
            /* Mode 2: Dedicated Live Mode Barcode Scanning Workspace */
            <LiveScannerWorkspace
              existingProducts={existingProducts}
              scannedItems={scannedBatch}
              onUpdateScannedItems={setScannedBatch}
              onAddBatchToInventory={handleBatchSubmit}
              onExitLiveMode={() => handleModeSwitch('single')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

