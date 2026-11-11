// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Proforma Invoice Preview & Generation Modal
// Strictly Marked: "PROFORMA INVOICE — NOT A TAX INVOICE"
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Quotation, ProformaInvoice } from '../../../types/finance.ts'
import { quotationService } from '../../../services/quotationService.ts'
import { downloadProformaPdf } from '../../../services/quotationPdfService.ts'
import { formatPdfCurrency } from '../../../services/pdfService.ts'
import {
  CloseIcon,
  DownloadIcon,
  AlertTriangleIcon,
  FileTextIcon,
} from '../../../components/Icons.tsx'
import './ProformaPreviewModal.css'

interface ProformaPreviewModalProps {
  isOpen: boolean
  quotation: Quotation | null
  onClose: () => void
}

export const ProformaPreviewModal: React.FC<ProformaPreviewModalProps> = ({
  isOpen,
  quotation,
  onClose,
}) => {
  const [proforma, setProforma] = useState<ProformaInvoice | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    async function loadOrCreateProforma() {
      if (!isOpen || !quotation) return
      setIsLoading(true)
      setErrorMessage(null)
      try {
        // Check if an existing proforma exists for this quotation
        const existing = await quotationService.listProformaInvoices(quotation.id, quotation.salonId)
        if (existing.length > 0) {
          setProforma(existing[0])
        } else {
          // Create new proforma
          const res = await quotationService.createProformaInvoice(quotation.id, quotation.salonId)
          const all = await quotationService.listProformaInvoices(quotation.id, quotation.salonId)
          const found = all.find((p) => p.id === res.proformaId)
          if (found) {
            setProforma(found)
          } else {
            // Build temporary proforma structure for preview
            setProforma({
              id: res.proformaId,
              salonId: quotation.salonId,
              proformaNumber: res.proformaNumber,
              quotationId: quotation.id,
              clientId: quotation.clientId,
              clientName: quotation.clientName,
              clientPhone: quotation.clientPhone,
              clientEmail: quotation.clientEmail,
              issueDate: new Date().toISOString().split('T')[0],
              validUntil: quotation.validUntil,
              subtotal: quotation.subtotal,
              discountAmount: quotation.discountAmount,
              taxAmount: quotation.taxAmount,
              cgstAmount: quotation.cgstAmount,
              sgstAmount: quotation.sgstAmount,
              totalAmount: quotation.totalAmount,
              status: 'issued',
              notes: quotation.customerNotes,
              termsAndConditions: quotation.termsAndConditions,
              createdAt: new Date().toISOString(),
              items: quotation.items?.map((i) => ({
                id: i.id,
                name: i.name,
                description: i.description,
                itemType: i.itemType,
                staffName: i.staffName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                discountAmount: i.discountAmount,
                taxRate: i.taxRate,
                taxAmount: i.taxAmount,
                totalPrice: i.totalPrice,
              })),
            })
          }
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to generate proforma invoice')
      } finally {
        setIsLoading(false)
      }
    }

    void loadOrCreateProforma()
  }, [isOpen, quotation])

  if (!isOpen || !quotation) return null

  const handleDownload = () => {
    if (proforma) {
      downloadProformaPdf(proforma)
    }
  }

  return (
    <div className="luma-modal-overlay" onClick={onClose}>
      <div className="proforma-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="proforma-modal-header">
          <div className="proforma-header-left">
            <FileTextIcon size={22} className="gold" />
            <div>
              <h2 className="proforma-modal-title">
                {proforma ? `Proforma Invoice — ${proforma.proformaNumber}` : 'Proforma Invoice Preview'}
              </h2>
              <p className="proforma-modal-subtitle">
                Based on Quotation {quotation.quotationNumber} for {quotation.clientName}
              </p>
            </div>
          </div>
          <button type="button" className="proforma-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="proforma-not-invoice-banner">
          <AlertTriangleIcon size={18} />
          <span>PROFORMA INVOICE — NOT A TAX INVOICE (Zero impact on revenue or financial ledger)</span>
        </div>

        {errorMessage && (
          <div className="proforma-alert alert-error">
            <AlertTriangleIcon size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Body Content */}
        <div className="proforma-modal-body">
          {isLoading ? (
            <div className="proforma-loading">Generating proforma document...</div>
          ) : proforma ? (
            <>
              {/* Meta Card */}
              <div className="proforma-meta-grid">
                <div>
                  <span className="meta-lbl">Client</span>
                  <span className="meta-val">{proforma.clientName}</span>
                </div>
                <div>
                  <span className="meta-lbl">Proforma Number</span>
                  <span className="meta-val gold">{proforma.proformaNumber}</span>
                </div>
                <div>
                  <span className="meta-lbl">Issue Date</span>
                  <span className="meta-val">{proforma.issueDate}</span>
                </div>
                <div>
                  <span className="meta-lbl">Valid Until</span>
                  <span className="meta-val">{proforma.validUntil}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="proforma-table-wrap">
                <table className="proforma-table">
                  <thead>
                    <tr>
                      <th>Item & Description</th>
                      <th>Staff</th>
                      <th className="text-center">Qty</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Tax</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(proforma.items || quotation.items || []).map((item, idx) => (
                      <tr key={item.id || idx}>
                        <td>
                          <strong>{item.name}</strong>
                          {item.description && item.description !== item.name && (
                            <div className="sub-desc">{item.description}</div>
                          )}
                        </td>
                        <td>{item.staffName || '—'}</td>
                        <td className="text-center">{item.quantity}</td>
                        <td className="text-right">{formatPdfCurrency(item.unitPrice)}</td>
                        <td className="text-right">{formatPdfCurrency(item.taxAmount || 0)}</td>
                        <td className="text-right bold">{formatPdfCurrency(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="proforma-totals-panel">
                <div className="proforma-total-row">
                  <span>Subtotal:</span>
                  <span>{formatPdfCurrency(proforma.subtotal)}</span>
                </div>
                {proforma.discountAmount > 0 && (
                  <div className="proforma-total-row text-red">
                    <span>Discount:</span>
                    <span>-{formatPdfCurrency(proforma.discountAmount)}</span>
                  </div>
                )}
                <div className="proforma-total-row">
                  <span>GST (18%):</span>
                  <span>{formatPdfCurrency(proforma.taxAmount)}</span>
                </div>
                <div className="proforma-total-row grand-total">
                  <span>Proforma Total:</span>
                  <span className="gold">{formatPdfCurrency(proforma.totalAmount)}</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="proforma-modal-footer">
          <button type="button" className="btn-close-proforma" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-download-proforma"
            onClick={handleDownload}
            disabled={!proforma || isLoading}
          >
            <DownloadIcon size={16} />
            <span>Download Proforma Vector PDF</span>
          </button>
        </div>
      </div>
    </div>
  )
}

