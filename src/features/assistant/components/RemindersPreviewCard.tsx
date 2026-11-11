import React, { useState } from 'react'
import type { PendingReminderBatch } from '../types'
import { formatTime12h } from '../../../utils/formatters'
import './RemindersPreviewCard.css'

interface RemindersPreviewCardProps {
  batch: PendingReminderBatch
  onConfirm: () => void
  onCancel: () => void
  disabled?: boolean
}

export const RemindersPreviewCard: React.FC<RemindersPreviewCardProps> = ({
  batch,
  onConfirm,
  onCancel,
  disabled = false,
}) => {
  const [showTemplate, setShowTemplate] = useState<boolean>(false)
  const sampleMessage = batch.items[0]?.messageBody || ''

  return (
    <div
      className="reminders-preview-card"
      role="region"
      aria-label="Appointment reminders preview"
    >
      {/* Header */}
      <div className="reminders-header">
        <div className="reminders-header-left">
          <div className="reminders-badge-icon" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="8" cy="10" r="1" fill="currentColor" />
              <circle cx="16" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <div>
            <span className="reminders-kicker">COMMUNICATIONS ENGINE</span>
            <h4 className="reminders-title">SEND APPOINTMENT REMINDERS</h4>
          </div>
        </div>

        <span className="reminders-count-pill">
          {batch.totalCount} {batch.totalCount === 1 ? 'Client' : 'Clients'}
        </span>
      </div>

      {/* Target Date Banner */}
      <div className="reminders-target-banner">
        <div className="banner-date-group">
          <span className="banner-label">Target Schedule:</span>
          <strong className="banner-date">{batch.formattedDate}</strong>
        </div>
        <span className="banner-channel-tag">WhatsApp & SMS</span>
      </div>

      {/* Recipient Item Cards */}
      <div className="recipients-list" role="list" aria-label="Recipient clients">
        {batch.items.map((item) => (
          <div key={item.appointmentId} className="recipient-row" role="listitem">
            <div className="recipient-left">
              <div className="recipient-avatar" aria-hidden="true">
                {item.clientName
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </div>
              <div className="recipient-info">
                <div className="recipient-name-row">
                  <span className="recipient-name">{item.clientName}</span>
                  <span className="recipient-phone">{item.clientPhone}</span>
                </div>
                <div className="recipient-service-row">
                  <span className="recipient-service">{item.serviceName}</span>
                  <span className="recipient-sep">•</span>
                  <span className="recipient-stylist">with {item.staffName}</span>
                </div>
              </div>
            </div>

            <div className="recipient-right">
              <span className="recipient-time">{formatTime12h(item.startTime)}</span>
              {item.alreadySent ? (
                <span className="status-badge previously-sent">Reminded</span>
              ) : (
                <span className="status-badge pending-send">Pending</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Message Template Accordion */}
      <div className="template-accordion">
        <button
          type="button"
          className="template-toggle-btn"
          onClick={() => setShowTemplate((prev) => !prev)}
          aria-expanded={showTemplate}
        >
          <span className="template-toggle-text">
            {showTemplate ? '▾ Hide Message Copy' : '▸ Preview WhatsApp Template'}
          </span>
        </button>

        {showTemplate && (
          <div className="template-preview-box">
            <p className="template-message-text">{sampleMessage}</p>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="reminders-actions">
        <button
          type="button"
          className="btn-confirm-reminders"
          onClick={onConfirm}
          disabled={disabled}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
          Send Reminders ({batch.totalCount})
        </button>

        <button
          type="button"
          className="btn-cancel-reminders"
          onClick={onCancel}
          disabled={disabled}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
