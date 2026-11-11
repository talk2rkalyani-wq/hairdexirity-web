// ==============================================================================
// Luma Salon — Owner Live Operations Service (Phase 3)
// Deterministic Status Resolution, Shift Parsing & Salon Floor Visibility
// ==============================================================================

import type { Staff, Appointment, DayOfWeek } from '../types/models.ts'
import { staffService } from './staffService.ts'
import { appointmentStore } from './appointmentStore.ts'
import {
  getSalonDateStr,
  getSalonTimeStr,
  timeToMinutes,
  getDayOfWeekKey,
} from '../utils/formatters.ts'

export type EmployeeOperationalStatus =
  | 'AVAILABLE'
  | 'BUSY'
  | 'ON_BREAK'
  | 'ON_LEAVE'
  | 'OFF_SHIFT'
  | 'UNKNOWN'

export interface StaffLiveStatus {
  staff: Staff
  status: EmployeeOperationalStatus
  statusLabel: string
  statusReason: string
  isShiftActive: boolean
  shiftHoursToday?: { open: string; close: string; isOpen: boolean }
  currentAppointment?: Appointment
  waitingAppointments?: Appointment[]
  upcomingAppointments: Appointment[]
  completedAppointmentsToday: Appointment[]
  totalAppointmentsToday: number
  conflicts?: string[]
}

export interface LiveOperationsSummary {
  totalEmployees: number
  availableCount: number
  busyCount: number
  onBreakCount: number
  onLeaveCount: number
  offShiftCount: number
  unknownCount: number
  waitingClientsCount?: number
  lastUpdated: string
  salonTime: string
  statuses: StaffLiveStatus[]
}

export interface EmployeeTimelineEvent {
  id: string
  timestamp: string // HH:mm or full time
  type: 'appointment_scheduled' | 'service_in_progress' | 'service_completed' | 'appointment_cancelled' | 'shift_scheduled'
  title: string
  description: string
  clientName?: string
  serviceName?: string
  statusTag: string
}

/**
 * Deterministic status resolution for a staff member based on real salon data.
 *
 * PRECEDENCE RULES:
 * 1. UNKNOWN: Missing or corrupted staff record / weekly schedule.
 * 2. ON LEAVE: Approved leave covering today/now. (Schema gap: leave ledger pending Phase 4).
 * 3. ON BREAK: Active break record recorded. (Schema gap: break tracking pending Phase 4).
 * 4. OFF SHIFT: Inactive roster status, scheduled day off, or outside working hours.
 * 5. BUSY / WITH CUSTOMER: Scheduled or confirmed appointment actively in-progress right now.
 * 6. AVAILABLE: Scheduled on shift now, active on roster, with no blocking in-progress appointment.
 */
