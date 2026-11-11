// ==============================================================================
// Luma Salon — Physical Stock Audit & Reconciliation Modal
// Phase 7: Stocktake Sessions, Count Verification & Owner Reconciliation
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { StockAuditSession, StockAuditItem } from '../../../types/inventory.ts'
import { inventoryService } from '../../../services/inventoryService.ts'
import { CloseIcon, ClipboardCheckIcon, PlusIcon, CheckCircleIcon } from '../../../components/Icons.tsx'
import './StockAuditModal.css'

interface Props {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  existingSessionId?: string
}

export const StockAuditModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  existingSessionId,
}) => {
  const [activeSession, setActiveSession] = useState<StockAuditSession | null>(null)
  const [auditItems, setAuditItems] = useState<StockAuditItem[]>([])
  const [counts, setCounts] = useState<{ [itemId: string]: number }>({})
  const [itemNotes, setItemNotes] = useState<{ [itemId: string]: string }>({})

  // Form for new session
  const [scope, setScope] = useState<'ALL' | 'RETAIL' | 'CONSUMABLE' | 'CATEGORY'>('ALL')
  const [category, setCategory] = useState<string>('')
  const [sessionNotes, setSessionNotes] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      if (existingSessionId) {
        loadSessionDetails(existingSessionId)
      } else {
        checkExistingDraft()
      }
    }
  }, [isOpen, existingSessionId])

  const checkExistingDraft = async () => {
    try {
      setLoading(true)
      const sessions = await inventoryService.getStockAuditSessions()
      const inProgress = sessions.find((s) => s.status === 'in_progress' || s.status === 'draft')
      if (inProgress) {
        await loadSessionDetails(inProgress.id)
      } else {
        setActiveSession(null)
      }
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadSessionDetails = async (sessionId: string) => {
    try {
      setLoading(true)
      const sessions = await inventoryService.getStockAuditSessions()
      const sess = sessions.find((s) => s.id === sessionId)
      if (sess) {
        setActiveSession(sess)
        const items = await inventoryService.getStockAuditItems(sessionId)
        setAuditItems(items)
        // Populate current entered counts
        const initialCounts: { [k: string]: number } = {}
        const initialNotes: { [k: string]: string } = {}
        items.forEach((it) => {
          initialCounts[it.productId] = it.countedQuantity !== undefined && it.countedQuantity !== null ? it.countedQuantity : it.systemQuantity
          initialNotes[it.productId] = it.discrepancyReason || ''
        })
        setCounts(initialCounts)
        setItemNotes(initialNotes)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load audit items')
    } finally {
      setLoading(false)
    }
  }

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const sess = await inventoryService.createStockAuditSession({
        title: scope === 'ALL' ? 'Salon Stocktake' : `${scope} Audit`,
        categoryFilter: scope === 'CATEGORY' ? category : undefined,
        itemTypeFilter: scope === 'RETAIL' ? 'retail' : scope === 'CONSUMABLE' ? 'consumable' : undefined,
        notes: sessionNotes.trim() || undefined,
      })
      await loadSessionDetails(sess.id)
      setSuccessMsg(`Audit session ${sess.auditNumber} initiated with frozen stock snapshot!`)
    } catch (err: any) {
      setError(err.message || 'Failed to start stock audit session')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveCounts = async () => {
    if (!activeSession) return
    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const payload = auditItems.map((item) => ({
        productId: item.productId,
        countedQuantity: counts[item.productId] !== undefined ? counts[item.productId] : item.systemQuantity,
        discrepancyReason: itemNotes[item.productId] || undefined,
      }))
      await inventoryService.recordStockAuditCounts(activeSession.id, payload)
      await loadSessionDetails(activeSession.id)
      setSuccessMsg('Physical counts saved successfully.')
    } catch (err: any) {
      setError(err.message || 'Failed to save counts')
    } finally {
      setLoading(false)
    }
  }

  const handleReconcile = async () => {
    if (!activeSession) return
    if (
      !window.confirm(
        'Are you sure you want to reconcile this audit? Compensating stock adjustment records will be created immediately for all discrepancies.'
      )
    ) {
      return
    }

    setLoading(true)
    setError(null)
    setSuccessMsg(null)
    try {
      // First save current counts
      const payload = auditItems.map((item) => ({
        productId: item.productId,
        countedQuantity: counts[item.productId] !== undefined ? counts[item.productId] : item.systemQuantity,
        discrepancyReason: itemNotes[item.productId] || undefined,
      }))
      await inventoryService.recordStockAuditCounts(activeSession.id, payload)

      // Reconcile
      await inventoryService.reconcileStockAudit(activeSession.id, 'Approved and reconciled by Owner')
      setSuccessMsg('Audit reconciled successfully! Inventory stock levels updated.')
      onSuccess()
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch (err: any) {
      setError(err.message || 'Failed to reconcile audit session')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  // Calculate live variance summary
  let totalDiscrepancies = 0
  let netVarianceValue = 0
  auditItems.forEach((item) => {
    const phys = counts[item.productId] !== undefined ? counts[item.productId] : item.systemQuantity
    const diff = phys - item.systemQuantity
    if (Math.abs(diff) > 0.001) {
      totalDiscrepancies++
      netVarianceValue += diff * (item.unitCost || 0)
    }
  })

  return (
    <div className="stock-audit-modal-overlay">
      <div className="stock-audit-modal-content">
        <div className="stock-audit-modal-header">
          <div className="header-title">
            <ClipboardCheckIcon size={20} className="icon-audit" />
            <div>
              <h3>
                {activeSession
                  ? `Stocktake Audit: ${activeSession.auditNumber}`
                  : 'Start Physical Stock Audit'}
              </h3>
              {activeSession && (
                <span className="audit-subtitle">
                  Scope: {activeSession.categoryFilter || activeSession.itemTypeFilter || 'All'} | Status:{' '}
                  <span className={`status-tag ${activeSession.status}`}>{activeSession.status}</span>
                </span>
              )}
            </div>
          </div>
          <button className="btn-close" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        {error && <div className="audit-error-banner">{error}</div>}
        {successMsg && <div className="audit-success-banner">{successMsg}</div>}

        {!activeSession ? (
          <form onSubmit={handleStartSession} className="audit-start-form">
            <p className="audit-intro">
              Initiating a physical audit takes an instant, frozen snapshot of expected stock levels.
              You can then count physical inventory items and reconcile any variance.
            </p>

            <div className="form-group">
              <label>Audit Scope *</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                required
              >
                <option value="ALL">Entire Salon Inventory (All Items)</option>
                <option value="RETAIL">Retail Products Only</option>
                <option value="CONSUMABLE">Salon Consumables Only</option>
                <option value="CATEGORY">Specific Category</option>
              </select>
            </div>

            {scope === 'CATEGORY' && (
              <div className="form-group">
                <label>Category Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Hair Care, Color Bar, Skin Treatment"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label>Audit Purpose / Notes (Optional)</label>
              <textarea
                rows={2}
                placeholder="e.g. End of month physical inventory count"
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
              />
            </div>

            <div className="audit-modal-footer">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={loading}>
                <PlusIcon size={16} />
                {loading ? 'Creating Snapshot...' : 'Create Audit Session'}
              </button>
            </div>
          </form>
        ) : (
          <div className="audit-session-body">
            {/* Live Stats */}
            <div className="audit-kpi-bar">
              <div className="kpi-mini">
                <span className="lbl">Total Items</span>
                <span className="val">{auditItems.length}</span>
              </div>
              <div className="kpi-mini">
                <span className="lbl">Discrepancies</span>
                <span className={`val ${totalDiscrepancies > 0 ? 'text-amber' : 'text-green'}`}>
                  {totalDiscrepancies}
                </span>
              </div>
              <div className="kpi-mini">
                <span className="lbl">Net Variance Value</span>
                <span className={`val ${netVarianceValue < 0 ? 'text-red' : netVarianceValue > 0 ? 'text-green' : ''}`}>
                  ₹{netVarianceValue.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Table of items */}
            <div className="audit-table-wrapper">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Item & SKU</th>
                    <th className="text-right">Expected Qty</th>
                    <th className="text-right" style={{ width: '120px' }}>
                      Physical Count
                    </th>
                    <th className="text-right">Variance</th>
                    <th className="text-right">Variance Value</th>
                    <th>Count Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.map((item) => {
                    const phys = counts[item.productId] !== undefined ? counts[item.productId] : item.systemQuantity
                    const variance = phys - item.systemQuantity
                    const varVal = variance * (item.unitCost || 0)
                    const isDiff = Math.abs(variance) > 0.001

                    return (
                      <tr key={item.id} className={isDiff ? 'row-discrepancy' : ''}>
                        <td>
                          <div className="item-name">{item.productName || item.productId}</div>
                          <div className="item-sku">{item.sku || 'SKU'}</div>
                        </td>
                        <td className="text-right font-medium">{item.systemQuantity}</td>
                        <td className="text-right">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            className="input-count"
                            value={phys}
                            disabled={activeSession.status === 'reconciled'}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              setCounts((prev) => ({ ...prev, [item.productId]: val }))
                            }}
                          />
                        </td>
                        <td className="text-right">
                          <span
                            className={`badge-variance ${
                              variance < 0 ? 'negative' : variance > 0 ? 'positive' : 'zero'
                            }`}
                          >
                            {variance > 0 ? `+${variance}` : variance}
                          </span>
                        </td>
                        <td className="text-right font-mono">
                          {varVal < 0 ? `-₹${Math.abs(varVal).toFixed(2)}` : `₹${varVal.toFixed(2)}`}
                        </td>
                        <td>
                          <input
                            type="text"
                            placeholder="Reason for discrepancy..."
                            className="input-note"
                            value={itemNotes[item.productId] || ''}
                            disabled={activeSession.status === 'reconciled'}
                            onChange={(e) => {
                              const txt = e.target.value
                              setItemNotes((prev) => ({ ...prev, [item.productId]: txt }))
                            }}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="audit-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setActiveSession(null)
                  onClose()
                }}
              >
                Close
              </button>
              {activeSession.status !== 'reconciled' && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSaveCounts}
                    disabled={loading}
                  >
                    Save Draft Counts
                  </button>
                  <button
                    type="button"
                    className="btn-reconcile"
                    onClick={handleReconcile}
                    disabled={loading}
                  >
                    <CheckCircleIcon size={16} />
                    {loading ? 'Reconciling...' : 'Owner Approve & Reconcile'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
