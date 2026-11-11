import React, { useState, useMemo } from 'react'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  SparkleIcon,
  CalendarIcon,
  UsersIcon,
  StaffIcon,
  ScissorsIcon,
  SettingsIcon,
  PackageIcon,
  HamburgerIcon,
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
} from '../components/Icons'
import type { NavId, NavigationItem, OwnerProfile } from '../types/salon'
import { isDashboardRoute } from '../config/navigationConfig'
import './AppShell.css'

interface AppShellProps {
  owner: OwnerProfile
  navItems: NavigationItem[]
  dashboardItems?: NavigationItem[]
  billingItems?: NavigationItem[]
  children: React.ReactNode
  activeNavId: NavId
  onSelectNav: (id: NavId) => void
}

export const AppShell: React.FC<AppShellProps> = ({
  owner,
  navItems,
  dashboardItems = [],
  billingItems = [],
  children,
  activeNavId,
  onSelectNav,
}) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const toggleSidebar = () => {
    setIsSidebarOpen((prev) => !prev)
  }

  const closeSidebar = () => {
    setIsSidebarOpen(false)
  }

  const renderNavIcon = (iconName: NavigationItem['icon']) => {
    switch (iconName) {
      case 'sparkle':
        return <SparkleIcon size={20} />
      case 'calendar':
        return <CalendarIcon size={20} />
      case 'users':
        return <UsersIcon size={20} />
      case 'staff':
        return <StaffIcon size={20} />
      case 'scissors':
        return <ScissorsIcon size={20} />
      case 'settings':
        return <SettingsIcon size={20} />
      case 'inventory':
        return <PackageIcon size={20} />
      case 'dashboard':
        return <DashboardIcon size={20} />
      case 'activity':
        return <ActivityIcon size={20} />
      case 'sliders':
        return <SlidersIcon size={20} />
      case 'trending-up':
        return <TrendingUpIcon size={20} />
      case 'shield-check':
        return <ShieldCheckIcon size={20} />
      case 'sun':
        return <SunIcon size={20} />
      case 'coffee':
        return <CoffeeIcon size={20} />
      case 'award':
        return <AwardIcon size={20} />
      case 'calendar-plus':
        return <CalendarPlusIcon size={20} />
      case 'user-check':
        return <UserCheckIcon size={20} />
      case 'clipboard-list':
        return <ClipboardListIcon size={20} />
      case 'file-text':
        return <FileTextIcon size={20} />
      default:
        return <DashboardIcon size={20} />
    }
  }

  // Combine items for header breadcrumbs
  const allNavItems = useMemo(() => {
    return [...dashboardItems, ...billingItems, ...navItems]
  }, [dashboardItems, billingItems, navItems])

  // Derive primary bottom navigation items for mobile
  const isDashboardActive = isDashboardRoute(activeNavId)
  const primaryExistingCount = dashboardItems.length > 0 ? 3 : 4
  const primaryExistingItems = navItems.slice(0, primaryExistingCount)

  return (
    <div className="luma-app-shell">
      {/* Subtle ambient lighting mesh */}
      <div className="app-ambient-glow" aria-hidden="true" />

      {/* Top Header with Breadcrumbs & Notification Entry Point */}
      <Header
        owner={owner}
        onToggleSidebar={toggleSidebar}
        isSidebarOpen={isSidebarOpen}
        activeNavId={activeNavId}
        navItems={allNavItems}
        onSelectNav={onSelectNav}
      />

      <div className="shell-body">
        {/* Left Vertical Navigation / Mobile Drawer */}
        <Sidebar
          items={navItems}
          dashboardItems={dashboardItems}
          billingItems={billingItems}
          activeId={activeNavId}
          onSelect={(id) => {
            onSelectNav(id)
            if (typeof window !== 'undefined' && window.innerWidth <= 768) {
              closeSidebar()
            }
          }}
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
          onToggleOpen={toggleSidebar}
        />

        {/* Main Content Area */}
        <main className="shell-main" role="main">
          {children}
        </main>
      </div>

      {/* Modern Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Bottom Navigation">
        {/* Mobile Dashboards Pill */}
        {dashboardItems.length > 0 && (
          <button
            type="button"
            className={`bottom-nav-btn ${isDashboardActive ? 'active' : ''}`}
            onClick={() => {
              if (isDashboardActive) {
                toggleSidebar()
              } else {
                onSelectNav(dashboardItems[0].id)
                closeSidebar()
              }
            }}
            aria-label="Dashboards"
            aria-current={isDashboardActive ? 'page' : undefined}
          >
            <span className="bottom-nav-icon">
              <DashboardIcon size={20} />
            </span>
            <span className="bottom-nav-label">Dash</span>
            {isDashboardActive && <span className="bottom-nav-indicator" aria-hidden="true" />}
          </button>
        )}

        {/* Primary Existing Application Navigation */}
        {primaryExistingItems.map((item) => {
          const isActive = item.id === activeNavId
          return (
            <button
              key={item.id}
              type="button"
              className={`bottom-nav-btn ${isActive ? 'active' : ''}`}
              onClick={() => {
                onSelectNav(item.id)
                closeSidebar()
              }}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className="bottom-nav-icon">{renderNavIcon(item.icon)}</span>
              <span className="bottom-nav-label">
                {item.id === 'assistant'
                  ? 'AI'
                  : item.id === 'inventory'
                  ? 'Stock'
                  : item.label.split(' ')[0]}
              </span>
              {isActive && <span className="bottom-nav-indicator" aria-hidden="true" />}
            </button>
          )
        })}

        {/* Mobile More Button (Opens full drawer with all menus) */}
        <button
          type="button"
          className={`bottom-nav-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={toggleSidebar}
          aria-label="More navigation options"
          aria-expanded={isSidebarOpen}
        >
          <span className="bottom-nav-icon">
            <HamburgerIcon size={20} />
          </span>
          <span className="bottom-nav-label">More</span>
        </button>
      </nav>
    </div>
  )
}
