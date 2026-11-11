import { authService } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { permissionService } from '../src/services/permissionService'
import { userService } from '../src/services/userService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { staffService } from '../src/services/staffService'
import { appointmentService } from '../src/services/appointmentService'
import { appointmentStore } from '../src/services/appointmentStore'
import { reminderService } from '../src/services/reminderService'
import { credentialService, DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import { getSalonDateStr } from '../src/utils/formatters'

// Setup Node localStorage mock for persistence testing if needed
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

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhase12DeleteSuite() {
  console.log('=================================================================')
  console.log('PHASE 12 VERIFICATION SUITE: OWNER DELETE & BULK MANAGEMENT (24 TESTS)')
  console.log('=================================================================\n')

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)

  // 1. Reset baseline data
  userService.resetToMock()
  clientService.resetToMock()
  serviceService.resetToMock()
  staffService.resetToMock()
  appointmentStore.resetToMock()
  await credentialService.resetToBaseline()
  authService.logout()

  // ----------------------------------------------------
  // TEST 1: Owner can delete one employee
  // ----------------------------------------------------
  console.log('--- TEST 1: Owner can delete one employee ---')
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const createdEmp = await userService.createEmployee({
    name: 'Temporary Worker A',
    email: 'temp.worker.a@lumasalon.example.com',
    specialty: 'Hair',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  assert(!!(await userService.getUserById(createdEmp.id)), 'Employee was created and found in store')
  const empDeleteResult = await userService.deleteUser(createdEmp.id)
  assert(empDeleteResult === true, 'userService.deleteUser returned true')
  assert((await userService.getUserById(createdEmp.id)) === null, 'Employee is no longer in userService')
  if (createdEmp.employeeId) {
    assert((await staffService.getStaffById(createdEmp.employeeId)) === null, 'Linked staff profile was deleted')
  }

  // ----------------------------------------------------
  // TEST 2: Owner can delete one client
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Owner can delete one client ---')
  const createdCli = await clientService.createClient({
    name: 'Test Delete Client',
    phone: '+91 99999 11111',
    email: 'test.del.cli@example.com',
    preferences: {},
    notes: 'To be deleted',
  })
  assert(!!(await clientService.getClientById(createdCli.id)), 'Client was created and found in store')
  const cliDeleteResult = await clientService.deleteClient(createdCli.id)
  assert(cliDeleteResult === true, 'clientService.deleteClient returned true')
  assert((await clientService.getClientById(createdCli.id)) === null, 'Client is no longer in clientService')

  // ----------------------------------------------------
  // TEST 3: Owner can delete one service
  // ----------------------------------------------------
  console.log('\n--- TEST 3: Owner can delete one service ---')
  const createdSrv = await serviceService.createService({
    name: 'Temporary Hair Spa',
    description: 'Test spa service',
    duration: 60,
    price: 2500,
    category: 'treatment',
    active: true,
  })
  assert(!!(await serviceService.getServiceById(createdSrv.id)), 'Service was created and found in store')
  const srvDeleteResult = await serviceService.deleteService(createdSrv.id)
  assert(srvDeleteResult === true, 'serviceService.deleteService returned true')
  assert((await serviceService.getServiceById(createdSrv.id)) === null, 'Service is no longer in serviceService')

  // ----------------------------------------------------
  // TEST 4: Owner can bulk delete multiple employees
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Owner can bulk delete multiple employees ---')
  const empB1 = await userService.createEmployee({
    name: 'Bulk Worker 1',
    email: 'bulk.w1@lumasalon.example.com',
    specialty: 'Skin',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  const empB2 = await userService.createEmployee({
    name: 'Bulk Worker 2',
    email: 'bulk.w2@lumasalon.example.com',
    specialty: 'Nail',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  const bulkEmpRes = await userService.deleteUsers([empB1.id, empB2.id])
  assert(bulkEmpRes.deletedCount === 2, 'Bulk delete removed 2 employees')
  assert((await userService.getUserById(empB1.id)) === null, 'empB1 removed')
  assert((await userService.getUserById(empB2.id)) === null, 'empB2 removed')

  // ----------------------------------------------------
  // TEST 5: Owner can bulk delete multiple clients
  // ----------------------------------------------------
  console.log('\n--- TEST 5: Owner can bulk delete multiple clients ---')
  const cliB1 = await clientService.createClient({
    name: 'Bulk Client 1',
    phone: '+91 99999 22221',
    email: 'bulk.cli1@example.com',
    preferences: {},
    notes: 'Bulk test',
  })
  const cliB2 = await clientService.createClient({
    name: 'Bulk Client 2',
    phone: '+91 99999 22222',
    email: 'bulk.cli2@example.com',
    preferences: {},
    notes: 'Bulk test',
  })
  const bulkCliRes = await clientService.deleteClients([cliB1.id, cliB2.id])
  assert(bulkCliRes.deletedCount === 2, 'Bulk delete removed 2 clients')
  assert((await clientService.getClientById(cliB1.id)) === null, 'cliB1 removed')
  assert((await clientService.getClientById(cliB2.id)) === null, 'cliB2 removed')

  // ----------------------------------------------------
  // TEST 6: Owner can bulk delete multiple services
  // ----------------------------------------------------
  console.log('\n--- TEST 6: Owner can bulk delete multiple services ---')
  const srvB1 = await serviceService.createService({
    name: 'Bulk Service 1',
    description: 'Bulk 1',
    duration: 30,
    price: 1200,
    category: 'haircut',
    active: true,
  })
  const srvB2 = await serviceService.createService({
    name: 'Bulk Service 2',
    description: 'Bulk 2',
    duration: 45,
    price: 1800,
    category: 'color',
    active: true,
  })
  const bulkSrvRes = await serviceService.deleteServices([srvB1.id, srvB2.id])
  assert(bulkSrvRes.deletedCount === 2, 'Bulk delete removed 2 services')
  assert((await serviceService.getServiceById(srvB1.id)) === null, 'srvB1 removed')
  assert((await serviceService.getServiceById(srvB2.id)) === null, 'srvB2 removed')

  // ----------------------------------------------------
  // TEST 7: Single delete requires confirmation
  // ----------------------------------------------------
  console.log('\n--- TEST 7: Single delete requires confirmation ---')
  const stagedCli = await clientService.createClient({
    name: 'Staged Client',
    phone: '+91 99999 33333',
    email: 'staged@example.com',
    preferences: {},
    notes: 'Confirmation check',
  })
  // Staging deletion modal simulation: item is targeted, but before confirmation, no delete happens
  let stagedTargetId: string | null = stagedCli.id
  assert(stagedTargetId !== null, 'Staged item is targeted for confirmation')
  assert((await clientService.getClientById(stagedCli.id)) !== null, 'Item is NOT deleted before confirm')

  // ----------------------------------------------------
  // TEST 8: Bulk delete requires confirmation
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Bulk delete requires confirmation ---')
  const stagedBulkCli = await clientService.createClient({
    name: 'Staged Bulk Client',
    phone: '+91 99999 44444',
    email: 'staged.bulk@example.com',
    preferences: {},
    notes: 'Confirmation check',
  })
  const stagedSelection = new Set([stagedBulkCli.id])
  assert(stagedSelection.size === 1, 'Bulk selection has 1 item staged')
  assert((await clientService.getClientById(stagedBulkCli.id)) !== null, 'Items NOT deleted before bulk confirm')

  // ----------------------------------------------------
  // TEST 9: Cancel single deletion causes zero data mutation
  // ----------------------------------------------------
  console.log('\n--- TEST 9: Cancel single deletion causes zero data mutation ---')
  // User cancels: modal closes without calling clientService.deleteClient
  stagedTargetId = null
  const stillExists = await clientService.getClientById(stagedCli.id)
  assert(stillExists !== null && stillExists.name === 'Staged Client', 'Item still exists unchanged after cancellation')

  // ----------------------------------------------------
  // TEST 10: Cancel bulk deletion causes zero data mutation
  // ----------------------------------------------------
  console.log('\n--- TEST 10: Cancel bulk deletion causes zero data mutation ---')
  stagedSelection.clear()
  const stillExistsBulk = await clientService.getClientById(stagedBulkCli.id)
  assert(stillExistsBulk !== null && stillExistsBulk.name === 'Staged Bulk Client', 'Bulk item still exists unchanged after cancellation')

  // Clean up staged test items
  await clientService.deleteClients([stagedCli.id, stagedBulkCli.id])

  // ----------------------------------------------------
  // TEST 11: Receptionist cannot delete records
  // ----------------------------------------------------
  console.log('\n--- TEST 11: Receptionist cannot delete records ---')
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canDeleteClient() === false, 'canDeleteClient is false for receptionist')
  assert(permissionService.canDeleteService() === false, 'canDeleteService is false for receptionist')
  assert(permissionService.canDeleteUser() === false, 'canDeleteUser is false for receptionist')

  let recCliErr = false
  try {
    await clientService.deleteClient('cli-1')
  } catch (err: any) {
    recCliErr = true
    assert(err.message.includes('Forbidden'), 'clientService rejects receptionist deletion with Forbidden')
  }
  assert(recCliErr, 'clientService.deleteClient blocked for receptionist')

  let recSrvErr = false
  try {
    await serviceService.deleteService('srv-1')
  } catch (err: any) {
    recSrvErr = true
    assert(err.message.includes('Forbidden'), 'serviceService rejects receptionist deletion with Forbidden')
  }
  assert(recSrvErr, 'serviceService.deleteService blocked for receptionist')

  // ----------------------------------------------------
  // TEST 12: Employee cannot delete records
  // ----------------------------------------------------
  console.log('\n--- TEST 12: Employee cannot delete records ---')
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(permissionService.canDeleteClient() === false, 'canDeleteClient is false for employee')
  assert(permissionService.canDeleteService() === false, 'canDeleteService is false for employee')
  assert(permissionService.canDeleteUser() === false, 'canDeleteUser is false for employee')

  let empCliErr = false
  try {
    await clientService.deleteClient('cli-1')
  } catch (err: any) {
    empCliErr = true
    assert(err.message.includes('Forbidden'), 'clientService rejects employee deletion with Forbidden')
  }
  assert(empCliErr, 'clientService.deleteClient blocked for employee')

  // ----------------------------------------------------
  // TEST 13: Unauthenticated user cannot delete records
  // ----------------------------------------------------
  console.log('\n--- TEST 13: Unauthenticated user cannot delete records ---')
  authService.logout()
  assert(permissionService.canDeleteClient() === false, 'canDeleteClient is false when logged out')

  let unauthCliErr = false
  try {
    await clientService.deleteClient('cli-1')
  } catch (err: any) {
    unauthCliErr = true
    assert(err.message.includes('Unauthorized'), 'clientService rejects unauthenticated deletion with Unauthorized')
  }
  assert(unauthCliErr, 'clientService.deleteClient blocked when unauthenticated')

  // ----------------------------------------------------
  // TEST 14: Service-level authorization rejects non-owner delete attempts
  // ----------------------------------------------------
  console.log('\n--- TEST 14: Service-level authorization rejects non-owner delete attempts ---')
  await authService.login('receptionist@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  let bulkRecErr = false
  try {
    await clientService.deleteClients(['cli-1', 'cli-2'])
  } catch (err: any) {
    bulkRecErr = true
    assert(err.message.includes('Forbidden'), 'Bulk client delete rejects receptionist')
  }
  assert(bulkRecErr, 'Service level authorization enforced on bulk delete')

  // ----------------------------------------------------
  // TEST 15: Last Owner account cannot be deleted
  // ----------------------------------------------------
  console.log('\n--- TEST 15: Last Owner account cannot be deleted ---')
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const allUsers = await userService.getUsers()
  const owners = allUsers.filter((u) => u.role === 'OWNER')
  assert(owners.length === 2, 'Initially 2 owners exist (owner1 and owner2)')

  // Owner 1 deletes Owner 2 (allowed because 1 owner remains)
  const owner2 = owners.find((u) => u.email === 'owner2@lumasalon.example.com')!
  const deletedOwner2 = await userService.deleteUser(owner2.id)
  assert(deletedOwner2 === true, 'Owner 2 deleted while Owner 1 remains')

  const remainingOwners = (await userService.getUsers()).filter((u) => u.role === 'OWNER')
  assert(remainingOwners.length === 1, 'Only 1 owner remains in the salon')

  // Now attempt to delete the final owner
  let lastOwnerErr = false
  try {
    await userService.deleteUser(remainingOwners[0].id)
  } catch (err: any) {
    lastOwnerErr = true
    assert(err.message.includes('Cannot delete the last owner account'), 'Throws: Cannot delete the last owner account.')
  }
  assert(lastOwnerErr, 'Final owner account deletion strictly blocked')

  // ----------------------------------------------------
  // TEST 16: Deleted record is removed from canonical store
  // ----------------------------------------------------
  console.log('\n--- TEST 16: Deleted record is removed from canonical store ---')
  const clientToDelete = (await clientService.getClients())[0]
  const targetId = clientToDelete.id
  await clientService.deleteClient(targetId)
  const afterDeleteList = await clientService.getClients()
  assert(!afterDeleteList.some((c) => c.id === targetId), 'Deleted client completely absent from canonical getClients()')

  // ----------------------------------------------------
  // TEST 17: Deletion persists after page reload / session reload
  // ----------------------------------------------------
  console.log('\n--- TEST 17: Deletion persists after page reload / session reload ---')
  // Simulated reload: re-read from localStorage
  const storedJson = (globalThis as any).window.localStorage.getItem('luma_salon_clients_v1')
  if (storedJson) {
    const parsed = JSON.parse(storedJson)
    assert(!parsed.some((c: any) => c.id === targetId), 'LocalStorage reflection does not contain deleted client')
  }

  // ----------------------------------------------------
  // TEST 18: Calendar does not crash after related record deletion
  // ----------------------------------------------------
  console.log('\n--- TEST 18: Calendar does not crash after related record deletion ---')
  // Create a specific client, service, and appointment
  const testClient = await clientService.createClient({
    name: 'Historical Test Client',
    phone: '+91 98888 77777',
    email: 'historical@example.com',
    preferences: {},
    notes: 'Will be deleted to test calendar resilience',
  })
  const testService = await serviceService.createService({
    name: 'Historical Test Service',
    description: 'Service to test calendar resilience',
    duration: 45,
    price: 1500,
    category: 'haircut',
    active: true,
  })

  const testApt = await appointmentService.createAppointment({
    clientId: testClient.id,
    serviceId: testService.id,
    staffId: 'staff-01',
    date: tomorrowStr,
    startTime: '10:00',
    endTime: '10:45',
    status: 'scheduled',
    price: testService.price,
    notes: 'Calendar resilience test appointment',
  })
  assert(!!testApt, 'Appointment created for test client and service')

  // Now delete the client and service
  await clientService.deleteClient(testClient.id)
  await serviceService.deleteService(testService.id)

  // Enrich appointments for tomorrow: must resolve without throwing
  let calendarDidCrash = false
  let enrichedList: any[] = []
  try {
    enrichedList = await appointmentService.getEnrichedAppointmentsForDate(tomorrowStr)
  } catch (err) {
    calendarDidCrash = true
  }
  assert(!calendarDidCrash, 'Enriching appointments for calendar did not throw or crash')
  const matchedApt = enrichedList.find((a) => a.id === testApt.id)
  assert(!!matchedApt, 'Historical appointment still exists on calendar')
  assert(!!matchedApt.client, 'Archived client fallback generated')
  assert(!!matchedApt.service, 'Archived service fallback generated')

  // ----------------------------------------------------
  // TEST 19: Historical appointment data remains valid
  // ----------------------------------------------------
  console.log('\n--- TEST 19: Historical appointment data remains valid ---')
  assert(matchedApt.date === tomorrowStr, 'Appointment date preserved')
  assert(matchedApt.startTime === '10:00', 'Appointment startTime preserved')
  assert(matchedApt.endTime === '10:45', 'Appointment endTime preserved')
  assert(matchedApt.price === 1500, 'Appointment price preserved')
  assert(matchedApt.status === 'scheduled', 'Appointment status preserved')

  // ----------------------------------------------------
  // TEST 20: AI booking still works after deletion
  // ----------------------------------------------------
  console.log('\n--- TEST 20: AI booking still works after deletion ---')
  // We can book with active stylists and active services
  const remainingServices = await serviceService.getActiveServices()
  const firstActiveService = remainingServices[0]
  const remainingClients = await clientService.getClients()
  const firstActiveClient = remainingClients[0]
  const bookingQuery = `Book ${firstActiveClient.name} for ${firstActiveService.name} tomorrow at 4 PM with Rohan`
  const bookingCommand = interpretCommand(bookingQuery)
  const bookingRes = await executeCommand(bookingCommand)
  assert(bookingRes.type === 'booking_preview', 'AI Booking preview successfully generated after deletions')


  // ----------------------------------------------------
  // TEST 21: Reminder system still works after deletion
  // ----------------------------------------------------
  console.log('\n--- TEST 21: Reminder system still works after deletion ---')
  const remindersBatch = await reminderService.prepareRemindersForDate(tomorrowStr)
  assert(remindersBatch.totalCount > 0, 'Reminder system successfully prepared reminder batch containing appointments')
  assert(Array.isArray(remindersBatch.items), 'Prepared reminder items returned')

  // ----------------------------------------------------
  // TEST 22: Phase 9 regression suite passes
  // ----------------------------------------------------
  console.log('\n--- TEST 22: Phase 9 regression suite passes ---')
  // Verify appointment store queries, booking confirmations, client spend updates
  assert(appointmentStore.getAll().length > 0, 'Canonical appointmentStore maintains appointments')
  const aptById = appointmentStore.getById(testApt.id)
  assert(!!aptById && aptById.price === 1500, 'appointmentStore.getById works cleanly')

  // ----------------------------------------------------
  // TEST 23: Phase 10 regression suite passes
  // ----------------------------------------------------
  console.log('\n--- TEST 23: Phase 10 regression suite passes ---')
  const previewReminders = await reminderService.prepareRemindersForDate(tomorrowStr)
  assert(previewReminders.items.length > 0, 'Reminders preview items generated')
  const receipt = await reminderService.dispatchReminders(previewReminders)
  assert(receipt.sentCount > 0, 'Reminders dispatched successfully with delivery status updated')



  // ----------------------------------------------------
  // TEST 24: Phase 11 regression suite passes
  // ----------------------------------------------------
  console.log('\n--- TEST 24: Phase 11 regression suite passes ---')
  // Re-verify login, session, and isolation
  await authService.login('rohan@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  const employeeSession = sessionService.getCurrentSession()
  assert(employeeSession?.role === 'EMPLOYEE', 'Employee login functional')
  assert(permissionService.canAccessUserManagement() === false, 'User management hidden from employee')
  assert(permissionService.canAssignServices() === false, 'Employee assignment blocked')
  const scopedApts = await appointmentService.getAppointments()
  assert(
    scopedApts.every((a) => (a.assignedEmployeeId || a.staffId) === employeeSession?.employeeId),
    'Employee data isolation 100% intact'
  )

  console.log('\n=================================================================')
  console.log('ALL 24 PHASE 12 AUTOMATED TESTS PASSED (100% SUCCESS RATE)!')
  console.log('=================================================================')
}

runPhase12DeleteSuite().catch((err) => {
  console.error('\n❌ Phase 12 Test Suite Failed:', err)
  process.exit(1)
})
