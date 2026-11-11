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
    e.stopPropagation()
    if (!isOpen && onToggleOpen) {
      onToggleOpen()
      setIsDashboardsExpanded(true)
      setIsBillingExpanded(true)
    } else {
      setIsBillingExpanded((prev) => !prev)
    }
  }

  const isParentActive = isDashboardRoute(activeId)
  const isBillingActive = isBillingRoute(activeId)

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
                1. EXPANDABLE "DASHBOARDS" MENU (Parent + Submenu)
                ========================================================= */}
            {dashboardItems.length > 0 && (
              <li className="nav-item nav-group">
                <button
                  type="button"
                  className={`nav-btn nav-group-parent ${isParentActive ? 'active' : ''}`}
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
                  {isParentActive && !isDashboardsExpanded && (
                    <span className="parent-active-dot" aria-hidden="true" />
                  )}
                </button>

                {/* Role-Specific Dashboard Submenu */}
                {isDashboardsExpanded && (
                  <ul className="dashboards-submenu-list" id="dashboards-submenu" role="menu">
                    {dashboardItems.map((sub) => {
                      const isSubActive = sub.id === activeId
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

                    {/* =========================================================
                        BILLING SUB-ACCORDION (Under Dashboards)
                        ========================================================= */}
                    {billingItems.length > 0 && (
                      <li className="submenu-item billing-group-item" role="none">
                        <button
                          type="button"
                          className={`submenu-btn billing-group-btn ${isBillingActive ? 'active' : ''}`}
                          onClick={handleToggleBilling}
                          aria-expanded={isBillingExpanded}
                          aria-controls="billing-sub-menu"
                          aria-label="Billing menu"
                          title="Billing"
                        >
                          <span className="submenu-icon-wrap">
                            <TagIcon size={18} />
                          </span>
                          <span className="submenu-label">Billing</span>
                          <span className="billing-chevron-icon" aria-hidden="true">
                            {isBillingExpanded ? (
                              <ChevronDownIcon size={14} />
                            ) : (
                              <ChevronRightIcon size={14} />
                            )}
                          </span>
                          {isBillingActive && !isBillingExpanded && (
                            <span className="billing-active-dot" aria-hidden="true" />
                          )}
                        </button>

                        {/* Nested Billing 9 Items */}
                        {isBillingExpanded && (
                          <ul className="billing-submenu-list" id="billing-sub-menu" role="menu">
                            {billingItems.map((bItem) => {
                              const isItemActive = bItem.id === activeId
                              const isUpcoming = Boolean(bItem.badge)
                              return (
                                <li key={bItem.id} className="billing-sub-item" role="none">
                                  <button
                                    type="button"
                                    className={`billing-sub-btn ${isItemActive ? 'active' : ''} ${isUpcoming ? 'is-upcoming' : ''}`}
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
                                    <span className="billing-sub-icon-wrap">
                                      {renderIcon(bItem.icon)}
                                    </span>
                                    <span className="billing-sub-label">{bItem.label}</span>
                                    {bItem.badge && (
                                      <span className="upcoming-pill">{bItem.badge}</span>
                                    )}
                                  </button>
                                </li>
                              )
                            })}

                            {/* Phase 6: Purchases & Supplier Management */}
                            <li key="billing/purchases" className="billing-sub-item" role="none">
                              <button
                                type="button"
                                className={`billing-sub-btn ${activeId.startsWith('billing/purchases') ? 'active' : ''}`}
                                onClick={() => {
                                  onSelect('billing/purchases')
                                  if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                                    onClose()
                                  }
                                }}
                                role="menuitem"
                                aria-label="Purchases & Suppliers"
                                aria-current={activeId.startsWith('billing/purchases') ? 'page' : undefined}
                                title="Purchases & Suppliers"
                              >
                                <span className="billing-sub-icon-wrap">
                                  <PackageIcon size={16} />
                                </span>
                                <span className="billing-sub-label">Purchases & Suppliers</span>
                              </button>
                            </li>
                          </ul>
                        )}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            )}

            {/* SECTION DIVIDER BETWEEN DASHBOARDS AND APPLICATIONS */}
            {dashboardItems.length > 0 && items.length > 0 && (
              <li className="sidebar-section-divider" aria-hidden="true">
                <div className="sidebar-divider-line" />
                <span className="sidebar-divider-label">Applications</span>
              </li>
            )}

            {/* =========================================================
                2. PRESERVED EXISTING APPLICATION MENUS (100% Intact)
                ========================================================= */}
            {items.map((item) => {
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
