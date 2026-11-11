// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Quotation Creation & Builder View
// Supports Services, Retail Products, Custom Items, Stylists & Discount Auth
// ==============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { QuotationItem, Quotation } from '../../types/finance.ts'
import type { Staff, Service, Client } from '../../types/models.ts'
import { quotationService } from '../../services/quotationService.ts'
import { staffService } from '../../services/staffService.ts'
import { serviceService } from '../../services/serviceService.ts'
import { clientService } from '../../services/clientService.ts'
import { sessionService } from '../../services/sessionService.ts'
import { formatPdfCurrency } from '../../services/pdfService.ts'
import { QuickClientModal } from './components/QuickClientModal.tsx'
import { OwnerAuthModal } from './components/OwnerAuthModal.tsx'
import { QuotationShareModal } from './components/QuotationShareModal.tsx'
import {
  ScissorsIcon,
  PackageIcon,
  PlusIcon,
  TrashIcon,
  SearchIcon,
  CloseIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  ShareIcon,
  FileTextIcon,
} from '../../components/Icons.tsx'
import './NewQuotationView.css'

interface NewQuotationViewProps {
  onNavigate?: (navId: NavId) => void
  onCancel?: () => void
}

export const NewQuotationView: React.FC<NewQuotationViewProps> = ({ onNavigate, onCancel }) => {
  const currentSession = sessionService.getCurrentSession()
  const userRole = currentSession?.role || 'RECEPTIONIST'

  // Dependencies
  const [activeStaff, setActiveStaff] = useState<Staff[]>([])
  const [allServices, setAllServices] = useState<Service[]>([])
  const [allClients, setAllClients] = useState<Client[]>([])

  // Customer State
  const [isWalkIn, setIsWalkIn] = useState(false)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [isQuickClientModalOpen, setIsQuickClientModalOpen] = useState(false)
  const [walkInName, setWalkInName] = useState('Walk-in Guest')
  const [walkInPhone, setWalkInPhone] = useState('')
  const [walkInEmail, setWalkInEmail] = useState('')

  // Quotation Metadata
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0])
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 14)
    return d.toISOString().split('T')[0]
  })
  const [customerNotes, setCustomerNotes] = useState(
    'Thank you for consulting with Hair Dexirity. Quotation valid for 14 days from issue date.'
  )
  const [internalNotes, setInternalNotes] = useState('')
  const [termsAndConditions, setTermsAndConditions] = useState(
    '1. Prices quoted are inclusive of stylist consultation and standard styling products.\n2. Prior appointment booking required.\n3. Advance deposit is non-refundable if cancelled within 24 hours of appointment.'
  )
  const [advanceRequired, setAdvanceRequired] = useState<number>(0)
  const [estimatedDuration, setEstimatedDuration] = useState<number>(60)

  // Line Items
  const [lineItems, setLineItems] = useState<QuotationItem[]>([])

  // Quotation-Level Discount
  const [discountType, setDiscountType] = useState<'flat' | 'percentage'>('flat')
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountReason, setDiscountReason] = useState<string>('')
  const [authorizationGrantId, setAuthorizationGrantId] = useState<string | undefined>(undefined)
  const [authorizedBy, setAuthorizedBy] = useState<string | undefined>(undefined)
  const [isOwnerAuthModalOpen, setIsOwnerAuthModalOpen] = useState(false)

  // Modals & UI State
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createdQuotationForShare, setCreatedQuotationForShare] = useState<Quotation | null>(null)

  // Item Search Popover State
  const [itemSearchMode, setItemSearchMode] = useState<'service' | 'product' | null>(null)
  const [itemSearchQuery, setItemSearchQuery] = useState('')

  // Load Dependencies
  useEffect(() => {
    let mounted = true
    Promise.all([
      staffService.getActiveStaff(),
      serviceService.getServices(),
      clientService.getClients(),
    ])
      .then(([staffList, srvList, clientList]) => {
        if (!mounted) return
        setActiveStaff(staffList)
        setAllServices(srvList.filter((s) => s.active))
        setAllClients(clientList)
      })
      .catch((err) => console.warn('Failed to load quotation form dependencies:', err))

    return () => {
      mounted = false
    }
  }, [])

  // Filter clients
  const filteredClients = useMemo(() => {
    if (!clientSearchQuery.trim()) return allClients.slice(0, 8)
    const q = clientSearchQuery.toLowerCase()
    return allClients.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || (c.email && c.email.toLowerCase().includes(q))
    )
  }, [allClients, clientSearchQuery])

  // Calculation Engine
  const subtotal = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0)
  }, [lineItems])

  const totalLineDiscount = useMemo(() => {
    return lineItems.reduce((acc, item) => acc + (item.discountAmount || 0), 0)
  }, [lineItems])

  const quotationDiscountAmount = useMemo(() => {
    const base = Math.max(0, subtotal - totalLineDiscount)
    if (discountType === 'percentage') {
      return (base * (discountValue || 0)) / 100
    }
    return Math.min(base, discountValue || 0)
  }, [subtotal, totalLineDiscount, discountType, discountValue])

  const totalDiscount = totalLineDiscount + quotationDiscountAmount

  // Per-line proportional calculation of GST
  const { totalTax, totalCgst, totalSgst, grandTotal } = useMemo(() => {
    let taxSum = 0
    let cgstSum = 0
    let sgstSum = 0
    const taxableBase = Math.max(0, subtotal - totalDiscount)

    lineItems.forEach((item) => {
      const lineSubtotal = Math.max(0, item.unitPrice * item.quantity - (item.discountAmount || 0))
      // Apportion quotation discount
      const share = subtotal > 0 ? lineSubtotal / subtotal : 0
      const apportionedDisc = quotationDiscountAmount * share
      const netTaxable = Math.max(0, lineSubtotal - apportionedDisc)
      const lineTax = netTaxable * (item.taxRate || 0.18)
      taxSum += lineTax
      cgstSum += lineTax / 2
      sgstSum += lineTax / 2
    })

    return {
      totalTax: Math.round(taxSum * 100) / 100,
      totalCgst: Math.round(cgstSum * 100) / 100,
      totalSgst: Math.round(sgstSum * 100) / 100,
      grandTotal: Math.round((taxableBase + taxSum) * 100) / 100,
    }
  }, [subtotal, lineItems, totalDiscount, quotationDiscountAmount])

  // Handlers for Line Items
  const handleAddServiceLine = (service: Service) => {
    const defaultStaff = activeStaff[0]
    const newItem: QuotationItem = {
      itemType: 'service',
      serviceId: service.id,
      staffId: defaultStaff?.id,
      staffName: defaultStaff?.name,
      name: service.name,
      description: service.description || service.name,
      quantity: 1,
      unitPrice: service.price,
      discountAmount: 0,
      taxableAmount: service.price,
      taxRate: 0.18,
      taxAmount: service.price * 0.18,
      totalPrice: service.price * 1.18,
      sortOrder: lineItems.length,
    }
    setLineItems([...lineItems, newItem])
    setItemSearchMode(null)
  }

  const handleAddProductLine = (name: string, price: number, sku?: string) => {
    const newItem: QuotationItem = {
      itemType: 'product',
      productId: sku || `sku-${Date.now()}`,
      name: name,
      description: `Retail Product SKU: ${sku || 'Retail'}`,
      quantity: 1,
      unitPrice: price,
      discountAmount: 0,
      taxableAmount: price,
      taxRate: 0.18,
      taxAmount: price * 0.18,
      totalPrice: price * 1.18,
      sortOrder: lineItems.length,
    }
    setLineItems([...lineItems, newItem])
    setItemSearchMode(null)
  }

  const handleAddCustomLine = () => {
    const newItem: QuotationItem = {
      itemType: 'custom',
      isCustom: true,
      name: 'Custom Service / Treatment',
      description: 'Special bespoke styling or customized bridal package',
      quantity: 1,
      unitPrice: 1000,
      discountAmount: 0,
      taxableAmount: 1000,
      taxRate: 0.18,
      taxAmount: 180,
      totalPrice: 1180,
      sortOrder: lineItems.length,
    }
    setLineItems([...lineItems, newItem])
  }

  const handleUpdateLine = (index: number, updates: Partial<QuotationItem>) => {
    setLineItems((prev) => {
      const copy = [...prev]
      const current = { ...copy[index], ...updates }
      const lineSub = Math.max(0, current.unitPrice * current.quantity - (current.discountAmount || 0))
      current.taxableAmount = lineSub
      current.taxAmount = lineSub * (current.taxRate || 0.18)
      current.totalPrice = lineSub + current.taxAmount
      copy[index] = current
      return copy
    })
  }

  const handleRemoveLine = (index: number) => {
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Discount Security Gate
  const discountPercent = useMemo(() => {
    if (subtotal <= 0) return 0
    if (discountType === 'percentage') return discountValue
    return (quotationDiscountAmount / subtotal) * 100
  }, [subtotal, discountType, discountValue, quotationDiscountAmount])

  const isDiscountOverThreshold = discountPercent > 10.01

  const handleApplyDiscountWithAuthCheck = () => {
    if (isDiscountOverThreshold && userRole !== 'OWNER' && !authorizationGrantId) {
      setIsOwnerAuthModalOpen(true)
    }
  }

  // Submission Handler
  const handleSaveQuotation = async (shareImmediately: boolean = false) => {
    if (lineItems.length === 0) {
      setErrorMessage('Please add at least one line item to the quotation')
      return
    }

    if (!isWalkIn && !selectedClient) {
      setErrorMessage('Please select an existing customer or switch to Walk-in Guest')
      return
    }

    if (isDiscountOverThreshold && userRole !== 'OWNER' && !authorizationGrantId) {
      setIsOwnerAuthModalOpen(true)
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const clientName = isWalkIn ? walkInName : selectedClient?.name || 'Customer'
      const clientPhone = isWalkIn ? walkInPhone : selectedClient?.phone
      const clientEmail = isWalkIn ? walkInEmail : selectedClient?.email

      const created = await quotationService.createQuotation({
        clientId: isWalkIn ? undefined : selectedClient?.id,
        clientName,
        clientPhone,
        clientEmail,
        isWalkIn,
        issueDate,
        validUntil,
        subtotal,
        discountAmount: totalDiscount,
        discountType,
        discountValue,
        discountReason,
        authorizationGrantId,
        taxTreatment: 'exclusive',
        taxRate: 0.18,
        taxAmount: totalTax,
        cgstAmount: totalCgst,
        sgstAmount: totalSgst,
        totalAmount: grandTotal,
        customerNotes,
        internalNotes,
        termsAndConditions,
        advanceRequired,
        estimatedDurationMinutes: estimatedDuration,
        lineItems,
      })

      if (shareImmediately) {
        setCreatedQuotationForShare(created)
      } else {
        if (onNavigate) {
          onNavigate('billing/estimates')
        } else if (onCancel) {
          onCancel()
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to create quotation')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="new-quotation-view">
      {/* Top Header */}
      <div className="quote-header-bar">
        <div>
          <h1 className="quote-page-title">Create Quotation & Estimate</h1>
          <p className="quote-page-subtitle">
            Prepare an itemized, luxury salon estimate with custom line items, stylist allocations, and vector PDF sharing.
          </p>
        </div>
        <div className="quote-header-actions">
          <button
            type="button"
            className="btn-quote-secondary"
            onClick={() => (onCancel ? onCancel() : onNavigate?.('billing/estimates'))}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-quote-save"
            onClick={() => handleSaveQuotation(false)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Save as Draft'}
          </button>
          <button
            type="button"
            className="btn-quote-share"
            onClick={() => handleSaveQuotation(true)}
            disabled={isSubmitting}
          >
            <ShareIcon size={16} />
            <span>Save & Share Link</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="quote-error-banner">
          <AlertTriangleIcon size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Grid: Left Builder (65%), Right Summary & Notes (35%) */}
      <div className="quote-builder-grid">
        {/* Left Column */}
        <div className="builder-main-col">
          {/* 1. Customer Selection Card */}
          <div className="quote-card">
            <div className="quote-card-header">
              <span className="card-step-badge">1</span>
              <h3 className="card-title">Customer Details</h3>
              <label className="walk-in-checkbox-label">
                <input
                  type="checkbox"
                  checked={isWalkIn}
                  onChange={(e) => {
                    setIsWalkIn(e.target.checked)
                    if (e.target.checked) setSelectedClient(null)
                  }}
                />
                <span>Walk-in Guest</span>
              </label>
            </div>

            <div className="quote-card-body">
              {isWalkIn ? (
                <div className="walk-in-fields-grid">
                  <div>
                    <label className="field-lbl">Guest Name</label>
                    <input
                      type="text"
                      className="field-txt"
                      value={walkInName}
                      onChange={(e) => setWalkInName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-lbl">Phone Number (Optional)</label>
                    <input
                      type="tel"
                      className="field-txt"
                      placeholder="e.g. 9876543210"
                      value={walkInPhone}
                      onChange={(e) => setWalkInPhone(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="field-lbl">Email Address (Optional)</label>
                    <input
                      type="email"
                      className="field-txt"
                      placeholder="guest@example.com"
                      value={walkInEmail}
                      onChange={(e) => setWalkInEmail(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="client-search-wrapper">
                  {selectedClient ? (
                    <div className="selected-client-badge">
                      <div>
                        <strong>{selectedClient.name}</strong>
                        <span className="client-contact-sub">
                          {selectedClient.phone} {selectedClient.email ? `• ${selectedClient.email}` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn-client-remove"
                        onClick={() => setSelectedClient(null)}
                      >
                        <CloseIcon size={16} />
                      </button>
                    </div>
                  ) : (
                    <div className="search-input-box">
                      <SearchIcon size={16} className="search-icon-left" />
                      <input
                        type="text"
                        className="client-search-input"
                        placeholder="Search existing customer by name, mobile, or email..."
                        value={clientSearchQuery}
                        onChange={(e) => {
                          setClientSearchQuery(e.target.value)
                          setIsClientSearchOpen(true)
                        }}
                        onFocus={() => setIsClientSearchOpen(true)}
                      />
                      <button
                        type="button"
                        className="btn-quick-new-client"
                        onClick={() => setIsQuickClientModalOpen(true)}
                      >
                        <PlusIcon size={14} />
                        <span>New Client</span>
                      </button>

                      {isClientSearchOpen && (
                        <div className="client-dropdown-results">
                          {filteredClients.length > 0 ? (
                            filteredClients.map((client) => (
                              <div
                                key={client.id}
                                className="client-dropdown-item"
                                onClick={() => {
                                  setSelectedClient(client)
                                  setIsClientSearchOpen(false)
                                  setClientSearchQuery('')
                                }}
                              >
                                <span className="item-name">{client.name}</span>
                                <span className="item-phone">{client.phone}</span>
                              </div>
                            ))
                          ) : (
                            <div className="no-client-result">
                              <span>No matching clients.</span>
                              <button
                                type="button"
                                className="link-create-client"
                                onClick={() => {
                                  setIsClientSearchOpen(false)
                                  setIsQuickClientModalOpen(true)
                                }}
                              >
                                Add "{clientSearchQuery}" as new customer
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 2. Items & Pricing Card */}
          <div className="quote-card">
            <div className="quote-card-header">
              <span className="card-step-badge">2</span>
              <h3 className="card-title">Quotation Items & Services</h3>
              <div className="items-action-buttons">
                <button
                  type="button"
                  className="btn-add-item-service"
                  onClick={() => {
                    setItemSearchMode('service')
                    setItemSearchQuery('')
                  }}
                >
                  <ScissorsIcon size={14} />
                  <span>+ Add Service</span>
                </button>
                <button
                  type="button"
                  className="btn-add-item-product"
                  onClick={() => {
                    setItemSearchMode('product')
                    setItemSearchQuery('')
                  }}
                >
                  <PackageIcon size={14} />
                  <span>+ Add Product</span>
                </button>
                <button
                  type="button"
                  className="btn-add-item-custom"
                  onClick={handleAddCustomLine}
                >
                  <PlusIcon size={14} />
                  <span>+ Custom Line</span>
                </button>
              </div>
            </div>

            {/* Quick Picker Popover */}
            {itemSearchMode && (
              <div className="item-picker-popover">
                <div className="popover-header">
                  <span>
                    Select {itemSearchMode === 'service' ? 'Salon Service' : 'Retail Product'}
                  </span>
                  <button type="button" onClick={() => setItemSearchMode(null)}>
                    <CloseIcon size={16} />
                  </button>
                </div>
                <input
                  type="text"
                  className="popover-search-input"
                  placeholder={`Search ${itemSearchMode === 'service' ? 'services' : 'products'}...`}
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  autoFocus
                />
                <div className="popover-list">
                  {itemSearchMode === 'service'
                    ? allServices
                        .filter((s) => s.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                        .map((srv) => (
                          <div
                            key={srv.id}
                            className="popover-item"
                            onClick={() => handleAddServiceLine(srv)}
                          >
                            <span className="p-name">{srv.name}</span>
                            <span className="p-cat">{srv.category}</span>
                            <span className="p-price">₹{srv.price}</span>
                          </div>
                        ))
                    : [
                        { name: 'Kérastase Nutritive Shampoo 250ml', price: 2800, sku: 'KER-NUT-01' },
                        { name: "L'Oréal Professionnel Absolut Repair Mask", price: 1250, sku: 'LOR-ABS-02' },
                        { name: 'Olaplex No. 3 Hair Perfector 100ml', price: 3200, sku: 'OLA-03' },
                        { name: 'Moroccanoil Treatment Original 100ml', price: 3800, sku: 'MOR-OIL-01' },
                      ]
                        .filter((p) => p.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                        .map((prod) => (
                          <div
                            key={prod.sku}
                            className="popover-item"
                            onClick={() => handleAddProductLine(prod.name, prod.price, prod.sku)}
                          >
                            <span className="p-name">{prod.name}</span>
                            <span className="p-cat">Retail SKU: {prod.sku}</span>
                            <span className="p-price">₹{prod.price}</span>
                          </div>
                        ))}
                </div>
              </div>
            )}

            {/* Items Table */}
            <div className="quote-items-table-wrap">
              {lineItems.length === 0 ? (
                <div className="empty-items-state">
                  <FileTextIcon size={32} className="empty-icon" />
                  <p>No line items added yet. Click "+ Add Service", "+ Add Product", or "+ Custom Line" above.</p>
                </div>
              ) : (
                <table className="quote-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: '32%' }}>Item / Treatment</th>
                      <th style={{ width: '22%' }}>Stylist</th>
                      <th style={{ width: '10%' }} className="text-center">Qty</th>
                      <th style={{ width: '14%' }} className="text-right">Unit Price</th>
                      <th style={{ width: '12%' }} className="text-right">Line Disc.</th>
                      <th style={{ width: '10%' }} className="text-right">Total</th>
                      <th style={{ width: '5%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((item, idx) => (
                      <tr key={idx} className={item.isCustom ? 'custom-row' : ''}>
                        <td>
                          {item.isCustom ? (
                            <div>
                              <input
                                type="text"
                                className="item-name-input"
                                value={item.name}
                                onChange={(e) => handleUpdateLine(idx, { name: e.target.value })}
                                placeholder="Custom item title"
                              />
                              <input
                                type="text"
                                className="item-desc-input"
                                value={item.description || ''}
                                onChange={(e) => handleUpdateLine(idx, { description: e.target.value })}
                                placeholder="Custom description"
                              />
                            </div>
                          ) : (
                            <div>
                              <strong>{item.name}</strong>
                              <span className="item-type-pill">{item.itemType}</span>
                              {item.description && <div className="line-desc-sub">{item.description}</div>}
                            </div>
                          )}
                        </td>
                        <td>
                          {item.itemType === 'service' ? (
                            <select
                              className="stylist-select"
                              value={item.staffId || ''}
                              onChange={(e) => {
                                const st = activeStaff.find((s) => s.id === e.target.value)
                                handleUpdateLine(idx, { staffId: st?.id, staffName: st?.name })
                              }}
                            >
                              <option value="">Unassigned</option>
                              {activeStaff.map((st) => (
                                <option key={st.id} value={st.id}>
                                  {st.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <input
                            type="number"
                            min="1"
                            className="qty-input"
                            value={item.quantity}
                            onChange={(e) => handleUpdateLine(idx, { quantity: Number(e.target.value) || 1 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="price-input"
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateLine(idx, { unitPrice: Number(e.target.value) || 0 })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            className="disc-input"
                            value={item.discountAmount || 0}
                            onChange={(e) => handleUpdateLine(idx, { discountAmount: Number(e.target.value) || 0 })}
                          />
                        </td>
                        <td className="text-right bold gold">
                          ₹{Math.round(item.totalPrice).toLocaleString('en-IN')}
                        </td>
                        <td className="text-center">
                          <button
                            type="button"
                            className="btn-del-item"
                            onClick={() => handleRemoveLine(idx)}
                            aria-label="Remove item"
                          >
                            <TrashIcon size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Pricing & Policy Breakdown */}
        <div className="builder-side-col">
          {/* Validity & Terms Card */}
          <div className="quote-card">
            <h3 className="card-title">Validity & Policies</h3>
            <div className="dates-grid">
              <div>
                <label className="field-lbl">Issue Date</label>
                <input
                  type="date"
                  className="field-txt"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <label className="field-lbl">Valid Until</label>
                <input
                  type="date"
                  className="field-txt"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                />
              </div>
            </div>

            <div className="field-group-mt">
              <label className="field-lbl">Advance Payment Deposit (₹)</label>
              <input
                type="number"
                min="0"
                className="field-txt"
                placeholder="0.00"
                value={advanceRequired || ''}
                onChange={(e) => setAdvanceRequired(Number(e.target.value) || 0)}
              />
              <span className="field-hint">Optional advance requested upon appointment booking</span>
            </div>

            <div className="field-group-mt">
              <label className="field-lbl">Estimated Duration (Minutes)</label>
              <input
                type="number"
                min="15"
                step="15"
                className="field-txt"
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(Number(e.target.value) || 60)}
              />
            </div>

            <div className="field-group-mt">
              <label className="field-lbl">Customer Notes (Printed on PDF)</label>
              <textarea
                className="field-textarea"
                rows={2}
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
              />
            </div>

            <div className="field-group-mt">
              <label className="field-lbl">Terms & Salon Policy</label>
              <textarea
                className="field-textarea"
                rows={2}
                value={termsAndConditions}
                onChange={(e) => setTermsAndConditions(e.target.value)}
              />
            </div>

            <div className="field-group-mt">
              <div className="internal-notes-header">
                <ShieldCheckIcon size={14} className="gold" />
                <label className="field-lbl bold">Internal Notes (Private / Not Shared)</label>
              </div>
              <textarea
                className="field-textarea internal"
                rows={2}
                placeholder="Internal salon notes, client history notes (never exposed on PDF or public portal)..."
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Totals & Discounts Card */}
          <div className="quote-card">
            <h3 className="card-title">Financial Summary</h3>
            <div className="financial-rows">
              <div className="f-row">
                <span>Subtotal:</span>
                <span>{formatPdfCurrency(subtotal)}</span>
              </div>

              {totalLineDiscount > 0 && (
                <div className="f-row text-red">
                  <span>Line Item Discounts:</span>
                  <span>-{formatPdfCurrency(totalLineDiscount)}</span>
                </div>
              )}

              {/* Quotation Level Discount */}
              <div className="discount-control-box">
                <div className="disc-control-header">
                  <span>Quotation Discount:</span>
                  <div className="disc-type-toggles">
                    <button
                      type="button"
                      className={`btn-type-toggle ${discountType === 'flat' ? 'active' : ''}`}
                      onClick={() => setDiscountType('flat')}
                    >
                      ₹ Flat
                    </button>
                    <button
                      type="button"
                      className={`btn-type-toggle ${discountType === 'percentage' ? 'active' : ''}`}
                      onClick={() => setDiscountType('percentage')}
                    >
                      %
                    </button>
                  </div>
                </div>

                <div className="disc-inputs-row">
                  <input
                    type="number"
                    min="0"
                    className="field-txt disc-val-txt"
                    placeholder={discountType === 'flat' ? '₹ Discount' : '% Discount'}
                    value={discountValue || ''}
                    onChange={(e) => {
                      setDiscountValue(Number(e.target.value) || 0)
                      setAuthorizationGrantId(undefined)
                    }}
                    onBlur={handleApplyDiscountWithAuthCheck}
                  />
                  <input
                    type="text"
                    className="field-txt disc-reason-txt"
                    placeholder="Reason (e.g. Bridal Promo)"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                  />
                </div>

                {isDiscountOverThreshold && (
                  <div className="auth-alert-banner">
                    {authorizationGrantId ? (
                      <span className="auth-approved">
                        <ShieldCheckIcon size={14} />
                        Authorized by Owner ({authorizedBy})
                      </span>
                    ) : (
                      <div className="auth-needed">
                        <span>Discounts &gt; 10% require salon owner authorization.</span>
                        <button
                          type="button"
                          className="btn-trigger-owner-auth"
                          onClick={() => setIsOwnerAuthModalOpen(true)}
                        >
                          Request Approval
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="f-row">
                <span>Central GST (CGST 9%):</span>
                <span>{formatPdfCurrency(totalCgst)}</span>
              </div>
              <div className="f-row">
                <span>State GST (SGST 9%):</span>
                <span>{formatPdfCurrency(totalSgst)}</span>
              </div>

              <div className="f-row grand-total-row">
                <span className="g-total-lbl">ESTIMATED TOTAL:</span>
                <span className="g-total-val gold">{formatPdfCurrency(grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Owner Auth Modal for > 10% Discount */}
      <OwnerAuthModal
        isOpen={isOwnerAuthModalOpen}
        requestedDiscountPercent={discountPercent}
        requestedDiscountAmount={quotationDiscountAmount}
        subtotal={subtotal}
        onClose={() => setIsOwnerAuthModalOpen(false)}
        onAuthorized={(grantId, authorizingOwner) => {
          setAuthorizationGrantId(grantId)
          setAuthorizedBy(authorizingOwner)
          setIsOwnerAuthModalOpen(false)
        }}
      />

      {/* Quick Client Modal */}
      <QuickClientModal
        isOpen={isQuickClientModalOpen}
        onClose={() => setIsQuickClientModalOpen(false)}
        onClientCreated={(client) => {
          setSelectedClient(client)
          setIsWalkIn(false)
          setIsQuickClientModalOpen(false)
        }}
      />

      {/* Quotation Share Modal on Instant Save & Share */}
      {createdQuotationForShare && (
        <QuotationShareModal
          isOpen={true}
          quotation={createdQuotationForShare}
          onClose={() => {
            setCreatedQuotationForShare(null)
            if (onNavigate) onNavigate('billing/estimates')
            else if (onCancel) onCancel()
          }}
        />
      )}
    </div>
  )
}
