// ==============================================================================
// Luma Salon — Purchase & Supplier Management Dashboard Workspace
// Phase 6: Tabbed Hub for Suppliers, POs, Bills, GRN, Returns & Payments
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type {
  PurchaseKPIs,
  PurchaseOrder,
  PurchaseBill,
  GoodsReceipt,
  PurchaseReturn,
  SupplierPayment,
} from '../../../types/purchases.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import {
  downloadPurchaseOrderPdf,
  downloadPurchaseBillPdf,
  downloadGoodsReceiptPdf,
  downloadPurchaseReturnPdf,
} from '../../../services/purchasePdfService.ts'
import { SuppliersView } from './SuppliersView.tsx'
import { NewPurchaseOrderModal } from './NewPurchaseOrderModal.tsx'
import { GoodsReceiptModal } from './GoodsReceiptModal.tsx'
import { NewPurchaseBillModal } from './NewPurchaseBillModal.tsx'
import { NewPurchaseReturnModal } from './NewPurchaseReturnModal.tsx'
import { RecordSupplierPaymentModal } from './RecordSupplierPaymentModal.tsx'
import {
  PackageIcon,
  FileTextIcon,
  PlusIcon,
  DownloadIcon,
} from '../../../components/Icons'
import './PurchasesDashboardView.css'

interface Props {
  onNavigate?: (route: any) => void
}

export type PurchaseTab =
  | 'overview'
  | 'suppliers'
  | 'orders'
  | 'bills'
  | 'receipts'
  | 'returns'
  | 'payments'

