/**
 * Luma Salon — Phase 14.4B.4: Authentication Readiness and Integration Audit
 * Automated Local Verification Suite
 *
 * Verifies:
 * 1. Authentication failure and unavailable Supabase configuration handling.
 * 2. Exact disabled user error message ("User is disabled. Please contact the administrator.").
 * 3. Administrator vs Owner privilege separation (Owners cannot manage Owner/Admin accounts).
 * 4. Strict prevention of mock-auth fallback in production mode ('supabase_auth').
 * 5. Placeholder email (@lumasalon.example.com) blocking in production auth and invitations.
 * 6. Existing user/session compatibility in local mode.
 * 7. Preservation of historical appointment snapshots and staff references.
 */

import { authService, isPlaceholderEmail } from '../src/services/authService'
import { userService } from '../src/services/userService'
import { permissionService } from '../src/services/permissionService'
import { sessionService, buildSessionFromUser, isSessionValid } from '../src/services/sessionService'
import { appointmentStore } from '../src/services/appointmentStore'
import { mockStaff, mockAppointments } from '../src/mockData/salonEntities'
import { isPlaceholderEmail as isScriptPlaceholderEmail } from '../supabase/scripts/admin_provision_identities'
import type { UserSession, User } from '../src/types/models'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhase14_4B_4_Suite() {
  console.log('======================================================================')
  console.log('LUMA SALON — PHASE 14.4B.4: AUTHENTICATION READINESS & INTEGRATION AUDIT')
  console.log('======================================================================\n')

  // Reset stores to known state
  userService.resetToMock()
  sessionService.logout()

  // -------------------------------------------------------------------------
  // SECTION 1: AUTHENTICATION MODE BOUNDARIES & PREVENTION OF MOCK FALLBACK
  // -------------------------------------------------------------------------
  console.log('>>> [SECTION 1: AUTHENTICATION MODE BOUNDARY & MOCK FALLBACK PREVENTION]')

  // 1a. Default mode verification
  assert(authService.getAuthMode() === 'local_mock', 'Default authentication mode is local_mock for safe local development')

  // 1b. Placeholder email detection
  assert(isPlaceholderEmail('receptionist@lumasalon.example.com'), 'isPlaceholderEmail recognizes @lumasalon.example.com')
  assert(isPlaceholderEmail('owner1@lumasalon.example.com'), 'isPlaceholderEmail recognizes owner placeholder')
  assert(isPlaceholderEmail('staff@example.com'), 'isPlaceholderEmail recognizes generic @example.com')
  assert(!isPlaceholderEmail('talk2rkalyani@gmail.com'), 'isPlaceholderEmail permits genuine external email')
  assert(!isPlaceholderEmail('admin@lumasalon.com'), 'isPlaceholderEmail permits genuine custom salon domain')
  assert(isScriptPlaceholderEmail('receptionist@lumasalon.example.com'), 'admin_provision_identities isPlaceholderEmail matches')

  // 1c. Production mode: Placeholder email strictly rejected
  authService.setAuthMode('supabase_auth')
  assert(authService.getAuthMode() === 'supabase_auth', 'Auth mode switched to supabase_auth')

  let placeholderRejected = false
  try {
    await authService.login('receptionist@lumasalon.example.com', 'Luma@2026!')
  } catch (err: any) {
    placeholderRejected = true
    assert(
      err.message.includes('Placeholder email addresses (@lumasalon.example.com) cannot be used for production Supabase authentication'),
      `Placeholder email rejected with expected message: "${err.message}"`
    )
  }
  assert(placeholderRejected, 'Placeholder email rejected before Supabase Auth call')

  // 1d. Production mode: Strict prohibition of silent mock fallback
  // Even with a valid non-placeholder email and valid mock password, failed Supabase Auth MUST NOT fall back to mock
  let fallbackBlocked = false
  try {
    // talk2rkalyani@gmail.com is in local mock with Luma@2026!, but no Supabase Auth session exists on remote
    await authService.login('talk2rkalyani@gmail.com', 'Luma@2026!')
  } catch (err: any) {
    fallbackBlocked = true
    // Supabase will return "Invalid login credentials" or network/config error; it must NOT return a local session
    assert(
      err.message.includes('Invalid login credentials') ||
      err.message.includes('Invalid email or password') ||
      err.message.includes('Authentication Error') ||
      err.message.includes('fetch'),
      `Production auth failed securely without falling back to mock: "${err.message}"`
    )
  }
  assert(fallbackBlocked, 'Production authentication strictly prevented silent fallback to mock credentials')
  assert(!sessionService.isAuthenticated(), 'No mock session created when production authentication failed')

  // Revert back to local_mock mode for remaining local tests
  authService.setAuthMode('local_mock')
  assert(authService.getAuthMode() === 'local_mock', 'Reverted cleanly to local_mock mode')

  // -------------------------------------------------------------------------
  // SECTION 2: DISABLED USER ENFORCEMENT & EXACT ERROR MESSAGE
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 2: DISABLED USER ENFORCEMENT]')

  // 2a. Attempt login with an inactive user
  // Deactivate user-rec-01 locally
  const adminSession: UserSession = {
    sessionId: 'sess-admin-test',
    userId: 'user-admin-01',
    name: 'Kalyani',
    email: 'talk2rkalyani@gmail.com',
    role: 'ADMIN',
    ownerDesignation: null,
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  await userService.toggleUserActive('user-rec-01', false, adminSession)
  const disabledUser = await userService.getUserById('user-rec-01')
  assert(disabledUser?.active === false, 'user-rec-01 is confirmed inactive')

  let disabledUserBlocked = false
  try {
    await authService.login('receptionist@lumasalon.example.com', 'Luma@2026!')
  } catch (err: any) {
    disabledUserBlocked = true
    // MUST match exact string requirement: "User is disabled. Please contact the administrator."
    assert(
      err.message === 'User is disabled. Please contact the administrator.',
      `Exact disabled-user message verified: "${err.message}"`
    )
  }
  assert(disabledUserBlocked, 'Disabled user prevented from logging in')

  // 2b. Active session validation for disabled user
  const disabledUserSession = buildSessionFromUser(disabledUser!)
  sessionService.setSession(disabledUserSession)
  const isValid = await authService.validateSession()
  assert(!isValid, 'validateSession() returns false for disabled user')
  assert(!sessionService.isAuthenticated(), 'validateSession() terminated disabled user session')

  // Re-enable user-rec-01
  await userService.toggleUserActive('user-rec-01', true, adminSession)

  // -------------------------------------------------------------------------
  // SECTION 3: ADMINISTRATOR VS OWNER PRIVILEGE SEPARATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 3: ADMINISTRATOR VS OWNER PRIVILEGE SEPARATION]')

  const ownerSession: UserSession = {
    sessionId: 'sess-owner-test',
    userId: 'user-owner-01',
    name: 'Rajesh',
    email: 'owner1@lumasalon.example.com',
    role: 'OWNER',
    ownerDesignation: 'OWNER_1',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  // 3a. Distinct role checks
  assert(permissionService.isAdmin(adminSession), 'adminSession is recognized as ADMIN')
  assert(!permissionService.isOwner(adminSession), 'adminSession is NOT recognized as OWNER')
  assert(!permissionService.isAdmin(ownerSession), 'ownerSession is NOT recognized as ADMIN')
  assert(permissionService.isOwner(ownerSession), 'ownerSession is recognized as OWNER')

  // 3b. canManageOwners privilege
  assert(permissionService.canManageOwners(adminSession), 'Administrator canManageOwners is true')
  assert(!permissionService.canManageOwners(ownerSession), 'Owner canManageOwners is false')

  // 3c. Owner cannot create an OWNER account
  let ownerCreateOwnerBlocked = false
  try {
    await userService.createUser(
      {
        name: 'Third Owner',
        email: 'owner3@lumasalon.example.com',
        role: 'OWNER',
      },
      ownerSession
    )
  } catch (err: any) {
    ownerCreateOwnerBlocked = true
    assert(
      err.message === 'Forbidden: Only the system administrator can create or manage salon owner accounts.',
      `Owner blocked from creating Owner: "${err.message}"`
    )
  }
  assert(ownerCreateOwnerBlocked, 'Owner creation by ordinary owner blocked')

  // 3d. Owner cannot create an ADMIN account
  let ownerCreateAdminBlocked = false
  try {
    await userService.createUser(
      {
        name: 'Fake Admin',
        email: 'fakeadmin@lumasalon.example.com',
        role: 'ADMIN',
      },
      ownerSession
    )
  } catch (err: any) {
    ownerCreateAdminBlocked = true
    assert(
      err.message === 'Forbidden: Administrator accounts cannot be created from this interface.',
      `Owner blocked from creating Admin: "${err.message}"`
    )
  }
  assert(ownerCreateAdminBlocked, 'Admin creation blocked from user management interface')

  // 3e. Owner cannot edit Owner 2 (Niketa Kaushik)
  let ownerEditOwnerBlocked = false
  try {
    await userService.updateUser('user-owner-02', { name: 'Compromised Name' }, ownerSession)
  } catch (err: any) {
    ownerEditOwnerBlocked = true
    assert(
      err.message === 'Forbidden: Only the system administrator can edit owner or administrator accounts.',
      `Owner blocked from editing another owner: "${err.message}"`
    )
  }
  assert(ownerEditOwnerBlocked, 'Owner editing another owner blocked')

  // 3f. Owner cannot edit Root Administrator
  let ownerEditAdminBlocked = false
  try {
    await userService.updateUser('user-admin-01', { name: 'Compromised Admin' }, ownerSession)
  } catch (err: any) {
    ownerEditAdminBlocked = true
    assert(
      err.message === 'Forbidden: Only the system administrator can edit owner or administrator accounts.',
      `Owner blocked from editing administrator: "${err.message}"`
    )
  }
  assert(ownerEditAdminBlocked, 'Owner editing root administrator blocked')

  // 3g. Owner cannot deactivate Owner 2
  let ownerDeactivateOwnerBlocked = false
  try {
    await userService.toggleUserActive('user-owner-02', false, ownerSession)
  } catch (err: any) {
    ownerDeactivateOwnerBlocked = true
    assert(
      err.message === 'Forbidden: Only the system administrator can change owner account status.',
      `Owner blocked from deactivating another owner: "${err.message}"`
    )
  }
  assert(ownerDeactivateOwnerBlocked, 'Owner deactivating another owner blocked')

  // 3h. Owner cannot delete Owner 2
  let ownerDeleteOwnerBlocked = false
  try {
    await userService.deleteUser('user-owner-02', ownerSession)
  } catch (err: any) {
    ownerDeleteOwnerBlocked = true
    assert(
      err.message === 'Forbidden: Only the system administrator can manage salon owner accounts.',
      `Owner blocked from deleting another owner: "${err.message}"`
    )
  }
  assert(ownerDeleteOwnerBlocked, 'Owner deleting another owner blocked')

  // 3i. Owner cannot delete Root Administrator
  let ownerDeleteAdminBlocked = false
  try {
    await userService.deleteUser('user-admin-01', ownerSession)
  } catch (err: any) {
    ownerDeleteAdminBlocked = true
    assert(
      err.message === 'Forbidden: Root Administrator account cannot be deleted.',
      `Owner blocked from deleting Root Admin: "${err.message}"`
    )
  }
  assert(ownerDeleteAdminBlocked, 'Owner deleting Root Admin blocked')

  // 3j. Maximum 2 Owners limit enforced against Administrator
  let maxTwoOwnersEnforced = false
  try {
    await userService.createUser(
      {
        name: 'Third Owner Attempt',
        email: 'thirdowner@lumasalon.com',
        role: 'OWNER',
      },
      adminSession
    )
  } catch (err: any) {
    maxTwoOwnersEnforced = true
    assert(
      err.message === 'Cannot create owner: Salon already has the maximum allowed 2 owners.',
      `Max 2 owners enforced against Admin: "${err.message}"`
    )
  }
  assert(maxTwoOwnersEnforced, 'Max 2 owners constraint enforced at service layer')

  // -------------------------------------------------------------------------
  // SECTION 4: USER & SESSION COMPATIBILITY
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 4: USER & SESSION COMPATIBILITY]')

  // 4a. Authenticate valid user in local_mock mode
  const loginSession = await authService.login('owner1@lumasalon.example.com', 'Luma@2026!')
  assert(loginSession.userId === 'user-owner-01', 'owner1 session created with correct userId')
  assert(loginSession.role === 'OWNER', 'owner1 session role is OWNER')
  assert(loginSession.ownerDesignation === 'OWNER_1', 'owner1 session ownerDesignation is OWNER_1')
  assert(loginSession.isAuthenticated === true, 'owner1 session is marked authenticated')
  assert(isSessionValid(loginSession), 'loginSession passes isSessionValid check')

  // 4b. Session expiry check
  const expiredSession: UserSession = {
    ...loginSession,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  }
  assert(!isSessionValid(expiredSession), 'Expired session is recognized as invalid')

  // 4c. Logout terminates session
  authService.logout()
  assert(authService.getCurrentSession() === null, 'Session is null after logout')
  assert(!authService.isAuthenticated(), 'isAuthenticated() is false after logout')

  // -------------------------------------------------------------------------
  // SECTION 5: HISTORICAL APPOINTMENT & STAFF PRESERVATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 5: HISTORICAL DATA & SNAPSHOT PRESERVATION]')

  // 5a. Historical staff count and archived status
  const historicalStaff = mockStaff.filter((s) => !s.id.startsWith('staff-real-'))
  assert(historicalStaff.length === 20, `All 20 historical staff preserved (found ${historicalStaff.length})`)
  assert(historicalStaff.every((s) => !s.active), 'All historical staff marked active: false')

  // 5b. Historical appointment references
  const initialApts = appointmentStore.getAll()
  assert(initialApts.length >= 18, `Baseline appointments preserved (found ${initialApts.length})`)
  const apt01 = initialApts.find((a) => a.id === 'apt-01')
  assert(!!apt01, 'Historical appointment apt-01 exists')
  assert(!!apt01?.clientName, `apt-01 retains client snapshot: ${apt01?.clientName}`)
  assert(!!apt01?.staffName, `apt-01 retains staff snapshot: ${apt01?.staffName}`)
  assert(!!apt01?.serviceName, `apt-01 retains service snapshot: ${apt01?.serviceName}`)

  // 5c. Blocking appointment deletion check for staff
  // Create temporary employee and appointment
  const testEmpUser = await userService.createUser(
    {
      name: 'Test Stylist',
      email: 'teststylist@lumasalon.com',
      role: 'EMPLOYEE',
      specialty: 'Hair',
    },
    adminSession
  )
  assert(!!testEmpUser.id, 'Test employee created via userService')

  const testApt = appointmentStore.add({
    id: 'apt-test-blocking-99',
    salonId: 'salon-luma-01',
    clientId: 'cli-01',
    staffId: testEmpUser.employeeId || testEmpUser.id,
    serviceId: 'srv-01',
    date: '2026-10-25',
    startTime: '10:00',
    endTime: '11:00',
    price: 500,
    status: 'scheduled',
    createdAt: new Date().toISOString(),
  })

  // Try to delete employee who has blocking upcoming appointment
  let deleteBlocked = false
  try {
    await userService.deleteUser(testEmpUser.id, adminSession)
  } catch (err: any) {
    deleteBlocked = true
    assert(
      err.message.includes('upcoming or active appointment exists for this employee'),
      `Employee deletion blocked by active appointment: "${err.message}"`
    )
  }
  assert(deleteBlocked, 'Deletion of employee with upcoming appointment strictly blocked')

  // Clean up test appointment
  appointmentStore.remove(testApt.id)
  assert(!appointmentStore.getById(testApt.id), 'Test appointment cleanly removed')

  // Now employee deletion succeeds cleanly after appointment is cleared
  const deleted = await userService.deleteUser(testEmpUser.id, adminSession)
  assert(deleted, 'Employee cleanly deleted after blocking appointment cleared')

  console.log('\n======================================================================')
  console.log('🎉 ALL PHASE 14.4B.4 AUTHENTICATION READINESS TESTS PASSED (100%)!')
  console.log('======================================================================\n')
}

runPhase14_4B_4_Suite().catch((err) => {
  console.error('Test Suite Failed:', err)
  process.exit(1)
})
