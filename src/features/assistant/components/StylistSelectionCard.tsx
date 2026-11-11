import React from 'react'
import type { AvailableStylistResult } from '../../../services/availabilityService'
import './StylistSelectionCard.css'

interface StylistSelectionCardProps {
  stylists: AvailableStylistResult[]
  onSelectStylist: (stylistName: string) => void
  disabled?: boolean
}

export const StylistSelectionCard: React.FC<StylistSelectionCardProps> = ({
  stylists,
  onSelectStylist,
  disabled = false,
}) => {
  return (
    <div className="stylist-selection-card" role="region" aria-label="Select a stylist for appointment">
      <div className="selection-header">
        <span className="selection-kicker">Multiple Stylists Available</span>
        <h4 className="selection-title">Choose your preferred stylist:</h4>
      </div>

      <div className="selection-list">
        {stylists.map((s) => (
          <div key={s.staffId} className="stylist-option-row">
            <div className="stylist-option-info">
              <div className="option-name-group">
                <span className="option-name">{s.staffName}</span>
                <span className="option-role">{s.role}</span>
              </div>
              <span className="option-window">Available {s.formattedTimeWindow}</span>
              {s.matchedSkills.length > 0 && (
                <span className="option-skills">
                  Specialties: {s.matchedSkills.join(', ')}
                </span>
              )}
            </div>

            <button
              type="button"
              className="btn-select-stylist"
              onClick={() => onSelectStylist(s.staffName)}
              disabled={disabled}
            >
              Select {s.staffName.split(' ')[0]}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
