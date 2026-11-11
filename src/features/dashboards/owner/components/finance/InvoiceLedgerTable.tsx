// ==============================================================================
// Luma Salon — Invoice Ledger Table Component (Phase 7)
// Commercial Billing Transactions, Tax Breakdown, Status Filters & CSV Export
// ==============================================================================

import React, { useState, useMemo } from 'react'
import type { Invoice, PaymentStatus, PaymentMethod, InvoiceFilters } from '../../../../../types/finance.ts'
import { billingService } from '../../../../../services/billingService.ts'
import { financialReportsService } from '../../../../../services/financialReportsService.ts'
import { formatCurrency, formatDate } from '../../../../../utils/formatters.ts'
import {
  SearchIcon,
  SlidersIcon,
  CalendarIcon,
  UsersIcon,
  TagIcon,
  FileTextIcon,
} from '../../../../../components/Icons.tsx'
import { InvoiceDetailModal } from './InvoiceDetailModal.tsx'

interface InvoiceLedgerTableProps {
  invoices: Invoice[]
}

export const InvoiceLedgerTable: React.FC<InvoiceLedgerTableProps> = ({ invoices }) => {
  const [selectedStatus, setSelectedStatus] = useState<PaymentStatus | 'all'>('all')
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'>('date_desc')
  const [activeInvoice, setActiveInvoice] = useState<Invoice | null>(null)

  // Filtered and sorted invoices
  const filteredInvoices = useMemo(() => {
    const filters: InvoiceFilters = {
      status: selectedStatus,
      paymentMethod: selectedMethod,
      searchQuery,
      sortBy,
    }
    return billingService.filterInvoices(invoices, filters)
  }, [invoices, selectedStatus, selectedMethod, searchQuery, sortBy])

  // Status counts for filter pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: invoices.length,
      paid: 0,
      partial: 0,
      unpaid: 0,
      refunded: 0,
    }
    invoices.forEach((inv) => {
      if (counts[inv.paymentStatus] !== undefined) {
        counts[inv.paymentStatus]++
      }
    })
    return counts
  }, [invoices])

  const handleExportCsv = () => {
    try {
      const csvContent = financialReportsService.exportInvoicesToCsv(filteredInvoices)
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', `hair_dexirity_invoices_${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to export invoices CSV:', err)
    }
  }

  const getStatusBadgeClass = (status: PaymentStatus) => {
    switch (status) {
      case 'paid':
        return 'badge-emerald'
      case 'partial':
        return 'badge-amber'
      case 'unpaid':
        return 'badge-rose'
      case 'refunded':
        return 'badge-slate'
      default:
        return 'badge-slate'
    }
  }

  const getTenderBadge = (method: PaymentMethod) => {
    switch (method) {
      case 'upi':
        return <span className="tender-badge upi">UPI</span>
      case 'card':
        return <span className="tender-badge card">CARD</span>
      case 'cash':
        return <span className="tender-badge cash">CASH</span>
      case 'split':
        return <span className="tender-badge split">SPLIT</span>
      default:
        return <span className="tender-badge">{method.toUpperCase()}</span>
    }
  }

  return (
    <div className="invoice-ledger-card">
      {/* Table Header Row */}
      <div className="ledger-header-row">
        <div className="ledger-title-col">
          <div className="ledger-title">
            <FileTextIcon size={18} />
            <span>Commercial Invoicing & Payment Ledger</span>
          </div>
          <span className="ledger-sub">
            Verified audit trail of customer bills, GST segregation, and tender receipts ({filteredInvoices.length} of {invoices.length} invoices)
          </span>
        </div>

        {/* Action Controls */}
        <div className="ledger-actions-group">
          {/* Export to CSV */}
          <button
            type="button"
            className="btn-export-csv"
            onClick={handleExportCsv}
            title="Download CSV for accounting software"
          >
            <span>📥 Export CSV</span>
          </button>

          {/* Search Box */}
          <div className="table-search-box">
            <SearchIcon size={14} className="search-icon-muted" />
            <input
              type="text"
              placeholder="Search invoice #, client, stylist..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="table-search-input"
            />
          </div>

          {/* Payment Method Filter */}
          <div className="table-sort-box">
            <TagIcon size={14} className="sort-icon-muted" />
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as any)}
              className="table-sort-select"
            >
              <option value="all">All Tenders</option>
              <option value="upi">UPI Payments</option>
              <option value="card">Card POS</option>
              <option value="cash">Cash In Hand</option>
              <option value="split">Split Tenders</option>
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="table-sort-box">
            <SlidersIcon size={14} className="sort-icon-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="table-sort-select"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="amount_desc">Amount: High to Low</option>
              <option value="amount_asc">Amount: Low to High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Filter Pills Row */}
      <div className="ledger-status-pills-row">
        <span className="filter-pill-label">Status:</span>
        <div className="filter-pills-wrap">
          <button
            type="button"
            className={`ledger-filter-pill ${selectedStatus === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('all')}
          >
            All ({statusCounts.all})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill emerald ${selectedStatus === 'paid' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('paid')}
          >
            Paid in Full ({statusCounts.paid})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill amber ${selectedStatus === 'partial' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('partial')}
          >
            Partially Paid ({statusCounts.partial})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill rose ${selectedStatus === 'unpaid' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('unpaid')}
          >
            Unpaid ({statusCounts.unpaid})
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="table-responsive-wrapper">
        <table className="invoices-table">
          <thead>
            <tr>
              <th>Invoice # & Date</th>
              <th>Customer</th>
              <th>Service & Stylist</th>
              <th>Tender Method</th>
              <th>Subtotal</th>
              <th>GST (18%)</th>
              <th>Total Bill</th>
              <th>Payment Status</th>
              <th className="th-actions">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length === 0 ? (
              <tr>
                <td colSpan={9} className="td-empty-state">
                  <div className="table-empty-box">
                    <FileTextIcon size={24} className="empty-icon-muted" />
                    <span className="empty-title">No invoices found matching current criteria</span>
                    <span className="empty-desc">Try clearing your search query or selecting a different status filter</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredInvoices.map((inv) => (
                <tr key={inv.id} className="invoice-table-row">
                  {/* Invoice # & Date */}
                  <td className="td-inv-meta">
                    <div className="inv-number-bold">{inv.invoiceNumber}</div>
                    <div className="inv-date-sub">
                      <CalendarIcon size={12} />
                      <span>{formatDate(inv.date)}</span>
                    </div>
                  </td>

                  {/* Customer */}
                  <td className="td-client">
                    <div className="client-name-row">
                      <UsersIcon size={13} className="text-muted" />
                      <span>{inv.clientName}</span>
                    </div>
                    {inv.clientPhone && <span className="client-phone-sub">{inv.clientPhone}</span>}
                  </td>

                  {/* Service & Stylist */}
                  <td className="td-service">
                    <div className="service-title-text">{inv.serviceName || 'Salon Service'}</div>
                    <span className="stylist-sub">by {inv.staffName}</span>
                  </td>

                  {/* Tender Badge */}
                  <td className="td-tender">
                    {getTenderBadge(inv.primaryPaymentMethod)}
                  </td>

                  {/* Subtotal */}
                  <td className="td-subtotal">
                    <span>{formatCurrency(inv.subtotal)}</span>
                    {inv.discountAmount > 0 && (
                      <span className="discount-tag">-{formatCurrency(inv.discountAmount)}</span>
                    )}
                  </td>

                  {/* GST */}
                  <td className="td-gst">
                    <span className="gst-val">{formatCurrency(inv.taxAmount)}</span>
                  </td>

                  {/* Total Bill */}
                  <td className="td-total-amount">
                    <span className="total-gold gold">{formatCurrency(inv.totalAmount)}</span>
                  </td>

                  {/* Status Badge */}
                  <td className="td-status">
                    <span className={`status-pill ${getStatusBadgeClass(inv.paymentStatus)}`}>
                      {inv.paymentStatus.toUpperCase()}
                    </span>
                  </td>

                  {/* Action */}
                  <td className="td-actions">
                    <button
                      type="button"
                      className="btn-view-invoice"
                      onClick={() => setActiveInvoice(inv)}
                      title="Inspect full printable receipt"
                    >
                      <FileTextIcon size={12} />
                      <span>View Receipt</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Invoice Modal */}
      {activeInvoice && (
        <InvoiceDetailModal
          invoice={activeInvoice}
          onClose={() => setActiveInvoice(null)}
        />
      )}
    </div>
  )
}

