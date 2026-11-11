import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { AppShell } from './layouts/AppShell'
import { AIAssistantView } from './features/assistant/AIAssistantView'
import { CalendarView } from './features/calendar/CalendarView'
import { ClientsView } from './features/clients/ClientsView'
import { StaffView } from './features/staff/StaffView'
import { ServicesView } from './features/services/ServicesView'
import { UserManagementView } from './features/users/UserManagementView'
import { ProductInventoryView } from './features/inventory/ProductInventoryView'
import { LoginView } from './features/auth/LoginView'
import { RootAdminPortalView } from './features/admin/RootAdminPortalView'
import { OwnerBusinessOverviewView } from './features/dashboards/owner/OwnerBusinessOverviewView'
import { OwnerLiveOperationsView } from './features/dashboards/owner/OwnerLiveOperationsView'
import { OwnerEmployeeDetailsView } from './features/dashboards/owner/OwnerEmployeeDetailsView'
import { OwnerOperationsManagementView } from './features/dashboards/owner/OwnerOperationsManagementView'
import { OwnerFinanceReportsView } from './features/dashboards/owner/OwnerFinanceReportsView'
import { OwnerFinancialIntelligenceView } from './features/dashboards/owner/OwnerFinancialIntelligenceView'
import { OwnerSettingsPermissionsView } from './features/dashboards/owner/OwnerSettingsPermissionsView'
import { EmployeeMyDayView } from './features/dashboards/employee/EmployeeMyDayView'
import { EmployeeAppointmentsView } from './features/dashboards/employee/EmployeeAppointmentsView'
import { EmployeeServiceWorkflowView } from './features/dashboards/employee/EmployeeServiceWorkflowView'
import { EmployeeAvailabilityView } from './features/dashboards/employee/EmployeeAvailabilityView'
import { EmployeeLeaveManagementView } from './features/dashboards/employee/EmployeeLeaveManagementView'
import { EmployeePerformanceView } from './features/dashboards/employee/EmployeePerformanceView'
import { ReceptionistFrontDeskView } from './features/dashboards/receptionist/ReceptionistFrontDeskView'
import { ReceptionistCalendarView } from './features/dashboards/receptionist/ReceptionistCalendarView'
import { ReceptionistBookingsView } from './features/dashboards/receptionist/ReceptionistBookingsView'
import { ReceptionistWalkInsView } from './features/dashboards/receptionist/ReceptionistWalkInsView'
import { ReceptionistCheckInOutView } from './features/dashboards/receptionist/ReceptionistCheckInOutView'
import { DashboardAccessDeniedState } from './features/dashboards/common/DashboardStateContainers'
import { BillingOverviewView } from './features/billing/BillingOverviewView'
import { NewBillView } from './features/billing/NewBillView'
import { InvoiceHistoryView } from './features/billing/InvoiceHistoryView'
import { PaymentsHistoryView } from './features/billing/PaymentsHistoryView'
import { CustomerLedgerView } from './features/billing/CustomerLedgerView'
import { RefundsCreditNotesView } from './features/billing/RefundsCreditNotesView'
import { QuotationsListView } from './features/billing/QuotationsListView'
import { PurchasesDashboardView } from './features/billing/purchases/PurchasesDashboardView'
import { PublicInvoiceView } from './features/billing/PublicInvoiceView'
import { PublicQuotationView } from './features/billing/PublicQuotationView'
import { BillingUpcomingPlaceholderView } from './features/billing/BillingUpcomingPlaceholderView'
import { salonService } from './services/salonService'
import { authService } from './services/authService'
import { permissionService } from './services/permissionService'
import { getLegacyNavItems, getDashboardSubmenuItems, getBillingSubmenuItems } from './config/navigationConfig'
import type { NavId, NavigationItem, OwnerProfile } from './types/salon'
import type { UserSession } from './types/models'
import './styles/App.css'

