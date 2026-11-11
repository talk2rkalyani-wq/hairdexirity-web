// ==============================================================================
// Luma Salon — Owner Executive Dashboard Service (Phase 2)
// Real-Time Business Metrics, Revenue Analytics & Executive Insights
// ==============================================================================

import type { AppointmentStatus } from '../types/models.ts'
import type { InventoryProduct } from '../types/inventory.ts'
import { appointmentStore } from './appointmentStore.ts'
import { inventoryService } from './inventoryService.ts'
import { staffService } from './staffService.ts'
import { isLowStock, isOutOfStock } from '../config/inventoryConfig.ts'
import {
  getSalonDateStr,
  getSalonTimeStr,
  addDaysToDate,
  timeToMinutes,
} from '../utils/formatters.ts'

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'custom'

export interface DateRange {
  preset: DateRangePreset
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  label: string
  previousStartDate: string
  previousEndDate: string
}

export interface MetricComparison {
  current: number
  previous: number
  absoluteChange: number
  percentageChange: number | null // null when previous is 0
  trend: 'up' | 'down' | 'neutral'
}

export interface AppointmentKpiData {
  totalAppointments: number
  confirmedCount: number
  completedCount: number
  scheduledCount: number
  checkedInCount?: number
  inProgressStatusCount?: number
  cancelledCount: number
  noShowCount: number
  inProgressCount: number // currently ongoing based on salon time (for today)
  comparison: MetricComparison
}

export interface CompletedServicesKpiData {
  totalCompleted: number
  completionRate: number // percentage
  comparison: MetricComparison
}

export interface RevenueKpiData {
  /**
   * Value of completed services based on appointment prices.
   * NOTE: As per Phase 2 audit, payment/billing transaction schema is not yet integrated.
   * This represents completed service value, not collected payment gateway receipts.
   */
  completedServiceValue: number
  projectedServiceValue: number // scheduled + confirmed
  averageTicketValue: number // completedServiceValue / totalCompleted
  comparison: MetricComparison
  /** Data source limitation indicator */
  isPaymentLedgerIntegrated: false
  disclaimer: string
}

export interface CancellationKpiData {
  totalCancelled: number
  cancellationRate: number // percentage of total
  comparison: MetricComparison
}

export interface NoShowKpiData {
  totalNoShows: number
  noShowRate: number // percentage of total
  comparison: MetricComparison
}

export interface OperationalCapacityKpiData {
  totalStaffCount: number
  activeStylistCount: number
  appointmentsPerActiveStylist: number
}

export interface DailyTrendPoint {
  date: string
  displayDate: string
  dayOfWeek: string
  totalAppointments: number
  completedAppointments: number
  cancelledAppointments: number
  noShowAppointments: number
  completedServiceValue: number
}

export interface ServicePerformanceItem {
  serviceId: string
  serviceName: string
  category?: string
  appointmentCount: number
  completedCount: number
  completedValue: number
  sharePercentage: number
}

export interface StylistPerformanceItem {
  staffId: string
  staffName: string
  role?: string
  appointmentCount: number
  completedCount: number
  completedValue: number
}

export interface AttentionAlert {
  id: string
  type: 'inventory_critical' | 'inventory_low' | 'high_cancellations' | 'high_no_shows'
  severity: 'critical' | 'warning' | 'info'
  title: string
  description: string
  actionLabel: string
  targetRoute: 'inventory' | 'calendar'
  count?: number
}

export interface ExecutiveDashboardData {
  selectedRange: DateRange
  lastUpdated: string
  salonTime: string
  kpis: {
    appointments: AppointmentKpiData
    completedServices: CompletedServicesKpiData
    revenue: RevenueKpiData
    cancellations: CancellationKpiData
    noShows: NoShowKpiData
    capacity: OperationalCapacityKpiData
  }
  statusDistribution: {
    status: AppointmentStatus
    label: string
    count: number
    percentage: number
    color: string
  }[]
  dailyTrend: DailyTrendPoint[]
  topServices: ServicePerformanceItem[]
  stylistActivity: StylistPerformanceItem[]
  attentionAlerts: AttentionAlert[]
}