export function resolveEmployeeStatus(
  staff: Staff,
  todayAppointments: Appointment[],
  currentDateStr: string = getSalonDateStr(0),
  currentTimeStr: string = getSalonTimeStr()
): StaffLiveStatus {
  // 1. Completeness & Schema Integrity Guard (UNKNOWN)
  if (!staff || !staff.id || !staff.workingHours) {
    return {
      staff,
      status: 'UNKNOWN',
      statusLabel: 'Status Unknown',
      statusReason: 'Incomplete staff roster record or missing working hours schedule.',
      isShiftActive: false,
      upcomingAppointments: [],
      completedAppointmentsToday: [],
      totalAppointmentsToday: 0,
    }
  }

  // Determine today's day of week in Asia/Kolkata
  const dayKey: DayOfWeek = getDayOfWeekKey(currentDateStr)
  const shiftToday = staff.workingHours[dayKey]

  if (!shiftToday) {
    return {
      staff,
      status: 'UNKNOWN',
      statusLabel: 'Status Unknown',
      statusReason: `Weekly schedule definition missing for ${dayKey}.`,
      isShiftActive: false,
      upcomingAppointments: [],
      completedAppointmentsToday: [],
      totalAppointmentsToday: 0,
    }
  }

  // Filter appointments for this staff member today
  const staffAppointments = todayAppointments.filter(
    (a) =>
      a.date === currentDateStr &&
      (a.staffId === staff.id || (a as any).assignedEmployeeId === staff.id)
  )

  const currentMins = timeToMinutes(currentTimeStr)

  // Segregate appointments by timing and completion status
  const completedAppointments: Appointment[] = []
  const upcomingAppointments: Appointment[] = []
  const activeAppointments: Appointment[] = []
  const waitingAppointments: Appointment[] = []

  for (const apt of staffAppointments) {
    if (apt.status === 'completed') {
      completedAppointments.push(apt)
    } else if (apt.status === 'cancelled' || apt.status === 'no-show') {
      // Historical terminal states
    } else if (apt.status === 'in_progress') {
      // Direct on-floor active service
      activeAppointments.unshift(apt)
    } else if (apt.status === 'checked_in') {
      // Client waiting in reception lounge
      waitingAppointments.push(apt)
    } else if (apt.status === 'confirmed' || apt.status === 'scheduled') {
      const startMins = timeToMinutes(apt.startTime)
      const endMins = apt.endTime ? timeToMinutes(apt.endTime) : startMins + 45

      if (currentMins >= startMins && currentMins <= endMins) {
        activeAppointments.push(apt)
      } else if (startMins > currentMins) {
        upcomingAppointments.push(apt)
      }
    }
  }

  // Sort upcoming appointments by start time
  upcomingAppointments.sort((a, b) => a.startTime.localeCompare(b.startTime))

  // 2. Approved Leave Check (Schema Audit: Leave table not yet integrated)
  // When leave table is added, check if approved leave matches today.
  // Currently 0 recorded leaves in database.

  // 3. Active Recorded Break Check (Schema Audit: Break table not yet integrated)
  // When break table is added, check if active break covers current timestamp.
  // Currently 0 recorded breaks in database.

  // 4. Shift & Off-Duty Check (NOT SCHEDULED / OFF SHIFT)
  if (!staff.active) {
    return {
      staff,
      status: 'OFF_SHIFT',
      statusLabel: 'Off Shift',
      statusReason: 'Inactive on salon workforce roster.',
      isShiftActive: false,
      shiftHoursToday: shiftToday,
      upcomingAppointments,
      completedAppointmentsToday: completedAppointments,
      totalAppointmentsToday: staffAppointments.length,
    }
  }

  if (!shiftToday.isOpen) {
    return {
      staff,
      status: 'OFF_SHIFT',
      statusLabel: 'Off Shift',
      statusReason: `Scheduled weekly off (${dayKey.toUpperCase()}).`,
      isShiftActive: false,
      shiftHoursToday: shiftToday,
      upcomingAppointments,
      completedAppointmentsToday: completedAppointments,
      totalAppointmentsToday: staffAppointments.length,
    }
  }

  const openMins = timeToMinutes(shiftToday.open)
  const closeMins = timeToMinutes(shiftToday.close)

  if (currentMins < openMins) {
    return {
      staff,
      status: 'OFF_SHIFT',
      statusLabel: 'Off Shift',
      statusReason: `Shift begins at ${shiftToday.open} (Salon time: ${currentTimeStr}).`,
      isShiftActive: false,
      shiftHoursToday: shiftToday,
      upcomingAppointments,
      completedAppointmentsToday: completedAppointments,
      totalAppointmentsToday: staffAppointments.length,
    }
  }

  if (currentMins > closeMins) {
    return {
      staff,
      status: 'OFF_SHIFT',
      statusLabel: 'Off Shift',
      statusReason: `Shift concluded at ${shiftToday.close} (Salon time: ${currentTimeStr}).`,
      isShiftActive: false,
      shiftHoursToday: shiftToday,
      upcomingAppointments,
      completedAppointmentsToday: completedAppointments,
      totalAppointmentsToday: staffAppointments.length,
    }
  }

  // Shift is active on floor right now
  const isShiftActive = true

  // 5. In-Progress Service Check (WITH CUSTOMER / BUSY)
  if (activeAppointments.length > 0) {
    const currentAppointment = activeAppointments[0]
    const conflicts: string[] = []

    if (activeAppointments.length > 1) {
      conflicts.push(
        `Double-booking detected: ${activeAppointments.length} simultaneous active appointments scheduled.`
      )
    }

    const elapsedMins = currentMins - timeToMinutes(currentAppointment.startTime)
    const totalDuration =
      timeToMinutes(currentAppointment.endTime || currentAppointment.startTime) -
      timeToMinutes(currentAppointment.startTime)
    const remainingMins = Math.max(0, totalDuration - elapsedMins)

    return {
      staff,
      status: 'BUSY',
      statusLabel: 'With Customer',
      statusReason: `Active service: ${currentAppointment.serviceName || 'Service'} with ${currentAppointment.clientName || 'Guest'} (~${remainingMins}m remaining).`,
      isShiftActive,
      shiftHoursToday: shiftToday,
      currentAppointment,
      waitingAppointments,
      upcomingAppointments,
      completedAppointmentsToday: completedAppointments,
      totalAppointmentsToday: staffAppointments.length,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    }
  }

  // 6. Available State (AVAILABLE)
  let nextAptText = 'No further bookings today'
  if (waitingAppointments.length > 0) {
    const waiter = waitingAppointments[0]
    nextAptText = `Client Waiting: ${waiter.clientName || 'Guest'} (${waiter.serviceName || 'Service'})`
  } else if (upcomingAppointments.length > 0) {
    const next = upcomingAppointments[0]
    nextAptText = `Next: ${next.serviceName || 'Service'} at ${next.startTime}`
  }

  return {
    staff,
    status: 'AVAILABLE',
    statusLabel: 'Available',
    statusReason: `On shift on salon floor. ${nextAptText}.`,
    isShiftActive,
    shiftHoursToday: shiftToday,
    waitingAppointments,
    upcomingAppointments,
    completedAppointmentsToday: completedAppointments,
    totalAppointmentsToday: staffAppointments.length,
  }
}

