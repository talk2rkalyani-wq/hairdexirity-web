// ==============================================================================
// Luma Salon — Employee Performance & Workload Analytics Service (Phase 6)
// Individual Stylist Performance Intelligence, Service Values & Utilization Engine
// ==============================================================================

import type { Appointment, AppointmentStatus, Staff, DayOfWeek } from '../types/models.ts'
import { appointmentStore } from './appointmentStore.ts'
import { staffService } from './staffService.ts'
import { mockServices } from '../mockData/salonEntities.ts'
import { resolveEmployeeStatus, type StaffLiveStatus } from './liveOperationsService.ts'
import {
  getSalonDateStr,
  getSalonTimeStr,
  addDaysToDate,
  timeToMinutes,
} from '../utils/formatters.ts'
import { computeDateRange, type DateRangePreset, type DailyTrendPoint } from './ownerDashboardService.ts'

export type EmployeeTimeRangePreset = DateRangePreset | 'all_time'

export interface EmployeeDateRange {
  preset: EmployeeTimeRangePreset
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  label: string
}

export interface EmployeeKpiMetrics {
  /**
   * Gross value of all completed appointments for this stylist.
   * STRICT NOTE: As per Phase 6 audit, this represents completed service value,
   * NOT collected payment gateway settlement, customer tips, or net commission earnings.
   */
  completedServiceValue: number
  projectedServiceValue: number
  totalAppointments: number
  completedCount: number
  inProgressCount: number
  checkedInCount: number
  scheduledCount: number
  cancelledCount: number
  noShowCount: number
  averageTicketValue: number
  completionRate: number // percentage
  cancellationRate: number // percentage
  noShowRate: number // percentage
  totalBookedMinutes: number
  totalScheduledShiftMinutes: number
  utilizationRate: number // percentage (booked / scheduled * 100)
  isPaymentLedgerIntegrated: false
  disclaimer: string
}

export interface EmployeeCategoryBreakdown {
  category: string
  categoryLabel: string
  count: number
  completedCount: number
  completedValue: number
  percentage: number
}

export interface HourlyDistributionPoint {
  hour24: number
  hourLabel: string
  appointmentCount: number
  completedCount: number
  completedValue: number
}

export interface EmployeePerformanceReport {
  staff: Staff
  liveStatus: StaffLiveStatus | null
  selectedRange: EmployeeDateRange
  kpis: EmployeeKpiMetrics
  dailyTrends: DailyTrendPoint[]
  categoryBreakdown: EmployeeCategoryBreakdown[]
  hourlyDistribution: HourlyDistributionPoint[]
  appointments: Appointment[]
  allStaff: Staff[]
}

export interface EmployeeAppointmentFilters {
  status?: AppointmentStatus | 'all'
  category?: string | 'all'
  searchQuery?: string
  sortBy?: 'date_desc' | 'date_asc' | 'price_desc' | 'price_asc'
}

const DAYS_OF_WEEK: DayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  haircut: 'Haircut & Styling',
  color: 'Hair Color & Highlights',
  styling: 'Blowdry & Styling',
  treatment: 'Hair & Scalp Treatments',
  extensions: 'Extensions',
  other: 'Other Services',
}

/**
 * Computes an EmployeeDateRange including support for 'all_time'
 */
export function computeEmployeeDateRange(
  preset: EmployeeTimeRangePreset,
  customStart?: string,
  customEnd?: string
): EmployeeDateRange {
  const today = getSalonDateStr(0)

  if (preset === 'all_time') {
    return {
      preset: 'all_time',
      startDate: '2023-01-01',
      endDate: addDaysToDate(today, 30), // include upcoming month
      label: 'All Time Roster History',
    }
  }

  const base = computeDateRange(preset as DateRangePreset, customStart, customEnd)
  return {
    preset,
    startDate: base.startDate,
    endDate: base.endDate,
    label: base.label,
  }
}

/**
 * Resolves day of week in Asia/Kolkata timezone from YYYY-MM-DD
 */
