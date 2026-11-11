// ==============================================================================
// Luma Salon — Operations Management Domain Service
// Phase 5: Tactical Daily Control, Exception Detection, Workload Balancing & Stock
// ==============================================================================

import { appointmentStore } from './appointmentStore.ts'
import { staffService } from './staffService.ts'
import { inventoryService } from './inventoryService.ts'
import type { Appointment, Staff, DayOfWeek } from '../types/models.ts'
import type { InventoryProduct } from '../types/inventory.ts'
import {
  getSalonDateStr,
  getSalonTimeStr,
  getDayOfWeekKey,
  timeToMinutes,
  formatTime12h,
} from '../utils/formatters.ts'

export type ExceptionType =
  | 'SCHEDULE_OVERLAP'
  | 'DELAYED_ARRIVAL'
  | 'PROLONGED_WAIT'
  | 'OVERRUNNING_SERVICE'
  | 'UNASSIGNED_STAFF'

export type ExceptionSeverity = 'CRITICAL' | 'WARNING' | 'INFO'

export interface OperationsException {
  id: string
  type: ExceptionType
  severity: ExceptionSeverity
  title: string
  description: string
  appointmentId?: string
  staffId?: string
  staffName?: string
  clientName?: string
  startTime?: string
  endTime?: string
  elapsedMinutes?: number
  targetRoute: 'calendar' | 'receptionist/check-in' | 'staff' | 'inventory'
}

export type WorkloadTier = 'OVERBOOKED' | 'OPTIMAL' | 'LIGHT' | 'IDLE'

export interface StaffWorkloadSummary {
  staffId: string
  staffName: string
  role: string
  jobTitle?: string
  specialty?: string
  shiftHours: { open: string; close: string; isOpen: boolean }
  shiftDurationMins: number
  totalAppointmentsToday: number
  totalBookedMins: number
  utilizationPercentage: number
  workloadTier: WorkloadTier
  appointments: Appointment[]
}

export interface OperationsManagementKpis {
  totalAppointmentsToday: number
  inProgressCount: number
  waitingLoungeCount: number
  expectedUpcomingCount: number
  completedCount: number
  cancelledCount: number
  noShowCount: number
  totalExceptionsCount: number
  criticalExceptionsCount: number
  warningExceptionsCount: number
  onShiftStylistsCount: number
  availableStylistsCount: number
  overbookedStylistsCount: number
}

export interface OperationsManagementData {
  lastUpdated: string
  salonTime: string
  date: string
  kpis: OperationsManagementKpis
  exceptions: OperationsException[]
  staffWorkload: StaffWorkloadSummary[]
  todayAppointments: Appointment[]
  floorInventoryRisks: {
    outOfStock: InventoryProduct[]
    lowStock: InventoryProduct[]
    totalRiskCount: number
  }
}

/**
 * Calculates elapsed minutes since an ISO timestamp or fallback time
 */
export function calculateElapsedMinutes(
  isoTimestamp?: string,
  fallbackTime24?: string,
  currentTimeStr?: string
): number {
  if (isoTimestamp) {
    const diffMs = Date.now() - new Date(isoTimestamp).getTime()
    return Math.max(0, Math.floor(diffMs / 60000))
  }
  if (fallbackTime24 && currentTimeStr) {
    const startMins = timeToMinutes(fallbackTime24)
    const currMins = timeToMinutes(currentTimeStr)
    return Math.max(0, currMins - startMins)
  }
  return 0
}

/**
 * Proactively scans today's appointments for scheduling overlaps on the same stylist
 */
