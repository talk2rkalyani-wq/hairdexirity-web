import type { ParsedCommand, ConversationContext } from '../types'
import { getSalonDateStr, parseNaturalTime } from '../../../utils/formatters'

/**
 * Normalizes user input by lowercasing and stripping punctuation
 */
function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’]/g, '') // remove apostrophes: today's -> todays
    .replace(/[?!.,;:()]/g, ' ') // replace punctuation with spaces
    .replace(/\s+/g, ' ') // collapse multiple spaces
    .trim()
}

/**
 * Known service keyword tokens to help reliably identify services
 * even with conversational variations.
 */
const KNOWN_SERVICE_KEYWORDS = [
  'haircut & blowdry',
  'haircut and blowdry',
  'haircut',
  'blowdry',
  'hair spa & deep conditioning',
  'hair spa and deep conditioning',
  'hair spa',
  'deep conditioning',
  'spa',
  'global hair color',
  'hair color',
  'color',
  'balayage & toning',
  'balayage and toning',
  'balayage',
  'toning',
  'keratin treatment',
  'keratin',
  'hair smoothening',
  'smoothening',
  'radiance facial ritual',
  'radiance facial',
  'facial',
  'classic manicure',
  'manicure',
  'deluxe pedicure',
  'pedicure',
  'extensions',
]

/**
 * Extracts date expression from normalized text
 */
function extractDate(normalized: string): { date: string; hasExplicitDate: boolean } {
  if (normalized.includes('tomorrow')) {
    return { date: getSalonDateStr(1), hasExplicitDate: true }
  }
  if (normalized.includes('yesterday')) {
    return { date: getSalonDateStr(-1), hasExplicitDate: true }
  }
  if (normalized.includes('today') || normalized.includes('todays')) {
    return { date: getSalonDateStr(0), hasExplicitDate: true }
  }

  const dateMatch = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/)
  if (dateMatch) {
    return { date: dateMatch[0], hasExplicitDate: true }
  }

  return { date: getSalonDateStr(0), hasExplicitDate: false }
}

/**
 * Extracts time expression from normalized text and converts to HH:mm
 */
function extractTime(text: string): string | null {
  // 1. Check for time with explicit AM/PM: e.g. "at 4 PM", "4 PM", "4pm", "4:30 pm"
  const ampmMatch = text.match(/(?:at\s+)?(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)/i)
  if (ampmMatch) {
    const parsed = parseNaturalTime(ampmMatch[1])
    if (parsed) return parsed
  }

  // 2. Check for 24-hour time or time after "at": e.g. "at 16:00", "at 4", "16:00"
  const atMatch = text.match(/\bat\s+(\d{1,2}(?::\d{2})?)\b/i)
  if (atMatch) {
    const parsed = parseNaturalTime(atMatch[1])
    if (parsed) return parsed
  }

  const standardTimeMatch = text.match(/\b(1[0-9]|2[0-3]|[0-9]):([0-5]\d)\b/)
  if (standardTimeMatch) {
    const parsed = parseNaturalTime(standardTimeMatch[0])
    if (parsed) return parsed
  }

  return null
}

/**
 * Extracts requested service name/keyword from text
 */
function extractService(normalized: string): string | null {
  // 1. Check direct match with known service keywords
  for (const keyword of KNOWN_SERVICE_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
    if (pattern.test(normalized)) {
      return keyword
    }
  }

  // 2. Extract after "for", "do", or "perform"
  // e.g. "for SpaceTravelProcedure tomorrow at 4 PM"
  const prepositionMatch = normalized.match(
    /(?:for|do|perform)\s+(?:a\s+|an\s+|the\s+)?([a-zA-Z0-9\s&/-]+?)(?:\s+at\b|\s+tomorrow\b|\s+today\b|\s+with\b|\s+on\b|[.?!]|$)/i
  )
  if (prepositionMatch) {
    const candidate = prepositionMatch[1].trim()
    if (
      candidate &&
      !['stylist', 'someone', 'anyone', 'service', 'me', 'appointment', 'an appointment', 'today', 'tomorrow'].includes(candidate)
    ) {
      return candidate
    }
  }

  return null
}

/**
 * Command Interpreter:
 * Parses natural language user queries into structured commands
 * without needing an external heavy NLP service.
 */
