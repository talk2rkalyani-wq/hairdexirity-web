import React, { useEffect } from 'react'
import type { Staff, DayOfWeek } from '../../../types/models'
import { CloseIcon, EditIcon, PhoneIcon, MailIcon, ClockIcon } from '../../../components/Icons'
import { formatRoleName } from './StaffCard'
import './StaffProfileDrawer.css'

interface StaffProfileDrawerProps {
  staff: Staff
  onClose: () => void
  onEdit: (staff: Staff) => void
}

const daysOrder: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
]

export const StaffProfileDrawer: React.FC<StaffProfileDrawerProps> = ({
  staff,
  onClose,
  onEdit,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const initials = staff.name
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel = formatRoleName(staff.role)

  return (
    <div className="staff-drawer-overlay" onClick={onClose} aria-hidden="true">
      <aside
        className="staff-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Staff Profile: ${staff.name}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="staff-avatar-large" aria-hidden="true">
              {initials}
            </div>
            <div>
              <div className="drawer-name-row">
                <h2 className="drawer-staff-name">{staff.name}</h2>
                <span
                  className={`status-pill ${
                    staff.active ? 'pill-active' : 'pill-inactive'
                  }`}
                >
                  {staff.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <span className="drawer-role-badge">{staff.jobTitle || roleLabel}</span>
            </div>
          </div>

          <div className="drawer-actions-row">
            <button
              type="button"
              className="drawer-action-btn edit-btn"
              onClick={() => onEdit(staff)}
              aria-label={`Edit ${staff.name}`}
              title="Edit staff details"
            >
              <EditIcon size={16} />
              <span>Edit</span>
            </button>
            <button
              type="button"
              className="drawer-action-btn close-btn"
              onClick={onClose}
              aria-label="Close drawer"
              title="Close"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </div>

        {/* Drawer Body Content */}
        <div className="drawer-content">
          {/* Section: Personal Information */}
          <section className="drawer-section" aria-label="Personal Information">
            <h3 className="section-title">Personal Information</h3>
            <div className="info-card">
              <div className="info-item">
                <span className="info-label">Full Name:</span>
                <span className="info-value">{staff.name}</span>
              </div>

              {staff.jobTitle && (
                <div className="info-item">
                  <span className="info-label">Job Title:</span>
                  <span className="info-value highlight">{staff.jobTitle}</span>
                </div>
              )}

              {staff.gender && (
                <div className="info-item">
                  <span className="info-label">Gender:</span>
                  <span className="info-value">{staff.gender}</span>
                </div>
              )}

              <div className="info-item">
                <span className="info-label">Role Category:</span>
                <span className="info-value">{roleLabel}</span>
              </div>

              {staff.phone && (
                <div className="info-item">
                  <span className="info-label">Phone:</span>
                  <a href={`tel:${staff.phone}`} className="contact-link">
                    <PhoneIcon size={14} />
                    <span>{staff.phone}</span>
                  </a>
                </div>
              )}

              {staff.email && (
                <div className="info-item">
                  <span className="info-label">Email:</span>
                  <a href={`mailto:${staff.email}`} className="contact-link">
                    <MailIcon size={14} />
                    <span>{staff.email}</span>
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* Section: Professional Information */}
          <section className="drawer-section" aria-label="Professional Information">
            <h3 className="section-title">Professional Information</h3>
            <div className="info-card">
              <div className="info-item">
                <span className="info-label">Experience:</span>
                <span className="info-value">
                  {staff.experience || 'Not specified'}
                </span>
              </div>

              <div className="info-item">
                <span className="info-label">Availability Status:</span>
                <span
                  className={`status-pill ${
                    staff.active ? 'pill-active' : 'pill-inactive'
                  }`}
                >
                  {staff.active ? 'Available for bookings' : 'Currently inactive'}
                </span>
              </div>

              <div className="info-item col">
                <span className="info-label">Skills & Capabilities:</span>
                <div className="skills-chips-wrap">
                  {staff.skills && staff.skills.length > 0 ? (
                    staff.skills.map((skill: string, idx: number) => (
                      <span key={idx} className="skill-chip">
                        {skill}
                      </span>
                    ))
                  ) : (
                    <span className="skills-empty">No specific skills listed.</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Section: Working Hours Schedule */}
          <section className="drawer-section" aria-label="Working Hours Schedule">
            <div className="section-header-row">
              <h3 className="section-title">Weekly Schedule</h3>
              <div className="timezone-indicator">
                <ClockIcon size={14} />
                <span>Asia/Kolkata</span>
              </div>
            </div>

            <div className="schedule-table-wrap">
              <table className="schedule-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Status</th>
                    <th scope="col">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {daysOrder.map(({ key, label }) => {
                    const dayHours = staff.workingHours?.[key]
                    const isOpen = dayHours?.isOpen ?? true
                    const hoursText = isOpen
                      ? `${dayHours?.open || '10:00'} – ${dayHours?.close || '20:00'}`
                      : 'Day Off'

                    return (
                      <tr key={key} className={isOpen ? '' : 'schedule-day-off'}>
                        <td className="day-name">{label}</td>
                        <td>
                          <span
                            className={`schedule-pill ${
                              isOpen ? 'sched-open' : 'sched-off'
                            }`}
                          >
                            {isOpen ? 'Working' : 'Off'}
                          </span>
                        </td>
                        <td className="hours-val">{hoursText}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}
