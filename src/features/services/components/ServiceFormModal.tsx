import React, { useState, useEffect } from 'react'
import type { Service, ServiceCategory } from '../../../types/models'
import { CloseIcon, CheckIcon } from '../../../components/Icons'
import './ServiceFormModal.css'

interface ServiceFormModalProps {
  isOpen: boolean
  serviceToEdit?: Service | null
  onClose: () => void
  onSave: (servicePayload: any, isEdit: boolean) => Promise<void>
}

export const ServiceFormModal: React.FC<ServiceFormModalProps> = ({
  isOpen,
  serviceToEdit,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(serviceToEdit)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState<number | string>(45)
  const [price, setPrice] = useState<number | string>(1000)
  const [category, setCategory] = useState<ServiceCategory>('haircut')
  const [active, setActive] = useState(true)

  const [errors, setErrors] = useState<{
    name?: string
    duration?: string
    price?: string
  }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    if (serviceToEdit) {
      setName(serviceToEdit.name || '')
      setDescription(serviceToEdit.description || '')
      setDuration(serviceToEdit.duration ?? 45)
      setPrice(serviceToEdit.price ?? 1000)
      setCategory(serviceToEdit.category || 'haircut')
      setActive(serviceToEdit.active !== undefined ? serviceToEdit.active : true)
    } else {
      setName('')
      setDescription('')
      setDuration(45)
      setPrice(1000)
      setCategory('haircut')
      setActive(true)
    }
    setErrors({})
    setShowSuccessToast(false)
  }, [isOpen, serviceToEdit])

  if (!isOpen) return null

  const validate = (): boolean => {
    const errs: { name?: string; duration?: string; price?: string } = {}

    if (!name.trim()) {
      errs.name = 'Service name is required.'
    }

    const durNum = Number(duration)
    if (isNaN(durNum) || durNum <= 0) {
      errs.duration = 'Duration must be a positive number of minutes (e.g. 30, 45, 60).'
    }

    const priceNum = Number(price)
    if (isNaN(priceNum) || priceNum < 0) {
      errs.price = 'Price cannot be negative.'
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
      description: description.trim(),
      duration: Number(duration),
      price: Number(price),
      category,
      active,
    }

    try {
      await onSave(payload, isEdit)
      setShowSuccessToast(true)
      setTimeout(() => {
        setIsSubmitting(false)
        onClose()
      }, 600)
    } catch (err) {
      console.error('Error saving service:', err)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} aria-hidden="true">
      <div
        className="service-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Service' : 'Add New Service'}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title">
              {isEdit ? 'Edit Salon Service' : 'Add New Salon Service'}
            </h3>
            <p className="modal-subtitle">
              {isEdit
                ? 'Update service pricing, duration, and category description.'
                : 'Configure a new treatment or styling service for your salon.'}
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
            <span>
              {isEdit
                ? 'Service updated successfully!'
                : 'New service created successfully!'}
            </span>
          </div>
        )}

        {/* Form Body */}
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-form-body">
            {/* Name Field */}
            <div className="form-field">
              <label className="field-label" htmlFor="service-name">
                Service Name <span className="req">*</span>
              </label>
              <input
                id="service-name"
                type="text"
                className={`field-input ${errors.name ? 'input-error' : ''}`}
                placeholder="e.g. Keratin Smoothening Treatment"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            {/* Category Field */}
            <div className="form-field">
              <label className="field-label" htmlFor="service-category">
                Service Category <span className="req">*</span>
              </label>
              <select
                id="service-category"
                className="field-select"
                value={category}
                onChange={(e) => setCategory(e.target.value as ServiceCategory)}
              >
                <option value="haircut">Haircut & Styling</option>
                <option value="color">Color & Highlights</option>
                <option value="treatment">Hair Treatment & Spa</option>
                <option value="styling">Skin, Nails & Rituals</option>
                <option value="extensions">Hair Extensions</option>
              </select>
            </div>

            {/* Duration & Price Grid */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="service-duration">
                  Duration (Minutes) <span className="req">*</span>
                </label>
                <div className="input-affix-wrapper">
                  <input
                    id="service-duration"
                    type="number"
                    min="5"
                    step="5"
                    className={`field-input affix-input ${
                      errors.duration ? 'input-error' : ''
                    }`}
                    placeholder="45"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                  <span className="input-suffix">mins</span>
                </div>
                {errors.duration && (
                  <span className="error-text">{errors.duration}</span>
                )}
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="service-price">
                  Price (INR) <span className="req">*</span>
                </label>
                <div className="input-affix-wrapper">
                  <span className="input-prefix">₹</span>
                  <input
                    id="service-price"
                    type="number"
                    min="0"
                    step="50"
                    className={`field-input affix-input-prefix ${
                      errors.price ? 'input-error' : ''
                    }`}
                    placeholder="1200"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </div>
                {errors.price && <span className="error-text">{errors.price}</span>}
              </div>
            </div>

            {/* Description Field */}
            <div className="form-field">
              <label className="field-label" htmlFor="service-description">
                Description <span className="opt">(Optional)</span>
              </label>
              <textarea
                id="service-description"
                className="field-textarea"
                rows={3}
                placeholder="Describe the steps, products, or benefits included in this service..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Active Status Checkbox */}
            <div className="form-field">
              <label className="field-label" htmlFor="service-active">
                Service Status
              </label>
              <label className="checkbox-label">
                <input
                  id="service-active"
                  type="checkbox"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <span className="checkbox-custom" />
                <span className="checkbox-text">
                  {active ? 'Active & available for booking' : 'Temporarily inactive'}
                </span>
              </label>
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
                : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
