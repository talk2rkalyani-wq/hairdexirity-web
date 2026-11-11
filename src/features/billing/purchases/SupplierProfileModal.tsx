// ==============================================================================
// Luma Salon — Supplier Profile Drawer / Modal
// Phase 6: Supplier Contact, Financial Overview, History & Ledger
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, SupplierLedgerEntry, PurchaseBill, PurchaseOrder } from '../../../types/purchases.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { CloseIcon } from '../../../components/Icons'
import './SupplierProfileModal.css'

interface Props {
  supplierId: string | null
  isOpen: boolean
  onClose: () => void
  onRecordPayment?: (supplierId: string) => void
  onNewOrder?: (supplierId: string) => void
}

export const SupplierProfileModal: React.FC<Props> = ({
  supplierId,
  isOpen,
  onClose,
  onRecordPayment,
  onNewOrder,
}) => {
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [ledger, setLedger] = useState<SupplierLedgerEntry[]>([])
  const [bills, setBills] = useState<PurchaseBill[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'ledger' | 'bills' | 'orders'>('overview')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !supplierId) return
    setLoading(true)

    Promise.all([
      purchaseService.getSupplierById(supplierId),
      purchaseService.getSupplierLedger(supplierId),
      purchaseService.getPurchaseBills(),
      purchaseService.getPurchaseOrders(),
    ])
      .then(([sup, led, allBills, allOrders]) => {
        setSupplier(sup)
        setLedger(led)
        setBills(allBills.filter((b) => b.supplierId === supplierId))
        setOrders(allOrders.filter((o) => o.supplierId === supplierId))
      })
      .catch((err) => console.error('Failed to load supplier details:', err))
      .finally(() => setLoading(false))
  }, [isOpen, supplierId])

  if (!isOpen || !supplierId) return null

  return (
    <div className="supplier-modal-backdrop" onClick={onClose}>
      <div className="supplier-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="supplier-modal-header">
          <div>
            <div className="supplier-code-badge">{supplier?.supplierCode || 'SUPPLIER'}</div>
            <h2>{supplier?.name || 'Loading Supplier...'}</h2>
            <div className="supplier-category-pill">{supplier?.category}</div>
          </div>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="supplier-modal-tabs">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview & Details
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            Supplier Ledger ({ledger.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'bills' ? 'active' : ''}`}
            onClick={() => setActiveTab('bills')}
          >
            Purchase Bills ({bills.length})
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            Orders ({orders.length})
          </button>
        </div>

        <div className="supplier-modal-body">
          {loading ? (
            <div className="loading-state">Loading supplier data...</div>
          ) : !supplier ? (
            <div className="error-state">Supplier details not found.</div>
          ) : activeTab === 'overview' ? (
            <div className="tab-pane overview-pane">
              {/* Financial KPI Cards */}
              <div className="supplier-financial-cards">
                <div className="fin-card">
                  <span className="fin-label">Total Purchases</span>
                  <span className="fin-val">Rs. {(supplier.totalPurchases || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-card">
                  <span className="fin-label">Total Payments</span>
                  <span className="fin-val">Rs. {(supplier.totalPayments || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-card">
                  <span className="fin-label">Returns / Credits</span>
                  <span className="fin-val">Rs. {(supplier.totalReturns || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="fin-card highlight">
                  <span className="fin-label">Outstanding Payable</span>
                  <span className={`fin-val ${(supplier.outstandingPayable || 0) > 0 ? 'text-danger' : 'text-success'}`}>
                    Rs. {(supplier.outstandingPayable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Contact Information */}
              <div className="supplier-details-grid">
                <div className="details-section">
                  <h3>Contact Details</h3>
                  <p><strong>Contact Person:</strong> {supplier.contactPerson || '-'}</p>
                  <p><strong>Phone:</strong> {supplier.phone}</p>
                  <p><strong>Email:</strong> {supplier.email || '-'}</p>
                  <p><strong>Address:</strong> {supplier.address ? `${supplier.address}, ${supplier.city || ''} ${supplier.state || ''} ${supplier.pincode || ''}` : '-'}</p>
                </div>
                <div className="details-section">
                  <h3>Tax & Regulatory Details</h3>
                  <p><strong>GSTIN:</strong> {supplier.gstin || 'Unregistered'}</p>
                  <p><strong>PAN:</strong> {supplier.pan || '-'}</p>
                  <p><strong>Status:</strong> <span className={`status-badge status-${supplier.status}`}>{supplier.status.toUpperCase()}</span></p>
                  <p><strong>Opening Balance:</strong> Rs. {supplier.openingBalance.toFixed(2)}</p>
                  {supplier.notes && <p><strong>Notes:</strong> {supplier.notes}</p>}
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="supplier-actions-bar">
                {onNewOrder && (
                  <button
                    type="button"
                    className="action-btn primary"
                    onClick={() => {
                      onClose()
                      onNewOrder(supplier.id)
                    }}
                  >
                    + New Purchase Order
                  </button>
                )}
                {onRecordPayment && (
                  <button
                    type="button"
                    className="action-btn secondary"
                    onClick={() => {
                      onClose()
                      onRecordPayment(supplier.id)
                    }}
                  >
                    Record Supplier Payment
                  </button>
                )}
              </div>
            </div>
          ) : activeTab === 'ledger' ? (
            <div className="tab-pane ledger-pane">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Reference</th>
                    <th>Description</th>
                    <th className="text-right">Debit (Paid/Ret)</th>
                    <th className="text-right">Credit (Bills)</th>
                    <th className="text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-4">No ledger transactions recorded yet.</td>
                    </tr>
                  ) : (
                    ledger.map((entry) => (
                      <tr key={entry.id}>
                        <td>{entry.transactionDate}</td>
                        <td><span className="type-tag">{entry.transactionType.replace('_', ' ')}</span></td>
                        <td><strong>{entry.referenceId}</strong></td>
                        <td>{entry.description}</td>
                        <td className="text-right text-success">{entry.debit > 0 ? `Rs. ${entry.debit.toFixed(2)}` : '-'}</td>
                        <td className="text-right text-danger">{entry.credit > 0 ? `Rs. ${entry.credit.toFixed(2)}` : '-'}</td>
                        <td className="text-right font-bold">Rs. {entry.runningBalance.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'bills' ? (
            <div className="tab-pane bills-pane">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bill #</th>
                    <th>Supplier Inv #</th>
                    <th>Date</th>
                    <th>Due Date</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Paid</th>
                    <th className="text-right">Balance Due</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-4">No purchase bills found.</td>
                    </tr>
                  ) : (
                    bills.map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.billNumber}</strong></td>
                        <td>{b.supplierInvoiceNumber}</td>
                        <td>{b.billDate}</td>
                        <td>{b.dueDate}</td>
                        <td><span className={`status-pill ${b.status}`}>{b.status.toUpperCase()}</span></td>
                        <td className="text-right">Rs. {b.totalAmount.toFixed(2)}</td>
                        <td className="text-right text-success">Rs. {b.paidAmount.toFixed(2)}</td>
                        <td className="text-right text-danger">Rs. {b.balanceDue.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="tab-pane orders-pane">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>PO #</th>
                    <th>Date</th>
                    <th>Expected Delivery</th>
                    <th>Status</th>
                    <th className="text-right">Total Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-4">No purchase orders found.</td>
                    </tr>
                  ) : (
                    orders.map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.poNumber}</strong></td>
                        <td>{o.orderDate}</td>
                        <td>{o.expectedDeliveryDate || '-'}</td>
                        <td><span className={`status-pill ${o.status}`}>{o.status.toUpperCase()}</span></td>
                        <td className="text-right">Rs. {o.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