export function scanScheduleOverlaps(
  todayAppointments: Appointment[],
  staffList: Staff[]
): OperationsException[] {
  const exceptions: OperationsException[] = []
  const activeBookings = todayAppointments.filter(
    (a) => a.status !== 'cancelled' && a.status !== 'no-show'
  )

  // Group by assigned staff
  const staffBookingsMap = new Map<string, Appointment[]>()
  for (const apt of activeBookings) {
    const sId = apt.assignedEmployeeId || apt.staffId
    if (!sId) continue
    const list = staffBookingsMap.get(sId) || []
    list.push(apt)
    staffBookingsMap.set(sId, list)
  }

  // Check each stylist's bookings for pairwise overlap
  for (const [staffId, bookings] of staffBookingsMap.entries()) {
    if (bookings.length < 2) continue

    const sorted = [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime))
    const staff = staffList.find((s) => s.id === staffId)
    const staffName = staff?.name || sorted[0].staffName || 'Stylist'

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a1 = sorted[i]
        const a2 = sorted[j]

        const start1 = timeToMinutes(a1.startTime)
        const end1 = a1.endTime ? timeToMinutes(a1.endTime) : start1 + 45
        const start2 = timeToMinutes(a2.startTime)
        const end2 = a2.endTime ? timeToMinutes(a2.endTime) : start2 + 45

        // Overlap condition: start1 < end2 && end1 > start2
        if (start1 < end2 && end1 > start2) {
          exceptions.push({
            id: `exc-ovl-${a1.id}-${a2.id}`,
            type: 'SCHEDULE_OVERLAP',
            severity: 'CRITICAL',
            title: `Schedule Conflict: ${staffName}`,
            description: `Simultaneous double-booking: ${a1.clientName || 'Guest'} (${formatTime12h(a1.startTime)} - ${formatTime12h(a1.endTime)}) overlaps with ${a2.clientName || 'Guest'} (${formatTime12h(a2.startTime)} - ${formatTime12h(a2.endTime)}).`,
            appointmentId: a1.id,
            staffId,
            staffName,
            clientName: `${a1.clientName || 'Guest'} & ${a2.clientName || 'Guest'}`,
            startTime: a1.startTime,
            endTime: a2.endTime,
            targetRoute: 'calendar',
          })
        }
      }
    }
  }

  return exceptions
}

/**
 * Scans for delayed arrivals, prolonged lounge waits, and overrunning services
 */
export function scanRealTimeExceptions(
  todayAppointments: Appointment[],
  currentTimeStr: string
): OperationsException[] {
  const exceptions: OperationsException[] = []
  const currentMins = timeToMinutes(currentTimeStr)

  for (const apt of todayAppointments) {
    const startMins = timeToMinutes(apt.startTime)
    const endMins = apt.endTime ? timeToMinutes(apt.endTime) : startMins + 45
    const staffName = apt.staffName || 'Assigned Stylist'
    const clientName = apt.clientName || 'Guest'

    // 1. Unassigned staff booking
    if (!apt.staffId && !apt.assignedEmployeeId) {
      exceptions.push({
        id: `exc-unassign-${apt.id}`,
        type: 'UNASSIGNED_STAFF',
        severity: 'CRITICAL',
        title: 'Unassigned Appointment',
        description: `Booking for ${clientName} (${apt.serviceName || 'Service'} at ${formatTime12h(apt.startTime)}) has no stylist assigned.`,
        appointmentId: apt.id,
        clientName,
        startTime: apt.startTime,
        targetRoute: 'calendar',
      })
      continue
    }

    // 2. Delayed Arrival: scheduled/confirmed and current time > startTime + 15 mins
    if ((apt.status === 'scheduled' || apt.status === 'confirmed') && currentMins > startMins + 15) {
      const delayMins = currentMins - startMins
      exceptions.push({
        id: `exc-delay-${apt.id}`,
        type: 'DELAYED_ARRIVAL',
        severity: 'WARNING',
        title: `Delayed Arrival (${delayMins}m late)`,
        description: `${clientName} was scheduled at ${formatTime12h(apt.startTime)} with ${staffName} for ${apt.serviceName || 'Service'}, but has not arrived.`,
        appointmentId: apt.id,
        staffId: apt.staffId,
        staffName,
        clientName,
        startTime: apt.startTime,
        elapsedMinutes: delayMins,
        targetRoute: 'calendar',
      })
    }

    // 3. Prolonged Lounge Wait: checked_in > 15 mins ago and service not yet started
    if (apt.status === 'checked_in') {
      const waitMins = calculateElapsedMinutes(apt.checkedInAt, apt.startTime, currentTimeStr)
      if (waitMins > 15) {
        exceptions.push({
          id: `exc-wait-${apt.id}`,
          type: 'PROLONGED_WAIT',
          severity: 'WARNING',
          title: `Lounge Wait Overdue (${waitMins}m)`,
          description: `${clientName} checked in and has been waiting ${waitMins}m for ${staffName} (${apt.serviceName || 'Service'}).`,
          appointmentId: apt.id,
          staffId: apt.staffId,
          staffName,
          clientName,
          startTime: apt.startTime,
          elapsedMinutes: waitMins,
          targetRoute: 'receptionist/check-in',
        })
      }
    }

    // 4. Overrunning Service: in_progress and current time > scheduled endTime + 10 mins
    if (apt.status === 'in_progress' && currentMins > endMins + 10) {
      const overrunMins = currentMins - endMins
      exceptions.push({
        id: `exc-overrun-${apt.id}`,
        type: 'OVERRUNNING_SERVICE',
        severity: 'INFO',
        title: `Service Overrunning (+${overrunMins}m)`,
        description: `${staffName} is still servicing ${clientName} for ${apt.serviceName || 'Service'} past scheduled finish ${formatTime12h(apt.endTime)}.`,
        appointmentId: apt.id,
        staffId: apt.staffId,
        staffName,
        clientName,
        startTime: apt.startTime,
        endTime: apt.endTime,
        elapsedMinutes: overrunMins,
        targetRoute: 'calendar',
      })
    }
  }

  return exceptions
}

