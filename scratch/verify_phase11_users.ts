import { userService } from '../src/services/userService'
import { sessionService } from '../src/services/sessionService'
import { permissionService } from '../src/services/permissionService'
import { appointmentStore } from '../src/services/appointmentStore'
import { appointmentService } from '../src/services/appointmentService'
import { staffService } from '../src/services/staffService'
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

async function runPhase11Tests() {
  console.log('=================================================================')
  console.log('PHASE 11: USER MANAGEMENT, RBAC & SESSION ISOLATION SUITE')
  console.log('=================================================================\n')

  // Reset stores for pristine reproducible test run
  appointmentStore.resetToMock()
  staffService.resetToMock()
  userService.resetToMock()

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)

  // ----------------------------------------------------
  // Test Suite 1: Initial 23 Users Loading & Verification
  // ----------------------------------------------------
  console.log('--- Test Group 1: Initial 23 Users & Role Composition ---')
  const allUsers = await userService.getUsers()
  assert(allUsers.length === 23, `Total initial users is exactly 23 (found ${allUsers.length})`)

  const owners = allUsers.filter((u) => u.role === 'OWNER')
  assert(owners.length === 2, `Exactly 2 Owners present: ${owners.map((o) => o.name).join(', ')}`)

  const receptionists = allUsers.filter((u) => u.role === 'RECEPTIONIST')
  assert(receptionists.length === 1, `Exactly 1 Receptionist present: ${receptionists[0].name}`)

  const employees = allUsers.filter((u) => u.role === 'EMPLOYEE')
  assert(employees.length === 20, `Exactly 20 Employees present (found ${employees.length})`)

  // Verify key employees exist with proper specialties and employeeId links
  const rohan = allUsers.find((u) => u.name === 'Rohan Sen')
  assert(!!rohan && rohan.employeeId === 'staff-02' && rohan.specialty === 'Hair', 'Rohan Sen is Employee with staff-02 and Hair specialty')

  const mia = allUsers.find((u) => u.name === 'Mia Vance')
  assert(!!mia && mia.employeeId === 'staff-01' && mia.specialty === 'Hair', 'Mia Vance is Employee with staff-01 and Hair specialty')

  const kabir = allUsers.find((u) => u.name === 'Kabir Sharma')
  assert(!!kabir && kabir.employeeId === 'staff-04' && kabir.specialty === 'Nail', 'Kabir Sharma is Employee with staff-04 and Nail specialty')

  const ananya = allUsers.find((u) => u.name === 'Ananya Roy')
  assert(!!ananya && ananya.employeeId === 'staff-03' && ananya.specialty === 'Skin', 'Ananya Roy is Employee with staff-03 and Skin specialty')

  // ----------------------------------------------------
  // Test Suite 2: Permission Matrix Enforcements
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Role / Permission Matrix ---')
  const ownerUser = owners[0]
  const recUser = receptionists[0]
  const empUser = rohan!

  // User Management Access
  sessionService.loginWithUser(ownerUser)
  assert(permissionService.canAccessUserManagement() === true, 'OWNER can access User Management ✅')
  assert(permissionService.canCreateEmployee() === true, 'OWNER can create employee ✅')
  assert(permissionService.canAssignServices() === true, 'OWNER can assign services/appointments ✅')
  assert(permissionService.canViewAllAppointments() === true, 'OWNER can view all appointments ✅')
  assert(permissionService.canSendSalonReminders() === true, 'OWNER can send salon reminders ✅')
  assert(permissionService.canViewSalonRevenue() === true, 'OWNER can view salon revenue ✅')

  sessionService.loginWithUser(recUser)
  assert(permissionService.canAccessUserManagement() === false, 'RECEPTIONIST cannot access User Management ❌')
  assert(permissionService.canCreateEmployee() === false, 'RECEPTIONIST cannot create employee ❌')
  assert(permissionService.canAssignServices() === true, 'RECEPTIONIST can assign services/appointments ✅')
  assert(permissionService.canViewAllAppointments() === true, 'RECEPTIONIST can view all appointments ✅')
  assert(permissionService.canSendSalonReminders() === true, 'RECEPTIONIST can send salon reminders ✅')
  assert(permissionService.canViewSalonRevenue() === false, 'RECEPTIONIST cannot view salon revenue ❌')

  sessionService.loginWithUser(empUser)
  assert(permissionService.canAccessUserManagement() === false, 'EMPLOYEE cannot access User Management ❌')
  assert(permissionService.canCreateEmployee() === false, 'EMPLOYEE cannot create employee ❌')
  assert(permissionService.canAssignServices() === false, 'EMPLOYEE cannot assign services/appointments ❌')
  assert(permissionService.canViewAllAppointments() === false, 'EMPLOYEE cannot view all appointments ❌')
  assert(permissionService.canSendSalonReminders() === false, 'EMPLOYEE cannot send salon reminders ❌')
  assert(permissionService.canViewSalonRevenue() === false, 'EMPLOYEE cannot view salon revenue ❌')

  // ----------------------------------------------------
  // Test Suite 3: Section 13 Session Switching & Data Isolation
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Section 13 Session Switching & Scoped Data Isolation ---')

  // 1. Login as Receptionist
  console.log('Step 1: Login as Receptionist')
  sessionService.loginWithUser(recUser)
  assert(sessionService.getCurrentSession()?.role === 'RECEPTIONIST', 'Authenticated as Receptionist')

  // 2. Assign Priya Sharma -> Balayage -> Rohan Sen
  console.log('Step 2: Assign Priya Sharma -> Balayage -> Rohan Sen')
  const priyaClient = (await clientService.searchClients('Priya Sharma'))[0]
  assert(!!priyaClient, 'Found Priya Sharma in client registry')

  const balayageSrv = (await serviceService.getServices()).find((s) => s.name.includes('Balayage'))!
  assert(!!balayageSrv, 'Found Balayage service')

  const assignedApt = await appointmentService.createAppointment({
    clientId: priyaClient.id,
    serviceId: balayageSrv.id,
    staffId: rohan!.employeeId!,
    date: tomorrowStr,
    startTime: '16:00',
    endTime: '19:00',
    status: 'scheduled',
    price: balayageSrv.price,
    notes: 'Phase 11 Session Switching Verification',
  })
  assert(!!assignedApt && assignedApt.staffId === 'staff-02', `Created appointment ${assignedApt.id} assigned to Rohan Sen (staff-02)`)

  // 3. Verify appointment appears for Rohan in canonical store
  const storedApt = appointmentStore.getById(assignedApt.id)
  assert(!!storedApt && storedApt.staffId === 'staff-02', 'Appointment verified in canonical store')

  // 4. Logout
  console.log('Step 4: Logout')
  sessionService.logout()
  assert(sessionService.getCurrentSession() === null, 'Session successfully cleared')

  // 5. Login as Rohan Sen
  console.log('Step 5: Login as Rohan Sen')
  sessionService.loginWithUser(rohan!)
  assert(sessionService.getCurrentSession()?.userId === rohan!.id, 'Authenticated as Rohan Sen')

  // 6. Verify Rohan sees the appointment in his employee-scoped calendar view
  console.log('Step 6: Verify Rohan sees the appointment')
  const rohanTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const rohanHasIt = rohanTomorrowApts.some((a) => a.id === assignedApt.id)
  assert(rohanHasIt, "Rohan Sen sees the assigned appointment in tomorrow's schedule")

  // 7. Logout
  console.log('Step 7: Logout')
  sessionService.logout()

  // 8. Login as Mia Vance
  console.log('Step 8: Login as Mia Vance')
  sessionService.loginWithUser(mia!)
  assert(sessionService.getCurrentSession()?.userId === mia!.id, 'Authenticated as Mia Vance')

  // 9. Verify the Rohan appointment is NOT visible to Mia
  console.log('Step 9: Verify the Rohan appointment is NOT visible to Mia')
  const miaTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const miaHasIt = miaTomorrowApts.some((a) => a.id === assignedApt.id)
  assert(!miaHasIt, "Mia Vance does NOT see Rohan's appointment (Data Isolation Enforced!)")

  // Direct fetch by ID attempt as Mia Vance
  const miaDirectFetch = await appointmentService.getAppointmentById(assignedApt.id)
  assert(miaDirectFetch === null, 'Direct getAppointmentById for another employee returns null')

  // 10. Login as Owner
  console.log('Step 10: Login as Owner')
  sessionService.loginWithUser(ownerUser)
  assert(sessionService.getCurrentSession()?.role === 'OWNER', 'Authenticated as Owner')

  // 11. Verify Owner can see the appointment
  console.log('Step 11: Verify Owner can see the appointment')
  const ownerTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const ownerHasIt = ownerTomorrowApts.some((a) => a.id === assignedApt.id)
  assert(ownerHasIt, 'Owner can see Rohan appointment salon-wide')

  // 12. Login as Receptionist
  console.log('Step 12: Login as Receptionist')
  sessionService.loginWithUser(recUser)
  assert(sessionService.getCurrentSession()?.role === 'RECEPTIONIST', 'Authenticated as Receptionist')

  // 13. Verify Receptionist can see the appointment
  console.log('Step 13: Verify Receptionist can see the appointment')
  const recTomorrowApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const recHasIt = recTomorrowApts.some((a) => a.id === assignedApt.id)
  assert(recHasIt, 'Receptionist can see Rohan appointment salon-wide')

  // 14-16. Login as Employee, Attempt User Management, Access Denied
  console.log('Steps 14-16: Employee User Management access denial')
  sessionService.loginWithUser(rohan!)
  assert(permissionService.canAccessUserManagement() === false, 'Employee User Management access denied')
  let employeeCreateErr = false
  try {
    await userService.createEmployee({
      name: 'Unauthorized User',
      email: 'unauth@lumasalon.example.com',
      specialty: 'Hair',
    })
  } catch (err: any) {
    employeeCreateErr = true
    assert(err.message.includes('Unauthorized'), 'userService.createEmployee rejected unauthorized Employee call')
  }
  assert(employeeCreateErr, 'Employee creation by Employee strictly threw unauthorized error')

  // 17-19. Login as Receptionist, Attempt User Management, Access Denied
  console.log('Steps 17-19: Receptionist User Management access denial')
  sessionService.loginWithUser(recUser)
  assert(permissionService.canAccessUserManagement() === false, 'Receptionist User Management access denied')
  let recCreateErr = false
  try {
    await userService.createEmployee({
      name: 'Unauthorized User 2',
      email: 'unauth2@lumasalon.example.com',
      specialty: 'Hair',
    })
  } catch (err: any) {
    recCreateErr = true
    assert(err.message.includes('Unauthorized'), 'userService.createEmployee rejected unauthorized Receptionist call')
  }
  assert(recCreateErr, 'Employee creation by Receptionist strictly threw unauthorized error')

  // 20-21. Login as Owner, User Management Accessible
  console.log('Steps 20-21: Owner User Management access granted')
  sessionService.loginWithUser(ownerUser)
  assert(permissionService.canAccessUserManagement() === true, 'Owner User Management access verified')

  // ----------------------------------------------------
  // Test Suite 4: Section 14 User Management Test (Create Aarav Mehta)
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Section 14 User Management Lifecycle (Aarav Mehta) ---')
  sessionService.loginWithUser(ownerUser)

  const createdAarav = await userService.createEmployee({
    name: 'Aarav Mehta',
    email: 'aarav@lumasalon.example.com',
    specialty: 'Hair',
    skills: ['Haircut & Blowdry', 'Precision Styling', 'Balayage Specialist'],
    phone: '+91 98119 12345',
  })
  assert(!!createdAarav && createdAarav.name === 'Aarav Mehta', 'Aarav Mehta created successfully')
  assert(createdAarav.role === 'EMPLOYEE', 'Role is strictly EMPLOYEE')
  assert(createdAarav.specialty === 'Hair', 'Specialty is Hair')
  assert(!!createdAarav.employeeId, `Associated staff ID created: ${createdAarav.employeeId}`)

  // Verify appears in User Management list
  const refreshedUsers = await userService.getUsers()
  assert(refreshedUsers.some((u) => u.id === createdAarav.id), 'Aarav Mehta appears in User Management roster')
  assert(refreshedUsers.length === 24, 'Total salon users incremented from 23 to 24')

  // Verify staff profile persisted in staffService
  const aaravStaff = await staffService.getStaffById(createdAarav.employeeId!)
  assert(!!aaravStaff && aaravStaff.name === 'Aarav Mehta', 'Aarav Mehta staff profile persisted in staffService')

  // Employee can log in and receives an isolated session
  sessionService.loginWithUser(createdAarav)
  const aaravSession = sessionService.getCurrentSession()
  assert(aaravSession?.userId === createdAarav.id, 'Aarav Mehta successfully logged in')
  assert(aaravSession?.role === 'EMPLOYEE', 'Aarav session has EMPLOYEE role')
  assert(aaravSession?.employeeId === createdAarav.employeeId, 'Aarav session linked to new staffId')

  // Aarav sees only relevant employee-scoped data (initially 0 appointments)
  const aaravInitialApts = await appointmentService.getAppointments()
  assert(aaravInitialApts.length === 0, 'Aarav Mehta initially sees 0 appointments (isolated clean baseline)')

  // Owner continues to see Aarav
  sessionService.loginWithUser(ownerUser)
  const ownerCheckStaff = await staffService.getStaffById(createdAarav.employeeId!)
  assert(!!ownerCheckStaff, 'Owner continues to see Aarav Mehta in staff registry')

  // Receptionist can assign an appointment to Aarav
  sessionService.loginWithUser(recUser)
  const aaravApt = await appointmentService.createAppointment({
    clientId: priyaClient.id,
    serviceId: balayageSrv.id,
    staffId: createdAarav.employeeId!,
    date: tomorrowStr,
    startTime: '10:00',
    endTime: '13:00',
    status: 'scheduled',
    price: balayageSrv.price,
    notes: 'Appointment assigned to newly onboarded specialist Aarav Mehta',
  })
  assert(!!aaravApt, `Receptionist assigned appointment ${aaravApt.id} to Aarav Mehta`)

  // Aarav sees the assigned appointment
  sessionService.loginWithUser(createdAarav)
  const aaravAptsAfter = await appointmentService.getAppointmentsForDate(tomorrowStr)
  assert(aaravAptsAfter.some((a) => a.id === aaravApt.id), 'Aarav Mehta sees the newly assigned appointment in his calendar')

  // Another employee (Rohan Sen) does NOT see Aarav's appointment
  sessionService.loginWithUser(rohan!)
  const rohanAptsAfter = await appointmentService.getAppointmentsForDate(tomorrowStr)
  assert(!rohanAptsAfter.some((a) => a.id === aaravApt.id), "Rohan Sen does NOT see Aarav Mehta's appointment (Data Isolation Enforced!)")

  // ----------------------------------------------------
  // Test Suite 5: Service Assignment Permissions Enforcement
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Service Assignment Permission Enforcement ---')
  sessionService.loginWithUser(rohan!)
  let employeeAssignFailed = false
  try {
    await appointmentService.createAppointment({
      clientId: priyaClient.id,
      serviceId: balayageSrv.id,
      staffId: rohan!.employeeId!,
      date: todayStr,
      startTime: '11:00',
      endTime: '14:00',
      status: 'scheduled',
      price: balayageSrv.price,
    })
  } catch (err: any) {
    employeeAssignFailed = true
    assert(err.message.includes('Unauthorized'), 'appointmentService.createAppointment rejected Employee assignment attempt')
  }
  assert(employeeAssignFailed, 'Employee assignment blocked at service layer')

  // ----------------------------------------------------
  // Test Suite 6: AI Assistant Role-Aware Enforcement
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: AI Assistant Role Restrictions ---')

  // A. Owner: "Show today's bookings" -> salon-wide
  sessionService.loginWithUser(ownerUser)
  const ownerBookingsRes = await executeCommand(interpretCommand("Show today's bookings"))
  assert(ownerBookingsRes.type === 'appointment_list', 'Owner: SHOW_TODAY_BOOKINGS returns appointment list')
  assert((ownerBookingsRes.appointments || []).length >= 4, 'Owner: Returns full salon-wide bookings')

  // B. Employee Rohan: "Show today's bookings" -> only Rohan's
  sessionService.loginWithUser(rohan!)
  const rohanBookingsRes = await executeCommand(interpretCommand("Show today's bookings"))
  assert(rohanBookingsRes.type === 'appointment_list', 'Employee: SHOW_TODAY_BOOKINGS returns appointment list')
  assert(rohanBookingsRes.message.includes('your scheduled appointments'), 'Message greets employee with their personal schedule')
  for (const apt of rohanBookingsRes.appointments || []) {
    assert(apt.staffId === rohan!.employeeId, `All returned appointments belong to Rohan Sen (${apt.staffId})`)
  }

  // C. Employee Mia: "Show Rohan's appointments" -> REJECTED
  sessionService.loginWithUser(mia!)
  const miaAskRohanRes = await executeCommand(interpretCommand("Show Rohan's appointments"))
  assert(miaAskRohanRes.type === 'error', "Employee asking for another employee's schedule returns error")
  assert(
    miaAskRohanRes.message.includes('permission to view appointments for other employees'),
    'Error message confirms permission restriction'
  )

  // D. Employee: "Book Priya with Rohan" -> REJECTED
  sessionService.loginWithUser(mia!)
  const empBookRes = await executeCommand(
    interpretCommand('Book Priya Sharma for balayage tomorrow at 1 PM with Rohan')
  )
  assert(empBookRes.type === 'error', 'Employee booking attempt via AI returns error')
  assert(
    empBookRes.message.includes('permission to book or assign appointments'),
    'AI Assistant confirms booking permission restriction'
  )

  // E. Receptionist: "Book Priya with Rohan" -> ALLOWED
  sessionService.loginWithUser(recUser)
  const recBookRes = await executeCommand(
    interpretCommand('Book Priya Sharma for balayage tomorrow at 1 PM with Rohan')
  )
  assert(recBookRes.type === 'booking_preview', 'Receptionist booking attempt via AI returns booking_preview')
  assert(recBookRes.pendingBooking?.staffName === 'Rohan Sen', 'Booking preview prepared for Rohan Sen')

  // F. Employee: "Send appointment reminders" -> REJECTED
  sessionService.loginWithUser(rohan!)
  const empReminderRes = await executeCommand(interpretCommand('Send appointment reminders'))
  assert(empReminderRes.type === 'error', 'Employee reminders query via AI returns error')
  assert(
    empReminderRes.message.includes('permission to dispatch salon-wide appointment reminders'),
    'AI Assistant confirms reminder permission restriction'
  )

  // G. Receptionist: "Send appointment reminders" -> ALLOWED
  sessionService.loginWithUser(recUser)
  const recReminderRes = await executeCommand(interpretCommand('Send appointment reminders'))
  assert(recReminderRes.type === 'reminders_preview', 'Receptionist reminders query returns reminders_preview')

  // ----------------------------------------------------
  // Test Suite 7: Regressions Suite (Phase 8, Phase 9, Phase 10)
  // ----------------------------------------------------
  console.log('\n--- Test Group 7: Phase 8, 9, 10 Regression Verification ---')

  // Phase 8: Stylist availability & skill matching
  sessionService.loginWithUser(recUser)
  const availRes = await executeCommand(interpretCommand('Find an available stylist for balayage at 1 PM'))
  assert(availRes.type === 'availability_results', 'Regression Phase 8: Stylist availability query works')

  // Phase 9: Appointment preview and confirmation
  sessionService.loginWithUser(ownerUser)
  const previewRes = await executeCommand(
    interpretCommand('Book Priya Sharma for balayage tomorrow at 1 PM with Rohan')
  )
  assert(previewRes.type === 'booking_preview', 'Regression Phase 9: Booking preview generated')
  const confirmRes = await executeCommand(interpretCommand('Confirm', {
    hasPendingBooking: true,
    pendingBooking: previewRes.pendingBooking,
  }))
  assert(confirmRes.type === 'booking_confirmed', 'Regression Phase 9: Booking confirmed and persisted')

  // Phase 10: Reminder preview and cancel
  sessionService.loginWithUser(ownerUser)
  const reminderPreview = await executeCommand(interpretCommand('Send reminders for tomorrow'))
  assert(reminderPreview.type === 'reminders_preview', 'Regression Phase 10: Reminders preview generated')
  const cancelRes = await executeCommand(interpretCommand('Cancel', {
    hasPendingReminders: true,
    pendingReminders: reminderPreview.pendingReminders,
  }))
  assert(cancelRes.type === 'general', 'Regression Phase 10: Reminders safely cancelled')
  assert(cancelRes.message.includes('cancelled'), 'Cancellation confirmed')

  console.log('\n=================================================================')
  console.log('ALL PHASE 11 AUTOMATED VERIFICATION TESTS PASSED (100% SUCCESS)!')
  console.log('=================================================================')
}

runPhase11Tests().catch((err) => {
  console.error('\n❌ Phase 11 Test Suite Failed:', err)
  process.exit(1)
})
