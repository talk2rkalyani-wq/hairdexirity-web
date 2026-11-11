import { authService } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { permissionService } from '../src/services/permissionService'
import { userService } from '../src/services/userService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { staffService } from '../src/services/staffService'
import { appointmentStore, isAppointmentBlocking } from '../src/services/appointmentStore'
import { appointmentService } from '../src/services/appointmentService'
import { credentialService, DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import { getSalonDateStr, getSalonTimeStr, timeToMinutes, calculateEndTime } from '../src/utils/formatters'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'

// Setup Node in-memory localStorage mock for isolated test execution
if (typeof (globalThis as any).window === 'undefined') {
  const store = new Map<string, string>()
  ;(globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) || null,
      setItem: (key: string, val: string) => store.set(key, val),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { hash: '' },
    history: { replaceState: () => {} },
  }
}
;(globalThis as any).localStorage = (globalThis as any).window.localStorage

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhase12_1_1_ProtectionSuite() {
  console.log('=================================================================')
  console.log('PHASE 12.1.1 AUTOMATED VERIFICATION SUITE: DELETION PROTECTION')
  console.log('=================================================================\n')

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)
  const yesterdayStr = getSalonDateStr(-1)
  const currentTimeStr = getSalonTimeStr()
  console.log(`Salon Date (Asia/Kolkata): ${todayStr}`)
  console.log(`Salon Time (Asia/Kolkata): ${currentTimeStr}`)
  console.log(`Tomorrow: ${tomorrowStr}, Yesterday: ${yesterdayStr}\n`)

  // Baseline Reset
  await credentialService.resetToBaseline()
  userService.resetToMock()
  clientService.resetToMock()
  serviceService.resetToMock()
  staffService.resetToMock()
  appointmentStore.resetToMock()
  authService.logout()

  // Authenticate as Owner
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const ownerSession = sessionService.getCurrentSession()
  assert(ownerSession?.role === 'OWNER', 'Owner authenticated successfully')

  // ----------------------------------------------------
  // TEST 1: Client with future confirmed appointment -> deletion blocked
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Client with future confirmed appointment -> deletion blocked ---')
  const client1 = await clientService.createClient({
    name: 'Future Client 1',
    email: 'future1@example.com',
    phone: '+91 99111 00001',
    notes: 'Has a confirmed appointment tomorrow',
  })
  const apt1 = await appointmentService.createAppointment({
    clientId: client1.id,
    serviceId: 'srv-01',
    staffId: 'staff-01',
    date: tomorrowStr,
    startTime: '11:00',
    endTime: '11:45',
    status: 'confirmed',
    price: 600,
  })
  assert(isAppointmentBlocking(apt1, todayStr, currentTimeStr), 'Appointment 1 is detected as blocking')
  assert(appointmentStore.hasBlockingAppointmentsForClient(client1.id), 'Client 1 has blocking appointment')

  let err1: string | null = null
  try {
    await clientService.deleteClient(client1.id)
  } catch (e: any) {
    err1 = e.message
  }
  assert(
    err1 === 'Cannot delete this client because an upcoming or active appointment exists for this client.',
    `Client 1 deletion blocked with exact message: "${err1}"`
  )
  assert(!!(await clientService.getClientById(client1.id)), 'Client 1 safely preserved')

  // ----------------------------------------------------
  // TEST 2: Client with in-progress appointment -> deletion blocked
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Client with in-progress appointment -> deletion blocked ---')
  const client2 = await clientService.createClient({
    name: 'InProgress Client 2',
    email: 'inprogress2@example.com',
    phone: '+91 99111 00002',
    notes: 'Currently undergoing appointment',
  })
  // Create an appointment today where startTime is 10 mins ago and endTime is 30 mins in future
  const currentMins = timeToMinutes(currentTimeStr)
  const startMins = Math.max(0, currentMins - 10)
  const endMins = currentMins + 30
  const startStr = `${String(Math.floor(startMins / 60)).padStart(2, '0')}:${String(startMins % 60).padStart(2, '0')}`
  const endStr = `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`

  const apt2 = appointmentStore.add({
    id: `apt-inprogress-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: client2.id,
    staffId: 'staff-02',
    serviceId: 'srv-01',
    date: todayStr,
    startTime: startStr,
    endTime: endStr,
    status: 'confirmed',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  assert(isAppointmentBlocking(apt2, todayStr, currentTimeStr), 'In-progress appointment is detected as blocking')
  assert(appointmentStore.hasBlockingAppointmentsForClient(client2.id), 'Client 2 has blocking appointment')

  let err2: string | null = null
  try {
    await clientService.deleteClient(client2.id)
  } catch (e: any) {
    err2 = e.message
  }
  assert(
    err2 === 'Cannot delete this client because an upcoming or active appointment exists for this client.',
    `Client 2 deletion blocked with exact message: "${err2}"`
  )
  assert(!!(await clientService.getClientById(client2.id)), 'Client 2 safely preserved')

  // ----------------------------------------------------
  // TEST 3: Client with only completed appointments -> deletion allowed
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Client with only completed appointments -> deletion allowed ---')
  const client3 = await clientService.createClient({
    name: 'Completed Client 3',
    email: 'completed3@example.com',
    phone: '+91 99111 00003',
  })
  const apt3 = appointmentStore.add({
    id: `apt-completed-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: client3.id,
    staffId: 'staff-01',
    serviceId: 'srv-01',
    date: yesterdayStr,
    startTime: '10:00',
    endTime: '10:45',
    status: 'completed',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  assert(!isAppointmentBlocking(apt3, todayStr, currentTimeStr), 'Completed appointment is NOT blocking')
  assert(!appointmentStore.hasBlockingAppointmentsForClient(client3.id), 'Client 3 has NO blocking appointments')

  const del3Res = await clientService.deleteClient(client3.id)
  assert(del3Res === true, 'Client 3 deleted successfully')
  assert((await clientService.getClientById(client3.id)) === null, 'Client 3 absent from clientService')

  // ----------------------------------------------------
  // TEST 4: Client with only cancelled appointments -> deletion allowed
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Client with only cancelled appointments -> deletion allowed ---')
  const client4 = await clientService.createClient({
    name: 'Cancelled Client 4',
    email: 'cancelled4@example.com',
    phone: '+91 99111 00004',
  })
  const apt4 = appointmentStore.add({
    id: `apt-cancelled-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: client4.id,
    staffId: 'staff-01',
    serviceId: 'srv-01',
    date: tomorrowStr,
    startTime: '14:00',
    endTime: '14:45',
    status: 'cancelled',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  assert(!isAppointmentBlocking(apt4, todayStr, currentTimeStr), 'Cancelled future appointment is NOT blocking')
  assert(!appointmentStore.hasBlockingAppointmentsForClient(client4.id), 'Client 4 has NO blocking appointments')

  const del4Res = await clientService.deleteClient(client4.id)
  assert(del4Res === true, 'Client 4 deleted successfully')
  assert((await clientService.getClientById(client4.id)) === null, 'Client 4 absent from clientService')

  // ----------------------------------------------------
  // TEST 5: Service with future active appointment -> deletion blocked
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Service with future active appointment -> deletion blocked ---')
  const service5 = await serviceService.createService({
    name: 'Future Service 5',
    category: 'haircut',
    price: 900,
    duration: 50,
    description: 'Upcoming booked service',
    active: true,
  })
  const apt5 = appointmentStore.add({
    id: `apt-srv5-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-01',
    staffId: 'staff-01',
    serviceId: service5.id,
    date: tomorrowStr,
    startTime: '16:00',
    endTime: '16:50',
    status: 'scheduled',
    price: 900,
    createdAt: new Date().toISOString(),
  })
  assert(isAppointmentBlocking(apt5, todayStr, currentTimeStr), 'Appointment 5 is detected as blocking')
  assert(appointmentStore.hasBlockingAppointmentsForService(service5.id), 'Service 5 has blocking appointments')

  let err5: string | null = null
  try {
    await serviceService.deleteService(service5.id)
  } catch (e: any) {
    err5 = e.message
  }
  assert(
    err5 === 'Cannot delete this service because an upcoming or active appointment exists for this service.',
    `Service 5 deletion blocked with exact message: "${err5}"`
  )
  assert(!!(await serviceService.getServiceById(service5.id)), 'Service 5 safely preserved')

  // ----------------------------------------------------
  // TEST 6: Service with only historical appointments -> deletion allowed
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Service with only historical appointments -> deletion allowed ---')
  const service6 = await serviceService.createService({
    name: 'Historical Service 6',
    category: 'styling',
    price: 550,
    duration: 30,
    description: 'Only past appointments exist',
    active: true,
  })
  appointmentStore.add({
    id: `apt-srv6-completed-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-01',
    staffId: 'staff-01',
    serviceId: service6.id,
    date: yesterdayStr,
    startTime: '12:00',
    endTime: '12:30',
    status: 'completed',
    price: 550,
    createdAt: new Date().toISOString(),
  })
  appointmentStore.add({
    id: `apt-srv6-cancelled-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-02',
    staffId: 'staff-02',
    serviceId: service6.id,
    date: yesterdayStr,
    startTime: '14:00',
    endTime: '14:30',
    status: 'cancelled',
    price: 550,
    createdAt: new Date().toISOString(),
  })
  assert(!appointmentStore.hasBlockingAppointmentsForService(service6.id), 'Service 6 has NO blocking appointments')

  const del6Res = await serviceService.deleteService(service6.id)
  assert(del6Res === true, 'Service 6 deleted successfully')
  assert((await serviceService.getServiceById(service6.id)) === null, 'Service 6 absent from serviceService')

  // ----------------------------------------------------
  // TEST 7: Employee with future active appointment -> deletion blocked
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Employee with future active appointment -> deletion blocked ---')
  const emp7 = await userService.createUser({
    name: 'Stylist Seven',
    email: 'seven@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Hair',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  const apt7 = appointmentStore.add({
    id: `apt-emp7-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-01',
    staffId: emp7.employeeId!,
    serviceId: 'srv-01',
    date: tomorrowStr,
    startTime: '15:00',
    endTime: '15:45',
    status: 'confirmed',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  assert(appointmentStore.hasBlockingAppointmentsForStaff(emp7.employeeId!), 'Employee 7 has blocking appointment')

  let err7: string | null = null
  try {
    await userService.deleteUser(emp7.id)
  } catch (e: any) {
    err7 = e.message
  }
  assert(
    err7 === 'Cannot delete this employee because an upcoming or active appointment exists for this employee.',
    `Employee 7 deletion blocked with exact message: "${err7}"`
  )
  assert(!!(await userService.getUserById(emp7.id)), 'User 7 safely preserved')
  assert(!!(await staffService.getStaffById(emp7.employeeId!)), 'Staff 7 safely preserved')

  // Also test direct staffService.deleteStaff(emp7.employeeId!)
  let err7Staff: string | null = null
  try {
    await staffService.deleteStaff(emp7.employeeId!)
  } catch (e: any) {
    err7Staff = e.message
  }
  assert(
    err7Staff === 'Cannot delete this employee because an upcoming or active appointment exists for this employee.',
    `Direct staffService deletion blocked with exact message: "${err7Staff}"`
  )

  // ----------------------------------------------------
  // TEST 8: Employee with only historical appointments -> deletion allowed
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Employee with only historical appointments -> deletion allowed ---')
  const emp8 = await userService.createUser({
    name: 'Stylist Eight',
    email: 'eight@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Skin',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  appointmentStore.add({
    id: `apt-emp8-completed-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-01',
    staffId: emp8.employeeId!,
    serviceId: 'srv-01',
    date: yesterdayStr,
    startTime: '10:00',
    endTime: '10:45',
    status: 'completed',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  assert(!appointmentStore.hasBlockingAppointmentsForStaff(emp8.employeeId!), 'Employee 8 has NO blocking appointments')

  const del8Res = await userService.deleteUser(emp8.id)
  assert(del8Res === true, 'Employee 8 deleted successfully')
  assert((await userService.getUserById(emp8.id)) === null, 'Employee 8 absent from userService')
  assert((await staffService.getStaffById(emp8.employeeId!)) === null, 'Linked staff absent from staffService')

  // ----------------------------------------------------
  // TEST 9: User account linked to employee with future active appointment -> deletion blocked
  // ----------------------------------------------------
  console.log('\n--- TEST 9: User account linked to employee with future appointment -> deletion blocked ---')
  const emp9 = await userService.createUser({
    name: 'Stylist Nine',
    email: 'nine@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Nail',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  appointmentStore.add({
    id: `apt-emp9-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: 'cli-02',
    staffId: emp9.employeeId!,
    serviceId: 'srv-01',
    date: tomorrowStr,
    startTime: '10:00',
    endTime: '10:45',
    status: 'scheduled',
    price: 600,
    createdAt: new Date().toISOString(),
  })

  let err9: string | null = null
  try {
    await userService.deleteUser(emp9.id)
  } catch (e: any) {
    err9 = e.message
  }
  assert(
    err9 === 'Cannot delete this employee because an upcoming or active appointment exists for this employee.',
    `User 9 deletion blocked with exact message: "${err9}"`
  )
  assert(!!(await userService.getUserById(emp9.id)), 'User 9 safely preserved')

  // ----------------------------------------------------
  // TEST 10: Bulk deletion containing one protected record -> entire operation rejected atomically
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Bulk deletion containing one protected record -> atomic rejection ---')
  const cleanClient10A = await clientService.createClient({
    name: 'Clean Client 10A',
    email: 'clean10a@example.com',
    phone: '+91 99111 00010',
  })
  const protectedClient10B = await clientService.createClient({
    name: 'Protected Client 10B',
    email: 'protected10b@example.com',
    phone: '+91 99111 00011',
  })
  appointmentStore.add({
    id: `apt-client10b-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: protectedClient10B.id,
    staffId: 'staff-01',
    serviceId: 'srv-01',
    date: tomorrowStr,
    startTime: '13:00',
    endTime: '13:45',
    status: 'confirmed',
    price: 600,
    createdAt: new Date().toISOString(),
  })
  const cleanClient10C = await clientService.createClient({
    name: 'Clean Client 10C',
    email: 'clean10c@example.com',
    phone: '+91 99111 00012',
  })

  let bulkErr10: string | null = null
  try {
    await clientService.deleteClients([cleanClient10A.id, protectedClient10B.id, cleanClient10C.id])
  } catch (e: any) {
    bulkErr10 = e.message
  }
  assert(
    bulkErr10?.includes('Cannot delete clients because upcoming or active appointments exist for: Protected Client 10B'),
    `Bulk client delete rejected with exact protected entity name: "${bulkErr10}"`
  )
  // Verify 0 records were deleted (atomic rollback)
  assert(!!(await clientService.getClientById(cleanClient10A.id)), 'Clean Client 10A preserved (atomic guarantee)')
  assert(!!(await clientService.getClientById(protectedClient10B.id)), 'Protected Client 10B preserved')
  assert(!!(await clientService.getClientById(cleanClient10C.id)), 'Clean Client 10C preserved (atomic guarantee)')

  // ----------------------------------------------------
  // TEST 11: Bulk deletion of records with historical appointments only -> succeeds
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Bulk deletion of records with historical appointments only -> succeeds ---')
  const histClient11A = await clientService.createClient({
    name: 'Historical Client 11A',
    email: 'hist11a@example.com',
    phone: '+91 99111 00021',
  })
  appointmentStore.add({
    id: `apt-hist11a-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: histClient11A.id,
    staffId: 'staff-01',
    serviceId: 'srv-01',
    date: yesterdayStr,
    startTime: '09:00',
    endTime: '09:45',
    status: 'completed',
    price: 600,
    createdAt: new Date().toISOString(),
  })

  const histClient11B = await clientService.createClient({
    name: 'Historical Client 11B',
    email: 'hist11b@example.com',
    phone: '+91 99111 00022',
  })
  appointmentStore.add({
    id: `apt-hist11b-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: histClient11B.id,
    staffId: 'staff-02',
    serviceId: 'srv-01',
    date: yesterdayStr,
    startTime: '10:00',
    endTime: '10:45',
    status: 'cancelled',
    price: 600,
    createdAt: new Date().toISOString(),
  })

  const histClient11C = await clientService.createClient({
    name: 'Historical Client 11C',
    email: 'hist11c@example.com',
    phone: '+91 99111 00023',
  })
  appointmentStore.add({
    id: `apt-hist11c-${Date.now()}`,
    salonId: 'salon-luma-01',
    clientId: histClient11C.id,
    staffId: 'staff-03',
    serviceId: 'srv-01',
    date: yesterdayStr,
    startTime: '11:00',
    endTime: '11:45',
    status: 'no-show',
    price: 600,
    createdAt: new Date().toISOString(),
  })

  const bulk11Res = await clientService.deleteClients([histClient11A.id, histClient11B.id, histClient11C.id])
  assert(bulk11Res.deletedCount === 3, 'Bulk delete removed all 3 historical-only clients')
  assert((await clientService.getClientById(histClient11A.id)) === null, 'Client 11A removed')
  assert((await clientService.getClientById(histClient11B.id)) === null, 'Client 11B removed')
  assert((await clientService.getClientById(histClient11C.id)) === null, 'Client 11C removed')

  // ----------------------------------------------------
  // TEST 12: Refresh after successful deletion -> deleted records remain deleted
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Refresh after successful deletion -> records remain deleted ---')
  clientService.reloadFromStorage()
  serviceService.reloadFromStorage()
  userService.reloadFromStorage()
  staffService.reloadFromStorage()
  appointmentStore.reloadFromStorage()

  assert((await clientService.getClientById(histClient11A.id)) === null, 'Client 11A remains deleted after reloadFromStorage')
  assert((await clientService.getClientById(histClient11B.id)) === null, 'Client 11B remains deleted after reloadFromStorage')
  assert((await serviceService.getServiceById(service6.id)) === null, 'Service 6 remains deleted after reloadFromStorage')
  assert((await userService.getUserById(emp8.id)) === null, 'Employee 8 remains deleted after reloadFromStorage')

  // ----------------------------------------------------
  // TEST 13: Calendar & Historical Snapshot Integrity
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Calendar & Historical Snapshot Integrity ---')
  // Verify that the historical appointments for deleted clients 11A, 11B, 11C and service 6
  // retain their actual human-readable names and do NOT fall back to generic "Archived Client"
  const enrichedYesterday = await appointmentService.getEnrichedAppointmentsForDate(yesterdayStr)
  assert(enrichedYesterday.length > 0, 'Yesterday has appointments in calendar')

  const apt11AEnriched = enrichedYesterday.find((a) => a.id === `apt-hist11a-${Date.now()}`.split('-')[0] || a.clientId === histClient11A.id)
  assert(!!apt11AEnriched, 'Historical appointment for Client 11A exists in calendar')
  assert(apt11AEnriched.client?.name === 'Historical Client 11A', `Client name preserved via snapshot: "${apt11AEnriched.client?.name}"`)

  const aptSrv6Enriched = enrichedYesterday.find((a) => a.serviceId === service6.id)
  assert(!!aptSrv6Enriched, 'Historical appointment for Service 6 exists in calendar')
  assert(aptSrv6Enriched.service?.name === 'Historical Service 6', `Service name preserved via snapshot: "${aptSrv6Enriched.service?.name}"`)

  // Verify future appointment retains live references
  const enrichedTomorrow = await appointmentService.getEnrichedAppointmentsForDate(tomorrowStr)
  const apt1Enriched = enrichedTomorrow.find((a) => a.clientId === client1.id)
  assert(!!apt1Enriched, 'Future appointment exists in calendar')
  assert(apt1Enriched.client?.name === 'Future Client 1', 'Future appointment references active client profile')

  // ----------------------------------------------------
  // TEST 14: Owner permissions & Last Owner Protection
  // ----------------------------------------------------
  console.log('\n--- TEST 14: Owner permissions & Last Owner Protection ---')
  // Non-owner deletion rejection
  authService.logout()
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const recSession = sessionService.getCurrentSession()
  assert(!permissionService.canDeleteClient(recSession), 'Receptionist cannot delete clients')
  assert(!permissionService.canDeleteService(recSession), 'Receptionist cannot delete services')
  assert(!permissionService.canDeleteUser(recSession), 'Receptionist cannot delete users')

  let recDelErr: string | null = null
  try {
    await clientService.deleteClient(cleanClient10A.id)
  } catch (e: any) {
    recDelErr = e.message
  }
  assert(recDelErr?.includes('Forbidden'), `Receptionist client delete rejected with Forbidden: "${recDelErr}"`)

  // Log back in as Owner
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)

  // Last Owner protection check
  await userService.deleteUser('user-owner-02')
  let lastOwnerErr: string | null = null
  try {
    await userService.deleteUser('user-owner-01')
  } catch (e: any) {
    lastOwnerErr = e.message
  }
  assert(
    lastOwnerErr === 'Cannot delete the last owner account.',
    `Last owner deletion blocked with error: "${lastOwnerErr}"`
  )

  // ----------------------------------------------------
  // TEST 15: AI booking, reminders, authentication, and employee data isolation regression
  // ----------------------------------------------------
  console.log('\n--- TEST 15: Regressions Suite (AI, Reminders, RBAC, Data Isolation) ---')
  // AI assistant: check today's bookings
  const cmdBookings = interpretCommand("Show today's bookings")
  assert(cmdBookings.intent === 'SHOW_TODAY_BOOKINGS', 'AI SHOW_TODAY_BOOKINGS intent works')
  const resBookings = await executeCommand(cmdBookings)
  assert(resBookings.type === 'appointment_list' || resBookings.type === 'empty', 'AI returned appointment response')

  // AI assistant: find available stylist
  const cmdAvail = interpretCommand('Find an available stylist for balayage at 4 PM')
  const resAvail = await executeCommand(cmdAvail)
  assert(resAvail.type === 'availability_results', 'AI FIND_AVAILABLE_STYLIST intent works')
  assert(resAvail.availabilityResults?.availableStylists.length! > 0, 'AI found available stylists')

  // AI assistant: send appointment reminders
  const cmdReminders = interpretCommand('Send appointment reminders')
  const resReminders = await executeCommand(cmdReminders)
  assert(resReminders.type === 'reminders_preview', 'AI SEND_APPOINTMENT_REMINDERS preview works')
  assert(resReminders.pendingReminders?.items.length! > 0, 'AI prepared reminder batch')

  // Employee data isolation check
  authService.logout()
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const rohanSession = sessionService.getCurrentSession()
  assert(rohanSession?.role === 'EMPLOYEE', 'Rohan logged in as EMPLOYEE')
  const rohanApts = await appointmentService.getAppointments()
  const allRohan = rohanApts.every((a) => a.staffId === 'staff-02' || (a as any).assignedEmployeeId === 'staff-02')
  assert(allRohan, 'Rohan only sees his own assigned appointments (Employee Isolation Enforced)')

  console.log('\n=================================================================')
  console.log('🎉 ALL 15 PHASE 12.1.1 VERIFICATION TESTS PASSED SUCCESSFULLY!')
  console.log('=================================================================\n')
}

runPhase12_1_1_ProtectionSuite().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err)
  process.exit(1)
})
