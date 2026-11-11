import React from 'react'
import type { Staff } from '../../../types/models'
import { PhoneIcon, ClockIcon } from '../../../components/Icons'
import './StaffCard.css'

interface StaffCardProps {
  staff: Staff
  onSelect: (staff: Staff) => void
}

export function formatRoleName(role: string): string {
  switch (role) {
    case 'owner':
      return 'Salon Owner'
    case 'master_stylist':
      return 'Master Stylist'
    case 'senior_stylist':
      return 'Senior Stylist'
    case 'colorist':
      return 'Color Specialist'
    case 'junior_stylist':
      return 'Junior Stylist'
    default:
      return role.replace(/_/g, ' ')
  }
}

export const StaffCard: React.FC<StaffCardProps> = ({ staff, onSelect }) => {
  const initials = staff.name
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const roleLabel = formatRoleName(staff.role)

  return (
    <article
      className={`staff-card ${staff.active ? '' : 'staff-card-inactive'}`}
      onClick={() => onSelect(staff)}
      tabIndex={0}
      role="button"
      aria-label={`View profile for ${staff.name}, ${roleLabel}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(staff)
        }
      }}
    >
      <div className="staff-card-header">
        <div className="staff-avatar-wrapper">
          <div className="staff-avatar-initials" aria-hidden="true">
            {initials}
          </div>
          <span
            className={`staff-status-dot ${staff.active ? 'dot-active' : 'dot-inactive'}`}
            title={staff.active ? 'Active' : 'Inactive'}
          />
        </div>

        <div className="staff-title-group">
          <div className="staff-name-row">
            <h3 className="staff-name">{staff.name}</h3>
            <span
              className={`staff-status-pill ${
                staff.active ? 'pill-active' : 'pill-inactive'
              }`}
            >
              {staff.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <span className="staff-role-badge">{staff.jobTitle || roleLabel}</span>
        </div>
      </div>

      <div className="staff-meta-row">
        {staff.gender && (
          <div className="staff-meta-item">
            <span className="meta-text">{staff.gender}</span>
          </div>
        )}
        {staff.phone && (
          <div className="staff-meta-item">
            <PhoneIcon size={14} className="meta-icon" />
            <span className="meta-text">{staff.phone}</span>
          </div>
        )}
        {staff.experience && (
          <div className="staff-meta-item">
            <ClockIcon size={14} className="meta-icon" />
            <span className="meta-text">{staff.experience} exp</span>
          </div>
        )}
      </div>

      <div className="staff-skills-container" aria-label="Stylist Skills">
        <span className="skills-heading">Skills & Capabilities:</span>
        <div className="skills-chips-wrap">
          {staff.skills && staff.skills.length > 0 ? (
            staff.skills.map((skill: string, idx: number) => (
              <span key={idx} className="skill-chip">
                {skill}
              </span>
            ))
          ) : (
            <span className="skills-empty">General salon services</span>
          )}
        </div>
      </div>
    </article>
  )
}