const VALID_ROUTES: NavId[] = [
  // Owner Workspace
  'owner/dashboard',
  'owner/live-operations',
  'owner/employees',
  'owner/operations',
  'owner/reports',
  'owner/financial-intelligence',
  'owner/settings',
  // Employee Workspace
  'employee/dashboard',
  'employee/appointments',
  'employee/service-workflow',
  'employee/availability',
  'employee/leave',
  'employee/performance',
  // Receptionist Workspace
  'receptionist/dashboard',
  'receptionist/calendar',
  'receptionist/bookings',
  'receptionist/walk-ins',
  'receptionist/check-in',
  // Billing Workspace
  'billing/overview',
  'billing/new',
  'billing/invoices',
  'billing/payments',
  'billing/ledger',
  'billing/estimates',
  'billing/purchases',
  'billing/refunds',
  'billing/reports',
  'billing/settings',
  // Legacy Modules (backward compatibility)
  'assistant',
  'calendar',
  'clients',
  'staff',
  'services',
  'users',
  'settings',
  'inventory',
]

function parseNavFromHash(hash: string): NavId | null {
  const clean = hash.replace(/^#\/?/, '').trim().toLowerCase()
  return VALID_ROUTES.includes(clean as NavId) ? (clean as NavId) : null
}

export default function App(): React.JSX.Element | null {
  const [session, setSession] = useState<UserSession | null>(() => authService.getCurrentSession())
  const [isInitializing, setIsInitializing] = useState(true)
  const [owner, setOwner] = useState<OwnerProfile | null>(null)
  const [isPublicInvoiceRoute, setIsPublicInvoiceRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash.includes('public/invoice')
    }
    return false
  })
  const [isPublicQuotationRoute, setIsPublicQuotationRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash.includes('public/quotation')
    }
    return false
  })
  const [activeNavId, setActiveNavId] = useState<NavId>(() => {
    if (typeof window !== 'undefined') {
      const parsed = parseNavFromHash(window.location.hash)
      if (parsed) return parsed
    }
    const current = authService.getCurrentSession()
    if (current && current.isAuthenticated) {
      return permissionService.getDefaultRouteForRole(current.role)
    }
    return 'owner/dashboard'
  })

  // Synchronize hash with active route
  const navigateTo = useCallback((navId: NavId) => {
    setActiveNavId(navId)
    if (typeof window !== 'undefined') {
      window.location.hash = `#/${navId}`
    }
  }, [])

  // Listen to authentication state and validate session
  useEffect(() => {
    let isMounted = true

    async function initialize() {
      await authService.initAuth()
      await authService.validateSession()
      const current = authService.getCurrentSession()
      if (isMounted) {
        setSession(current)
        setIsInitializing(false)
        if (current && current.isAuthenticated) {
          if (current.role === 'ADMIN') {
            if (typeof window !== 'undefined') {
              window.location.hash = '#/admin'
            }
          } else {
            const parsed = parseNavFromHash(window.location.hash)
            if (parsed && permissionService.canAccessRoute(parsed, current)) {
              setActiveNavId(parsed)
            } else {
              const defaultNav = permissionService.getDefaultRouteForRole(current.role)
              setActiveNavId(defaultNav)
              if (typeof window !== 'undefined') {
                window.location.hash = `#/${defaultNav}`
              }
            }
          }
        } else {
          if (typeof window !== 'undefined' && !window.location.hash.includes('login') && !window.location.hash.includes('public/invoice')) {
            window.history.replaceState(null, '', '#/login')
          }
        }
      }
    }

    void initialize()

    salonService.getOwnerProfile().then((profile) => {
      if (isMounted) setOwner(profile)
    })

    const unsubAuth = authService.subscribe((newSession) => {
      if (!isMounted) return
      setSession(newSession)

      if (!newSession || !newSession.isAuthenticated) {
        // Enforce route protection & history replacement on logout
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', '#/login')
        }
      } else if (newSession.role === 'ADMIN') {
        if (typeof window !== 'undefined') {
          window.location.hash = '#/admin'
        }
      } else {
        // Ensure active nav is permitted for newly logged-in role
        if (!permissionService.canAccessRoute(activeNavId, newSession)) {
          const defaultNav = permissionService.getDefaultRouteForRole(newSession.role)
          navigateTo(defaultNav)
        } else if (typeof window !== 'undefined' && (window.location.hash.includes('login') || window.location.hash.includes('admin'))) {
          const defaultNav = permissionService.getDefaultRouteForRole(newSession.role)
          navigateTo(defaultNav)
        }
      }
    })

    // Handle browser hash navigation & back/forward buttons
    const handleHashChange = () => {
      if (!isMounted) return

      if (typeof window !== 'undefined') {
        const isPublicInv = window.location.hash.includes('public/invoice')
        const isPublicQuote = window.location.hash.includes('public/quotation')
        setIsPublicInvoiceRoute(isPublicInv)
        setIsPublicQuotationRoute(isPublicQuote)
        if (isPublicInv || isPublicQuote) return
      }

      const currentSession = authService.getCurrentSession()
      if (!currentSession || !currentSession.isAuthenticated) {
        if (window.location.hash !== '#/login') {
          window.history.replaceState(null, '', '#/login')
        }
        return
      }

      if (currentSession.role === 'ADMIN') {
        if (window.location.hash !== '#/admin') {
          window.location.hash = '#/admin'
        }
        return
      }

      const targetNav = parseNavFromHash(window.location.hash)
      if (targetNav) {
        if (permissionService.canAccessRoute(targetNav, currentSession)) {
          setActiveNavId(targetNav)
        } else {
          // Access denied by route guard -> bounce back to role's default dashboard
          console.warn(`Access denied for route #${targetNav} with role ${currentSession.role}`)
          const fallbackNav = permissionService.getDefaultRouteForRole(currentSession.role)
          navigateTo(fallbackNav)
        }
      } else if (window.location.hash.includes('login') || window.location.hash.includes('admin')) {
        const fallbackNav = permissionService.getDefaultRouteForRole(currentSession.role)
        navigateTo(fallbackNav)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', handleHashChange)
    }

    return () => {
      isMounted = false
      unsubAuth()
      if (typeof window !== 'undefined') {
        window.removeEventListener('hashchange', handleHashChange)
      }
    }
  }, [activeNavId, navigateTo])

  // Derive role-specific legacy application navigation items (100% preserved)
  const navItems = useMemo<NavigationItem[]>(() => {
    if (!session || !session.isAuthenticated) return []
    return getLegacyNavItems(session.role)
  }, [session])

  // Derive role-specific dashboard submenu items (under new expandable Dashboards menu)
  const dashboardItems = useMemo<NavigationItem[]>(() => {
    if (!session || !session.isAuthenticated) return []
    return getDashboardSubmenuItems(session.role)
  }, [session])

  // Derive role-specific billing submenu items
  const billingItems = useMemo<NavigationItem[]>(() => {
    if (!session || !session.isAuthenticated) return []
    return getBillingSubmenuItems(session.role)
  }, [session])

  // Public Customer Invoice View (Bypasses login & app shell)
  if (isPublicInvoiceRoute) {
    return <PublicInvoiceView />
  }

  // Public Customer Quotation View (Bypasses login & app shell)
  if (isPublicQuotationRoute) {
    return <PublicQuotationView />
  }

  // Splash loader to prevent page flashing before auth resolution completes
  if (isInitializing) {
    return (
      <div className="luma-login-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="login-ambient-orb orb-1" aria-hidden="true" />
        <div className="login-ambient-orb orb-2" aria-hidden="true" />
        <div style={{ textAlign: 'center', zIndex: 10 }}>
          <div className="login-brand" style={{ fontSize: '2rem', marginBottom: '1.5rem' }}>
            <span className="brand-luma">Hair</span>
            <span className="brand-salon">Dexirity</span>
          </div>
          <div className="btn-spinner" style={{ width: '32px', height: '32px', margin: '0 auto', borderColor: 'rgba(197, 160, 89, 0.2)', borderTopColor: '#c5a059' }} />
        </div>
      </div>
    )
  }

  // If unauthenticated, present dedicated login portal
  if (!session || !session.isAuthenticated) {
    return (
      <LoginView
        onLoginSuccess={(newSession) => {
          if (newSession.role === 'ADMIN') {
            if (typeof window !== 'undefined') {
              window.location.hash = '#/admin'
            }
          } else {
            const defaultNav = permissionService.getDefaultRouteForRole(newSession.role)
            navigateTo(defaultNav)
          }
        }}
      />
    )
  }

  // Root Administrator (Platform Super-Admin)
  if (session.role === 'ADMIN') {
    return (
      <RootAdminPortalView
        session={session}
        onLogout={async () => {
          await authService.logout()
          setSession(null)
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', '#/login')
          }
        }}
      />
    )
  }

  if (!owner) {
    return null
  }

  // Enforce route permission before rendering view
  const isAuthorizedForActiveRoute = permissionService.canAccessRoute(activeNavId, session)

  return (
    <AppShell
      owner={owner}
      navItems={navItems}
      dashboardItems={dashboardItems}
      billingItems={billingItems}
      activeNavId={activeNavId}
      onSelectNav={navigateTo}
    >
      {!isAuthorizedForActiveRoute ? (
        <DashboardAccessDeniedState
          userRole={session.role}
          attemptedRoute={activeNavId}
          onReturnToDashboard={() => navigateTo(permissionService.getDefaultRouteForRole(session.role))}
        />
      ) : activeNavId === 'owner/dashboard' ? (
        <OwnerBusinessOverviewView ownerName={session.name || owner.ownerName} onNavigate={navigateTo} />
      ) : activeNavId === 'owner/live-operations' ? (
        <OwnerLiveOperationsView onNavigate={navigateTo} />
      ) : activeNavId === 'owner/employees' ? (
        <OwnerEmployeeDetailsView onNavigate={navigateTo} />
      ) : activeNavId === 'owner/operations' ? (
        <OwnerOperationsManagementView onNavigate={navigateTo} />
      ) : activeNavId === 'owner/reports' ? (
        <OwnerFinanceReportsView onNavigate={navigateTo} />
      ) : activeNavId === 'owner/financial-intelligence' ? (
        <OwnerFinancialIntelligenceView onNavigate={navigateTo} />
      ) : activeNavId === 'owner/settings' ? (
        <OwnerSettingsPermissionsView onNavigate={navigateTo} />
      ) : activeNavId === 'employee/dashboard' ? (
        <EmployeeMyDayView employeeName={session.name} specialty={session.specialty} onNavigate={navigateTo} />
      ) : activeNavId === 'employee/appointments' ? (
        <EmployeeAppointmentsView onNavigate={navigateTo} />
      ) : activeNavId === 'employee/service-workflow' ? (
        <EmployeeServiceWorkflowView onNavigate={navigateTo} />
      ) : activeNavId === 'employee/availability' ? (
        <EmployeeAvailabilityView onNavigate={navigateTo} />
      ) : activeNavId === 'employee/leave' ? (
        <EmployeeLeaveManagementView onNavigate={navigateTo} />
      ) : activeNavId === 'employee/performance' ? (
        <EmployeePerformanceView onNavigate={navigateTo} />
      ) : activeNavId === 'receptionist/dashboard' ? (
        <ReceptionistFrontDeskView receptionistName={session.name} onNavigate={navigateTo} />
      ) : activeNavId === 'receptionist/calendar' ? (
        <ReceptionistCalendarView onNavigate={navigateTo} />
      ) : activeNavId === 'receptionist/bookings' ? (
        <ReceptionistBookingsView onNavigate={navigateTo} />
      ) : activeNavId === 'receptionist/walk-ins' ? (
        <ReceptionistWalkInsView onNavigate={navigateTo} />
      ) : activeNavId === 'receptionist/check-in' ? (
        <ReceptionistCheckInOutView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/overview' ? (
        <BillingOverviewView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/new' ? (
        <NewBillView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/invoices' ? (
        <InvoiceHistoryView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/payments' ? (
        <PaymentsHistoryView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/ledger' ? (
        <CustomerLedgerView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/refunds' ? (
        <RefundsCreditNotesView onNavigate={navigateTo} />
      ) : activeNavId === 'billing/estimates' ? (
        <QuotationsListView onNavigate={navigateTo} />
      ) : activeNavId.startsWith('billing/purchases') ? (
        <PurchasesDashboardView onNavigate={navigateTo} />
      ) : activeNavId.startsWith('billing/') ? (
        <BillingUpcomingPlaceholderView targetRoute={activeNavId} onNavigate={navigateTo} />
      ) : activeNavId === 'assistant' && permissionService.canAccessAIAssistant(session) ? (
        <AIAssistantView ownerName={session.name || owner.ownerName} />
      ) : activeNavId === 'calendar' ? (
        <CalendarView />
      ) : activeNavId === 'clients' ? (
        <ClientsView />
      ) : activeNavId === 'staff' ? (
        <StaffView />
      ) : activeNavId === 'services' ? (
        <ServicesView />
      ) : activeNavId === 'users' ? (
        <UserManagementView />
      ) : activeNavId === 'inventory' ? (
        <ProductInventoryView />
      ) : (
        <DashboardAccessDeniedState
          userRole={session.role}
          attemptedRoute={activeNavId}
          onReturnToDashboard={() => navigateTo(permissionService.getDefaultRouteForRole(session.role))}
        />
      )}
    </AppShell>
  )
}
