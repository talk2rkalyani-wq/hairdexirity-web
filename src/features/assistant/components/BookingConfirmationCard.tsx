import React from 'react'
import type { EnrichedAppointment } from '../../../types/models'
import { formatCurrency, formatTime12h, formatDateDisplay } from '../../../utils/formatters'
import './BookingConfirmationCard.css'

interface BookingConfirmationCardProps {
  appointment: EnrichedAppointment
}

export const BookingConfirmationCard: React.FC<BookingConfirmationCardProps> = ({
  appointment,
}) => {
  const formattedDate = formatDateDisplay(appointment.date)
  const timeWindow = `${formatTime12h(appointment.startTime)} – ${formatTime12h(
    appointment.endTime
  )}`
  const formattedPrice = formatCurrency(appointment.price)

  return (
    <div className="booking-confirmed-card" role="region" aria-label="Booked appointment receipt">
      {/* Success Badge Banner */}
      <div className="confirmed-banner">
        <div className="confirmed-badge-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="confirmed-title-wrap">
          <span className="confirmed-title">Appointment Booked Successfully</span>
          <span className="confirmed-subtitle">Synchronized to Calendar and Client record</span>
        </div>
      </div>

      {/* Details Grid */}
      <div className="confirmed-grid">
        <div className="confirmed-item">
          <span className="confirmed-label">Client</span>
          <span className="confirmed-val highlight">{appointment.client?.name || 'Client'}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Service</span>
          <span className="confirmed-val highlight">{appointment.service?.name || 'Service'}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Stylist</span>
          <span className="confirmed-val highlight">{appointment.staff?.name || 'Stylist'}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Date</span>
          <span className="confirmed-val">{formattedDate}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Time Window</span>
          <span className="confirmed-val time-val">{timeWindow}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Appointment ID</span>
          <span className="confirmed-val id-val">{appointment.id}</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Status</span>
          <span className="confirmed-val status-val">Confirmed</span>
        </div>

        <div className="confirmed-item">
          <span className="confirmed-label">Price</span>
          <span className="confirmed-val price-val">{formattedPrice}</span>
        </div>
      </div>
    </div>
  )
}
