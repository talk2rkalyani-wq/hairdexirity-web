// ==============================================================================
// Luma Salon — Employee Profile Header Card (Phase 6)
// Individual Stylist Professional Identity, Skills, Live Floor State & Schedule
// ==============================================================================

import React from 'react'
import type { Staff, DayOfWeek } from '../../../../../types/models.ts'
import type { StaffLiveStatus } from '../../../../../services/liveOperationsService.ts'
import { formatTime12h } from '../../../../../utils/formatters.ts'
import {
  PhoneIcon,
  MailIcon,
  ClockIcon,
  AwardIcon,
  ScissorsIcon,
  ExternalLinkIcon,
} from '../../../../../components/Icons.tsx'
import type { NavId } from '../../../../../types/salon.ts'

interface EmployeeProfileCardProps {
  staff: Staff
  liveStatus: StaffLiveStatus | null
  onNavigate?: (route: NavId) => void
}

const DAYS_ORDER: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
]

export const EmployeeProfileCard: React.FC<EmployeeProfileCardProps> = ({
  staff,
  liveStatus,
  onNavigate,
}) => {
  const roleDisplay = staff.role
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  // Live status badge color
  let liveBadgeClass = 'badge-slate'
  let liveBadgeText = 'Off Shift'
  if (liveStatus) {
    if (liveStatus.status === 'AVAILABLE') {
      liveBadgeClass = 'badge-emerald'
      liveBadgeText = 'Floor Available'
    } else if (liveStatus.status === 'BUSY') {
      liveBadgeClass = 'badge-purple'
      liveBadgeText = 'With Customer'
    } else if (liveStatus.status === 'ON_BREAK') {
      liveBadgeClass = 'badge-amber'
      liveBadgeText = 'On Break'
    } else if (liveStatus.status === 'ON_LEAVE') {
      liveBadgeClass = 'badge-blue'
      liveBadgeText = 'On Leave'
    } else if (liveStatus.status === 'UNKNOWN') {
      liveBadgeClass = 'badge-rose'
      liveBadgeText = 'Unknown'
    }
  }

  // Calculate total weekly working hours
  let weeklyTotalHours = 0
  if (staff.workingHours) {
    Object.values(staff.workingHours).forEach((day) => {
      if (day.isOpen && day.open && day.close) {
        const [oH, oM] = day.open.split(':').map(Number)
        const [cH, cM] = day.close.split(':').map(Number)
        const duration = (cH * 60 + cM) - (oH * 60 + oM)
        if (duration > 0) weeklyTotalHours += duration / 60
      }
    })
  }

  return (
    <div className="employee-profile-header-card">
      <div className="profile-card-top">
        {/* Stylist Avatar with live indicator */}
        <div className="profile-avatar-wrap">
          {staff.avatarUrl ? (
            <img src={staff.avatarUrl} alt={staff.name} className="profile-avatar-img" />
          ) : (
            <div className="profile-avatar-initials">{staff.name.charAt(0)}</div>
          )}
          <span className={`profile-live-indicator ${liveStatus?.status === 'AVAILABLE' ? 'online' : liveStatus?.status === 'BUSY' ? 'busy' : 'offline'}`} />
        </div>

        {/* Identity & Badges */}
        <div className="profile-identity-col">
          <div className="profile-name-row">
            <h2 className="profile-stylist-name">{staff.name}</h2>
            <div className="profile-badge-group">
              <span className={`status-pill ${liveBadgeClass}`}>
                <span className="status-dot" />
                {liveBadgeText}
              </span>
              <span className={`status-pill ${staff.active ? 'pill-active' : 'pill-inactive'}`}>
                {staff.active ? 'Active Roster' : 'Inactive'}
              </span>
            </div>
          </div>

          <div className="profile-meta-row">
            <span className="profile-job-title">
              <ScissorsIcon size={14} />
              {staff.jobTitle || roleDisplay}
            </span>
            <span className="profile-meta-divider">&bull;</span>
            <span className="profile-role-badge">
              <AwardIcon size={14} />
              {roleDisplay}
            </span>
            {staff.experience && (
              <>
                <span className="profile-meta-divider">&bull;</span>
                <span className="profile-experience-tag">{staff.experience} Exp</span>
              </>
            )}
          </div>

          {/* Contact Details */}
          <div className="profile-contact-row">
            {staff.phone && (
              <span className="profile-contact-item">
                <PhoneIcon size={13} />
                {staff.phone}
              </span>
            )}
            {staff.email && (
              <span className="profile-contact-item">
                <MailIcon size={13} />
                {staff.email}
              </span>
            )}
          </div>
        </div>

        {/* Actions Jump */}
        {onNavigate && (
          <div className="profile-actions-col">
            <button
              type="button"
              className="profile-jump-btn"
              onClick={() => onNavigate('staff')}
              title="Edit Stylist Profile in Staff Management"
            >
              <span>Manage Profile</span>
              <ExternalLinkIcon size={14} />
            </button>
            <button
              type="button"
              className="profile-jump-sub-btn"
              onClick={() => onNavigate('owner/operations')}
              title="View Live Salon Operations Floor"
            >
              <span>Floor Monitor</span>
            </button>
          </div>
        )}
      </div>

      {/* Skills & Shift Schedule Highlights */}
      <div className="profile-card-bottom">
        {/* Skills Tags */}
        <div className="profile-skills-col">
          <span className="section-micro-label">Specializations & Skills</span>
          <div className="skills-chip-wrap">
            {staff.skills && staff.skills.length > 0 ? (
              staff.skills.map((skill) => (
                <span key={skill} className="skill-chip-tag">
                  {skill}
                </span>
              ))
            ) : (
              <span className="text-muted-tag">General Hairdressing</span>
            )}
          </div>
        </div>

        {/* Shift Schedule Mini-Bar */}
        <div className="profile-schedule-col">
          <div className="schedule-header-row">
            <span className="section-micro-label">
              <ClockIcon size={12} />
              <span>Weekly Shift Hours ({weeklyTotalHours} hrs scheduled)</span>
            </span>
          </div>

          <div className="weekly-schedule-mini-grid">
            {DAYS_ORDER.map(({ key, label }) => {
              const dayConfig = staff.workingHours ? staff.workingHours[key] : null
              const isOpen = dayConfig?.isOpen && dayConfig?.open && dayConfig?.close
              return (
                <div
                  key={key}
                  className={`schedule-day-block ${isOpen ? 'day-open' : 'day-off'}`}
                  title={
                    isOpen
                      ? `${label}: ${formatTime12h(dayConfig!.open)} – ${formatTime12h(dayConfig!.close)}`
                      : `${label}: Scheduled Off`
                  }
                >
                  <span className="day-label">{label}</span>
                  <span className="day-hours-text">
                    {isOpen ? `${dayConfig!.open.slice(0, 2)}h` : 'Off'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