/**
 * Computes date range boundaries in Asia/Kolkata timezone
 */
export function computeDateRange(
  preset: DateRangePreset,
  customStart?: string,
  customEnd?: string
): DateRange {
  const today = getSalonDateStr(0)
  const yesterday = getSalonDateStr(-1)

  switch (preset) {
    case 'today':
      return {
        preset: 'today',
        startDate: today,
        endDate: today,
        label: "Today's Overview",
        previousStartDate: yesterday,
        previousEndDate: yesterday,
      }

    case 'yesterday': {
      const twoDaysAgo = getSalonDateStr(-2)
      return {
        preset: 'yesterday',
        startDate: yesterday,
        endDate: yesterday,
        label: 'Yesterday',
        previousStartDate: twoDaysAgo,
        previousEndDate: twoDaysAgo,
      }
    }

    case 'last_7_days': {
      const start7 = addDaysToDate(today, -6)
      const prevEnd7 = addDaysToDate(start7, -1)
      const prevStart7 = addDaysToDate(prevEnd7, -6)
      return {
        preset: 'last_7_days',
        startDate: start7,
        endDate: today,
        label: 'Last 7 Days',
        previousStartDate: prevStart7,
        previousEndDate: prevEnd7,
      }
    }

    case 'last_30_days': {
      const start30 = addDaysToDate(today, -29)
      const prevEnd30 = addDaysToDate(start30, -1)
      const prevStart30 = addDaysToDate(prevEnd30, -29)
      return {
        preset: 'last_30_days',
        startDate: start30,
        endDate: today,
        label: 'Last 30 Days',
        previousStartDate: prevStart30,
        previousEndDate: prevEnd30,
      }
    }

    case 'this_month': {
      const [yearStr, monthStr, dayStr] = today.split('-')
      const startOfMonth = `${yearStr}-${monthStr}-01`
      const daysElapsed = parseInt(dayStr, 10)
      
      // Compute matching period in previous month
      let prevYear = parseInt(yearStr, 10)
      let prevMonth = parseInt(monthStr, 10) - 1
      if (prevMonth === 0) {
        prevMonth = 12
        prevYear -= 1
      }
      const prevMonthStr = String(prevMonth).padStart(2, '0')
      const prevStart = `${prevYear}-${prevMonthStr}-01`
      const prevEnd = `${prevYear}-${prevMonthStr}-${String(Math.min(daysElapsed, 28)).padStart(2, '0')}`

      return {
        preset: 'this_month',
        startDate: startOfMonth,
        endDate: today,
        label: 'This Month',
        previousStartDate: prevStart,
        previousEndDate: prevEnd,
      }
    }

    case 'last_month': {
      const [yearStr, monthStr] = today.split('-')
      let currYear = parseInt(yearStr, 10)
      let lastMonthNum = parseInt(monthStr, 10) - 1
      if (lastMonthNum === 0) {
        lastMonthNum = 12
        currYear -= 1
      }
      const lastMonthStr = String(lastMonthNum).padStart(2, '0')
      const lastMonthStart = `${currYear}-${lastMonthStr}-01`
      
      // Last day of last month
      const daysInLastMonth = new Date(currYear, lastMonthNum, 0).getDate()
      const lastMonthEnd = `${currYear}-${lastMonthStr}-${String(daysInLastMonth).padStart(2, '0')}`

      // Two months ago
      let twoMonthsAgoNum = lastMonthNum - 1
      let twoMonthsAgoYear = currYear
      if (twoMonthsAgoNum === 0) {
        twoMonthsAgoNum = 12
        twoMonthsAgoYear -= 1
      }
      const twoMonthsAgoStr = String(twoMonthsAgoNum).padStart(2, '0')
      const twoMonthsAgoStart = `${twoMonthsAgoYear}-${twoMonthsAgoStr}-01`
      const daysInTwoMonthsAgo = new Date(twoMonthsAgoYear, twoMonthsAgoNum, 0).getDate()
      const twoMonthsAgoEnd = `${twoMonthsAgoYear}-${twoMonthsAgoStr}-${String(daysInTwoMonthsAgo).padStart(2, '0')}`

      return {
        preset: 'last_month',
        startDate: lastMonthStart,
        endDate: lastMonthEnd,
        label: 'Last Month',
        previousStartDate: twoMonthsAgoStart,
        previousEndDate: twoMonthsAgoEnd,
      }
    }

    case 'custom': {
      const validStart = customStart && /^\d{4}-\d{2}-\d{2}$/.test(customStart) ? customStart : today
      const validEnd = customEnd && /^\d{4}-\d{2}-\d{2}$/.test(customEnd) ? customEnd : validStart
      const effectiveStart = validStart <= validEnd ? validStart : validEnd
      const effectiveEnd = validStart <= validEnd ? validEnd : validStart

      // Calculate span in days
      const d1 = new Date(`${effectiveStart}T00:00:00Z`).getTime()
      const d2 = new Date(`${effectiveEnd}T00:00:00Z`).getTime()
      const spanDays = Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1)

      const prevEndCustom = addDaysToDate(effectiveStart, -1)
      const prevStartCustom = addDaysToDate(prevEndCustom, -(spanDays - 1))

      return {
        preset: 'custom',
        startDate: effectiveStart,
        endDate: effectiveEnd,
        label: `${effectiveStart} to ${effectiveEnd}`,
        previousStartDate: prevStartCustom,
        previousEndDate: prevEndCustom,
      }
    }
  }
}

