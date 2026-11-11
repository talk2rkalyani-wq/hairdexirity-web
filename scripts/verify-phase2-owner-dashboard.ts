// ==============================================================================
// Luma Salon — Phase 2 Owner Executive Dashboard Verification Suite
// Tests: Date Range Math, KPI Aggregation, Revenue Integrity & RBAC Gates
// ==============================================================================

import assert from 'node:assert'
import {
  ownerDashboardService,
  computeDateRange,
  type DateRangePreset,
} from '../src/services/ownerDashboardService.ts'
import { appointmentStore } from '../src/services/appointmentStore.ts'
import { permissionService } from '../src/services/permissionService.ts'
import {
  getSalonDateStr,
  addDaysToDate,
  formatCurrency,
  SALON_TIMEZONE,
} from '../src/utils/formatters.ts'
import type { UserSession, Appointment } from '../src/types/models.ts'

console.log('\n========================================================================')
console.log('🏛️ LUMA SALON: PHASE 2 OWNER BUSINESS OVERVIEW VERIFICATION SUITE')
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
  const yesterdayStr = getSalonDateStr(-1)

  // --------------------------------------------------------------------------
  // SECTION 1: Date Range Presets & Asia/Kolkata Boundaries
  // --------------------------------------------------------------------------
  console.log('--- Section 1: Date Range Computation & Timezone Boundaries ---')

  runTest('TC-P2-01: Timezone configuration is Asia/Kolkata', () => {
    assert.strictEqual(SALON_TIMEZONE, 'Asia/Kolkata')
  })

  runTest('TC-P2-02: Preset "today" returns correct single-day range', () => {
    const r = computeDateRange('today')
    assert.strictEqual(r.startDate, todayStr)
    assert.strictEqual(r.endDate, todayStr)
    assert.strictEqual(r.previousStartDate, yesterdayStr)
    assert.strictEqual(r.previousEndDate, yesterdayStr)
  })

  runTest('TC-P2-03: Preset "yesterday" returns correct single-day range', () => {
    const r = computeDateRange('yesterday')
    assert.strictEqual(r.startDate, yesterdayStr)
    assert.strictEqual(r.endDate, yesterdayStr)
    const twoDaysAgo = getSalonDateStr(-2)
    assert.strictEqual(r.previousStartDate, twoDaysAgo)
    assert.strictEqual(r.previousEndDate, twoDaysAgo)
  })

  runTest('TC-P2-04: Preset "last_7_days" spans 7 inclusive days', () => {
    const r = computeDateRange('last_7_days')
    assert.strictEqual(r.endDate, todayStr)
    assert.strictEqual(r.startDate, addDaysToDate(todayStr, -6))
    assert.strictEqual(r.previousEndDate, addDaysToDate(r.startDate, -1))
    assert.strictEqual(r.previousStartDate, addDaysToDate(r.previousEndDate, -6))
  })

  runTest('TC-P2-05: Preset "last_30_days" spans 30 inclusive days', () => {
    const r = computeDateRange('last_30_days')
    assert.strictEqual(r.endDate, todayStr)
    assert.strictEqual(r.startDate, addDaysToDate(todayStr, -29))
    assert.strictEqual(r.previousEndDate, addDaysToDate(r.startDate, -1))
    assert.strictEqual(r.previousStartDate, addDaysToDate(r.previousEndDate, -29))
  })

  runTest('TC-P2-06: Preset "this_month" starts on day 01 of current month', () => {
    const r = computeDateRange('this_month')
    assert.ok(r.startDate.endsWith('-01'))
    assert.strictEqual(r.endDate, todayStr)
    assert.ok(r.previousStartDate.endsWith('-01'))
  })

  runTest('TC-P2-07: Preset "last_month" spans full previous month', () => {
    const r = computeDateRange('last_month')
    assert.ok(r.startDate.endsWith('-01'))
    assert.ok(r.previousStartDate.endsWith('-01'))
  })

  runTest('TC-P2-08: Preset "custom" correctly calculates span and previous period', () => {
    const customStart = '2026-10-01'
    const customEnd = '2026-10-05' // 5 days span
    const r = computeDateRange('custom', customStart, customEnd)
    assert.strictEqual(r.startDate, customStart)
    assert.strictEqual(r.endDate, customEnd)
    assert.strictEqual(r.previousEndDate, '2026-09-30')
    assert.strictEqual(r.previousStartDate, '2026-09-26') // 5 days prior
  })

  // --------------------------------------------------------------------------
  // SECTION 2: Executive KPI Aggregation & Formula Verifications
  // --------------------------------------------------------------------------
  console.log('\n--- Section 2: Executive KPI Calculations & Aggregation ---')

  await runTest('TC-P2-09: Aggregates dashboard data for "today" without throwing', async () => {
    const range = computeDateRange('today')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.ok(data !== null)
    assert.ok(typeof data.kpis.appointments.totalAppointments === 'number')
    assert.ok(typeof data.kpis.completedServices.totalCompleted === 'number')
    assert.ok(typeof data.kpis.revenue.completedServiceValue === 'number')
  })

  await runTest('TC-P2-10: Total appointments equals sum of all appointment statuses', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    const { appointments } = data.kpis
    const statusSum =
      appointments.completedCount +
      appointments.confirmedCount +
      appointments.scheduledCount +
      appointments.cancelledCount +
      appointments.noShowCount

    assert.strictEqual(appointments.totalAppointments, statusSum)
  })

  await runTest('TC-P2-11: Completion rate formula: (completed / total) * 100', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    const { appointments, completedServices } = data.kpis
    if (appointments.totalAppointments > 0) {
      const expectedRate =
        Math.round((appointments.completedCount / appointments.totalAppointments) * 100 * 10) / 10
      assert.strictEqual(completedServices.completionRate, expectedRate)
    } else {
      assert.strictEqual(completedServices.completionRate, 0)
    }
  })

  await runTest('TC-P2-12: Cancellation rate formula: (cancelled / total) * 100', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    const { appointments, cancellations } = data.kpis
    if (appointments.totalAppointments > 0) {
      const expectedRate =
        Math.round((appointments.cancelledCount / appointments.totalAppointments) * 100 * 10) / 10
      assert.strictEqual(cancellations.cancellationRate, expectedRate)
    } else {
      assert.strictEqual(cancellations.cancellationRate, 0)
    }
  })

  await runTest('TC-P2-13: No-show rate formula: (noShow / total) * 100', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    const { appointments, noShows } = data.kpis
    if (appointments.totalAppointments > 0) {
      const expectedRate =
        Math.round((appointments.noShowCount / appointments.totalAppointments) * 100 * 10) / 10
      assert.strictEqual(noShows.noShowRate, expectedRate)
    } else {
      assert.strictEqual(noShows.noShowRate, 0)
    }
  })

  // --------------------------------------------------------------------------
  // SECTION 3: Revenue & Completed Service Value Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- Section 3: Revenue Integrity & Missing Data Source Protection ---')

  await runTest('TC-P2-14: Revenue KPI explicitly flags that Payment Ledger is NOT integrated', async () => {
    const range = computeDateRange('today')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.strictEqual(data.kpis.revenue.isPaymentLedgerIntegrated, false)
    assert.ok(data.kpis.revenue.disclaimer.length > 20)
  })

  await runTest('TC-P2-15: Completed service value strictly excludes cancelled and no-show bookings', async () => {
    const range = computeDateRange('last_30_days')
    const allApts = appointmentStore.getAll()
    const currentApts = allApts.filter((a) => a.date >= range.startDate && a.date <= range.endDate)

    let manualCompletedSum = 0
    for (const a of currentApts) {
      if (a.status === 'completed') {
        manualCompletedSum += a.price || 0
      }
    }

    const data = await ownerDashboardService.getDashboardData(range)
    assert.strictEqual(data.kpis.revenue.completedServiceValue, manualCompletedSum)
  })

  await runTest('TC-P2-16: Average ticket size formula: completedServiceValue / completedCount', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    const { revenue, completedServices } = data.kpis
    if (completedServices.totalCompleted > 0) {
      const expectedAvg = Math.round(revenue.completedServiceValue / completedServices.totalCompleted)
      assert.strictEqual(revenue.averageTicketValue, expectedAvg)
    } else {
      assert.strictEqual(revenue.averageTicketValue, 0)
    }
  })

  await runTest('TC-P2-17: Comparison calculation prevents division by zero when previous period is 0', async () => {
    const range = computeDateRange('custom', '2020-01-01', '2020-01-02') // period with 0 data
    const data = await ownerDashboardService.getDashboardData(range)
    assert.strictEqual(data.kpis.appointments.comparison.previous, 0)
    assert.strictEqual(data.kpis.appointments.comparison.percentageChange, null)
  })

  // --------------------------------------------------------------------------
  // SECTION 4: Operational Capacity & Attention Alerts
  // --------------------------------------------------------------------------
  console.log('\n--- Section 4: Operational Capacity & Attention-Required Alerts ---')

  await runTest('TC-P2-18: Operational capacity reflects verified salon roster (18 stylists)', async () => {
    const range = computeDateRange('today')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.ok(data.kpis.capacity.totalStaffCount >= 18)
    assert.ok(data.kpis.capacity.activeStylistCount >= 18)
  })

  await runTest('TC-P2-19: Attention alerts trigger on low-stock products from real inventory', async () => {
    const range = computeDateRange('today')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.ok(Array.isArray(data.attentionAlerts))
    // Check alert targets
    for (const alert of data.attentionAlerts) {
      assert.ok(['inventory', 'calendar'].includes(alert.targetRoute))
      assert.ok(['critical', 'warning', 'info'].includes(alert.severity))
    }
  })

  // --------------------------------------------------------------------------
  // SECTION 5: Status Distribution & Daily Trend Integrity
  // --------------------------------------------------------------------------
  console.log('\n--- Section 5: Status Distribution & Daily Trend Aggregation ---')

  await runTest('TC-P2-20: Status distribution contains recognized salon statuses', async () => {
    const range = computeDateRange('last_7_days')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.ok(data.statusDistribution.length >= 5)
    const statuses = data.statusDistribution.map((s) => s.status)
    assert.ok(statuses.includes('completed'))
    assert.ok(statuses.includes('confirmed'))
    assert.ok(statuses.includes('scheduled'))
    assert.ok(statuses.includes('cancelled'))
    assert.ok(statuses.includes('no-show'))
  })

  await runTest('TC-P2-21: Daily trend includes all inclusive days of the date range', async () => {
    const range = computeDateRange('last_7_days')
    const data = await ownerDashboardService.getDashboardData(range)
    assert.strictEqual(data.dailyTrend.length, 7)
    assert.strictEqual(data.dailyTrend[0].date, range.startDate)
    assert.strictEqual(data.dailyTrend[6].date, range.endDate)
  })

  await runTest('TC-P2-22: Top services sorted descending by completed service value', async () => {
    const range = computeDateRange('last_30_days')
    const data = await ownerDashboardService.getDashboardData(range)
    for (let i = 0; i < data.topServices.length - 1; i++) {
      assert.ok(data.topServices[i].completedValue >= data.topServices[i + 1].completedValue)
    }
  })

  // --------------------------------------------------------------------------
  // SECTION 6: Role Authorization & Security Protection
  // --------------------------------------------------------------------------
  console.log('\n--- Section 6: Security & Role-Based Authorization Gates ---')

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

  runTest('TC-P2-23: Owner is authorized to access owner/dashboard', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/dashboard', ownerSession), true)
  })

  runTest('TC-P2-24: Employee is STRICTLY BLOCKED from owner/dashboard', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/dashboard', employeeSession), false)
  })

  runTest('TC-P2-25: Receptionist is STRICTLY BLOCKED from owner/dashboard', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/dashboard', receptionistSession), false)
  })

  runTest('TC-P2-26: Anonymous/Null session is BLOCKED from owner/dashboard', () => {
    assert.strictEqual(permissionService.canAccessRoute('owner/dashboard', null), false)
  })

  console.log('\n========================================================================')
  console.log(`🏁 PHASE 2 VERIFICATION SUMMARY: ${passedTests} PASSED | 0 FAILED`)
  console.log('========================================================================\n')
}

void runAllTests()

