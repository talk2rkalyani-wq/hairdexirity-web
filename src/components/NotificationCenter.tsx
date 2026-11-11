// ==============================================================================
// LUMA SALON — CENTRALIZED NOTIFICATION CENTER (PHASE 8)
// Role-Based Alerts, Delivery Simulation, Filter Tabs & Preferences
// ==============================================================================

import React, { useState, useEffect, useMemo } from 'react'
import type { NavId } from '../types/salon.ts'
import type {
  AppNotification,
  NotificationCategory,
  NotificationPreferences,
} from '../types/notification.ts'
import { notificationService } from '../services/notificationService.ts'
import {
  BellIcon,
  CheckCircleIcon,
  CloseIcon,
  SettingsIcon,
  ClockIcon,
  InfoIcon,
  PackageIcon,
  ScissorsIcon,
  TrendingUpIcon,
} from './Icons.tsx'
import './NotificationCenter.css'

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
  onNavigate?: (id: NavId) => void
}

type TabType = 'all' | 'unread' | 'appointment' | 'operational' | 'financial' | 'inventory' | 'dismissed'

function formatKolkataTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60)
      return `${hours}h ago`
    }

    // Format in Asia/Kolkata
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    return 'Recent'
  }
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [isPrefsOpen, setIsPrefsOpen] = useState(false)
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    notificationService.getPreferences()
  )

  const reloadData = () => {
    if (activeTab === 'dismissed') {
      const allWithDismissed = notificationService.getNotifications('all', false, true)
      setNotifications(allWithDismissed.filter((n) => n.isDismissed))
    } else {
      const unreadOnly = activeTab === 'unread'
      const category =
        activeTab === 'all' || activeTab === 'unread'
          ? 'all'
          : (activeTab as NotificationCategory)
      setNotifications(notificationService.getNotifications(category, unreadOnly, false))
    }
    setPrefs(notificationService.getPreferences())
  }

  useEffect(() => {
    reloadData()
    const unsub = notificationService.subscribe(reloadData)
    return () => unsub()
  }, [activeTab])

  const unreadCount = useMemo(() => notificationService.getUnreadCount(), [notifications])

  if (!isOpen) return null

  const handleMarkAsRead = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    notificationService.markAsRead(id)
  }

  const handleMarkAllAsRead = () => {
    notificationService.markAllAsRead()
  }

  const handleDismiss = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    notificationService.dismissNotification(id)
  }

  const handleRestore = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    notificationService.restoreNotification(id)
  }

  const handleNotificationClick = (notif: AppNotification) => {
    notificationService.markAsRead(notif.id)
    if (notif.actionUrl && onNavigate) {
      onNavigate(notif.actionUrl as NavId)
      onClose()
    }
  }

  const handleTogglePref = (key: keyof NotificationPreferences) => {
    // Financial and operational alerts are mandatory security policies
    if (key === 'financialAlerts' || key === 'operationalAlerts') {
      return
    }
    const updated = notificationService.updatePreferences({
      [key]: !prefs[key],
    })
    setPrefs(updated)
  }

  const renderCategoryIcon = (category: NotificationCategory) => {
    switch (category) {
      case 'appointment':
        return <ScissorsIcon size={16} />
      case 'inventory':
        return <PackageIcon size={16} />
      case 'financial':
        return <TrendingUpIcon size={16} />
      case 'operational':
        return <ClockIcon size={16} />
      default:
        return <InfoIcon size={16} />
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="notif-center-backdrop" onClick={onClose} aria-hidden="true" />

      {/* Flyout Panel */}
      <aside
        className="notif-center-panel"
        role="dialog"
        aria-label="Salon Notification Center"
        aria-modal="true"
      >
        {/* Panel Header */}
        <div className="notif-header">
          <div className="notif-title-group">
            <div className="notif-title-row">
              <BellIcon size={18} className="notif-bell-icon" />
              <h2 className="notif-title">Notifications</h2>
              {unreadCount > 0 && (
                <span className="notif-unread-badge" aria-label={`${unreadCount} unread`}>
                  {unreadCount} new
                </span>
              )}
            </div>
            <span className="notif-tz-label">Timezone: Asia/Kolkata (IST)</span>
          </div>

          <div className="notif-actions-group">
            <button
              type="button"
              className={`notif-header-btn ${isPrefsOpen ? 'active' : ''}`}
              onClick={() => setIsPrefsOpen((p) => !p)}
              title="Notification Settings"
              aria-label="Notification Preferences"
            >
              <SettingsIcon size={17} />
            </button>
            <button
              type="button"
              className="notif-header-btn notif-close-btn"
              onClick={onClose}
              title="Close panel"
              aria-label="Close"
            >
              <CloseIcon size={18} />
            </button>
          </div>
        </div>

        {/* Preferences Drawer Inline */}
        {isPrefsOpen && (
          <div className="notif-prefs-drawer">
            <div className="prefs-header">
              <span className="prefs-title">Notification Preferences</span>
              <span className="prefs-subtitle">Mandatory operational policies are enforced</span>
            </div>

            <div className="prefs-list">
              <label className="pref-item">
                <span className="pref-label">Appointment & Booking Alerts</span>
                <input
                  type="checkbox"
                  checked={prefs.appointmentAlerts}
                  onChange={() => handleTogglePref('appointmentAlerts')}
                />
              </label>

              <label className="pref-item pref-locked">
                <div className="pref-label-group">
                  <span className="pref-label">Operational & Delay Alerts</span>
                  <span className="pref-mandatory-tag">Mandatory</span>
                </div>
                <input type="checkbox" checked={true} disabled />
              </label>

              <label className="pref-item">
                <span className="pref-label">Low Stock Inventory Alerts</span>
                <input
                  type="checkbox"
                  checked={prefs.inventoryAlerts}
                  onChange={() => handleTogglePref('inventoryAlerts')}
                />
              </label>

              <label className="pref-item pref-locked">
                <div className="pref-label-group">
                  <span className="pref-label">Financial & Settlement Alerts</span>
                  <span className="pref-mandatory-tag">Mandatory</span>
                </div>
                <input type="checkbox" checked={true} disabled />
              </label>

              <label className="pref-item">
                <span className="pref-label">Daily End-of-Day Email Digest</span>
                <input
                  type="checkbox"
                  checked={prefs.emailDigest}
                  onChange={() => handleTogglePref('emailDigest')}
                />
              </label>

              <label className="pref-item">
                <span className="pref-label">SMS Alerts for Critical Exceptions</span>
                <input
                  type="checkbox"
                  checked={prefs.smsCriticalOnly}
                  onChange={() => handleTogglePref('smsCriticalOnly')}
                />
              </label>
            </div>
          </div>
        )}

        {/* Filter Tabs */}
        <div className="notif-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`notif-tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'unread'}
            className={`notif-tab ${activeTab === 'unread' ? 'active' : ''}`}
            onClick={() => setActiveTab('unread')}
          >
            Unread ({unreadCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'appointment'}
            className={`notif-tab ${activeTab === 'appointment' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointment')}
          >
            Appointments
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'financial'}
            className={`notif-tab ${activeTab === 'financial' ? 'active' : ''}`}
            onClick={() => setActiveTab('financial')}
          >
            Finance
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'inventory'}
            className={`notif-tab ${activeTab === 'inventory' ? 'active' : ''}`}
            onClick={() => setActiveTab('inventory')}
          >
            Stock
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'dismissed'}
            className={`notif-tab ${activeTab === 'dismissed' ? 'active' : ''}`}
            onClick={() => setActiveTab('dismissed')}
          >
            Dismissed
          </button>
        </div>

        {/* Quick Action Sub-bar */}
        <div className="notif-subbar">
          <span className="notif-count-summary">{notifications.length} events logged</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className="notif-mark-all-btn"
              onClick={handleMarkAllAsRead}
            >
              <CheckCircleIcon size={14} />
              <span>Mark all as read</span>
            </button>
          )}
        </div>

        {/* Notification Cards Stream */}
        <div className="notif-list-container" tabIndex={0} aria-label="Notifications stream">
          {notifications.length === 0 ? (
            <div className="notif-empty-state">
              <div className="empty-icon-wrap">
                <BellIcon size={32} />
              </div>
              <h3 className="empty-title">All Caught Up!</h3>
              <p className="empty-desc">
                {activeTab === 'unread'
                  ? 'No unread notifications for your workspace.'
                  : 'There are no active alerts in this category.'}
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const isClickable = Boolean(n.actionUrl && onNavigate)
              return (
                <div
                  key={n.id}
                  className={`notif-card ${!n.isRead ? 'unread' : 'read'} notif-severity-${n.severity}`}
                  onClick={() => handleNotificationClick(n)}
                  role={isClickable ? 'button' : 'article'}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNotificationClick(n)
                    }
                  }}
                >
                  <div className="notif-card-header">
                    <div className="notif-badge-group">
                      <span className={`severity-tag severity-${n.severity}`}>
                        {n.severity.toUpperCase()}
                      </span>
                      <span className="category-tag">
                        {renderCategoryIcon(n.category)}
                        <span>{n.category}</span>
                      </span>
                      {n.targetRole !== 'ALL' && (
                        <span className="role-tag">{n.targetRole}</span>
                      )}
                    </div>
                    <span className="notif-timestamp">{formatKolkataTimestamp(n.createdAt)}</span>
                  </div>

                  <h4 className="notif-card-title">{n.title}</h4>
                  <p className="notif-card-message">{n.message}</p>

                  <div className="notif-card-footer">
                    <div className="delivery-status-pills">
                      <span className="delivery-pill in-app">In-App</span>
                      {n.deliveryChannels.email === 'mock_sent' && (
                        <span className="delivery-pill simulated">Email (Sandbox)</span>
                      )}
                      {n.deliveryChannels.sms === 'mock_sent' && (
                        <span className="delivery-pill simulated">SMS (Sandbox)</span>
                      )}
                    </div>

                    <div className="card-btn-group">
                      {!n.isRead && !n.isDismissed && (
                        <button
                          type="button"
                          className="item-read-btn"
                          onClick={(e) => handleMarkAsRead(n.id, e)}
                          title="Mark as read"
                        >
                          <CheckCircleIcon size={14} />
                        </button>
                      )}
                      {n.isDismissed ? (
                        <button
                          type="button"
                          className="item-restore-btn"
                          onClick={(e) => handleRestore(n.id, e)}
                          title="Restore notification"
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="item-dismiss-btn"
                          onClick={(e) => handleDismiss(n.id, e)}
                          title="Dismiss notification"
                        >
                          <CloseIcon size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {isClickable && (
                    <div className="notif-card-action-cue">
                      <span>View details</span>
                      <span>→</span>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>
    </>
  )
}
