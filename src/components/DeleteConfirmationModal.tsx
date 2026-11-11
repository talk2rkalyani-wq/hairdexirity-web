import React, { useEffect, useRef } from 'react'
import { TrashIcon, CloseIcon } from './Icons'
import './DeleteConfirmationModal.css'

export interface DeleteConfirmationModalProps {
  isOpen: boolean
  title: string
  itemName?: string
  itemCount?: number
  itemType?: string
  description?: string
  warningNote?: string
  confirmButtonText?: string
  isDeleting?: boolean
  error?: string | null
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  isOpen,
  title,
  itemName,
  itemCount,
  itemType = 'record',
  description,
  warningNote = 'This action cannot be undone.',
  confirmButtonText,
  isDeleting = false,
  error = null,
  onConfirm,
  onCancel,
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return

    // Focus confirm button or modal when opened
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus()
    }, 50)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, isDeleting, onCancel])

  if (!isOpen) return null

  // Compute standard descriptive text if custom description wasn't provided
  const computedDescription =
    description ||
    (itemCount && itemCount > 1
      ? `You are about to permanently delete ${itemCount} selected ${itemType.toLowerCase()}s.`
      : itemName
      ? `You are about to permanently delete ${itemName}.`
      : `You are about to permanently delete this ${itemType.toLowerCase()}.`)

  const effectiveConfirmLabel =
    confirmButtonText ||
    (itemCount && itemCount > 1
      ? `Delete ${itemCount} ${itemType}s`
      : 'Delete')

  return (
    <div
      className="delete-modal-overlay"
      onClick={() => {
        if (!isDeleting) onCancel()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
      aria-describedby="delete-modal-desc"
    >
      <div
        className="delete-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Close Button */}
        <button
          type="button"
          className="delete-modal-close-btn"
          onClick={onCancel}
          disabled={isDeleting}
          aria-label="Close dialog"
        >
          <CloseIcon size={18} />
        </button>

        {/* Destructive Icon Badge */}
        <div className="delete-modal-icon-wrap" aria-hidden="true">
          <div className="delete-icon-pulse" />
          <TrashIcon size={24} className="delete-modal-icon" />
        </div>

        {/* Modal Content */}
        <div className="delete-modal-body">
          <h3 id="delete-modal-title" className="delete-modal-title">
            {title}
          </h3>

          <p id="delete-modal-desc" className="delete-modal-desc">
            {computedDescription}
          </p>

          <div className="delete-modal-warning-callout">
            <span className="warning-dot" />
            <span>{warningNote}</span>
          </div>

          {/* Error Message if Deletion Failed (e.g. Last Owner check) */}
          {error && (
            <div className="delete-modal-error-banner" role="alert">
              <span className="error-icon">⚠️</span>
              <span className="error-text">{error}</span>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="delete-modal-actions">
          <button
            type="button"
            id="delete-modal-cancel-btn"
            className="delete-btn-cancel"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Cancel
          </button>

          <button
            type="button"
            id="delete-modal-confirm-btn"
            ref={confirmBtnRef}
            className="delete-btn-confirm"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <span className="delete-spinner" aria-hidden="true" />
                <span>Deleting...</span>
              </>
            ) : (
              <span>{effectiveConfirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
