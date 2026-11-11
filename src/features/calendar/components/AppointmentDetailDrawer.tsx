import React, { useEffect } from 'react'
import type { EnrichedAppointment, AppointmentStatus } from '../../../types/models'
import {
  formatCurrency,
  formatTime12h,
  formatDateDisplay,
  timeToMinutes,
} from '../../../utils/formatters'
import { formatStatusLabel } from './CalendarCard'
import './AppointmentDetailDrawer.css'

interface AppointmentDetailDrawerProps {
  isOpen: boolean
  appointment: EnrichedAppointment | null
  onClose: () => void
  onEdit: (appointment: EnrichedAppointment) => void
  onStatusChange: (appointmentId: string, newStatus: AppointmentStatus) => Promise<void> | void
  canEdit?: boolean
}

export const AppointmentDetailDrawer: React.FC<AppointmentDetailDrawerProps> = ({
  isOpen,
  appointment,
  onClose,
  onEdit,
  onStatusChange,
  canEdit = true,
}) => {

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !appointment) return null

  const client = appointment.client
  const service = appointment.service
  const staff = appointment.staff
  const formattedDate = formatDateDisplay(appointment.date)
  const formattedTime = `${formatTime12h(appointment.startTime)} – ${formatTime12h(
    appointment.endTime
  )}`
  const formattedPrice = formatCurrency(appointment.price)
  const statusLabel = formatStatusLabel(appointment.status)
  const durationMinutes =
    service?.duration ||
    Math.max(15, timeToMinutes(appointment.endTime) - timeToMinutes(appointment.startTime))

  return (
    <div className="cal-drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="cal-drawer-panel"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Drawer Header */}
        <div className="cal-drawer-header">
          <div className="cal-drawer-title-group">
            <span className="cal-drawer-kicker">Booking Reference</span>
            <h3 className="cal-drawer-title">Appointment Details</h3>
          </div>
          <div className="cal-drawer-header-actions">
            <span className={`cal-drawer-badge status-${appointment.status}`}>
              {statusLabel}
            </span>
            <button
              type="button"
              className="cal-drawer-close-btn"
              onClick={onClose}
              aria-label="Close appointment details"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="cal-drawer-body">
          {/* Quick Hero Banner */}
          <div className="cal-drawer-hero">
            <div className="hero-time-block">
              <span className="hero-date">{formattedDate}</span>
              <span className="hero-time">{formattedTime}</span>
            </div>
            <div className="hero-price-block">
              <span className="hero-price-label">Service Total</span>
              <span className="hero-price-val">{formattedPrice}</span>
            </div>
          </div>

          {/* Section: Client Details */}
          <div className="cal-drawer-section">
            <h4 className="cal-section-title">Client Information</h4>
            <div className="cal-info-card">
              <div className="cal-info-row">
                <span className="cal-info-label">Name</span>
                <span className="cal-info-value font-highlight">
                  {client?.name || 'Unknown Client'}
                </span>
              </div>
              <div className="cal-info-row">
                <span className="cal-info-label">Phone</span>
                <span className="cal-info-value font-mono">
                  {client?.phone || 'No phone provided'}
                </span>
              </div>
              {client?.email && (
                <div className="cal-info-row">
                  <span className="cal-info-label">Email</span>
                  <span className="cal-info-value font-mono">{client.email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Section: Service Details */}
          <div className="cal-drawer-section">
            <h4 className="cal-section-title">Service & Stylist</h4>
            <div className="cal-info-card">
              <div className="cal-info-row">
                <span className="cal-info-label">Service</span>
                <span className="cal-info-value font-highlight">
                  {service?.name || 'Custom Service'}
                </span>
              </div>
              {service?.category && (
                <div className="cal-info-row">
                  <span className="cal-info-label">Category</span>
                  <span className="cal-info-value capitalize">{service.category}</span>
                </div>
              )}
              <div className="cal-info-row">
                <span className="cal-info-label">Duration</span>
                <span className="cal-info-value">{durationMinutes} minutes</span>
              </div>
              <div className="cal-info-row">
                <span className="cal-info-label">Assigned Stylist</span>
                <span className="cal-info-value font-highlight">
                  {staff?.name || 'Unassigned'}
                  {staff?.role ? ` (${staff.role})` : ''}
                </span>
              </div>
            </div>
          </div>

          {/* Section: Notes */}
          <div className="cal-drawer-section">
            <h4 className="cal-section-title">Notes</h4>
            <div className="cal-notes-box">
              {appointment.notes ? (
                <p className="cal-notes-text">{appointment.notes}</p>
              ) : (
                <p className="cal-notes-empty">No special instructions or notes added.</p>
              )}
            </div>
          </div>

          {/* Section: Status Actions */}
          <div className="cal-drawer-section">
            <h4 className="cal-section-title">Quick Actions & Status</h4>
            <div className="cal-status-actions-grid">
              {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                <button
                  type="button"
                  className="btn-status-action action-checkin"
                  onClick={() => onStatusChange(appointment.id, 'checked_in')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <polyline points="10 17 15 12 10 7" />
                    <line x1="15" y1="12" x2="3" y2="12" />
                  </svg>
                  Check In Client
                </button>
              )}

              {(appointment.status === 'checked_in' || appointment.status === 'confirmed') && (
                <button
                  type="button"
                  className="btn-status-action action-startservice"
                  onClick={() => onStatusChange(appointment.id, 'in_progress')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Start Service
                </button>
              )}

              {appointment.status !== 'confirmed' && appointment.status !== 'checked_in' && appointment.status !== 'in_progress' && appointment.status !== 'completed' && (
                <button
                  type="button"
                  className="btn-status-action action-confirm"
                  onClick={() => onStatusChange(appointment.id, 'confirmed')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Mark Confirmed
                </button>
              )}

              {appointment.status !== 'completed' && appointment.status !== 'cancelled' && appointment.status !== 'no-show' && (
                <button
                  type="button"
                  className="btn-status-action action-complete"
                  onClick={() => onStatusChange(appointment.id, 'completed')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Mark Completed
                </button>
              )}

              {appointment.status !== 'no-show' && appointment.status !== 'completed' && (
                <button
                  type="button"
                  className="btn-status-action action-noshow"
                  onClick={() => onStatusChange(appointment.id, 'no-show')}
                >
                  Mark No-Show
                </button>
              )}

              {appointment.status !== 'cancelled' && appointment.status !== 'completed' && (
                <button
                  type="button"
                  className="btn-status-action action-cancel"
                  onClick={() => onStatusChange(appointment.id, 'cancelled')}
                >
                  Cancel Booking
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Drawer Footer */}
        <div className="cal-drawer-footer">
          {canEdit && (
            <button
              type="button"
              className="cal-drawer-edit-btn"
              onClick={() => onEdit(appointment)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Edit Appointment
            </button>
          )}
          <button
            type="button"
            className="cal-drawer-done-btn"
            onClick={onClose}
          >
            Close
          </button>
        </div>

      </div>
    </div>
  )
}
