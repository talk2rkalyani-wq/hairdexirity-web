import React, { useState, useEffect, useMemo } from 'react'
import type {
  EnrichedAppointment,
  AppointmentStatus,
  Client,
  Service,
  Staff,
} from '../../../types/models'
import { clientService } from '../../../services/clientService'
import { serviceService } from '../../../services/serviceService'
import { staffService } from '../../../services/staffService'
import { appointmentService } from '../../../services/appointmentService'
import {
  calculateEndTime,
  timeToMinutes,
  formatCurrency,
  formatTime12h,
} from '../../../utils/formatters'
import './AppointmentFormModal.css'

interface AppointmentFormModalProps {
  isOpen: boolean
  initialAppointment?: EnrichedAppointment | null
  defaultDate?: string
  defaultTime?: string
  onClose: () => void
  onSaved: (appointment: EnrichedAppointment) => void
}

// Generate 15-minute time options from 09:00 to 20:30
const TIME_OPTIONS: { value: string; label: string }[] = []
for (let h = 9; h <= 20; h++) {
  for (const m of [0, 15, 30, 45]) {
    if (h === 20 && m > 30) break
    const val = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    TIME_OPTIONS.push({
      value: val,
      label: formatTime12h(val),
    })
  }
}

export const AppointmentFormModal: React.FC<AppointmentFormModalProps> = ({
  isOpen,
  initialAppointment,
  defaultDate,
  defaultTime,
  onClose,
  onSaved,
}) => {
  const isEdit = Boolean(initialAppointment)

  // Reference data loaded asynchronously
  const [clients, setClients] = useState<Client[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])

  // Form State
  const [clientId, setClientId] = useState<string>('')
  const [serviceId, setServiceId] = useState<string>('')
  const [staffId, setStaffId] = useState<string>('')
  const [date, setDate] = useState<string>('')
  const [startTime, setStartTime] = useState<string>('10:00')
  const [duration, setDuration] = useState<number>(45)
  const [price, setPrice] = useState<number>(1000)
  const [status, setStatus] = useState<AppointmentStatus>('scheduled')
  const [notes, setNotes] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)

  // Load reference datasets
  useEffect(() => {
    let active = true

    Promise.all([
      clientService.getClients(),
      serviceService.getServices(),
      staffService.getStaff(),
    ]).then(([clientsData, servicesData, staffData]) => {
      if (!active) return
      setClients(clientsData)
      setServices(servicesData.filter((s) => s.active))
      setStaffList(staffData)
    })

    return () => {
      active = false
    }
  }, [isOpen])

  // Computed end time
  const endTime = useMemo(() => {
    return calculateEndTime(startTime, duration)
  }, [startTime, duration])

  // Initialize or reset form values
  useEffect(() => {
    if (!isOpen) return

    setErrorMessage(null)

    if (initialAppointment) {
      setClientId(initialAppointment.clientId)
      setServiceId(initialAppointment.serviceId)
      setStaffId(initialAppointment.staffId)
      setDate(initialAppointment.date)
      setStartTime(initialAppointment.startTime)

      const initialDuration =
        initialAppointment.service?.duration ||
        Math.max(
          15,
          timeToMinutes(initialAppointment.endTime) - timeToMinutes(initialAppointment.startTime)
        )
      setDuration(initialDuration)
      setPrice(initialAppointment.price)
      setStatus(initialAppointment.status)
      setNotes(initialAppointment.notes || '')
    } else {
      // New Appointment defaults
      const firstClient = clients[0]?.id || ''
      const firstService = services[0]
      const firstActiveStaff = staffList.find((s) => s.active)?.id || ''

      setClientId(firstClient)
      setServiceId(firstService?.id || '')
      setStaffId(firstActiveStaff)
      setDate(defaultDate || new Date().toISOString().split('T')[0])
      setStartTime(defaultTime || '10:00')
      setDuration(firstService?.duration || 45)
      setPrice(firstService?.price || 1000)
      setStatus('scheduled')
      setNotes('')
    }
  }, [isOpen, initialAppointment, defaultDate, defaultTime, clients, services, staffList])

  // When user selects a Service, auto-derive Duration and Price
  const handleServiceChange = (newServiceId: string) => {
    setServiceId(newServiceId)
    const matchedService = services.find((s) => s.id === newServiceId)
    if (matchedService) {
      setDuration(matchedService.duration)
      setPrice(matchedService.price)
    }
  }

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Basic required field validations
    if (!clientId) {
      setErrorMessage('Please select a client.')
      return
    }
    if (!serviceId) {
      setErrorMessage('Please select a service.')
      return
    }
    if (!staffId) {
      setErrorMessage('Please select a stylist.')
      return
    }
    if (!date) {
      setErrorMessage('Please select an appointment date.')
      return
    }
    if (!startTime) {
      setErrorMessage('Please specify a start time.')
      return
    }
    if (duration <= 0) {
      setErrorMessage('Duration must be greater than 0 minutes.')
      return
    }

    setIsSubmitting(true)

    try {
      if (isEdit && initialAppointment) {
        const updated = await appointmentService.updateAppointment(initialAppointment.id, {
          clientId,
          serviceId,
          staffId,
          date,
          startTime,
          endTime,
          price,
          status,
          notes: notes.trim() || undefined,
        })

        const enrichedUpdated: EnrichedAppointment = {
          ...updated,
          client: clients.find((c) => c.id === clientId) || initialAppointment.client,
          service: services.find((s) => s.id === serviceId) || initialAppointment.service,
          staff: staffList.find((s) => s.id === staffId) || initialAppointment.staff,
        }

        onSaved(enrichedUpdated)
        onClose()
      } else {
        const created = await appointmentService.createAppointment({
          clientId,
          serviceId,
          staffId,
          date,
          startTime,
          endTime,
          price,
          status,
          notes: notes.trim() || undefined,
        })

        const enrichedCreated: EnrichedAppointment = {
          ...created,
          client: clients.find((c) => c.id === clientId),
          service: services.find((s) => s.id === serviceId),
          staff: staffList.find((s) => s.id === staffId),
        }

        onSaved(enrichedCreated)
        onClose()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An error occurred while saving.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="cal-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="cal-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        {/* Modal Header */}
        <div className="cal-modal-header">
          <div className="cal-modal-title-wrap">
            <span className="cal-modal-badge">
              {isEdit ? 'Update Booking' : 'New Schedule'}
            </span>
            <h3 className="cal-modal-title">
              {isEdit ? 'Edit Appointment' : 'Create New Appointment'}
            </h3>
          </div>
          <button
            type="button"
            className="cal-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="cal-modal-form">
          {/* Error Alert */}
          {errorMessage && (
            <div className="cal-form-error-alert" role="alert">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Row 1: Client & Service */}
          <div className="cal-form-row">
            <div className="cal-field-group">
              <label htmlFor="cal-client-select" className="cal-label">
                Client <span className="req">*</span>
              </label>
              <select
                id="cal-client-select"
                className="cal-input cal-select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                <option value="" disabled>Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.isVip ? '⭐ [VIP] ' : ''}{c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div className="cal-field-group">
              <label htmlFor="cal-service-select" className="cal-label">
                Service <span className="req">*</span>
              </label>
              <select
                id="cal-service-select"
                className="cal-input cal-select"
                value={serviceId}
                onChange={(e) => handleServiceChange(e.target.value)}
                required
              >
                <option value="" disabled>Select service...</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({formatCurrency(s.price)} • {s.duration} min)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Stylist & Date */}
          <div className="cal-form-row">
            <div className="cal-field-group">
              <label htmlFor="cal-staff-select" className="cal-label">
                Stylist / Staff <span className="req">*</span>
              </label>
              <select
                id="cal-staff-select"
                className="cal-input cal-select"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                required
              >
                <option value="" disabled>Select stylist...</option>
                {staffList.map((st) => (
                  <option
                    key={st.id}
                    value={st.id}
                    disabled={!st.active}
                  >
                    {st.name} — {st.jobTitle || st.role} {!st.active ? '(Inactive)' : ''}
                  </option>
                ))}
              </select>
              {staffId === 'staff-real-03' && (
                <div style={{ fontSize: '0.75rem', color: '#c5a059', marginTop: '4px', lineHeight: '1.4' }}>
                  👑 <strong>Owner 1 (Rajesh)</strong>: In-salon front-desk booking permitted. (AI Assistant/online bookings for VIP clients will be restricted by pending production trigger <code>fn_enforce_vip_booking_rules</code>).
                </div>
              )}
            </div>

            <div className="cal-field-group">
              <label htmlFor="cal-date-input" className="cal-label">
                Appointment Date <span className="req">*</span>
              </label>
              <input
                id="cal-date-input"
                type="date"
                className="cal-input cal-date-picker"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Row 3: Start Time & Duration & Computed End Time */}
          <div className="cal-form-row tri-col">
            <div className="cal-field-group">
              <label htmlFor="cal-time-select" className="cal-label">
                Start Time <span className="req">*</span>
              </label>
              <select
                id="cal-time-select"
                className="cal-input cal-select"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.value})
                  </option>
                ))}
              </select>
            </div>

            <div className="cal-field-group">
              <label htmlFor="cal-duration-input" className="cal-label">
                Duration (min) <span className="req">*</span>
              </label>
              <input
                id="cal-duration-input"
                type="number"
                min="15"
                max="360"
                step="5"
                className="cal-input"
                value={duration}
                onChange={(e) => setDuration(Math.max(15, parseInt(e.target.value, 10) || 15))}
                required
              />
            </div>

            <div className="cal-field-group">
              <label className="cal-label">Computed End Time</label>
              <div className="cal-input-readonly" title="Automatically calculated from Start Time + Duration">
                {formatTime12h(endTime)} ({endTime})
              </div>
            </div>
          </div>

          {/* Row 4: Price & Status */}
          <div className="cal-form-row">
            <div className="cal-field-group">
              <label htmlFor="cal-price-input" className="cal-label">
                Price (₹ INR) <span className="req">*</span>
              </label>
              <div className="cal-currency-input-wrap">
                <span className="cal-currency-symbol">₹</span>
                <input
                  id="cal-price-input"
                  type="number"
                  min="0"
                  step="50"
                  className="cal-input with-prefix"
                  value={price}
                  onChange={(e) => setPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                  required
                />
              </div>
            </div>

            <div className="cal-field-group">
              <label htmlFor="cal-status-select" className="cal-label">
                Booking Status
              </label>
              <select
                id="cal-status-select"
                className="cal-input cal-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
              >
                <option value="scheduled">Scheduled</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="no-show">No-Show</option>
              </select>
            </div>
          </div>

          {/* Row 5: Notes */}
          <div className="cal-field-group">
            <label htmlFor="cal-notes-textarea" className="cal-label">
              Appointment Notes / Instructions <span className="cal-opt">(Optional)</span>
            </label>
            <textarea
              id="cal-notes-textarea"
              className="cal-input cal-textarea"
              rows={3}
              placeholder="e.g., Client requested ammonia-free coloring..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Modal Footer */}
          <div className="cal-modal-footer">
            <button
              type="button"
              className="cal-modal-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="cal-modal-save-btn"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Schedule Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
