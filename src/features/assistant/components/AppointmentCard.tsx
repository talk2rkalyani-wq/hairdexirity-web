import React from 'react'
import type { EnrichedAppointment, AppointmentStatus } from '../../../types/models'
import { formatCurrency } from '../../../utils/formatters'
import './AppointmentCard.css'

interface AppointmentCardProps {
  appointment: EnrichedAppointment
}

function formatTime12h(time24: string): string {
  const [hStr, mStr] = time24.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${mStr} ${ampm}`
}

function getStatusBadgeClass(status: AppointmentStatus): string {
  switch (status) {
    case 'completed':
      return 'badge-completed'
    case 'confirmed':
      return 'badge-confirmed'
    case 'scheduled':
      return 'badge-scheduled'
    case 'cancelled':
      return 'badge-cancelled'
    case 'no-show':
      return 'badge-noshow'
    default:
      return 'badge-default'
  }
}

export const AppointmentCard: React.FC<AppointmentCardProps> = ({ appointment }) => {
  const clientName = appointment.client?.name || 'Client'
  const serviceName = appointment.service?.name || 'Salon Service'
  const staffName = appointment.staff?.name || 'Staff'
  const formattedStart = formatTime12h(appointment.startTime)
  const formattedEnd = formatTime12h(appointment.endTime)

  return (
    <article className="appointment-card" aria-label={`Appointment for ${clientName}`}>
      {/* Top row: Time window & Status pill */}
      <div className="apt-header-row">
        <div className="apt-time-badge">
          <span className="apt-time-icon" aria-hidden="true">⏱</span>
          <time className="apt-time-text">
            {formattedStart} – {formattedEnd}
          </time>
        </div>

        <span className={`apt-status-pill ${getStatusBadgeClass(appointment.status)}`}>
          {appointment.status.replace('-', ' ')}
        </span>
      </div>

      {/* Middle row: Client name & Price */}
      <div className="apt-client-row">
        <h4 className="apt-client-name">{clientName}</h4>
        <span className="apt-price">{formatCurrency(appointment.price)}</span>
      </div>

      {/* Service & Stylist information */}
      <div className="apt-details-row">
        <span className="apt-service-name">{serviceName}</span>
        <span className="apt-stylist-tag">
          Stylist: <strong>{staffName}</strong>
        </span>
      </div>

      {/* Optional Appointment Note */}
      {appointment.notes && (
        <div className="apt-notes-row">
          <p className="apt-notes-text">"{appointment.notes}"</p>
        </div>
      )}
    </article>
  )
}
