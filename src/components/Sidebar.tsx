import React, { useState, useEffect } from 'react'
import {
  SparkleIcon,
  CalendarIcon,
  UsersIcon,
  StaffIcon,
  ScissorsIcon,
  SettingsIcon,
  PackageIcon,
  CloseIcon,
  DashboardIcon,
  ActivityIcon,
  SlidersIcon,
  TrendingUpIcon,
  ShieldCheckIcon,
  SunIcon,
  CoffeeIcon,
  AwardIcon,
  CalendarPlusIcon,
  UserCheckIcon,
  ClipboardListIcon,
  FileTextIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  TagIcon,
  RefreshCwIcon,
} from './Icons'
import type { NavId, NavigationItem } from '../types/salon'
import { isDashboardRoute, isBillingRoute } from '../config/navigationConfig'
import './Sidebar.css'

interface SidebarProps {
  items: NavigationItem[]
  dashboardItems?: NavigationItem[]
  billingItems?: NavigationItem[]
  activeId: NavId
  onSelect: (id: NavId) => void
  isOpen: boolean
  onClose: () => void
  onToggleOpen?: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  items,
  dashboardItems = [],
  billingItems = [],
  activeId,
  onSelect,
  isOpen,
  onClose,
  onToggleOpen,
}) => {
  const [isDashboardsExpanded, setIsDashboardsExpanded] = useState<boolean>(() => {
    return isDashboardRoute(activeId)
  })

  const [isBillingExpanded, setIsBillingExpanded] = useState<boolean>(() => {
    return isBillingRoute(activeId)
  })

  // Automatically expand parents when a child route is active
  useEffect(() => {
    if (isDashboardRoute(activeId)) {
      setIsDashboardsExpanded(true)
    }
    if (isBillingRoute(activeId)) {
      setIsBillingExpanded(true)
    }
  }, [activeId])

  const handleToggleDashboards = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!isOpen && onToggleOpen) {
      onToggleOpen()
      setIsDashboardsExpanded(true)
    } else {
      setIsDashboardsExpanded((prev) => !prev)
    }
  }

  const handleToggleBilling = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!isOpen && onToggleOpen) {
      onToggleOpen()
      setIsBillingExpanded(true)
    } else {
      setIsBillingExpanded((prev) => !prev)
    }
  }

  const isDashboardActive = isDashboardRoute(activeId)
  const isBillingActive = isBillingRoute(activeId)

  const assistantItem = items.find((i) => i.id === 'assistant')
  const otherNavItems = items.filter((i) => i.id !== 'assistant')

  const renderIcon = (iconName: NavigationItem['icon']) => {
    switch (iconName) {
      case 'sparkle':
        return <SparkleIcon size={20} />
      case 'calendar':
        return <CalendarIcon size={19} />
      case 'users':
        return <UsersIcon size={19} />
      case 'staff':
        return <StaffIcon size={19} />
      case 'scissors':
        return <ScissorsIcon size={19} />
      case 'settings':
        return <SettingsIcon size={19} />
      case 'inventory':
        return <PackageIcon size={19} />
      case 'dashboard':
        return <DashboardIcon size={19} />
      case 'activity':
        return <ActivityIcon size={19} />
      case 'sliders':
        return <SlidersIcon size={19} />
      case 'trending-up':
        return <TrendingUpIcon size={19} />
      case 'shield-check':
        return <ShieldCheckIcon size={19} />
      case 'sun':
        return <SunIcon size={19} />
      case 'coffee':
        return <CoffeeIcon size={19} />
      case 'award':
        return <AwardIcon size={19} />
      case 'calendar-plus':
        return <CalendarPlusIcon size={19} />
      case 'user-check':
        return <UserCheckIcon size={19} />
      case 'clipboard-list':
        return <ClipboardListIcon size={19} />
      case 'file-text':
        return <FileTextIcon size={19} />
      case 'refresh-cw':
        return <RefreshCwIcon size={19} />
      default:
        return <DashboardIcon size={19} />
    }
  }

  return (
    <>
      {/* Mobile backdrop overlay */}
      {isOpen && (
        <div
          className="sidebar-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`luma-sidebar ${isOpen ? 'open' : ''}`}
        aria-label="Sidebar Navigation"
      >
        {/* Mobile close button header */}
        <div className="sidebar-mobile-header">
          <span className="sidebar-mobile-title">Navigation</span>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close navigation sidebar"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" role="navigation">
          <ul className="nav-list">
            {/* =========================================================
                1. AI ASSISTANT (Top Navigation Item)
                ========================================================= */}
            {assistantItem && (
              <li key={assistantItem.id} className="nav-item">
                <button
                  type="button"
                  className={`nav-btn ${activeId === assistantItem.id ? 'active' : ''}`}
                  onClick={() => {
                    onSelect(assistantItem.id)
                    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                      onClose()
                    }
                  }}
                  aria-label={assistantItem.label}
                  aria-current={activeId === assistantItem.id ? 'page' : undefined}
                  title={assistantItem.label}
                >
                  <span className="nav-icon-wrap">
                    {renderIcon(assistantItem.icon)}
                  </span>
                  <span className="nav-label nav-label-mobile">{assistantItem.label}</span>
                </button>
              </li>
            )}

            {/* =========================================================
                2. EXPANDABLE "DASHBOARDS" MENU (Parent + Submenu)
                ========================================================= */}
            {dashboardItems.length > 0 && (
              <li className="nav-item nav-group">
                <button
                  type="button"
                  className={`nav-btn nav-group-parent ${isDashboardActive ? 'active' : ''}`}
                  onClick={handleToggleDashboards}
                  aria-expanded={isDashboardsExpanded}
                  aria-controls="dashboards-submenu"
                  aria-label="Dashboards menu"
                  title="Dashboards"
                >
                  <span className="parent-left">
                    <span className="nav-icon-wrap">
                      <DashboardIcon size={21} />
                    </span>
                    <span className="nav-label nav-label-mobile">Dashboards</span>
                  </span>
                  <span className="nav-chevron-icon" aria-hidden="true">
                    {isDashboardsExpanded ? (
                      <ChevronDownIcon size={16} />
                    ) : (
                      <ChevronRightIcon size={16} />
                    )}
                  </span>
                  {isDashboardActive && !isDashboardsExpanded && (
                    <span className="parent-active-dot" aria-hidden="true" />
                  )}
                </button>

                {/* Role-Specific Dashboard Submenu */}
                {isDashboardsExpanded && (
                  <ul className="dashboards-submenu-list" id="dashboards-submenu" role="menu">
                    {dashboardItems.map((sub) => {
                      const isSubActive = sub.id === activeId || activeId.startsWith(sub.id + '/')
                      return (
                        <li key={sub.id} className="submenu-item" role="none">
                          <button
                            type="button"
                            className={`submenu-btn ${isSubActive ? 'active' : ''}`}
                            onClick={() => {
                              onSelect(sub.id)
                              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                                onClose()
                              }
                            }}
                            role="menuitem"
                            aria-label={sub.label}
                            aria-current={isSubActive ? 'page' : undefined}
                            title={sub.label}
                          >
                            <span className="submenu-icon-wrap">
                              {renderIcon(sub.icon)}
                            </span>
                            <span className="submenu-label">{sub.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )}

            {/* =========================================================
                3. EXPANDABLE "BILLING" MENU (Parent + Submenu)
                ========================================================= */}
            {billingItems.length > 0 && (
              <li className="nav-item nav-group">
                <button
                  type="button"
                  className={`nav-btn nav-group-parent ${isBillingActive ? 'active' : ''}`}
                  onClick={handleToggleBilling}
                  aria-expanded={isBillingExpanded}
                  aria-controls="billing-submenu"
                  aria-label="Billing menu"
                  title="Billing"
                >
                  <span className="parent-left">
                    <span className="nav-icon-wrap">
                      <TagIcon size={21} />
                    </span>
                    <span className="nav-label nav-label-mobile">Billing</span>
                  </span>
                  <span className="nav-chevron-icon" aria-hidden="true">
                    {isBillingExpanded ? (
                      <ChevronDownIcon size={16} />
                    ) : (
                      <ChevronRightIcon size={16} />
                    )}
                  </span>
                  {isBillingActive && !isBillingExpanded && (
                    <span className="parent-active-dot" aria-hidden="true" />
                  )}
                </button>

                {/* Billing Submenu List */}
                {isBillingExpanded && (
                  <ul className="dashboards-submenu-list" id="billing-submenu" role="menu">
                    {billingItems.map((bItem) => {
                      const isItemActive = bItem.id === activeId || activeId.startsWith(bItem.id + '/')
                      const isUpcoming = Boolean(bItem.badge)
                      return (
                        <li key={bItem.id} className="submenu-item" role="none">
                          <button
                            type="button"
                            className={`submenu-btn ${isItemActive ? 'active' : ''} ${isUpcoming ? 'is-upcoming' : ''}`}
                            onClick={() => {
                              onSelect(bItem.id)
                              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                                onClose()
                              }
                            }}
                            role="menuitem"
                            aria-label={bItem.label}
                            aria-current={isItemActive ? 'page' : undefined}
                            title={isUpcoming ? `${bItem.label} (Upcoming Phase)` : bItem.label}
                          >
                            <span className="submenu-icon-wrap">
                              {renderIcon(bItem.icon)}
                            </span>
                            <span className="submenu-label">{bItem.label}</span>
                            {bItem.badge && (
                              <span className="upcoming-pill">{bItem.badge}</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )}

            {/* =========================================================
                4. APPLICATION MENUS (Calendar, Clients, Staff, Services,
                   Product Inventory, User Management, Settings)
                ========================================================= */}
            {otherNavItems.map((item) => {
              const isActive = item.id === activeId

              return (
                <li key={item.id} className="nav-item">
                  <button
                    type="button"
                    className={`nav-btn ${isActive ? 'active' : ''}`}
                    onClick={() => {
                      onSelect(item.id)
                      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                        onClose()
                      }
                    }}
                    aria-label={item.label}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                  >
                    <span className="nav-icon-wrap">
                      {renderIcon(item.icon)}
                    </span>
                    <span className="nav-label nav-label-mobile">{item.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>
      </aside>
    </>
  )
}
