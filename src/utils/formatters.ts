/**
 * Centralized formatting utilities for Hair Dexirity (India localization)
 */

/**
 * Formats a numeric price or spend into Indian Rupee currency format (₹)
 * Uses standard Indian numbering system grouping (e.g. ₹1,680, ₹25,000, ₹1,50,000)
 */
export function formatCurrency(amount: number, symbol: string = '₹'): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return `${symbol}0`
  }

  // Format with en-IN locale for Indian numbering grouping
  const formattedNumber = amount.toLocaleString('en-IN')
  return `${symbol}${formattedNumber}`
}

/**
 * Formats a phone number for display
 */
export function formatPhone(phone: string): string {
  if (!phone) return ''
  return phone.trim()
}

/**
 * Salon default timezone for Indian market localization
 */
export const SALON_TIMEZONE = 'Asia/Kolkata'

/**
 * Returns a YYYY-MM-DD date string computed in the salon's timezone (Asia/Kolkata)
 * with an optional day offset (e.g. 0 for today, -1 for yesterday, 1 for tomorrow).
 */
export function getSalonDateStr(offsetDays: number = 0): string {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SALON_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const todayParts = formatter.format(now) // 'YYYY-MM-DD'
  if (offsetDays === 0) return todayParts

  const [y, m, d] = todayParts.split('-').map(Number)
  const offsetDate = new Date(Date.UTC(y, m - 1, d + offsetDays))
  return offsetDate.toISOString().split('T')[0]
}

/**
 * Returns current time "HH:mm" (24h) computed in the salon's timezone (Asia/Kolkata).
 */
export function getSalonTimeStr(): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: SALON_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = formatter.formatToParts(new Date())
    const hour = parts.find((p) => p.type === 'hour')?.value || '00'
    const minute = parts.find((p) => p.type === 'minute')?.value || '00'
    return `${hour}:${minute}`
  } catch {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
}

/**
 * Formats an ISO date string (YYYY-MM-DD or full ISO) for display in Indian format (DD/MM/YYYY or readable)
 */
export function formatDate(dateString: string, format: 'short' | 'medium' | 'long' = 'medium'): string {
  if (!dateString) return ''
  try {
    const d = new Date(dateString)
    if (isNaN(d.getTime())) return dateString

    if (format === 'short') {
      return d.toLocaleDateString('en-IN', {
        timeZone: SALON_TIMEZONE,
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    }

    if (format === 'long') {
      return d.toLocaleDateString('en-IN', {
        timeZone: SALON_TIMEZONE,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    }

    return d.toLocaleDateString('en-IN', {
      timeZone: SALON_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateString
  }
}

/**
 * Converts 24-hour time "HH:mm" to 12-hour display "h:mm AM/PM"
 */
export function formatTime12h(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24
  const [hStr, mStr] = time24.split(':')
  let h = parseInt(hStr, 10)
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${mStr} ${ampm}`
}

/**
 * Converts "HH:mm" to total minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(':')) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Converts minutes from midnight to "HH:mm" (24h)
 */
export function minutesToTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Computes end time from a start time and duration in minutes
 */
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  const startMins = timeToMinutes(startTime)
  return minutesToTime(startMins + durationMinutes)
}

import type { DayOfWeek } from '../types/models'

/**
 * Returns DayOfWeek key ('monday' | 'tuesday' etc.) for a YYYY-MM-DD date string
 */
export function getDayOfWeekKey(dateStr: string): DayOfWeek {
  const d = new Date(`${dateStr}T12:00:00+05:30`)
  const dayIndex = d.getDay() // 0 = Sunday, 1 = Monday ... 6 = Saturday
  const days: DayOfWeek[] = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ]
  return days[dayIndex]
}

/**
 * Adds offset days to a YYYY-MM-DD date string
 */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const offsetDate = new Date(Date.UTC(y, m - 1, d + days))
  return offsetDate.toISOString().split('T')[0]
}

export interface WeekDayInfo {
  dateStr: string
  dayKey: DayOfWeek
  dayNum: number
  formattedShort: string
  isToday: boolean
}

/**
 * Computes the 7 days (Monday through Sunday) of the week containing baseDateStr
 */
export function getWeekDates(baseDateStr: string): WeekDayInfo[] {
  const todayStr = getSalonDateStr(0)
  const d = new Date(`${baseDateStr}T12:00:00+05:30`)
  const dayOfWeek = d.getDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const mondayStr = addDaysToDate(baseDateStr, diffToMonday)

  const days: DayOfWeek[] = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]

  return days.map((dayKey, idx) => {
    const dateStr = addDaysToDate(mondayStr, idx)
    const dateObj = new Date(`${dateStr}T12:00:00+05:30`)
    return {
      dateStr,
      dayKey,
      dayNum: dateObj.getDate(),
      formattedShort: dateObj.toLocaleDateString('en-IN', {
        timeZone: SALON_TIMEZONE,
        weekday: 'short',
      }),
      isToday: dateStr === todayStr,
    }
  })
}

/**
 * Formats a full readable date header for Day View (e.g. "Wednesday, 17 September 2026")
 */
export function formatDateDisplay(dateStr: string): string {
  try {
    const d = new Date(`${dateStr}T12:00:00+05:30`)
    return d.toLocaleDateString('en-IN', {
      timeZone: SALON_TIMEZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

/**
 * Formats a week range header for Week View (e.g. "14 Sep – 20 Sep 2026")
 */
export function formatWeekRangeDisplay(startDateStr: string, endDateStr: string): string {
  try {
    const start = new Date(`${startDateStr}T12:00:00+05:30`)
    const end = new Date(`${endDateStr}T12:00:00+05:30`)

    const startFormatted = start.toLocaleDateString('en-IN', {
      timeZone: SALON_TIMEZONE,
      day: 'numeric',
      month: 'short',
    })
    const endFormatted = end.toLocaleDateString('en-IN', {
      timeZone: SALON_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })

    return `${startFormatted} – ${endFormatted}`
  } catch {
    return `${startDateStr} – ${endDateStr}`
  }
}

/**
 * Normalizes conversational time expressions like "4 PM", "4:00 PM", "4pm", "16:00" into "HH:mm" (24h)
 */
export function parseNaturalTime(input: string): string | null {
  if (!input) return null
  const trimmed = input.trim().toLowerCase()

  // Match formats like "4:30 pm", "4 pm", "4pm", "4:30pm", "4:30", "16:00"
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!match) return null

  let hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  const meridian = match[3] ? match[3].toLowerCase() : null

  if (minutes < 0 || minutes >= 60) return null

  if (meridian === 'pm') {
    if (hours < 12) hours += 12
  } else if (meridian === 'am') {
    if (hours === 12) hours = 0
  } else {
    // If hours is between 1 and 7 without AM/PM, in a salon 1-7 typically implies 1 PM - 7 PM
    if (hours >= 1 && hours <= 7) {
      hours += 12
    }
  }

  if (hours < 0 || hours > 23) return null

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Normalizes conversational date expressions ("today", "tomorrow", or "YYYY-MM-DD")
 * into YYYY-MM-DD in Asia/Kolkata timezone. Defaults to today.
 */
export function parseNaturalDate(dateInput?: string): string {
  if (!dateInput) return getSalonDateStr(0)

  const trimmed = dateInput.trim().toLowerCase()
  if (trimmed === 'today') {
    return getSalonDateStr(0)
  }
  if (trimmed === 'tomorrow') {
    return getSalonDateStr(1)
  }
  if (trimmed === 'yesterday') {
    return getSalonDateStr(-1)
  }

  // If already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }

  return getSalonDateStr(0)
}

