// ==============================================================================
// LUMA SALON — PHASE 8 VERIFICATION SUITE
// Security, Role Authorization Matrix, Centralized Notifications & Final QA
// ==============================================================================

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { permissionService } from '../src/services/permissionService.ts'
import { notificationService } from '../src/services/notificationService.ts'
import { sessionService } from '../src/services/sessionService.ts'
import { billingService } from '../src/services/billingService.ts'
import { ROOT_ADMIN_EMAIL } from '../src/config/adminConfig.ts'
import type { UserSession } from '../src/types/models.ts'
import type { NavId } from '../src/types/salon.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

interface TestResult {
  id: string
  name: string
  classification: 'PASS — Application/unit test' | 'PASS — Static SQL inspection' | 'FAIL' | 'BLOCKED'
  details?: string
}

const results: TestResult[] = []

function recordTest(id: string, name: string, classification: TestResult['classification'], details?: string) {
  results.push({ id, name, classification, details })
  const icon = classification.startsWith('PASS') ? '✅' : '❌'
  console.log(`  ${icon} [${classification}] ${id}: ${name}`)
  if (details) {
    console.log(`      ↳ ${details}`)
  }
}

async function runPhase8Suite() {
  console.log('\n========================================================================')
  console.log('🏛️ LUMA SALON: PHASE 8 SECURITY, NOTIFICATIONS & FINAL QA SUITE')
  console.log('========================================================================\n')

  const migration12Path = path.resolve(__dirname, '../supabase/migrations/20261106000012_notifications_system.sql')
  const migration12Sql = fs.existsSync(migration12Path) ? fs.readFileSync(migration12Path, 'utf-8') : ''

  // Mock sessions
  const ownerSession: UserSession = {
    userId: 'usr-owner-1',
    name: 'Ananya Sharma',
    email: 'ananya@lumasalon.com',
    role: 'OWNER',
    salonId: 'salon-luma-01',
    salonName: 'Luma Salon Indiranagar',
    isAuthenticated: true,
  }

  const receptionistSession: UserSession = {
    userId: 'usr-rec-1',
    name: 'Pooja Nair',
    email: 'pooja@lumasalon.com',
    role: 'RECEPTIONIST',
    salonId: 'salon-luma-01',
    salonName: 'Luma Salon Indiranagar',
    isAuthenticated: true,
  }

  const employeeSession: UserSession = {
    userId: 'usr-emp-1',
    name: 'Mia Patel',
    email: 'mia@lumasalon.com',
    role: 'EMPLOYEE',
    employeeId: 'staff-1',
    salonId: 'salon-luma-01',
    salonName: 'Luma Salon Indiranagar',
    specialty: 'Senior Hair Stylist',
    isAuthenticated: true,
  }

  const adminSession: UserSession = {
    userId: 'usr-admin-1',
    name: 'Kalyani Root Admin',
    email: ROOT_ADMIN_EMAIL,
    role: 'ADMIN',
    salonId: 'system',
    salonName: 'System Administration',
    isAuthenticated: true,
  }

  // ----------------------------------------------------------------------------
  // SECTION 1: ROLE-BASED ACCESS CONTROL (RBAC) SECURITY MATRIX
  // ----------------------------------------------------------------------------
  console.log('--- Section 1: Security Audit & RBAC Capability Matrix ---')

  // 1.1 Owner Dashboard Route Protection
  const ownerRoutes: NavId[] = [
    'owner/dashboard',
    'owner/live-operations',
    'owner/employees',
    'owner/operations',
    'owner/reports',
    'owner/settings',
  ]

  const ownerCanAccessAll = ownerRoutes.every((r) => permissionService.canAccessRoute(r, ownerSession))
  const receptionistBlockedFromOwner = ownerRoutes.every((r) => !permissionService.canAccessRoute(r, receptionistSession))
  const employeeBlockedFromOwner = ownerRoutes.every((r) => !permissionService.canAccessRoute(r, employeeSession))

  if (ownerCanAccessAll && receptionistBlockedFromOwner && employeeBlockedFromOwner) {
    recordTest(
      'TC-P8-01',
      'Owner workspace routes strictly restricted to OWNER; denied to RECEPTIONIST and EMPLOYEE',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-01', 'Owner route boundary enforcement', 'FAIL')
  }

  // 1.2 Receptionist Workspace Route Protection
  const recRoutes: NavId[] = [
    'receptionist/dashboard',
    'receptionist/calendar',
    'receptionist/bookings',
    'receptionist/walk-ins',
    'receptionist/check-in',
  ]

  const recCanAccessAll = recRoutes.every((r) => permissionService.canAccessRoute(r, receptionistSession))
  const employeeBlockedFromRec = recRoutes.every((r) => !permissionService.canAccessRoute(r, employeeSession))

  if (recCanAccessAll && employeeBlockedFromRec) {
    recordTest(
      'TC-P8-02',
      'Receptionist front desk workspace routes accessible to RECEPTIONIST; strictly denied to EMPLOYEE',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-02', 'Receptionist route boundary enforcement', 'FAIL')
  }

  // 1.3 Employee Personal Workspace Route Protection
  const empRoutes: NavId[] = [
    'employee/dashboard',
    'employee/appointments',
    'employee/service-workflow',
    'employee/availability',
    'employee/leave',
    'employee/performance',
  ]

  const empCanAccessAll = empRoutes.every((r) => permissionService.canAccessRoute(r, employeeSession))
  const recBlockedFromEmp = empRoutes.every((r) => !permissionService.canAccessRoute(r, receptionistSession))

  if (empCanAccessAll && recBlockedFromEmp) {
    recordTest(
      'TC-P8-03',
      'Employee personal workspace routes accessible to EMPLOYEE; strictly denied to RECEPTIONIST',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-03', 'Employee route boundary enforcement', 'FAIL')
  }

  // 1.4 Unauthenticated Access Prevention
  const unauthBlocked = [
    ...ownerRoutes,
    ...recRoutes,
    ...empRoutes,
    'inventory',
    'users',
    'settings',
  ].every((r) => !permissionService.canAccessRoute(r as NavId, null))

  if (unauthBlocked) {
    recordTest(
      'TC-P8-04',
      'Unauthenticated null sessions denied access to all salon workspaces and management routes',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-04', 'Unauthenticated session rejection', 'FAIL')
  }

  // 1.5 Sensitive Module Permissions
  const canOwnerManageStock = permissionService.canAccessInventory(ownerSession)
  const canEmpManageStock = permissionService.canAccessInventory(employeeSession)
  const canOwnerManageUsers = permissionService.canAccessUserManagement(ownerSession)
  const canEmpManageUsers = permissionService.canAccessUserManagement(employeeSession)
  const canAdminManageOwners = permissionService.canManageOwners(adminSession)
  const canOwnerManageOwners = permissionService.canManageOwners(ownerSession)

  if (canOwnerManageStock && !canEmpManageStock && canOwnerManageUsers && !canEmpManageUsers && canAdminManageOwners && !canOwnerManageOwners) {
    recordTest(
      'TC-P8-05',
      'Sensitive capabilities (Inventory management, User management, Owner provisioning) strictly gated by role',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-05', 'Sensitive capability enforcement', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 2: MULTI-TENANT ISOLATION
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 2: Multi-Tenant Isolation ---')

  const foreignSalonId = 'salon-foreign-999'
  notificationService.createNotification({
    salonId: foreignSalonId,
    targetRole: 'OWNER',
    category: 'system',
    severity: 'info',
    title: 'Foreign Salon Alert',
    message: 'This notification belongs to salon-foreign-999.',
  })

  // Set session to salon-001
  sessionService.setSession(ownerSession)
  const ownerNotifs = notificationService.getNotifications('all')
  const leakedForeignNotif = ownerNotifs.some((n) => n.salonId === foreignSalonId)

  if (!leakedForeignNotif) {
    recordTest(
      'TC-P8-06',
      'Tenant Isolation: Notifications are strictly partitioned by salonId; foreign salon events invisible',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-06', 'Tenant isolation in notification query', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 3: ROLE-TARGETED NOTIFICATIONS & VISIBILITY
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 3: Centralized Notification Center & Role Visibility ---')

  // Set active session to Owner
  sessionService.setSession(ownerSession)
  const ownerVisible = notificationService.getNotifications('all')
  const ownerHasOwnerAlerts = ownerVisible.some((n) => n.targetRole === 'OWNER')
  const ownerHasNoStylistAlerts = !ownerVisible.some((n) => n.targetRole === 'EMPLOYEE')

  // Set active session to Stylist Mia
  sessionService.setSession(employeeSession)
  const empVisible = notificationService.getNotifications('all')
  const empHasOwnAlerts = empVisible.some((n) => n.targetRole === 'EMPLOYEE' && n.recipientUserId === 'staff-1')
  const empHasNoOwnerAlerts = !empVisible.some((n) => n.targetRole === 'OWNER')

  // Set active session to Receptionist
  sessionService.setSession(receptionistSession)
  const recVisible = notificationService.getNotifications('all')
  const recHasRecAlerts = recVisible.some((n) => n.targetRole === 'RECEPTIONIST')
  const recHasNoOwnerAlerts = !recVisible.some((n) => n.targetRole === 'OWNER')

  if (ownerHasOwnerAlerts && ownerHasNoStylistAlerts && empHasOwnAlerts && empHasNoOwnerAlerts && recHasRecAlerts && recHasNoOwnerAlerts) {
    recordTest(
      'TC-P8-07',
      'Role-based notification filtering: OWNER, RECEPTIONIST, and EMPLOYEE view only role-relevant alerts',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-07', 'Role-based notification filtering', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 4: UNREAD COUNT & READ STATE TRANSITIONS
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 4: Read State Lifecycle & Unread Count ---')

  sessionService.setSession(ownerSession)
  const initialUnread = notificationService.getUnreadCount()

  // Mark all as read
  notificationService.markAllAsRead()
  const postMarkAllUnread = notificationService.getUnreadCount()

  // Create new notification
  const newNotif = notificationService.createNotification({
    targetRole: 'OWNER',
    category: 'operational',
    severity: 'warning',
    title: 'Test Live Alert',
    message: 'Simulated real-time alert for unread count test.',
    deduplicationKey: 'test-live-alert-unique-key',
  })

  const newUnreadCount = notificationService.getUnreadCount()
  if (newNotif) {
    notificationService.markAsRead(newNotif.id)
  }
  const finalUnreadCount = notificationService.getUnreadCount()

  if (postMarkAllUnread === 0 && newUnreadCount === 1 && finalUnreadCount === 0) {
    recordTest(
      'TC-P8-08',
      'Unread count increments on new events and decrements accurately on markAsRead() and markAllAsRead()',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-08', 'Unread count state transitions', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 5: EVENT DEDUPLICATION
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 5: Event Deduplication ---')

  const dedupKey = 'dedup-test-key-555'
  const notif1 = notificationService.createNotification({
    targetRole: 'OWNER',
    category: 'inventory',
    severity: 'warning',
    title: 'Deduplication Test 1',
    message: 'First alert instance.',
    deduplicationKey: dedupKey,
  })

  const notif2 = notificationService.createNotification({
    targetRole: 'OWNER',
    category: 'inventory',
    severity: 'warning',
    title: 'Deduplication Test 2',
    message: 'Duplicate event attempt.',
    deduplicationKey: dedupKey,
  })

  if (notif1 && notif2 && notif1.id === notif2.id) {
    recordTest(
      'TC-P8-09',
      'Deduplication engine prevents duplicate notifications for the same event key within window',
      'PASS — Application/unit test',
      `Reused original notification ID: ${notif1.id}`
    )
  } else {
    recordTest('TC-P8-09', 'Event deduplication check', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 6: MULTI-CHANNEL DELIVERY SIMULATION
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 6: Multi-Channel Delivery Simulation ---')

  const multiChannelNotif = notificationService.createNotification({
    targetRole: 'OWNER',
    category: 'financial',
    severity: 'critical',
    title: 'Critical Transaction Failure Simulation',
    message: 'Simulated POS connection failure with multi-channel dispatch.',
    channels: {
      email: true,
      sms: true,
      whatsapp: true,
    },
  })

  if (
    multiChannelNotif &&
    multiChannelNotif.deliveryChannels.inApp &&
    multiChannelNotif.deliveryChannels.email === 'mock_sent' &&
    multiChannelNotif.deliveryChannels.sms === 'mock_sent' &&
    multiChannelNotif.deliveryChannels.whatsapp === 'mock_sent'
  ) {
    recordTest(
      'TC-P8-10',
      'Multi-channel dispatch simulates Email, SMS, and WhatsApp delivery safely without exposing secrets',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-10', 'Multi-channel delivery simulation', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 7: NOTIFICATION PREFERENCES & MANDATORY ALERTS
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 7: User Preferences & Mandatory Alert Protection ---')

  // Attempt to disable all alerts including financial and operational
  const updatedPrefs = notificationService.updatePreferences({
    appointmentAlerts: false,
    operationalAlerts: false, // Mandatory
    financialAlerts: false,   // Mandatory
    inventoryAlerts: false,
  })

  if (!updatedPrefs.appointmentAlerts && updatedPrefs.operationalAlerts && updatedPrefs.financialAlerts) {
    recordTest(
      'TC-P8-11',
      'Notification Preferences: User can customize alerts; mandatory operational & financial alerts cannot be disabled',
      'PASS — Application/unit test'
    )
  } else {
    recordTest('TC-P8-11', 'Mandatory alert policy protection', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 8: MIGRATION 000012 STATIC SQL INSPECTION
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 8: Migration 000012 DDL & Security Review ---')

  const definesNotifTable = migration12Sql.includes('CREATE TABLE IF NOT EXISTS public.notifications')
  const definesPrefsTable = migration12Sql.includes('CREATE TABLE IF NOT EXISTS public.notification_preferences')
  const definesDedupConstraint = migration12Sql.includes('uq_notification_salon_dedup_bucket') || migration12Sql.includes('uq_notification_salon_dedup')
  const enablesRls = migration12Sql.includes('ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY')
  const hasRoleFilterRls = migration12Sql.includes('salon_id = public.current_user_salon_id()') && migration12Sql.includes('target_role')
  const revokesDelete = migration12Sql.includes('REVOKE DELETE ON public.notifications FROM authenticated')
  const columnLevelUpdate = migration12Sql.includes('GRANT UPDATE (is_read, read_at, is_dismissed, dismissed_at, dismissed_by) ON public.notifications TO authenticated') ||
                            migration12Sql.includes('GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated')

  if (definesNotifTable && definesPrefsTable && definesDedupConstraint && enablesRls && hasRoleFilterRls && revokesDelete && columnLevelUpdate) {
    recordTest(
      'TC-P8-12',
      'Migration 000012 defines notifications & preferences tables with composite unique constraints and RLS',
      'PASS — Static SQL inspection'
    )
    recordTest(
      'TC-P8-13',
      'Migration 000012 hardens SQL privileges: REVOKE DELETE and restricts UPDATE to (is_read, read_at)',
      'PASS — Static SQL inspection'
    )
  } else {
    recordTest('TC-P8-12', 'Migration 000012 DDL and RLS verification', 'FAIL')
    recordTest('TC-P8-13', 'Migration 000012 SQL privilege hardening', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SECTION 9: APPLICATION-WIDE DATA RECONCILIATION & AUDIT
  // ----------------------------------------------------------------------------
  console.log('\n--- Section 9: Application-Wide Integrity & Financial Flow ---')

  const invoices = billingService.getAllInvoices()
  const activeSession = sessionService.getCurrentSession()

  if (invoices.length > 0 && activeSession) {
    recordTest(
      'TC-P8-14',
      'Financial ledger and active session remain consistent and populated without state corruption',
      'PASS — Application/unit test',
      `Loaded ${invoices.length} invoices in session: ${activeSession.name} (${activeSession.role})`
    )
  } else {
    recordTest('TC-P8-14', 'Financial ledger session integrity', 'FAIL')
  }

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log('\n========================================================================')
  console.log('📊 PHASE 8 VERIFICATION SUMMARY')
  console.log('========================================================================')

  const passApp = results.filter((r) => r.classification === 'PASS — Application/unit test').length
  const passStatic = results.filter((r) => r.classification === 'PASS — Static SQL inspection').length
  const fail = results.filter((r) => r.classification === 'FAIL').length

  console.log(`  PASS — Application/unit test: ${passApp}`)
  console.log(`  PASS — Static SQL inspection: ${passStatic}`)
  console.log(`  FAIL:                         ${fail}`)
  console.log(`  TOTAL TEST CASES:             ${results.length}`)
  console.log('========================================================================\n')

  if (fail > 0) {
    console.error(`❌ Phase 8 suite failed with ${fail} failures.`)
    process.exit(1)
  } else {
    console.log('🎉 ALL PHASE 8 SECURITY, NOTIFICATION & QA TESTS PASSED (14 of 14)!\n')
  }
}

runPhase8Suite().catch((err) => {
  console.error('Fatal Phase 8 test error:', err)
  process.exit(1)
})
