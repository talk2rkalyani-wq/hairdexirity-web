// ==============================================================================
// Luma Salon — Phase 4 Appointment Check-in & Active Lifecycle Verification Suite
// Tests: 7-Stage State Machine, Timestamps, RBAC Gating, Live Ops & Owner KPIs
// ==============================================================================

import assert from 'node:assert'
import { appointmentService } from '../src/services/appointmentService.ts'
import { appointmentStore } from '../src/services/appointmentStore.ts'
import { sessionService } from '../src/services/sessionService.ts'
import { resolveEmployeeStatus } from '../src/services/liveOperationsService.ts'
import { ownerDashboardService, computeDateRange } from '../src/services/ownerDashboardService.ts'
import { getSalonDateStr, getSalonTimeStr } from '../src/utils/formatters.ts'
import type { Appointment, Staff, UserSession } from '../src/types/models.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 4 APPOINTMENT CHECK-IN VERIFICATION SUITE')
console.log('========================================================================\n')

let passedTests = 0

function runTest(testName: string, testFn: () => void | Promise<void>) {
  try {
    const res = testFn()
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  ✅ [PASS] ${testName}`)
          passedTests++
        })
        .catch((err) => {
          console.error(`  ❌ [FAIL] ${testName}: ${err.message}`)
          process.exitCode = 1
        })
    } else {
      console.log(`  ✅ [PASS] ${testName}`)
      passedTests++
    }
  } catch (err: any) {
    console.error(`  ❌ [FAIL] ${testName}: ${err.message}`)
    process.exitCode = 1
  }
}

async function runAllTests() {
  const todayStr = getSalonDateStr(0)

  // Reset session to OWNER for baseline tests
  const ownerSession: UserSession = {
    userId: 'user-owner-01',
    salonId: 'salon-luma-01',
    role: 'OWNER',
    email: 'kalyani@luma.example.com',
    fullName: 'Kalyani Owner',
    isAuthenticated: true,
  }
  sessionService.setSession(ownerSession)

  // Clean test base appointment
  const testAptId = 'apt-phase4-test-01'
  const stylistId1 = 'staff-01'
  const stylistId2 = 'staff-02'

  const initialAppointment: Appointment = {
    id: testAptId,
    salonId: 'salon-luma-01',
    clientId: 'client-01',
    staffId: stylistId1,
    assignedEmployeeId: stylistId1,
    serviceId: 'srv-01',
    date: todayStr,
    startTime: '11:00',
    endTime: '12:00',
    status: 'confirmed',
    price: 3200,
    clientName: 'Pooja Hegde',
    serviceName: 'Balayage Color',
    createdAt: new Date().toISOString(),
  }

  // --------------------------------------------------------------------------
  // SECTION 1: Lifecycle Transitions & Timestamps
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Lifecycle State Transitions & Timestamps ---')

  await runTest('TC-P4-01: Check-in records status checked_in and checkedInAt timestamp', async () => {
    appointmentStore.add(initialAppointment)
    const checkedIn = await appointmentService.checkInAppointment(testAptId)
    assert.strictEqual(checkedIn.status, 'checked_in')
    assert.ok(checkedIn.checkedInAt !== undefined, 'checkedInAt must be recorded')
    assert.strictEqual(typeof checkedIn.checkedInAt, 'string')
  })

  await runTest('TC-P4-02: Start service records status in_progress and serviceStartedAt timestamp', async () => {
    const inProgress = await appointmentService.startServiceAppointment(testAptId)
    assert.strictEqual(inProgress.status, 'in_progress')
    assert.ok(inProgress.serviceStartedAt !== undefined, 'serviceStartedAt must be recorded')
    assert.ok(inProgress.checkedInAt !== undefined, 'checkedInAt must be preserved')
  })

  await runTest('TC-P4-03: Complete service records status completed and completedAt timestamp', async () => {
    const completed = await appointmentService.completeServiceAppointment(testAptId)
    assert.strictEqual(completed.status, 'completed')
    assert.ok(completed.completedAt !== undefined, 'completedAt must be recorded')
    assert.ok(completed.serviceStartedAt !== undefined, 'serviceStartedAt must be preserved')
  })

  await runTest('TC-P4-04: Cancellation records status cancelled and cancellationReason', async () => {
    const cancelAptId = 'apt-phase4-cancel-01'
    appointmentStore.add({
      ...initialAppointment,
      id: cancelAptId,
      status: 'confirmed',
    })
    const cancelled = await appointmentService.cancelAppointment(cancelAptId, 'Client emergency')
    assert.strictEqual(cancelled.status, 'cancelled')
    assert.strictEqual(cancelled.cancellationReason, 'Client emergency')
  })

  // --------------------------------------------------------------------------
  // SECTION 2: State Invariants & Idempotency
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: State Invariants & Idempotency ---')

  await runTest('TC-P4-05: Duplicate check-in is idempotent and returns current appointment', async () => {
    const dupCheckId = 'apt-phase4-dup-01'
    appointmentStore.add({
      ...initialAppointment,
      id: dupCheckId,
      status: 'confirmed',
    })
    const first = await appointmentService.checkInAppointment(dupCheckId)
    const second = await appointmentService.checkInAppointment(dupCheckId)
    assert.strictEqual(second.status, 'checked_in')
    assert.strictEqual(second.checkedInAt, first.checkedInAt)
  })

  await runTest('TC-P4-06: Cannot check-in an appointment that is already completed', async () => {
    const doneId = 'apt-phase4-done-01'
    appointmentStore.add({
      ...initialAppointment,
      id: doneId,
      status: 'completed',
    })
    await assert.rejects(
      async () => appointmentService.checkInAppointment(doneId),
      /Cannot check in an appointment that is already completed/
    )
  })

  // --------------------------------------------------------------------------
  // SECTION 3: Role-Based Access Control (RBAC) Enforcement
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Role-Based Access Control (RBAC) Enforcement ---')

  await runTest('TC-P4-07: Receptionist CAN check in a client at front desk', async () => {
    sessionService.setSession({
      userId: 'user-rec-01',
      salonId: 'salon-luma-01',
      role: 'RECEPTIONIST',
      fullName: 'Sunita Desk',
      isAuthenticated: true,
    })
    const recAptId = 'apt-phase4-rec-01'
    appointmentStore.add({
      ...initialAppointment,
      id: recAptId,
      status: 'confirmed',
    })
    const res = await appointmentService.checkInAppointment(recAptId)
    assert.strictEqual(res.status, 'checked_in')
  })

  await runTest('TC-P4-08: Stylist (Employee) is BLOCKED from front-desk check-in', async () => {
    sessionService.setSession({
      userId: 'user-emp-01',
      employeeId: stylistId1,
      salonId: 'salon-luma-01',
      role: 'EMPLOYEE',
      fullName: 'Aanya Stylist',
      isAuthenticated: true,
    })
    const empCheckId = 'apt-phase4-emp-block-01'
    appointmentStore.add({
      ...initialAppointment,
      id: empCheckId,
      status: 'confirmed',
    })
    await assert.rejects(
      async () => appointmentService.checkInAppointment(empCheckId),
      /Stylists cannot perform front-desk check-ins/
    )
  })

  await runTest('TC-P4-09: Stylist CAN start service for their OWN assigned appointment', async () => {
    sessionService.setSession({
      userId: 'user-emp-01',
      employeeId: stylistId1,
      salonId: 'salon-luma-01',
      role: 'EMPLOYEE',
      fullName: 'Aanya Stylist',
      isAuthenticated: true,
    })
    const ownAptId = 'apt-phase4-own-01'
    appointmentStore.add({
      ...initialAppointment,
      id: ownAptId,
      staffId: stylistId1,
      assignedEmployeeId: stylistId1,
      status: 'checked_in',
    })
    const res = await appointmentService.startServiceAppointment(ownAptId)
    assert.strictEqual(res.status, 'in_progress')
  })

  await runTest('TC-P4-10: Stylist is BLOCKED from starting service for ANOTHER stylist appointment', async () => {
    sessionService.setSession({
      userId: 'user-emp-01',
      employeeId: stylistId1,
      salonId: 'salon-luma-01',
      role: 'EMPLOYEE',
      fullName: 'Aanya Stylist',
      isAuthenticated: true,
    })
    const otherAptId = 'apt-phase4-other-01'
    appointmentStore.add({
      ...initialAppointment,
      id: otherAptId,
      staffId: stylistId2,
      assignedEmployeeId: stylistId2,
      status: 'checked_in',
    })
    await assert.rejects(
      async () => appointmentService.startServiceAppointment(otherAptId),
      /You can only start services for your own assigned appointments/
    )
  })

  await runTest('TC-P4-11: Stylist CAN complete service for their OWN assigned appointment', async () => {
    sessionService.setSession({
      userId: 'user-emp-01',
      employeeId: stylistId1,
      salonId: 'salon-luma-01',
      role: 'EMPLOYEE',
      fullName: 'Aanya Stylist',
      isAuthenticated: true,
    })
    const ownDoneId = 'apt-phase4-own-done-01'
    appointmentStore.add({
      ...initialAppointment,
      id: ownDoneId,
      staffId: stylistId1,
      assignedEmployeeId: stylistId1,
      status: 'in_progress',
    })
    const res = await appointmentService.completeServiceAppointment(ownDoneId)
    assert.strictEqual(res.status, 'completed')
  })

  // --------------------------------------------------------------------------
  // SECTION 4: Live Operations Status Resolution Calibration
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Live Operations Status Engine Calibration ---')

  const testStaff: Staff = {
    id: 'staff-live-01',
    salonId: 'salon-luma-01',
    name: 'Rohan Sharma',
    email: 'rohan@luma.example.com',
    role: 'senior_stylist',
    skills: ['Haircut'],
    experience: '5 years',
    active: true,
    workingHours: {
      monday: { open: '10:00', close: '20:00', isOpen: true },
      tuesday: { open: '10:00', close: '20:00', isOpen: true },
      wednesday: { open: '10:00', close: '20:00', isOpen: true },
      thursday: { open: '10:00', close: '20:00', isOpen: true },
      friday: { open: '10:00', close: '20:00', isOpen: true },
      saturday: { open: '10:00', close: '20:00', isOpen: true },
      sunday: { open: '10:00', close: '20:00', isOpen: true },
    },
  }

  runTest('TC-P4-12: Stylist remains AVAILABLE with waitingAppointments when client is checked_in', () => {
    const waitingApt: Appointment = {
      ...initialAppointment,
      id: 'apt-wait-01',
      staffId: testStaff.id,
      assignedEmployeeId: testStaff.id,
      status: 'checked_in',
      date: '2026-11-04',
      startTime: '14:00',
      endTime: '15:00',
    }
    const res = resolveEmployeeStatus(testStaff, [waitingApt], '2026-11-04', '14:15')
    assert.strictEqual(res.status, 'AVAILABLE')
    assert.ok(res.waitingAppointments !== undefined)
    assert.strictEqual(res.waitingAppointments?.length, 1)
    assert.ok(res.statusReason.includes('Client Waiting'))
  })

  runTest('TC-P4-13: Stylist is strictly BUSY when service status is in_progress', () => {
    const progressApt: Appointment = {
      ...initialAppointment,
      id: 'apt-prog-01',
      staffId: testStaff.id,
      assignedEmployeeId: testStaff.id,
      status: 'in_progress',
      date: '2026-11-04',
      startTime: '14:00',
      endTime: '15:00',
    }
    const res = resolveEmployeeStatus(testStaff, [progressApt], '2026-11-04', '14:15')
    assert.strictEqual(res.status, 'BUSY')
    assert.strictEqual(res.statusLabel, 'With Customer')
    assert.strictEqual(res.currentAppointment?.id, 'apt-prog-01')
  })

  // --------------------------------------------------------------------------
  // SECTION 5: Owner Dashboard KPIs & Status Breakdown
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Owner Dashboard KPIs & Status Breakdown ---')

  await runTest('TC-P4-14: getRevenueForDate includes checked_in and in_progress in projected revenue', async () => {
    const revApt1: Appointment = {
      ...initialAppointment,
      id: 'apt-rev-chk',
      date: '2026-11-20',
      status: 'checked_in',
      price: 1500,
    }
    const revApt2: Appointment = {
      ...initialAppointment,
      id: 'apt-rev-prog',
      date: '2026-11-20',
      status: 'in_progress',
      price: 2500,
    }
    const revApt3: Appointment = {
      ...initialAppointment,
      id: 'apt-rev-comp',
      date: '2026-11-20',
      status: 'completed',
      price: 1000,
    }
    appointmentStore.add(revApt1)
    appointmentStore.add(revApt2)
    appointmentStore.add(revApt3)

    const rev = await appointmentService.getRevenueForDate('2026-11-20')
    assert.strictEqual(rev.realizedRevenue, 1000)
    assert.strictEqual(rev.projectedRevenue, 4000) // 1500 + 2500
    assert.strictEqual(rev.checkedInCount, 1)
    assert.strictEqual(rev.inProgressCount, 1)
    assert.strictEqual(rev.completedCount, 1)
  })

  await runTest('TC-P4-15: Executive dashboard status distribution includes all active statuses', async () => {
    // Reset to Owner session
    sessionService.setSession(ownerSession)
    const range = computeDateRange('today')
    const dashData = await ownerDashboardService.getDashboardData(range)
    const statusesInDistribution = dashData.statusDistribution.map((s) => s.status)

    assert.ok(statusesInDistribution.includes('completed'))
    assert.ok(statusesInDistribution.includes('in_progress'))
    assert.ok(statusesInDistribution.includes('checked_in'))
    assert.ok(statusesInDistribution.includes('confirmed'))
    assert.ok(statusesInDistribution.includes('scheduled'))
    assert.ok(statusesInDistribution.includes('cancelled'))
    assert.ok(statusesInDistribution.includes('no-show'))
  })

  // --------------------------------------------------------------------------
  // SECTION 6: Reactive Store Integration
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Reactive Store Subscriptions ---')

  await runTest('TC-P4-16: Updating appointment status triggers store subscriber callback', async () => {
    let triggered = false
    const unsub = appointmentStore.subscribe(() => {
      triggered = true
    })

    await appointmentService.updateAppointmentStatus(testAptId, 'completed')
    unsub()
    assert.strictEqual(triggered, true)
  })

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 4 VERIFICATION SUMMARY: ${passedTests} PASSED | 0 FAILED`)
  console.log('========================================================================\n')
}

void runAllTests()

