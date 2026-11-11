import React, { useState, useEffect } from 'react'
import type { Client, Staff } from '../../../types/models'
import { staffService } from '../../../services/staffService'
import { CloseIcon, CheckIcon } from '../../../components/Icons'
import './ClientFormModal.css'

interface ClientFormModalProps {
  isOpen: boolean
  clientToEdit?: Client | null
  onClose: () => void
  onSave: (clientData: any, isEdit: boolean) => Promise<void>
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  clientToEdit,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(clientToEdit)
  const [staffList, setStaffList] = useState<Staff[]>([])

  // Form State
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [preferredStylistId, setPreferredStylistId] = useState('')
  const [hairType, setHairType] = useState('')
  const [preferredBeverage, setPreferredBeverage] = useState('')
  const [allergies, setAllergies] = useState('')
  const [prefNotes, setPrefNotes] = useState('')
  const [notes, setNotes] = useState('')

  // Validation & UI State
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  // Populate or reset form when modal opens / edit client changes
  useEffect(() => {
    if (!isOpen) return

    staffService.getStaff().then(setStaffList)

    if (clientToEdit) {
      setName(clientToEdit.name || '')
      setPhone(clientToEdit.phone || '')
      setEmail(clientToEdit.email || '')
      setDateOfBirth(clientToEdit.dateOfBirth || '')
      setPreferredStylistId(clientToEdit.preferences.preferredStylistId || '')
      setHairType(clientToEdit.preferences.hairType || '')
      setPreferredBeverage(clientToEdit.preferences.preferredBeverage || '')
      setAllergies(clientToEdit.preferences.allergies || '')
      setPrefNotes(clientToEdit.preferences.notes || '')
      setNotes(clientToEdit.notes || '')
    } else {
      setName('')
      setPhone('')
      setEmail('')
      setDateOfBirth('')
      setPreferredStylistId('')
      setHairType('')
      setPreferredBeverage('')
      setAllergies('')
      setPrefNotes('')
      setNotes('')
    }
    setErrors({})
    setShowSuccessToast(false)
  }, [isOpen, clientToEdit])

  if (!isOpen) return null

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {}
    if (!name.trim()) errs.name = 'Client name is required.'
    if (!phone.trim()) {
      errs.phone = 'Phone number is required.'
    } else if (phone.trim().length < 7) {
      errs.phone = 'Please enter a valid phone number.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)

    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      dateOfBirth: dateOfBirth || undefined,
      preferences: {
        preferredStylistId: preferredStylistId || undefined,
        hairType: hairType.trim() || undefined,
        preferredBeverage: preferredBeverage.trim() || undefined,
        allergies: allergies.trim() || undefined,
        notes: prefNotes.trim() || undefined,
      },
      notes: notes.trim(),
      lastVisitAt: clientToEdit ? clientToEdit.lastVisitAt : undefined,
    }

    try {
      await onSave(payload, isEdit)
      setShowSuccessToast(true)
      setTimeout(() => {
        setIsSubmitting(false)
        onClose()
      }, 700)
    } catch (err) {
      console.error('Error saving client:', err)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} aria-hidden="true">
      <div
        className="client-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Client' : 'Add New Client'}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{isEdit ? 'Edit Client' : 'Add New Client'}</h3>
            <p className="modal-subtitle">
              {isEdit
                ? 'Update client contact info and personalized preferences.'
                : 'Enter client details to create a new salon relationship.'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Success Banner */}
        {showSuccessToast && (
          <div className="modal-success-banner" role="status">
            <CheckIcon size={16} />
            <span>{isEdit ? 'Client updated successfully!' : 'Client added successfully!'}</span>
          </div>
        )}

        {/* Form */}
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-form-body">
            {/* Required Fields Group */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="client-name">
                  Full Name <span className="req">*</span>
                </label>
                <input
                  id="client-name"
                  type="text"
                  className={`field-input ${errors.name ? 'input-error' : ''}`}
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                {errors.name && <span className="error-text">{errors.name}</span>}
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="client-phone">
                  Phone Number <span className="req">*</span>
                </label>
                <input
                  id="client-phone"
                  type="tel"
                  className={`field-input ${errors.phone ? 'input-error' : ''}`}
                  placeholder="e.g. +91 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {errors.phone && <span className="error-text">{errors.phone}</span>}
              </div>
            </div>

            {/* Optional Contact Fields Group */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="client-email">
                  Email Address <span className="opt">(Optional)</span>
                </label>
                <input
                  id="client-email"
                  type="email"
                  className="field-input"
                  placeholder="e.g. priya.sharma@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="client-dob">
                  Date of Birth <span className="opt">(Optional)</span>
                </label>
                <input
                  id="client-dob"
                  type="date"
                  className="field-input"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                />
              </div>
            </div>

            {/* Salon Preferences Group */}
            <div className="form-divider" />
            <h4 className="form-section-title">Salon Preferences</h4>

            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="client-stylist">
                  Preferred Stylist
                </label>
                <select
                  id="client-stylist"
                  className="field-select"
                  value={preferredStylistId}
                  onChange={(e) => setPreferredStylistId(e.target.value)}
                >
                  <option value="">No preference</option>
                  {staffList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="client-hair">
                  Hair Profile
                </label>
                <input
                  id="client-hair"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Fine, wavy, color-treated"
                  value={hairType}
                  onChange={(e) => setHairType(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="client-bev">
                  Beverage Preference
                </label>
                <input
                  id="client-bev"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Masala Chai, Filter Coffee, Green Tea"
                  value={preferredBeverage}
                  onChange={(e) => setPreferredBeverage(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="client-allergies">
                  Allergies / Sensitivities
                </label>
                <input
                  id="client-allergies"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Lavender fragrance, Nickel"
                  value={allergies}
                  onChange={(e) => setAllergies(e.target.value)}
                />
              </div>
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="client-pref-notes">
                Styling Notes & Preferences
              </label>
              <textarea
                id="client-pref-notes"
                className="field-textarea"
                rows={2}
                placeholder="Specific color formulas, sectioning preferences, etc."
                value={prefNotes}
                onChange={(e) => setPrefNotes(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label className="field-label" htmlFor="client-general-notes">
                General Notes
              </label>
              <textarea
                id="client-general-notes"
                className="field-textarea"
                rows={2}
                placeholder="VIP client, booking notes, referral info..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="modal-footer">
            <button
              type="button"
              className="modal-btn cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Create Client Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
