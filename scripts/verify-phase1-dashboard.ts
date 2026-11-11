// ==============================================================================
// Luma Salon — Phase 1: Multi-Role Dashboard Foundation & Architecture
// Automated Verification Suite
// ==============================================================================

import { permissionService } from '../src/services/permissionService.ts'
import type { UserSession, UserRole } from '../src/types/models.ts'
import type { NavId } from '../src/types/salon.ts'

let passed = 0
let failed = 0

function assert(condition: boolean, testId: string, testName: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✅ [PASS] ${testId}: ${testName}`)
  } else {
    failed++
    console.error(`  ❌ [FAIL] ${testId}: ${testName}${detail ? ` — ${detail}` : ''}`)
  }
}

// Mock session builders
function createSession(role: UserRole, email: string, name: string): UserSession {
  const now = new Date()
  return {
    sessionId: `test-sess-${role.toLowerCase()}`,
    userId: `user-${role.toLowerCase()}-01`,
    name,
    email,
    role,
    isAuthenticated: true,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }
}

const ownerSession = createSession('OWNER', 'owner1@lumasalon.example.com', 'Rajesh (Owner 1)')
const employeeSession = createSession('EMPLOYEE', 'farhaan@lumasalon.example.com', 'Farhaan (Stylist)')
const receptionistSession = createSession('RECEPTIONIST', 'receptionist@lumasalon.example.com', 'Riya Balodi (Front Desk)')
const adminSession = createSession('ADMIN', 'talk2rkalyani@gmail.com', 'Kalyani (Root Administrator)')

// Route Parser Replica for Verification
const VALID_ROUTES: NavId[] = [
  'owner/dashboard',
  'owner/live-operations',
  'owner/employees',
  'owner/operations',
  'owner/reports',
  'owner/settings',
  'employee/dashboard',
  'employee/appointments',
  'employee/service-workflow',
  'employee/availability',
  'employee/leave',
  'employee/performance',
  'receptionist/dashboard',
  'receptionist/calendar',
  'receptionist/bookings',
  'receptionist/walk-ins',
  'receptionist/check-in',
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

async function runPhase1Suite() {
  console.log('\n========================================================================')
  console.log('🏛️ LUMA SALON: PHASE 1 MULTI-ROLE DASHBOARD VERIFICATION SUITE')
  console.log('========================================================================\n')

  // SECTION 1: DEFAULT ROLE LANDING ROUTES
  console.log('--- Section 1: Default Role Landing Routes ---')
  assert(
    permissionService.getDefaultRouteForRole('OWNER') === 'owner/dashboard',
    'TC-P1-01',
    'Owner lands by default on Business Overview (owner/dashboard)'
  )
  assert(
    permissionService.getDefaultRouteForRole('EMPLOYEE') === 'employee/dashboard',
    'TC-P1-02',
    'Employee lands by default on My Day (employee/dashboard)'
  )
  assert(
    permissionService.getDefaultRouteForRole('RECEPTIONIST') === 'receptionist/dashboard',
    'TC-P1-03',
    'Receptionist lands by default on Today\'s Front Desk (receptionist/dashboard)'
  )

  // SECTION 2: UNAUTHENTICATED PROTECTION
  console.log('\n--- Section 2: Unauthenticated Protection ---')
  assert(
    !permissionService.canAccessRoute('owner/dashboard', null),
    'TC-P1-04',
    'Null session cannot access Owner dashboard'
  )
  assert(
    !permissionService.canAccessRoute('employee/dashboard', null),
    'TC-P1-05',
    'Null session cannot access Employee dashboard'
  )
  assert(
    !permissionService.canAccessRoute('receptionist/dashboard', null),
    'TC-P1-06',
    'Null session cannot access Receptionist dashboard'
  )
  assert(
    !permissionService.canAccessRoute('owner/reports', { ...ownerSession, isAuthenticated: false }),
    'TC-P1-07',
    'Unauthenticated session cannot access Owner reports'
  )

  // SECTION 3: OWNER WORKSPACE ACCESS & BOUNDARIES
  console.log('\n--- Section 3: Owner Workspace Access & Boundaries ---')
  const ownerRoutes: NavId[] = [
    'owner/dashboard',
    'owner/live-operations',
    'owner/employees',
    'owner/operations',
    'owner/reports',
    'owner/settings',
  ]
  ownerRoutes.forEach((route, idx) => {
    assert(
      permissionService.canAccessRoute(route, ownerSession),
      `TC-P1-08.${idx + 1}`,
      `Owner authorized for ${route}`
    )
  })

  // Owner blocked from employee and receptionist workspaces
  assert(
    !permissionService.canAccessRoute('employee/dashboard', ownerSession),
    'TC-P1-09',
    'Owner cannot access employee/dashboard workspace'
  )
  assert(
    !permissionService.canAccessRoute('receptionist/dashboard', ownerSession),
    'TC-P1-10',
    'Owner cannot access receptionist/dashboard workspace'
  )

  // SECTION 4: EMPLOYEE WORKSPACE ACCESS & BOUNDARIES
  console.log('\n--- Section 4: Employee Workspace Access & Boundaries ---')
  const employeeRoutes: NavId[] = [
    'employee/dashboard',
    'employee/appointments',
    'employee/service-workflow',
    'employee/availability',
    'employee/leave',
    'employee/performance',
  ]
  employeeRoutes.forEach((route, idx) => {
    assert(
      permissionService.canAccessRoute(route, employeeSession),
      `TC-P1-11.${idx + 1}`,
      `Employee authorized for ${route}`
    )
  })

  // Employee blocked from Owner routes
  ownerRoutes.forEach((route, idx) => {
    assert(
      !permissionService.canAccessRoute(route, employeeSession),
      `TC-P1-12.${idx + 1}`,
      `Employee strictly blocked from ${route}`
    )
  })

  // Employee blocked from Receptionist routes
  const receptionistRoutes: NavId[] = [
    'receptionist/dashboard',
    'receptionist/calendar',
    'receptionist/bookings',
    'receptionist/walk-ins',
    'receptionist/check-in',
  ]
  receptionistRoutes.forEach((route, idx) => {
    assert(
      !permissionService.canAccessRoute(route, employeeSession),
      `TC-P1-13.${idx + 1}`,
      `Employee strictly blocked from ${route}`
    )
  })

  // Employee blocked from Owner-only legacy modules
  assert(
    !permissionService.canAccessRoute('assistant', employeeSession),
    'TC-P1-14',
    'Employee strictly blocked from AI Assistant (assistant)'
  )
  assert(
    !permissionService.canAccessRoute('inventory', employeeSession),
    'TC-P1-15',
    'Employee strictly blocked from Product Inventory (inventory)'
  )
  assert(
    !permissionService.canAccessRoute('users', employeeSession),
    'TC-P1-16',
    'Employee strictly blocked from User Management (users)'
  )
  assert(
    !permissionService.canAccessRoute('settings', employeeSession),
    'TC-P1-17',
    'Employee strictly blocked from System Settings (settings)'
  )

  // SECTION 5: RECEPTIONIST WORKSPACE ACCESS & BOUNDARIES
  console.log('\n--- Section 5: Receptionist Workspace Access & Boundaries ---')
  receptionistRoutes.forEach((route, idx) => {
    assert(
      permissionService.canAccessRoute(route, receptionistSession),
      `TC-P1-18.${idx + 1}`,
      `Receptionist authorized for ${route}`
    )
  })

  // Receptionist blocked from Owner routes
  ownerRoutes.forEach((route, idx) => {
    assert(
      !permissionService.canAccessRoute(route, receptionistSession),
      `TC-P1-19.${idx + 1}`,
      `Receptionist strictly blocked from Owner route ${route}`
    )
  })

  // Receptionist blocked from Employee routes
  employeeRoutes.forEach((route, idx) => {
    assert(
      !permissionService.canAccessRoute(route, receptionistSession),
      `TC-P1-20.${idx + 1}`,
      `Receptionist strictly blocked from Employee route ${route}`
    )
  })

  // Receptionist blocked from Owner-only confidential modules
  assert(
    !permissionService.canAccessRoute('assistant', receptionistSession),
    'TC-P1-21',
    'Receptionist strictly blocked from AI Assistant'
  )
  assert(
    !permissionService.canAccessRoute('users', receptionistSession),
    'TC-P1-22',
    'Receptionist strictly blocked from User Management'
  )
  assert(
    !permissionService.canAccessRoute('settings', receptionistSession),
    'TC-P1-23',
    'Receptionist strictly blocked from System Settings'
  )

  // SECTION 6: ROOT ADMINISTRATOR ISOLATION
  console.log('\n--- Section 6: Root Administrator Isolation ---')
  assert(
    permissionService.canAccessRoute('admin', adminSession),
    'TC-P1-24',
    'Root Administrator authorized for platform admin portal (admin)'
  )
  assert(
    !permissionService.canAccessRoute('owner/dashboard', adminSession),
    'TC-P1-25',
    'Root Administrator blocked from Owner workspace (owner/dashboard)'
  )
  assert(
    !permissionService.canAccessRoute('employee/dashboard', adminSession),
    'TC-P1-26',
    'Root Administrator blocked from Employee workspace (employee/dashboard)'
  )
  assert(
    !permissionService.canAccessRoute('receptionist/dashboard', adminSession),
    'TC-P1-27',
    'Root Administrator blocked from Receptionist workspace (receptionist/dashboard)'
  )

  // SECTION 7: BACKWARD COMPATIBILITY
  console.log('\n--- Section 7: Backward Compatibility with Existing Modules ---')
  assert(
    permissionService.canAccessRoute('calendar', ownerSession),
    'TC-P1-28',
    'Owner retains access to legacy Calendar'
  )
  assert(
    permissionService.canAccessRoute('calendar', receptionistSession),
    'TC-P1-29',
    'Receptionist retains access to legacy Calendar'
  )
  assert(
    permissionService.canAccessRoute('calendar', employeeSession),
    'TC-P1-30',
    'Employee retains access to legacy Calendar (scoped to self)'
  )
  assert(
    permissionService.canAccessRoute('inventory', ownerSession),
    'TC-P1-31',
    'Owner retains access to legacy Product Inventory'
  )
  assert(
    permissionService.canAccessRoute('inventory', receptionistSession),
    'TC-P1-32',
    'Receptionist retains access to legacy Product Inventory'
  )
  assert(
    permissionService.canAccessRoute('clients', ownerSession),
    'TC-P1-33',
    'Owner retains access to legacy Clients CRM'
  )
  assert(
    permissionService.canAccessRoute('services', ownerSession),
    'TC-P1-34',
    'Owner retains access to legacy Services catalog'
  )

  // SECTION 8: HASH ROUTE PARSING & RECOVERY
  console.log('\n--- Section 8: Hash Route Parsing & Recovery ---')
  assert(
    parseNavFromHash('#/owner/dashboard') === 'owner/dashboard',
    'TC-P1-35',
    'Parses #/owner/dashboard'
  )
  assert(
    parseNavFromHash('#/owner/reports') === 'owner/reports',
    'TC-P1-36',
    'Parses #/owner/reports'
  )
  assert(
    parseNavFromHash('#/employee/dashboard') === 'employee/dashboard',
    'TC-P1-37',
    'Parses #/employee/dashboard'
  )
  assert(
    parseNavFromHash('#/employee/appointments') === 'employee/appointments',
    'TC-P1-38',
    'Parses #/employee/appointments'
  )
  assert(
    parseNavFromHash('#/receptionist/dashboard') === 'receptionist/dashboard',
    'TC-P1-39',
    'Parses #/receptionist/dashboard'
  )
  assert(
    parseNavFromHash('#/receptionist/check-in') === 'receptionist/check-in',
    'TC-P1-40',
    'Parses #/receptionist/check-in'
  )
  assert(
    parseNavFromHash('#/calendar') === 'calendar',
    'TC-P1-41',
    'Parses legacy #/calendar'
  )
  assert(
    parseNavFromHash('#/invalid/route/path') === null,
    'TC-P1-42',
    'Invalid hash safely returns null'
  )

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 1 VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

void runPhase1Suite()
