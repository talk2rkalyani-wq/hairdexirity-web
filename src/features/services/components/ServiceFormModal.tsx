import React, { useState, useEffect } from 'react'
import type { Service, ServiceCategory, ServicePricingType } from '../../../types/models'
import { SERVICE_CATEGORIES } from '../../../types/models'
import { serviceService } from '../../../services/serviceService'
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
  const [category, setCategory] = useState<ServiceCategory>('Hair')
  const [categoriesList, setCategoriesList] = useState<string[]>([...SERVICE_CATEGORIES])
  const [active, setActive] = useState(true)

  // Pricing Model State
  const [pricingType, setPricingType] = useState<ServicePricingType>('gender')

  // Price by Gender fields
  const [malePrice, setMalePrice] = useState<number | string>(1000)
  const [femalePrice, setFemalePrice] = useState<number | string>(1200)

  // Price by Length fields
  const [shortPrice, setShortPrice] = useState<number | string>(800)
  const [mediumPrice, setMediumPrice] = useState<number | string>(1200)
  const [longPrice, setLongPrice] = useState<number | string>(1600)
  const [vlongPrice, setVlongPrice] = useState<number | string>(2000)

  // Price by Wax Formula (Body Wax only)
  const [normalPrice, setNormalPrice] = useState<number | string>(300)
  const [chocolatePrice, setChocolatePrice] = useState<number | string>(450)
  const [peelOffPrice, setPeelOffPrice] = useState<number | string>(600)

  const [errors, setErrors] = useState<{
    name?: string
    duration?: string
    malePrice?: string
    femalePrice?: string
    shortPrice?: string
    mediumPrice?: string
    longPrice?: string
    vlongPrice?: string
    normalPrice?: string
    chocolatePrice?: string
    peelOffPrice?: string
  }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    serviceService.getCategories().then((cats) => {
      if (cats && cats.length > 0) {
        setCategoriesList(cats)
      }
    })

    if (serviceToEdit) {
      setName(serviceToEdit.name || '')
      setDescription(serviceToEdit.description || '')
      setDuration(serviceToEdit.duration ?? 45)
      setCategory(serviceToEdit.category || 'Hair')
      setActive(serviceToEdit.active !== undefined ? serviceToEdit.active : true)

      if (serviceToEdit.category === 'Body Wax' || serviceToEdit.pricingType === 'wax_type') {
        setPricingType('wax_type')
        if (serviceToEdit.waxPricing) {
          setNormalPrice(serviceToEdit.waxPricing.normal ?? 300)
          setChocolatePrice(serviceToEdit.waxPricing.chocolate ?? 450)
          setPeelOffPrice(serviceToEdit.waxPricing.peelOff ?? 600)
        } else {
          const baseP = serviceToEdit.price ?? 300
          setNormalPrice(baseP)
          setChocolatePrice(Math.round(baseP * 1.5))
          setPeelOffPrice(Math.round(baseP * 2))
        }
      } else {
        const pType: ServicePricingType = serviceToEdit.pricingType || 'gender'
        setPricingType(pType)
        setNormalPrice(300)
        setChocolatePrice(450)
        setPeelOffPrice(600)
      }

      if (serviceToEdit.genderPricing) {
        setMalePrice(serviceToEdit.genderPricing.male ?? 1000)
        setFemalePrice(serviceToEdit.genderPricing.female ?? 1200)
      } else {
        const baseP = serviceToEdit.price ?? 1000
        setMalePrice(baseP)
        setFemalePrice(baseP)
      }

      if (serviceToEdit.lengthPricing) {
        setShortPrice(serviceToEdit.lengthPricing.short ?? 800)
        setMediumPrice(serviceToEdit.lengthPricing.medium ?? 1200)
        setLongPrice(serviceToEdit.lengthPricing.long ?? 1600)
        setVlongPrice(serviceToEdit.lengthPricing.vlong ?? 2000)
      } else {
        const baseP = serviceToEdit.price ?? 1000
        setShortPrice(Math.round(baseP * 0.8))
        setMediumPrice(baseP)
        setLongPrice(Math.round(baseP * 1.3))
        setVlongPrice(Math.round(baseP * 1.6))
      }
    } else {
      setName('')
      setDescription('')
      setDuration(45)
      setCategory('Hair')
      setActive(true)
      setPricingType('gender')
      setMalePrice(1000)
      setFemalePrice(1200)
      setShortPrice(800)
      setMediumPrice(1200)
      setLongPrice(1600)
      setVlongPrice(2000)
      setNormalPrice(300)
      setChocolatePrice(450)
      setPeelOffPrice(600)
    }
    setErrors({})
    setShowSuccessToast(false)
  }, [isOpen, serviceToEdit])

  if (!isOpen) return null

  const validate = (): boolean => {
    const errs: Record<string, string> = {}

    if (!name.trim()) {
      errs.name = 'Service name is required.'
    }

    const durNum = Number(duration)
    if (isNaN(durNum) || durNum <= 0) {
      errs.duration = 'Duration must be a positive number of minutes (e.g. 30, 45, 60).'
    }

    const isBodyWax = category === 'Body Wax'

    if (isBodyWax) {
      const normNum = Number(normalPrice)
      if (normalPrice === '' || isNaN(normNum) || normNum < 0) {
        errs.normalPrice = 'Normal price cannot be negative or empty.'
      }
      const chocNum = Number(chocolatePrice)
      if (chocolatePrice === '' || isNaN(chocNum) || chocNum < 0) {
        errs.chocolatePrice = 'Chocolate price cannot be negative or empty.'
      }
      const peelNum = Number(peelOffPrice)
      if (peelOffPrice === '' || isNaN(peelNum) || peelNum < 0) {
        errs.peelOffPrice = 'Peel off price cannot be negative or empty.'
      }
    } else if (pricingType === 'gender') {
      const maleNum = Number(malePrice)
      if (malePrice === '' || isNaN(maleNum) || maleNum < 0) {
        errs.malePrice = 'Male price cannot be negative or empty.'
      }
      const femaleNum = Number(femalePrice)
      if (femalePrice === '' || isNaN(femaleNum) || femaleNum < 0) {
        errs.femalePrice = 'Female price cannot be negative or empty.'
      }
    } else if (pricingType === 'length') {
      const shortNum = Number(shortPrice)
      if (shortPrice === '' || isNaN(shortNum) || shortNum < 0) {
        errs.shortPrice = 'Short length price cannot be negative or empty.'
      }
      const medNum = Number(mediumPrice)
      if (mediumPrice === '' || isNaN(medNum) || medNum < 0) {
        errs.mediumPrice = 'Medium length price cannot be negative or empty.'
      }
      const longNum = Number(longPrice)
      if (longPrice === '' || isNaN(longNum) || longNum < 0) {
        errs.longPrice = 'Long length price cannot be negative or empty.'
      }
      const vlongNum = Number(vlongPrice)
      if (vlongPrice === '' || isNaN(vlongNum) || vlongNum < 0) {
        errs.vlongPrice = 'VLong length price cannot be negative or empty.'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)

    const isBodyWax = category === 'Body Wax'

    const basePrice = isBodyWax
      ? Number(normalPrice) || 0
      : pricingType === 'gender'
      ? Number(malePrice) || Number(femalePrice) || 0
      : Number(shortPrice) || Number(mediumPrice) || 0

    const effectivePricingType: ServicePricingType = isBodyWax ? 'wax_type' : pricingType

    const payload = {
      name: name.trim(),
      description: description.trim(),
      duration: Number(duration),
      price: basePrice,
      category,
      active,
      pricingType: effectivePricingType,
      waxPricing: isBodyWax ? {
        normal: Number(normalPrice) || 0,
        chocolate: Number(chocolatePrice) || 0,
        peelOff: Number(peelOffPrice) || 0,
      } : undefined,
      genderPricing: !isBodyWax && pricingType === 'gender' ? {
        male: Number(malePrice) || 0,
        female: Number(femalePrice) || 0,
      } : undefined,
      lengthPricing: !isBodyWax && pricingType === 'length' ? {
        short: Number(shortPrice) || 0,
        medium: Number(mediumPrice) || 0,
        long: Number(longPrice) || 0,
        vlong: Number(vlongPrice) || 0,
      } : undefined,
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
                ? 'Update service pricing model, duration, and category description.'
                : 'Configure a new treatment or styling service with flexible pricing.'}
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
        <form className="modal-form" onSubmit={handleSubmit} noValidate>
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

            {/* Category & Duration Grid */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="service-category">
                  Service Category <span className="req">*</span>
                </label>
                <select
                  id="service-category"
                  className="field-select"
                  value={category}
                  onChange={(e) => {
                    const newCat = e.target.value as ServiceCategory
                    setCategory(newCat)
                    if (newCat === 'Body Wax') {
                      setPricingType('wax_type')
                    } else if (pricingType === 'wax_type') {
                      setPricingType('gender')
                    }
                  }}
                >
                  {categoriesList.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                  {category && !categoriesList.includes(category) && (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  )}
                </select>
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="service-duration">
                  Duration (Minutes) <span className="req">*</span>
                </label>
                <div className="input-affix-wrapper">
                  <input
                    id="service-duration"
                    type="number"
                    min="1"
                    step="any"
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
            </div>

            {/* Pricing Section */}
            <div className="service-pricing-section">
              <div className="pricing-section-header">
                <div>
                  <label className="field-label">
                    {category === 'Body Wax' ? 'Body Wax Pricing' : 'Price Configuration'}{' '}
                    <span className="req">*</span>
                  </label>
                  <span className="pricing-helper-note">
                    {category === 'Body Wax'
                      ? 'Set pricing for wax application variants (Normal, Chocolate, Peel off)'
                      : 'Choose your service pricing model'}
                  </span>
                </div>
              </div>

              {category === 'Body Wax' ? (
                /* Body Wax Specific Pricing: Normal, Chocolate, Peel off */
                <div className="pricing-fields-card animated-fade-in">
                  <div className="pricing-fields-hint">
                    Set customized pricing for Normal, Chocolate, and Peel off wax applications:
                  </div>
                  <div className="pricing-grid-wax">
                    {/* Normal */}
                    <div className="form-field">
                      <label className="field-label tier-badge-normal" htmlFor="normal-price">
                        Normal <span className="req">*</span>
                      </label>
                      <div className="input-affix-wrapper">
                        <span className="input-prefix">₹</span>
                        <input
                          id="normal-price"
                          type="number"
                          min="0"
                          step="any"
                          className={`field-input affix-input-prefix ${
                            errors.normalPrice ? 'input-error' : ''
                          }`}
                          placeholder="300"
                          value={normalPrice}
                          onChange={(e) => setNormalPrice(e.target.value)}
                        />
                      </div>
                      {errors.normalPrice && (
                        <span className="error-text">{errors.normalPrice}</span>
                      )}
                    </div>

                    {/* Chocolate */}
                    <div className="form-field">
                      <label className="field-label tier-badge-chocolate" htmlFor="chocolate-price">
                        Chocolate <span className="req">*</span>
                      </label>
                      <div className="input-affix-wrapper">
                        <span className="input-prefix">₹</span>
                        <input
                          id="chocolate-price"
                          type="number"
                          min="0"
                          step="any"
                          className={`field-input affix-input-prefix ${
                            errors.chocolatePrice ? 'input-error' : ''
                          }`}
                          placeholder="450"
                          value={chocolatePrice}
                          onChange={(e) => setChocolatePrice(e.target.value)}
                        />
                      </div>
                      {errors.chocolatePrice && (
                        <span className="error-text">{errors.chocolatePrice}</span>
                      )}
                    </div>

                    {/* Peel off */}
                    <div className="form-field">
                      <label className="field-label tier-badge-peeloff" htmlFor="peeloff-price">
                        Peel off <span className="req">*</span>
                      </label>
                      <div className="input-affix-wrapper">
                        <span className="input-prefix">₹</span>
                        <input
                          id="peeloff-price"
                          type="number"
                          min="0"
                          step="any"
                          className={`field-input affix-input-prefix ${
                            errors.peelOffPrice ? 'input-error' : ''
                          }`}
                          placeholder="600"
                          value={peelOffPrice}
                          onChange={(e) => setPeelOffPrice(e.target.value)}
                        />
                      </div>
                      {errors.peelOffPrice && (
                        <span className="error-text">{errors.peelOffPrice}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* Pricing Type Toggle Switch */}
                  <div className="pricing-toggle-bar" role="tablist" aria-label="Pricing Option">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={pricingType === 'gender'}
                      className={`pricing-toggle-option ${
                        pricingType === 'gender' ? 'active' : ''
                      }`}
                      onClick={() => setPricingType('gender')}
                    >
                      <span className="toggle-option-icon">🚻</span>
                      <span className="toggle-option-text">Price By Gender</span>
                    </button>

                    <button
                      type="button"
                      role="tab"
                      aria-selected={pricingType === 'length'}
                      className={`pricing-toggle-option ${
                        pricingType === 'length' ? 'active' : ''
                      }`}
                      onClick={() => setPricingType('length')}
                    >
                      <span className="toggle-option-icon">📏</span>
                      <span className="toggle-option-text">Price By Length</span>
                    </button>
                  </div>

                  {/* Price Fields for Price By Gender */}
                  {pricingType === 'gender' && (
                    <div className="pricing-fields-card animated-fade-in">
                      <div className="pricing-fields-hint">
                        Set customized pricing for Male and Female clients:
                      </div>
                      <div className="pricing-grid-gender">
                        {/* Male Price */}
                        <div className="form-field">
                          <label className="field-label tier-label-male" htmlFor="male-price">
                            Male Price <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="male-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.malePrice ? 'input-error' : ''
                              }`}
                              placeholder="1000"
                              value={malePrice}
                              onChange={(e) => setMalePrice(e.target.value)}
                            />
                          </div>
                          {errors.malePrice && (
                            <span className="error-text">{errors.malePrice}</span>
                          )}
                        </div>

                        {/* Female Price */}
                        <div className="form-field">
                          <label className="field-label tier-label-female" htmlFor="female-price">
                            Female Price <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="female-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.femalePrice ? 'input-error' : ''
                              }`}
                              placeholder="1200"
                              value={femalePrice}
                              onChange={(e) => setFemalePrice(e.target.value)}
                            />
                          </div>
                          {errors.femalePrice && (
                            <span className="error-text">{errors.femalePrice}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Price Fields for Price By Length */}
                  {pricingType === 'length' && (
                    <div className="pricing-fields-card animated-fade-in">
                      <div className="pricing-fields-hint">
                        Set customized pricing based on hair/application length:
                      </div>
                      <div className="pricing-grid-length">
                        {/* Short */}
                        <div className="form-field">
                          <label className="field-label tier-badge-short" htmlFor="short-price">
                            Short <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="short-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.shortPrice ? 'input-error' : ''
                              }`}
                              placeholder="800"
                              value={shortPrice}
                              onChange={(e) => setShortPrice(e.target.value)}
                            />
                          </div>
                          {errors.shortPrice && (
                            <span className="error-text">{errors.shortPrice}</span>
                          )}
                        </div>

                        {/* Medium */}
                        <div className="form-field">
                          <label className="field-label tier-badge-medium" htmlFor="medium-price">
                            Medium <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="medium-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.mediumPrice ? 'input-error' : ''
                              }`}
                              placeholder="1200"
                              value={mediumPrice}
                              onChange={(e) => setMediumPrice(e.target.value)}
                            />
                          </div>
                          {errors.mediumPrice && (
                            <span className="error-text">{errors.mediumPrice}</span>
                          )}
                        </div>

                        {/* Long */}
                        <div className="form-field">
                          <label className="field-label tier-badge-long" htmlFor="long-price">
                            Long <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="long-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.longPrice ? 'input-error' : ''
                              }`}
                              placeholder="1600"
                              value={longPrice}
                              onChange={(e) => setLongPrice(e.target.value)}
                            />
                          </div>
                          {errors.longPrice && (
                            <span className="error-text">{errors.longPrice}</span>
                          )}
                        </div>

                        {/* VLong */}
                        <div className="form-field">
                          <label className="field-label tier-badge-vlong" htmlFor="vlong-price">
                            VLong <span className="req">*</span>
                          </label>
                          <div className="input-affix-wrapper">
                            <span className="input-prefix">₹</span>
                            <input
                              id="vlong-price"
                              type="number"
                              min="0"
                              step="any"
                              className={`field-input affix-input-prefix ${
                                errors.vlongPrice ? 'input-error' : ''
                              }`}
                              placeholder="2000"
                              value={vlongPrice}
                              onChange={(e) => setVlongPrice(e.target.value)}
                            />
                          </div>
                          {errors.vlongPrice && (
                            <span className="error-text">{errors.vlongPrice}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
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
