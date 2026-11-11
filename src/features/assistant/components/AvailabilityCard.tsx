import React from 'react'
import type { AvailableStylistResult } from '../../../services/availabilityService'
import './AvailabilityCard.css'

interface AvailabilityCardProps {
  stylist: AvailableStylistResult
}

export const AvailabilityCard: React.FC<AvailabilityCardProps> = ({ stylist }) => {
  return (
    <article className="avail-card" aria-label={`Stylist ${stylist.staffName} is available`}>
      {/* Top Header */}
      <div className="avail-card-header">
        <div className="avail-staff-info">
          <h4 className="avail-staff-name">{stylist.staffName}</h4>
          <span className="avail-role-badge">{stylist.role}</span>
        </div>
        <div className="avail-status-pill">
          <span className="avail-status-dot" />
          <span>Available</span>
        </div>
      </div>

      {/* Available Time Window Banner */}
      <div className="avail-window-box">
        <div className="avail-window-time">
          <span className="avail-window-label">Available Slot:</span>
          <span className="avail-window-val">{stylist.formattedTimeWindow}</span>
        </div>
        <span className="avail-hours-sub">{stylist.workingHoursSummary}</span>
      </div>

      {/* Matched Skills Tags */}
      {stylist.matchedSkills.length > 0 && (
        <div className="avail-skills-row">
          <span className="avail-skills-label">Matched skills:</span>
          <div className="avail-skills-tags">
            {stylist.matchedSkills.map((sk) => (
              <span key={sk} className="avail-skill-tag">
                {sk}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Explainability Checklist */}
      <div className="avail-checklist">
        <div className="avail-check-item">
          <span className="avail-check-icon">✓</span>
          <span>Service skill matched</span>
        </div>
        <div className="avail-check-item">
          <span className="avail-check-icon">✓</span>
          <span>{stylist.workingHoursSummary}</span>
        </div>
        <div className="avail-check-item">
          <span className="avail-check-icon">✓</span>
          <span>No conflicting appointment</span>
        </div>
        <div className="avail-check-item">
          <span className="avail-check-icon">✓</span>
          <span>Available {stylist.formattedTimeWindow}</span>
        </div>
      </div>
    </article>
  )
}
