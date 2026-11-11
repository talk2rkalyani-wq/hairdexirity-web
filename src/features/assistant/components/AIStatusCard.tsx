import React from 'react'
import './AIStatusCard.css'

interface AIStatusCardProps {
  ownerName: string
}

export const AIStatusCard: React.FC<AIStatusCardProps> = ({ ownerName }) => {
  return (
    <article className="ai-status-card" aria-label="AI Salon Status">
      <div className="status-card-header">
        <div className="ai-icon-badge" aria-hidden="true">
          <span>AI</span>
        </div>
        <span className="status-label">SALON AI ACTIVE</span>
      </div>

      <p className="status-greeting">
        Hi {ownerName}! I can help you manage bookings, check availability, send
        client reminders, and grow your salon.
      </p>
    </article>
  )
}
