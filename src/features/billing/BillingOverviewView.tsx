import React, { useState, useEffect } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { Invoice } from '../../types/finance.ts'
import { billingService } from '../../services/billingService.ts'
import { downloadInvoicePdf } from '../../services/pdfService.ts'
import { InvoiceShareModal } from './components/InvoiceShareModal.tsx'
import { InvoicePreviewModal } from './components/InvoicePreviewModal.tsx'
import {
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  AlertTriangleIcon,
  FileTextIcon,
  PlusIcon,
  RefreshCwIcon,
  ActivityIcon,
  UsersIcon,
  TrashIcon,
  DownloadIcon,
  ShareIcon,
  EyeIcon,
} from '../../components/Icons.tsx'
import './BillingOverviewView.css'

interface BillingOverviewViewProps {
  onNavigate?: (navId: NavId) => void
}

export const BillingOverviewView: React.FC<BillingOverviewViewProps> = ({ onNavigate }) => {
  const [kpis, setKpis] = useState(() => billingService.getTodayKpis())
  const [drafts, setDrafts] = useState<Invoice[]>(() => billingService.getAllDrafts())
  const [allInvoices, setAllInvoices] = useState<Invoice[]>(() => billingService.getAllInvoices())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedInvoiceForShare, setSelectedInvoiceForShare] = useState<Invoice | null>(null)
  const [selectedInvoiceForPreview, setSelectedInvoiceForPreview] = useState<Invoice | null>(null)

  // Synchronize remote database invoices & subscribe to billing store updates
  useEffect(() => {
    // Proactively pull latest finalized invoices and drafts from PostgreSQL
    billingService.fetchInvoicesAsync().catch(console.warn)
    billingService.fetchDraftsAsync().catch(console.warn)

    const unsubscribe = billingService.subscribe(() => {
      setKpis(billingService.getTodayKpis())
      setDrafts(billingService.getAllDrafts())
      setAllInvoices(billingService.getAllInvoices())
    })
    return () => {
      unsubscribe()
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await Promise.all([
        billingService.fetchInvoicesAsync(),
        billingService.fetchDraftsAsync(),
      ])
    } catch (err) {
      console.warn('Billing overview refresh failed:', err)
    } finally {
      setKpis(billingService.getTodayKpis())
      setDrafts(billingService.getAllDrafts())
      setAllInvoices(billingService.getAllInvoices())
      setIsRefreshing(false)
    }
  }

  const handleNewBill = () => {
    if (onNavigate) {
      onNavigate('billing/new')
    } else if (typeof window !== 'undefined') {
      window.location.hash = '#/billing/new'
    }
  }

  const handleResumeDraft = (draftId: string) => {
    if (typeof window !== 'undefined') {
      window.location.hash = `#/billing/new?draftId=${draftId}`
    }
    if (onNavigate) {
      onNavigate('billing/new')
    }
  }

  const handleDeleteDraft = async (draftId: string) => {
    if (confirm('Are you sure you want to discard this draft?')) {
      await billingService.deleteDraft(draftId)
      setDrafts(billingService.getAllDrafts())
      setKpis(billingService.getTodayKpis())
    }
  }

  // Calculate tender distribution percentages
  const totalCollections =
    kpis.cashCollected + kpis.upiCollected + kpis.cardCollected + kpis.bankCollected
  const cashPct = totalCollections > 0 ? (kpis.cashCollected / totalCollections) * 100 : 0
  const upiPct = totalCollections > 0 ? (kpis.upiCollected / totalCollections) * 100 : 0
  const cardPct = totalCollections > 0 ? (kpis.cardCollected / totalCollections) * 100 : 0
  const bankPct = totalCollections > 0 ? (kpis.bankCollected / totalCollections) * 100 : 0

  // Display recent invoices (up to 8)
  const recentInvoices = allInvoices.slice(0, 8)

  return (
    <div className="billing-overview-container">
      {/* Top Header */}
      <header className="billing-overview-header">
        <div className="header-titles">
          <div className="title-row">
            <span className="overview-icon-badge">
              <ActivityIcon size={20} />
            </span>
            <h2 className="overview-title">Billing & Collections Overview</h2>
          </div>
          <p className="overview-subtitle">
            Real-time financial performance, billing register, and pending receivables
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn-refresh-kpis"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh financial data"
          >
            <RefreshCwIcon size={16} className={isRefreshing ? 'spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            className="btn-new-bill-primary"
            onClick={handleNewBill}
          >
            <PlusIcon size={16} />
            <span>New Bill</span>
          </button>
        </div>
      </header>

      {/* 8 Financial KPI Cards Grid */}
      <section className="kpi-cards-grid">
        {/* 1. Today's Billed */}
        <div className="kpi-card gold-border">
          <div className="kpi-header">
            <span className="kpi-label">Today's Billed</span>
            <span className="kpi-indicator green">Live</span>
          </div>
          <div className="kpi-metric">₹{kpis.todayBilledAmount.toFixed(2)}</div>
          <div className="kpi-footer-note">Turnover generated today</div>
        </div>

        {/* 2. Today's Collected */}
        <div className="kpi-card green-border">
          <div className="kpi-header">
            <span className="kpi-label">Today's Collected</span>
            <span className="kpi-indicator green">Received</span>
          </div>
          <div className="kpi-metric highlight-green">₹{kpis.todayCollectedAmount.toFixed(2)}</div>
          <div className="kpi-footer-note">Actual cash & digital receipts</div>
        </div>

        {/* 3. Monthly Billed */}
        <div className="kpi-card purple-border">
          <div className="kpi-header">
            <span className="kpi-label">Monthly Turnover</span>
            <TrendingUpIcon size={16} className="icon-purple" />
          </div>
          <div className="kpi-metric">₹{kpis.monthlyBilledAmount.toFixed(2)}</div>
          <div className="kpi-footer-note">Current month billed gross</div>
        </div>

        {/* 4. Outstanding Balance */}
        <div className="kpi-card red-border">
          <div className="kpi-header">
            <span className="kpi-label">Outstanding Receivables</span>
            <AlertTriangleIcon size={16} className="icon-warn" />
          </div>
          <div className="kpi-metric highlight-red">₹{kpis.outstandingBalance.toFixed(2)}</div>
          <div className="kpi-footer-note">Total customer credit due</div>
        </div>

        {/* 5. Invoices Today */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Invoices Today</span>
            <FileTextIcon size={16} className="icon-neutral" />
          </div>
          <div className="kpi-metric-number">{kpis.todayInvoicesCount}</div>
          <div className="kpi-footer-note">{kpis.draftsCount} active drafts</div>
        </div>

        {/* 6. Fully Paid */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Paid Invoices</span>
            <CheckCircleIcon size={16} className="icon-green" />
          </div>
          <div className="kpi-metric-number">{kpis.todayPaidCount}</div>
          <div className="kpi-footer-note">Settled in full</div>
        </div>

        {/* 7. Partially Paid */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Partially Paid</span>
            <ClockIcon size={16} className="icon-orange" />
          </div>
          <div className="kpi-metric-number">{kpis.todayPartialCount}</div>
          <div className="kpi-footer-note">Part payment collected</div>
        </div>

        {/* 8. Unpaid */}
        <div className="kpi-card">
          <div className="kpi-header">
            <span className="kpi-label">Unpaid Bills</span>
            <span className="kpi-badge-unpaid">Pending</span>
          </div>
          <div className="kpi-metric-number">{kpis.todayUnpaidCount}</div>
          <div className="kpi-footer-note">Zero payment logged</div>
        </div>
      </section>

      {/* Two Column Section: Tender Breakdown & Draft Invoices */}
      <div className="overview-mid-row">
        {/* Payment Tender Distribution */}
        <div className="overview-card tender-distribution-card">
          <div className="card-header-row">
            <h4>Payment Method Breakdown</h4>
            <span className="collected-total-tag">
              Total: ₹{totalCollections.toFixed(2)}
            </span>
          </div>

          <div className="tender-bar-wrapper">
            <div className="multi-bar">
              {cashPct > 0 && (
                <div
                  className="bar-segment cash"
                  style={{ width: `${cashPct}%` }}
                  title={`Cash: ₹${kpis.cashCollected.toFixed(2)} (${cashPct.toFixed(1)}%)`}
                />
              )}
              {upiPct > 0 && (
                <div
                  className="bar-segment upi"
                  style={{ width: `${upiPct}%` }}
                  title={`UPI: ₹${kpis.upiCollected.toFixed(2)} (${upiPct.toFixed(1)}%)`}
                />
              )}
              {cardPct > 0 && (
                <div
                  className="bar-segment card"
                  style={{ width: `${cardPct}%` }}
                  title={`Card: ₹${kpis.cardCollected.toFixed(2)} (${cardPct.toFixed(1)}%)`}
                />
              )}
              {bankPct > 0 && (
                <div
                  className="bar-segment bank"
                  style={{ width: `${bankPct}%` }}
                  title={`Bank: ₹${kpis.bankCollected.toFixed(2)} (${bankPct.toFixed(1)}%)`}
                />
              )}
            </div>
          </div>

          <div className="tender-legend-grid">
            <div className="legend-item">
              <span className="legend-dot cash" />
              <div className="legend-info">
                <span className="legend-label">Cash</span>
                <span className="legend-val">₹{kpis.cashCollected.toFixed(2)} ({cashPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot upi" />
              <div className="legend-info">
                <span className="legend-label">UPI</span>
                <span className="legend-val">₹{kpis.upiCollected.toFixed(2)} ({upiPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot card" />
              <div className="legend-info">
                <span className="legend-label">Card</span>
                <span className="legend-val">₹{kpis.cardCollected.toFixed(2)} ({cardPct.toFixed(0)}%)</span>
              </div>
            </div>
            <div className="legend-item">
              <span className="legend-dot bank" />
              <div className="legend-info">
                <span className="legend-label">Bank Transfer</span>
                <span className="legend-val">₹{kpis.bankCollected.toFixed(2)} ({bankPct.toFixed(0)}%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Draft Invoices */}
        <div className="overview-card drafts-card">
          <div className="card-header-row">
            <div className="title-with-pill">
              <h4>Unfinalized Drafts</h4>
              <span className="drafts-count-pill">{drafts.length}</span>
            </div>
            <span className="drafts-subtext">Carts saved for later completion</span>
          </div>

          {drafts.length === 0 ? (
            <div className="empty-drafts-box">
              <FileTextIcon size={24} className="icon-faint" />
              <p>No draft bills currently saved.</p>
            </div>
          ) : (
            <div className="drafts-list-scroll">
              {drafts.map((draft) => (
                <div key={draft.id} className="draft-row-card">
                  <div className="draft-info-left">
                    <span className="draft-num-badge">{draft.invoiceNumber}</span>
                    <div className="draft-meta">
                      <span className="draft-client-name">{draft.clientName}</span>
                      <span className="draft-items-count">
                        {draft.lineItems.length} items &bull; ₹{draft.totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="draft-actions">
                    <button
                      type="button"
                      className="btn-resume-draft"
                      onClick={() => handleResumeDraft(draft.id)}
                      title="Open draft in POS"
                    >
                      Resume
                    </button>
                    <button
                      type="button"
                      className="btn-discard-draft"
                      onClick={() => handleDeleteDraft(draft.id)}
                      title="Discard draft"
                    >
                      <TrashIcon size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Invoices Table */}
      <section className="overview-card recent-invoices-section">
        <div className="card-header-row">
          <div className="title-with-pill">
            <h4>Recent Invoices Register</h4>
            <span className="invoices-count-pill">{allInvoices.length} Total</span>
          </div>
          <span className="invoices-subtext">Commercial invoices recorded in financial store</span>
        </div>

        {recentInvoices.length === 0 ? (
          <div className="empty-invoices-box">
            <p>No invoices recorded yet. Click &quot;New Bill&quot; to generate the first bill.</p>
          </div>
        ) : (
          <div className="invoices-table-wrapper">
            <table className="overview-invoices-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Date & Time</th>
                  <th>Customer</th>
                  <th>Payment Tender</th>
                  <th>Billed Amount</th>
                  <th>Amount Paid</th>
                  <th>Balance Due</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="td-inv-num">
                      <button
                        type="button"
                        className="invoice-num-link"
                        onClick={() => setSelectedInvoiceForPreview(inv)}
                        title="Click to preview invoice"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {inv.invoiceNumber}
                      </button>
                    </td>
                    <td className="td-date">{inv.date}</td>
                    <td className="td-client">
                      <div className="client-cell">
                        <UsersIcon size={13} className="cell-icon" />
                        <span>{inv.clientName}</span>
                      </div>
                    </td>
                    <td className="td-tender">
                      <span className={`tender-pill ${inv.paymentMethod || inv.primaryPaymentMethod || 'cash'}`}>
                        {(inv.paymentMethod || inv.primaryPaymentMethod || 'cash').toUpperCase()}
                      </span>
                    </td>
                    <td className="td-amount">₹{inv.totalAmount.toFixed(2)}</td>
                    <td className="td-paid">₹{inv.paidAmount.toFixed(2)}</td>
                    <td className="td-balance">
                      {inv.balanceDue > 0 ? (
                        <span className="balance-due-val">₹{inv.balanceDue.toFixed(2)}</span>
                      ) : (
                        <span className="balance-zero">-</span>
                      )}
                    </td>
                    <td className="td-status">
                      <span className={`status-pill ${inv.status || inv.paymentStatus || 'paid'}`}>
                        {(inv.status || inv.paymentStatus) === 'partially_paid' || (inv.status || inv.paymentStatus) === 'partial'
                          ? 'PARTIAL'
                          : (inv.status || inv.paymentStatus || 'PAID').toUpperCase()}
                      </span>
                    </td>
                    <td className="td-actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => downloadInvoicePdf(inv)}
                        title="Download PDF"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#1a1d20',
                          padding: '4px 6px',
                        }}
                      >
                        <DownloadIcon size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setSelectedInvoiceForShare(inv)}
                        title="Share on WhatsApp, Email, or Link"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#c5a059',
                          padding: '4px 6px',
                        }}
                      >
                        <ShareIcon size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn-table-action"
                        onClick={() => setSelectedInvoiceForPreview(inv)}
                        title="Preview Invoice"
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#64748b',
                          padding: '4px 6px',
                        }}
                      >
                        <EyeIcon size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