/**
 * Computes workload distribution and utilization percentages for all stylists on shift today
 */
export function calculateStaffWorkload(
  staffList: Staff[],
  todayAppointments: Appointment[],
  dateStr: string
): StaffWorkloadSummary[] {
  const dayKey: DayOfWeek = getDayOfWeekKey(dateStr)
  const summaries: StaffWorkloadSummary[] = []

  const activeAppointments = todayAppointments.filter(
    (a) => a.status !== 'cancelled' && a.status !== 'no-show'
  )

  for (const staff of staffList) {
    if (!staff.active || !staff.workingHours) continue

    const shiftToday = staff.workingHours[dayKey]
    if (!shiftToday || !shiftToday.isOpen) continue // Skip off-duty staff

    const openMins = timeToMinutes(shiftToday.open)
    const closeMins = timeToMinutes(shiftToday.close)
    const shiftDurationMins = Math.max(60, closeMins - openMins)

    // Appointments assigned to this staff member
    const staffBookings = activeAppointments.filter(
      (a) => a.staffId === staff.id || (a as any).assignedEmployeeId === staff.id
    )

    let totalBookedMins = 0
    for (const apt of staffBookings) {
      const s = timeToMinutes(apt.startTime)
      const e = apt.endTime ? timeToMinutes(apt.endTime) : s + 45
      totalBookedMins += Math.max(15, e - s)
    }

    const utilizationPercentage = Math.min(
      100,
      Math.round((totalBookedMins / shiftDurationMins) * 100)
    )

    let workloadTier: WorkloadTier = 'OPTIMAL'
    if (totalBookedMins === 0) {
      workloadTier = 'IDLE'
    } else if (utilizationPercentage >= 85) {
      workloadTier = 'OVERBOOKED'
    } else if (utilizationPercentage < 50) {
      workloadTier = 'LIGHT'
    }

    summaries.push({
      staffId: staff.id,
      staffName: staff.name,
      role: staff.role,
      jobTitle: staff.jobTitle,
      specialty: staff.skills?.[0] || 'Stylist',
      shiftHours: shiftToday,
      shiftDurationMins,
      totalAppointmentsToday: staffBookings.length,
      totalBookedMins,
      utilizationPercentage,
      workloadTier,
      appointments: staffBookings,
    })
  }

  // Sort: Overbooked first, then by utilization descending
  return summaries.sort((a, b) => b.utilizationPercentage - a.utilizationPercentage)
}