export const PurchasesDashboardView: React.FC<Props> = () => {
  const [activeTab, setActiveTab] = useState<PurchaseTab>('overview')
  const [kpis, setKpis] = useState<PurchaseKPIs | null>(null)
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [bills, setBills] = useState<PurchaseBill[]>([])
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([])
  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [payments, setPayments] = useState<SupplierPayment[]>([])
  const [loading, setLoading] = useState(true)

  // Modal Triggers
  const [isPoModalOpen, setIsPoModalOpen] = useState(false)
  const [isGrnModalOpen, setIsGrnModalOpen] = useState(false)
  const [isBillModalOpen, setIsBillModalOpen] = useState(false)
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)

  // Preselected IDs for contextual opening
  const [targetPoId, setTargetPoId] = useState<string | undefined>()
  const [targetSupplierId, setTargetSupplierId] = useState<string | undefined>()
  const [targetBillId, setTargetBillId] = useState<string | undefined>()

  const loadData = async () => {
    setLoading(true)
    try {
      const [k, o, b, r, ret, p] = await Promise.all([
        purchaseService.getPurchaseKPIs(),
        purchaseService.getPurchaseOrders(),
        purchaseService.getPurchaseBills(),
        purchaseService.getGoodsReceipts(),
        purchaseService.getPurchaseReturns(),
        purchaseService.getSupplierPayments(),
      ])
      setKpis(k)
      setOrders(o)
      setBills(b)
      setReceipts(r)
      setReturns(ret)
      setPayments(p)
    } catch (err) {
      console.error('Failed to load purchases dashboard data:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOrderCreated = () => {
    loadData()
    setActiveTab('orders')
  }

  const handleReceiptCreated = () => {
    loadData()
    setActiveTab('receipts')
  }

  const handleBillCreated = () => {
    loadData()
    setActiveTab('bills')
  }

  const handleReturnCreated = () => {
    loadData()
    setActiveTab('returns')
  }

  const handlePaymentRecorded = () => {
    loadData()
    setActiveTab('payments')
  }

  return (
    <div className="purchases-hub-container">
      {/* Top Banner */}
      <div className="purchases-hub-header">
        <div>
          <div className="hub-tag">ACCOUNTS PAYABLE & SUPPLY CHAIN</div>
          <h1>Purchase & Supplier Management</h1>
          <p className="subtitle">
            Procure retail products, salon consumables, track goods receipts, and manage vendor balances
          </p>
        </div>

        <div className="hub-quick-actions">
          <button
            type="button"
            className="btn-action po"
            onClick={() => {
              setTargetPoId(undefined)
              setIsPoModalOpen(true)
            }}
          >
            <PlusIcon size={16} /> New Purchase Order
          </button>
          <button
            type="button"
            className="btn-action grn"
            onClick={() => {
              setTargetPoId(undefined)
              setIsGrnModalOpen(true)
            }}
          >
            <PackageIcon size={16} /> Record Goods Receipt
          </button>
          <button
            type="button"
            className="btn-action bill"
            onClick={() => {
              setTargetPoId(undefined)
              setIsBillModalOpen(true)
            }}
          >
            <FileTextIcon size={16} /> Enter Purchase Bill
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="purchases-nav-tabs">
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview & KPIs
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'suppliers' ? 'active' : ''}`}
          onClick={() => setActiveTab('suppliers')}
        >
          Suppliers
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          Purchase Orders ({orders.length})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'bills' ? 'active' : ''}`}
          onClick={() => setActiveTab('bills')}
        >
          Purchase Bills ({bills.length})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'receipts' ? 'active' : ''}`}
          onClick={() => setActiveTab('receipts')}
        >
          Goods Receipts ({receipts.length})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'returns' ? 'active' : ''}`}
          onClick={() => setActiveTab('returns')}
        >
          Returns ({returns.length})
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Supplier Payments ({payments.length})
        </button>
      </div>

      {/* Tab Contents */}
      <div className="purchases-tab-content">
        {loading ? (
          <div className="loading-state">Loading purchases data...</div>
        ) : activeTab === 'overview' ? (
          <div className="overview-tab-view">
            {/* KPI Cards Grid */}
            <div className="kpi-cards-grid">
              <div className="kpi-card">
                <span className="kpi-title">Total Purchases (All Time)</span>
                <span className="kpi-number">
                  Rs. {(kpis?.totalPurchases || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="kpi-sub">Across {bills.length} purchase bills</span>
              </div>

              <div className="kpi-card highlight-payable">
                <span className="kpi-title">Outstanding Supplier Payable</span>
                <span className="kpi-number text-danger">
                  Rs. {(kpis?.totalPayableBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="kpi-sub">{kpis?.outstandingBillsCount || 0} unpaid/partial bills</span>
              </div>

              <div className="kpi-card">
                <span className="kpi-title">Payments Made</span>
                <span className="kpi-number text-success">
                  Rs. {(kpis?.paymentsMadeTotal || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="kpi-sub">{payments.length} transactions recorded</span>
              </div>

              <div className="kpi-card">
                <span className="kpi-title">Open Purchase Orders</span>
                <span className="kpi-number">
                  {(kpis?.pendingOrdersCount || 0) + (kpis?.partiallyReceivedOrdersCount || 0)}
                </span>
                <span className="kpi-sub">
                  {kpis?.partiallyReceivedOrdersCount || 0} partially received
                </span>
              </div>
            </div>

            {/* Two Column Section: Recent POs & Bills */}
            <div className="overview-two-col">
              <div className="col-card">
                <div className="col-header">
                  <h3>Pending Purchase Orders</h3>
                  <button type="button" className="btn-link" onClick={() => setActiveTab('orders')}>
                    View All Orders &rarr;
                  </button>
                </div>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>PO #</th>
                      <th>Supplier</th>
                      <th>Status</th>
                      <th className="text-right">Total</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.slice(0, 5).map((o) => (
                      <tr key={o.id}>
                        <td><strong>{o.poNumber}</strong></td>
                        <td>{o.supplierName}</td>
                        <td><span className={`status-pill ${o.status}`}>{o.status.toUpperCase()}</span></td>
                        <td className="text-right">Rs. {o.totalAmount.toFixed(2)}</td>
                        <td className="text-right">
                          {(o.status === 'submitted' || o.status === 'partially_received') && (
                            <button
                              type="button"
                              className="btn-mini-grn"
                              onClick={() => {
                                setTargetPoId(o.id)
                                setIsGrnModalOpen(true)
                              }}
                            >
                              Receive
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="col-card">
                <div className="col-header">
                  <h3>Outstanding Purchase Bills</h3>
                  <button type="button" className="btn-link" onClick={() => setActiveTab('bills')}>
                    View All Bills &rarr;
                  </button>
                </div>
                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Bill #</th>
                      <th>Supplier</th>
                      <th>Due Date</th>
                      <th className="text-right">Balance Due</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.filter((b) => b.balanceDue > 0).slice(0, 5).map((b) => (
                      <tr key={b.id}>
                        <td><strong>{b.billNumber}</strong></td>
                        <td>{b.supplierName}</td>
                        <td>{b.dueDate}</td>
                        <td className="text-right text-danger font-bold">Rs. {b.balanceDue.toFixed(2)}</td>
                        <td className="text-right">
                          <button
                            type="button"
                            className="btn-mini-pay"
                            onClick={() => {
                              setTargetSupplierId(b.supplierId)
                              setTargetBillId(b.id)
                              setIsPaymentModalOpen(true)
                            }}
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : activeTab === 'suppliers' ? (
          <SuppliersView
            onNewOrderForSupplier={(supId) => {
              setTargetSupplierId(supId)
              setIsPoModalOpen(true)
            }}
            onRecordPaymentForSupplier={(supId) => {
              setTargetSupplierId(supId)
              setTargetBillId(undefined)
              setIsPaymentModalOpen(true)
            }}
          />
        ) : activeTab === 'orders' ? (
          <div className="tab-pane-view">
            <div className="pane-toolbar">
              <h2>Purchase Orders</h2>
              <button
                type="button"
                className="btn-action po"
                onClick={() => {
                  setTargetPoId(undefined)
                  setIsPoModalOpen(true)
                }}
              >
                <PlusIcon size={16} /> New Purchase Order
              </button>
            </div>
            <table className="hub-data-table">
              <thead>
                <tr>
                  <th>PO Number</th>
                  <th>Supplier</th>
                  <th>Order Date</th>
                  <th>Expected Delivery</th>
                  <th>Status</th>
                  <th className="text-right">Subtotal</th>
                  <th className="text-right">Tax</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-4">No purchase orders found.</td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id}>
                      <td><strong>{o.poNumber}</strong></td>
                      <td>{o.supplierName}</td>
                      <td>{o.orderDate}</td>
                      <td>{o.expectedDeliveryDate || '-'}</td>
                      <td><span className={`status-pill ${o.status}`}>{o.status.toUpperCase()}</span></td>
                      <td className="text-right">Rs. {o.subtotal.toFixed(2)}</td>
                      <td className="text-right">Rs. {o.taxAmount.toFixed(2)}</td>
                      <td className="text-right font-bold">Rs. {o.totalAmount.toFixed(2)}</td>
                      <td className="text-right actions-cell">
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Download PO PDF"
                          onClick={() => downloadPurchaseOrderPdf(o)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                        {(o.status === 'submitted' || o.status === 'partially_received') && (
                          <button
                            type="button"
                            className="btn-table-action grn"
                            onClick={() => {
                              setTargetPoId(o.id)
                              setIsGrnModalOpen(true)
                            }}
                          >
                            Receive
                          </button>
                        )}
                        {o.status === 'draft' && (
                          <button
                            type="button"
                            className="btn-table-action submit"
                            onClick={async () => {
                              await purchaseService.submitPurchaseOrder(o.id)
                              loadData()
                            }}
                          >
                            Submit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'bills' ? (
          <div className="tab-pane-view">
            <div className="pane-toolbar">
              <h2>Purchase Bills (Supplier Invoices)</h2>
              <button
                type="button"
                className="btn-action bill"
                onClick={() => {
                  setTargetPoId(undefined)
                  setIsBillModalOpen(true)
                }}
              >
                <PlusIcon size={16} /> Enter Purchase Bill
              </button>
            </div>
            <table className="hub-data-table">
              <thead>
                <tr>
                  <th>Bill #</th>
                  <th>Supplier Inv #</th>
                  <th>Supplier</th>
                  <th>Bill Date</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th className="text-right">Total Amount</th>
                  <th className="text-right">Paid</th>
                  <th className="text-right">Balance Due</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-4">No purchase bills recorded.</td>
                  </tr>
                ) : (
                  bills.map((b) => (
                    <tr key={b.id}>
                      <td><strong>{b.billNumber}</strong></td>
                      <td>{b.supplierInvoiceNumber}</td>
                      <td>{b.supplierName}</td>
                      <td>{b.billDate}</td>
                      <td>{b.dueDate}</td>
                      <td><span className={`status-pill ${b.status}`}>{b.status.toUpperCase()}</span></td>
                      <td className="text-right">Rs. {b.totalAmount.toFixed(2)}</td>
                      <td className="text-right text-success">Rs. {b.paidAmount.toFixed(2)}</td>
                      <td className="text-right text-danger font-bold">Rs. {b.balanceDue.toFixed(2)}</td>
                      <td className="text-right actions-cell">
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Download Bill PDF"
                          onClick={() => downloadPurchaseBillPdf(b)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                        {b.balanceDue > 0 && (
                          <button
                            type="button"
                            className="btn-table-action pay"
                            onClick={() => {
                              setTargetSupplierId(b.supplierId)
                              setTargetBillId(b.id)
                              setIsPaymentModalOpen(true)
                            }}
                          >
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'receipts' ? (
          <div className="tab-pane-view">
            <div className="pane-toolbar">
              <h2>Goods Receipts (Stock Intake GRN)</h2>
              <button
                type="button"
                className="btn-action grn"
                onClick={() => {
                  setTargetPoId(undefined)
                  setIsGrnModalOpen(true)
                }}
              >
                <PlusIcon size={16} /> Record Goods Receipt
              </button>
            </div>
            <table className="hub-data-table">
              <thead>
                <tr>
                  <th>GRN #</th>
                  <th>Supplier</th>
                  <th>Ref PO</th>
                  <th>Received Date</th>
                  <th>Received By</th>
                  <th>Notes</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {receipts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4">No goods receipts found.</td>
                  </tr>
                ) : (
                  receipts.map((r) => (
                    <tr key={r.id}>
                      <td><strong>{r.grnNumber}</strong></td>
                      <td>{r.supplierName}</td>
                      <td>{r.poNumber || <span className="text-muted">Direct</span>}</td>
                      <td>{r.receivedDate}</td>
                      <td>{r.receivedBy}</td>
                      <td>{r.notes || '-'}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Download GRN PDF"
                          onClick={() => downloadGoodsReceiptPdf(r)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : activeTab === 'returns' ? (
          <div className="tab-pane-view">
            <div className="pane-toolbar">
              <h2>Purchase Returns & Vendor Debit Notes</h2>
              <button
                type="button"
                className="btn-action return"
                onClick={() => setIsReturnModalOpen(true)}
              >
                <PlusIcon size={16} /> Record Purchase Return
              </button>
            </div>
            <table className="hub-data-table">
              <thead>
                <tr>
                  <th>Return #</th>
                  <th>Supplier</th>
                  <th>Return Date</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th className="text-right">Total Credit Value</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {returns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4">No purchase returns recorded.</td>
                  </tr>
                ) : (
                  returns.map((ret) => (
                    <tr key={ret.id}>
                      <td><strong>{ret.returnNumber}</strong></td>
                      <td>{ret.supplierName}</td>
                      <td>{ret.returnDate}</td>
                      <td><span className={`status-pill ${ret.status}`}>{ret.status.toUpperCase()}</span></td>
                      <td>{ret.reason}</td>
                      <td className="text-right font-bold text-danger">Rs. {ret.totalAmount.toFixed(2)}</td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-icon-action"
                          title="Download Return PDF"
                          onClick={() => downloadPurchaseReturnPdf(ret)}
                        >
                          <DownloadIcon size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="tab-pane-view">
            <div className="pane-toolbar">
              <h2>Supplier Payments & Advance Allocations</h2>
              <button
                type="button"
                className="btn-action pay"
                onClick={() => {
                  setTargetSupplierId(undefined)
                  setTargetBillId(undefined)
                  setIsPaymentModalOpen(true)
                }}
              >
                <PlusIcon size={16} /> Record Supplier Payment
              </button>
            </div>
            <table className="hub-data-table">
              <thead>
                <tr>
                  <th>Payment #</th>
                  <th>Supplier</th>
                  <th>Payment Date</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Allocated</th>
                  <th className="text-right">Unallocated Advance</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-4">No supplier payments recorded.</td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.id}>
                      <td><strong>{p.paymentNumber}</strong></td>
                      <td>{p.supplierName}</td>
                      <td>{p.paymentDate}</td>
                      <td><span className="cat-pill">{p.paymentMethod.toUpperCase()}</span></td>
                      <td>{p.transactionReference || '-'}</td>
                      <td className="text-right font-bold text-success">Rs. {p.amount.toFixed(2)}</td>
                      <td className="text-right">Rs. {p.allocatedAmount.toFixed(2)}</td>
                      <td className="text-right font-bold text-primary">
                        {p.unallocatedAmount > 0 ? `Rs. ${p.unallocatedAmount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <NewPurchaseOrderModal
        isOpen={isPoModalOpen}
        preselectedSupplierId={targetSupplierId}
        onClose={() => setIsPoModalOpen(false)}
        onSuccess={handleOrderCreated}
      />

      <GoodsReceiptModal
        isOpen={isGrnModalOpen}
        preselectedPoId={targetPoId}
        onClose={() => setIsGrnModalOpen(false)}
        onSuccess={handleReceiptCreated}
      />

      <NewPurchaseBillModal
        isOpen={isBillModalOpen}
        preselectedSupplierId={targetSupplierId}
        preselectedPoId={targetPoId}
        onClose={() => setIsBillModalOpen(false)}
        onSuccess={handleBillCreated}
      />

      <NewPurchaseReturnModal
        isOpen={isReturnModalOpen}
        preselectedSupplierId={targetSupplierId}
        onClose={() => setIsReturnModalOpen(false)}
        onSuccess={handleReturnCreated}
      />

      <RecordSupplierPaymentModal
        isOpen={isPaymentModalOpen}
        preselectedSupplierId={targetSupplierId}
        preselectedBillId={targetBillId}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={handlePaymentRecorded}
      />
    </div>
  )
}
