// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Refunds & Credit Notes Management View (`billing/refunds`)
// Controlled Reversals, Credit Vouchers, Allocations & Server Owner Auth Guard
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { RefundRecord, CreditNote } from '../../types/finance.ts'
import { customerLedgerService } from '../../services/customerLedgerService.ts'
import { IssueRefundModal } from './components/IssueRefundModal.tsx'
import { CreateCreditNoteModal } from './components/CreateCreditNoteModal.tsx'
import { AllocateCreditNoteModal } from './components/AllocateCreditNoteModal.tsx'
import {
  SearchIcon,
  RefreshCwIcon,
  PlusIcon,
  TagIcon,
  ActivityIcon,
} from '../../components/Icons.tsx'
import './RefundsCreditNotesView.css'

interface RefundsCreditNotesViewProps {
  onNavigate?: (navId: NavId) => void
}

export const RefundsCreditNotesView: React.FC<RefundsCreditNotesViewProps> = ({ onNavigate }) => {
  const [activeTab, setActiveTab] = useState<'refunds' | 'credit_notes'>('refunds')
  const [refunds, setRefunds] = useState<RefundRecord[]>([])
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Modals
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false)
  const [isCreditNoteModalOpen, setIsCreditNoteModalOpen] = useState(false)
  const [selectedCreditNoteForAlloc, setSelectedCreditNoteForAlloc] = useState<CreditNote | null>(null)

  const loadData = async () => {
    try {
      setIsLoading(true)
      const [refList, cnList] = await Promise.all([
        customerLedgerService.listRefunds(),
        customerLedgerService.listCreditNotes(),
      ])
      setRefunds(refList)
      setCreditNotes(cnList)
      setIsLoading(false)
    } catch (err) {
      console.error(err)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatCurrency = (amt: number) =>
    `₹${amt.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  // Filtered Refunds
  const filteredRefunds = refunds.filter((r) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      r.refundNumber?.toLowerCase().includes(q) ||
      r.invoiceNumber?.toLowerCase().includes(q) ||
      r.clientName?.toLowerCase().includes(q) ||
      r.reason?.toLowerCase().includes(q)
    )
  })

  // Filtered Credit Notes
  const filteredCreditNotes = creditNotes.filter((cn) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    return (
      cn.creditNoteNumber?.toLowerCase().includes(q) ||
      cn.invoiceNumber?.toLowerCase().includes(q) ||
      cn.clientName?.toLowerCase().includes(q) ||
      cn.reason?.toLowerCase().includes(q)
    )
  })

  // Summaries
  const totalRefundAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0)
  const totalCreditIssued = creditNotes.reduce((s, cn) => s + (cn.totalAmount || 0), 0)
  const totalCreditAllocated = creditNotes.reduce((s, cn) => s + (cn.allocatedAmount || 0), 0)
  const totalCreditAvailable = creditNotes.reduce((s, cn) => s + (cn.remainingAmount || 0), 0)

  return (
    <div className="refunds-credit-notes-view">
      {/* Header */}
      <header className="rc-header">
        <div className="rc-header-title">
          <div className="rc-badge">
            <span className="rc-badge-dot"></span>
            Adjustments &amp; Concessions
          </div>
          <h1>Refunds &amp; Credit Notes</h1>
          <p className="rc-subtitle">
            Manage controlled payment reversals, client concession credits and outstanding bill allocations.
          </p>
        </div>

        <div className="rc-header-actions">
          <button
            className="btn btn-secondary-outline"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCwIcon size={16} className={isLoading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
          {activeTab === 'refunds' ? (
            <button
              className="btn btn-danger-action"
              onClick={() => setIsRefundModalOpen(true)}
            >
              <PlusIcon size={16} />
              <span>Issue Refund</span>
            </button>
          ) : (
            <button
              className="btn btn-primary"
              onClick={() => setIsCreditNoteModalOpen(true)}
            >
              <PlusIcon size={16} />
              <span>Create Credit Note</span>
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <div className="rc-tabs-bar">
        <button
          type="button"
          className={`rc-tab-btn ${activeTab === 'refunds' ? 'active' : ''}`}
          onClick={() => setActiveTab('refunds')}
        >
          Invoice Refunds ({refunds.length})
        </button>
        <button
          type="button"
          className={`rc-tab-btn ${activeTab === 'credit_notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('credit_notes')}
        >
          Credit Notes ({creditNotes.length})
        </button>
      </div>

      {/* KPI Cards */}
      {activeTab === 'refunds' ? (
        <div className="rc-metrics-grid">
          <div className="rc-metric-card highlight-danger">
            <span className="metric-label">Total Refunds Issued</span>
            <span className="metric-value text-danger">{formatCurrency(totalRefundAmount)}</span>
            <span className="metric-sub">{refunds.length} transactions processed</span>
          </div>
          <div className="rc-metric-card">
            <span className="metric-label">Approval Gate Limit</span>
            <span className="metric-value">₹2,000.00</span>
            <span className="metric-sub">Strict Server Owner Gate</span>
          </div>
        </div>
      ) : (
        <div className="rc-metrics-grid four-col">
          <div className="rc-metric-card">
            <span className="metric-label">Total Credit Notes</span>
            <span className="metric-value">{creditNotes.length}</span>
            <span className="metric-sub">Vouchers created</span>
          </div>
          <div className="rc-metric-card">
            <span className="metric-label">Total Value Issued</span>
            <span className="metric-value">{formatCurrency(totalCreditIssued)}</span>
            <span className="metric-sub">Including GST adjustments</span>
          </div>
          <div className="rc-metric-card">
            <span className="metric-label">Allocated to Bills</span>
            <span className="metric-value text-success">{formatCurrency(totalCreditAllocated)}</span>
            <span className="metric-sub">Applied against invoices</span>
          </div>
          <div className="rc-metric-card highlight-gold">
            <span className="metric-label">Available Credit Balance</span>
            <span className="metric-value text-gold">{formatCurrency(totalCreditAvailable)}</span>
            <span className="metric-sub">Pending client redemption</span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="rc-toolbar">
        <div className="rc-search-bar">
          <SearchIcon size={16} className="search-icon" />
          <input
            type="text"
            placeholder={
              activeTab === 'refunds'
                ? 'Search refund #, invoice #, customer name...'
                : 'Search credit note #, invoice #, customer name...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tables Container */}
      <div className="rc-table-container">
        {isLoading ? (
          <div className="rc-loading-state">
            <RefreshCwIcon size={24} className="spinning" />
            <p>Loading records...</p>
          </div>
        ) : activeTab === 'refunds' ? (
          filteredRefunds.length === 0 ? (
            <div className="rc-empty-state">
              <ActivityIcon size={36} />
              <h3>No Refunds Recorded</h3>
              <p>No refund entries found matching your search.</p>
            </div>
          ) : (
            <table className="rc-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Refund #</th>
                  <th>Original Invoice #</th>
                  <th>Customer</th>
                  <th>Tender</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredRefunds.map((r) => {
                  const rDate = new Date(r.createdAt || Date.now())
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="table-date">
                          <span className="date-main">{rDate.toLocaleDateString('en-IN')}</span>
                          <span className="date-sub">
                            {rDate.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="mono-ref">{r.refundNumber}</span>
                      </td>
                      <td>
                        {onNavigate ? (
                          <button
                            className="invoice-link-btn"
                            onClick={() => onNavigate('billing/invoices')}
                            title="View invoice"
                          >
                            #{r.invoiceNumber || r.invoiceId.substring(0, 8)}
                          </button>
                        ) : (
                          <span className="mono-ref">#{r.invoiceNumber || r.invoiceId.substring(0, 8)}</span>
                        )}
                      </td>
                      <td>
                        <span className="client-name">{r.clientName || 'General Client'}</span>
                      </td>
                      <td>
                        <span className="method-pill">{r.paymentMethod.toUpperCase()}</span>
                      </td>
                      <td>
                        <span className="reason-text">{r.reason}</span>
                      </td>
                      <td>
                        <span className={`status-pill status-${r.status}`}>
                          {r.status.replace(/_/g, ' ').toUpperCase()}
                        </span>
                      </td>
                      <td className="text-right">
                        <span className="text-danger font-bold">{formatCurrency(r.amount)}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )
        ) : filteredCreditNotes.length === 0 ? (
          <div className="rc-empty-state">
            <TagIcon size={36} />
            <h3>No Credit Notes Found</h3>
            <p>No credit note records match your search.</p>
          </div>
        ) : (
          <table className="rc-table">
            <thead>
              <tr>
                <th>Issue Date</th>
                <th>Credit Note #</th>
                <th>Original Invoice #</th>
                <th>Customer</th>
                <th>Reason</th>
                <th className="text-right">Total Amount</th>
                <th className="text-right">Allocated</th>
                <th className="text-right">Available Balance</th>
                <th>Status</th>
                <th className="text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredCreditNotes.map((cn) => (
                <tr key={cn.id}>
                  <td>
                    <span className="date-main">{cn.issueDate}</span>
                  </td>
                  <td>
                    <span className="mono-ref font-bold">{cn.creditNoteNumber}</span>
                  </td>
                  <td>
                    {onNavigate ? (
                      <button
                        className="invoice-link-btn"
                        onClick={() => onNavigate('billing/invoices')}
                        title="View invoice"
                      >
                        #{cn.invoiceNumber || cn.originalInvoiceId.substring(0, 8)}
                      </button>
                    ) : (
                      <span className="mono-ref">#{cn.invoiceNumber || cn.originalInvoiceId.substring(0, 8)}</span>
                    )}
                  </td>
                  <td>
                    <span className="client-name">{cn.clientName || 'General Client'}</span>
                  </td>
                  <td>
                    <span className="reason-text">{cn.reason}</span>
                  </td>
                  <td className="text-right">
                    <span className="font-bold">{formatCurrency(cn.totalAmount)}</span>
                  </td>
                  <td className="text-right">
                    <span className="text-success">{formatCurrency(cn.allocatedAmount)}</span>
                  </td>
                  <td className="text-right">
                    <span className="text-gold font-bold">{formatCurrency(cn.remainingAmount)}</span>
                  </td>
                  <td>
                    <span className={`status-pill status-${cn.status}`}>
                      {cn.status.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="text-center">
                    {cn.remainingAmount > 0 && cn.status === 'active' ? (
                      <button
                        className="btn-apply-credit"
                        onClick={() => setSelectedCreditNoteForAlloc(cn)}
                      >
                        Apply to Bill
                      </button>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      <IssueRefundModal
        isOpen={isRefundModalOpen}
        onClose={() => setIsRefundModalOpen(false)}
        onSuccess={loadData}
      />

      <CreateCreditNoteModal
        isOpen={isCreditNoteModalOpen}
        onClose={() => setIsCreditNoteModalOpen(false)}
        onSuccess={loadData}
      />

      <AllocateCreditNoteModal
        isOpen={Boolean(selectedCreditNoteForAlloc)}
        onClose={() => setSelectedCreditNoteForAlloc(null)}
        onSuccess={loadData}
        creditNote={selectedCreditNoteForAlloc}
      />
    </div>
  )
}
