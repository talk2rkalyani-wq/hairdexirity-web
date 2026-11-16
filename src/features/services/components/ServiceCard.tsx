import React from 'react'
import type { Service, ServiceCategory } from '../../../types/models'
import { formatCurrency } from '../../../utils/formatters'
import { ClockIcon, EditIcon, TrashIcon } from '../../../components/Icons'
import { appointmentStore } from '../../../services/appointmentStore'
import './ServiceCard.css'

interface ServiceCardProps {
  service: Service
  onEdit: (service: Service) => void
  canEdit?: boolean
  canDelete?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  onDelete?: (service: Service) => void
}

function formatCategoryLabel(category: ServiceCategory): string {
  switch (category) {
    case 'haircut':
      return 'Haircut & Styling'
    case 'color':
      return 'Color & Highlights'
    case 'treatment':
      return 'Hair Treatment & Spa'
    case 'styling':
      return 'Skin & Nails'
    case 'extensions':
      return 'Extensions'
    default:
      return category
  }
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  service,
  onEdit,
  canEdit = true,
  canDelete = false,
  isSelected = false,
  onToggleSelect,
  onDelete,
}) => {
  const formattedPrice = formatCurrency(service.price)
  const categoryLabel = formatCategoryLabel(service.category)

  return (
    <article
      className={`service-card ${service.active ? '' : 'service-card-inactive'} ${isSelected ? 'service-card-selected' : ''}`}
      aria-label={`Service: ${service.name}`}
    >
      <div className="service-card-top">
        <div className="service-header-left">
          {canDelete && (
            <div
              className="service-card-checkbox-wrap"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                className="service-select-checkbox"
                checked={isSelected}
                onChange={() => onToggleSelect?.(service.id)}
                aria-label={`Select service ${service.name}`}
              />
            </div>
          )}

          <div>
            <span className={`service-category-badge cat-${service.category}`}>
              {categoryLabel}
            </span>
            <h3 className="service-title">{service.name}</h3>
          </div>
        </div>

        <div className="service-card-actions">
          <span
            className={`service-status-pill ${
              service.active ? 'pill-active' : 'pill-inactive'
            }`}
          >
            {service.active ? 'Active' : 'Inactive'}
          </span>

          {canEdit && (
            <button
              type="button"
              className="service-edit-btn"
              onClick={() => onEdit(service)}
              aria-label={`Edit service ${service.name}`}
              title="Edit service details"
            >
              <EditIcon size={16} />
            </button>
          )}

          {canDelete && (
            <button
              type="button"
              className={`service-delete-btn ${appointmentStore.hasBlockingAppointmentsForService(service.id) ? 'btn-disabled' : ''}`}
              disabled={appointmentStore.hasBlockingAppointmentsForService(service.id)}
              onClick={() => {
                if (!appointmentStore.hasBlockingAppointmentsForService(service.id)) {
                  onDelete?.(service)
                }
              }}
              aria-label={
                appointmentStore.hasBlockingAppointmentsForService(service.id)
                  ? `Cannot delete ${service.name} (upcoming or active appointment exists)`
                  : `Delete service ${service.name}`
              }
              title={
                appointmentStore.hasBlockingAppointmentsForService(service.id)
                  ? 'Cannot delete this service because an upcoming or active appointment exists for this service.'
                  : 'Delete service'
              }
            >
              <TrashIcon size={15} />
            </button>
          )}
        </div>
      </div>

      {service.description && (
        <p className="service-description">{service.description}</p>
      )}

      <div className="service-card-footer">
        <div className="service-duration-badge" title="Service duration">
          <ClockIcon size={14} className="duration-icon" />
          <span>{service.duration} min</span>
        </div>

        <div className="service-price-wrap" aria-label={`Price: ${formattedPrice}`}>
          {(service.pricingType === 'wax_type' || service.category === 'Body Wax') && service.waxPricing ? (
            <div className="service-price-breakdown">
              <span className="price-pricing-badge">Body Wax</span>
              <div className="price-tier-chips">
                <span className="price-chip" title="Normal">
                  <span className="chip-key">Normal:</span> ₹{service.waxPricing.normal}
                </span>
                <span className="price-chip" title="Chocolate">
                  <span className="chip-key">Choc:</span> ₹{service.waxPricing.chocolate}
                </span>
                <span className="price-chip" title="Peel off">
                  <span className="chip-key">Peel off:</span> ₹{service.waxPricing.peelOff}
                </span>
              </div>
            </div>
          ) : service.pricingType === 'gender' && service.genderPricing ? (
            <div className="service-price-breakdown">
              <span className="price-pricing-badge">By Gender</span>
              <div className="price-tier-chips">
                <span className="price-chip">
                  <span className="chip-key">M:</span> ₹{service.genderPricing.male}
                </span>
                <span className="price-chip">
                  <span className="chip-key">F:</span> ₹{service.genderPricing.female}
                </span>
              </div>
            </div>
          ) : service.pricingType === 'length' && service.lengthPricing ? (
            <div className="service-price-breakdown">
              <span className="price-pricing-badge">By Length</span>
              <div className="price-tier-chips">
                <span className="price-chip" title="Short">
                  <span className="chip-key">S:</span> ₹{service.lengthPricing.short}
                </span>
                <span className="price-chip" title="Medium">
                  <span className="chip-key">M:</span> ₹{service.lengthPricing.medium}
                </span>
                <span className="price-chip" title="Long">
                  <span className="chip-key">L:</span> ₹{service.lengthPricing.long}
                </span>
                <span className="price-chip" title="VLong">
                  <span className="chip-key">VL:</span> ₹{service.lengthPricing.vlong}
                </span>
              </div>
            </div>
          ) : (
            <>
              <span className="price-label">Price</span>
              <span className="service-price-amount">{formattedPrice}</span>
            </>
          )}
        </div>
      </div>
    </article>
  )
}
