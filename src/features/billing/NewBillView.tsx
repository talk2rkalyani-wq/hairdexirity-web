import React, { useState, useEffect } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { Client, Staff, Appointment, Service } from '../../types/models.ts'
import type { InventoryProduct } from '../../types/inventory.ts'
import type { InvoiceLineItem, Invoice } from '../../types/finance.ts'
import { clientService } from '../../services/clientService.ts'
import { staffService } from '../../services/staffService.ts'
import { serviceService } from '../../services/serviceService.ts'
import { appointmentService } from '../../services/appointmentService.ts'
import { billingService, roundMoney } from '../../services/billingService.ts'
import { sessionService } from '../../services/sessionService.ts'
import { PosItemSelector } from './components/PosItemSelector.tsx'
import { PosCartTable } from './components/PosCartTable.tsx'
import { PosPaymentSummary, type FinalizeBillingPayload } from './components/PosPaymentSummary.tsx'
import { QuickClientModal } from './components/QuickClientModal.tsx'
import { InvoiceSuccessModal } from './components/InvoiceSuccessModal.tsx'
import {
  UsersIcon,
  CalendarIcon,
  PlusIcon,
  SearchIcon,
  CloseIcon,
  FileTextIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
} from '../../components/Icons.tsx'
import './NewBillView.css'

interface NewBillViewProps {
  onNavigate?: (navId: NavId) => void
}

