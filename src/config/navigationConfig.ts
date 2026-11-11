// ==============================================================================
// Luma Salon — Central Navigation Configuration
// Strictly separates:
//   A. Existing application navigation per role (Preserved 100%)
//   B. Role-specific dashboard submenus (Under new Dashboards menu)
//   C. Navigation state & category resolution helpers
// ==============================================================================

import type { UserRole } from '../types/models.ts'
import type { NavigationItem } from '../types/salon.ts'

/**
 * Checks whether a route ID belongs to the new role-specific dashboards
 */
export function isDashboardRoute(navId: string): boolean {
  const clean = navId.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
  return (
    clean.startsWith('owner/') ||
    clean.startsWith('employee/') ||
    clean.startsWith('receptionist/') ||
    clean.startsWith('billing/')
  )
}

/**
 * Checks whether a route ID belongs to the Billing module
 */
export function isBillingRoute(navId: string): boolean {
  const clean = navId.replace(/^#\/?/, '').replace(/^\//, '').trim().toLowerCase()
  return clean.startsWith('billing/')
}

/**
 * SECTION A: Pre-existing application navigation menus.
 * Preserves 100% of original routes, labels, icons, and role-based visibility.
 */
export function getLegacyNavItems(role?: UserRole): NavigationItem[] {
  if (!role) return []

  switch (role) {
    case 'OWNER':
      return [
        { id: 'assistant', label: 'AI Assistant', icon: 'sparkle' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar' },
        { id: 'clients', label: 'Clients', icon: 'users' },
        { id: 'staff', label: 'Staff', icon: 'staff' },
        { id: 'services', label: 'Services', icon: 'scissors' },
        { id: 'inventory', label: 'Product Inventory', icon: 'inventory' },
        { id: 'users', label: 'User Management', icon: 'users' },
        { id: 'settings', label: 'Settings', icon: 'settings' },
      ]

    case 'RECEPTIONIST':
      return [
        { id: 'calendar', label: 'Calendar', icon: 'calendar' },
        { id: 'clients', label: 'Clients', icon: 'users' },
        { id: 'staff', label: 'Staff', icon: 'staff' },
        { id: 'services', label: 'Services', icon: 'scissors' },
        { id: 'inventory', label: 'Product Inventory', icon: 'inventory' },
      ]

    case 'EMPLOYEE':
      return [
        { id: 'calendar', label: 'My Calendar', icon: 'calendar' },
        { id: 'services', label: 'My Services', icon: 'scissors' },
        { id: 'clients', label: 'Clients', icon: 'users' },
      ]

    case 'ADMIN':
      return [
        { id: 'users', label: 'User Management', icon: 'users' },
        { id: 'staff', label: 'Staff Roster', icon: 'staff' },
        { id: 'clients', label: 'Clients', icon: 'users' },
        { id: 'services', label: 'Services', icon: 'scissors' },
        { id: 'calendar', label: 'Calendar', icon: 'calendar' },
        { id: 'settings', label: 'Settings', icon: 'settings' },
      ]

    default:
      return []
  }
}

/**
 * SECTION B: Role-specific dashboard submenu items.
 * Rendered under the new expandable "Dashboards" parent menu.
 */
export function getDashboardSubmenuItems(role?: UserRole): NavigationItem[] {
  if (!role) return []

  switch (role) {
    case 'OWNER':
      return [
        { id: 'owner/dashboard', label: 'Business Overview', icon: 'dashboard' },
        { id: 'owner/live-operations', label: 'Live Operations', icon: 'activity' },
        { id: 'owner/employees', label: 'Employee Details', icon: 'users' },
        { id: 'owner/operations', label: 'Operations Management', icon: 'sliders' },
        { id: 'owner/reports', label: 'Finance & Reports', icon: 'trending-up' },
        { id: 'owner/financial-intelligence', label: 'Financial Intelligence', icon: 'trending-up' },
        { id: 'owner/settings', label: 'Settings & Permissions', icon: 'shield-check' },
      ]

    case 'EMPLOYEE':
      return [
        { id: 'employee/dashboard', label: 'My Day', icon: 'sun' },
        { id: 'employee/appointments', label: 'My Appointments', icon: 'calendar' },
        { id: 'employee/service-workflow', label: 'Service Workflow', icon: 'scissors' },
        { id: 'employee/availability', label: 'Availability & Breaks', icon: 'coffee' },
        { id: 'employee/leave', label: 'Leave Management', icon: 'file-text' },
        { id: 'employee/performance', label: 'My Performance', icon: 'award' },
      ]

    case 'RECEPTIONIST':
      return [
        { id: 'receptionist/dashboard', label: "Today's Front Desk", icon: 'clipboard-list' },
        { id: 'receptionist/calendar', label: 'Appointment Calendar', icon: 'calendar' },
        { id: 'receptionist/bookings', label: 'New Booking', icon: 'calendar-plus' },
        { id: 'receptionist/walk-ins', label: 'Walk-ins', icon: 'users' },
        { id: 'receptionist/check-in', label: 'Check-in / Check-out', icon: 'user-check' },
      ]

    case 'ADMIN':
      // Root Admin has dedicated provisioning portal; no operational dashboards
      return []

    default:
      return []
  }
}

/**
 * SECTION B.2: Billing module submenu items.
 * Rendered under a dedicated Billing dropdown inside the existing Dashboards navigation section.
 * Only accessible to OWNER and RECEPTIONIST roles.
 */
export function getBillingSubmenuItems(role?: UserRole): NavigationItem[] {
  if (!role || (role !== 'OWNER' && role !== 'RECEPTIONIST')) return []

  return [
    { id: 'billing/overview', label: 'Billing Overview', icon: 'dashboard' },
    { id: 'billing/new', label: 'New Bill', icon: 'scissors' },
    { id: 'billing/invoices', label: 'Invoice History', icon: 'file-text', badge: 'Soon' },
    { id: 'billing/payments', label: 'Payments', icon: 'trending-up', badge: 'Soon' },
    { id: 'billing/ledger', label: 'Customer Ledger', icon: 'users', badge: 'Soon' },
    { id: 'billing/estimates', label: 'Estimates & Quotations', icon: 'clipboard-list' },
    { id: 'billing/refunds', label: 'Refunds & Credit Notes', icon: 'refresh-cw', badge: 'Soon' },
    { id: 'billing/reports', label: 'Billing Reports', icon: 'trending-up', badge: 'Soon' },
    { id: 'billing/settings', label: 'Billing Settings', icon: 'settings', badge: 'Soon' },
  ]
}

/**
 * SECTION C: Flat list of all accessible navigation items for a role
 * Used for route validation, breadcrumbs, and search
 */
export function getAllAccessibleNavItems(role?: UserRole): NavigationItem[] {
  return [
    ...getDashboardSubmenuItems(role),
    ...getBillingSubmenuItems(role),
    ...getLegacyNavItems(role),
  ]
}
