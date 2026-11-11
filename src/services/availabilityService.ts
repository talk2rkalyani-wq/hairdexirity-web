import type { Staff, Service, Appointment } from '../types/models'
import { serviceService } from './serviceService'
import { staffService } from './staffService'
import { appointmentService } from './appointmentService'
import {
  calculateEndTime,
  formatTime12h,
  getDayOfWeekKey,
  timeToMinutes,
  formatDateDisplay,
  getSalonDateStr,
} from '../utils/formatters'

export interface AvailableStylistResult {
  staffId: string
  staffName: string
  role: string
  matchedSkills: string[]
  startTime: string // "HH:mm" (24h)
  endTime: string // "HH:mm" (24h)
  formattedTimeWindow: string // e.g. "4:00 PM – 7:00 PM"
  workingHoursSummary: string // e.g. "Working 10:00 AM – 8:00 PM"
  explanation: {
    skillMatched: boolean
    workingHoursPassed: boolean
    conflictFree: boolean
  }
}

export type StylistUnavailableReason =
  | 'SKILL_MISMATCH'
  | 'INACTIVE'
  | 'NOT_WORKING_DAY'
  | 'OUTSIDE_WORKING_HOURS'
  | 'APPOINTMENT_CONFLICT'

export interface StylistAvailabilityEvaluation {
  staffId: string
  staffName: string
  role: string
  isAvailable: boolean
  matchedSkills: string[]
  reason?: StylistUnavailableReason
  reasonDetails?: string
}

export interface FindAvailableStylistsParams {
  serviceId: string
  date: string // "YYYY-MM-DD"
  startTime: string // "HH:mm" (24h)
}

export interface AvailabilityCheckResult {
  service: Service
  date: string
  startTime: string
  endTime: string
  duration: number
  availableStylists: AvailableStylistResult[]
  allEvaluations: StylistAvailabilityEvaluation[]
  summaryMessage: string
  reasonSummary?: string
}

/**
 * Checks whether a staff member has skills that match a given service
 */
export function isStaffCapableForService(
  staff: Staff,
  service: Service
): { capable: boolean; matchedSkills: string[] } {
  if (!staff.skills || staff.skills.length === 0) {
    return { capable: false, matchedSkills: [] }
  }

  const sName = service.name.toLowerCase()
  const sCategory = service.category.toLowerCase()
  const matchedSkills: string[] = []

  for (const skill of staff.skills) {
    const sk = skill.toLowerCase()

    // 1. Direct or partial substring matching
    if (sName.includes(sk) || sk.includes(sName)) {
      matchedSkills.push(skill)
      continue
    }

    // 2. Semantic domain matching
    // Balayage & Toning
    if (sName.includes('balayage')) {
      if (sk.includes('balayage') || sk.includes('blonde') || sk.includes('toning') || sk.includes('foils')) {
        matchedSkills.push(skill)
      }
    }
    // Haircut & Blowdry
    else if (sName.includes('haircut') || sCategory === 'haircut') {
      if (sk.includes('cut') || sk.includes('haircut') || sk.includes('precision')) {
        matchedSkills.push(skill)
      }
    }
    // Hair Spa & Deep Conditioning
    else if (sName.includes('hair spa') || sName.includes('spa')) {
      if (sk.includes('spa') || sk.includes('scalp') || sk.includes('conditioning')) {
        matchedSkills.push(skill)
      }
    }
    // Global Hair Color
    else if (sName.includes('color') || sCategory === 'color') {
      if (sk.includes('color') || sk.includes('balayage') || sk.includes('blonde')) {
        matchedSkills.push(skill)
      }
    }
    // Keratin Treatment
    else if (sName.includes('keratin')) {
      if (sk.includes('keratin')) {
        matchedSkills.push(skill)
      }
    }
    // Smoothening
    else if (sName.includes('smoothening')) {
      if (sk.includes('smoothening')) {
        matchedSkills.push(skill)
      }
    }
    // Facial
    else if (sName.includes('facial')) {
      if (sk.includes('facial')) {
        matchedSkills.push(skill)
      }
    }
    // Manicure
    else if (sName.includes('manicure')) {
      if (sk.includes('manicure')) {
        matchedSkills.push(skill)
      }
    }
    // Pedicure
    else if (sName.includes('pedicure')) {
      if (sk.includes('pedicure')) {
        matchedSkills.push(skill)
      }
    }
    // Extensions
    else if (sName.includes('extensions')) {
      if (sk.includes('extension')) {
        matchedSkills.push(skill)
      }
    }
  }

  // De-duplicate matched skills
  const uniqueMatches = Array.from(new Set(matchedSkills))
  return {
    capable: uniqueMatches.length > 0,
    matchedSkills: uniqueMatches,
  }
}

