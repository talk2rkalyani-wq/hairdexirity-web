import type { UserSession, Appointment, UserRole } from '../types/models.ts'
import type { NavId } from '../types/salon.ts'
import { sessionService } from './sessionService.ts'
import { isRootAdminEmail } from '../config/adminConfig.ts'

/**
 * Resolves session object: accepts explicit session or falls back to active session
 */
function resolveSession(session?: UserSession | null): UserSession | null {
  if (session !== undefined) return session
  return sessionService.getCurrentSession()
}

export const permissionService = {
  /**
   * Dedicated System Administrator check.
   * STRICT POLICY: Exactly 1 single user (ROOT_ADMIN_EMAIL) is authorized as Root Administrator.
   */
  isAdmin(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(
      s &&
      s.isAuthenticated &&
      s.role === 'ADMIN' &&
      isRootAdminEmail(s.email)
    )
  },

  /**
   * Salon Owner check.
   */
  isOwner(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && s.role === 'OWNER')
  },

  /**
   * Strictly Administrator-only privilege: managing & provisioning Owner accounts.
   */
  canManageOwners(session?: UserSession | null): boolean {
    return this.isAdmin(session)
  },

  /**
   * Strictly Root Administrator privilege: creating new Salon Owner credentials.
   */
  canCreateOwner(session?: UserSession | null): boolean {
    return this.isAdmin(session)
  },

  /**
   * ADMIN and OWNER can access the User Management workspace.
   */
  canAccessUserManagement(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * Salon Owners can create new staff/employee accounts.
   * The Root Administrator creates ONLY Salon Owners, not regular salon employees.
   */
  canCreateEmployee(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && s.role === 'OWNER')
  },

  /**
   * ADMIN and OWNER can edit staff/employee profiles.
   */
  canEditEmployee(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * ADMIN and OWNER can activate or deactivate employees.
   */
  canDeactivateEmployee(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * OWNER and RECEPTIONIST can assign services and appointments to employees.
   * EMPLOYEES cannot assign appointments.
   */
  canAssignServices(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
  },

  /**
   * OWNER and RECEPTIONIST can view salon-wide appointments.
   * EMPLOYEES can only see their own.
   */
  canViewAllAppointments(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
  },

  /**
   * Checks whether the current session is allowed to view a specific appointment.
   */
  canViewAppointment(
    appointment: Appointment,
    session?: UserSession | null
  ): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false

    if (s.role === 'OWNER' || s.role === 'RECEPTIONIST') {
      return true
    }

    if (s.role === 'EMPLOYEE') {
      const assignedId = appointment.assignedEmployeeId || appointment.staffId
      return Boolean(s.employeeId && assignedId === s.employeeId)
    }

    return false
  },

  /**
   * Only OWNER and RECEPTIONIST can dispatch salon-wide reminders.
   */
  canSendSalonReminders(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
  },

  /**
   * ADMIN and OWNER can view salon-wide revenue summaries.
   */
  canViewSalonRevenue(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'ADMIN'
  },

  /**
   * ADMIN and OWNER can delete user accounts (Admin manages owners, owners manage staff).
   */
  canDeleteUser(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * ADMIN and OWNER can delete client records.
   */
  canDeleteClient(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * ADMIN and OWNER can delete service offerings.
   */
  canDeleteService(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    return Boolean(s && s.isAuthenticated && (s.role === 'OWNER' || s.role === 'ADMIN'))
  },

  /**
   * Generic record deletion policy check.
   */
  canDeleteRecord(
    entityType: 'user' | 'client' | 'service' | 'staff',
    session?: UserSession | null
  ): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated || (s.role !== 'OWNER' && s.role !== 'ADMIN')) return false
    switch (entityType) {
      case 'user':
      case 'staff':
      case 'client':
      case 'service':
        return true
      default:
        return false
    }
  },

  /**
   * AI Assistant Access Policy:
   * Only Salon Owners (both Owner 1 and Owner 2) are permitted to access the AI Assistant.
   * All other user roles (ADMIN, RECEPTIONIST, EMPLOYEE) and unauthenticated sessions are strictly denied.
   */
  canAccessAIAssistant(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER'
  },

  /**
   * Product Inventory Access Policy:
   * Only OWNER and RECEPTIONIST roles are permitted to access Product Inventory.
   * EMPLOYEE role and unauthenticated sessions are strictly denied.
   */
  canAccessInventory(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
  },

  /**
   * Helper checks for route categories
   */
  isOwnerRoute(route: string): boolean {
    const clean = route.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
    return clean.startsWith('owner/')
  },

  isEmployeeRoute(route: string): boolean {
    const clean = route.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
    return clean.startsWith('employee/')
  },

  isReceptionistRoute(route: string): boolean {
    const clean = route.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
    return clean.startsWith('receptionist/')
  },

  isBillingRoute(route: string): boolean {
    const clean = route.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
    return clean.startsWith('billing/')
  },

  /**
   * Billing Workspace Policy:
   * Accessible to OWNER and RECEPTIONIST roles.
   * EMPLOYEE, ADMIN, and unauthenticated sessions are strictly denied.
   */
  canAccessBilling(session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false
    return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
  },

  /**
   * Centralized Role-Based Dashboard & Route Protection Guard.
   *
   * SECURITY ENFORCEMENT:
   * - Unauthenticated sessions: Strictly DENIED access to all protected routes.
   * - Root Admin (ADMIN): Confined strictly to platform admin portal (#/admin).
   *   Blocked from operational salon workspaces (Owner, Employee, Receptionist).
   * - Salon Owner (OWNER): Authorized for all #/owner/* views + legacy operational modules.
   *   Blocked from #/employee/* and #/receptionist/* specific workspaces.
   * - Employee / Stylist (EMPLOYEE): Strictly confined to #/employee/* personal views
   *   and own scoped calendar/services/clients. Strictly DENIED all #/owner/* and #/receptionist/* routes.
   * - Receptionist (RECEPTIONIST): Strictly confined to #/receptionist/* front desk views
   *   and authorized operational modules. Strictly DENIED all #/owner/* (finance, user mgmt, settings).
   */
  canAccessRoute(route: string, session?: UserSession | null): boolean {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) return false

    // Normalize route (strip leading # and /)
    const normalized = route.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()

    // 1. Root Administrator
    if (s.role === 'ADMIN') {
      return normalized === 'admin' || normalized === 'users'
    }

    // 2. Owner Routes
    if (this.isOwnerRoute(normalized)) {
      return s.role === 'OWNER'
    }

    // 3. Employee Routes
    if (this.isEmployeeRoute(normalized)) {
      return s.role === 'EMPLOYEE'
    }

    // 4. Receptionist Routes
    if (this.isReceptionistRoute(normalized)) {
      return s.role === 'RECEPTIONIST'
    }

    // 5. Billing Routes (OWNER and RECEPTIONIST only)
    if (this.isBillingRoute(normalized)) {
      return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
    }

    // 6. Legacy top-level operational modules (backward compatibility)
    switch (normalized) {
      case 'assistant':
        return this.canAccessAIAssistant(s)
      case 'inventory':
        return this.canAccessInventory(s)
      case 'users':
        return this.canAccessUserManagement(s)
      case 'staff':
        return s.role === 'OWNER' || s.role === 'RECEPTIONIST'
      case 'settings':
        return s.role === 'OWNER'
      case 'calendar':
      case 'clients':
      case 'services':
        return true
      default:
        return false
    }
  },

  /**
   * Navigation module access policy (delegates to canAccessRoute for unified enforcement)
   */
  canAccessModule(navId: NavId, session?: UserSession | null): boolean {
    return this.canAccessRoute(navId, session)
  },

  /**
   * Returns the primary landing module / dashboard for a verified role.
   * Requirement Baseline:
   * - Owner must land on Business Overview (owner/dashboard)
   * - Employee must land on My Day (employee/dashboard)
   * - Receptionist must land on Today's Front Desk (receptionist/dashboard)
   * - Admin must land on Root Admin Portal (admin)
   */
  getDefaultRouteForRole(role?: UserRole): NavId {
    switch (role) {
      case 'ADMIN':
        return 'users'
      case 'OWNER':
        return 'owner/dashboard'
      case 'EMPLOYEE':
        return 'employee/dashboard'
      case 'RECEPTIONIST':
        return 'receptionist/dashboard'
      default:
        return 'owner/dashboard'
    }
  },
}

