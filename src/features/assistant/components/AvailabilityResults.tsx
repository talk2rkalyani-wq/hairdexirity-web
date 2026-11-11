import React from 'react'
import type { AvailabilityCheckResult } from '../../../services/availabilityService'
import { AvailabilityCard } from './AvailabilityCard'
import './AvailabilityResults.css'

interface AvailabilityResultsProps {
  results: AvailabilityCheckResult
}

export const AvailabilityResults: React.FC<AvailabilityResultsProps> = ({ results }) => {
  const hasAvailable = results.availableStylists.length > 0

  if (!hasAvailable) {
    return (
      <div className="avail-no-results-box" role="region" aria-label="No stylists available">
        <div className="avail-no-results-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="avail-no-results-title">Schedule Conflict / Capacity</span>
        </div>

        {results.reasonSummary && (
          <p className="avail-reason-text">{results.reasonSummary}</p>
        )}

        <div className="avail-service-reminder">
          <span className="reminder-label">Requested service:</span>
          <span className="reminder-val">
            {results.service.name} ({results.duration} mins)
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="avail-results-container" role="region" aria-label="Available stylists list">
      <div className="avail-cards-list">
        {results.availableStylists.map((stylist) => (
          <AvailabilityCard key={stylist.staffId} stylist={stylist} />
        ))}
      </div>
    </div>
  )
}
