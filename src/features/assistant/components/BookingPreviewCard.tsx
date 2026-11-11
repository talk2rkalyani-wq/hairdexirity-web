import React from 'react'
import type { PendingBooking } from '../types'
import { formatCurrency, formatTime12h, formatDateDisplay } from '../../../utils/formatters'
import './BookingPreviewCard.css'

interface BookingPreviewCardProps {
  pendingBooking: PendingBooking
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}

export const BookingPreviewCard: React.FC<BookingPreviewCardProps> = ({
  pendingBooking,
  onConfirm,
  onCancel,
  disabled = false,
}) => {
  const formattedDate = formatDateDisplay(pendingBooking.date)
  const timeWindow = `${formatTime12h(pendingBooking.startTime)} – ${formatTime12h(
    pendingBooking.endTime
  )}`
  const formattedPrice = formatCurrency(pendingBooking.price)

  return (
    <div className="booking-preview-card" role="region" aria-label="Appointment booking preview">
      {/* Header */}
      <div className="preview-header">
        <div className="preview-kicker-group">
          <span className="preview-kicker">Review & Schedule</span>
          <h4 className="preview-title">CONFIRM APPOINTMENT</h4>
        </div>
        <span className="preview-status-tag">Draft / Preview</span>
      </div>

      {/* Details Grid */}
      <div className="preview-grid">
        <div className="preview-item">
          <span className="preview-label">Client</span>
          <span className="preview-value highlight">{pendingBooking.clientName}</span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Service</span>
          <span className="preview-value highlight">{pendingBooking.serviceName}</span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Stylist</span>
          <span className="preview-value highlight">
            {pendingBooking.staffName}
            {pendingBooking.staffRole ? ` (${pendingBooking.staffRole})` : ''}
          </span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Date</span>
          <span className="preview-value">{formattedDate}</span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Time Window</span>
          <span className="preview-value time-val">{timeWindow}</span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Duration</span>
          <span className="preview-value">{pendingBooking.duration} mins</span>
        </div>

        <div className="preview-item price-row">
          <span className="preview-label">Total Price</span>
          <span className="preview-value price-val">{formattedPrice}</span>
        </div>

        <div className="preview-item">
          <span className="preview-label">Initial Status</span>
          <span className="preview-value status-val">Scheduled</span>
        </div>
      </div>

      {/* Safety Notice */}
      <div className="preview-safety-note">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>This is a preview. No appointment has been scheduled yet.</span>
      </div>

      {/* Action Buttons */}
      <div className="preview-actions">
        <button
          type="button"
          className="btn-confirm-booking"
          onClick={onConfirm}
          disabled={disabled}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Confirm Booking
        </button>

        <button
          type="button"
          className="btn-cancel-booking"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
