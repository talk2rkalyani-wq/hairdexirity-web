import type { EnrichedAppointment, Client } from '../../types/models'
import type { AvailabilityCheckResult, AvailableStylistResult } from '../../services/availabilityService'

export type CommandIntent =
  | 'SHOW_TODAY_BOOKINGS'
  | 'SHOW_TODAY_REVENUE'
  | 'FIND_AVAILABLE_STYLIST'
  | 'CREATE_APPOINTMENT_REQUEST'
  | 'CONFIRM_BOOKING'
  | 'CANCEL_BOOKING'
  | 'SELECT_STYLIST'
  | 'SEND_APPOINTMENT_REMINDERS'
  | 'CONFIRM_SEND_REMINDERS'
  | 'CANCEL_SEND_REMINDERS'
  | 'UNKNOWN'

export interface ParsedCommand {
  intent: CommandIntent
  rawInput: string
  params?: Record<string, unknown>
}

export type AssistantResponseActionType =
  | 'appointment_list'
  | 'revenue_summary'
  | 'availability_results'
  | 'clarification_prompt'
  | 'booking_preview'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'stylist_selection'
  | 'client_selection'
  | 'reminders_preview'
  | 'reminders_sent'
  | 'empty'
  | 'error'
  | 'general'

export interface PendingBooking {
  clientId: string
  clientName: string
  clientPhone?: string
  serviceId: string
  serviceName: string
  staffId: string
  staffName: string
  staffRole: string
  date: string // "YYYY-MM-DD"
  startTime: string // "HH:mm"
  endTime: string // "HH:mm"
  duration: number
  price: number
  notes?: string
}

export interface PreparedReminderItem {
  appointmentId: string
  clientId: string
  clientName: string
  clientPhone: string
  serviceName: string
  staffName: string
  date: string
  startTime: string
  endTime: string
  price: number
  messageBody: string
  alreadySent?: boolean
}

export interface PendingReminderBatch {
  targetDate: string
  formattedDate: string
  totalCount: number
  items: PreparedReminderItem[]
}

export interface SentRemindersReceipt {
  batchDate: string
  formattedDate: string
  sentCount: number
  dispatchedAt: string
  deliveryChannel: string // 'WhatsApp & SMS'
  recipients: Array<{
    clientName: string
    clientPhone: string
    serviceName: string
    time: string
    status: 'delivered' | 'sent'
  }>
}

export interface AssistantActionResponse {
  type: AssistantResponseActionType
  message: string
  appointments?: EnrichedAppointment[]
  availabilityResults?: AvailabilityCheckResult
  pendingBooking?: PendingBooking
  confirmedAppointment?: EnrichedAppointment
  selectableStylists?: AvailableStylistResult[]
  selectableClients?: Client[]
  pendingReminders?: PendingReminderBatch
  sentRemindersReceipt?: SentRemindersReceipt
  timestamp: string
}

export interface ChatMessage {
  id: string
  sender: 'user' | 'assistant'
  text: string
  timestamp: string
  isLoading?: boolean
  appointments?: EnrichedAppointment[]
  availabilityResults?: AvailabilityCheckResult
  pendingBooking?: PendingBooking
  confirmedAppointment?: EnrichedAppointment
  selectableStylists?: AvailableStylistResult[]
  selectableClients?: Client[]
  pendingReminders?: PendingReminderBatch
  sentRemindersReceipt?: SentRemindersReceipt
  actionType?: AssistantResponseActionType
}

export interface ConversationContext {
  hasPendingBooking?: boolean
  pendingBooking?: PendingBooking | null
  hasPendingReminders?: boolean
  pendingReminders?: PendingReminderBatch | null
  pendingStylistSelection?: {
    clientId: string
    clientName: string
    serviceId: string
    serviceName: string
    date: string
    startTime: string
    endTime: string
    duration: number
    price: number
    availableStylists: AvailableStylistResult[]
  } | null
}
