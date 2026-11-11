// ==============================================================================
// Luma Salon — Supplier Directory & Register View
// Phase 6: Supplier List, Filtering, Creation & Modification
// ==============================================================================

import React, { useState, useEffect } from 'react'
import type { Supplier, SupplierFilterOptions } from '../../../types/purchases.ts'
import { purchaseService } from '../../../services/purchaseService.ts'
import { SupplierProfileModal } from './SupplierProfileModal.tsx'
import { SearchIcon, PlusIcon, EditIcon, CloseIcon } from '../../../components/Icons'
import './SuppliersView.css'

interface Props {
  onSelectSupplier?: (supplierId: string) => void
  onNewOrderForSupplier?: (supplierId: string) => void
  onRecordPaymentForSupplier?: (supplierId: string) => void
}

export const SuppliersView: React.FC<Props> = ({
  onSelectSupplier,
  onNewOrderForSupplier,
  onRecordPaymentForSupplier,
}) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<SupplierFilterOptions>({
    searchQuery: '',
    status: 'ALL',
    category: 'ALL',
  })

  // Selected for profile drawer
  const [profileSupplierId, setProfileSupplierId] = useState<string | null>(null)

  // Edit / Add Modal State
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Partial<Supplier> | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const loadSuppliers = async () => {
    setLoading(true)
    try {
      const list = await purchaseService.getSuppliers(filters)
      setSuppliers(list)
    } catch (err) {
      console.error('Failed to load suppliers:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [filters.status, filters.category])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    loadSuppliers()
  }

  const handleOpenAdd = () => {
    setEditingSupplier({
      name: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      city: 'Bengaluru',
      state: 'Karnataka',
      pincode: '',
      gstin: '',
      pan: '',
      category: 'Hair Care',
      openingBalance: 0,
      status: 'active',
      notes: '',
    })
    setFormError(null)
    setIsFormOpen(true)
  }

  const handleOpenEdit = (sup: Supplier, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditingSupplier({ ...sup })
    setFormError(null)
    setIsFormOpen(true)
  }

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSupplier?.name?.trim()) {
      setFormError('Supplier business name is required')
      return
    }
    if (!editingSupplier?.phone?.trim() || editingSupplier.phone.trim().length < 7) {
      setFormError('A valid phone number (at least 7 digits) is required')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      const res = await purchaseService.saveSupplier(editingSupplier)
      if (!res.success) {
        setFormError(res.error || 'Failed to save supplier')
        setSaving(false)
        return
      }
      setIsFormOpen(false)
      loadSuppliers()
    } catch (err: any) {
      setFormError(err.message || 'Error occurred while saving')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="suppliers-view-container">
      {/* Header and Controls */}
      <div className="suppliers-header">
        <div>
          <h2>Supplier Management</h2>
          <p className="subtitle">Manage vendors, raw material distributors, and retail product suppliers</p>
        </div>
        <button type="button" className="btn-add-supplier" onClick={handleOpenAdd}>
          <PlusIcon size={18} />
          <span>Add Supplier</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="suppliers-filter-bar">
        <form onSubmit={handleSearchSubmit} className="search-form">
          <SearchIcon size={16} />
          <input
            type="text"
            placeholder="Search by name, phone, code or GSTIN..."
            value={filters.searchQuery}
            onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
          />
        </form>

        <div className="filter-dropdowns">
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            className="filter-select"
          >
            <option value="ALL">All Categories</option>
            <option value="Hair Care">Hair Care</option>
            <option value="Hair Styling">Hair Styling</option>
            <option value="Cosmetics">Cosmetics</option>
            <option value="Equipment">Equipment</option>
            <option value="Salon Consumables">Salon Consumables</option>
            <option value="General">General</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
            className="filter-select"
          >
            <option value="ALL">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Supplier Register Table */}
      <div className="suppliers-table-card">
        {loading ? (
          <div className="loading-state">Loading suppliers...</div>
        ) : suppliers.length === 0 ? (
          <div className="empty-state">
            <p>No suppliers found matching the criteria.</p>
          </div>
        ) : (
          <table className="suppliers-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Supplier Name</th>
                <th>Contact</th>
                <th>Category</th>
                <th>GSTIN</th>
                <th>Status</th>
                <th className="text-right">Payable Balance</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((sup) => (
                <tr
                  key={sup.id}
                  onClick={() => {
                    setProfileSupplierId(sup.id)
                    onSelectSupplier?.(sup.id)
                  }}
                  className="supplier-row"
                >
                  <td><span className="supplier-code">{sup.supplierCode}</span></td>
                  <td>
                    <div className="supplier-name-cell">
                      <strong>{sup.name}</strong>
                      {sup.contactPerson && <span className="contact-sub">{sup.contactPerson}</span>}
                    </div>
                  </td>
                  <td>
                    <div className="contact-info-cell">
                      <span>{sup.phone}</span>
                      {sup.email && <span className="email-sub">{sup.email}</span>}
                    </div>
                  </td>
                  <td><span className="cat-pill">{sup.category}</span></td>
                  <td>{sup.gstin || <span className="text-muted">Unregistered</span>}</td>
                  <td>
                    <span className={`status-pill status-${sup.status}`}>
                      {sup.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="text-right font-bold">
                    <span className={(sup.outstandingPayable || 0) > 0 ? 'text-danger' : 'text-success'}>
                      Rs. {(sup.outstandingPayable || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-icon"
                      title="Edit Supplier"
                      onClick={(e) => handleOpenEdit(sup, e)}
                    >
                      <EditIcon size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Profile Modal / Drawer */}
      <SupplierProfileModal
        supplierId={profileSupplierId}
        isOpen={Boolean(profileSupplierId)}
        onClose={() => setProfileSupplierId(null)}
        onNewOrder={onNewOrderForSupplier}
        onRecordPayment={onRecordPaymentForSupplier}
      />

      {/* Add / Edit Supplier Modal */}
      {isFormOpen && editingSupplier && (
        <div className="supplier-modal-backdrop" onClick={() => setIsFormOpen(false)}>
          <div className="supplier-form-modal" onClick={(e) => e.stopPropagation()}>
            <div className="supplier-form-header">
              <h3>{editingSupplier.id ? 'Edit Supplier' : 'Add New Supplier'}</h3>
              <button type="button" className="close-btn" onClick={() => setIsFormOpen(false)}>
                <CloseIcon size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="supplier-form-body">
              {formError && <div className="form-error-banner">{formError}</div>}

              <div className="form-row">
                <div className="form-field full">
                  <label>Business / Supplier Name *</label>
                  <input
                    type="text"
                    required
                    value={editingSupplier.name || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, name: e.target.value })}
                    placeholder="e.g. L'Oréal Professional Distributors"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Contact Person</label>
                  <input
                    type="text"
                    value={editingSupplier.contactPerson || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, contactPerson: e.target.value })}
                    placeholder="e.g. Ramesh Kumar"
                  />
                </div>
                <div className="form-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={editingSupplier.phone || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, phone: e.target.value })}
                    placeholder="e.g. 9845012345"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>Email Address</label>
                  <input
                    type="email"
                    value={editingSupplier.email || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, email: e.target.value })}
                    placeholder="e.g. sales@vendor.com"
                  />
                </div>
                <div className="form-field">
                  <label>Category</label>
                  <select
                    value={editingSupplier.category || 'General'}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, category: e.target.value })}
                  >
                    <option value="Hair Care">Hair Care</option>
                    <option value="Hair Styling">Hair Styling</option>
                    <option value="Cosmetics">Cosmetics</option>
                    <option value="Equipment">Equipment</option>
                    <option value="Salon Consumables">Salon Consumables</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>GSTIN</label>
                  <input
                    type="text"
                    value={editingSupplier.gstin || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, gstin: e.target.value })}
                    placeholder="29AAAAA0000A1Z5"
                  />
                </div>
                <div className="form-field">
                  <label>PAN</label>
                  <input
                    type="text"
                    value={editingSupplier.pan || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, pan: e.target.value })}
                    placeholder="AAAAA0000A"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field full">
                  <label>Address</label>
                  <input
                    type="text"
                    value={editingSupplier.address || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, address: e.target.value })}
                    placeholder="Plot 12, Industrial Area"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-field">
                  <label>City</label>
                  <input
                    type="text"
                    value={editingSupplier.city || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, city: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>State</label>
                  <input
                    type="text"
                    value={editingSupplier.state || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, state: e.target.value })}
                  />
                </div>
                <div className="form-field">
                  <label>PIN Code</label>
                  <input
                    type="text"
                    value={editingSupplier.pincode || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, pincode: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-row">
                {!editingSupplier.id && (
                  <div className="form-field">
                    <label>Opening Balance (Rs.)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editingSupplier.openingBalance || 0}
                      onChange={(e) => setEditingSupplier({ ...editingSupplier, openingBalance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}
                <div className="form-field">
                  <label>Status</label>
                  <select
                    value={editingSupplier.status || 'active'}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, status: e.target.value as any })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-field full">
                  <label>Private Notes</label>
                  <textarea
                    rows={2}
                    value={editingSupplier.notes || ''}
                    onChange={(e) => setEditingSupplier({ ...editingSupplier, notes: e.target.value })}
                    placeholder="Payment terms, delivery schedules, discounts..."
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-save"
                >
                  {saving ? 'Saving...' : 'Save Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
