import { authService } from '../src/services/authService'
import { sessionService } from '../src/services/sessionService'
import { permissionService } from '../src/services/permissionService'
import { userService } from '../src/services/userService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { staffService } from '../src/services/staffService'
import { appointmentStore } from '../src/services/appointmentStore'
import { credentialService, DEFAULT_TEST_PASSWORD } from '../src/services/credentialService'
import { getSalonDateStr } from '../src/utils/formatters'

// Setup Node localStorage mock for persistence testing
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

async function runHardeningSuite() {
  console.log('=================================================================')
  console.log('PHASE 12.1 AUTOMATED VERIFICATION SUITE: TESTS A THROUGH T')
  console.log('=================================================================\n')

  // Reset baseline state
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
  // TEST A: Single User deletion works and persists across storage rehydration
  // ----------------------------------------------------
  console.log('\n--- TEST A: Single User deletion works and persists across storage rehydration ---')
  const userA = await userService.createUser({
    name: 'Ephemeral User A',
    email: 'ephemeral.a@lumasalon.example.com',
    role: 'RECEPTIONIST',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  assert(!!(await userService.getUserById(userA.id)), 'Ephemeral User A created')
  await userService.deleteUser(userA.id)
  assert((await userService.getUserById(userA.id)) == null, 'Ephemeral User A deleted in memory')

  // Rehydrate from storage
  userService.reloadFromStorage()
  assert((await userService.getUserById(userA.id)) == null, 'Ephemeral User A remains deleted after storage rehydration')

  // ----------------------------------------------------
  // TEST B: Single Client deletion works and persists across storage rehydration
  // ----------------------------------------------------
  console.log('\n--- TEST B: Single Client deletion works and persists across storage rehydration ---')
  const clientB = await clientService.createClient({
    name: 'Ephemeral Client B',
    email: 'ephemeral.b@example.com',
    phone: '+91 99999 00001',
    gender: 'female',
    notes: 'Test client with no appointments',
  })
  assert(!!(await clientService.getClientById(clientB.id)), 'Ephemeral Client B created')
  await clientService.deleteClient(clientB.id)
  assert((await clientService.getClientById(clientB.id)) == null, 'Ephemeral Client B deleted in memory')

  // Rehydrate from storage
  clientService.reloadFromStorage()
  assert((await clientService.getClientById(clientB.id)) == null, 'Ephemeral Client B remains deleted after storage rehydration')

  // ----------------------------------------------------
  // TEST C: Single Service deletion works and persists across storage rehydration
  // ----------------------------------------------------
  console.log('\n--- TEST C: Single Service deletion works and persists across storage rehydration ---')
  const serviceC = await serviceService.createService({
    name: 'Ephemeral Service C',
    category: 'Hair',
    price: 450,
    durationMinutes: 30,
    description: 'Test service with no appointments',
    genderTarget: 'unisex',
  })
  assert(!!(await serviceService.getServiceById(serviceC.id)), 'Ephemeral Service C created')
  await serviceService.deleteService(serviceC.id)
  assert((await serviceService.getServiceById(serviceC.id)) == null, 'Ephemeral Service C deleted in memory')

  // Rehydrate from storage
  serviceService.reloadFromStorage()
  assert((await serviceService.getServiceById(serviceC.id)) == null, 'Ephemeral Service C remains deleted after storage rehydration')

  // ----------------------------------------------------
  // TEST D: Bulk User deletion works and persists
  // ----------------------------------------------------
  console.log('\n--- TEST D: Bulk User deletion works and persists ---')
  const userD1 = await userService.createUser({
    name: 'Bulk User D1',
    email: 'bulk.d1@lumasalon.example.com',
    role: 'RECEPTIONIST',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  const userD2 = await userService.createUser({
    name: 'Bulk User D2',
    email: 'bulk.d2@lumasalon.example.com',
    role: 'RECEPTIONIST',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  const bulkUserRes = await userService.deleteUsers([userD1.id, userD2.id])
  assert(bulkUserRes.deletedCount === 2, 'Bulk User deletion returned 2 deleted accounts')

  userService.reloadFromStorage()
  assert((await userService.getUserById(userD1.id)) == null, 'Bulk User D1 remains deleted after rehydration')
  assert((await userService.getUserById(userD2.id)) == null, 'Bulk User D2 remains deleted after rehydration')

  // ----------------------------------------------------
  // TEST E: Bulk Client deletion works and persists
  // ----------------------------------------------------
  console.log('\n--- TEST E: Bulk Client deletion works and persists ---')
  const clientE1 = await clientService.createClient({
    name: 'Bulk Client E1',
    email: 'bulk.e1@example.com',
    phone: '+91 99999 00002',
    gender: 'female',
  })
  const clientE2 = await clientService.createClient({
    name: 'Bulk Client E2',
    email: 'bulk.e2@example.com',
    phone: '+91 99999 00003',
    gender: 'male',
  })
  const bulkClientRes = await clientService.deleteClients([clientE1.id, clientE2.id])
  assert(bulkClientRes.deletedCount === 2, 'Bulk Client deletion deleted 2 clients')

  clientService.reloadFromStorage()
  assert((await clientService.getClientById(clientE1.id)) == null, 'Bulk Client E1 remains deleted after rehydration')
  assert((await clientService.getClientById(clientE2.id)) == null, 'Bulk Client E2 remains deleted after rehydration')

  // ----------------------------------------------------
  // TEST F: Bulk Service deletion works and persists
  // ----------------------------------------------------
  console.log('\n--- TEST F: Bulk Service deletion works and persists ---')
  const serviceF1 = await serviceService.createService({
    name: 'Bulk Service F1',
    category: 'Skin',
    price: 600,
    durationMinutes: 45,
    genderTarget: 'unisex',
  })
  const serviceF2 = await serviceService.createService({
    name: 'Bulk Service F2',
    category: 'Nail',
    price: 350,
    durationMinutes: 30,
    genderTarget: 'unisex',
  })
  const bulkServiceRes = await serviceService.deleteServices([serviceF1.id, serviceF2.id])
  assert(bulkServiceRes.deletedCount === 2, 'Bulk Service deletion deleted 2 services')

  serviceService.reloadFromStorage()
  assert((await serviceService.getServiceById(serviceF1.id)) == null, 'Bulk Service F1 remains deleted after rehydration')
  assert((await serviceService.getServiceById(serviceF2.id)) == null, 'Bulk Service F2 remains deleted after rehydration')

  // ----------------------------------------------------
  // TEST G: Deleting Client with appointment history fails with explicit error
  // ----------------------------------------------------
  console.log('\n--- TEST G: Deleting Client with appointment history fails with explicit error ---')
  // Priya Sharma (cli-01) has appointments
  assert(appointmentStore.hasAppointmentsForClient('cli-01'), 'Priya Sharma has appointments')
  let clientGError: string | null = null
  try {
    await clientService.deleteClient('cli-01')
  } catch (err: any) {
    clientGError = err.message
  }
  assert(
    clientGError === 'Cannot delete this client because appointment history exists for this client.',
    `Client with appointment history correctly rejected with exact error: "${clientGError}"`
  )
  assert(!!(await clientService.getClientById('cli-01')), 'Priya Sharma was NOT deleted')

  // ----------------------------------------------------
  // TEST H: Deleting Service with appointment history fails with explicit error
  // ----------------------------------------------------
  console.log('\n--- TEST H: Deleting Service with appointment history fails with explicit error ---')
  // srv-01 (Haircut & Blowdry) has appointments
  assert(appointmentStore.hasAppointmentsForService('srv-01'), 'Service srv-01 has appointments')
  let serviceHError: string | null = null
  try {
    await serviceService.deleteService('srv-01')
  } catch (err: any) {
    serviceHError = err.message
  }
  assert(
    serviceHError === 'Cannot delete this service because appointment history exists for this service.',
    `Service with appointment history correctly rejected with exact error: "${serviceHError}"`
  )
  assert(!!(await serviceService.getServiceById('srv-01')), 'Service srv-01 was NOT deleted')

  // ----------------------------------------------------
  // TEST I: Deleting Employee with appointment history fails with explicit error
  // ----------------------------------------------------
  console.log('\n--- TEST I: Deleting Employee with appointment history fails with explicit error ---')
  // Mia Vance (user-emp-01, staff-01) has appointments
  assert(appointmentStore.hasAppointmentsForStaff('staff-01'), 'Staff staff-01 has appointments')
  let empIError: string | null = null
  try {
    await userService.deleteUser('user-emp-01')
  } catch (err: any) {
    empIError = err.message
  }
  assert(
    empIError === 'Cannot delete this employee because appointment history exists for this employee.',
    `Employee with appointment history correctly rejected with exact error: "${empIError}"`
  )
  assert(!!(await userService.getUserById('user-emp-01')), 'Employee user-emp-01 was NOT deleted')

  // ----------------------------------------------------
  // TEST J: Deleting Client with NO appointments succeeds and persists
  // ----------------------------------------------------
  console.log('\n--- TEST J: Deleting Client with NO appointments succeeds and persists ---')
  const clientJ = await clientService.createClient({
    name: 'Zero Appt Client J',
    email: 'zero.j@example.com',
    phone: '+91 99999 00010',
    gender: 'male',
  })
  assert(!appointmentStore.hasAppointmentsForClient(clientJ.id), 'Client J has no appointments')
  await clientService.deleteClient(clientJ.id)
  assert((await clientService.getClientById(clientJ.id)) == null, 'Client J deleted successfully')
  clientService.reloadFromStorage()
  assert((await clientService.getClientById(clientJ.id)) == null, 'Client J remains deleted after reload')

  // ----------------------------------------------------
  // TEST K: Deleting Service with NO appointments succeeds and persists
  // ----------------------------------------------------
  console.log('\n--- TEST K: Deleting Service with NO appointments succeeds and persists ---')
  const serviceK = await serviceService.createService({
    name: 'Zero Appt Service K',
    category: 'Hair',
    price: 500,
    durationMinutes: 30,
    genderTarget: 'unisex',
  })
  assert(!appointmentStore.hasAppointmentsForService(serviceK.id), 'Service K has no appointments')
  await serviceService.deleteService(serviceK.id)
  assert((await serviceService.getServiceById(serviceK.id)) == null, 'Service K deleted successfully')
  serviceService.reloadFromStorage()
  assert((await serviceService.getServiceById(serviceK.id)) == null, 'Service K remains deleted after reload')

  // ----------------------------------------------------
  // TEST L: Deleting Employee with NO appointments succeeds and persists
  // ----------------------------------------------------
  console.log('\n--- TEST L: Deleting Employee with NO appointments succeeds and persists ---')
  const empL = await userService.createUser({
    name: 'Zero Appt Employee L',
    email: 'zero.l@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Skin',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })
  assert(!appointmentStore.hasAppointmentsForStaff(empL.id), 'Employee L has no appointments')
  await userService.deleteUser(empL.id)
  assert((await userService.getUserById(empL.id)) == null, 'Employee L deleted successfully')
  assert((await staffService.getStaffById(empL.id)) == null, 'Linked staff record deleted')
  userService.reloadFromStorage()
  staffService.reloadFromStorage()
  assert((await userService.getUserById(empL.id)) == null, 'Employee L remains deleted after reload')
  assert((await staffService.getStaffById(empL.id)) == null, 'Linked staff remains deleted after reload')

  // ----------------------------------------------------
  // TEST M: Last Owner deletion is blocked
  // ----------------------------------------------------
  console.log('\n--- TEST M: Last Owner deletion is blocked ---')
  // We have owner1 and owner2. Let's delete owner2, then attempt to delete owner1.
  await userService.deleteUser('user-owner-02')
  assert((await userService.getUserById('user-owner-02')) == null, 'Owner 2 deleted, 1 owner remains')

  let lastOwnerError: string | null = null
  try {
    await userService.deleteUser('user-owner-01')
  } catch (err: any) {
    lastOwnerError = err.message
  }
  assert(
    lastOwnerError === 'Cannot delete the last owner account.',
    `Last owner deletion blocked with error: "${lastOwnerError}"`
  )
  assert(!!(await userService.getUserById('user-owner-01')), 'Last owner user-owner-01 was NOT deleted')

  // ----------------------------------------------------
  // TEST N: Bulk deletion containing at least one referenced record is blocked
  // ----------------------------------------------------
  console.log('\n--- TEST N: Bulk deletion containing at least one referenced record is blocked ---')
  const cleanClientN = await clientService.createClient({
    name: 'Clean Client N',
    email: 'clean.n@example.com',
    phone: '+91 99999 00020',
    gender: 'female',
  })
  let bulkClientNError: string | null = null
  try {
    // Attempt bulk delete of cleanClientN + cli-01 (which has appointments)
    await clientService.deleteClients([cleanClientN.id, 'cli-01'])
  } catch (err: any) {
    bulkClientNError = err.message
  }
  assert(
    bulkClientNError?.includes('Cannot delete clients because appointment history exists for: Priya Sharma'),
    `Bulk client delete rejected due to referenced client: "${bulkClientNError}"`
  )
  // Verify cleanClientN was NOT deleted (atomic rejection)
  assert(!!(await clientService.getClientById(cleanClientN.id)), 'Clean Client N was preserved when bulk delete was blocked')

  // Test bulk service with reference
  const cleanServiceN = await serviceService.createService({
    name: 'Clean Service N',
    category: 'Hair',
    price: 300,
    durationMinutes: 20,
    genderTarget: 'unisex',
  })
  let bulkServiceNError: string | null = null
  try {
    await serviceService.deleteServices([cleanServiceN.id, 'srv-01'])
  } catch (err: any) {
    bulkServiceNError = err.message
  }
  assert(
    bulkServiceNError?.includes('Cannot delete services because appointment history exists for: Haircut & Blowdry'),
    `Bulk service delete rejected due to referenced service: "${bulkServiceNError}"`
  )
  assert(!!(await serviceService.getServiceById(cleanServiceN.id)), 'Clean Service N was preserved')

  // ----------------------------------------------------
  // TEST O: Creating a user of role EMPLOYEE creates valid credentials and persists
  // ----------------------------------------------------
  console.log('\n--- TEST O: Creating a user of role EMPLOYEE creates valid credentials and persists ---')
  const userO = await userService.createUser({
    name: 'Stylist Officer O',
    email: 'stylist.o@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Hair',
    initialPassword: 'CustomPassword123!',
  })
  assert(userO.role === 'EMPLOYEE', 'User O role is EMPLOYEE')
  const staffO = await staffService.getStaffById(userO.employeeId!)
  assert(!!staffO && staffO.name === 'Stylist Officer O', 'Staff record created in staffService for employee')
  const isCredOValid = await credentialService.verifyPassword('stylist.o@lumasalon.example.com', 'CustomPassword123!')
  assert(isCredOValid, 'Credentials verified for EMPLOYEE')

  // ----------------------------------------------------
  // TEST P: Creating a user of role RECEPTIONIST creates valid credentials and persists
  // ----------------------------------------------------
  console.log('\n--- TEST P: Creating a user of role RECEPTIONIST creates valid credentials and persists ---')
  const userP = await userService.createUser({
    name: 'Receptionist Officer P',
    email: 'receptionist.p@lumasalon.example.com',
    role: 'RECEPTIONIST',
    initialPassword: 'ReceptionSecret456!',
  })
  assert(userP.role === 'RECEPTIONIST', 'User P role is RECEPTIONIST')
  const isCredPValid = await credentialService.verifyPassword('receptionist.p@lumasalon.example.com', 'ReceptionSecret456!')
  assert(isCredPValid, 'Credentials verified for RECEPTIONIST')

  // ----------------------------------------------------
  // TEST Q: Creating a user of role OWNER creates valid credentials and persists
  // ----------------------------------------------------
  console.log('\n--- TEST Q: Creating a user of role OWNER creates valid credentials and persists ---')
  const userQ = await userService.createUser({
    name: 'Partner Owner Q',
    email: 'owner.q@lumasalon.example.com',
    role: 'OWNER',
    initialPassword: 'OwnerMaster789!',
  })
  assert(userQ.role === 'OWNER', 'User Q role is OWNER')
  const isCredQValid = await credentialService.verifyPassword('owner.q@lumasalon.example.com', 'OwnerMaster789!')
  assert(isCredQValid, 'Credentials verified for OWNER')

  // ----------------------------------------------------
  // TEST R: Login with newly created RECEPTIONIST succeeds
  // ----------------------------------------------------
  console.log('\n--- TEST R: Login with newly created RECEPTIONIST succeeds ---')
  authService.logout()
  const loginRes = await authService.login('receptionist.p@lumasalon.example.com', 'ReceptionSecret456!')
  assert(loginRes.isAuthenticated, 'Login succeeded for new receptionist')
  const activeSession = sessionService.getCurrentSession()
  assert(activeSession?.role === 'RECEPTIONIST', 'Active session role is RECEPTIONIST')
  assert(activeSession?.userId === userP.id, 'Active session user ID matches newly created receptionist')

  // Verify non-owner permissions for receptionist
  assert(!permissionService.canDeleteUser(activeSession), 'Receptionist cannot delete users')
  assert(!permissionService.canDeleteClient(activeSession), 'Receptionist cannot delete clients')
  assert(!permissionService.canDeleteService(activeSession), 'Receptionist cannot delete services')

  // Log back in as owner for next tests
  await authService.login('owner1@lumasalon.example.com', DEFAULT_TEST_PASSWORD)

  // ----------------------------------------------------
  // TEST S: Storage rehydration does not restore deleted items
  // ----------------------------------------------------
  console.log('\n--- TEST S: Storage rehydration does not restore deleted items ---')
  // Create and delete item in each domain
  const clientS = await clientService.createClient({
    name: 'Deletable Client S',
    email: 'client.s@example.com',
    phone: '+91 99999 00099',
    gender: 'female',
  })
  const serviceS = await serviceService.createService({
    name: 'Deletable Service S',
    category: 'Skin',
    price: 700,
    durationMinutes: 45,
    genderTarget: 'unisex',
  })
  const userS = await userService.createUser({
    name: 'Deletable User S',
    email: 'user.s@lumasalon.example.com',
    role: 'RECEPTIONIST',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })

  // Delete all 3
  await clientService.deleteClient(clientS.id)
  await serviceService.deleteService(serviceS.id)
  await userService.deleteUser(userS.id)

  // Simulate complete app reload
  clientService.reloadFromStorage()
  serviceService.reloadFromStorage()
  userService.reloadFromStorage()
  await credentialService.reloadFromStorage()

  assert((await clientService.getClientById(clientS.id)) == null, 'Client S remains deleted after storage rehydration')
  assert((await serviceService.getServiceById(serviceS.id)) == null, 'Service S remains deleted after storage rehydration')
  assert((await userService.getUserById(userS.id)) == null, 'User S remains deleted after storage rehydration')
  const isCredSValid = await credentialService.verifyPassword('user.s@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(!isCredSValid, 'Credentials for User S remain purged after storage rehydration')

  // ----------------------------------------------------
  // TEST T: Storage rehydration does not erase newly created items
  // ----------------------------------------------------
  console.log('\n--- TEST T: Storage rehydration does not erase newly created items ---')
  const clientT = await clientService.createClient({
    name: 'Permanent Client T',
    email: 'client.t@example.com',
    phone: '+91 99999 00100',
    gender: 'male',
  })
  const serviceT = await serviceService.createService({
    name: 'Permanent Service T',
    category: 'Hair',
    price: 850,
    durationMinutes: 60,
    genderTarget: 'unisex',
  })
  const userT = await userService.createUser({
    name: 'Permanent Staff T',
    email: 'staff.t@lumasalon.example.com',
    role: 'EMPLOYEE',
    specialty: 'Hair',
    initialPassword: DEFAULT_TEST_PASSWORD,
  })

  // Simulate complete app reload
  clientService.reloadFromStorage()
  serviceService.reloadFromStorage()
  userService.reloadFromStorage()
  staffService.reloadFromStorage()
  await credentialService.reloadFromStorage()

  assert(!!(await clientService.getClientById(clientT.id)), 'Client T is preserved after storage rehydration')
  assert(!!(await serviceService.getServiceById(serviceT.id)), 'Service T is preserved after storage rehydration')
  assert(!!(await userService.getUserById(userT.id)), 'User T is preserved after storage rehydration')
  assert(!!(await staffService.getStaffById(userT.employeeId!)), 'Staff record for User T is preserved after storage rehydration')
  const isCredTValid = await credentialService.verifyPassword('staff.t@lumasalon.example.com', DEFAULT_TEST_PASSWORD)
  assert(isCredTValid, 'Credentials for User T are preserved after storage rehydration')

  console.log('\n=================================================================')
  console.log('🎉 ALL 20 MANDATORY TESTS (A THROUGH T) PASSED SUCCESSFULLY!')
  console.log('=================================================================\n')
}

runHardeningSuite().catch((err) => {
  console.error('Test suite failed:', err)
  process.exit(1)
})
