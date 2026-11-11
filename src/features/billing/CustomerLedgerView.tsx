// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 4
// Customer Financial Ledger & Statement View (`billing/ledger`)
// Running Balances, Chronological Events, PDF Statement Export & Advances
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { NavId } from '../../types/salon.ts'
import type { Client } from '../../types/models.ts'
import type { CustomerLedgerData } from '../../types/finance.ts'
import { customerLedgerService } from '../../services/customerLedgerService.ts'
import { clientService } from '../../services/clientService.ts'
import { billingService } from '../../services/billingService.ts'
import { downloadCustomerStatementPdf } from '../../services/statementPdfService.ts'
import { RecordAdvanceModal } from './components/RecordAdvanceModal.tsx'
import { PaymentReminderModal } from './components/PaymentReminderModal.tsx'
import {
  FileTextIcon,
  DownloadIcon,
  RefreshCwIcon,
  PlusIcon,
  ShareIcon,
  UsersIcon,
} from '../../components/Icons.tsx'
import './CustomerLedgerView.css'

interface CustomerLedgerViewProps {
  onNavigate?: (navId: NavId) => void
}

export const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({ onNavigate }) => {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [ledgerData, setLedgerData] = useState<CustomerLedgerData | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false)
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false)
  const [selectedInvoiceForReminder, setSelectedInvoiceForReminder] = useState<any | null>(null)

  // 1. Load clients
  useEffect(() => {
    clientService
      .getClients()
      .then((data) => {
        setClients(data)
        if (data.length > 0 && !selectedClientId) {
          setSelectedClientId(data[0].id)
        }
      })
      .catch(console.error)
  }, [])

  // 2. Load ledger for selected client
  const loadLedger = async (clientId: string, start?: string, end?: string) => {
    if (!clientId) return
    try {
      setIsLoading(true)
      const data = await customerLedgerService.getCustomerLedger(clientId, undefined, start, end)
      setLedgerData(data)
      setIsLoading(false)
    } catch (err) {
      console.error(err)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (selectedClientId) {
      loadLedger(selectedClientId, startDate || undefined, endDate || undefined)
    }
  }, [selectedClientId, startDate, endDate])

  const selectedClient = clients.find((c) => c.id === selectedClientId)

  const formatCurrency = (amt: number) =>
    `₹${amt.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`

  const handleDownloadPdf = () => {
    if (!ledgerData || !selectedClient) return
    downloadCustomerStatementPdf({
      client: {
        id: selectedClient.id,
        name: selectedClient.name,
        phone: selectedClient.phone,
        email: selectedClient.email,
      },
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      summary: ledgerData.summary,
      transactions: ledgerData.transactions,
    })
  }

  const handleOpenReminder = async () => {
    if (!selectedClient) return
    // Find latest unpaid invoice for this client
    try {
      const invoices = await billingService.fetchInvoicesAsync()
      const unpaid = invoices.find(
        (inv) => !inv.isDraft && inv.clientId === selectedClient.id && (inv.balanceDue || 0) > 0
      )
      if (unpaid) {
        setSelectedInvoiceForReminder({
          id: unpaid.id,
          invoiceNumber: unpaid.invoiceNumber,
          clientName: selectedClient.name,
          clientId: selectedClient.id,
          clientPhone: selectedClient.phone,
          clientEmail: selectedClient.email,
          balanceDue: unpaid.balanceDue || 0,
        })
        setIsReminderModalOpen(true)
      } else {
        alert('This customer does not have any unpaid invoices with an outstanding balance.')
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="customer-ledger-view">
      {/* Header */}
      <header className="cl-header">
        <div className="cl-header-title">
          <div className="cl-badge">
            <span className="cl-badge-dot"></span>
            Accounts &amp; Balances
          </div>
          <h1>Customer Financial Ledger</h1>
          <p className="cl-subtitle">
            Complete transaction history, running balances, advance credits, refunds and account statements.
          </p>
        </div>

        <div className="cl-header-actions">
          <button
            className="btn btn-secondary-outline"
            onClick={() => loadLedger(selectedClientId, startDate, endDate)}
            disabled={isLoading || !selectedClientId}
          >
            <RefreshCwIcon size={16} className={isLoading ? 'spinning' : ''} />
            <span>Refresh</span>
          </button>
          <button
            className="btn btn-secondary-outline"
            onClick={handleDownloadPdf}
            disabled={!ledgerData || isLoading}
          >
            <DownloadIcon size={16} />
            <span>Download Statement PDF</span>
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsAdvanceModalOpen(true)}
          >
            <PlusIcon size={16} />
            <span>Record Advance</span>
          </button>
        </div>
      </header>

      {/* Customer Selector & Profile Bar */}
      <div className="cl-client-selector-card">
        <div className="selector-field">
          <label htmlFor="client-search-select">
            <UsersIcon size={16} /> Select Customer
          </label>
          <select
            id="client-search-select"
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="cl-client-select"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `(${c.phone})` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedClient && (
          <div className="selected-client-profile">
            <div className="profile-detail">
              <span className="detail-label">Phone</span>
              <span className="detail-val">{selectedClient.phone || '—'}</span>
            </div>
            <div className="profile-detail">
              <span className="detail-label">Email</span>
              <span className="detail-val">{selectedClient.email || '—'}</span>
            </div>
            <div className="profile-detail">
              <span className="detail-label">Client ID</span>
              <span className="detail-val mono">{selectedClient.id}</span>
            </div>
            {ledgerData && ledgerData.summary.total_outstanding > 0 && (
              <div className="profile-actions">
                <button
                  type="button"
                  className="btn btn-reminder"
                  onClick={handleOpenReminder}
                >
                  <ShareIcon size={14} /> Send Reminder
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Financial Summary Cards */}
      {ledgerData && (
        <div className="cl-summary-grid">
          <div className="cl-summary-card">
            <span className="sum-label">Total Invoiced</span>
            <span className="sum-val">{formatCurrency(ledgerData.summary.total_invoiced)}</span>
            <span className="sum-sub">Gross Billed Value</span>
          </div>

          <div className="cl-summary-card">
            <span className="sum-label">Total Paid</span>
            <span className="sum-val text-success">
              {formatCurrency(ledgerData.summary.total_paid)}
            </span>
            <span className="sum-sub">Settled Receipts</span>
          </div>

          <div className="cl-summary-card">
            <span className="sum-label">Available Advance</span>
            <span className="sum-val text-gold">
              {formatCurrency(ledgerData.summary.available_advance)}
            </span>
            <span className="sum-sub">
              Total Deposits: {formatCurrency(ledgerData.summary.total_advance)}
            </span>
          </div>

          <div className="cl-summary-card">
            <span className="sum-label">Available Credit Note</span>
            <span className="sum-val text-info">
              {formatCurrency(ledgerData.summary.available_credit)}
            </span>
            <span className="sum-sub">
              Total Credits: {formatCurrency(ledgerData.summary.total_credit_notes)}
            </span>
          </div>

          <div
            className={`cl-summary-card highlight ${
              ledgerData.summary.net_customer_balance > 0
                ? 'balance-due'
                : 'balance-settled'
            }`}
          >
            <span className="sum-label">Net Customer Balance</span>
            <span className="sum-val balance-grand">
              {formatCurrency(Math.abs(ledgerData.summary.net_customer_balance))}
            </span>
            <span className="sum-sub">
              {ledgerData.summary.net_customer_balance > 0
                ? 'Outstanding Due to Salon'
                : ledgerData.summary.net_customer_balance < 0
                ? 'Credit Balance (In Customer Favor)'
                : 'All Invoices Settled'}
            </span>
          </div>
        </div>
      )}

      {/* Date Filter Toolbar */}
      <div className="cl-filter-toolbar">
        <div className="cl-filter-left">
          <span className="filter-title">Transaction Filter:</span>
          <div className="date-input-group">
            <label htmlFor="ledger-start-date">From:</label>
            <input
              id="ledger-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="date-input"
            />
          </div>
          <div className="date-input-group">
            <label htmlFor="ledger-end-date">To:</label>
            <input
              id="ledger-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="date-input"
            />
          </div>
          {(startDate || endDate) && (
            <button
              className="btn-clear-date"
              onClick={() => {
                setStartDate('')
                setEndDate('')
              }}
            >
              Reset
            </button>
          )}
        </div>

        <div className="cl-filter-right">
          <span className="tx-count">
            {ledgerData?.transactions.length || 0} ledger events
          </span>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="cl-table-container">
        {isLoading ? (
          <div className="cl-loading-state">
            <RefreshCwIcon size={24} className="spinning" />
            <p>Loading ledger entries...</p>
          </div>
        ) : !ledgerData || ledgerData.transactions.length === 0 ? (
          <div className="cl-empty-state">
            <FileTextIcon size={36} />
            <h3>No Transactions Recorded</h3>
            <p>This customer does not have any financial transactions for the selected range.</p>
          </div>
        ) : (
          <table className="cl-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Transaction Type</th>
                <th>Reference #</th>
                <th>Description</th>
                <th className="text-right">Debit (Owed)</th>
                <th className="text-right">Credit (Paid)</th>
                <th className="text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {ledgerData.transactions.map((tx, idx) => {
                const isDebit = tx.debit_amount > 0
                const isCredit = tx.credit_amount > 0

                return (
                  <tr key={`${tx.reference}-${idx}`}>
                    <td>
                      <span className="tx-date">{tx.event_date}</span>
                    </td>
                    <td>
                      <span className={`tx-badge tx-${tx.transaction_type.toLowerCase()}`}>
                        {tx.transaction_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      {tx.transaction_type === 'INVOICE' && onNavigate ? (
                        <button
                          className="invoice-link-btn"
                          onClick={() => onNavigate('billing/invoices')}
                          title="View invoice"
                        >
                          #{tx.reference}
                        </button>
                      ) : (
                        <span className="tx-ref">{tx.reference}</span>
                      )}
                    </td>
                    <td>
                      <span className="tx-desc">{tx.description}</span>
                    </td>
                    <td className="text-right">
                      {isDebit ? (
                        <span className="text-debit">{formatCurrency(tx.debit_amount)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {isCredit ? (
                        <span className="text-credit">{formatCurrency(tx.credit_amount)}</span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span
                        className={`text-balance ${
                          (tx.running_balance || 0) > 0
                            ? 'bal-positive'
                            : (tx.running_balance || 0) < 0
                            ? 'bal-negative'
                            : 'bal-zero'
                        }`}
                      >
                        {formatCurrency(tx.running_balance || 0)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Record Advance Modal */}
      <RecordAdvanceModal
        isOpen={isAdvanceModalOpen}
        onClose={() => setIsAdvanceModalOpen(false)}
        onSuccess={() => {
          if (selectedClientId) {
            loadLedger(selectedClientId, startDate, endDate)
          }
        }}
        preselectedClientId={selectedClientId}
      />

      {/* Payment Reminder Modal */}
      <PaymentReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        onSuccess={() => {}}
        invoice={selectedInvoiceForReminder}
      />
    </div>
  )
}
