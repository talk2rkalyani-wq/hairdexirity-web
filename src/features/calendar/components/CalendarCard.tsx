import React from 'react'
import type { EnrichedAppointment, AppointmentStatus } from '../../../types/models'
import { formatCurrency, formatTime12h } from '../../../utils/formatters'
import './CalendarCard.css'

interface CalendarCardProps {
  appointment: EnrichedAppointment
  onSelect: (appointment: EnrichedAppointment) => void
  style?: React.CSSProperties
  compact?: boolean
}

export function getStatusThemeClass(status: AppointmentStatus): string {
  switch (status) {
    case 'in_progress':
      return 'theme-inprogress'
    case 'checked_in':
      return 'theme-checkedin'
    case 'confirmed':
      return 'theme-confirmed'
    case 'scheduled':
      return 'theme-scheduled'
    case 'completed':
      return 'theme-completed'
    case 'cancelled':
      return 'theme-cancelled'
    case 'no-show':
      return 'theme-noshow'
    default:
      return 'theme-scheduled'
  }
}

export function formatStatusLabel(status: AppointmentStatus): string {
  switch (status) {
    case 'in_progress':
      return 'In Progress'
    case 'checked_in':
      return 'Checked In'
    case 'no-show':
      return 'No-show'
    case 'confirmed':
      return 'Confirmed'
    case 'completed':
      return 'Completed'
    case 'scheduled':
      return 'Scheduled'
    case 'cancelled':
      return 'Cancelled'
    default:
      return status
  }
}

export const CalendarCard: React.FC<CalendarCardProps> = ({
  appointment,
  onSelect,
  style,
  compact = false,
}) => {
  const clientName = appointment.client?.name || 'Client'
  const serviceName = appointment.service?.name || 'Service'
  const staffName = appointment.staff?.name || 'Stylist'
  const priceFormatted = formatCurrency(appointment.price)
  const timeFormatted = `${formatTime12h(appointment.startTime)} – ${formatTime12h(
    appointment.endTime
  )}`

  const themeClass = getStatusThemeClass(appointment.status)
  const statusLabel = formatStatusLabel(appointment.status)

  return (
    <article
      className={`cal-appointment-card ${themeClass} ${compact ? 'card-compact' : ''}`}
      style={style}
      onClick={() => onSelect(appointment)}
      tabIndex={0}
      role="button"
      aria-label={`Appointment for ${clientName}, ${serviceName} with ${staffName} at ${timeFormatted}. Status: ${statusLabel}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(appointment)
        }
      }}
    >
      <div className="cal-card-inner">
        {/* Header row: Time & Status */}
        <div className="cal-card-header">
          <time className="cal-time-badge">{timeFormatted}</time>
          <span className={`cal-status-pill pill-${appointment.status}`}>
            {statusLabel}
          </span>
        </div>

        {/* Client & Service */}
        <div className="cal-card-body">
          <h4 className="cal-client-name">{clientName}</h4>
          <span className="cal-service-name">{serviceName}</span>
        </div>

        {/* Footer row: Stylist & Price */}
        <div className="cal-card-footer">
          <span className="cal-staff-name" title={`Stylist: ${staffName}`}>
            {staffName}
          </span>
          <span className="cal-price-text">{priceFormatted}</span>
        </div>
      </div>
    </article>
  )
}
