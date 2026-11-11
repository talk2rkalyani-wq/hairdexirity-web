// ==============================================================================
// LUMA SALON — NOTIFICATION DOMAIN TYPES (PHASE 8)
// Role-Based Centralized Notifications, Delivery Channels & Preferences
// ==============================================================================

export type NotificationCategory =
  | 'appointment'
  | 'operational'
  | 'inventory'
  | 'financial'
  | 'system'

export type NotificationSeverity = 'info' | 'success' | 'warning' | 'critical'

export type NotificationRoleTarget = 'ALL' | 'OWNER' | 'RECEPTIONIST' | 'EMPLOYEE' | 'ADMIN'

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp'

export type NotificationDeliveryStatus = 'delivered' | 'pending' | 'mock_sent' | 'failed'

export interface AppNotification {
  id: string
  salonId: string
  recipientUserId?: string | null // Specific employee or user ID if targeted; null if role-wide
  targetRole: NotificationRoleTarget
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  message: string
  actionUrl?: string // Navigation path (e.g., 'owner/operations', 'receptionist/check-in')
  deduplicationKey?: string // Prevents duplicate notices for the same event within 15-minute window
  dedupBucket?: number // 15-minute epoch bucket
  isRead: boolean
  readAt?: string | null
  isDismissed: boolean // Persistent dismissal without deleting historical record
  dismissedAt?: string | null
  dismissedBy?: string | null
  createdAt: string // ISO 8601 string in UTC
  deliveryChannels: {
    inApp: boolean
    email?: NotificationDeliveryStatus
    sms?: NotificationDeliveryStatus
    whatsapp?: NotificationDeliveryStatus
  }
  metadata?: Record<string, any>
}

export interface NotificationPreferences {
  appointmentAlerts: boolean
  operationalAlerts: boolean
  inventoryAlerts: boolean
  financialAlerts: boolean
  soundEnabled: boolean
  emailDigest: boolean
  smsCriticalOnly: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  appointmentAlerts: true,
  operationalAlerts: true,
  inventoryAlerts: true,
  financialAlerts: true,
  soundEnabled: true,
  emailDigest: false,
  smsCriticalOnly: true,
}

