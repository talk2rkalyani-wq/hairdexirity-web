// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Payments History Register View (`billing/payments`)
// Multi-Tender Register, Filtering, Search, Summary Cards & Daily Reconciliation Trigger
// ==============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { PaymentRecord } from '../../types/finance.ts'
import { customerLedgerService } from '../../services/customerLedgerService.ts'
import { PaymentReconciliationModal } from './components/PaymentReconciliationModal.tsx'
import {
  FileTextIcon,
  SearchIcon,
  RefreshCwIcon,
  ActivityIcon,
  ShieldCheckIcon,
} from '../../components/Icons.tsx'
import './PaymentsHistoryView.css'

interface PaymentsHistoryViewProps {
  onNavigate?: (navId: NavId) => void
}

type ExtendedPayment = PaymentRecord & {
  invoiceNumber?: string
  clientName?: string
  clientId?: string
}

export const PaymentsHistoryView: React.FC<PaymentsHistoryViewProps> = ({ onNavigate }) => {
  const [payments, setPayments] = useState<ExtendedPayment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [methodFilter, setMethodFilter] = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [isReconModalOpen, setIsReconModalOpen] = useState(false)

  const loadPayments = async () => {
    try {
      setIsLoading(true)
      const data = await customerLedgerService.listPayments()
      setPayments(data)
      setIsLoading(false)
    } catch (err) {
      console.error(err)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPayments()
  }, [])

  // Filter payments
  const filteredPayments = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .slice(0, 10)

    return payments.filter((p) => {
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchInvoice = p.invoiceNumber?.toLowerCase().includes(q)
        const matchClient = p.clientName?.toLowerCase().includes(q)
        const matchRef = p.transactionReference?.toLowerCase().includes(q)
        if (!matchInvoice && !matchClient && !matchRef) return false
      }

      // Method filter
      if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) {
        return false
      }

      // Date filter
      if (dateFilter !== 'all' && p.createdAt) {
        const pDate = p.createdAt.slice(0, 10)
        if (dateFilter === 'today' && pDate !== todayStr) return false
        if (dateFilter === 'week' && pDate < sevenDaysAgo) return false
        if (dateFilter === 'month' && pDate < monthStart) return false
      }

      return true
    })
  }, [payments, searchQuery, methodFilter, dateFilter])

  // Summary Metrics
  const summary = useMemo(() => {
    let total = 0
    let cash = 0
    let upi = 0
    let card = 0
    let bank = 0
    let advanceOrCredit = 0

    for (const p of filteredPayments) {
      const amt = Number(p.amount) || 0
      total += amt
      if (p.paymentMethod === 'cash') cash += amt
      else if (p.paymentMethod === 'upi') upi += amt
      else if (p.paymentMethod === 'card') card += amt
      else if (p.paymentMethod === 'bank') bank += amt
      else if (p.paymentMethod === 'advance' || p.paymentMethod === 'credit_note') advanceOrCredit += amt
    }

    return { total, cash, upi, card, bank, advanceOrCredit }
  }, [filteredPayments])

  const formatCurrency = (amt: number) =>
    `₹${amt.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  return (
    <div className="payments-history-view">
      {/* Header */}
      <header className="ph-header">
        <div className="ph-header-title">
          <div className="ph-badge">
            <span className="ph-badge-dot"></span>
            Financial Ledger
          </div>
          <h1>Payment History Register</h1>
          <p className="ph-subtitle">
            Chronological log of customer payments, receipts, tender splits and daily drawer collections.
          </p>
        </div>

        <div className="ph-header-actions">
          <button
            className="btn btn-secondary-outline"
            onClick={loadPayments}
            disabled={isLoading}
            title="Refresh payment register"
          >
            <RefreshCwIcon size={16} className={isLoading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsReconModalOpen(true)}
          >
            <ShieldCheckIcon size={16} />
            <span>Daily Reconciliation</span>
          </button>
        </div>
      </header>

      {/* KPI Summary Cards */}
      <div className="ph-metrics-grid">
        <div className="ph-metric-card highlight">
          <span className="metric-label">Total Collections</span>
          <span className="metric-value">{formatCurrency(summary.total)}</span>
          <span className="metric-sub">{filteredPayments.length} transactions</span>
        </div>
        <div className="ph-metric-card">
          <span className="metric-label">Cash Tender</span>
          <span className="metric-value">{formatCurrency(summary.cash)}</span>
          <span className="metric-sub">Drawer Cash Inflow</span>
        </div>
        <div className="ph-metric-card">
          <span className="metric-label">UPI / QR Digital</span>
          <span className="metric-value">{formatCurrency(summary.upi)}</span>
          <span className="metric-sub">Direct Bank Credit</span>
        </div>
        <div className="ph-metric-card">
          <span className="metric-label">Cards &amp; Bank</span>
          <span className="metric-value">{formatCurrency(summary.card + summary.bank)}</span>
          <span className="metric-sub">POS &amp; Wire Transfers</span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="ph-toolbar">
        <div className="ph-search-bar">
          <SearchIcon size={16} className="search-icon" />
          <input
            type="text"
            placeholder="Search invoice #, customer name, or transaction ref..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="clear-btn" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>

        <div className="ph-filter-group">
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="ph-filter-select"
          >
            <option value="all">All Tenders</option>
            <option value="cash">Cash Only</option>
            <option value="upi">UPI / QR Code</option>
            <option value="card">Cards</option>
            <option value="bank">Bank Transfer</option>
            <option value="advance">Advance Allocation</option>
            <option value="credit_note">Credit Note Allocation</option>
          </select>

          <div className="date-filter-pills">
            {(['all', 'today', 'week', 'month'] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`date-pill ${dateFilter === d ? 'active' : ''}`}
                onClick={() => setDateFilter(d)}
              >
                {d === 'all'
                  ? 'All Time'
                  : d === 'today'
                  ? 'Today'
                  : d === 'week'
                  ? '7 Days'
                  : 'This Month'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="ph-table-container">
        {isLoading ? (
          <div className="ph-loading-state">
            <RefreshCwIcon size={24} className="spinning" />
            <p>Loading payment records...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="ph-empty-state">
            <ActivityIcon size={36} />
            <h3>No Payments Found</h3>
            <p>No payment records match your search criteria or selected filters.</p>
          </div>
        ) : (
          <table className="ph-table">
            <thead>
              <tr>
                <th>Date &amp; Time</th>
                <th>Invoice #</th>
                <th>Customer</th>
                <th>Tender Method</th>
                <th>Reference #</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => {
                const pDate = new Date(p.createdAt || Date.now())
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="table-date">
                        <span className="date-main">{pDate.toLocaleDateString('en-IN')}</span>
                        <span className="date-sub">
                          {pDate.toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="invoice-link-btn"
                        onClick={() => onNavigate?.('billing/invoices')}
                        title="View invoice register"
                      >
                        #{p.invoiceNumber || p.invoiceId.substring(0, 8)}
                      </button>
                    </td>
                    <td>
                      <div className="client-cell">
                        <span className="client-name">{p.clientName || 'General Customer'}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`method-badge method-${p.paymentMethod}`}>
                        {p.paymentMethod?.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="ref-text">{p.transactionReference || '—'}</span>
                    </td>
                    <td className="text-right">
                      <span className="amount-text">{formatCurrency(p.amount)}</span>
                    </td>
                    <td className="text-center">
                      <button
                        className="btn-icon"
                        onClick={() => onNavigate?.('billing/ledger')}
                        title="View customer ledger"
                      >
                        <FileTextIcon size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Daily Reconciliation Modal */}
      <PaymentReconciliationModal
        isOpen={isReconModalOpen}
        onClose={() => setIsReconModalOpen(false)}
        onSuccess={() => {
          loadPayments()
        }}
      />
    </div>
  )
}