export const availabilityService = {
  /**
   * Deterministically finds all available stylists for a service at a specific date and time.
   */
  async findAvailableStylists(
    params: FindAvailableStylistsParams
  ): Promise<AvailabilityCheckResult> {
    const { serviceId, date, startTime } = params

    // 1. Resolve Service and calculate end time based on configured duration
    const service = await serviceService.getServiceById(serviceId)
    if (!service) {
      throw new Error(`Service with ID '${serviceId}' not found.`)
    }

    const duration = service.duration
    const endTime = calculateEndTime(startTime, duration)
    const reqStartMins = timeToMinutes(startTime)
    const reqEndMins = timeToMinutes(endTime)

    // 2. Fetch all staff members and all appointments for the date
    const [allStaff, dateAppointments] = await Promise.all([
      staffService.getStaff(),
      appointmentService.getAppointmentsForDate(date),
    ])

    const dayOfWeek = getDayOfWeekKey(date)
    const availableStylists: AvailableStylistResult[] = []
    const allEvaluations: StylistAvailabilityEvaluation[] = []

    for (const staff of allStaff) {
      // Evaluation A: Inactive staff check
      if (!staff.active) {
        allEvaluations.push({
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          isAvailable: false,
          matchedSkills: [],
          reason: 'INACTIVE',
          reasonDetails: `${staff.name} is currently inactive.`,
        })
        continue
      }

      // Evaluation B: Capability / Skill matching
      const { capable, matchedSkills } = isStaffCapableForService(staff, service)
      if (!capable) {
        allEvaluations.push({
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          isAvailable: false,
          matchedSkills: [],
          reason: 'SKILL_MISMATCH',
          reasonDetails: `${staff.name} does not perform ${service.name}.`,
        })
        continue
      }

      // Evaluation C: Working Hours validation
      const schedule = staff.workingHours?.[dayOfWeek]
      if (!schedule || !schedule.isOpen) {
        const capitalizedDay = dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)
        allEvaluations.push({
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          isAvailable: false,
          matchedSkills,
          reason: 'NOT_WORKING_DAY',
          reasonDetails: `${staff.name} is not scheduled to work on ${capitalizedDay}s.`,
        })
        continue
      }

      const openMins = timeToMinutes(schedule.open)
      const closeMins = timeToMinutes(schedule.close)

      if (reqStartMins < openMins || reqEndMins > closeMins) {
        allEvaluations.push({
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          isAvailable: false,
          matchedSkills,
          reason: 'OUTSIDE_WORKING_HOURS',
          reasonDetails: `${staff.name} works ${formatTime12h(schedule.open)} – ${formatTime12h(schedule.close)} on ${dayOfWeek}s. The ${duration}-minute service extends outside their working hours.`,
        })
        continue
      }

      // Evaluation D: Existing appointment conflict validation
      const staffAppointments = dateAppointments.filter(
        (apt: Appointment) => apt.staffId === staff.id && apt.status !== 'cancelled'
      )

      const conflictingApt = staffAppointments.find((apt: Appointment) => {
        const aptStartMins = timeToMinutes(apt.startTime)
        const aptEndMins = timeToMinutes(apt.endTime)
        // Overlap formula: startA < endB && endA > startB
        return reqStartMins < aptEndMins && reqEndMins > aptStartMins
      })

      if (conflictingApt) {
        allEvaluations.push({
          staffId: staff.id,
          staffName: staff.name,
          role: staff.role,
          isAvailable: false,
          matchedSkills,
          reason: 'APPOINTMENT_CONFLICT',
          reasonDetails: `${staff.name} has an existing appointment (${formatTime12h(conflictingApt.startTime)} – ${formatTime12h(conflictingApt.endTime)}).`,
        })
        continue
      }

      // All checks passed -> Stylist is Available!
      const workingHoursSummary = `Working ${formatTime12h(schedule.open)} – ${formatTime12h(schedule.close)}`
      const formattedTimeWindow = `${formatTime12h(startTime)} – ${formatTime12h(endTime)}`

      availableStylists.push({
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        matchedSkills,
        startTime,
        endTime,
        formattedTimeWindow,
        workingHoursSummary,
        explanation: {
          skillMatched: true,
          workingHoursPassed: true,
          conflictFree: true,
        },
      })

      allEvaluations.push({
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role,
        isAvailable: true,
        matchedSkills,
      })
    }

    // 3. Construct natural summary messages and factual rejection explanations
    const todayStr = getSalonDateStr(0)
    const dateLabel = date === todayStr ? 'today' : `on ${formatDateDisplay(date)}`
    const timeLabel = formatTime12h(startTime)

    let summaryMessage = ''
    let reasonSummary: string | undefined

    if (availableStylists.length > 0) {
      const count = availableStylists.length
      const plural = count === 1 ? '1 stylist' : `${count} stylists`
      summaryMessage = `Yes — I found ${plural} available for ${service.name} at ${timeLabel} ${dateLabel}.`
    } else {
      summaryMessage = `I couldn't find a stylist available for ${service.name} at ${timeLabel} ${dateLabel}.`

      // Compile factual reasons from capable stylists
      const capableEvaluations = allEvaluations.filter(
        (e) => e.matchedSkills.length > 0 && e.reason !== 'SKILL_MISMATCH'
      )

      if (capableEvaluations.length === 0) {
        reasonSummary = 'No active stylists currently specialize in this service.'
      } else {
        const conflictCount = capableEvaluations.filter(
          (e) => e.reason === 'APPOINTMENT_CONFLICT'
        ).length
        const outsideHoursCount = capableEvaluations.filter(
          (e) => e.reason === 'OUTSIDE_WORKING_HOURS' || e.reason === 'NOT_WORKING_DAY'
        ).length

        if (conflictCount === capableEvaluations.length) {
          const names = capableEvaluations.map((e) => e.staffName).join(', ')
          reasonSummary = `${capableEvaluations.length} stylists can perform this service (${names}), but all are already booked during part of the requested time.`
        } else if (outsideHoursCount === capableEvaluations.length) {
          reasonSummary = `Stylists who perform this service are not scheduled to work during this time (${timeLabel} – ${formatTime12h(endTime)}).`
        } else {
          // Mixed reasons
          const details = capableEvaluations
            .map((e) => e.reasonDetails)
            .filter(Boolean)
            .join(' ')
          reasonSummary = details || 'Qualified stylists have conflicting bookings or are outside their working hours.'
        }
      }
    }

    return {
      service,
      date,
      startTime,
      endTime,
      duration,
      availableStylists,
      allEvaluations,
      summaryMessage,
      reasonSummary,
    }
  },
}
