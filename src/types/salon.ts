export * from './models'

// Legacy top-level operational modules
export type LegacyNavId =
  | 'assistant'
  | 'calendar'
  | 'clients'
  | 'staff'
  | 'services'
  | 'settings'
  | 'users'
  | 'inventory'

// Phase 1 Multi-Role Workspace Routes
export type OwnerRouteId =
  | 'owner/dashboard'
  | 'owner/live-operations'
  | 'owner/employees'
  | 'owner/operations'
  | 'owner/reports'
  | 'owner/financial-intelligence'
  | 'owner/settings'

export type EmployeeRouteId =
  | 'employee/dashboard'
  | 'employee/appointments'
  | 'employee/service-workflow'
  | 'employee/availability'
  | 'employee/leave'
  | 'employee/performance'

export type ReceptionistRouteId =
  | 'receptionist/dashboard'
  | 'receptionist/calendar'
  | 'receptionist/bookings'
  | 'receptionist/walk-ins'
  | 'receptionist/check-in'

export type BillingRouteId =
  | 'billing/overview'
  | 'billing/new'
  | 'billing/invoices'
  | 'billing/payments'
  | 'billing/ledger'
  | 'billing/estimates'
  | 'billing/purchases'
  | 'billing/refunds'
  | 'billing/reports'
  | 'billing/settings'

export type NavId =
  | LegacyNavId
  | OwnerRouteId
  | EmployeeRouteId
  | ReceptionistRouteId
  | BillingRouteId

export type NavIconName =
  | 'sparkle'
  | 'calendar'
  | 'users'
  | 'staff'
  | 'scissors'
  | 'settings'
  | 'inventory'
  | 'dashboard'
  | 'activity'
  | 'sliders'
  | 'trending-up'
  | 'shield-check'
  | 'sun'
  | 'coffee'
  | 'award'
  | 'calendar-plus'
  | 'user-check'
  | 'clipboard-list'
  | 'file-text'
  | 'refresh-cw'

export interface NavigationItem {
  id: NavId
  label: string
  icon: NavIconName
  badge?: string | number
  active?: boolean
  description?: string
}

export interface OwnerProfile {
  ownerName: string
  salonName: string
  avatarUrl: string
  isOnline: boolean
}

export interface SuggestedAction {
  id: string
  label: string
  query: string
}