export const operationsManagementService = {
  /**
   * Aggregates all operational metrics, exceptions, staff workload, and inventory risks for today
   */
  async getOperationsData(
    salonId: string = 'salon-luma-01',
    customDateStr?: string,
    customTimeStr?: string
  ): Promise<OperationsManagementData> {
    const todayStr = customDateStr || getSalonDateStr(0)
    const currentTimeStr = customTimeStr || getSalonTimeStr()

    // 1. Fetch appointments for today and staff roster
    const allAppointments = appointmentStore.getByDate(todayStr)
    const salonAppointments = allAppointments.filter(
      (a) => !a.salonId || a.salonId === salonId
    )

    const allStaff = await staffService.getStaff()
    const salonStaff = allStaff.filter((s) => !s.salonId || s.salonId === salonId)

    // 2. Scan for scheduling exceptions
    const overlaps = scanScheduleOverlaps(salonAppointments, salonStaff)
    const realtimeExceptions = scanRealTimeExceptions(salonAppointments, currentTimeStr)
    const allExceptions = [...overlaps, ...realtimeExceptions]

    // 3. Compute staff workload distribution
    const staffWorkload = calculateStaffWorkload(salonStaff, salonAppointments, todayStr)

    // 4. Compute operational KPIs
    let inProgressCount = 0
    let waitingLoungeCount = 0
    let expectedUpcomingCount = 0
    let completedCount = 0
    let cancelledCount = 0
    let noShowCount = 0

    for (const a of salonAppointments) {
      if (a.status === 'in_progress') inProgressCount++
      else if (a.status === 'checked_in') waitingLoungeCount++
      else if (a.status === 'scheduled' || a.status === 'confirmed') expectedUpcomingCount++
      else if (a.status === 'completed') completedCount++
      else if (a.status === 'cancelled') cancelledCount++
      else if (a.status === 'no-show') noShowCount++
    }

    const criticalExceptionsCount = allExceptions.filter((e) => e.severity === 'CRITICAL').length
    const warningExceptionsCount = allExceptions.filter((e) => e.severity === 'WARNING').length

    const onShiftStylistsCount = staffWorkload.length
    const availableStylistsCount = staffWorkload.filter(
      (w) => w.workloadTier === 'IDLE' || w.workloadTier === 'LIGHT'
    ).length
    const overbookedStylistsCount = staffWorkload.filter(
      (w) => w.workloadTier === 'OVERBOOKED'
    ).length

    // 5. Scan inventory operational risks
    const outOfStock: InventoryProduct[] = []
    const lowStock: InventoryProduct[] = []

    try {
      const products = await inventoryService.fetchInventoryProducts(salonId, false)
      for (const p of products) {
        if (p.status === 'archived') continue
        if (p.currentStock <= 0) {
          outOfStock.push(p)
        } else if (p.currentStock <= p.minStockThreshold) {
          lowStock.push(p)
        }
      }
    } catch (err) {
      console.warn('Inventory stock check skipped for operations management:', err)
    }

    const nowFormatted = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    return {
      lastUpdated: nowFormatted,
      salonTime: `${todayStr} ${currentTimeStr}`,
      date: todayStr,
      kpis: {
        totalAppointmentsToday: salonAppointments.length,
        inProgressCount,
        waitingLoungeCount,
        expectedUpcomingCount,
        completedCount,
        cancelledCount,
        noShowCount,
        totalExceptionsCount: allExceptions.length,
        criticalExceptionsCount,
        warningExceptionsCount,
        onShiftStylistsCount,
        availableStylistsCount,
        overbookedStylistsCount,
      },
      exceptions: allExceptions,
      staffWorkload,
      todayAppointments: salonAppointments,
      floorInventoryRisks: {
        outOfStock,
        lowStock,
        totalRiskCount: outOfStock.length + lowStock.length,
      },
    }
  },
}

