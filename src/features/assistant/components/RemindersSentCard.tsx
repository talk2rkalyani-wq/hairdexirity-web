import React from 'react'
import type { SentRemindersReceipt } from '../types'
import './RemindersSentCard.css'

interface RemindersSentCardProps {
  receipt: SentRemindersReceipt
}

export const RemindersSentCard: React.FC<RemindersSentCardProps> = ({ receipt }) => {
  return (
    <div
      className="reminders-sent-card"
      role="region"
      aria-label="Appointment reminders dispatched receipt"
    >
      {/* Banner */}
      <div className="sent-banner">
        <div className="sent-badge-icon" aria-hidden="true">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <div className="sent-title-wrap">
          <span className="sent-title">Reminders Dispatched Successfully</span>
          <span className="sent-subtitle">
            Synchronized with client notification records
          </span>
        </div>
      </div>

      {/* Meta Grid */}
      <div className="sent-meta-grid">
        <div className="sent-meta-item">
          <span className="sent-meta-label">Schedule Date</span>
          <span className="sent-meta-val">{receipt.formattedDate}</span>
        </div>

        <div className="sent-meta-item">
          <span className="sent-meta-label">Recipients Reached</span>
          <span className="sent-meta-val highlight">
            {receipt.sentCount} {receipt.sentCount === 1 ? 'Client' : 'Clients'}
          </span>
        </div>

        <div className="sent-meta-item">
          <span className="sent-meta-label">Delivery Channel</span>
          <span className="sent-meta-val channel">{receipt.deliveryChannel}</span>
        </div>

        <div className="sent-meta-item">
          <span className="sent-meta-label">Dispatched At</span>
          <span className="sent-meta-val">{receipt.dispatchedAt}</span>
        </div>
      </div>

      {/* Recipients Summary */}
      <div className="sent-recipients-list" role="list">
        {receipt.recipients.map((rec, idx) => (
          <div key={idx} className="sent-recipient-item" role="listitem">
            <div className="recipient-summary-left">
              <span className="recipient-summary-name">{rec.clientName}</span>
              <span className="recipient-summary-service">{rec.serviceName} ({rec.time})</span>
            </div>
            <div className="recipient-summary-right">
              <span className="recipient-summary-phone">{rec.clientPhone}</span>
              <span className="delivery-status-pill">Delivered</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
