import React, { useRef } from 'react'
import { PlusIcon, MicIcon, SendIcon } from '../../../components/Icons'
import './ChatComposer.css'

interface ChatComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (message: string) => void
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  value,
  onChange,
  onSubmit,
}) => {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim()) {
        onSubmit(value.trim())
      }
    }
  }

  return (
    <form
      className="composer-form"
      onSubmit={handleSubmit}
      role="search"
      aria-label="AI Salon Assistant input"
    >
      <div className="composer-container">
        {/* Plus Action Button */}
        <button
          type="button"
          className="composer-btn plus-btn"
          aria-label="Add attachment or action"
          title="Add attachment"
          onClick={() => inputRef.current?.focus()}
        >
          <PlusIcon size={20} />
        </button>

        {/* Main Text Input */}
        <input
          ref={inputRef}
          type="text"
          className="composer-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything about your salon"
          aria-label="Ask anything about your salon"
          autoComplete="off"
        />

        {/* Right Controls: Mic & Send */}
        <div className="composer-actions">
          <button
            type="button"
            className="composer-btn mic-btn"
            aria-label="Voice input"
            title="Voice input"
          >
            <MicIcon size={20} />
          </button>

          <button
            type="submit"
            className="send-btn"
            disabled={!value.trim()}
            aria-label="Send query"
            title="Send query"
          >
            <SendIcon size={18} />
          </button>
        </div>
      </div>
    </form>
  )
}
