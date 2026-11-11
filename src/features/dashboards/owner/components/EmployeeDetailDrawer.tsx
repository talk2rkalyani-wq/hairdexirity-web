// ==============================================================================
// Luma Salon — Employee Live Detail Drawer (Phase 3)
// Real-Time Stylist Operational Profile, Today's Schedule & Workflow Timeline
// ==============================================================================

import React from 'react'
import type { StaffLiveStatus } from '../../../../services/liveOperationsService.ts'
import { liveOperationsService } from '../../../../services/liveOperationsService.ts'
import { formatCurrency, formatTime12h } from '../../../../utils/formatters.ts'
import {
  ClockIcon,
  PhoneIcon,
  MailIcon,
  AwardIcon,
  InfoIcon,
} from '../../../../components/Icons.tsx'

interface EmployeeDetailDrawerProps {
  staffStatus: StaffLiveStatus | null
  onClose: () => void
}

export const EmployeeDetailDrawer: React.FC<EmployeeDetailDrawerProps> = ({
  staffStatus,
  onClose,
}) => {
  if (!staffStatus) return null

  const { staff, status, statusLabel, statusReason, shiftHoursToday, currentAppointment } = staffStatus
  const timelineEvents = liveOperationsService.getEmployeeTimeline(staff.id)

  let badgeColorClass = 'badge-slate'
  if (status === 'AVAILABLE') badgeColorClass = 'badge-emerald'
  else if (status === 'BUSY') badgeColorClass = 'badge-purple'
  else if (status === 'ON_BREAK') badgeColorClass = 'badge-amber'
  else if (status === 'ON_LEAVE') badgeColorClass = 'badge-blue'
  else if (status === 'UNKNOWN') badgeColorClass = 'badge-rose'

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="employee-detail-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Live details for ${staff.name}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-header-left">
            <div className="drawer-avatar-wrap">
              {staff.avatarUrl ? (
                <img src={staff.avatarUrl} alt={staff.name} className="drawer-avatar-img" />
              ) : (
                <div className="drawer-avatar-placeholder">{staff.name.charAt(0)}</div>
              )}
            </div>
            <div className="drawer-title-col">
              <div className="drawer-name-row">
                <h2 className="drawer-employee-name">{staff.name}</h2>
                <span className={`status-pill ${badgeColorClass}`}>{statusLabel}</span>
              </div>
              <span className="drawer-job-title">
                {staff.jobTitle || 'Hair Stylist'} &bull; {staff.role.replace('_', ' ')}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="Close detail panel"
          >
            &times;
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="drawer-body">
          {/* Operational Status Banner */}
          <div className="drawer-status-banner">
            <span className="banner-status-headline">Current Operational Status</span>
            <p className="banner-status-desc">{statusReason}</p>
            {shiftHoursToday && (
              <span className="banner-shift-time">
                Today's Working Hours:{' '}
                {shiftHoursToday.isOpen
                  ? `${formatTime12h(shiftHoursToday.open)} – ${formatTime12h(shiftHoursToday.close)}`
                  : 'Weekly Scheduled Off'}
              </span>
            )}
          </div>

          {/* Current Active Service (if With Customer) */}
          {currentAppointment && (
            <div className="active-service-card">
              <div className="active-service-header">
                <span className="service-live-dot" />
                <span className="active-service-title">In-Progress Service</span>
              </div>
              <div className="active-service-details">
                <div className="active-field">
                  <span className="field-label">Customer</span>
                  <span className="field-val">{currentAppointment.clientName || 'Guest'}</span>
                </div>
                <div className="active-field">
                  <span className="field-label">Service</span>
                  <span className="field-val text-purple">
                    {currentAppointment.serviceName || 'Service'}
                  </span>
                </div>
                <div className="active-field">
                  <span className="field-label">Scheduled Timing</span>
                  <span className="field-val">
                    {formatTime12h(currentAppointment.startTime)} –{' '}
                    {formatTime12h(currentAppointment.endTime)}
                  </span>
                </div>
                <div className="active-field">
                  <span className="field-label">Service Price</span>
                  <span className="field-val text-gold">
                    {formatCurrency(currentAppointment.price)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Daily Workload KPI Summary */}
          <div className="drawer-kpi-grid">
            <div className="drawer-mini-kpi">
              <span className="mini-kpi-label">Completed Today</span>
              <span className="mini-kpi-val text-emerald">
                {staffStatus.completedAppointmentsToday.length}
              </span>
            </div>
            <div className="drawer-mini-kpi">
              <span className="mini-kpi-label">Upcoming Slots</span>
              <span className="mini-kpi-val text-purple">
                {staffStatus.upcomingAppointments.length}
              </span>
            </div>
            <div className="drawer-mini-kpi">
              <span className="mini-kpi-label">Total Assigned</span>
              <span className="mini-kpi-val">{staffStatus.totalAppointmentsToday}</span>
            </div>
          </div>

          {/* Professional Profile & Contact */}
          <div className="drawer-section">
            <h3 className="section-title">Stylist Profile</h3>
            <div className="profile-details-grid">
              <div className="profile-detail-item">
                <PhoneIcon size={14} />
                <span>{staff.phone || 'Phone not registered'}</span>
              </div>
              <div className="profile-detail-item">
                <MailIcon size={14} />
                <span>{staff.email || 'Email not registered'}</span>
              </div>
              <div className="profile-detail-item">
                <AwardIcon size={14} />
                <span>Experience: {staff.experience || 'Not specified'}</span>
              </div>
              <div className="profile-detail-item">
                <ClockIcon size={14} />
                <span>Roster Status: {staff.active ? 'Active Employee' : 'Inactive'}</span>
              </div>
            </div>

            {staff.skills && staff.skills.length > 0 && (
              <div className="skills-chips-row">
                {staff.skills.map((skill) => (
                  <span key={skill} className="skill-chip">
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Today's Assigned Appointments */}
          <div className="drawer-section">
            <h3 className="section-title">Today's Appointment Schedule</h3>
            {staffStatus.totalAppointmentsToday === 0 ? (
              <div className="empty-schedule-box">
                <span>No appointments assigned to this stylist today.</span>
              </div>
            ) : (
              <div className="appointments-timeline-list">
                {staffStatus.completedAppointmentsToday.map((apt) => (
                  <div key={apt.id} className="apt-timeline-item item-completed">
                    <div className="apt-time-badge">
                      {formatTime12h(apt.startTime)}
                    </div>
                    <div className="apt-info-col">
                      <div className="apt-row-top">
                        <span className="apt-client-name">{apt.clientName || 'Guest'}</span>
                        <span className="apt-status-chip chip-done">Completed</span>
                      </div>
                      <span className="apt-service-name">{apt.serviceName}</span>
                    </div>
                  </div>
                ))}

                {currentAppointment && (
                  <div className="apt-timeline-item item-active">
                    <div className="apt-time-badge">
                      {formatTime12h(currentAppointment.startTime)}
                    </div>
                    <div className="apt-info-col">
                      <div className="apt-row-top">
                        <span className="apt-client-name">
                          {currentAppointment.clientName || 'Guest'}
                        </span>
                        <span className="apt-status-chip chip-in-progress">In Progress</span>
                      </div>
                      <span className="apt-service-name">{currentAppointment.serviceName}</span>
                    </div>
                  </div>
                )}

                {staffStatus.upcomingAppointments.map((apt) => (
                  <div key={apt.id} className="apt-timeline-item item-upcoming">
                    <div className="apt-time-badge">
                      {formatTime12h(apt.startTime)}
                    </div>
                    <div className="apt-info-col">
                      <div className="apt-row-top">
                        <span className="apt-client-name">{apt.clientName || 'Guest'}</span>
                        <span className="apt-status-chip chip-upcoming">Upcoming</span>
                      </div>
                      <span className="apt-service-name">{apt.serviceName}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Workflow History (Part 8) */}
          <div className="drawer-section">
            <h3 className="section-title">Verified Workflow History</h3>
            {timelineEvents.length === 0 ? (
              <div className="empty-schedule-box">
                <span>No workflow events recorded for today.</span>
              </div>
            ) : (
              <div className="events-timeline">
                {timelineEvents.map((evt) => (
                  <div key={evt.id} className="event-item">
                    <div className="event-bullet" />
                    <div className="event-body">
                      <div className="event-meta">
                        <span className="event-time">{formatTime12h(evt.timestamp)}</span>
                        <span className="event-badge">{evt.statusTag}</span>
                      </div>
                      <span className="event-title">{evt.title}</span>
                      <p className="event-desc">{evt.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Missing Data Source Transparency Note */}
            <div className="timeline-disclaimer">
              <InfoIcon size={14} />
              <span>
                Hardware biometric attendance punch-in and digital break tracking ledgers are
                pending Phase 4 integration. Timeline reflects verified appointment lifecycle events.
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  )
}
