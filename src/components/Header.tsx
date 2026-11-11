import React, { useState, useEffect } from 'react'
import { HamburgerIcon, BellIcon, ChevronRightIcon } from './Icons'
import type { NavId, NavigationItem, OwnerProfile } from '../types/salon'
import type { UserSession } from '../types/models'
import { authService } from '../services/authService'
import { notificationService } from '../services/notificationService'
import { NotificationCenter } from './NotificationCenter'
import './Header.css'

interface HeaderProps {
  owner: OwnerProfile
  onToggleSidebar: () => void
  isSidebarOpen?: boolean
  activeNavId?: NavId
  navItems?: NavigationItem[]
  onSelectNav?: (id: NavId) => void
}

function getBreadcrumbs(
  navId?: NavId,
  items?: NavigationItem[],
  role?: string
): { workspace: string; page: string } {
  if (!navId) return { workspace: 'Salon', page: 'Overview' }
  const activeItem = items?.find((i) => i.id === navId)
  const page =
    activeItem?.label ||
    navId
      .split('/')
      .pop()
      ?.replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase()) ||
    'Overview'

  if (navId.startsWith('owner/')) {
    return { workspace: 'Owner Workspace', page }
  }
  if (navId.startsWith('employee/')) {
    return { workspace: 'Stylist Workspace', page }
  }
  if (navId.startsWith('receptionist/')) {
    return { workspace: 'Front Desk', page }
  }
  if (role === 'OWNER') return { workspace: 'Salon Operations', page }
  if (role === 'EMPLOYEE') return { workspace: 'Personal Workspace', page }
  if (role === 'RECEPTIONIST') return { workspace: 'Front Desk Ops', page }
  return { workspace: 'Hair Dexirity', page }
}

export const Header: React.FC<HeaderProps> = ({
  onToggleSidebar,
  isSidebarOpen = false,
  activeNavId,
  navItems,
  onSelectNav,
}) => {
  const [session, setSession] = useState<UserSession | null>(() => authService.getCurrentSession())
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState<number>(() => notificationService.getUnreadCount())

  useEffect(() => {
    const unsubAuth = authService.subscribe((s) => setSession(s))
    const unsubNotif = notificationService.subscribe(() => {
      setUnreadCount(notificationService.getUnreadCount())
    })
    return () => {
      unsubAuth()
      unsubNotif()
    }
  }, [])

  const handleLogout = () => {
    setIsMenuOpen(false)
    authService.logout()
  }

  const breadcrumbs = getBreadcrumbs(activeNavId, navItems, session?.role)

  return (
    <header className="luma-header" role="banner">
      <div className="header-left">
        <button
          type="button"
          className={`menu-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={isSidebarOpen}
        >
          <HamburgerIcon size={20} />
        </button>

        <div className="brand-logo" tabIndex={0} aria-label="Hair Dexirity Home">
          <span className="brand-luma">Hair</span>
          <span className="brand-salon">Dexirity</span>
        </div>

        {/* Dashboard Breadcrumbs */}
        <nav className="header-breadcrumbs" aria-label="Breadcrumb navigation">
          <span className="breadcrumb-workspace">{breadcrumbs.workspace}</span>
          <ChevronRightIcon size={14} className="breadcrumb-separator" />
          <span className="breadcrumb-current" aria-current="page">
            {breadcrumbs.page}
          </span>
        </nav>
      </div>

      <div className="header-right">
        {/* Notification Entry Point */}
        <div className="notification-entry-widget">
          <button
            type="button"
            className={`notification-btn ${isNotificationOpen ? 'active' : ''}`}
            onClick={() => setIsNotificationOpen((prev) => !prev)}
            aria-label={`View system notifications (${unreadCount} unread)`}
            aria-expanded={isNotificationOpen}
            title="Notifications"
          >
            <BellIcon size={19} />
            {unreadCount > 0 && (
              <span className="notification-indicator-dot" aria-hidden="true">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationCenter
            isOpen={isNotificationOpen}
            onClose={() => setIsNotificationOpen(false)}
            onNavigate={onSelectNav}
          />
        </div>

        {session ? (
          <div className="user-profile-widget">
            <button
              type="button"
              className="user-profile-btn"
              onClick={() => setIsMenuOpen((prev) => !prev)}
              aria-label="User account menu"
              aria-expanded={isMenuOpen}
            >
              <div className="user-text-details">
                <span className="user-name-label">{session.name}</span>
                <div className="user-badges-row">
                  <span className={`user-role-badge role-${session.role.toLowerCase()}`}>
                    {session.role === 'ADMIN'
                      ? '🛡️ Root Admin'
                      : session.ownerDesignation
                      ? `${session.role} • ${session.ownerDesignation}`
                      : session.role === 'EMPLOYEE'
                      ? 'Stylist'
                      : session.role}
                  </span>
                  {session.specialty && (
                    <span className="user-spec-badge">{session.specialty}</span>
                  )}
                </div>
              </div>

              <div className="avatar-container">
                {session.avatarUrl ? (
                  <img
                    src={session.avatarUrl}
                    alt={session.name}
                    className="avatar-img"
                  />
                ) : (
                  <div className="avatar-initials">
                    {session.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="online-dot" aria-hidden="true" />
              </div>
            </button>

            {isMenuOpen && (
              <>
                <div
                  className="dropdown-backdrop"
                  onClick={() => setIsMenuOpen(false)}
                  aria-hidden="true"
                />
                <div className="user-dropdown-menu" role="menu">
                  <div className="dropdown-header">
                    <span className="dropdown-user-name">{session.name}</span>
                    <span className="dropdown-user-email">{session.email}</span>
                    <div className="dropdown-meta-row">
                      <span className={`user-role-badge role-${session.role.toLowerCase()}`}>
                        {session.role === 'ADMIN'
                          ? '🛡️ Root Admin'
                          : session.ownerDesignation
                          ? `${session.role} • ${session.ownerDesignation}`
                          : session.role}
                      </span>
                      {session.specialty && (
                        <span className="user-spec-badge">{session.specialty}</span>
                      )}
                    </div>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-session-info">
                    <span className="session-status-dot" aria-hidden="true" />
                    <span>Active Session (Isolated)</span>
                  </div>

                  <div className="dropdown-divider" />

                  <button
                    type="button"
                    className="dropdown-logout-btn"
                    onClick={handleLogout}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Log Out</span>
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}
