// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Create Credit Note Modal Component
// ==============================================================================

import React, { useState, useEffect } from 'react'
import { customerLedgerService } from '../../../services/customerLedgerService.ts'
import { billingService } from '../../../services/billingService.ts'
import type { Invoice } from '../../../types/finance.ts'
import { CloseIcon, PlusIcon, TrashIcon, AlertTriangleIcon } from '../../../components/Icons.tsx'
import './CreateCreditNoteModal.css'

interface CreateCreditNoteModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  preselectedInvoiceId?: string
}

interface EditableCreditItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
}

export const CreateCreditNoteModal: React.FC<CreateCreditNoteModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedInvoiceId,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [invoiceId, setInvoiceId] = useState(preselectedInvoiceId || '')
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [reason, setReason] = useState('')
  const [items, setItems] = useState<EditableCreditItem[]>([
    {
      id: 'item-1',
      description: 'Service / Product adjustment credit',
      quantity: 1,
      unitPrice: 500,
      taxRate: 0.18,
    },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      billingService
        .fetchInvoicesAsync()
        .then((list) => {
          const eligible = list.filter((inv) => !inv.isDraft)
          setInvoices(eligible)
          if (preselectedInvoiceId) {
            setInvoiceId(preselectedInvoiceId)
            const matched = eligible.find((i) => i.id === preselectedInvoiceId)
            setSelectedInvoice(matched || null)
          }
        })
        .catch(console.error)

      setReason('')
      setItems([
        {
          id: 'item-1',
          description: 'Service / Product adjustment credit',
          quantity: 1,
          unitPrice: 500,
          taxRate: 0.18,
        },
      ])
      setError(null)
    }
  }, [isOpen, preselectedInvoiceId])

  const handleInvoiceChange = (id: string) => {
    setInvoiceId(id)
    const matched = invoices.find((inv) => inv.id === id) || null
    setSelectedInvoice(matched)
  }

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        id: `item-${Date.now()}`,
        description: 'Credit adjustment',
        quantity: 1,
        unitPrice: 100,
        taxRate: 0.18,
      },
    ])
  }

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleItemChange = (index: number, field: keyof EditableCreditItem, val: any) => {
    setItems((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [field]: val }
      return copy
    })
  }

  if (!isOpen) return null

  // Calculate totals
  const subtotal = items.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0)
  const taxAmount = Math.round(subtotal * 0.18 * 100) / 100
  const totalAmount = subtotal + taxAmount

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!invoiceId) {
      setError('Please select an invoice for which this credit note is issued.')
      return
    }
    if (!reason.trim()) {
      setError('Please specify a reason for this credit note.')
      return
    }
    if (totalAmount <= 0) {
      setError('Total credit amount must be greater than ₹0.')
      return
    }

    try {
      setIsSubmitting(true)
      await customerLedgerService.createCreditNote({
        originalInvoiceId: invoiceId,
        reason: reason.trim(),
        items: items.map((it) => ({
          description: it.description.trim() || 'Credit item',
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          taxRate: it.taxRate,
        })),
      })
      setIsSubmitting(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setIsSubmitting(false)
      setError(err.message || 'Failed to create credit note')
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="create-credit-note-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="modal-header">
          <div className="modal-header-title">
            <span className="brand-gold-dot"></span>
            <h3>Create Customer Credit Note</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="modal-alert modal-alert-danger">
              <AlertTriangleIcon size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="cn-invoice-select">Original Invoice <span className="req">*</span></label>
            <select
              id="cn-invoice-select"
              value={invoiceId}
              onChange={(e) => handleInvoiceChange(e.target.value)}
              className="form-control"
              required
            >
              <option value="">-- Select Original Invoice --</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  #{inv.invoiceNumber} — {inv.clientName} (Total: ₹{inv.totalAmount})
                </option>
              ))}
            </select>
          </div>

          {selectedInvoice && (
            <div className="credit-summary-card">
              <div className="summary-field">
                <span className="summary-label">Client:</span>
                <span className="summary-val">{selectedInvoice.clientName}</span>
              </div>
              <div className="summary-field">
                <span className="summary-label">Invoice Total:</span>
                <span className="summary-val">₹{selectedInvoice.totalAmount}</span>
              </div>
              <div className="summary-field">
                <span className="summary-label">Payment Status:</span>
                <span className="summary-val text-gold">
                  {selectedInvoice.paymentStatus || 'paid'}
                </span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="cn-reason">Reason for Credit Note <span className="req">*</span></label>
            <input
              id="cn-reason"
              type="text"
              placeholder="e.g. Returned retail product, service concession, billing adjustment"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="form-control"
              required
            />
          </div>

          <div className="items-section">
            <div className="items-header">
              <span className="items-title">Credit Line Items</span>
              <button
                type="button"
                className="btn-add-item"
                onClick={handleAddItem}
              >
                <PlusIcon size={14} /> Add Item
              </button>
            </div>

            <div className="credit-items-list">
              {items.map((item, idx) => (
                <div key={item.id} className="credit-item-row">
                  <input
                    type="text"
                    placeholder="Item description"
                    value={item.description}
                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                    className="form-control item-desc"
                    required
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) =>
                      handleItemChange(idx, 'quantity', Math.max(1, parseFloat(e.target.value) || 1))
                    }
                    className="form-control item-qty"
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Unit Price"
                    value={item.unitPrice}
                    onChange={(e) =>
                      handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)
                    }
                    className="form-control item-price"
                    required
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      className="btn-remove-item"
                      onClick={() => handleRemoveItem(idx)}
                      title="Remove item"
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="credit-totals-box">
            <div className="totals-row">
              <span>Subtotal:</span>
              <span>₹{subtotal.toFixed(2)}</span>
            </div>
            <div className="totals-row">
              <span>GST (18%):</span>
              <span>₹{taxAmount.toFixed(2)}</span>
            </div>
            <div className="totals-row totals-grand">
              <span>Total Credit Amount:</span>
              <span className="text-gold">₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Issuing...' : 'Issue Credit Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
