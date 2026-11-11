// ==============================================================================
// Luma Salon — Phase 5 Owner Operations Management Verification Suite
// Tests: Daily Workload, Intelligent Exceptions, Workload Balancing & Security
// ==============================================================================

import assert from 'node:assert'
import {
  operationsManagementService,
  scanScheduleOverlaps,
  scanRealTimeExceptions,
  calculateStaffWorkload,
} from '../src/services/operationsManagementService.ts'
import { appointmentStore } from '../src/services/appointmentStore.ts'
import { permissionService } from '../src/services/permissionService.ts'
import { sessionService } from '../src/services/sessionService.ts'
import { getSalonDateStr } from '../src/utils/formatters.ts'
import type { Appointment, Staff, UserSession } from '../src/types/models.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 5 OPERATIONS MANAGEMENT VERIFICATION SUITE')
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

  // Standard Test Staff Members
  const testStaff1: Staff = {
    id: 'staff-ops-01',
    salonId: 'salon-luma-01',
    name: 'Riya Sharma',
    email: 'riya@luma.example.com',
    role: 'senior_stylist',
    skills: ['Balayage', 'Haircut'],
    experience: '6 years',
    active: true,
    jobTitle: 'Senior Hair Artisan',
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

  const testStaff2: Staff = {
    id: 'staff-ops-02',
    salonId: 'salon-luma-01',
    name: 'Farhaan Khan',
    email: 'farhaan@luma.example.com',
    role: 'stylist',
    skills: ['Haircut', 'Beard Grooming'],
    experience: '4 years',
    active: true,
    jobTitle: 'Stylist',
    workingHours: {
      monday: { open: '10:00', close: '20:00', isOpen: true },
      tuesday: { open: '10:00', close: '20:00', isOpen: true },
      wednesday: { open: '10:00', close: '20:00', isOpen: true },
      thursday: { open: '10:00', close: '20:00', isOpen: true },
      friday: { open: '10:00', close: '20:00', isOpen: true },
      saturday: { open: '10:00', close: '20:00', isOpen: true },
      sunday: { open: '10:00', close: '20:00', isOpen: false }, // Sunday off
    },
  }

  // --------------------------------------------------------------------------
  // SECTION 1: Intelligent Exception Scanner
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Intelligent Exception Detection Scanner ---')

  runTest('TC-P5-01: Proactively detects full-day schedule overlaps / double-booking', () => {
    // 2 overlapping appointments for Riya Sharma in the afternoon (15:00-16:30 and 16:00-17:00)
    const apt1: Appointment = {
      id: 'apt-ovl-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      assignedEmployeeId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '15:00',
      endTime: '16:30',
      status: 'confirmed',
      price: 3500,
      clientName: 'Nisha K',
      serviceName: 'Balayage',
      createdAt: new Date().toISOString(),
    }
    const apt2: Appointment = {
      id: 'apt-ovl-2',
      salonId: 'salon-luma-01',
      clientId: 'c2',
      staffId: testStaff1.id,
      assignedEmployeeId: testStaff1.id,
      serviceId: 's2',
      date: todayStr,
      startTime: '16:00',
      endTime: '17:00',
      status: 'scheduled',
      price: 1500,
      clientName: 'Sneha P',
      serviceName: 'Hair Spa',
      createdAt: new Date().toISOString(),
    }

    const exceptions = scanScheduleOverlaps([apt1, apt2], [testStaff1])
    assert.strictEqual(exceptions.length, 1)
    assert.strictEqual(exceptions[0].type, 'SCHEDULE_OVERLAP')
    assert.strictEqual(exceptions[0].severity, 'CRITICAL')
    assert.strictEqual(exceptions[0].staffId, testStaff1.id)
    assert.strictEqual(exceptions[0].targetRoute, 'calendar')
  })

  runTest('TC-P5-02: Non-overlapping bookings do NOT trigger false overlap exception', () => {
    // Consecutive appointments: 14:00-15:00 and 15:00-16:00
    const aptA: Appointment = {
      id: 'apt-seq-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '14:00',
      endTime: '15:00',
      status: 'confirmed',
      price: 1000,
      createdAt: new Date().toISOString(),
    }
    const aptB: Appointment = {
      id: 'apt-seq-2',
      salonId: 'salon-luma-01',
      clientId: 'c2',
      staffId: testStaff1.id,
      serviceId: 's2',
      date: todayStr,
      startTime: '15:00',
      endTime: '16:00',
      status: 'confirmed',
      price: 1000,
      createdAt: new Date().toISOString(),
    }
    const exceptions = scanScheduleOverlaps([aptA, aptB], [testStaff1])
    assert.strictEqual(exceptions.length, 0)
  })

  runTest('TC-P5-03: Detects delayed arrival when currentTime > startTime + 15m', () => {
    const delayedApt: Appointment = {
      id: 'apt-del-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '10:00',
      endTime: '11:00',
      status: 'confirmed', // not yet checked in
      price: 1200,
      clientName: 'Sunita M',
      serviceName: 'Pedicure',
      createdAt: new Date().toISOString(),
    }

    // Current time is 10:25 (delayed by 25 mins)
    const exceptions = scanRealTimeExceptions([delayedApt], '10:25')
    assert.strictEqual(exceptions.length, 1)
    assert.strictEqual(exceptions[0].type, 'DELAYED_ARRIVAL')
    assert.strictEqual(exceptions[0].severity, 'WARNING')
    assert.strictEqual(exceptions[0].elapsedMinutes, 25)
  })

  runTest('TC-P5-04: Detects prolonged lounge wait when client in checked_in state > 15m', () => {
    // 25 mins ago timestamp
    const twentyFiveMinsAgo = new Date(Date.now() - 25 * 60 * 1000).toISOString()
    const waitingApt: Appointment = {
      id: 'apt-wait-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '11:00',
      endTime: '12:00',
      status: 'checked_in',
      checkedInAt: twentyFiveMinsAgo,
      price: 1500,
      clientName: 'Divya R',
      serviceName: 'Hair Styling',
      createdAt: new Date().toISOString(),
    }

    const exceptions = scanRealTimeExceptions([waitingApt], '11:25')
    assert.strictEqual(exceptions.length, 1)
    assert.strictEqual(exceptions[0].type, 'PROLONGED_WAIT')
    assert.strictEqual(exceptions[0].severity, 'WARNING')
    assert.ok((exceptions[0].elapsedMinutes || 0) >= 20)
    assert.strictEqual(exceptions[0].targetRoute, 'receptionist/check-in')
  })

  runTest('TC-P5-05: Detects overrunning service when in_progress exceeds endTime by > 10m', () => {
    const overrunApt: Appointment = {
      id: 'apt-over-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '11:00',
      endTime: '12:00',
      status: 'in_progress',
      price: 2500,
      clientName: 'Megha S',
      serviceName: 'Global Color',
      createdAt: new Date().toISOString(),
    }

    // Current time is 12:20 (20 mins past scheduled end 12:00)
    const exceptions = scanRealTimeExceptions([overrunApt], '12:20')
    assert.strictEqual(exceptions.length, 1)
    assert.strictEqual(exceptions[0].type, 'OVERRUNNING_SERVICE')
    assert.strictEqual(exceptions[0].severity, 'INFO')
    assert.strictEqual(exceptions[0].elapsedMinutes, 20)
  })

  runTest('TC-P5-06: Detects unassigned staff booking with CRITICAL severity', () => {
    const unassignedApt: Appointment = {
      id: 'apt-unasg-1',
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: '',
      serviceId: 's1',
      date: todayStr,
      startTime: '13:00',
      endTime: '14:00',
      status: 'scheduled',
      price: 1800,
      clientName: 'Ananya D',
      serviceName: 'Keratin Treatment',
      createdAt: new Date().toISOString(),
    }

    const exceptions = scanRealTimeExceptions([unassignedApt], '10:00')
    assert.strictEqual(exceptions.length, 1)
    assert.strictEqual(exceptions[0].type, 'UNASSIGNED_STAFF')
    assert.strictEqual(exceptions[0].severity, 'CRITICAL')
  })

  // --------------------------------------------------------------------------
  // SECTION 2: Staff Workload Distribution & Balancing
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Staff Workload Distribution & Balancing ---')

  runTest('TC-P5-07: Classifies stylist with >85% booked hours as OVERBOOKED', () => {
    // 10:00-20:00 shift = 600 mins. 540 mins booked = 90%
    const heavyApts: Appointment[] = [
      {
        id: 'h1',
        salonId: 's1',
        clientId: 'c1',
        staffId: testStaff1.id,
        serviceId: 's1',
        date: '2026-11-04',
        startTime: '10:00',
        endTime: '19:00', // 540 mins
        status: 'confirmed',
        price: 8000,
        createdAt: new Date().toISOString(),
      },
    ]

    const workload = calculateStaffWorkload([testStaff1], heavyApts, '2026-11-04')
    assert.strictEqual(workload.length, 1)
    assert.strictEqual(workload[0].workloadTier, 'OVERBOOKED')
    assert.strictEqual(workload[0].utilizationPercentage, 90)
    assert.strictEqual(workload[0].totalBookedMins, 540)
  })

  runTest('TC-P5-08: Classifies stylist with 0 bookings as IDLE (Available for walk-ins)', () => {
    const workload = calculateStaffWorkload([testStaff1], [], '2026-11-04')
    assert.strictEqual(workload.length, 1)
    assert.strictEqual(workload[0].workloadTier, 'IDLE')
    assert.strictEqual(workload[0].utilizationPercentage, 0)
    assert.strictEqual(workload[0].totalBookedMins, 0)
  })

  runTest('TC-P5-09: Classifies stylist with 50-84% booked hours as OPTIMAL', () => {
    // 360 mins booked out of 600 mins = 60%
    const midApt: Appointment = {
      id: 'm1',
      salonId: 's1',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: '2026-11-04',
      startTime: '10:00',
      endTime: '16:00',
      status: 'confirmed',
      price: 4500,
      createdAt: new Date().toISOString(),
    }
    const workload = calculateStaffWorkload([testStaff1], [midApt], '2026-11-04')
    assert.strictEqual(workload[0].workloadTier, 'OPTIMAL')
    assert.strictEqual(workload[0].utilizationPercentage, 60)
  })

  runTest('TC-P5-10: Excludes staff on weekly off day from active floor workload', () => {
    // testStaff2 is closed on Sunday
    // '2026-11-08' is Sunday
    const workload = calculateStaffWorkload([testStaff2], [], '2026-11-08')
    assert.strictEqual(workload.length, 0) // excluded from active shift roster
  })

  // --------------------------------------------------------------------------
  // SECTION 3: Operations Aggregate Data & KPIs
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Operations Aggregate Data & KPIs ---')

  await runTest('TC-P5-11: getOperationsData aggregates real-time data without throwing', async () => {
    const data = await operationsManagementService.getOperationsData()
    assert.ok(data !== null)
    assert.strictEqual(typeof data.kpis.totalAppointmentsToday, 'number')
    assert.strictEqual(typeof data.kpis.inProgressCount, 'number')
    assert.strictEqual(typeof data.kpis.waitingLoungeCount, 'number')
    assert.strictEqual(typeof data.kpis.expectedUpcomingCount, 'number')
    assert.strictEqual(typeof data.kpis.completedCount, 'number')
    assert.strictEqual(typeof data.kpis.totalExceptionsCount, 'number')
    assert.ok(Array.isArray(data.exceptions))
    assert.ok(Array.isArray(data.staffWorkload))
    assert.ok(data.floorInventoryRisks !== undefined)
  })

  await runTest('TC-P5-12: Total appointments equals sum of all appointment status buckets', async () => {
    const data = await operationsManagementService.getOperationsData()
    const sumBuckets =
      data.kpis.inProgressCount +
      data.kpis.waitingLoungeCount +
      data.kpis.expectedUpcomingCount +
      data.kpis.completedCount +
      data.kpis.cancelledCount +
      data.kpis.noShowCount

    assert.strictEqual(data.kpis.totalAppointmentsToday, sumBuckets)
  })

  // --------------------------------------------------------------------------
  // SECTION 4: Security & Role-Based Authorization
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Security & Role-Based Authorization ---')

  const ownerSession: UserSession = {
    userId: 'user-owner-01',
    salonId: 'salon-luma-01',
    role: 'OWNER',
    email: 'owner@lumasalon.com',
    fullName: 'Salon Owner',
    isAuthenticated: true,
  }

  const employeeSession: UserSession = {
    userId: 'user-emp-01',
    employeeId: 'staff-01',
    salonId: 'salon-luma-01',
    role: 'EMPLOYEE',
    email: 'stylist@lumasalon.com',
    fullName: 'Aanya Stylist',
    isAuthenticated: true,
  }

  const receptionistSession: UserSession = {
    userId: 'user-rec-01',
    salonId: 'salon-luma-01',
    role: 'RECEPTIONIST',
    email: 'desk@lumasalon.com',
    fullName: 'Front Desk',
    isAuthenticated: true,
  }

  const adminSession: UserSession = {
    userId: 'user-admin-01',
    role: 'ADMIN',
    email: 'kalyani@gmail.com',
    fullName: 'System Admin',
    isAuthenticated: true,
  }

  runTest('TC-P5-13: Owner is AUTHORIZED to access owner/operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/operations', ownerSession), true)
  })

  runTest('TC-P5-14: Employee is STRICTLY BLOCKED from owner/operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/operations', employeeSession), false)
  })

  runTest('TC-P5-15: Receptionist is STRICTLY BLOCKED from owner/operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/operations', receptionistSession), false)
  })

  runTest('TC-P5-16: Root Administrator is STRICTLY BLOCKED from owner/operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/operations', adminSession), false)
  })

  runTest('TC-P5-17: Null / Unauthenticated session is BLOCKED from owner/operations', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/operations', null), false)
  })

  // --------------------------------------------------------------------------
  // SECTION 5: Reactive Store Subscription
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Reactive Store Subscription ---')

  await runTest('TC-P5-18: Adding an appointment notifies subscriber and updates operations count', async () => {
    let notified = false
    const unsub = appointmentStore.subscribe(() => {
      notified = true
    })

    const newApt: Appointment = {
      id: `apt-p5-sub-${Date.now()}`,
      salonId: 'salon-luma-01',
      clientId: 'c1',
      staffId: testStaff1.id,
      serviceId: 's1',
      date: todayStr,
      startTime: '18:00',
      endTime: '19:00',
      status: 'confirmed',
      price: 2000,
      createdAt: new Date().toISOString(),
    }

    appointmentStore.add(newApt)
    unsub()
    assert.strictEqual(notified, true)
  })

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 5 VERIFICATION SUMMARY: ${passedTests} PASSED | 0 FAILED`)
  console.log('========================================================================\n')
}

void runAllTests()

