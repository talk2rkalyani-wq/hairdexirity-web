import React, { useEffect, useRef } from 'react'
import type { ChatMessage, PendingBooking, PendingReminderBatch } from '../types'
import { ChatMessageItem } from './ChatMessageItem'
import './ChatHistory.css'

interface ChatHistoryProps {
  messages: ChatMessage[]
  onClear: () => void
  onConfirmBooking?: (pending: PendingBooking) => void
  onCancelBooking?: (pending: PendingBooking) => void
  onConfirmSendReminders?: (batch: PendingReminderBatch) => void
  onCancelSendReminders?: (batch: PendingReminderBatch) => void
  onSelectStylist?: (stylistName: string) => void
}

export const ChatHistory: React.FC<ChatHistoryProps> = ({
  messages,
  onClear,
  onConfirmBooking,
  onCancelBooking,
  onConfirmSendReminders,
  onCancelSendReminders,
  onSelectStylist,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <section className="chat-history-container" aria-label="AI Salon Conversation">
      <div className="chat-history-header">
        <div className="history-title-group">
          <span className="history-live-dot" />
          <span className="history-title">AI Salon Session</span>
        </div>
        <button
          type="button"
          className="clear-chat-btn"
          onClick={onClear}
          title="Reset conversation"
          aria-label="Reset conversation"
        >
          Reset Session
        </button>
      </div>

      <div className="messages-stream">
        {messages.map((message, idx) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            onConfirmBooking={onConfirmBooking}
            onCancelBooking={onCancelBooking}
            onConfirmSendReminders={onConfirmSendReminders}
            onCancelSendReminders={onCancelSendReminders}
            onSelectStylist={onSelectStylist}
            isLatestMessage={idx === messages.length - 1}
          />
        ))}
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    </section>
  )
}