export const NewBillView: React.FC<NewBillViewProps> = ({ onNavigate }) => {
  const currentSession = sessionService.getCurrentSession()
  const userRole = currentSession?.role || 'RECEPTIONIST'

  // Cart & Line Items
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])
  const [activeStaff, setActiveStaff] = useState<Staff[]>([])
  const [allServices, setAllServices] = useState<Service[]>([])

  // Client Selection State
  const [isWalkIn, setIsWalkIn] = useState<boolean>(true)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<Client[]>([])
  const [isClientSearchOpen, setIsClientSearchOpen] = useState(false)
  const [isQuickClientModalOpen, setIsQuickClientModalOpen] = useState(false)

  // Appointment Linking State
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([])
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string>('')

  // Draft & Submission State
  const [activeDraftId, setActiveDraftId] = useState<string | undefined>(undefined)
  const [currentDraftVersion, setCurrentDraftVersion] = useState<number | undefined>(undefined)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [successModalData, setSuccessModalData] = useState<{
    isOpen: boolean
    isDraft: boolean
    invoice: Invoice | null
    changeAmount?: number
  }>({
    isOpen: false,
    isDraft: false,
    invoice: null,
    changeAmount: 0,
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Load staff, services & today's appointments
  useEffect(() => {
    let mounted = true

    Promise.all([
      staffService.getActiveStaff(),
      serviceService.getServices(),
      appointmentService.getTodayAppointments(),
    ])
      .then(([staffList, srvList, appts]) => {
        if (!mounted) return
        setActiveStaff(staffList)
        setAllServices(srvList.filter((s) => s.active))
        setTodayAppointments(appts.filter((a) => a.status !== 'cancelled'))
      })
      .catch((err) => {
        console.error('Failed to initialize POS dependencies:', err)
      })

    return () => {
      mounted = false
    }
  }, [])

  // Check URL params for resuming draft (e.g. #/billing/new?draftId=draft-xxx)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      const match = hash.match(/draftId=([a-zA-Z0-9_-]+)/)
      if (match && match[1]) {
        const draft = billingService.getDraftById(match[1])
        if (draft) {
          setActiveDraftId(draft.id)
          setCurrentDraftVersion(draft.draftVersion || 1)
          setLineItems(draft.lineItems)
          if (draft.walkInGuest) {
            setIsWalkIn(true)
            setSelectedClient(null)
          } else if (draft.clientName) {
            setIsWalkIn(false)
            setSelectedClient({
              id: draft.clientId || 'client-temp',
              name: draft.clientName,
              phone: draft.clientPhone || '',
              email: draft.clientEmail || '',
              preferences: {},
              notes: '',
              createdAt: new Date().toISOString(),
              totalSpend: 0,
              salonId: draft.salonId,
            })
          }
          if (draft.appointmentId) {
            setLinkedAppointmentId(draft.appointmentId)
          }
        }
      }
    }
  }, [])

  // Handle Client Search
  useEffect(() => {
    const q = clientSearchQuery.trim()
    if (!q || isWalkIn) {
      setClientSearchResults([])
      return
    }

    let active = true
    clientService
      .searchClients(q)
      .then((results) => {
        if (active) {
          setClientSearchResults(results)
          setIsClientSearchOpen(results.length > 0)
        }
      })
      .catch(() => {
        if (active) setClientSearchResults([])
      })

    return () => {
      active = false
    }
  }, [clientSearchQuery, isWalkIn])

  // Select Client
  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    setIsWalkIn(false)
    setClientSearchQuery('')
    setIsClientSearchOpen(false)
  }

  // Handle Linking Appointment
  const handleAppointmentChange = (apptId: string) => {
    setLinkedAppointmentId(apptId)
    if (!apptId) return

    const appt = todayAppointments.find((a) => a.id === apptId)
    if (!appt) return

    // Set client details if available
    if (appt.clientId) {
      clientService.getClientById(appt.clientId).then((c) => {
        if (c) {
          setSelectedClient(c)
          setIsWalkIn(false)
        } else if (appt.clientName) {
          setSelectedClient({
            id: appt.clientId,
            name: appt.clientName,
            phone: appt.clientPhone || '',
            email: '',
            preferences: {},
            notes: '',
            createdAt: new Date().toISOString(),
            totalSpend: 0,
            salonId: appt.salonId,
          })
          setIsWalkIn(false)
        }
      })
    }

    // Auto-populate service from appointment if not already in cart
    const matchingService = allServices.find((s) => s.id === appt.serviceId)
    const matchingStaff = activeStaff.find((st) => st.id === appt.staffId)

    const serviceName = matchingService ? matchingService.name : 'Salon Service'
    const unitPrice = matchingService ? matchingService.price : appt.price || 500

    setLineItems((prev) => {
      // Check if this appointment service is already added
      const exists = prev.some((item) => item.serviceId === appt.serviceId)
      if (exists) return prev

      const newLineItem: InvoiceLineItem = {
        description: serviceName,
        name: serviceName,
        quantity: 1,
        unitPrice,
        totalPrice: unitPrice,
        total: unitPrice,
        lineTotal: unitPrice,
        itemType: 'service',
        serviceId: appt.serviceId,
        staffId: appt.staffId,
        staffName: matchingStaff ? matchingStaff.name : undefined,
      }
      return [newLineItem, ...prev]
    })
  }

  // Add Service to Cart
  const handleAddService = (service: Service) => {
    setLineItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.itemType === 'service' && item.serviceId === service.id
      )

      if (existingIndex > -1) {
        const updated = [...prev]
        const current = updated[existingIndex]
        const newQty = current.quantity + 1
        const lineTotal = roundMoney(current.unitPrice * newQty - (current.discountAmount || 0))
        updated[existingIndex] = {
          ...current,
          quantity: newQty,
          totalPrice: roundMoney(current.unitPrice * newQty),
          total: roundMoney(current.unitPrice * newQty),
          lineTotal: Math.max(0, lineTotal),
        }
        return updated
      }

      // Default staff if only one exists or leave for manual selection
      const defaultStaff = activeStaff.length === 1 ? activeStaff[0] : undefined

      const newItem: InvoiceLineItem = {
        description: service.name,
        name: service.name,
        quantity: 1,
        unitPrice: service.price,
        totalPrice: service.price,
        total: service.price,
        lineTotal: service.price,
        itemType: 'service',
        serviceId: service.id,
        staffId: defaultStaff?.id,
        staffName: defaultStaff?.name,
      }
      return [...prev, newItem]
    })
  }

  // Add Product to Cart
  const handleAddProduct = (product: InventoryProduct) => {
    setLineItems((prev) => {
      const existingIndex = prev.findIndex(
        (item) => item.itemType === 'product' && item.productId === product.id
      )

      if (existingIndex > -1) {
        const current = prev[existingIndex]
        if (current.quantity >= product.currentStock) {
          // Cannot exceed available inventory
          return prev
        }
        const updated = [...prev]
        const newQty = current.quantity + 1
        const lineTotal = roundMoney(current.unitPrice * newQty - (current.discountAmount || 0))
        updated[existingIndex] = {
          ...current,
          quantity: newQty,
          totalPrice: roundMoney(current.unitPrice * newQty),
          total: roundMoney(current.unitPrice * newQty),
          lineTotal: Math.max(0, lineTotal),
        }
        return updated
      }

      const newItem: InvoiceLineItem = {
        description: `${product.brand} - ${product.name}`,
        name: `${product.brand} - ${product.name}`,
        quantity: 1,
        unitPrice: product.sellingPrice,
        totalPrice: product.sellingPrice,
        total: product.sellingPrice,
        lineTotal: product.sellingPrice,
        itemType: 'product',
        productId: product.id,
      }
      return [...prev, newItem]
    })
  }

  // Update Cart Item Quantity
  const handleUpdateQuantity = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemoveItem(index)
      return
    }

    setLineItems((prev) => {
      const updated = [...prev]
      const current = updated[index]
      if (!current) return prev

      const lineTotal = roundMoney(current.unitPrice * newQty - (current.discountAmount || 0))
      updated[index] = {
        ...current,
        quantity: newQty,
        totalPrice: roundMoney(current.unitPrice * newQty),
        total: roundMoney(current.unitPrice * newQty),
        lineTotal: Math.max(0, lineTotal),
      }
      return updated
    })
  }

  // Update Cart Item Stylist
  const handleUpdateStylist = (index: number, staffId: string, staffName: string) => {
    setLineItems((prev) => {
      const updated = [...prev]
      if (updated[index]) {
        updated[index] = {
          ...updated[index],
          staffId: staffId || undefined,
          staffName: staffName || undefined,
        }
      }
      return updated
    })
  }

  // Update Cart Line Discount
  const handleUpdateDiscount = (index: number, discountAmount: number) => {
    setLineItems((prev) => {
      const updated = [...prev]
      const current = updated[index]
      if (!current) return prev

      const lineTotal = roundMoney(current.unitPrice * current.quantity - discountAmount)
      updated[index] = {
        ...current,
        discountAmount,
        totalPrice: current.totalPrice || roundMoney(current.unitPrice * current.quantity),
        lineTotal: Math.max(0, lineTotal),
      }
      return updated
    })
  }

  // Remove Item from Cart
  const handleRemoveItem = (index: number) => {
    setLineItems((prev) => prev.filter((_, idx) => idx !== index))
  }

  // Clear Cart
  const handleClearCart = () => {
    setLineItems([])
  }

  // Reset Entire POS Form
  const handleResetPos = () => {
    setLineItems([])
    setIsWalkIn(true)
    setSelectedClient(null)
    setLinkedAppointmentId('')
    setActiveDraftId(undefined)
    setCurrentDraftVersion(undefined)
    setConflictMessage(null)
    setErrorMessage(null)
    setSuccessModalData({ isOpen: false, isDraft: false, invoice: null })
  }

  // Refresh Draft after Concurrency Conflict
  const handleRefreshDraft = async () => {
    if (!activeDraftId) return
    setIsSaving(true)
    try {
      const drafts = await billingService.fetchDraftsAsync()
      const serverDraft = drafts.find((d) => d.id === activeDraftId)
      if (serverDraft) {
        setLineItems(serverDraft.lineItems || [])
        setCurrentDraftVersion(serverDraft.draftVersion || 1)
        setConflictMessage(null)
        setErrorMessage(null)
      } else {
        setErrorMessage('Draft could not be found on the server. It may have been finalized or deleted.')
      }
    } catch (e: any) {
      setErrorMessage(`Failed to refresh draft: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // 1. Save Draft Handler (Phase 2.2 P1: Optimistic Concurrency Control)
  const handleSaveDraft = async (payload: FinalizeBillingPayload) => {
    setIsSaving(true)
    setErrorMessage(null)
    setConflictMessage(null)
    try {
      const clientName = isWalkIn
        ? 'Walk-in Guest'
        : selectedClient
        ? selectedClient.name
        : 'Walk-in Guest'

      const draftInvoice = await billingService.saveDraft({
        draftId: activeDraftId,
        clientId: selectedClient?.id,
        clientName,
        clientPhone: selectedClient?.phone,
        clientEmail: selectedClient?.email,
        appointmentId: linkedAppointmentId || undefined,
        subtotal: payload.subtotal,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        discountAmount: payload.discountAmount,
        isGstInvoice: payload.isGstInvoice,
        taxRate: payload.taxRate,
        taxTreatment: payload.taxTreatment,
        paymentMethod: payload.paymentMethod,
        paidAmount: payload.paidAmount,
        transactionRef: payload.transactionRef,
        lineItems,
        notes: payload.notes,
        walkInGuest: isWalkIn,
        authorizedBy: payload.authorizedBy,
        authorizationGrantId: payload.authorizationGrantId,
        draftVersion: currentDraftVersion,
        expectedDraftVersion: currentDraftVersion,
      })

      setActiveDraftId(draftInvoice.id)
      setCurrentDraftVersion(draftInvoice.draftVersion || 1)
      setSuccessModalData({
        isOpen: true,
        isDraft: true,
        invoice: draftInvoice,
      })
    } catch (err: any) {
      if (
        err.name === 'StaleDraftError' ||
        err.code === 'STALE_DRAFT_CONFLICT' ||
        err.message?.includes('CONCURRENCY_CONFLICT')
      ) {
        setConflictMessage(
          'This draft was updated elsewhere. Your changes have not been saved. Refresh the draft before continuing.'
        )
      } else {
        setErrorMessage(`Failed to save draft: ${err.message || 'Unknown error'}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // 2. Finalize Invoice Handler (Phase 2.2 P0 & P1)
  const handleFinalizeInvoice = async (payload: FinalizeBillingPayload) => {
    setIsSaving(true)
    setErrorMessage(null)
    setConflictMessage(null)
    try {
      const clientName = isWalkIn
        ? 'Walk-in Guest'
        : selectedClient
        ? selectedClient.name
        : 'Walk-in Guest'

      // Map payment splits if split tender was selected
      const paymentsPayload =
        payload.paymentSplits && payload.paymentSplits.length > 0
          ? payload.paymentSplits
              .filter((s) => s.amount > 0)
              .map((s) => ({
                method: s.method,
                amount: s.amount,
                transactionReference: s.reference || payload.transactionRef,
              }))
          : undefined

      const finalizedInvoice = await billingService.createInvoice({
        draftId: activeDraftId,
        clientId: selectedClient?.id,
        clientName,
        clientPhone: selectedClient?.phone,
        clientEmail: selectedClient?.email,
        appointmentId: linkedAppointmentId || undefined,
        subtotal: payload.subtotal,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        discountAmount: payload.discountAmount,
        isGstInvoice: payload.isGstInvoice,
        taxRate: payload.taxRate,
        taxTreatment: payload.taxTreatment,
        paymentMethod: payload.paymentMethod,
        primaryPaymentMethod: payload.paymentMethod,
        paidAmount: payload.paidAmount,
        transactionRef: payload.transactionRef,
        paymentSplits: payload.paymentSplits,
        payments: paymentsPayload,
        lineItems,
        notes: payload.notes,
        walkInGuest: isWalkIn,
        authorizedBy: payload.authorizedBy,
        authorizationGrantId: payload.authorizationGrantId,
        draftVersion: currentDraftVersion,
        expectedDraftVersion: currentDraftVersion,
      })

      // If linked appointment exists, mark as completed
      if (linkedAppointmentId) {
        try {
          await appointmentService.updateAppointmentStatus(linkedAppointmentId, 'completed')
        } catch (apptErr) {
          console.warn('Could not update appointment status automatically:', apptErr)
        }
      }

      setSuccessModalData({
        isOpen: true,
        isDraft: false,
        invoice: finalizedInvoice,
        changeAmount: payload.cashChange,
      })
      setActiveDraftId(undefined)
      setCurrentDraftVersion(undefined)
    } catch (err: any) {
      console.error('[POS Finalize Error]', err)
      if (
        err.name === 'StaleDraftError' ||
        err.code === 'STALE_DRAFT_CONFLICT' ||
        err.message?.includes('CONCURRENCY_CONFLICT')
      ) {
        setConflictMessage(
          'This draft was updated elsewhere. Your changes have not been saved. Refresh the draft before continuing.'
        )
      } else {
        setErrorMessage(err.message || 'Invoice finalization failed. Cart has been preserved.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="pos-screen-layout">
      {/* Header Bar */}
      <header className="pos-top-header">
        <div className="header-meta-left">
          <div className="screen-title-wrap">
            <h2 className="pos-screen-title">Salon Billing POS</h2>
            {activeDraftId && (
              <span className="resuming-draft-badge">
                <FileTextIcon size={12} /> Editing Draft
              </span>
            )}
          </div>
          <span className="pos-date-time">
            {new Date().toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Customer & Appointment Controls */}
        <div className="header-controls-right">
          {/* Walk-in vs Registered Client Selector */}
          <div className="customer-selection-wrap">
            <div className="walkin-toggle-btn-group">
              <button
                type="button"
                className={`walkin-btn ${isWalkIn ? 'active' : ''}`}
                onClick={() => {
                  setIsWalkIn(true)
                  setSelectedClient(null)
                  setClientSearchQuery('')
                }}
              >
                Walk-in Guest
              </button>
              <button
                type="button"
                className={`walkin-btn ${!isWalkIn ? 'active' : ''}`}
                onClick={() => setIsWalkIn(false)}
              >
                Registered Client
              </button>
            </div>

            {!isWalkIn && (
              <div className="client-search-wrapper">
                {selectedClient ? (
                  <div className="selected-client-badge">
                    <UsersIcon size={14} className="user-icon" />
                    <span className="client-name">{selectedClient.name}</span>
                    {selectedClient.phone && (
                      <span className="client-phone">({selectedClient.phone})</span>
                    )}
                    <button
                      type="button"
                      className="btn-clear-client"
                      onClick={() => setSelectedClient(null)}
                      title="Clear selected client"
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="search-autocomplete-box">
                    <SearchIcon size={14} className="search-icon" />
                    <input
                      type="text"
                      className="client-search-input"
                      placeholder="Search client by name or phone..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                    />
                    {isClientSearchOpen && (
                      <div className="client-dropdown-results">
                        {clientSearchResults.map((client) => (
                          <div
                            key={client.id}
                            className="client-result-item"
                            onClick={() => handleSelectClient(client)}
                          >
                            <span className="item-name">{client.name}</span>
                            <span className="item-phone">{client.phone}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-quick-add-client"
                  onClick={() => setIsQuickClientModalOpen(true)}
                  title="Quick add new client"
                >
                  <PlusIcon size={14} />
                  <span>New</span>
                </button>
              </div>
            )}
          </div>

          {/* Appointment Linking Dropdown */}
          <div className="appointment-link-wrap">
            <CalendarIcon size={16} className="appt-icon" />
            <select
              className="appt-select"
              value={linkedAppointmentId}
              onChange={(e) => handleAppointmentChange(e.target.value)}
            >
              <option value="">-- Link Appointment (Optional) --</option>
              {todayAppointments.map((appt) => (
                <option key={appt.id} value={appt.id}>
                  {appt.clientName || 'Guest'} ({appt.startTime}) - {appt.status.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Stale Draft Concurrency Conflict Banner (Phase 2.2 P1) */}
      {conflictMessage && (
        <div
          className="pos-concurrency-alert"
          style={{
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '12px 24px 0 24px',
            color: '#fcd34d',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangleIcon size={18} />
            <span>{conflictMessage}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handleRefreshDraft}
              disabled={isSaving}
              style={{
                background: '#d97706',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCwIcon size={14} />
              <span>Refresh Draft</span>
            </button>
            <button
              onClick={() => setConflictMessage(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#fcd34d',
                cursor: 'pointer',
                fontWeight: 'bold',
                padding: '0 4px',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Persistence Error Banner */}
      {errorMessage && (
        <div
          className="pos-error-banner"
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: '8px',
            padding: '12px 16px',
            margin: '12px 24px 0 24px',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '14px',
          }}
        >
          <span><strong>Persistence Error:</strong> {errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontWeight: 'bold',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Dual-Column POS Workspace */}
      <main className="pos-main-workspace">
        {/* Left Column: Item Selector (Services + Retail Products) */}
        <section className="pos-column-left">
          <PosItemSelector
            onAddService={handleAddService}
            onAddProduct={handleAddProduct}
            cartItems={lineItems}
          />
        </section>

        {/* Right Column: Cart Table + Settlement Summary */}
        <section className="pos-column-right">
          <div className="cart-pane-top">
            <PosCartTable
              lineItems={lineItems}
              activeStaff={activeStaff}
              onUpdateQuantity={handleUpdateQuantity}
              onUpdateStylist={handleUpdateStylist}
              onUpdateDiscount={handleUpdateDiscount}
              onRemoveItem={handleRemoveItem}
              onClearCart={handleClearCart}
            />
          </div>

          <div className="summary-pane-bottom">
            <PosPaymentSummary
              lineItems={lineItems}
              userRole={userRole}
              onSaveDraft={handleSaveDraft}
              onFinalizeInvoice={handleFinalizeInvoice}
              isSaving={isSaving}
              initialDraftData={
                activeDraftId
                  ? {
                      draftVersion: currentDraftVersion,
                    }
                  : undefined
              }
            />
          </div>
        </section>
      </main>

      {/* Quick Customer Modal */}
      <QuickClientModal
        isOpen={isQuickClientModalOpen}
        onClose={() => setIsQuickClientModalOpen(false)}
        onClientCreated={(newClient) => {
          setSelectedClient(newClient)
          setIsWalkIn(false)
        }}
      />

      {/* Invoice Success & Settlement Modal */}
      <InvoiceSuccessModal
        isOpen={successModalData.isOpen}
        isDraft={successModalData.isDraft}
        invoice={successModalData.invoice}
        draftNumber={successModalData.invoice?.invoiceNumber}
        changeAmount={successModalData.changeAmount}
        onClose={() => setSuccessModalData({ isOpen: false, isDraft: false, invoice: null })}
        onNewBill={handleResetPos}
        onViewOverview={() => {
          setSuccessModalData({ isOpen: false, isDraft: false, invoice: null })
          if (onNavigate) {
            onNavigate('billing/overview')
          } else if (typeof window !== 'undefined') {
            window.location.hash = '#/billing/overview'
          }
        }}
      />
    </div>
  )
}