function getDayOfWeekFromDate(dateStr: string): DayOfWeek {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return DAYS_OF_WEEK[date.getDay()]
}

/**
 * Calculates total scheduled working hours in minutes for a staff member across a date range
 */
export function calculateScheduledShiftMinutes(
  staff: Staff,
  startDate: string,
  endDate: string
): number {
  if (!staff.workingHours) return 0

  let totalMins = 0
  let cur = startDate

  // Iterate day by day between startDate and endDate (cap at 90 days to prevent runaway loops)
  let guard = 0
  while (cur <= endDate && guard < 120) {
    guard++
    const dayName = getDayOfWeekFromDate(cur)
    const shift = staff.workingHours[dayName]
    if (shift && shift.isOpen && shift.open && shift.close) {
      const openMins = timeToMinutes(shift.open)
      const closeMins = timeToMinutes(shift.close)
      if (closeMins > openMins) {
        totalMins += (closeMins - openMins)
      }
    }
    cur = addDaysToDate(cur, 1)
  }

  return totalMins
}

export const employeePerformanceService = {
  /**
   * Retrieves all staff members for selector dropdown
   */
  async getStaffList(): Promise<Staff[]> {
    return await staffService.getStaff()
  },

  /**
   * Generates a comprehensive performance & workload report for a single employee
   */
  async getEmployeeReport(
    staffId: string,
    preset: EmployeeTimeRangePreset = 'today',
    customStart?: string,
    customEnd?: string
  ): Promise<EmployeePerformanceReport | null> {
    const allStaff = await staffService.getStaff()
    const staff = allStaff.find((s) => s.id === staffId) || null
    if (!staff) return null

    const dateRange = computeEmployeeDateRange(preset, customStart, customEnd)
    const allAppointments = appointmentStore.getAll()

    // 1. Filter appointments for this employee within date boundaries
    const staffAppointments = allAppointments.filter((apt) => {
      const matchesStaff = apt.staffId === staffId || (apt as any).assignedEmployeeId === staffId
      if (!matchesStaff) return false
      return apt.date >= dateRange.startDate && apt.date <= dateRange.endDate
    })

    // 2. Compute Live Operational Status (Today Floor State)
    const todayStr = getSalonDateStr(0)
    const currentTimeStr = getSalonTimeStr()
    const todayAppointments = allAppointments.filter((apt) => apt.date === todayStr)
    const liveStatus = resolveEmployeeStatus(
      staff,
      todayAppointments,
      todayStr,
      currentTimeStr
    )

    // 3. Compute KPI Aggregations
    let completedServiceValue = 0
    let projectedServiceValue = 0
    let completedCount = 0
    let inProgressCount = 0
    let checkedInCount = 0
    let scheduledCount = 0
    let cancelledCount = 0
    let noShowCount = 0
    let totalBookedMinutes = 0

    const categoryMap = new Map<string, { count: number; completedCount: number; completedValue: number }>()
    const hourlyMap = new Map<number, { appointmentCount: number; completedCount: number; completedValue: number }>()

    // Initialize hourly buckets (09:00 to 20:00)
    for (let h = 9; h <= 20; h++) {
      hourlyMap.set(h, { appointmentCount: 0, completedCount: 0, completedValue: 0 })
    }

    for (const apt of staffAppointments) {
      const price = typeof apt.price === 'number' && !isNaN(apt.price) ? apt.price : 0
      const startMins = timeToMinutes(apt.startTime)
      const endMins = apt.endTime ? timeToMinutes(apt.endTime) : startMins + 45
      const duration = Math.max(0, endMins - startMins)

      // Service category resolution
      const serviceMeta = mockServices.find((s) => s.id === apt.serviceId)
      const categoryKey = serviceMeta?.category || (apt as any).category || 'haircut'
      const catEntry = categoryMap.get(categoryKey) || { count: 0, completedCount: 0, completedValue: 0 }
      catEntry.count++

      // Starting hour resolution
      const startHour = Math.floor(startMins / 60)
      const hourEntry = hourlyMap.get(startHour) || { appointmentCount: 0, completedCount: 0, completedValue: 0 }
      hourEntry.appointmentCount++

      if (apt.status === 'completed') {
        completedCount++
        completedServiceValue += price
        catEntry.completedCount++
        catEntry.completedValue += price
        hourEntry.completedCount++
        hourEntry.completedValue += price
        totalBookedMinutes += duration
      } else if (apt.status === 'in_progress') {
        inProgressCount++
        projectedServiceValue += price
        totalBookedMinutes += duration
      } else if (apt.status === 'checked_in') {
        checkedInCount++
        projectedServiceValue += price
        totalBookedMinutes += duration
      } else if (apt.status === 'confirmed' || apt.status === 'scheduled') {
        scheduledCount++
        projectedServiceValue += price
        totalBookedMinutes += duration
      } else if (apt.status === 'cancelled') {
        cancelledCount++
      } else if (apt.status === 'no-show') {
        noShowCount++
      }

      categoryMap.set(categoryKey, catEntry)
      if (startHour >= 9 && startHour <= 20) {
        hourlyMap.set(startHour, hourEntry)
      }
    }

    const totalAppointments = staffAppointments.length
    const averageTicketValue = completedCount > 0 ? Math.round(completedServiceValue / completedCount) : 0
    const completionRate = totalAppointments > 0 ? Math.round((completedCount / totalAppointments) * 1000) / 10 : 0
    const cancellationRate = totalAppointments > 0 ? Math.round((cancelledCount / totalAppointments) * 1000) / 10 : 0
    const noShowRate = totalAppointments > 0 ? Math.round((noShowCount / totalAppointments) * 1000) / 10 : 0

    // Compute Scheduled Working Minutes
    // If preset is 'all_time', we calculate scheduled minutes based on date span of appointments or cap at 30 days
    const scheduledStart = preset === 'all_time' ? (staffAppointments[0]?.date || dateRange.startDate) : dateRange.startDate
    const scheduledEnd = preset === 'all_time' ? (staffAppointments[staffAppointments.length - 1]?.date || todayStr) : dateRange.endDate
    const totalScheduledShiftMinutes = calculateScheduledShiftMinutes(staff, scheduledStart, scheduledEnd)

    const rawUtilization = totalScheduledShiftMinutes > 0
      ? (totalBookedMinutes / totalScheduledShiftMinutes) * 100
      : 0
    const utilizationRate = Math.round(rawUtilization * 10) / 10

    const kpis: EmployeeKpiMetrics = {
      completedServiceValue,
      projectedServiceValue,
      totalAppointments,
      completedCount,
      inProgressCount,
      checkedInCount,
      scheduledCount,
      cancelledCount,
      noShowCount,
      averageTicketValue,
      completionRate,
      cancellationRate,
      noShowRate,
      totalBookedMinutes,
      totalScheduledShiftMinutes,
      utilizationRate,
      isPaymentLedgerIntegrated: false,
      disclaimer:
        'Completed Service Value represents total value of completed bookings based on service price. Payment gateway settlement, customer tips, and stylist commission splits are not yet integrated.',
    }

    // 4. Daily Trend Points (last 7 or 14 days or span of range)
    const dailyTrends: DailyTrendPoint[] = []
    let trendCur = dateRange.startDate
    let guard = 0
    const trendEnd = dateRange.endDate > todayStr ? todayStr : dateRange.endDate

    while (trendCur <= trendEnd && guard < 60) {
      guard++
      const dayAppointments = staffAppointments.filter((a) => a.date === trendCur)
      let dayCompletedValue = 0
      let dayCompleted = 0
      let dayCancelled = 0
      let dayNoShow = 0

      for (const apt of dayAppointments) {
        if (apt.status === 'completed') {
          dayCompleted++
          dayCompletedValue += (apt.price || 0)
        } else if (apt.status === 'cancelled') {
          dayCancelled++
        } else if (apt.status === 'no-show') {
          dayNoShow++
        }
      }

      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const dObj = new Date(`${trendCur}T12:00:00+05:30`)
      const dayOfWeek = dayNames[dObj.getDay()]
      const [, mStr, dStr] = trendCur.split('-')
      const displayDate = `${dStr}/${mStr}`

      dailyTrends.push({
        date: trendCur,
        displayDate,
        dayOfWeek,
        totalAppointments: dayAppointments.length,
        completedAppointments: dayCompleted,
        cancelledAppointments: dayCancelled,
        noShowAppointments: dayNoShow,
        completedServiceValue: dayCompletedValue,
      })

      trendCur = addDaysToDate(trendCur, 1)
    }

    // 5. Category Breakdown Array
    const categoryBreakdown: EmployeeCategoryBreakdown[] = []
    categoryMap.forEach((val, key) => {
      const share = totalAppointments > 0 ? Math.round((val.count / totalAppointments) * 1000) / 10 : 0
      categoryBreakdown.push({
        category: key,
        categoryLabel: CATEGORY_DISPLAY_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1),
        count: val.count,
        completedCount: val.completedCount,
        completedValue: val.completedValue,
        percentage: share,
      })
    })
    categoryBreakdown.sort((a, b) => b.completedValue - a.completedValue)

    // 6. Hourly Distribution Array
    const hourlyDistribution: HourlyDistributionPoint[] = []
    hourlyMap.forEach((val, hour) => {
      const period = hour >= 12 ? 'PM' : 'AM'
      const displayHour = hour % 12 === 0 ? 12 : hour % 12
      hourlyDistribution.push({
        hour24: hour,
        hourLabel: `${displayHour} ${period}`,
        appointmentCount: val.appointmentCount,
        completedCount: val.completedCount,
        completedValue: val.completedValue,
      })
    })

    return {
      staff,
      liveStatus,
      selectedRange: dateRange,
      kpis,
      dailyTrends,
      categoryBreakdown,
      hourlyDistribution,
      appointments: staffAppointments,
      allStaff,
    }
  },

  /**
   * Filters and sorts appointments for the historical ledger
   */
  filterAppointments(
    appointments: Appointment[],
    filters: EmployeeAppointmentFilters
  ): Appointment[] {
    let result = [...appointments]

    // Status Filter
    if (filters.status && filters.status !== 'all') {
      result = result.filter((a) => a.status === filters.status)
    }

    // Category Filter
    if (filters.category && filters.category !== 'all') {
      result = result.filter((a) => {
        const serviceMeta = mockServices.find((s) => s.id === a.serviceId)
        const cat = serviceMeta?.category || (a as any).category
        return cat === filters.category
      })
    }

    // Text Search Query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim()
      result = result.filter((a) => {
        const clientMatch = a.clientName?.toLowerCase().includes(q)
        const phoneMatch = a.clientPhone?.toLowerCase().includes(q)
        const serviceMatch = a.serviceName?.toLowerCase().includes(q)
        const idMatch = a.id.toLowerCase().includes(q)
        return Boolean(clientMatch || phoneMatch || serviceMatch || idMatch)
      })
    }

    // Sorting
    const sort = filters.sortBy || 'date_desc'
    result.sort((a, b) => {
      if (sort === 'date_desc') {
        const dateCmp = b.date.localeCompare(a.date)
        return dateCmp !== 0 ? dateCmp : b.startTime.localeCompare(a.startTime)
      }
      if (sort === 'date_asc') {
        const dateCmp = a.date.localeCompare(b.date)
        return dateCmp !== 0 ? dateCmp : a.startTime.localeCompare(b.startTime)
      }
      if (sort === 'price_desc') {
        return (b.price || 0) - (a.price || 0)
      }
      if (sort === 'price_asc') {
        return (a.price || 0) - (b.price || 0)
      }
      return 0
    })

    return result
  },
}