/**
 * Calculates percentage and absolute comparison between two periods
 */
function calculateComparison(current: number, previous: number): MetricComparison {
  const absoluteChange = current - previous
  let percentageChange: number | null = null
  let trend: 'up' | 'down' | 'neutral' = 'neutral'

  if (previous > 0) {
    percentageChange = Math.round(((current - previous) / previous) * 100 * 10) / 10
  } else if (previous === 0 && current > 0) {
    percentageChange = null // undefined growth from zero
  }

  if (absoluteChange > 0) trend = 'up'
  else if (absoluteChange < 0) trend = 'down'

  return {
    current,
    previous,
    absoluteChange,
    percentageChange,
    trend,
  }
}

export const ownerDashboardService = {
  /**
   * Gathers all operational appointments and metrics for the specified date range.
   */
  async getDashboardData(
    range: DateRange,
    salonId: string = 'salon-luma-01'
  ): Promise<ExecutiveDashboardData> {
    const allAppointments = appointmentStore.getAll()
    const todayStr = getSalonDateStr(0)
    const currentTimeStr = getSalonTimeStr()
    const currentMins = timeToMinutes(currentTimeStr)

    // Filter appointments for current period (scoped to salonId)
    const currentApts = allAppointments.filter(
      (a) =>
        (!a.salonId || a.salonId === salonId) &&
        a.date >= range.startDate &&
        a.date <= range.endDate
    )

    // Filter appointments for equivalent previous period
    const previousApts = allAppointments.filter(
      (a) =>
        (!a.salonId || a.salonId === salonId) &&
        a.date >= range.previousStartDate &&
        a.date <= range.previousEndDate
    )

    // --- 1. Appointment Counts for Current Period ---
    let confirmedCount = 0
    let completedCount = 0
    let scheduledCount = 0
    let checkedInCount = 0
    let inProgressStatusCount = 0
    let cancelledCount = 0
    let noShowCount = 0
    let inProgressCount = 0
    let completedServiceValue = 0
    let projectedServiceValue = 0

    for (const apt of currentApts) {
      if (apt.status === 'completed') {
        completedCount++
        completedServiceValue += apt.price || 0
      } else if (apt.status === 'confirmed') {
        confirmedCount++
        projectedServiceValue += apt.price || 0
      } else if (apt.status === 'scheduled') {
        scheduledCount++
        projectedServiceValue += apt.price || 0
      } else if (apt.status === 'checked_in') {
        checkedInCount++
        projectedServiceValue += apt.price || 0
      } else if (apt.status === 'in_progress') {
        inProgressStatusCount++
        projectedServiceValue += apt.price || 0
      } else if (apt.status === 'cancelled') {
        cancelledCount++
      } else if (apt.status === 'no-show') {
        noShowCount++
      }

      // Check if appointment is ongoing right now (only applicable if date is today)
      if (apt.date === todayStr && apt.status !== 'cancelled' && apt.status !== 'no-show') {
        if (apt.status === 'in_progress') {
          inProgressCount++
        } else {
          const startMins = timeToMinutes(apt.startTime)
          const endMins = apt.endTime ? timeToMinutes(apt.endTime) : startMins + 45
          if (currentMins >= startMins && currentMins <= endMins) {
            inProgressCount++
          }
        }
      }
    }

    const totalAppointments = currentApts.length

    // --- 2. Appointment Counts for Previous Period ---
    let prevCompletedCount = 0
    let prevCancelledCount = 0
    let prevNoShowCount = 0
    let prevCompletedServiceValue = 0

    for (const apt of previousApts) {
      if (apt.status === 'completed') {
        prevCompletedCount++
        prevCompletedServiceValue += apt.price || 0
      } else if (apt.status === 'cancelled') {
        prevCancelledCount++
      } else if (apt.status === 'no-show') {
        prevNoShowCount++
      }
    }

    const prevTotalAppointments = previousApts.length

    // --- 3. Compute KPI Metrics & Comparisons ---
    const appointmentsComparison = calculateComparison(totalAppointments, prevTotalAppointments)
    const completedComparison = calculateComparison(completedCount, prevCompletedCount)
    const revenueComparison = calculateComparison(completedServiceValue, prevCompletedServiceValue)
    const cancellationComparison = calculateComparison(cancelledCount, prevCancelledCount)
    const noShowComparison = calculateComparison(noShowCount, prevNoShowCount)

    const completionRate =
      totalAppointments > 0 ? Math.round((completedCount / totalAppointments) * 100 * 10) / 10 : 0
    const cancellationRate =
      totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 100 * 10) / 10 : 0
    const noShowRate =
      totalAppointments > 0 ? Math.round((noShowCount / totalAppointments) * 100 * 10) / 10 : 0
    const averageTicketValue =
      completedCount > 0 ? Math.round(completedServiceValue / completedCount) : 0

    // --- 4. Operational Staff Capacity ---
    const allStaff = await staffService.getStaff()
    const salonStaff = allStaff.filter((s) => !s.salonId || s.salonId === salonId)
    const totalStaffCount = salonStaff.length
    const activeStylists = salonStaff.filter((s) => s.active)
    const activeStylistCount = activeStylists.length
    const appointmentsPerActiveStylist =
      activeStylistCount > 0
        ? Math.round((totalAppointments / activeStylistCount) * 10) / 10
        : 0

    // --- 5. Status Distribution ---
    const statusDistribution: ExecutiveDashboardData['statusDistribution'] = [
      {
        status: 'completed',
        label: 'Completed',
        count: completedCount,
        percentage: totalAppointments > 0 ? Math.round((completedCount / totalAppointments) * 100) : 0,
        color: '#10b981', // Emerald
      },
      {
        status: 'in_progress',
        label: 'In Progress',
        count: inProgressStatusCount,
        percentage: totalAppointments > 0 ? Math.round((inProgressStatusCount / totalAppointments) * 100) : 0,
        color: '#06b6d4', // Cyan
      },
      {
        status: 'checked_in',
        label: 'Checked In',
        count: checkedInCount,
        percentage: totalAppointments > 0 ? Math.round((checkedInCount / totalAppointments) * 100) : 0,
        color: '#f59e0b', // Amber
      },
      {
        status: 'confirmed',
        label: 'Confirmed',
        count: confirmedCount,
        percentage: totalAppointments > 0 ? Math.round((confirmedCount / totalAppointments) * 100) : 0,
        color: '#8b5cf6', // Violet
      },
      {
        status: 'scheduled',
        label: 'Scheduled',
        count: scheduledCount,
        percentage: totalAppointments > 0 ? Math.round((scheduledCount / totalAppointments) * 100) : 0,
        color: '#38bdf8', // Sky
      },
      {
        status: 'cancelled',
        label: 'Cancelled',
        count: cancelledCount,
        percentage: totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 100) : 0,
        color: '#ef4444', // Red
      },
      {
        status: 'no-show',
        label: 'No-Show',
        count: noShowCount,
        percentage: totalAppointments > 0 ? Math.round((noShowCount / totalAppointments) * 100) : 0,
        color: '#64748b', // Slate
      },
    ]

    // --- 6. Daily Trend Aggregation ---
    // Generate dates between startDate and endDate
    const dailyTrend: DailyTrendPoint[] = []
    let currDate = range.startDate
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

    while (currDate <= range.endDate) {
      const dayApts = currentApts.filter((a) => a.date === currDate)
      let dayCompleted = 0
      let dayCancelled = 0
      let dayNoShow = 0
      let dayValue = 0

      for (const a of dayApts) {
        if (a.status === 'completed') {
          dayCompleted++
          dayValue += a.price || 0
        } else if (a.status === 'cancelled') {
          dayCancelled++
        } else if (a.status === 'no-show') {
          dayNoShow++
        }
      }

      const dObj = new Date(`${currDate}T12:00:00+05:30`)
      const dayOfWeek = dayNames[dObj.getDay()]
      const [, mStr, dStr] = currDate.split('-')
      const displayDate = `${dStr}/${mStr}`

      dailyTrend.push({
        date: currDate,
        displayDate,
        dayOfWeek,
        totalAppointments: dayApts.length,
        completedAppointments: dayCompleted,
        cancelledAppointments: dayCancelled,
        noShowAppointments: dayNoShow,
        completedServiceValue: dayValue,
      })

      currDate = addDaysToDate(currDate, 1)
    }

    // --- 7. Top Services Performance ---
    const serviceMap = new Map<
      string,
      {
        serviceId: string
        serviceName: string
        appointmentCount: number
        completedCount: number
        completedValue: number
      }
    >()

    for (const apt of currentApts) {
      const sId = apt.serviceId || 'unknown-service'
      const sName = apt.serviceName || 'Custom Service'
      const existing = serviceMap.get(sId) || {
        serviceId: sId,
        serviceName: sName,
        appointmentCount: 0,
        completedCount: 0,
        completedValue: 0,
      }

      existing.appointmentCount++
      if (apt.status === 'completed') {
        existing.completedCount++
        existing.completedValue += apt.price || 0
      }
      serviceMap.set(sId, existing)
    }

    const topServices: ServicePerformanceItem[] = Array.from(serviceMap.values())
      .sort((a, b) => b.completedValue - a.completedValue || b.appointmentCount - a.appointmentCount)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        sharePercentage:
          completedServiceValue > 0
            ? Math.round((item.completedValue / completedServiceValue) * 100)
            : 0,
      }))

    // --- 8. Stylist Activity Breakdown ---
    const stylistMap = new Map<
      string,
      {
        staffId: string
        staffName: string
        appointmentCount: number
        completedCount: number
        completedValue: number
      }
    >()

    for (const apt of currentApts) {
      const stId = apt.staffId || (apt as any).assignedEmployeeId || 'unassigned'
      const stName = apt.staffName || 'Staff Member'
      const existing = stylistMap.get(stId) || {
        staffId: stId,
        staffName: stName,
        appointmentCount: 0,
        completedCount: 0,
        completedValue: 0,
      }

      existing.appointmentCount++
      if (apt.status === 'completed') {
        existing.completedCount++
        existing.completedValue += apt.price || 0
      }
      stylistMap.set(stId, existing)
    }

    const stylistActivity: StylistPerformanceItem[] = Array.from(stylistMap.values())
      .sort((a, b) => b.appointmentCount - a.appointmentCount)
      .slice(0, 6)

    // --- 9. Attention-Required Alerts ---
    const attentionAlerts: AttentionAlert[] = []

    // A. Inventory Low Stock Alerts
    try {
      const products: InventoryProduct[] = await inventoryService.fetchInventoryProducts(salonId, false)
      const criticalProducts = products.filter((p) => p.status !== 'archived' && isOutOfStock(p))
      const lowStockProducts = products.filter(
        (p) => p.status !== 'archived' && isLowStock(p) && !isOutOfStock(p)
      )

      if (criticalProducts.length > 0) {
        attentionAlerts.push({
          id: 'alert-inv-out-of-stock',
          type: 'inventory_critical',
          severity: 'critical',
          title: `${criticalProducts.length} Product${criticalProducts.length > 1 ? 's' : ''} Out of Stock`,
          description: `Immediate reorder required: ${criticalProducts.slice(0, 2).map((p) => p.name).join(', ')}${criticalProducts.length > 2 ? ` and ${criticalProducts.length - 2} more` : ''}.`,
          actionLabel: 'Open Inventory',
          targetRoute: 'inventory',
          count: criticalProducts.length,
        })
      }

      if (lowStockProducts.length > 0) {
        attentionAlerts.push({
          id: 'alert-inv-low-stock',
          type: 'inventory_low',
          severity: 'warning',
          title: `${lowStockProducts.length} Product${lowStockProducts.length > 1 ? 's' : ''} at Low Stock Threshold`,
          description: `${lowStockProducts.slice(0, 2).map((p) => p.name).join(', ')} reached minimum reorder levels.`,
          actionLabel: 'Review Stock',
          targetRoute: 'inventory',
          count: lowStockProducts.length,
        })
      }
    } catch (err) {
      console.warn('Inventory alert check skipped:', err)
    }

    // B. High Cancellation Alert (if rate >= 15% and total >= 5)
    if (cancellationRate >= 15 && totalAppointments >= 5) {
      attentionAlerts.push({
        id: 'alert-high-cancellations',
        type: 'high_cancellations',
        severity: 'warning',
        title: `Elevated Cancellation Rate (${cancellationRate}%)`,
        description: `${cancelledCount} of ${totalAppointments} appointments were cancelled in this period. Review schedule gaps.`,
        actionLabel: 'View Calendar',
        targetRoute: 'calendar',
        count: cancelledCount,
      })
    }

    // C. High No-Show Alert (if rate >= 10% and total >= 5)
    if (noShowRate >= 10 && totalAppointments >= 5) {
      attentionAlerts.push({
        id: 'alert-high-noshows',
        type: 'high_no_shows',
        severity: 'warning',
        title: `High No-Show Rate (${noShowRate}%)`,
        description: `${noShowCount} client appointments marked as no-show. Consider pre-appointment SMS/WhatsApp reminders.`,
        actionLabel: 'Manage Calendar',
        targetRoute: 'calendar',
        count: noShowCount,
      })
    }

    const nowFormatted = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    return {
      selectedRange: range,
      lastUpdated: nowFormatted,
      salonTime: `${todayStr} ${currentTimeStr}`,
      kpis: {
        appointments: {
          totalAppointments,
          confirmedCount,
          completedCount,
          scheduledCount,
          checkedInCount,
          inProgressStatusCount,
          cancelledCount,
          noShowCount,
          inProgressCount,
          comparison: appointmentsComparison,
        },
        completedServices: {
          totalCompleted: completedCount,
          completionRate,
          comparison: completedComparison,
        },
        revenue: {
          completedServiceValue,
          projectedServiceValue,
          averageTicketValue,
          comparison: revenueComparison,
          isPaymentLedgerIntegrated: false,
          disclaimer:
            'Reflects completed appointment service price totals. Digital billing and payment gateway transaction ledger are pending Phase 2 audit approval.',
        },
        cancellations: {
          totalCancelled: cancelledCount,
          cancellationRate,
          comparison: cancellationComparison,
        },
        noShows: {
          totalNoShows: noShowCount,
          noShowRate,
          comparison: noShowComparison,
        },
        capacity: {
          totalStaffCount,
          activeStylistCount,
          appointmentsPerActiveStylist,
        },
      },
      statusDistribution,
      dailyTrend,
      topServices,
      stylistActivity,
      attentionAlerts,
    }
  },
}
