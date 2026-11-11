import React from 'react'
import type { ChatMessage, PendingBooking, PendingReminderBatch } from '../types'
import { AppointmentResults } from './AppointmentResults'
import { AvailabilityResults } from './AvailabilityResults'
import { BookingPreviewCard } from './BookingPreviewCard'
import { BookingConfirmationCard } from './BookingConfirmationCard'
import { StylistSelectionCard } from './StylistSelectionCard'
import { RemindersPreviewCard } from './RemindersPreviewCard'
import { RemindersSentCard } from './RemindersSentCard'
import './ChatMessageItem.css'

interface ChatMessageItemProps {
  message: ChatMessage
  onConfirmBooking?: (pending: PendingBooking) => void
  onCancelBooking?: (pending: PendingBooking) => void
  onConfirmSendReminders?: (batch: PendingReminderBatch) => void
  onCancelSendReminders?: (batch: PendingReminderBatch) => void
  onSelectStylist?: (stylistName: string) => void
  isLatestMessage?: boolean
}

export const ChatMessageItem: React.FC<ChatMessageItemProps> = ({
  message,
  onConfirmBooking,
  onCancelBooking,
  onConfirmSendReminders,
  onCancelSendReminders,
  onSelectStylist,
  isLatestMessage = true,
}) => {
  const isUser = message.sender === 'user'

  if (isUser) {
    return (
      <div className="message-row user-row">
        <div className="user-bubble">
          <p className="message-text">{message.text}</p>
          <span className="message-time">{message.timestamp}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="message-row assistant-row">
      <div className="assistant-avatar" aria-hidden="true">
        <span>AI</span>
      </div>

      <div className="assistant-content">
        {message.isLoading ? (
          <div className="loading-indicator-box" role="status" aria-live="polite">
            <span className="loading-pulse-dot" />
            <span className="loading-text">{message.text || "Checking today's schedule..."}</span>
          </div>
        ) : (
          <div className="assistant-bubble">
            <p className="message-text">{message.text}</p>

            {/* List of appointments (for "Show today's bookings") */}
            {message.appointments && message.appointments.length > 0 && (
              <AppointmentResults appointments={message.appointments} />
            )}

            {/* Stylist Availability Results */}
            {message.availabilityResults && (
              <AvailabilityResults results={message.availabilityResults} />
            )}

            {/* Multi-Stylist Selection Choice */}
            {message.selectableStylists &&
              message.actionType === 'stylist_selection' && (
                <StylistSelectionCard
                  stylists={message.selectableStylists}
                  onSelectStylist={(name) => onSelectStylist?.(name)}
                  disabled={!isLatestMessage}
                />
              )}

            {/* Booking Preview Card (Awaiting Confirmation) */}
            {message.pendingBooking && (
              <BookingPreviewCard
                pendingBooking={message.pendingBooking}
                onConfirm={() => onConfirmBooking?.(message.pendingBooking!)}
                onCancel={() => onCancelBooking?.(message.pendingBooking!)}
                disabled={!isLatestMessage}
              />
            )}

            {/* Confirmed Appointment Receipt */}
            {message.confirmedAppointment && (
              <BookingConfirmationCard appointment={message.confirmedAppointment} />
            )}

            {/* Reminders Preview Card (Awaiting Confirmation) */}
            {message.pendingReminders && (
              <RemindersPreviewCard
                batch={message.pendingReminders}
                onConfirm={() => onConfirmSendReminders?.(message.pendingReminders!)}
                onCancel={() => onCancelSendReminders?.(message.pendingReminders!)}
                disabled={!isLatestMessage}
              />
            )}

            {/* Confirmed Sent Reminders Receipt */}
            {message.sentRemindersReceipt && (
              <RemindersSentCard receipt={message.sentRemindersReceipt} />
            )}

            <span className="message-time">{message.timestamp}</span>
          </div>
        )}
      </div>
    </div>
  )
}
