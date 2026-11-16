import React, { useState, useEffect, useMemo } from 'react'
import type { Service } from '../../../types/models'
import { SERVICE_CATEGORIES } from '../../../types/models'
import { serviceService } from '../../../services/serviceService'
import { formatCurrency } from '../../../utils/formatters'
import {
  ScissorsIcon,
  SearchIcon,
  ClockIcon,
  PlusIcon,
  CheckIcon,
  CloseIcon,
} from '../../../components/Icons'
import './ServiceSelectionModal.css'

export interface ServiceSelectionModalProps {
  isOpen: boolean
  selectedServices: Service[]
  onConfirm: (services: Service[]) => void
  onClose: () => void
  title?: string
}

export const ServiceSelectionModal: React.FC<ServiceSelectionModalProps> = ({
  isOpen,
  selectedServices,
  onConfirm,
  onClose,
  title = 'Select Salon Services',
}) => {
  const [services, setServices] = useState<Service[]>([])
  const [categories, setCategories] = useState<string[]>(['ALL', ...SERVICE_CATEGORIES])
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [tempSelected, setTempSelected] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)

  // Initialize selected services when modal opens
  useEffect(() => {
    if (isOpen) {
      setTempSelected([...selectedServices])
      setSearchQuery('')
      setSelectedCategory('ALL')
    }
  }, [isOpen, selectedServices])

  // Load services and categories from serviceService
  useEffect(() => {
    if (!isOpen) return

    let active = true
    setLoading(true)

    Promise.all([
      serviceService.getServices(),
      serviceService.getCategories(),
    ])
      .then(([srvData, catData]) => {
        if (!active) return
        setServices(srvData.filter((s) => s.active))
        if (catData && catData.length > 0) {
          const uniqueCats = Array.from(new Set([...SERVICE_CATEGORIES, ...catData]))
          setCategories(['ALL', ...uniqueCats])
        }
      })
      .catch((err) => {
        console.error('Failed to load services in selection modal:', err)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [isOpen])

  // Set of selected service IDs for O(1) lookup
  const selectedIdSet = useMemo(() => {
    return new Set(tempSelected.map((s) => s.id))
  }, [tempSelected])

  // Filtered services based on search query and category pill
  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return services.filter((s) => {
      const matchesCategory =
        selectedCategory === 'ALL' ||
        s.category.toLowerCase() === selectedCategory.toLowerCase()

      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.category.toLowerCase().includes(q)

      return matchesCategory && matchesQuery
    })
  }, [services, selectedCategory, searchQuery])

  // Totals of currently selected items
  const totalDuration = useMemo(() => {
    return tempSelected.reduce((sum, s) => sum + (s.duration || 0), 0)
  }, [tempSelected])

  const totalPrice = useMemo(() => {
    return tempSelected.reduce((sum, s) => sum + (s.price || 0), 0)
  }, [tempSelected])

  // Toggle selection of a service
  const handleToggleService = (service: Service) => {
    setTempSelected((prev) => {
      const exists = prev.some((s) => s.id === service.id)
      if (exists) {
        return prev.filter((s) => s.id !== service.id)
      } else {
        return [...prev, service]
      }
    })
  }

  const handleConfirm = () => {
    onConfirm(tempSelected)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="service-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="service-modal-container"
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
      >
        {/* Modal Top Header */}
        <div className="service-modal-header">
          <div className="service-modal-title-wrap">
            <h3 className="service-modal-title">
              <ScissorsIcon size={20} />
              <span>{title}</span>
            </h3>
            <p className="service-modal-subtitle">
              Choose one or multiple services for this appointment / visit
            </p>
          </div>
          <button
            type="button"
            className="service-modal-close-btn"
            onClick={onClose}
            aria-label="Close service selection"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="service-modal-search-bar">
          <div className="service-search-input-wrap">
            <SearchIcon size={18} className="service-search-icon" />
            <input
              type="text"
              className="service-search-input"
              placeholder="Search services by name or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                className="service-clear-search"
                onClick={() => setSearchQuery('')}
                title="Clear search"
              >
                &times;
              </button>
            )}
          </div>
        </div>

        {/* Category Filter Pills (Horizontal Scroll) */}
        <div className="service-modal-categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              className={`service-category-pill ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => setSelectedCategory(cat)}
            >
              {cat === 'ALL' ? 'All Services' : cat}
            </button>
          ))}
        </div>

        {/* Services Cards Grid */}
        <div className="service-modal-grid-area">
          {loading ? (
            <div className="service-modal-empty">
              <p>Loading salon service catalog...</p>
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="service-modal-empty">
              <ScissorsIcon size={32} />
              <p>No services match your search or filter.</p>
            </div>
          ) : (
            <div className="service-cards-grid">
              {filteredServices.map((service) => {
                const isSelected = selectedIdSet.has(service.id)
                return (
                  <div
                    key={service.id}
                    className={`srv-card ${isSelected ? 'is-selected' : ''}`}
                    onClick={() => handleToggleService(service)}
                  >
                    <div className="srv-card-top">
                      <div className="srv-card-tag-row">
                        <span className="srv-category-tag">{service.category}</span>
                        {isSelected && (
                          <span className="srv-selected-badge">
                            <CheckIcon size={12} /> Selected
                          </span>
                        )}
                      </div>
                      <h4 className="srv-title">{service.name}</h4>
                      {service.description && (
                        <p className="srv-desc">{service.description}</p>
                      )}
                    </div>

                    <div className="srv-card-bottom">
                      <div className="srv-meta">
                        <span className="srv-price">₹{service.price.toFixed(2)}</span>
                        <span className="srv-duration">
                          <ClockIcon size={12} /> {service.duration} min
                        </span>
                      </div>

                      <button
                        type="button"
                        className={`srv-action-btn ${isSelected ? 'btn-added' : 'btn-add'}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleService(service)
                        }}
                      >
                        {isSelected ? (
                          <>
                            <CheckIcon size={13} />
                            <span>Added</span>
                          </>
                        ) : (
                          <>
                            <PlusIcon size={13} />
                            <span>Add</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="service-modal-footer">
          <div className="service-footer-summary">
            <span>
              {tempSelected.length === 0 ? (
                'No services selected yet'
              ) : (
                <>
                  <strong>{tempSelected.length}</strong> service{tempSelected.length > 1 ? 's' : ''} selected •{' '}
                  <strong>{totalDuration} mins</strong> •{' '}
                  <strong>{formatCurrency(totalPrice)}</strong>
                </>
              )}
            </span>
          </div>

          <div className="service-footer-actions">
            <button
              type="button"
              className="srv-btn-cancel"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="srv-btn-confirm"
              onClick={handleConfirm}
              disabled={tempSelected.length === 0}
            >
              <CheckIcon size={16} />
              <span>
                {tempSelected.length === 0
                  ? 'Select at least 1 service'
                  : `Confirm Services (${tempSelected.length})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
