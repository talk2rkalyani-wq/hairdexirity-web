// ==============================================================================
// LUMA SALON — CENTRALIZED NOTIFICATION SERVICE (PHASE 8.1 HARDENED)
// 15-Minute Window Deduplication, Persistent Dismissal & Cross-Device Sync
// ==============================================================================

import type {
  AppNotification,
  NotificationCategory,
  NotificationPreferences,
  NotificationRoleTarget,
  NotificationSeverity,
} from '../types/notification.ts'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '../types/notification.ts'
import { sessionService } from './sessionService.ts'

const STORAGE_PREFIX = 'luma_notifications_'
const PREFS_PREFIX = 'luma_notif_prefs_'
const DEDUP_WINDOW_MS = 15 * 60 * 1000 // 15 minutes in milliseconds

type NotificationListener = () => void

interface CreateNotificationParams {
  salonId?: string
  recipientUserId?: string | null
  targetRole: NotificationRoleTarget
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  message: string
  actionUrl?: string
  deduplicationKey?: string
  metadata?: Record<string, any>
  channels?: {
    email?: boolean
    sms?: boolean
    whatsapp?: boolean
  }
}

function getInitialSeedNotifications(salonId: string): AppNotification[] {
  const now = Date.now()
  const m = (minsAgo: number) => new Date(now - minsAgo * 60000).toISOString()
  const bucket = (timestampMs: number) => Math.floor(timestampMs / DEDUP_WINDOW_MS)

  return [
    // 1. Owner Operational & Inventory Alerts
    {
      id: `notif-${salonId}-1`,
      salonId,
      targetRole: 'OWNER',
      category: 'inventory',
      severity: 'warning',
      title: 'Low Inventory Alert: L\'Oreal Hair Spa Cream',
      message: 'Stock has fallen below threshold (2 units remaining). Restock recommended.',
      actionUrl: 'inventory',
      deduplicationKey: 'inv-low-loreal-spa',
      dedupBucket: bucket(now - 15 * 60000),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(15),
      deliveryChannels: {
        inApp: true,
        email: 'mock_sent',
      },
      metadata: { productId: 'prod-001', remainingStock: 2 },
    },
    {
      id: `notif-${salonId}-2`,
      salonId,
      targetRole: 'OWNER',
      category: 'financial',
      severity: 'info',
      title: 'Daily Revenue Settlement Reconciled',
      message: 'All issued invoices have matched POS card and UPI batch balances.',
      actionUrl: 'owner/reports',
      deduplicationKey: 'fin-daily-reconciled',
      dedupBucket: bucket(now - 60 * 60000),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(60),
      deliveryChannels: {
        inApp: true,
      },
    },
    // 2. Receptionist Alerts
    {
      id: `notif-${salonId}-3`,
      salonId,
      targetRole: 'RECEPTIONIST',
      category: 'appointment',
      severity: 'info',
      title: 'Walk-in Client Arrived: Rahul Sharma',
      message: 'Guest checked in at waiting lounge for Men\'s Signature Fade with Stylist Mia.',
      actionUrl: 'receptionist/check-in',
      deduplicationKey: 'apt-checkin-rahul-01',
      dedupBucket: bucket(now - 5 * 60000),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(5),
      deliveryChannels: {
        inApp: true,
      },
      metadata: { appointmentId: 'apt-seed-1' },
    },
    {
      id: `notif-${salonId}-4`,
      salonId,
      targetRole: 'RECEPTIONIST',
      category: 'operational',
      severity: 'warning',
      title: 'Service Delay: Chair 3 Running 10 Mins Over',
      message: 'Deep conditioning treatment in Chair 3 is taking longer than scheduled.',
      actionUrl: 'receptionist/dashboard',
      deduplicationKey: 'ops-delay-chair-3',
      dedupBucket: bucket(now - 25 * 60000),
      isRead: true,
      readAt: m(20),
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(25),
      deliveryChannels: {
        inApp: true,
      },
    },
    // 3. Employee / Stylist Alerts
    {
      id: `notif-${salonId}-5`,
      salonId,
      recipientUserId: 'staff-1', // Mia Patel
      targetRole: 'EMPLOYEE',
      category: 'appointment',
      severity: 'info',
      title: 'Next Client Waiting: Rahul Sharma',
      message: 'Your 2:30 PM client has checked in at reception and is ready in Lounge.',
      actionUrl: 'employee/service-workflow',
      deduplicationKey: 'stylist-client-waiting-rahul',
      dedupBucket: bucket(now - 4 * 60000),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(4),
      deliveryChannels: {
        inApp: true,
      },
      metadata: { appointmentId: 'apt-seed-1', clientName: 'Rahul Sharma' },
    },
    {
      id: `notif-${salonId}-6`,
      salonId,
      recipientUserId: 'staff-1',
      targetRole: 'EMPLOYEE',
      category: 'appointment',
      severity: 'success',
      title: 'Service Completed & Settled',
      message: 'Invoice INV-2026-1002 settled via UPI. Excellent client feedback received.',
      actionUrl: 'employee/appointments',
      deduplicationKey: 'stylist-service-settled-1002',
      dedupBucket: bucket(now - 50 * 60000),
      isRead: true,
      readAt: m(45),
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(50),
      deliveryChannels: {
        inApp: true,
      },
    },
    // 4. System / Operational All-Staff Notice
    {
      id: `notif-${salonId}-7`,
      salonId,
      targetRole: 'ALL',
      category: 'system',
      severity: 'info',
      title: 'Salon Workstation System Updated',
      message: 'Financial ledger immutability and multi-tender POS updates active.',
      deduplicationKey: 'sys-update-phase8',
      dedupBucket: bucket(now - 120 * 60000),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: m(120),
      deliveryChannels: {
        inApp: true,
      },
    },
  ]
}