export const liveOperationsService = {
  /**
   * Evaluates the real-time operational status for all staff in a salon
   */
  async getLiveOperationsSummary(
    salonId: string = 'salon-luma-01'
  ): Promise<LiveOperationsSummary> {
    const allStaff = await staffService.getStaff()
    const salonStaff = allStaff.filter((s) => !s.salonId || s.salonId === salonId)

    const todayStr = getSalonDateStr(0)
    const currentTimeStr = getSalonTimeStr()
    const todayAppointments = appointmentStore.getByDate(todayStr)

    const statuses: StaffLiveStatus[] = salonStaff.map((staff) =>
      resolveEmployeeStatus(staff, todayAppointments, todayStr, currentTimeStr)
    )

    let availableCount = 0
    let busyCount = 0
    let onBreakCount = 0
    let onLeaveCount = 0
    let offShiftCount = 0
    let unknownCount = 0

    for (const item of statuses) {
      switch (item.status) {
        case 'AVAILABLE':
          availableCount++
          break
        case 'BUSY':
          busyCount++
          break
        case 'ON_BREAK':
          onBreakCount++
          break
        case 'ON_LEAVE':
          onLeaveCount++
          break
        case 'OFF_SHIFT':
          offShiftCount++
          break
        case 'UNKNOWN':
          unknownCount++
          break
      }
    }

    const nowFormatted = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })

    const waitingClientsCount = todayAppointments.filter((a) => a.status === 'checked_in').length

    return {
      totalEmployees: salonStaff.length,
      availableCount,
      busyCount,
      onBreakCount,
      onLeaveCount,
      offShiftCount,
      unknownCount,
      waitingClientsCount,
      lastUpdated: nowFormatted,
      salonTime: `${todayStr} ${currentTimeStr}`,
      statuses,
    }
  },

  /**
   * Generates chronological activity events for an employee from verified appointment records
   */
  getEmployeeTimeline(
    staffId: string,
    dateStr: string = getSalonDateStr(0)
  ): EmployeeTimelineEvent[] {
    const appointments = appointmentStore
      .getByDate(dateStr)
      .filter((a) => a.staffId === staffId || (a as any).assignedEmployeeId === staffId)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    const events: EmployeeTimelineEvent[] = []

    for (const apt of appointments) {
      if (apt.status === 'completed') {
        events.push({
          id: `evt-comp-${apt.id}`,
          timestamp: apt.endTime || apt.startTime,
          type: 'service_completed',
          title: 'Service Completed',
          description: `Completed ${apt.serviceName || 'service'} for ${apt.clientName || 'guest'}.`,
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          statusTag: 'Completed',
        })
      } else if (apt.status === 'in_progress') {
        events.push({
          id: `evt-prog-${apt.id}`,
          timestamp: apt.startTime,
          type: 'service_in_progress',
          title: 'Service In Progress',
          description: `Actively performing ${apt.serviceName || 'service'} for ${apt.clientName || 'guest'}.`,
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          statusTag: 'In Progress',
        })
      } else if (apt.status === 'checked_in') {
        events.push({
          id: `evt-chk-${apt.id}`,
          timestamp: apt.startTime,
          type: 'appointment_scheduled',
          title: 'Client Checked In (Waiting)',
          description: `${apt.clientName || 'Guest'} checked in and waiting in reception lounge.`,
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          statusTag: 'Checked In',
        })
      } else if (apt.status === 'cancelled') {
        events.push({
          id: `evt-canc-${apt.id}`,
          timestamp: apt.startTime,
          type: 'appointment_cancelled',
          title: 'Appointment Cancelled',
          description: `Booking for ${apt.serviceName || 'service'} with ${apt.clientName || 'guest'} was cancelled.`,
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          statusTag: 'Cancelled',
        })
      } else if (apt.status === 'confirmed' || apt.status === 'scheduled') {
        events.push({
          id: `evt-sched-${apt.id}`,
          timestamp: apt.startTime,
          type: 'appointment_scheduled',
          title: 'Confirmed Appointment Slot',
          description: `${apt.serviceName || 'Service'} scheduled for ${apt.clientName || 'guest'}.`,
          clientName: apt.clientName,
          serviceName: apt.serviceName,
          statusTag: apt.status === 'confirmed' ? 'Confirmed' : 'Scheduled',
        })
      }
    }

    return events
  },
}
