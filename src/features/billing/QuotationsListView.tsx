// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 5
// Quotations & Estimates Management Register View (`billing/estimates`)
// Lifecycle Tracking, Status Filtering, PDF Generation, Sharing & Conversion
// ==============================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { Quotation, QuotationStatus } from '../../types/finance.ts'
import { quotationService } from '../../services/quotationService.ts'
import { downloadQuotationPdf } from '../../services/quotationPdfService.ts'
import { formatPdfCurrency } from '../../services/pdfService.ts'
import { NewQuotationView } from './NewQuotationView.tsx'
import { QuotationShareModal } from './components/QuotationShareModal.tsx'
import { ConvertQuotationModal } from './components/ConvertQuotationModal.tsx'
import { ProformaPreviewModal } from './components/ProformaPreviewModal.tsx'
import {
  FileTextIcon,
  SearchIcon,
  RefreshCwIcon,
  DownloadIcon,
  ShareIcon,
  PlusIcon,
  ScissorsIcon,
} from '../../components/Icons.tsx'
import './QuotationsListView.css'

interface QuotationsListViewProps {
  onNavigate?: (navId: NavId) => void
}

export const QuotationsListView: React.FC<QuotationsListViewProps> = ({ onNavigate }) => {
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'all'>('all')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Modals State
  const [selectedQuoteForShare, setSelectedQuoteForShare] = useState<Quotation | null>(null)
  const [selectedQuoteForConvert, setSelectedQuoteForConvert] = useState<Quotation | null>(null)
  const [selectedQuoteForProforma, setSelectedQuoteForProforma] = useState<Quotation | null>(null)

  const loadQuotations = useCallback(async () => {
    try {
      const data = await quotationService.listQuotations({
        status: statusFilter,
        searchQuery,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      })
      setQuotations(data)
    } catch (err) {
      console.warn('Failed to load quotations:', err)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [statusFilter, searchQuery, startDate, endDate])

  useEffect(() => {
    void loadQuotations()
  }, [loadQuotations])

  const handleRefresh = () => {
    setIsRefreshing(true)
    void loadQuotations()
  }

  // Filtered in-memory for instant feedback
  const filteredQuotations = useMemo(() => {
    return quotations.filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false
      if (searchQuery.trim()) {
        const sq = searchQuery.toLowerCase().trim()
        const matchesNum = q.quotationNumber.toLowerCase().includes(sq)
        const matchesClient = q.clientName.toLowerCase().includes(sq)
        const matchesPhone = q.clientPhone && q.clientPhone.includes(sq)
        if (!matchesNum && !matchesClient && !matchesPhone) return false
      }
      return true
    })
  }, [quotations, statusFilter, searchQuery])

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = quotations.length
    const drafts = quotations.filter((q) => q.status === 'draft').length
    const sentOrViewed = quotations.filter((q) => q.status === 'sent' || q.status === 'viewed').length
    const accepted = quotations.filter((q) => q.status === 'accepted').length
    const converted = quotations.filter((q) => q.status === 'converted').length
    const pipelineValue = quotations
      .filter((q) => q.status !== 'rejected' && q.status !== 'cancelled')
      .reduce((acc, q) => acc + (q.totalAmount || 0), 0)

    return { total, drafts, sentOrViewed, accepted, converted, pipelineValue }
  }, [quotations])

  if (isCreatingNew) {
    return (
      <NewQuotationView
        onNavigate={onNavigate}
        onCancel={() => {
          setIsCreatingNew(false)
          void loadQuotations()
        }}
      />
    )
  }

  return (
    <div className="quotations-list-view">
      {/* View Header */}
      <div className="quote-list-header">
        <div>
          <h1 className="quote-list-title">Estimates & Quotations</h1>
          <p className="quote-list-subtitle">
            Manage salon estimates, client approval workflows, vector PDF generation, and seamless conversion to POS invoices.
          </p>
        </div>
        <div className="quote-list-header-actions">
          <button
            type="button"
            className="btn-refresh-quotes"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh Quotations"
          >
            <RefreshCwIcon size={16} className={isRefreshing ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="btn-new-quote-primary"
            onClick={() => setIsCreatingNew(true)}
          >
            <PlusIcon size={16} />
            <span>New Quotation</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="quote-kpis-grid">
        <div className="quote-kpi-card">
          <span className="kpi-label">Total Estimates</span>
          <span className="kpi-value">{metrics.total}</span>
        </div>
        <div className="quote-kpi-card">
          <span className="kpi-label">Drafts</span>
          <span className="kpi-value text-gray">{metrics.drafts}</span>
        </div>
        <div className="quote-kpi-card">
          <span className="kpi-label">Sent / Under Review</span>
          <span className="kpi-value text-blue">{metrics.sentOrViewed}</span>
        </div>
        <div className="quote-kpi-card">
          <span className="kpi-label">Accepted</span>
          <span className="kpi-value text-green">{metrics.accepted}</span>
        </div>
        <div className="quote-kpi-card">
          <span className="kpi-label">Converted to Invoice</span>
          <span className="kpi-value text-purple">{metrics.converted}</span>
        </div>
        <div className="quote-kpi-card">
          <span className="kpi-label">Pipeline Value</span>
          <span className="kpi-value gold">{formatPdfCurrency(metrics.pipelineValue)}</span>
        </div>
      </div>

      {/* Controls: Search, Dates, Status Tabs */}
      <div className="quote-controls-panel">
        <div className="search-and-dates">
          <div className="quote-search-box">
            <SearchIcon size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search by quote number, client, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="quote-date-filters">
            <input
              type="date"
              className="date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start Date"
            />
            <span className="date-sep">to</span>
            <input
              type="date"
              className="date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End Date"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                className="btn-clear-dates"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                }}
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>

        {/* Status Filters */}
        <div className="status-pills-row">
          {(
            [
              'all',
              'draft',
              'sent',
              'viewed',
              'accepted',
              'rejected',
              'expired',
              'converted',
            ] as const
          ).map((st) => (
            <button
              key={st}
              type="button"
              className={`status-filter-pill ${statusFilter === st ? 'active' : ''}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === 'all' ? 'All Estimates' : st.charAt(0).toUpperCase() + st.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Data Table */}
      <div className="quote-table-container">
        {isLoading ? (
          <div className="quote-table-loading">Loading quotation records...</div>
        ) : filteredQuotations.length === 0 ? (
          <div className="quote-table-empty">
            <FileTextIcon size={40} className="empty-icon" />
            <p>No quotations found matching your search and filter criteria.</p>
            <button
              type="button"
              className="btn-create-empty"
              onClick={() => setIsCreatingNew(true)}
            >
              Create New Quotation
            </button>
          </div>
        ) : (
          <table className="quotations-table">
            <thead>
              <tr>
                <th>Quote #</th>
                <th>Client</th>
                <th>Issue Date</th>
                <th>Valid Until</th>
                <th>Items</th>
                <th className="text-right">Total</th>
                <th className="text-center">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotations.map((quote) => {
                const isPastExpiry = new Date(quote.validUntil) < new Date() && quote.status !== 'converted' && quote.status !== 'accepted'
                return (
                  <tr key={quote.id}>
                    <td>
                      <strong className="quote-num-link">{quote.quotationNumber}</strong>
                    </td>
                    <td>
                      <div className="quote-client-cell">
                        <span className="client-name">{quote.clientName}</span>
                        {quote.clientPhone && (
                          <span className="client-phone">{quote.clientPhone}</span>
                        )}
                        {quote.isWalkIn && <span className="walk-in-tag">Walk-in</span>}
                      </div>
                    </td>
                    <td>{quote.issueDate}</td>
                    <td>
                      <span className={isPastExpiry ? 'text-expired' : ''}>
                        {quote.validUntil}
                        {isPastExpiry && ' (Expired)'}
                      </span>
                    </td>
                    <td>
                      <span className="items-count-badge">
                        {quote.items?.length || 1} items
                      </span>
                    </td>
                    <td className="text-right bold gold">
                      {formatPdfCurrency(quote.totalAmount)}
                    </td>
                    <td className="text-center">
                      <span className={`quote-status-badge badge-${quote.status}`}>
                        {quote.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="quote-row-actions">
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="Download Vector PDF"
                          onClick={() => downloadQuotationPdf(quote)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="Share Link (WhatsApp, Email, Bearer URL)"
                          onClick={() => setSelectedQuoteForShare(quote)}
                        >
                          <ShareIcon size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-action-icon"
                          title="Generate Proforma Invoice"
                          onClick={() => setSelectedQuoteForProforma(quote)}
                        >
                          <FileTextIcon size={16} />
                        </button>
                        {quote.status === 'accepted' && (
                          <button
                            type="button"
                            className="btn-action-convert"
                            title="Convert to POS Tax Invoice"
                            onClick={() => setSelectedQuoteForConvert(quote)}
                          >
                            <ScissorsIcon size={14} />
                            <span>Convert</span>
                          </button>
                        )}
                        {quote.status === 'converted' && quote.convertedInvoiceId && (
                          <span className="converted-badge-info" title="Converted to official tax invoice">
                            Converted
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Share Modal */}
      {selectedQuoteForShare && (
        <QuotationShareModal
          isOpen={true}
          quotation={selectedQuoteForShare}
          onClose={() => setSelectedQuoteForShare(null)}
          onQuotationUpdated={() => void loadQuotations()}
        />
      )}

      {/* Convert to Invoice Modal */}
      {selectedQuoteForConvert && (
        <ConvertQuotationModal
          isOpen={true}
          quotation={selectedQuoteForConvert}
          onClose={() => setSelectedQuoteForConvert(null)}
          onSuccess={(_invId, _invNum) => {
            setSelectedQuoteForConvert(null)
            void loadQuotations()
            if (onNavigate) {
              onNavigate('billing/invoices')
            }
          }}
        />
      )}

      {/* Proforma Preview Modal */}
      {selectedQuoteForProforma && (
        <ProformaPreviewModal
          isOpen={true}
          quotation={selectedQuoteForProforma}
          onClose={() => setSelectedQuoteForProforma(null)}
        />
      )}
    </div>
  )
}
