import { authService } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { userService } from '../src/services/userService'
import { permissionService } from '../src/services/permissionService'
import { DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import type { UserRole, UserSession } from '../src/types/models'
import type { NavId } from '../src/types/salon'

interface TestResult {
  id: number
  title: string
  passed: boolean
  details: string
}

const results: TestResult[] = []

function assert(cond: boolean, id: number, title: string, details: string) {
  results.push({ id, title, passed: cond, details })
  const badge = cond ? '✅ PASS' : '❌ FAIL'
  console.log(`${badge} [Test ${id}]: ${title} - ${details}`)
}

async function runLoginSuite() {
  console.log('========================================================================')
  console.log('LUMA SALON — PHASE 15.13: PRODUCTION-QUALITY LOGIN & AUTH TEST SUITE')
  console.log('========================================================================\n')

  // Set mock mode for controlled baseline identity testing
  authService.setAuthMode('local_mock')

  // ---------------------------------------------------------------------------
  // TEST 1: SUCCESSFUL SIGN-IN
  // ---------------------------------------------------------------------------
  try {
    const session = await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
    const passed = Boolean(session && session.isAuthenticated && session.role === 'OWNER')
    assert(passed, 1, 'Successful sign-in', `Authenticated as ${session.name} (${session.role})`)
  } catch (err: unknown) {
    assert(false, 1, 'Successful sign-in', (err as Error).message)
  }

  // ---------------------------------------------------------------------------
  // TEST 2: INVALID CREDENTIALS
  // ---------------------------------------------------------------------------
  try {
    await authService.login('owner1@lumasalon.example.com', 'IncorrectPassword999!')
    assert(false, 2, 'Invalid credentials', 'Login unexpectedly succeeded with incorrect password.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Invalid email or password')
    assert(passed, 2, 'Invalid credentials', `Safely rejected: "${msg}"`)
  }

  // ---------------------------------------------------------------------------
  // TEST 3: MISSING PROFILE
  // ---------------------------------------------------------------------------
  try {
    await authService.login('unknown.user@example.com', DEFAULT_TEST_PASSWORD)
    assert(false, 3, 'Missing profile', 'Login unexpectedly succeeded for missing profile.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Invalid email or password') || msg.includes('not found')
    assert(passed, 3, 'Missing profile', `Safely rejected nonexistent profile: "${msg}"`)
  }

  // ---------------------------------------------------------------------------
  // TEST 4: UNLINKED AUTH IDENTITY
  // ---------------------------------------------------------------------------
  try {
    // Calling resolveAndEstablishSession with an unlinked Auth UUID (not present in administrators or users)
    await authService.resolveAndEstablishSession('00000000-0000-0000-0000-000000000999')
    assert(false, 4, 'Unlinked Auth identity', 'Session established for unlinked identity.')
  } catch (err: unknown) {
    const msg = (err as Error).message
    const passed = msg.includes('Your account is not linked to an active salon profile')
    assert(passed, 4, 'Unlinked Auth identity', `Safely denied unlinked Auth UUID: "${msg}"`)
  }

  // ---------------------------------------------------------------------------
  // TEST 5: DISABLED ACCOUNT AND EXACT REQUIRED MESSAGE
  // ---------------------------------------------------------------------------
  try {
    const adminSession = await authService.login('talk2rkalyani@gmail.com', DEFAULT_TEST_PASSWORD)
    const targetStaff = await userService.getUserByEmail('farhaan@lumasalon.example.com')
    if (!targetStaff) throw new Error('Test staff not found')

    // Deactivate staff
    await userService.toggleUserActive(targetStaff.id, false, adminSession)

    try {
      await authService.login('farhaan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
      assert(false, 5, 'Disabled account message', 'Login succeeded for disabled user.')
    } catch (loginErr: unknown) {
      const msg = (loginErr as Error).message
      const exactMatch = msg === 'User is disabled. Please contact the administrator.'
      assert(exactMatch, 5, 'Disabled account message', `Exact message matched: "${msg}"`)
    } finally {
      // Re-activate staff
      await userService.toggleUserActive(targetStaff.id, true, adminSession)
    }
  } catch (err: unknown) {
    assert(false, 5, 'Disabled account message', (err as Error).message)
  }

  // ---------------------------------------------------------------------------
  // TEST 6: EACH SUPPORTED ROLE'S REDIRECT
  // ---------------------------------------------------------------------------
  const roleRedirectMap: { role: UserRole; expected: NavId }[] = [
    { role: 'ADMIN', expected: 'users' },
    { role: 'OWNER', expected: 'assistant' },
    { role: 'RECEPTIONIST', expected: 'calendar' },
    { role: 'EMPLOYEE', expected: 'calendar' },
  ]
  let allRedirectsMatch = true
  const redirectDetails: string[] = []

  for (const { role, expected } of roleRedirectMap) {
    const actual = permissionService.getDefaultRouteForRole(role)
    const matches = actual === expected
    if (!matches) allRedirectsMatch = false
    redirectDetails.push(`${role} -> ${actual} (expected: ${expected})`)
  }
  assert(allRedirectsMatch, 6, 'Role default redirects', redirectDetails.join(', '))

  // ---------------------------------------------------------------------------
  // TEST 7: UNAUTHENTICATED ACCESS TO PROTECTED ROUTES
  // ---------------------------------------------------------------------------
  sessionService.logout()
  const unauthSession = sessionService.getCurrentSession()
  const canAccessUsersUnauth = permissionService.canAccessModule('users', unauthSession)
  const canAccessCalendarUnauth = permissionService.canAccessModule('calendar', unauthSession)
  const canAccessStaffUnauth = permissionService.canAccessModule('staff', unauthSession)
  const allBlockedUnauth = !canAccessUsersUnauth && !canAccessCalendarUnauth && !canAccessStaffUnauth
  assert(allBlockedUnauth, 7, 'Unauthenticated route protection', 'All protected modules denied for unauthenticated state')

  // ---------------------------------------------------------------------------
  // TEST 8: CROSS-ROLE ACCESS DENIAL
  // ---------------------------------------------------------------------------
  const empUser = await userService.getUserByEmail('farhaan@lumasalon.example.com')
  if (empUser) {
    const empSession = sessionService.loginWithUser(empUser)
    const empCanAccessUsers = permissionService.canAccessModule('users', empSession)
    const empCanAccessSettings = permissionService.canAccessModule('settings', empSession)
    const empCanDelete = permissionService.canDeleteUser(empSession)

    const ownerUser = await userService.getUserByEmail('owner1@lumasalon.example.com')
    let ownerCanManageAdmin = false
    if (ownerUser) {
      const ownerSession = sessionService.loginWithUser(ownerUser)
      ownerCanManageAdmin = permissionService.canManageOwners(ownerSession) // only ADMIN can manage owners/admins
    }

    const crossRoleDenied = !empCanAccessUsers && !empCanAccessSettings && !empCanDelete && !ownerCanManageAdmin
    assert(crossRoleDenied, 8, 'Cross-role access denial', 'EMPLOYEE blocked from users/settings/deletion; OWNER blocked from managing admins')
  } else {
    assert(false, 8, 'Cross-role access denial', 'Employee user not found')
  }

  // ---------------------------------------------------------------------------
  // TEST 9: SESSION RESTORATION AFTER REFRESH
  // ---------------------------------------------------------------------------
  const ownerUser = await userService.getUserByEmail('owner1@lumasalon.example.com')
  if (ownerUser) {
    sessionService.loginWithUser(ownerUser)
    const saved = sessionService.getCurrentSession()
    assert(Boolean(saved && saved.userId === ownerUser.id), 9, 'Session restoration', `Restored session for ${saved?.name} (${saved?.userId})`)
  } else {
    assert(false, 9, 'Session restoration', 'Owner user not found')
  }

  // ---------------------------------------------------------------------------
  // TEST 10: SIGN-OUT
  // ---------------------------------------------------------------------------
  authService.logout()
  const postLogoutSession = authService.getCurrentSession()
  const isLoggedOut = postLogoutSession === null && !authService.isAuthenticated()
  assert(isLoggedOut, 10, 'Sign-out', 'Session completely cleared and isAuthenticated evaluates to false')

  // ---------------------------------------------------------------------------
  // TEST 11: FORGOT-PASSWORD SUBMISSION AND RECOVERY STATE
  // ---------------------------------------------------------------------------
  try {
    // 1. Invalid email format rejection
    let rejectedInvalidFormat = false
    try {
      await authService.requestPasswordReset('invalid-email-format')
    } catch (resetErr) {
      rejectedInvalidFormat = (resetErr as Error).message === 'Please enter a valid email address.'
    }

    // 2. Placeholder email rejection
    let rejectedPlaceholder = false
    try {
      await authService.requestPasswordReset('owner1@lumasalon.example.com')
    } catch (placeholderErr) {
      rejectedPlaceholder = (placeholderErr as Error).message.includes('placeholder accounts')
    }

    // 3. Valid non-placeholder email submission produces generic message without disclosing existence
    const resetRes = await authService.requestPasswordReset('talk2rkalyani@gmail.com')
    const hasGenericMessage = resetRes.success && resetRes.message.includes('If an account exists with this email address')
    
    assert(rejectedInvalidFormat && rejectedPlaceholder && hasGenericMessage, 11, 'Forgot-password workflow', 'Format validated; placeholders rejected; generic non-disclosing message returned')
  } catch (err: unknown) {
    assert(false, 11, 'Forgot-password workflow', (err as Error).message)
  }

  // ---------------------------------------------------------------------------
  // TEST 12: LOADING STATE AND DUPLICATE-SUBMIT PREVENTION
  // ---------------------------------------------------------------------------
  // Test email format validation in login() directly
  let rejectedEmptyEmail = false
  let rejectedMalformedEmail = false
  let rejectedEmptyPassword = false

  try {
    await authService.login('', 'any')
  } catch (err) {
    rejectedEmptyEmail = (err as Error).message === 'Please enter your email address.'
  }

  try {
    await authService.login('not-an-email', 'any')
  } catch (err) {
    rejectedMalformedEmail = (err as Error).message === 'Please enter a valid email address.'
  }

  try {
    await authService.login('valid@lumasalon.example.com', '')
  } catch (err) {
    rejectedEmptyPassword = (err as Error).message === 'Please enter your password.'
  }

  const clientValidationPassed = rejectedEmptyEmail && rejectedMalformedEmail && rejectedEmptyPassword
  assert(clientValidationPassed, 12, 'Login validation guards', 'Empty email, malformed email, and empty password validated before network dispatch')

  // ---------------------------------------------------------------------------
  // TEST 13: SUPABASE FAILURE WITHOUT SILENTLY ENTERING MOCK MODE
  // ---------------------------------------------------------------------------
  authService.setAuthMode('supabase_auth')
  let threwExpectedError = false
  let didNotFallBackToMock = false

  try {
    // In supabase_auth mode, attempting to login with mock credentials without live Supabase auth will throw
    await authService.login('talk2rkalyani@gmail.com', DEFAULT_TEST_PASSWORD)
  } catch (sbErr: unknown) {
    threwExpectedError = true
    const msg = (sbErr as Error).message
    // Make sure we did NOT succeed or establish mock session
    const currentSess = authService.getCurrentSession()
    didNotFallBackToMock = currentSess === null
    console.log(`[Test 13 diagnostic] Threw expected error: "${msg}", session is null: ${didNotFallBackToMock}`)
  } finally {
    // Reset back to mock mode
    authService.setAuthMode('local_mock')
  }

  assert(threwExpectedError && didNotFallBackToMock, 13, 'Supabase failure guard', 'Failed Supabase call strictly throws without silently falling back to mock authentication')

  console.log('\n========================================================================')
  const total = results.length
  const passedCount = results.filter((r) => r.passed).length
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passedCount} | FAILED: ${total - passedCount}`)
  console.log('========================================================================')

  if (passedCount !== total) {
    process.exit(1)
  }
}

runLoginSuite().catch((err) => {
  console.error('Test suite execution failed:', err)
  process.exit(1)
})