class NotificationService {
  private notifications: Map<string, AppNotification[]> = new Map()
  private listeners: Set<NotificationListener> = new Set()
  private storageListenerBound = false

  constructor() {
    this.loadFromStorage()
    this.setupStorageSync()
  }

  private getActiveSalonId(): string {
    const session = sessionService.getCurrentSession()
    return session?.salonId || 'salon-luma-01'
  }

  private setupStorageSync() {
    if (typeof window !== 'undefined' && window.addEventListener && !this.storageListenerBound) {
      window.addEventListener('storage', (event) => {
        if (event.key && event.key.startsWith(STORAGE_PREFIX)) {
          this.loadFromStorage()
          this.notify()
        }
      })
      this.storageListenerBound = true
    }
  }

  public loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const salonId = this.getActiveSalonId()
        const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${salonId}`)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            // Ensure schema migration for isDismissed
            const migrated = parsed.map((item: any) => ({
              ...item,
              isDismissed: Boolean(item.isDismissed),
              dismissedAt: item.dismissedAt || null,
              dismissedBy: item.dismissedBy || null,
            }))
            this.notifications.set(salonId, migrated)
            return
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load notifications from localStorage:', e)
    }

    // Fallback seed
    const defaultSalon = 'salon-luma-01'
    this.notifications.set(defaultSalon, getInitialSeedNotifications(defaultSalon))
  }

  private persist(salonId: string) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const list = this.notifications.get(salonId) || []
        window.localStorage.setItem(`${STORAGE_PREFIX}${salonId}`, JSON.stringify(list))
      }
    } catch (e) {
      console.warn('Failed to persist notifications:', e)
    }
    this.notify()
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn()
      } catch (err) {
        console.error('Error in notification listener:', err)
      }
    })
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Returns notifications filtered by current user's salon, role, recipientId, and dismissal state.
   */
  public getNotifications(
    category?: NotificationCategory | 'all',
    unreadOnly = false,
    includeDismissed = false
  ): AppNotification[] {
    const session = sessionService.getCurrentSession()
    const salonId = session?.salonId || this.getActiveSalonId()
    const userRole = session?.role || 'OWNER'
    const employeeId = session?.employeeId

    let list = this.notifications.get(salonId)
    if (!list) {
      list = getInitialSeedNotifications(salonId)
      this.notifications.set(salonId, list)
    }

    // Role and tenant filtering
    let filtered = list.filter((n) => {
      if (n.salonId !== salonId) return false

      // Filter out dismissed notifications unless explicitly requested
      if (!includeDismissed && n.isDismissed) return false

      if (n.targetRole === 'ALL') return true

      if (userRole === 'OWNER') {
        return n.targetRole === 'OWNER'
      }

      if (userRole === 'RECEPTIONIST') {
        return n.targetRole === 'RECEPTIONIST'
      }

      if (userRole === 'EMPLOYEE') {
        if (n.targetRole !== 'EMPLOYEE') return false
        if (n.recipientUserId) {
          return n.recipientUserId === employeeId
        }
        return true
      }

      if (userRole === 'ADMIN') {
        return true
      }

      return false
    })

    if (category && category !== 'all') {
      filtered = filtered.filter((n) => n.category === category)
    }

    if (unreadOnly) {
      filtered = filtered.filter((n) => !n.isRead)
    }

    // Sort descending by timestamp
    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Returns count of unread active notifications for current user
   */
  public getUnreadCount(): number {
    return this.getNotifications('all', true, false).length
  }

  /**
   * Marks a specific notification as read
   */
  public markAsRead(notificationId: string): void {
    const salonId = this.getActiveSalonId()
    const list = this.notifications.get(salonId) || []
    const target = list.find((n) => n.id === notificationId)
    if (target && !target.isRead) {
      target.isRead = true
      target.readAt = new Date().toISOString()
      this.persist(salonId)
    }
  }

  /**
   * Marks all eligible active notifications as read for the current role
   */
  public markAllAsRead(): void {
    const visible = this.getNotifications('all', true, false)
    if (visible.length === 0) return

    const nowIso = new Date().toISOString()
    visible.forEach((n) => {
      n.isRead = true
      n.readAt = nowIso
    })

    const salonId = this.getActiveSalonId()
    this.persist(salonId)
  }

  /**
   * Persistent dismissal: Marks notification as dismissed without deleting record
   */
  public dismissNotification(notificationId: string): void {
    const salonId = this.getActiveSalonId()
    const session = sessionService.getCurrentSession()
    const list = this.notifications.get(salonId) || []
    const target = list.find((n) => n.id === notificationId)
    if (target && !target.isDismissed) {
      target.isDismissed = true
      target.dismissedAt = new Date().toISOString()
      target.dismissedBy = session?.userId || 'unknown'
      // Dismissing also marks it as read to clear unread counts cleanly
      if (!target.isRead) {
        target.isRead = true
        target.readAt = target.dismissedAt
      }
      this.persist(salonId)
    }
  }

  /**
   * Restores an accidentally dismissed notification back to active status
   */
  public restoreNotification(notificationId: string): void {
    const salonId = this.getActiveSalonId()
    const list = this.notifications.get(salonId) || []
    const target = list.find((n) => n.id === notificationId)
    if (target && target.isDismissed) {
      target.isDismissed = false
      target.dismissedAt = null
      target.dismissedBy = null
      this.persist(salonId)
    }
  }

  /**
   * Dispatches a new notification with transaction-safe 15-minute sliding window deduplication.
   * If a notification with the same deduplicationKey was created within the last 15 minutes,
   * it returns the existing notification to prevent notification storms.
   * Once 15 minutes have passed, a fresh notification with that key is permitted.
   */
  public createNotification(params: CreateNotificationParams): AppNotification | null {
    const salonId = params.salonId || this.getActiveSalonId()
    let list = this.notifications.get(salonId) || []
    const now = Date.now()

    // 1. Sliding 15-Minute Window Deduplication Check
    if (params.deduplicationKey) {
      const existingInWindow = list.find(
        (n) =>
          n.deduplicationKey === params.deduplicationKey &&
          !n.isDismissed &&
          now - new Date(n.createdAt).getTime() < DEDUP_WINDOW_MS
      )
      if (existingInWindow) {
        // Return existing active notification; duplicate suppressed
        return existingInWindow
      }
    }

    // 2. Preferences Check
    const prefs = this.getPreferences()
    if (params.category === 'appointment' && !prefs.appointmentAlerts) return null
    if (params.category === 'inventory' && !prefs.inventoryAlerts) return null
    // Mandatory operational & financial alerts are protected and cannot be suppressed

    // 3. Multi-Channel Dispatch Simulation
    const emailStatus = params.channels?.email ? 'mock_sent' : undefined
    const smsStatus = params.channels?.sms ? 'mock_sent' : undefined
    const waStatus = params.channels?.whatsapp ? 'mock_sent' : undefined

    const newNotification: AppNotification = {
      id: `notif-${salonId}-${now}-${Math.floor(Math.random() * 1000)}`,
      salonId,
      recipientUserId: params.recipientUserId || null,
      targetRole: params.targetRole,
      category: params.category,
      severity: params.severity,
      title: params.title,
      message: params.message,
      actionUrl: params.actionUrl,
      deduplicationKey: params.deduplicationKey,
      dedupBucket: Math.floor(now / DEDUP_WINDOW_MS),
      isRead: false,
      isDismissed: false,
      dismissedAt: null,
      dismissedBy: null,
      createdAt: new Date(now).toISOString(),
      deliveryChannels: {
        inApp: true,
        email: emailStatus,
        sms: smsStatus,
        whatsapp: waStatus,
      },
      metadata: params.metadata,
    }

    list.unshift(newNotification)
    this.notifications.set(salonId, list)
    this.persist(salonId)

    return newNotification
  }

  /**
   * Retrieves notification preferences for current session
   */
  public getPreferences(): NotificationPreferences {
    const session = sessionService.getCurrentSession()
    const key = `${PREFS_PREFIX}${session?.employeeId || session?.role || 'default'}`
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = window.localStorage.getItem(key)
        if (stored) {
          return { ...DEFAULT_NOTIFICATION_PREFERENCES, ...JSON.parse(stored) }
        }
      }
    } catch {
      // fallback
    }
    return { ...DEFAULT_NOTIFICATION_PREFERENCES }
  }

  /**
   * Updates notification preferences, enforcing mandatory security & operational policies
   */
  public updatePreferences(updates: Partial<NotificationPreferences>): NotificationPreferences {
    const session = sessionService.getCurrentSession()
    const key = `${PREFS_PREFIX}${session?.employeeId || session?.role || 'default'}`
    const current = this.getPreferences()
    // Mandatory alerts cannot be disabled: financial and operational critical stays true
    const updated: NotificationPreferences = {
      ...current,
      ...updates,
      financialAlerts: true, // Mandatory security/financial alert policy
      operationalAlerts: true, // Mandatory operational failure policy
    }

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, JSON.stringify(updated))
      }
    } catch (e) {
      console.warn('Failed to save preferences:', e)
    }

    this.notify()
    return updated
  }
}

export const notificationService = new NotificationService()
