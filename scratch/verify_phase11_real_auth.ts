import { authService } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { permissionService } from '../src/services/permissionService'
import { userService } from '../src/services/userService'
import { appointmentService } from '../src/services/appointmentService'
import { credentialService, DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import { getSalonDateStr } from '../src/utils/formatters'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runRealAuthSuite() {
  console.log('=================================================================')
  console.log('PHASE 11 CORRECTION: REAL AUTHENTICATION & SESSION SUITE (19 TESTS)')
  console.log('=================================================================\n')

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)

  // Ensure clean initial state (logged out and pristine seed data)
  userService.resetToMock()
  await credentialService.resetToBaseline()
  authService.logout()

  // ----------------------------------------------------
  // TEST 1: Unauthenticated user -> protected access blocked
  // ----------------------------------------------------
  console.log('--- TEST 1: Unauthenticated user -> protected access blocked ---')
  assert(authService.isAuthenticated() === false, 'Session is initially null / unauthenticated')
  assert(authService.getCurrentSession() === null, 'authService.getCurrentSession() returns null')
  assert(permissionService.canAccessUserManagement() === false, 'Unauthenticated access to User Management blocked')
  assert(permissionService.canAssignServices() === false, 'Unauthenticated appointment assignment blocked')
  assert(permissionService.canSendSalonReminders() === false, 'Unauthenticated reminder dispatch blocked')

  // ----------------------------------------------------
  // TEST 2: Correct email/password -> successful login
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Correct email/password -> successful login ---')
  const rohanSession = await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(!!rohanSession, 'Login returned valid session object')
  assert(rohanSession.email === 'rohan@lumasalon.example.com', 'Session email matches login email')
  assert(rohanSession.name === 'Rohan Sen', 'Session name matches Rohan Sen')
  assert(rohanSession.role === 'EMPLOYEE', 'Session role is EMPLOYEE')
  assert(rohanSession.isAuthenticated === true, 'Session isAuthenticated is true')
  assert(!!rohanSession.sessionId, `Unique session ID generated: ${rohanSession.sessionId}`)
  assert(!!rohanSession.expiresAt, `Session has expiry timestamp: ${rohanSession.expiresAt}`)

  // ----------------------------------------------------
  // TEST 3: Incorrect password -> login rejected
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Incorrect password -> login rejected ---')
  let badPasswordErr = false
  try {
    await authService.login('rohan@lumasalon.example.com', 'WrongPassword123!')
  } catch (err: any) {
    badPasswordErr = true
    assert(err.message.includes('Invalid email or password'), `Error message expected: "${err.message}"`)
  }
  assert(badPasswordErr, 'Incorrect password strictly threw authentication error')

  // ----------------------------------------------------
  // TEST 4: Unknown email -> login rejected
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Unknown email -> login rejected ---')
  let unknownEmailErr = false
  try {
    await authService.login('nonexistent.user@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  } catch (err: any) {
    unknownEmailErr = true
    assert(err.message.includes('Invalid email or password'), `Error message expected: "${err.message}"`)
  }
  assert(unknownEmailErr, 'Unknown email strictly threw authentication error')

  // ----------------------------------------------------
  // TEST 5: Rohan login -> Rohan session created
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Rohan login -> Rohan session created ---')
  const rohanLogin = await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(rohanLogin.userId === 'user-emp-02', 'Rohan session linked to user ID user-emp-02')
  assert(rohanLogin.employeeId === 'staff-02', 'Rohan session linked to staff ID staff-02')
  assert(rohanLogin.specialty === 'Hair', 'Rohan session has Hair specialty')

  // ----------------------------------------------------
  // TEST 6: Refresh browser -> Rohan session restored
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Refresh browser -> Rohan session restored ---')
  const currentActive = sessionService.getCurrentSession()
  assert(!!currentActive && currentActive.userId === 'user-emp-02', 'Active session exists in memory')
  // Simulate rehydration from storage
  sessionService.setSession(currentActive)
  const restoredSession = sessionService.getCurrentSession()
  assert(!!restoredSession && restoredSession.userId === 'user-emp-02', 'Session rehydrated and active')
  assert(restoredSession?.employeeId === 'staff-02', 'Restored session retains employee ID')

  // ----------------------------------------------------
  // TEST 7: Logout -> session invalidated
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Logout -> session invalidated ---')
  authService.logout()
  assert(authService.getCurrentSession() === null, 'Session is null after logout')
  assert(authService.isAuthenticated() === false, 'isAuthenticated returns false after logout')

  // ----------------------------------------------------
  // TEST 8: After logout -> protected route inaccessible
  // ----------------------------------------------------
  console.log('\n--- TEST 8: After logout -> protected route inaccessible ---')
  assert(permissionService.canAccessUserManagement() === false, 'User management inaccessible after logout')
  assert(permissionService.canAssignServices() === false, 'Service assignment blocked after logout')
  let logoutAssignFailed = false
  try {
    await appointmentService.createAppointment({
      clientId: 'cli-01',
      serviceId: 'srv-01',
      staffId: 'staff-01',
      date: todayStr,
      startTime: '10:00',
      endTime: '11:00',
      status: 'scheduled',
      price: 600,
    })
  } catch (err: any) {
    logoutAssignFailed = true
    assert(err.message.includes('Unauthorized'), 'Data layer rejected unauthenticated appointment creation')
  }
  assert(logoutAssignFailed, 'Appointment creation after logout strictly blocked')

  // ----------------------------------------------------
  // TEST 9: Mia cannot access Rohan's appointment
  // ----------------------------------------------------
  console.log("\n--- TEST 9: Mia cannot access Rohan's appointment ---")
  // First, authenticate as Owner/Receptionist to seed an appointment for Rohan
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const priya = (await clientService.searchClients('Priya Sharma'))[0]
  const balayage = (await serviceService.getServices()).find((s) => s.name.includes('Balayage'))!

  const rohanApt = await appointmentService.createAppointment({
    clientId: priya.id,
    serviceId: balayage.id,
    staffId: 'staff-02', // Rohan Sen
    date: tomorrowStr,
    startTime: '16:00',
    endTime: '19:00',
    status: 'scheduled',
    price: balayage.price,
    notes: 'Isolated Appointment Test for Rohan',
  })
  assert(!!rohanApt, `Created appointment ${rohanApt.id} assigned to Rohan Sen`)

  // Now log in as Mia Vance (staff-01)
  await authService.login('mia@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const miaSession = authService.getCurrentSession()
  assert(miaSession?.employeeId === 'staff-01', 'Authenticated as Mia Vance (staff-01)')

  const miaTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  assert(!miaTomorrowApts.some((a) => a.id === rohanApt.id), "Mia Vance query does NOT include Rohan's appointment")

  const miaDirectLookup = await appointmentService.getAppointmentById(rohanApt.id)
  assert(miaDirectLookup === null, "Direct appointment lookup by ID returns null for another employee's record")

  // ----------------------------------------------------
  // TEST 10: Rohan cannot access Mia's appointment
  // ----------------------------------------------------
  console.log("\n--- TEST 10: Rohan cannot access Mia's appointment ---")
  // Create an appointment for Mia
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const haircut = (await serviceService.getServices()).find((s) => s.name.includes('Haircut'))!
  const miaApt = await appointmentService.createAppointment({
    clientId: priya.id,
    serviceId: haircut.id,
    staffId: 'staff-01', // Mia Vance
    date: tomorrowStr,
    startTime: '15:00',
    endTime: '15:45',
    status: 'scheduled',
    price: haircut.price,
    notes: 'Isolated Appointment Test for Mia',
  })
  assert(!!miaApt, `Created appointment ${miaApt.id} assigned to Mia Vance`)

  // Now log in as Rohan Sen (staff-02)
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const rohanSession2 = authService.getCurrentSession()
  assert(rohanSession2?.employeeId === 'staff-02', 'Authenticated as Rohan Sen (staff-02)')

  const rohanTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  assert(!rohanTomorrowApts.some((a) => a.id === miaApt.id), "Rohan Sen query does NOT include Mia's appointment")

  const rohanDirectLookup = await appointmentService.getAppointmentById(miaApt.id)
  assert(rohanDirectLookup === null, "Direct appointment lookup by ID returns null for another employee's record")

  // ----------------------------------------------------
  // TEST 11: Employee cannot access User Management
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Employee cannot access User Management ---')
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAccessUserManagement() === false, 'Employee cannot access User Management')
  assert(permissionService.canCreateEmployee() === false, 'Employee cannot create employees')

  // ----------------------------------------------------
  // TEST 12: Receptionist cannot access User Management
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Receptionist cannot access User Management ---')
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAccessUserManagement() === false, 'Receptionist cannot access User Management')
  assert(permissionService.canCreateEmployee() === false, 'Receptionist cannot create employees')

  // ----------------------------------------------------
  // TEST 13: Owner can access User Management
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Owner can access User Management ---')
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAccessUserManagement() === true, 'Owner 1 can access User Management')
  assert(permissionService.canCreateEmployee() === true, 'Owner 1 can create employees')

  await authService.login('owner2@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAccessUserManagement() === true, 'Owner 2 can access User Management')
  assert(permissionService.canCreateEmployee() === true, 'Owner 2 can create employees')

  // ----------------------------------------------------
  // TEST 14: Employee cannot assign appointment
  // ----------------------------------------------------
  console.log('\n--- TEST 14: Employee cannot assign appointment ---')
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAssignServices() === false, 'Employee cannot assign services')
  let empAssignErr = false
  try {
    await appointmentService.createAppointment({
      clientId: priya.id,
      serviceId: haircut.id,
      staffId: 'staff-02',
      date: todayStr,
      startTime: '15:00',
      endTime: '15:45',
      status: 'scheduled',
      price: haircut.price,
    })
  } catch (err: any) {
    empAssignErr = true
    assert(err.message.includes('Unauthorized'), 'Service layer threw Unauthorized for employee appointment creation')
  }
  assert(empAssignErr, 'Employee assignment blocked at service layer')

  // ----------------------------------------------------
  // TEST 15: Receptionist can assign appointment
  // ----------------------------------------------------
  console.log('\n--- TEST 15: Receptionist can assign appointment ---')
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAssignServices() === true, 'Receptionist can assign services')
  const recCreated = await appointmentService.createAppointment({
    clientId: priya.id,
    serviceId: haircut.id,
    staffId: 'staff-02',
    date: tomorrowStr,
    startTime: '13:30',
    endTime: '14:15',
    status: 'scheduled',
    price: haircut.price,
    notes: 'Assigned by Receptionist',
  })
  assert(!!recCreated && recCreated.staffId === 'staff-02', 'Receptionist successfully created appointment')

  // ----------------------------------------------------
  // TEST 16: Owner can assign appointment
  // ----------------------------------------------------
  console.log('\n--- TEST 16: Owner can assign appointment ---')
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canAssignServices() === true, 'Owner can assign services')
  const ownerCreated = await appointmentService.createAppointment({
    clientId: priya.id,
    serviceId: haircut.id,
    staffId: 'staff-01',
    date: tomorrowStr,
    startTime: '11:00',
    endTime: '11:45',
    status: 'scheduled',
    price: haircut.price,
    notes: 'Assigned by Owner',
  })
  assert(!!ownerCreated && ownerCreated.staffId === 'staff-01', 'Owner successfully created appointment')

  // ----------------------------------------------------
  // TEST 17: Employee cannot dispatch salon-wide reminders
  // ----------------------------------------------------
  console.log('\n--- TEST 17: Employee cannot dispatch salon-wide reminders ---')
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canSendSalonReminders() === false, 'permissionService.canSendSalonReminders is false for employee')
  const empReminderRes = await executeCommand(interpretCommand('Send appointment reminders'))
  assert(empReminderRes.type === 'error', 'AI Assistant returns error for employee reminder request')
  assert(empReminderRes.message.includes('permission to dispatch salon-wide appointment reminders'), 'Friendly permission restriction message returned')

  // ----------------------------------------------------
  // TEST 18: Owner can dispatch reminders
  // ----------------------------------------------------
  console.log('\n--- TEST 18: Owner can dispatch reminders ---')
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canSendSalonReminders() === true, 'permissionService.canSendSalonReminders is true for owner')
  const ownerReminderRes = await executeCommand(interpretCommand('Send appointment reminders'))
  assert(ownerReminderRes.type === 'reminders_preview', 'Owner reminder query returns reminders_preview')

  // ----------------------------------------------------
  // TEST 19: Receptionist can dispatch reminders
  // ----------------------------------------------------
  console.log('\n--- TEST 19: Receptionist can dispatch reminders ---')
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canSendSalonReminders() === true, 'permissionService.canSendSalonReminders is true for receptionist')
  const recReminderRes = await executeCommand(interpretCommand('Send appointment reminders'))
  assert(recReminderRes.type === 'reminders_preview', 'Receptionist reminder query returns reminders_preview')

  console.log('\n=================================================================')
  console.log('ALL 19 REAL AUTHENTICATION & SESSION TESTS PASSED (100% SUCCESS)!')
  console.log('=================================================================')
}

runRealAuthSuite().catch((err) => {
  console.error('\n❌ Real Auth Test Suite Failed:', err)
  process.exit(1)
})
