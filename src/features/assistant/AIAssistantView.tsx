import React, { useState, useEffect } from 'react'
import { AIHero } from './components/AIHero'
import { AIStatusCard } from './components/AIStatusCard'
import { SuggestedActions } from './components/SuggestedActions'
import { ChatHistory } from './components/ChatHistory'
import { ChatComposer } from './components/ChatComposer'
import { interpretCommand } from './services/commandInterpreter'
import { executeCommand } from './services/actionHandler'
import { salonService } from '../../services/salonService'
import { sessionService } from '../../services/sessionService'
import type {
  ChatMessage,
  PendingBooking,
  PendingReminderBatch,
  ConversationContext,
} from './types'
import type { SuggestedAction } from '../../types/salon'
import './AIAssistantView.css'

interface AIAssistantViewProps {
  ownerName: string
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({ ownerName }) => {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [actions, setActions] = useState<SuggestedAction[]>([])

  // In-memory pending confirmation states
  const [pendingBooking, setPendingBooking] = useState<PendingBooking | null>(null)
  const [pendingReminders, setPendingReminders] = useState<PendingReminderBatch | null>(null)
  const [pendingStylistSelection, setPendingStylistSelection] = useState<
    ConversationContext['pendingStylistSelection']
  >(null)

  useEffect(() => {
    let isMounted = true
    const session = sessionService.getCurrentSession()

    salonService.getSuggestedActions().then((data) => {
      if (!isMounted) return
      if (session?.role === 'EMPLOYEE') {
        const employeeActions: SuggestedAction[] = [
          {
            id: 'bookings',
            label: 'Show my schedule today',
            query: "Show today's bookings",
          },
          {
            id: 'stylist',
            label: 'Check stylist availability',
            query: 'Find an available stylist for balayage at 4 PM',
          },
          {
            id: 'add-client',
            label: 'Add a new client',
            query: 'Add a new client',
          },
        ]
        setActions(employeeActions)
      } else if (session?.role === 'RECEPTIONIST') {
        setActions(data.filter((a) => a.id !== 'revenue'))
      } else {
        setActions(data)
      }
    })

    return () => {
      isMounted = false
    }
  }, [])


  /**
   * Unified Query Execution Pipeline:
   * Both text input submissions and interactive card button clicks run through here.
   */
  const handleExecuteQuery = async (
    rawQuery: string,
    explicitPendingBooking?: PendingBooking,
    explicitPendingReminders?: PendingReminderBatch
  ) => {
    const trimmed = rawQuery.trim()
    if (!trimmed || isProcessing) return

    setQuery('')

    const userTimestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    const userMessageId = `user-${Date.now()}`
    const loadingMessageId = `loading-${Date.now()}`

    const userMessage: ChatMessage = {
      id: userMessageId,
      sender: 'user',
      text: trimmed,
      timestamp: userTimestamp,
    }

    const activePendingBooking = explicitPendingBooking || pendingBooking
    const activePendingReminders = explicitPendingReminders || pendingReminders

    // Build context with current active session states
    const context: ConversationContext = {
      hasPendingBooking: Boolean(activePendingBooking),
      pendingBooking: activePendingBooking,
      pendingStylistSelection,
      hasPendingReminders: Boolean(activePendingReminders),
      pendingReminders: activePendingReminders,
    }

    // 1. Interpret user command intent with session context
    const parsedCommand = interpretCommand(trimmed, context)

    const loadingText =
      parsedCommand.intent === 'CREATE_APPOINTMENT_REQUEST' ||
      parsedCommand.intent === 'CONFIRM_BOOKING'
        ? 'Checking appointment details...'
        : parsedCommand.intent === 'FIND_AVAILABLE_STYLIST'
        ? 'Checking stylist availability...'
        : parsedCommand.intent === 'SEND_APPOINTMENT_REMINDERS' ||
          parsedCommand.intent === 'CONFIRM_SEND_REMINDERS'
        ? 'Preparing client reminders...'
        : parsedCommand.intent === 'SHOW_TODAY_REVENUE'
        ? 'Calculating revenue summary...'
        : "Checking today's schedule..."

    const loadingMessage: ChatMessage = {
      id: loadingMessageId,
      sender: 'assistant',
      text: loadingText,
      timestamp: userTimestamp,
      isLoading: true,
    }

    // Append user query and immediate subtle loading state
    setMessages((prev) => [...prev, userMessage, loadingMessage])
    setIsProcessing(true)

    // 2. Dispatch to application action handler with realistic short processing tick (400ms)
    try {
      await new Promise((resolve) => setTimeout(resolve, 400))
      const result = await executeCommand(parsedCommand, context)

      // Update state based on action result
      if (result.type === 'booking_preview' && result.pendingBooking) {
        setPendingBooking(result.pendingBooking)
        setPendingStylistSelection(null)
      } else if (result.type === 'stylist_selection' && result.selectableStylists) {
        // Prepare context for stylist selection
        if (parsedCommand.params) {
          setPendingStylistSelection({
            clientId: (parsedCommand.params.clientQuery as string) || '',
            clientName: (parsedCommand.params.clientQuery as string) || '',
            serviceId: (parsedCommand.params.serviceQuery as string) || '',
            serviceName: (parsedCommand.params.serviceQuery as string) || '',
            date: (parsedCommand.params.date as string) || '',
            startTime: (parsedCommand.params.startTime as string) || '',
            endTime: '',
            duration: 0,
            price: 0,
            availableStylists: result.selectableStylists,
          })
        }
      } else if (
        result.type === 'booking_confirmed' ||
        result.type === 'booking_cancelled'
      ) {
        setPendingBooking(null)
        setPendingStylistSelection(null)
      } else if (result.type === 'reminders_preview' && result.pendingReminders) {
        setPendingReminders(result.pendingReminders)
      } else if (
        result.type === 'reminders_sent' ||
        parsedCommand.intent === 'CANCEL_SEND_REMINDERS'
      ) {
        setPendingReminders(null)
      }

      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        sender: 'assistant',
        text: result.message,
        appointments: result.appointments,
        availabilityResults: result.availabilityResults,
        pendingBooking: result.pendingBooking,
        confirmedAppointment: result.confirmedAppointment,
        selectableStylists: result.selectableStylists,
        selectableClients: result.selectableClients,
        pendingReminders: result.pendingReminders,
        sentRemindersReceipt: result.sentRemindersReceipt,
        actionType: result.type,
        timestamp: result.timestamp,
        isLoading: false,
      }

      // Replace loading bubble with resolved assistant response
      setMessages((prev) =>
        prev.map((msg) => (msg.id === loadingMessageId ? assistantMessage : msg))
      )
    } catch (err) {
      console.error('Execution error:', err)
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        sender: 'assistant',
        text: 'I encountered an issue processing your request. Please try again.',
        timestamp: userTimestamp,
        actionType: 'error',
        isLoading: false,
      }
      setMessages((prev) =>
        prev.map((msg) => (msg.id === loadingMessageId ? errorMessage : msg))
      )
    } finally {
      setIsProcessing(false)
    }
  }

  // Interactive callbacks from BookingPreviewCard and StylistSelectionCard
  const handleConfirmBooking = (pending?: PendingBooking) => {
    const active = pending || pendingBooking || undefined
    if (active) {
      setPendingBooking(active)
    }
    handleExecuteQuery('Confirm', active)
  }

  const handleCancelBooking = (pending?: PendingBooking) => {
    const active = pending || pendingBooking || undefined
    handleExecuteQuery('Cancel', active)
  }

  const handleConfirmSendReminders = (batch?: PendingReminderBatch) => {
    const active = batch || pendingReminders || undefined
    if (active) {
      setPendingReminders(active)
    }
    handleExecuteQuery('Send', undefined, active)
  }

  const handleCancelSendReminders = (batch?: PendingReminderBatch) => {
    const active = batch || pendingReminders || undefined
    handleExecuteQuery('Cancel', undefined, active)
  }

  const handleSelectStylist = (stylistName: string) => {
    handleExecuteQuery(stylistName)
  }

  const handleSelectAction = (actionQuery: string) => {
    handleExecuteQuery(actionQuery)
  }

  const handleClearHistory = () => {
    setMessages([])
    setQuery('')
    setPendingBooking(null)
    setPendingReminders(null)
    setPendingStylistSelection(null)
  }

  const hasConversation = messages.length > 0

  return (
    <div className={`assistant-view-container ${hasConversation ? 'in-conversation' : ''}`}>
      <div className="assistant-content-wrapper">
        <AIHero />

        {/* When no conversation active: Show Hero + AI Status Card */}
        {!hasConversation ? (
          <div className="assistant-cards-flow">
            <AIStatusCard ownerName={ownerName} />
            {actions.length > 0 && (
              <SuggestedActions
                actions={actions}
                onSelectAction={handleSelectAction}
              />
            )}
          </div>
        ) : (
          /* When conversation active: Show interactive chat stream with results */
          <div className="conversation-flow">
            <ChatHistory
              messages={messages}
              onClear={handleClearHistory}
              onConfirmBooking={handleConfirmBooking}
              onCancelBooking={handleCancelBooking}
              onConfirmSendReminders={handleConfirmSendReminders}
              onCancelSendReminders={handleCancelSendReminders}
              onSelectStylist={handleSelectStylist}
            />
            {actions.length > 0 && (
              <div className="compact-suggestions">
                <SuggestedActions
                  actions={actions}
                  onSelectAction={handleSelectAction}
                />
              </div>
            )}
          </div>
        )}

        <ChatComposer
          value={query}
          onChange={setQuery}
          onSubmit={handleExecuteQuery}
        />
      </div>
    </div>
  )
}
