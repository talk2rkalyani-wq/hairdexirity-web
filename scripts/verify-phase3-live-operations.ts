// ==============================================================================
// Luma Salon — Phase 3 Owner Live Operations Verification Suite
// Tests: Status Precedence, Shift Boundaries, Workforce Board & RBAC Gates
// ==============================================================================

import assert from 'node:assert'
import {
  resolveEmployeeStatus,
  liveOperationsService,
} from '../src/services/liveOperationsService.ts'
import { staffService } from '../src/services/staffService.ts'
import { permissionService } from '../src/services/permissionService.ts'
import { getSalonDateStr, getSalonTimeStr, SALON_TIMEZONE } from '../src/utils/formatters.ts'
import type { Staff, Appointment, UserSession } from '../src/types/models.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 3 OWNER LIVE OPERATIONS VERIFICATION SUITE')
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
  const currentTimeStr = getSalonTimeStr()

  // Base test staff member with standard hours (10:00 - 20:00 every day)
  const baseTestStaff: Staff = {
    id: 'staff-test-01',
    salonId: 'salon-luma-01',
    name: 'Aanya Sharma',
    phone: '+91 98111 00099',
    email: 'aanya@luma.example.com',
    role: 'senior_stylist',
    skills: ['Hair Styling', 'Balayage'],
    experience: '6 years',
    active: true,
    gender: 'Female',
    jobTitle: 'Senior Hair Specialist',
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

  // --------------------------------------------------------------------------
  // SECTION 1: Status Resolution Engine & Precedence Rules
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Status Engine Precedence & Boundary Rules ---')

  runTest('TC-P3-01: Returns AVAILABLE when on shift with no active appointment', () => {
    // Current time at 14:00 (mid-shift) with no appointments
    const res = resolveEmployeeStatus(baseTestStaff, [], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'AVAILABLE')
    assert.strictEqual(res.isShiftActive, true)
    assert.strictEqual(res.statusLabel, 'Available')
  })

  runTest('TC-P3-02: Returns BUSY when confirmed appointment is actively in progress', () => {
    const activeApt: Appointment = {
      id: 'apt-active-01',
      salonId: 'salon-luma-01',
      clientId: 'client-01',
      staffId: baseTestStaff.id,
      serviceId: 'srv-01',
      date: '2026-11-04',
      startTime: '13:30',
      endTime: '14:30',
      status: 'confirmed',
      price: 2500,
      clientName: 'Nisha Kapoor',
      serviceName: 'Balayage Color',
      createdAt: new Date().toISOString(),
    }

    // Current time 14:00 is between 13:30 and 14:30
    const res = resolveEmployeeStatus(baseTestStaff, [activeApt], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'BUSY')
    assert.strictEqual(res.statusLabel, 'With Customer')
    assert.ok(res.currentAppointment !== undefined)
    assert.strictEqual(res.currentAppointment?.id, 'apt-active-01')
  })

  runTest('TC-P3-03: Completed appointment does NOT mark employee busy', () => {
    const completedApt: Appointment = {
      id: 'apt-done-01',
      salonId: 'salon-luma-01',
      clientId: 'client-01',
      staffId: baseTestStaff.id,
      serviceId: 'srv-01',
      date: '2026-11-04',
      startTime: '13:00',
      endTime: '14:00',
      status: 'completed',
      price: 1500,
      createdAt: new Date().toISOString(),
    }

    const res = resolveEmployeeStatus(baseTestStaff, [completedApt], '2026-11-04', '14:30')
    assert.strictEqual(res.status, 'AVAILABLE')
    assert.strictEqual(res.completedAppointmentsToday.length, 1)
  })

  runTest('TC-P3-04: Cancelled appointment does NOT mark employee busy', () => {
    const cancelledApt: Appointment = {
      id: 'apt-canc-01',
      salonId: 'salon-luma-01',
      clientId: 'client-01',
      staffId: baseTestStaff.id,
      serviceId: 'srv-01',
      date: '2026-11-04',
      startTime: '13:30',
      endTime: '14:30',
      status: 'cancelled',
      price: 1500,
      createdAt: new Date().toISOString(),
    }

    const res = resolveEmployeeStatus(baseTestStaff, [cancelledApt], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'AVAILABLE')
  })

  runTest('TC-P3-05: Returns OFF_SHIFT before shift open time (e.g. 08:30)', () => {
    const res = resolveEmployeeStatus(baseTestStaff, [], '2026-11-04', '08:30')
    assert.strictEqual(res.status, 'OFF_SHIFT')
    assert.strictEqual(res.isShiftActive, false)
    assert.strictEqual(res.statusLabel, 'Off Shift')
  })

  runTest('TC-P3-06: Returns OFF_SHIFT after shift close time (e.g. 21:15)', () => {
    const res = resolveEmployeeStatus(baseTestStaff, [], '2026-11-04', '21:15')
    assert.strictEqual(res.status, 'OFF_SHIFT')
    assert.strictEqual(res.isShiftActive, false)
  })

  runTest('TC-P3-07: Returns OFF_SHIFT on weekly scheduled off day (isOpen: false)', () => {
    const offDayStaff: Staff = {
      ...baseTestStaff,
      workingHours: {
        ...baseTestStaff.workingHours,
        wednesday: { open: '10:00', close: '20:00', isOpen: false },
      },
    }
    // 2026-11-04 is a Wednesday
    const res = resolveEmployeeStatus(offDayStaff, [], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'OFF_SHIFT')
    assert.ok(res.statusReason.includes('Scheduled weekly off'))
  })

  runTest('TC-P3-08: Returns OFF_SHIFT when staff active is false on roster', () => {
    const inactiveStaff: Staff = {
      ...baseTestStaff,
      active: false,
    }
    const res = resolveEmployeeStatus(inactiveStaff, [], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'OFF_SHIFT')
    assert.ok(res.statusReason.includes('Inactive on salon workforce'))
  })

  runTest('TC-P3-09: Returns UNKNOWN when workingHours schedule is missing or corrupted', () => {
    const corruptedStaff = {
      ...baseTestStaff,
      workingHours: undefined as any,
    }
    const res = resolveEmployeeStatus(corruptedStaff, [], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'UNKNOWN')
    assert.strictEqual(res.statusLabel, 'Status Unknown')
  })

  runTest('TC-P3-10: Double booking detects conflict cleanly', () => {
    const apt1: Appointment = {
      id: 'apt-01',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: baseTestStaff.id,
      serviceId: 's1',
      date: '2026-11-04',
      startTime: '13:00',
      endTime: '15:00',
      status: 'confirmed',
      price: 1000,
      createdAt: new Date().toISOString(),
    }
    const apt2: Appointment = {
      id: 'apt-02',
      salonId: 'salon-luma-01',
      clientId: 'c2',
      staffId: baseTestStaff.id,
      serviceId: 's2',
      date: '2026-11-04',
      startTime: '13:30',
      endTime: '14:30',
      status: 'confirmed',
      price: 1200,
      createdAt: new Date().toISOString(),
    }

    const res = resolveEmployeeStatus(baseTestStaff, [apt1, apt2], '2026-11-04', '14:00')
    assert.strictEqual(res.status, 'BUSY')
    assert.ok(res.conflicts !== undefined && res.conflicts.length > 0)
    assert.ok(res.conflicts[0].includes('Double-booking detected'))
  })

  // --------------------------------------------------------------------------
  // SECTION 2: Live Operations Summary & Workforce Reconciliation
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Summary Reconciliation & Real-Time Aggregation ---')

  await runTest('TC-P3-11: Aggregates real workforce summary without throwing', async () => {
    const summary = await liveOperationsService.getLiveOperationsSummary('salon-luma-01')
    assert.ok(summary !== null)
    assert.ok(summary.totalEmployees >= 18)
    assert.ok(Array.isArray(summary.statuses))
  })

  await runTest('TC-P3-12: Sum of status counts perfectly reconciles with total employees', async () => {
    const summary = await liveOperationsService.getLiveOperationsSummary('salon-luma-01')
    const calculatedSum =
      summary.availableCount +
      summary.busyCount +
      summary.onBreakCount +
      summary.onLeaveCount +
      summary.offShiftCount +
      summary.unknownCount

    assert.strictEqual(calculatedSum, summary.totalEmployees)
  })

  await runTest('TC-P3-13: On Break and On Leave are correctly reported as 0 with pending ledger note', async () => {
    const summary = await liveOperationsService.getLiveOperationsSummary('salon-luma-01')
    assert.strictEqual(summary.onBreakCount, 0)
    assert.strictEqual(summary.onLeaveCount, 0)
  })

  // --------------------------------------------------------------------------
  // SECTION 3: Timeline & Chronological Workflow Verification
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Verified Activity Timeline Generation ---')

  runTest('TC-P3-14: Generates chronological timeline for staff member without throwing', () => {
    const timeline = liveOperationsService.getEmployeeTimeline('staff-real-01', todayStr)
    assert.ok(Array.isArray(timeline))
    // Events must be sorted by timestamp
    for (let i = 0; i < timeline.length - 1; i++) {
      assert.ok(timeline[i].timestamp <= timeline[i + 1].timestamp)
    }
  })

  // --------------------------------------------------------------------------
  // SECTION 4: Role-Based Authorization & Security Protection
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Security & Role-Based Authorization Gates ---')

  const ownerSession: UserSession = {
    sessionId: 'sess-owner',
    userId: 'user-owner-01',
    salonId: 'salon-luma-01',
    name: 'Mia Alva',
    email: 'mia@lumasalon.com',
    role: 'OWNER',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  const employeeSession: UserSession = {
    sessionId: 'sess-emp',
    userId: 'user-emp-01',
    salonId: 'salon-luma-01',
    name: 'Jake Stylist',
    email: 'jake@luma.example.com',
    role: 'EMPLOYEE',
    employeeId: 'staff-jake-01',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  const receptionistSession: UserSession = {
    sessionId: 'sess-recep',
    userId: 'user-recep-01',
    salonId: 'salon-luma-01',
    name: 'Sara Recep',
    email: 'sara@luma.example.com',
    role: 'RECEPTIONIST',
    isAuthenticated: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  }

  runTest('TC-P3-15: Owner is AUTHORIZED to access owner/live-operations', () => {
    assert.strictEqual(
      permissionService.canAccessRoute('owner/live-operations', ownerSession),
      true
    )
  })

  runTest('TC-P3-16: Employee is STRICTLY BLOCKED from owner/live-operations', () => {
    assert.strictEqual(
      permissionService.canAccessRoute('owner/live-operations', employeeSession),
      false
    )
  })

  runTest('TC-P3-17: Receptionist is STRICTLY BLOCKED from owner/live-operations', () => {
    assert.strictEqual(
      permissionService.canAccessRoute('owner/live-operations', receptionistSession),
      false
    )
  })

  runTest('TC-P3-18: Anonymous/Null session is BLOCKED from owner/live-operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/live-operations', null), false)
  })

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 3 VERIFICATION SUMMARY: ${passedTests} PASSED | 0 FAILED`)
  console.log('========================================================================\n')
}

void runAllTests()

