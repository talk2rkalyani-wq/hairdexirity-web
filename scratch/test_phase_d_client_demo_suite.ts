/**
 * Luma Salon — Phase D: Client Demo Preparation & Automated Validation Suite
 *
 * Validates:
 * 1. All 6 Demo Shortcuts authentication & session resolution.
 * 2. Role-based module access & direct route protection matrix (Server/Service enforced).
 * 3. Exact 18-person approved staff roster, job titles, and gender attributes.
 * 4. Local appointment operations & historical appointment snapshot preservation.
 * 5. Administrator vs Owner privilege separation (ordinary owners cannot manage owners or admin).
 * 6. VIP booking restriction representation for Rajesh (Owner 1).
 */

import { authService } from '../src/services/authService'
import { permissionService } from '../src/services/permissionService'
import { staffService } from '../src/services/staffService'
import { userService } from '../src/services/userService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { appointmentStore } from '../src/services/appointmentStore'
import { bookingHandler } from '../src/features/assistant/services/bookingHandler'
import type { NavId } from '../src/types/salon'
import type { UserRole } from '../src/types/models'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhaseDTestSuite() {
  console.log('======================================================================')
  console.log('LUMA SALON — PHASE D CLIENT DEMO PREPARATION AUTOMATED TEST SUITE')
  console.log('======================================================================\n')

  const DEMO_PASSWORD = 'Luma@2026!'

  // -------------------------------------------------------------------------
  // 1. VERIFY ALL SIX DEMO SHORTCUTS & CREDENTIALS
  // -------------------------------------------------------------------------
  console.log('>>> [SECTION 1: VERIFY 6 DEMO SHORTCUTS & SESSIONS]')

  const demoAccounts = [
    {
      label: 'Owner 1 (Rajesh)',
      email: 'owner1@lumasalon.example.com',
      expectedRole: 'OWNER' as UserRole,
      expectedDesignation: 'OWNER_1',
      expectedName: 'Rajesh',
    },
    {
      label: 'Owner 2 (Niketa Kaushik)',
      email: 'owner2@lumasalon.example.com',
      expectedRole: 'OWNER' as UserRole,
      expectedDesignation: 'OWNER_2',
      expectedName: 'Niketa Kaushik',
    },
    {
      label: 'Manager (Riya Balodi)',
      email: 'receptionist@lumasalon.example.com',
      expectedRole: 'RECEPTIONIST' as UserRole,
      expectedDesignation: null,
      expectedName: 'Riya Balodi',
    },
    {
      label: 'Assistant Manager (Priya)',
      email: 'priya.mgr@lumasalon.example.com',
      expectedRole: 'RECEPTIONIST' as UserRole,
      expectedDesignation: null,
      expectedName: 'Priya',
    },
    {
      label: 'Stylist (Farhaan)',
      email: 'farhaan@lumasalon.example.com',
      expectedRole: 'EMPLOYEE' as UserRole,
      expectedDesignation: null,
      expectedName: 'Farhaan',
    },
    {
      label: 'Administrator (Kalyani)',
      email: 'talk2rkalyani@gmail.com',
      expectedRole: 'ADMIN' as UserRole,
      expectedDesignation: null,
      expectedName: 'Kalyani',
    },
  ]

  for (const acc of demoAccounts) {
    const session = await authService.login(acc.email, DEMO_PASSWORD)
    assert(session.isAuthenticated, `${acc.label} logged in successfully`)
    assert(session.email === acc.email, `${acc.label} session email matches`)
    assert(session.role === acc.expectedRole, `${acc.label} role is ${acc.expectedRole}`)
    assert(
      (session.ownerDesignation || null) === acc.expectedDesignation,
      `${acc.label} owner designation is ${acc.expectedDesignation ?? 'null'}`
    )
    assert(session.name === acc.expectedName, `${acc.label} name is ${acc.expectedName}`)
  }

  // -------------------------------------------------------------------------
  // 2. ACTUAL ROLE ACCESS & DIRECT NAVIGATION RESTRICTIONS MATRIX
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 2: DIRECT NAVIGATION & ROLE ACCESS ENFORCEMENT]')

  const modules: NavId[] = ['assistant', 'calendar', 'clients', 'staff', 'services', 'users', 'settings']

  // Test Admin access
  const adminSession = await authService.login('talk2rkalyani@gmail.com', DEMO_PASSWORD)
  for (const mod of modules) {
    const allowed = permissionService.canAccessModule(mod, adminSession)
    assert(allowed, `Admin can access protected module: #${mod}`)
  }

  // Test Owner access
  const ownerSession = await authService.login('owner1@lumasalon.example.com', DEMO_PASSWORD)
  for (const mod of modules) {
    const allowed = permissionService.canAccessModule(mod, ownerSession)
    assert(allowed, `Owner can access module: #${mod}`)
  }

  // Test Receptionist access
  const recSession = await authService.login('receptionist@lumasalon.example.com', DEMO_PASSWORD)
  assert(permissionService.canAccessModule('assistant', recSession), 'Receptionist can access #assistant')
  assert(permissionService.canAccessModule('calendar', recSession), 'Receptionist can access #calendar')
  assert(permissionService.canAccessModule('clients', recSession), 'Receptionist can access #clients')
  assert(permissionService.canAccessModule('staff', recSession), 'Receptionist can view #staff')
  assert(permissionService.canAccessModule('services', recSession), 'Receptionist can view #services')
  assert(!permissionService.canAccessModule('users', recSession), 'Receptionist STRICTLY BLOCKED from #users (Direct navigation denied)')
  assert(!permissionService.canAccessModule('settings', recSession), 'Receptionist STRICTLY BLOCKED from #settings (Direct navigation denied)')

  // Test Employee access
  const empSession = await authService.login('farhaan@lumasalon.example.com', DEMO_PASSWORD)
  assert(permissionService.canAccessModule('assistant', empSession), 'Employee can access #assistant')
  assert(permissionService.canAccessModule('calendar', empSession), 'Employee can access #calendar')
  assert(permissionService.canAccessModule('clients', empSession), 'Employee can view #clients')
  assert(permissionService.canAccessModule('services', empSession), 'Employee can view #services')
  assert(!permissionService.canAccessModule('staff', empSession), 'Employee STRICTLY BLOCKED from #staff management')
  assert(!permissionService.canAccessModule('users', empSession), 'Employee STRICTLY BLOCKED from #users')
  assert(!permissionService.canAccessModule('settings', empSession), 'Employee STRICTLY BLOCKED from #settings')

  // -------------------------------------------------------------------------
  // 3. VERIFY APPROVED 18-PERSON STAFF ROSTER
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 3: APPROVED 18-PERSON STAFF ROSTER INTEGRITY]')

  const staff = await staffService.getStaff()
  const realStaff = staff.filter((s) => s.id.startsWith('staff-real-'))
  assert(realStaff.length === 18, `Exactly 18 approved staff members found (found ${realStaff.length})`)

  const expected18 = [
    { name: 'Riya Balodi', gender: 'Female', title: 'Salon Manager' },
    { name: 'Priya', gender: 'Female', title: 'Assistant Salon Manager' },
    { name: 'Rajesh', gender: 'Male', title: 'Premium Hair Stylist' },
    { name: 'Farhaan', gender: 'Male', title: 'Hair Stylist' },
    { name: 'Ashu', gender: 'Male', title: 'Hair Stylist' },
    { name: 'Upender', gender: 'Male', title: 'Hair Stylist' },
    { name: 'Niketa Kaushik', gender: 'Female', title: 'Make Up Artist' },
    { name: 'Tarun Goswami', gender: 'Male', title: 'Senior Salon Assistant' },
    { name: 'Dev', gender: 'Male', title: 'Assistant' },
    { name: 'Sushma', gender: 'Female', title: 'Assistant' },
    { name: 'Soni', gender: 'Male', title: 'Assistant' },
    { name: 'Nima', gender: 'Female', title: 'Assistant' },
    { name: 'Sohan', gender: 'Male', title: 'Pedicurist' },
    { name: 'Sujit', gender: 'Male', title: 'Pedicurist' },
    { name: 'Deepak', gender: 'Male', title: 'Pedicurist' },
    { name: 'Pooja', gender: 'Female', title: 'Beautician' },
    { name: 'Meena', gender: 'Female', title: 'Beautician' },
    { name: 'Sapna', gender: 'Female', title: 'Nail Artist' },
  ]

  for (const exp of expected18) {
    const found = realStaff.find((s) => s.name === exp.name)
    assert(!!found, `Staff member '${exp.name}' is present`)
    assert(found?.gender === exp.gender, `${exp.name} gender is ${exp.gender}`)
    assert(found?.jobTitle === exp.title, `${exp.name} job title is '${exp.title}'`)
  }

  // Verify historical staff are preserved as archived
  const historicalStaff = staff.filter((s) => !s.id.startsWith('staff-real-'))
  assert(historicalStaff.length === 20, `All 20 historical staff preserved for appointment reference (found ${historicalStaff.length})`)
  assert(historicalStaff.every((s) => !s.active), 'All historical staff are safely marked active: false')

  // -------------------------------------------------------------------------
  // 4. APPOINTMENT OPERATIONS & HISTORICAL DATA PRESERVATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 4: APPOINTMENT OPERATIONS & SNAPSHOT INTEGRITY]')

  const initialAppointments = appointmentStore.getAll()
  assert(initialAppointments.length >= 18, `Historical appointments preserved (found ${initialAppointments.length})`)

  // Verify snapshots on historical appointments
  const apt01 = initialAppointments.find((a) => a.id === 'apt-01')
  assert(!!apt01, 'Historical appointment apt-01 exists')
  assert(!!apt01?.clientName, `apt-01 retains immutable client snapshot: ${apt01?.clientName}`)
  assert(!!apt01?.staffName, `apt-01 retains immutable staff snapshot: ${apt01?.staffName}`)
  assert(!!apt01?.serviceName, `apt-01 retains immutable service snapshot: ${apt01?.serviceName}`)

  // Create temporary appointment in local demo store
  const tempApt = appointmentStore.add({
    id: 'apt-demo-temp-999',
    salonId: 'salon-luma-01',
    clientId: 'cli-02',
    clientName: 'Rahul Sethi',
    staffId: 'staff-real-04',
    staffName: 'Farhaan',
    serviceId: 'srv-01',
    serviceName: 'Haircut & Blowdry',
    date: '2026-10-25',
    startTime: '14:00',
    endTime: '14:45',
    price: 600,
    status: 'scheduled',
    notes: 'Demo test appointment',
    createdAt: new Date().toISOString(),
  })
  assert(!!tempApt.id, `Created demo appointment: ${tempApt.id}`)

  // Update appointment
  const updatedApt = appointmentStore.update(tempApt.id, {
    status: 'confirmed',
    notes: 'Confirmed for demo',
  })
  assert(updatedApt?.status === 'confirmed', 'Appointment status updated to confirmed')

  // Cancel appointment
  const cancelledApt = appointmentStore.update(tempApt.id, {
    status: 'cancelled',
  })
  assert(cancelledApt?.status === 'cancelled', 'Appointment successfully cancelled')

  // Clean up demo appointment
  appointmentStore.remove(tempApt.id)
  assert(!appointmentStore.getById(tempApt.id), 'Demo test appointment cleanly removed')

  // -------------------------------------------------------------------------
  // 5. ADMINISTRATOR VS OWNER PRIVILEGE SEPARATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 5: ADMINISTRATOR VS OWNER PRIVILEGE SEPARATION]')

  // 5a. Ordinary Owner attempts to delete another Owner
  let ownerDeleteOwnerBlocked = false
  try {
    await userService.deleteUser('user-owner-02', ownerSession)
  } catch (err: unknown) {
    ownerDeleteOwnerBlocked = true
    const msg = err instanceof Error ? err.message : ''
    assert(msg.includes('Only the system administrator can manage salon owner accounts'), `Owner deleting another owner blocked with: "${msg}"`)
  }
  assert(ownerDeleteOwnerBlocked, 'Ordinary owner blocked from deleting another Owner account')

  // 5b. Ordinary Owner attempts to delete Administrator
  let ownerDeleteAdminBlocked = false
  try {
    await userService.deleteUser('user-admin-01', ownerSession)
  } catch (err: unknown) {
    ownerDeleteAdminBlocked = true
    const msg = err instanceof Error ? err.message : ''
    assert(msg.includes('Root Administrator account cannot be deleted'), `Owner deleting Admin blocked with: "${msg}"`)
  }
  assert(ownerDeleteAdminBlocked, 'Ordinary owner blocked from deleting Root Administrator')

  // 5c. Ordinary Owner attempts to create an Owner account
  let ownerCreateOwnerBlocked = false
  try {
    await userService.createUser(
      {
        name: 'Intruder Owner',
        email: 'intruder@lumasalon.example.com',
        role: 'OWNER',
      },
      ownerSession
    )
  } catch (err: unknown) {
    ownerCreateOwnerBlocked = true
    const msg = err instanceof Error ? err.message : ''
    assert(msg.includes('Only the system administrator can create or manage salon owner accounts'), `Owner creating an Owner blocked with: "${msg}"`)
  }
  assert(ownerCreateOwnerBlocked, 'Ordinary owner blocked from creating Owner accounts')

  // 5d. Administrator attempts to create a 3rd Owner (enforcing maximum 2 owners constraint)
  let adminCapOwnersBlocked = false
  try {
    await userService.createUser(
      {
        name: 'Third Owner',
        email: 'owner3@lumasalon.example.com',
        role: 'OWNER',
      },
      adminSession
    )
  } catch (err: unknown) {
    adminCapOwnersBlocked = true
    const msg = err instanceof Error ? err.message : ''
    assert(msg.includes('maximum allowed 2 owners'), `Creating 3rd owner blocked with: "${msg}"`)
  }
  assert(adminCapOwnersBlocked, 'Maximum 2 owners constraint strictly enforced against Administrator')

  // -------------------------------------------------------------------------
  // 6. RAJESH VIP BOOKING RESTRICTION REPRESENTATION
  // -------------------------------------------------------------------------
  console.log('\n>>> [SECTION 6: RAJESH VIP BOOKING RESTRICTION REPRESENTATION]')

  // Test AI Assistant booking with VIP client Priya Sharma (cli-01) with Rajesh (staff-real-03)
  const vipBookingResponse = await bookingHandler.processBookingRequest({
    clientQuery: 'Priya Sharma',
    serviceQuery: 'Haircut & Blowdry',
    stylistQuery: 'Rajesh',
    date: '2026-10-20',
    startTime: '11:00',
  })

  assert(vipBookingResponse.type === 'error', 'AI Assistant rejected VIP booking with Rajesh')
  assert(
    vipBookingResponse.message.includes('fn_enforce_vip_booking_rules'),
    `Rejection message clearly references the database rule: "${vipBookingResponse.message}"`
  )
  assert(
    vipBookingResponse.message.includes('in-salon front-desk manual booking'),
    'Rejection explains that in-salon front-desk booking is required for VIP client with Rajesh'
  )

  // Test Non-VIP client booking with Rajesh via AI Assistant
  const nonVipBookingResponse = await bookingHandler.processBookingRequest({
    clientQuery: 'Rahul Sethi',
    serviceQuery: 'Haircut & Blowdry',
    stylistQuery: 'Rajesh',
    date: '2026-10-20',
    startTime: '11:00',
  })
  assert(nonVipBookingResponse.type === 'booking_preview', 'Non-VIP client can be booked with Rajesh via AI Assistant')

  console.log('\n======================================================================')
  console.log('🎉 ALL PHASE D CLIENT DEMO PREPARATION TESTS PASSED (100% COMPLIANCE)!')
  console.log('======================================================================')
}

void runPhaseDTestSuite()