export function interpretCommand(
  rawInput: string,
  context?: ConversationContext
): ParsedCommand {
  const normalized = normalizeInput(rawInput)

  // ----------------------------------------------------
  // Context-Aware Intent A: CONFIRM_BOOKING
  // STRICT SAFETY RULE: Only active when a booking preview is awaiting confirmation!
  // ----------------------------------------------------
  if (context?.hasPendingBooking) {
    const confirmPhrases = [
      'confirm',
      'yes',
      'yes book it',
      'schedule it',
      'confirm booking',
      'book it',
      'go ahead',
      'yes please',
      'please confirm',
      'do it',
      'confirmed',
    ]

    if (confirmPhrases.includes(normalized)) {
      return {
        intent: 'CONFIRM_BOOKING',
        rawInput,
        params: {
          pendingBooking: context.pendingBooking,
        },
      }
    }

    const cancelPhrases = [
      'cancel',
      'dont book',
      'do not book',
      'no',
      'nevermind',
      'stop',
      'cancel booking',
      'reject',
      'abort',
    ]

    if (cancelPhrases.includes(normalized)) {
      return {
        intent: 'CANCEL_BOOKING',
        rawInput,
        params: {
          pendingBooking: context.pendingBooking,
        },
      }
    }
  }

  // ----------------------------------------------------
  // Context-Aware Intent B: SELECT_STYLIST
  // Active when system asked user to choose from multiple available stylists
  // ----------------------------------------------------
  if (context?.pendingStylistSelection) {
    const available = context.pendingStylistSelection.availableStylists
    const matched = available.find(
      (s) =>
        normalized === s.staffName.toLowerCase() ||
        normalized === `with ${s.staffName.toLowerCase()}` ||
        normalized.includes(s.staffName.toLowerCase()) ||
        s.staffName.toLowerCase().includes(normalized)
    )

    if (matched) {
      return {
        intent: 'SELECT_STYLIST',
        rawInput,
        params: {
          stylistIdOrName: matched.staffName,
        },
      }
    }
  }

  // ----------------------------------------------------
  // Context-Aware Intent C: CONFIRM_SEND_REMINDERS / CANCEL_SEND_REMINDERS
  // Active when system presented a batch reminders preview awaiting confirmation
  // ----------------------------------------------------
  if (context?.hasPendingReminders) {
    const confirmReminderPhrases = [
      'send',
      'send reminders',
      'send all',
      'send all reminders',
      'confirm',
      'yes',
      'yes send',
      'yes send them',
      'yes send reminders',
      'go ahead',
      'dispatch',
      'dispatch reminders',
      'send now',
      'confirm reminders',
    ]

    if (confirmReminderPhrases.includes(normalized)) {
      return {
        intent: 'CONFIRM_SEND_REMINDERS',
        rawInput,
        params: {
          pendingReminders: context.pendingReminders,
        },
      }
    }

    const cancelReminderPhrases = [
      'cancel',
      'dont send',
      'do not send',
      'no',
      'nevermind',
      'stop',
      'cancel reminders',
      'abort',
    ]

    if (cancelReminderPhrases.includes(normalized)) {
      return {
        intent: 'CANCEL_SEND_REMINDERS',
        rawInput,
        params: {
          pendingReminders: context.pendingReminders,
        },
      }
    }
  }

  // ----------------------------------------------------
  // Intent 1: SHOW_TODAY_BOOKINGS
  // ----------------------------------------------------
  const isTodayMentioned =
    normalized.includes('today') || normalized.includes('todays')
  const isBookingOrAppointment =
    normalized.includes('booking') ||
    normalized.includes('bookings') ||
    normalized.includes('appointment') ||
    normalized.includes('appointments') ||
    normalized.includes('schedule')

  const bookingsExactPatterns = [
    'show today bookings',
    'show todays bookings',
    'show today appointments',
    'show todays appointments',
    'show today schedule',
    'show todays schedule',
    'today bookings',
    'todays bookings',
    'today appointments',
    'todays appointments',
    'today schedule',
    'todays schedule',
    'what are today bookings',
    'what are todays bookings',
    'what are today appointments',
    'what are todays appointments',
    'what appointments do i have today',
    'what bookings do i have today',
    'what is my schedule today',
    'my schedule today',
    'schedule for today',
    'bookings for today',
    'appointments for today',
  ]

  // Check for stylist-specific appointments query: e.g. "Show Rohan's appointments"
  const stylistBookingMatch = /(?:show\s+)?([a-z]+)(?:s)?\s+(?:appointments|bookings|schedule)/i.exec(normalized)
  const candidateStylist = stylistBookingMatch ? stylistBookingMatch[1] : undefined
  const isExcludedWord = candidateStylist && ['today', 'todays', 'my', 'all', 'the', 'salon', 'our'].includes(candidateStylist)

  if (candidateStylist && !isExcludedWord && !normalized.startsWith('book ') && !normalized.startsWith('schedule ')) {
    return {
      intent: 'SHOW_TODAY_BOOKINGS',
      rawInput,
      params: {
        date: getSalonDateStr(0),
        stylistQuery: candidateStylist,
      },
    }
  }

  if (
    bookingsExactPatterns.includes(normalized) ||
    (isTodayMentioned &&
      isBookingOrAppointment &&
      !normalized.startsWith('book ') &&
      !normalized.startsWith('schedule ') &&
      !normalized.includes('available') &&
      !normalized.includes('who can do'))
  ) {
    return {
      intent: 'SHOW_TODAY_BOOKINGS',
      rawInput,
      params: {
        date: getSalonDateStr(0),
      },
    }
  }


  // ----------------------------------------------------
  // Intent 2: SHOW_TODAY_REVENUE
  // ----------------------------------------------------
  const isRevenueMentioned =
    normalized.includes('revenue') ||
    normalized.includes('earnings') ||
    normalized.includes('sales') ||
    normalized.includes('income')

  if (isRevenueMentioned) {
    return {
      intent: 'SHOW_TODAY_REVENUE',
      rawInput,
      params: {
        date: getSalonDateStr(0),
      },
    }
  }

  // ----------------------------------------------------
  // Intent 3: CREATE_APPOINTMENT_REQUEST
  // e.g. "Book Priya Sharma for balayage tomorrow at 4 PM with Rohan"
  // ----------------------------------------------------
  const isBookCommand =
    normalized.startsWith('book ') ||
    normalized.startsWith('schedule ') ||
    normalized.startsWith('make a booking') ||
    normalized.includes('book an appointment') ||
    normalized.includes('schedule an appointment')

  if (isBookCommand && !normalized.includes('available')) {
    // 1. Date & Time
    const { date, hasExplicitDate } = extractDate(normalized)
    const startTime = extractTime(normalized)

    // 2. Stylist (e.g. "with Rohan", "with Rohan Sen")
    let stylistQuery: string | undefined
    const withMatch = normalized.match(/\bwith\s+([a-zA-Z\s]+?)(?:\s+at|\s+tomorrow|\s+today|\s+on|\s+for|$|[.?!])/i)
    if (withMatch) {
      const candidate = withMatch[1].trim()
      if (candidate && !['stylist', 'someone', 'anyone'].includes(candidate)) {
        stylistQuery = candidate
      }
    }

    // 3. Client & Service extraction
    let clientQuery: string | undefined
    let serviceQuery = extractService(normalized)

    // Pattern A: "book [Client] for [Service]..." or "book an appointment for [Client] for [Service]..."
    const bookClientForService = normalized.match(
      /(?:book|schedule|make a booking for)\s+(?:an?\s+appointment\s+for\s+)?([a-zA-Z\s]+?)\s+for\s+([a-zA-Z0-9\s&/-]+?)(?:\s+tomorrow\b|\s+today\b|\s+at\b|\s+with\b|\s+on\b|[.?!]|$)/i
    )

    if (bookClientForService) {
      const candClient = bookClientForService[1].trim()
      const candService = bookClientForService[2].trim()
      if (
        candClient &&
        !KNOWN_SERVICE_KEYWORDS.some((kw) => candClient.includes(kw)) &&
        !['an appointment', 'appointment'].includes(candClient)
      ) {
        clientQuery = candClient
      }
      if (
        candService &&
        !['stylist', 'someone', 'anyone', 'service', 'me', 'appointment', 'an appointment', 'today', 'tomorrow'].includes(candService)
      ) {
        serviceQuery = candService
      }
    }

    if (!clientQuery) {
      // Pattern B: "book [Client] for..."
      const clientForMatch = normalized.match(
        /(?:book|schedule|make a booking for)\s+(?:an?\s+appointment\s+for\s+)?([a-zA-Z\s]+?)\s+for\s+/i
      )
      if (clientForMatch) {
        const candidate = clientForMatch[1].trim()
        const isCandidateService = KNOWN_SERVICE_KEYWORDS.some((kw) => candidate.includes(kw))
        if (candidate && !isCandidateService && !['an appointment', 'appointment'].includes(candidate)) {
          clientQuery = candidate
        }
      } else {
        // Pattern C: Direct booking without "for" e.g. "book Priya tomorrow at 4 PM"
        const directMatch = normalized.match(
          /(?:book|schedule)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)(?:\s+tomorrow|\s+today|\s+at|\s+with|$)/i
        )
        if (directMatch) {
          const candidate = directMatch[1].trim()
          const isCandidateService = KNOWN_SERVICE_KEYWORDS.some((kw) => candidate.includes(kw))
          if (candidate && !isCandidateService && !['an appointment', 'appointment', 'stylist'].includes(candidate)) {
            clientQuery = candidate
          }
        }
      }
    }

    return {
      intent: 'CREATE_APPOINTMENT_REQUEST',
      rawInput,
      params: {
        clientQuery: clientQuery || undefined,
        serviceQuery: serviceQuery || undefined,
        stylistQuery: stylistQuery || undefined,
        date,
        startTime: startTime || undefined,
        missingClient: !clientQuery,
        missingService: !serviceQuery,
        missingTime: !startTime,
        missingDate: !hasExplicitDate && !startTime, // If neither date nor time provided
      },
    }
  }

  // ----------------------------------------------------
  // Intent 4: FIND_AVAILABLE_STYLIST
  // ----------------------------------------------------
  const isAvailabilityQuery =
    normalized.includes('available') ||
    normalized.includes('availability') ||
    normalized.includes('who can do') ||
    normalized.includes('who can perform') ||
    normalized.includes('who is free') ||
    normalized.includes('is anyone free') ||
    normalized.includes('anyone available') ||
    normalized.includes('stylist for') ||
    normalized.includes('find a stylist') ||
    normalized.includes('find stylist') ||
    normalized === 'find available stylist'

  if (isAvailabilityQuery) {
    const { date } = extractDate(normalized)
    const startTime = extractTime(normalized)
    const serviceQuery = extractService(normalized)

    return {
      intent: 'FIND_AVAILABLE_STYLIST',
      rawInput,
      params: {
        serviceQuery: serviceQuery || undefined,
        startTime: startTime || undefined,
        date,
        missingService: !serviceQuery,
        missingTime: !startTime,
      },
    }
  }

  // ----------------------------------------------------
  // Intent 5: SEND_APPOINTMENT_REMINDERS
  // e.g. "Send appointment reminders", "Send reminders for tomorrow", "Remind Priya Sharma"
  // ----------------------------------------------------
  const isReminderQuery =
    normalized === 'send appointment reminders' ||
    normalized.includes('appointment reminder') ||
    normalized.includes('appointment reminders') ||
    normalized.includes('send reminder') ||
    normalized.includes('send reminders') ||
    normalized.includes('remind client') ||
    normalized.includes('remind clients') ||
    normalized.startsWith('remind ')

  if (isReminderQuery) {
    const { date } = extractDate(normalized)

    // Optional specific client check: "remind Priya Sharma", "send reminder to Priya Sharma"
    let clientQuery: string | undefined
    const clientMatch = rawInput.match(
      /(?:send\s+reminders?\s+to|remind)\s+([a-zA-Z\s]+?)(?:\s+for|\s+tomorrow|\s+today|\s+at|$|[.?!])/i
    )
    if (clientMatch) {
      const candidate = clientMatch[1].trim()
      if (
        candidate &&
        !['clients', 'client', 'everyone', 'all', 'them', 'my clients', 'today', 'tomorrow'].includes(candidate.toLowerCase())
      ) {
        clientQuery = candidate
      }
    }

    return {
      intent: 'SEND_APPOINTMENT_REMINDERS',
      rawInput,
      params: {
        date,
        clientQuery,
      },
    }
  }

  // ----------------------------------------------------
  // Default: UNKNOWN
  // ----------------------------------------------------
  return {
    intent: 'UNKNOWN',
    rawInput,
  }
}
