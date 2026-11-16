import React, { useState, useEffect } from 'react'
import type { Staff, Service } from '../../../../types/models'
import { staffService } from '../../../../services/staffService'
import { serviceService } from '../../../../services/serviceService'
import { clientService } from '../../../../services/clientService'
import { appointmentService } from '../../../../services/appointmentService'
import { getSalonDateStr, formatCurrency } from '../../../../utils/formatters'
import { CloseIcon, UsersIcon, ScissorsIcon } from '../../../../components/Icons'
import './WalkInIntakeModal.css'

interface WalkInIntakeModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export const WalkInIntakeModal: React.FC<WalkInIntakeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [staffId, setStaffId] = useState('')
  const [notes, setNotes] = useState('')
  const [services, setServices] = useState<Service[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setPhone('')
    setNotes('')
    setError(null)

    Promise.all([
      serviceService.getServices(),
      staffService.getStaff(),
    ]).then(([srvs, stfs]) => {
      const activeSrvs = srvs.filter((s) => s.active)
      const activeStfs = stfs.filter((s) => s.active)
      setServices(activeSrvs)
      setStaffList(activeStfs)
      if (activeSrvs.length > 0) setServiceId(activeSrvs[0].id)
      if (activeStfs.length > 0) setStaffId(activeStfs[0].id)
    }).catch((err) => {
      console.error('Failed to load services or staff for walk-in modal:', err)
    })
  }, [isOpen])

  if (!isOpen) return null

  const selectedService = services.find((s) => s.id === serviceId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Guest name is required.')
      return
    }
    if (!serviceId) {
      setError('Please select a service.')
      return
    }
    if (!staffId) {
      setError('Please assign an available stylist.')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      const duration = selectedService?.duration || 30
      const price = selectedService?.price || 0

      // Find or create client
      const allClients = await clientService.getClients()
      const cleanPhone = phone.trim()
      let client = cleanPhone ? allClients.find((c) => c.phone && c.phone.includes(cleanPhone)) : null
      if (!client && name.trim()) {
        client = allClients.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
      }

      if (!client) {
        client = await clientService.createClient({
          name: name.trim(),
          phone: cleanPhone || '+91 99999 00000',
          email: '',
          notes: 'Walk-in guest',
          preferences: {
            notes: 'Walk-in guest',
          },
        })
      }

      // Calculate start and end time
      const now = new Date()
      const hours = String(now.getHours()).padStart(2, '0')
      const mins = String(now.getMinutes()).padStart(2, '0')
      const startTime = `${hours}:${mins}`

      const endTotalMins = now.getHours() * 60 + now.getMinutes() + duration
      const endH = String(Math.floor(endTotalMins / 60) % 24).padStart(2, '0')
      const endM = String(endTotalMins % 60).padStart(2, '0')
      const endTime = `${endH}:${endM}`

      const todayStr = getSalonDateStr(0)

      await appointmentService.createAppointment({
        clientId: client.id,
        staffId,
        serviceId,
        date: todayStr,
        startTime,
        endTime,
        status: 'checked_in',
        price,
        notes: notes.trim() ? `[Walk-in] ${notes.trim()}` : '[Walk-in guest]',
        checkedInAt: new Date().toISOString(),
      })

      onSuccess()
      onClose()
    } catch (err: any) {
      console.error('Walk-in intake error:', err)
      setError(err.message || 'Failed to check in walk-in guest.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="walkin-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="walkin-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="walkin-modal-header">
          <div className="walkin-modal-title-row">
            <div className="walkin-modal-icon">
              <UsersIcon size={20} />
            </div>
            <div>
              <h2 className="walkin-modal-title">Fast Walk-In Intake</h2>
              <p className="walkin-modal-subtitle">
                Register arriving floor guest directly into Waiting Lounge queue.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="walkin-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {error && (
          <div className="walkin-error-banner" role="alert">
            <span>{error}</span>
          </div>
        )}

        <form className="walkin-modal-form" onSubmit={handleSubmit}>
          <div className="walkin-form-body">
            {/* Guest Name & Phone */}
            <div className="walkin-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="walkin-name">
                  Guest Name <span className="req">*</span>
                </label>
                <input
                  id="walkin-name"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Priya Sharma"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="walkin-phone">
                  Phone Number
                </label>
                <input
                  id="walkin-phone"
                  type="tel"
                  className="field-input"
                  placeholder="e.g. 98765 43210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>

            {/* Service & Stylist Selection */}
            <div className="walkin-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="walkin-service">
                  Requested Service <span className="req">*</span>
                </label>
                <select
                  id="walkin-service"
                  className="field-select"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                  required
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.duration}m • {formatCurrency(s.price)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="walkin-staff">
                  Assign Stylist <span className="req">*</span>
                </label>
                <select
                  id="walkin-staff"
                  className="field-select"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  required
                >
                  {staffList.map((st) => (
                    <option key={st.id} value={st.id}>
                      {st.name} ({st.jobTitle || st.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Service Summary Pill */}
            {selectedService && (
              <div className="walkin-summary-pill">
                <ScissorsIcon size={16} />
                <span>
                  Estimated duration: <strong>{selectedService.duration} mins</strong> • Price:{' '}
                  <strong>{formatCurrency(selectedService.price)}</strong>
                </span>
              </div>
            )}

            {/* Notes */}
            <div className="form-field">
              <label className="field-label" htmlFor="walkin-notes">
                Notes / Preferences (Optional)
              </label>
              <textarea
                id="walkin-notes"
                className="field-textarea"
                rows={2}
                placeholder="e.g. Short fade haircut, prefers cold beverage, sensitive scalp"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="walkin-modal-footer">
            <button
              type="button"
              className="walkin-btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="walkin-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Checking In...' : 'Check In to Lounge Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
