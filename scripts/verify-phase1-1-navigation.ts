// ==============================================================================
// Luma Salon — Phase 1.1 Navigation Correction Verification Suite
// Validates:
//   1. 100% preservation of all existing application menus for every role
//   2. Coexistence of new expandable "Dashboards" menu alongside existing menus
//   3. Role-specific dashboard submenus (Owner: 6, Employee: 6, Receptionist: 5)
//   4. Route authorization and isolation rules
//   5. Expand/collapse helper logic and active dashboard route detection
// ==============================================================================

import {
  getLegacyNavItems,
  getDashboardSubmenuItems,
  getAllAccessibleNavItems,
  isDashboardRoute,
} from '../src/config/navigationConfig.ts'
import { permissionService } from '../src/services/permissionService.ts'
import type { UserRole, UserSession } from '../src/types/models.ts'

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
const receptionistSession = createSession('RECEPTIONIST', 'receptionist@lumasalon.example.com', 'Riya Balodi (Receptionist)')
const adminSession = createSession('ADMIN', 'talk2rkalyani@gmail.com', 'Kalyani (Root Administrator)')

async function runNavigationCorrectionSuite() {
  console.log('\n========================================================================')
  console.log('🧭 LUMA SALON: PHASE 1.1 NAVIGATION CORRECTION VERIFICATION SUITE')
  console.log('========================================================================\n')

  // SECTION 1: PRESERVATION OF EXISTING APPLICATION MENUS
  console.log('--- Section 1: Preservation of Existing Application Menus ---')

  // Owner Legacy Menus
  const ownerLegacy = getLegacyNavItems('OWNER')
  const ownerLegacyIds = ownerLegacy.map((i) => i.id)
  assert(
    ownerLegacyIds.includes('assistant') &&
    ownerLegacyIds.includes('calendar') &&
    ownerLegacyIds.includes('clients') &&
    ownerLegacyIds.includes('staff') &&
    ownerLegacyIds.includes('services') &&
    ownerLegacyIds.includes('inventory') &&
    ownerLegacyIds.includes('users') &&
    ownerLegacyIds.includes('settings'),
    'TC-P1.1-01',
    'Owner preserves all 8 original application menus (Assistant, Calendar, Clients, Staff, Services, Inventory, Users, Settings)'
  )
  assert(ownerLegacy.length === 8, 'TC-P1.1-02', 'Owner has exactly 8 legacy application menu items')

  // Receptionist Legacy Menus
  const recLegacy = getLegacyNavItems('RECEPTIONIST')
  const recLegacyIds = recLegacy.map((i) => i.id)
  assert(
    recLegacyIds.includes('calendar') &&
    recLegacyIds.includes('clients') &&
    recLegacyIds.includes('staff') &&
    recLegacyIds.includes('services') &&
    recLegacyIds.includes('inventory'),
    'TC-P1.1-03',
    'Receptionist preserves all 5 original application menus (Calendar, Clients, Staff, Services, Inventory)'
  )
  assert(!recLegacyIds.includes('assistant'), 'TC-P1.1-04', 'Receptionist does not have Owner AI Assistant menu')
  assert(!recLegacyIds.includes('users'), 'TC-P1.1-05', 'Receptionist does not have User Management menu')
  assert(recLegacy.length === 5, 'TC-P1.1-06', 'Receptionist has exactly 5 legacy application menu items')

  // Employee Legacy Menus
  const empLegacy = getLegacyNavItems('EMPLOYEE')
  const empLegacyIds = empLegacy.map((i) => i.id)
  assert(
    empLegacyIds.includes('calendar') &&
    empLegacyIds.includes('services') &&
    empLegacyIds.includes('clients'),
    'TC-P1.1-07',
    'Employee preserves all 3 original application menus (My Calendar, My Services, Clients)'
  )
  assert(!empLegacyIds.includes('inventory'), 'TC-P1.1-08', 'Employee does not have Product Inventory menu')
  assert(!empLegacyIds.includes('staff'), 'TC-P1.1-09', 'Employee does not have Staff Roster menu')
  assert(empLegacy.length === 3, 'TC-P1.1-10', 'Employee has exactly 3 legacy application menu items')

  // Admin Legacy Menus
  const adminLegacy = getLegacyNavItems('ADMIN')
  assert(adminLegacy.length >= 3, 'TC-P1.1-11', 'Admin retains legacy management menus')

  // SECTION 2: NEW EXPANDABLE DASHBOARDS MENU
  console.log('\n--- Section 2: Role-Specific Dashboard Submenus ---')

  // Owner Dashboards Submenus
  const ownerDash = getDashboardSubmenuItems('OWNER')
  const ownerDashIds = ownerDash.map((i) => i.id)
  assert(ownerDash.length === 6, 'TC-P1.1-12', 'Owner has exactly 6 dashboard submenus')
  assert(ownerDashIds[0] === 'owner/dashboard', 'TC-P1.1-13', 'Owner submenu 1: Business Overview')
  assert(ownerDashIds[1] === 'owner/live-operations', 'TC-P1.1-14', 'Owner submenu 2: Live Operations')
  assert(ownerDashIds[2] === 'owner/employees', 'TC-P1.1-15', 'Owner submenu 3: Employee Details')
  assert(ownerDashIds[3] === 'owner/operations', 'TC-P1.1-16', 'Owner submenu 4: Operations Management')
  assert(ownerDashIds[4] === 'owner/reports', 'TC-P1.1-17', 'Owner submenu 5: Finance & Reports')
  assert(ownerDashIds[5] === 'owner/settings', 'TC-P1.1-18', 'Owner submenu 6: Settings & Permissions')

  // Employee Dashboards Submenus
  const empDash = getDashboardSubmenuItems('EMPLOYEE')
  const empDashIds = empDash.map((i) => i.id)
  assert(empDash.length === 6, 'TC-P1.1-19', 'Employee has exactly 6 dashboard submenus')
  assert(empDashIds[0] === 'employee/dashboard', 'TC-P1.1-20', 'Employee submenu 1: My Day')
  assert(empDashIds[1] === 'employee/appointments', 'TC-P1.1-21', 'Employee submenu 2: My Appointments')
  assert(empDashIds[2] === 'employee/service-workflow', 'TC-P1.1-22', 'Employee submenu 3: Service Workflow')
  assert(empDashIds[3] === 'employee/availability', 'TC-P1.1-23', 'Employee submenu 4: Availability & Breaks')
  assert(empDashIds[4] === 'employee/leave', 'TC-P1.1-24', 'Employee submenu 5: Leave Management')
  assert(empDashIds[5] === 'employee/performance', 'TC-P1.1-25', 'Employee submenu 6: My Performance')

  // Receptionist Dashboards Submenus
  const recDash = getDashboardSubmenuItems('RECEPTIONIST')
  const recDashIds = recDash.map((i) => i.id)
  assert(recDash.length === 5, 'TC-P1.1-26', 'Receptionist has exactly 5 dashboard submenus')
  assert(recDashIds[0] === 'receptionist/dashboard', 'TC-P1.1-27', 'Receptionist submenu 1: Today\'s Front Desk')
  assert(recDashIds[1] === 'receptionist/calendar', 'TC-P1.1-28', 'Receptionist submenu 2: Appointment Calendar')
  assert(recDashIds[2] === 'receptionist/bookings', 'TC-P1.1-29', 'Receptionist submenu 3: New Booking')
  assert(recDashIds[3] === 'receptionist/walk-ins', 'TC-P1.1-30', 'Receptionist submenu 4: Walk-ins')
  assert(recDashIds[4] === 'receptionist/check-in', 'TC-P1.1-31', 'Receptionist submenu 5: Check-in / Check-out')

  // Admin Dashboards Submenus (None)
  const adminDash = getDashboardSubmenuItems('ADMIN')
  assert(adminDash.length === 0, 'TC-P1.1-32', 'Admin has 0 operational dashboard submenus (portal isolation preserved)')

  // SECTION 3: COEXISTENCE VERIFICATION (BOTH MENUS VISIBLE TOGETHER)
  console.log('\n--- Section 3: Coexistence Verification ---')
  const ownerAll = getAllAccessibleNavItems('OWNER')
  assert(ownerAll.length === 14, 'TC-P1.1-33', 'Owner has 14 total navigation targets (6 dashboards + 8 legacy apps)')

  const empAll = getAllAccessibleNavItems('EMPLOYEE')
  assert(empAll.length === 9, 'TC-P1.1-34', 'Employee has 9 total navigation targets (6 dashboards + 3 legacy apps)')

  const recAll = getAllAccessibleNavItems('RECEPTIONIST')
  assert(recAll.length === 10, 'TC-P1.1-35', 'Receptionist has 10 total navigation targets (5 dashboards + 5 legacy apps)')

  // SECTION 4: EXPANSION & ACTIVE ROUTE DETECTION LOGIC
  console.log('\n--- Section 4: Expand/Collapse & Dashboard Route Detection ---')
  assert(isDashboardRoute('owner/dashboard'), 'TC-P1.1-36', 'owner/dashboard recognized as dashboard route')
  assert(isDashboardRoute('#/owner/reports'), 'TC-P1.1-37', '#/owner/reports recognized as dashboard route')
  assert(isDashboardRoute('employee/dashboard'), 'TC-P1.1-38', 'employee/dashboard recognized as dashboard route')
  assert(isDashboardRoute('#/receptionist/check-in'), 'TC-P1.1-39', '#/receptionist/check-in recognized as dashboard route')
  assert(!isDashboardRoute('calendar'), 'TC-P1.1-40', 'calendar correctly NOT recognized as dashboard route')
  assert(!isDashboardRoute('#/inventory'), 'TC-P1.1-41', '#/inventory correctly NOT recognized as dashboard route')
  assert(!isDashboardRoute('clients'), 'TC-P1.1-42', 'clients correctly NOT recognized as dashboard route')
  assert(!isDashboardRoute('assistant'), 'TC-P1.1-43', 'assistant correctly NOT recognized as dashboard route')

  // SECTION 5: ACCESS CONTROL & ISOLATION GATES
  console.log('\n--- Section 5: Access Control & Isolation Gates ---')
  // Employee blocked from all owner dashboards and owner legacy
  assert(!permissionService.canAccessRoute('owner/dashboard', employeeSession), 'TC-P1.1-44', 'Employee blocked from owner/dashboard')
  assert(!permissionService.canAccessRoute('owner/reports', employeeSession), 'TC-P1.1-45', 'Employee blocked from owner/reports')
  assert(!permissionService.canAccessRoute('receptionist/dashboard', employeeSession), 'TC-P1.1-46', 'Employee blocked from receptionist/dashboard')
  assert(!permissionService.canAccessRoute('assistant', employeeSession), 'TC-P1.1-47', 'Employee blocked from assistant')
  assert(!permissionService.canAccessRoute('inventory', employeeSession), 'TC-P1.1-48', 'Employee blocked from inventory')

  // Receptionist blocked from owner dashboards and owner legacy
  assert(!permissionService.canAccessRoute('owner/dashboard', receptionistSession), 'TC-P1.1-49', 'Receptionist blocked from owner/dashboard')
  assert(!permissionService.canAccessRoute('owner/reports', receptionistSession), 'TC-P1.1-50', 'Receptionist blocked from owner/reports')
  assert(!permissionService.canAccessRoute('employee/dashboard', receptionistSession), 'TC-P1.1-51', 'Receptionist blocked from employee/dashboard')
  assert(!permissionService.canAccessRoute('users', receptionistSession), 'TC-P1.1-52', 'Receptionist blocked from users')
  assert(!permissionService.canAccessRoute('assistant', receptionistSession), 'TC-P1.1-53', 'Receptionist blocked from assistant')

  // All legacy pages accessible by authorized roles
  assert(permissionService.canAccessRoute('calendar', ownerSession), 'TC-P1.1-54', 'Owner can access calendar')
  assert(permissionService.canAccessRoute('calendar', receptionistSession), 'TC-P1.1-55', 'Receptionist can access calendar')
  assert(permissionService.canAccessRoute('calendar', employeeSession), 'TC-P1.1-56', 'Employee can access calendar')
  assert(permissionService.canAccessRoute('inventory', ownerSession), 'TC-P1.1-57', 'Owner can access inventory')
  assert(permissionService.canAccessRoute('inventory', receptionistSession), 'TC-P1.1-58', 'Receptionist can access inventory')
  assert(permissionService.canAccessRoute('assistant', ownerSession), 'TC-P1.1-59', 'Owner can access assistant')

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 1.1 VERIFICATION SUMMARY: ${passed} PASSED | ${failed} FAILED`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

void runNavigationCorrectionSuite()

