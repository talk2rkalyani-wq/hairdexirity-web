// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 3
// Invoice History Register View (`billing/invoices`)
// Comprehensive Commercial Invoice History, Filtering, Search & Export Actions
// ==============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { Invoice } from '../../types/finance.ts'
import { billingService } from '../../services/billingService.ts'
import { downloadInvoicePdf } from '../../services/pdfService.ts'
import { InvoiceShareModal } from './components/InvoiceShareModal.tsx'
import { InvoicePreviewModal } from './components/InvoicePreviewModal.tsx'
import {
  FileTextIcon,
  SearchIcon,
  RefreshCwIcon,
  DownloadIcon,
  ShareIcon,
  EyeIcon,
  UsersIcon,
  PlusIcon,
} from '../../components/Icons.tsx'
import './InvoiceHistoryView.css'

interface InvoiceHistoryViewProps {
  onNavigate?: (navId: NavId) => void
}

export const InvoiceHistoryView: React.FC<InvoiceHistoryViewProps> = ({ onNavigate }) => {
  const [invoices, setInvoices] = useState<Invoice[]>(() => billingService.getAllInvoices())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'partial' | 'unpaid'>('all')
  const [tenderFilter, setTenderFilter] = useState<string>('all')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const [selectedInvoiceForShare, setSelectedInvoiceForShare] = useState<Invoice | null>(null)
  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<Invoice | null>(null)

  useEffect(() => {
    billingService.fetchInvoicesAsync().catch(console.warn)

    const unsubscribe = billingService.subscribe(() => {
      setInvoices(billingService.getAllInvoices())
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await billingService.fetchInvoicesAsync()
    } catch (err) {
      console.warn('Invoice refresh error:', err)
    } finally {
      setInvoices(billingService.getAllInvoices())
      setIsRefreshing(false)
    }
  }

  // Filter invoices based on search and pills
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesNum = inv.invoiceNumber.toLowerCase().includes(q)
        const matchesClient = (inv.clientName || '').toLowerCase().includes(q)
        const matchesPhone = (inv.clientPhone || '').includes(q)
        if (!matchesNum && !matchesClient && !matchesPhone) return false
      }

      // 2. Status Filter
      if (statusFilter !== 'all') {
        const status = inv.status || inv.paymentStatus || 'paid'
        if (statusFilter === 'paid' && status !== 'paid') return false
        if (statusFilter === 'partial' && status !== 'partial' && status !== 'partially_paid') return false
        if (statusFilter === 'unpaid' && status !== 'unpaid') return false
      }

      // 3. Tender Filter
      if (tenderFilter !== 'all') {
        const tender = inv.paymentMethod || inv.primaryPaymentMethod || 'cash'
        if (tender !== tenderFilter) return false
      }

      return true
    })
  }, [invoices, searchQuery, statusFilter, tenderFilter])

  // Summary Metrics
  const totalBilled = useMemo(() => {
    return filteredInvoices.reduce((acc, i) => acc + (i.totalAmount || 0), 0)
  }, [filteredInvoices])

  const totalCollected = useMemo(() => {
    return filteredInvoices.reduce((acc, i) => acc + (i.paidAmount || 0), 0)
  }, [filteredInvoices])

  const totalReceivables = useMemo(() => {
    return filteredInvoices.reduce((acc, i) => acc + (i.balanceDue || 0), 0)
  }, [filteredInvoices])

  return (
    <div className="invoice-history-view-container">
      {/* Header Bar */}
      <div className="history-header-bar">
        <div className="header-meta">
          <div className="title-row">
            <FileTextIcon size={22} className="title-icon" />
            <h2 className="screen-title">Invoice History Register</h2>
          </div>
          <span className="screen-subtext">
            Official commercial and tax invoice records archive
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-refresh-history"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh database records"
          >
            <RefreshCwIcon size={14} className={isRefreshing ? 'spin' : ''} />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className="btn-new-bill-shortcut"
            onClick={() => {
              if (onNavigate) onNavigate('billing/new')
              else if (typeof window !== 'undefined') window.location.hash = '#/billing/new'
            }}
          >
            <PlusIcon size={16} />
            <span>New Bill</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="history-kpis-grid">
        <div className="history-kpi-card">
          <span className="kpi-label">Recorded Invoices</span>
          <span className="kpi-value">{filteredInvoices.length}</span>
          <span className="kpi-sub">Total bills in view</span>
        </div>
        <div className="history-kpi-card">
          <span className="kpi-label">Total Billed</span>
          <span className="kpi-value">₹{totalBilled.toFixed(2)}</span>
          <span className="kpi-sub">Gross billed value</span>
        </div>
        <div className="history-kpi-card">
          <span className="kpi-label">Collected Amount</span>
          <span className="kpi-value collected">₹{totalCollected.toFixed(2)}</span>
          <span className="kpi-sub">Settled revenues</span>
        </div>
        <div className="history-kpi-card">
          <span className="kpi-label">Outstanding Receivables</span>
          <span className="kpi-value receivables">₹{totalReceivables.toFixed(2)}</span>
          <span className="kpi-sub">Pending collection</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="history-filter-bar">
        <div className="search-box-wrap">
          <SearchIcon size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search by invoice number, customer name, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-clear-search"
              onClick={() => setSearchQuery('')}
            >
              &times;
            </button>
          )}
        </div>

        <div className="filter-pills-row">
          <div className="filter-group">
            <span className="filter-label">Status:</span>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'paid' ? 'active' : ''}`}
              onClick={() => setStatusFilter('paid')}
            >
              Paid
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'partial' ? 'active' : ''}`}
              onClick={() => setStatusFilter('partial')}
            >
              Partial
            </button>
            <button
              type="button"
              className={`filter-pill ${statusFilter === 'unpaid' ? 'active' : ''}`}
              onClick={() => setStatusFilter('unpaid')}
            >
              Unpaid
            </button>
          </div>

          <div className="filter-group">
            <span className="filter-label">Tender:</span>
            <select
              value={tenderFilter}
              onChange={(e) => setTenderFilter(e.target.value)}
              className="tender-select"
            >
              <option value="all">All Tenders</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="bank">Bank</option>
              <option value="split">Split</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="history-table-card">
        {filteredInvoices.length === 0 ? (
          <div className="empty-history-state">
            <FileTextIcon size={32} />
            <h4>No invoices found</h4>
            <p>
              {searchQuery || statusFilter !== 'all' || tenderFilter !== 'all'
                ? 'No invoices match your selected filters. Try clearing the search.'
                : 'No invoices have been finalized yet. Create a bill from the POS.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="invoices-register-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Stylist / Primary</th>
                  <th>Tender</th>
                  <th className="text-right">Billed Amount</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance Due</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => {
                  const status = inv.status || inv.paymentStatus || 'paid'
                  const isPartial = status === 'partially_paid' || status === 'partial'
                  const tender = inv.paymentMethod || inv.primaryPaymentMethod || 'cash'

                  return (
                    <tr key={inv.id}>
                      <td className="col-num">
                        <button
                          type="button"
                          className="inv-num-btn"
                          onClick={() => setSelectedInvoiceForPreview(inv)}
                          title="Click to preview invoice"
                        >
                          {inv.invoiceNumber}
                        </button>
                      </td>
                      <td className="col-date">{inv.date}</td>
                      <td className="col-cust">
                        <div className="cust-cell">
                          <UsersIcon size={12} className="cell-icon" />
                          <span>{inv.clientName}</span>
                        </div>
                      </td>
                      <td className="col-stylist">{inv.staffName || 'Salon Team'}</td>
                      <td className="col-tender">
                        <span className={`tender-badge ${tender}`}>
                          {tender.toUpperCase()}
                        </span>
                      </td>
                      <td className="col-amount text-right">₹{inv.totalAmount.toFixed(2)}</td>
                      <td className="col-paid text-right">₹{inv.paidAmount.toFixed(2)}</td>
                      <td className="col-balance text-right">
                        {inv.balanceDue > 0 ? (
                          <span className="balance-due-text">₹{inv.balanceDue.toFixed(2)}</span>
                        ) : (
                          <span className="balance-zero-text">-</span>
                        )}
                      </td>
                      <td className="col-status">
                        <span className={`status-badge ${status}`}>
                          {isPartial ? 'PARTIAL' : status.toUpperCase()}
                        </span>
                      </td>
                      <td className="col-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="action-icon-btn download"
                          onClick={() => downloadInvoicePdf(inv)}
                          title="Download PDF"
                        >
                          <DownloadIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn share"
                          onClick={() => setSelectedInvoiceForShare(inv)}
                          title="Share on WhatsApp, Email, or Link"
                        >
                          <ShareIcon size={14} />
                        </button>
                        <button
                          type="button"
                          className="action-icon-btn preview"
                          onClick={() => setSelectedInvoiceForPreview(inv)}
                          title="Preview Invoice"
                        >
                          <EyeIcon size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Modals */}
      <InvoiceShareModal
        isOpen={Boolean(selectedInvoiceForShare)}
        invoice={selectedInvoiceForShare}
        onClose={() => setSelectedInvoiceForShare(null)}
        onOpenPreview={(inv) => {
          setSelectedInvoiceForShare(null)
          setSelectedInvoiceForPreview(inv)
        }}
      />

      <InvoicePreviewModal
        isOpen={Boolean(selectedInvoiceForPreview)}
        invoice={selectedInvoiceForPreview}
        onClose={() => setSelectedInvoiceForPreview(null)}
        onOpenShareModal={(inv) => {
          setSelectedInvoiceForPreview(null)
          setSelectedInvoiceForShare(inv)
        }}
      />
    </div>
  )
}
