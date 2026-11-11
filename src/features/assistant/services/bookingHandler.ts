import type {
  PendingBooking,
  AssistantActionResponse,
  ConversationContext,
} from '../types'
import { clientService } from '../../../services/clientService'
import { serviceService } from '../../../services/serviceService'
import { staffService } from '../../../services/staffService'
import { availabilityService } from '../../../services/availabilityService'
import { appointmentService } from '../../../services/appointmentService'
import {
  calculateEndTime,
  formatTime12h,
  formatDateDisplay,
  getSalonDateStr,
} from '../../../utils/formatters'

export const bookingHandler = {
  /**
   * Processes a natural language booking request and builds a PendingBooking preview
   * without creating an appointment in the database/memory.
   */
  async processBookingRequest(
    params: Record<string, unknown>,
    _context?: ConversationContext
  ): Promise<AssistantActionResponse> {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    const {
      clientQuery,
      serviceQuery,
      stylistQuery,
      date,
      startTime,
      missingClient,
      missingService,
      missingTime,
      missingDate,
    } = params as {
      clientQuery?: string
      serviceQuery?: string
      stylistQuery?: string
      date?: string
      startTime?: string
      missingClient?: boolean
      missingService?: boolean
      missingTime?: boolean
      missingDate?: boolean
    }

    // 1. Missing Information Checks
    if (missingClient || !clientQuery) {
      return {
        type: 'clarification_prompt',
        message: 'Which client would you like to book?',
        timestamp,
      }
    }

    if (missingService || !serviceQuery) {
      return {
        type: 'clarification_prompt',
        message: 'Which service would you like to book?',
        timestamp,
      }
    }

    if (missingDate && missingTime) {
      return {
        type: 'clarification_prompt',
        message: 'What date and time would you like for this appointment?',
        timestamp,
      }
    }

    if (missingTime || !startTime) {
      return {
        type: 'clarification_prompt',
        message: 'What time would you like the appointment?',
        timestamp,
      }
    }

    // 2. Client Resolution
    const clientMatches = await clientService.searchClients(clientQuery.trim())
    if (clientMatches.length === 0) {
      return {
        type: 'error',
        message: `I couldn't find a client named '${clientQuery}'. Please check the name or add them in the Clients module.`,
        timestamp,
      }
    }

    let resolvedClient = clientMatches[0]
    if (clientMatches.length > 1) {
      // Check for exact name match
      const exact = clientMatches.find(
        (c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase()
      )
      if (exact) {
        resolvedClient = exact
      } else {
        return {
          type: 'client_selection',
          message: `I found ${clientMatches.length} clients matching '${clientQuery}'. Which client did you mean?`,
          selectableClients: clientMatches,
          timestamp,
        }
      }
    }

    // 3. Service Resolution
    const allServices = await serviceService.getActiveServices()
    const sQuery = serviceQuery.trim().toLowerCase()

    let resolvedService = allServices.find((s) => s.name.toLowerCase() === sQuery)
    if (!resolvedService) {
      resolvedService = allServices.find(
        (s) => s.name.toLowerCase().includes(sQuery) || sQuery.includes(s.name.toLowerCase())
      )
    }
    if (!resolvedService) {
      const tokens = sQuery.split(/\s+/)
      resolvedService = allServices.find((s) => {
        const sTokens = s.name.toLowerCase().split(/\s+/)
        return tokens.some((t) => sTokens.includes(t))
      })
    }

    if (!resolvedService) {
      return {
        type: 'error',
        message: `I couldn't find a service matching '${serviceQuery}'. Available services include Haircut & Blowdry, Balayage & Toning, Hair Spa, Global Hair Color, and Keratin Treatment.`,
        timestamp,
      }
    }

    // Derive duration, price, and end time strictly from service data
    const duration = resolvedService.duration
    const price = resolvedService.price
    const resolvedDate = date || getSalonDateStr(0)
    const endTime = calculateEndTime(startTime, duration)

    // 4. Stylist Resolution and Availability Evaluation
    const allStaff = await staffService.getStaff()

    // CASE A: User explicitly specified a stylist
    if (stylistQuery) {
      const stQuery = stylistQuery.trim().toLowerCase()
      const matchedStaff = allStaff.find(
        (st) =>
          st.name.toLowerCase() === stQuery ||
          st.name.toLowerCase().includes(stQuery) ||
          stQuery.includes(st.name.toLowerCase())
      )

      if (!matchedStaff) {
        return {
          type: 'error',
          message: `I couldn't find a stylist named '${stylistQuery}'.`,
          timestamp,
        }
      }

      if (!matchedStaff.active) {
        return {
          type: 'error',
          message: `${matchedStaff.name} is currently inactive and cannot accept bookings.`,
          timestamp,
        }
      }

      // VIP Booking Restriction: Rajesh (Owner 1) restricted for VIPs via AI Assistant
      if (
        resolvedClient.isVip &&
        (matchedStaff.id === 'staff-real-03' || matchedStaff.name.toLowerCase().includes('rajesh'))
      ) {
        return {
          type: 'error',
          message: `Booking Restricted: VIP client ${resolvedClient.name} cannot be booked with Rajesh (Owner 1) via the AI Assistant. This exclusive tier requires in-salon front-desk manual booking (Rule: fn_enforce_vip_booking_rules).`,
          timestamp,
        }
      }

      // Validate availability using availabilityService
      const availability = await availabilityService.findAvailableStylists({
        serviceId: resolvedService.id,
        date: resolvedDate,
        startTime,
      })

      const isStylistAvailable = availability.availableStylists.some(
        (s) => s.staffId === matchedStaff.id
      )

      if (!isStylistAvailable) {
        const evalItem = availability.allEvaluations.find(
          (e) => e.staffId === matchedStaff.id
        )

        let conflictMessage = ''
        if (evalItem?.reason === 'SKILL_MISMATCH') {
          conflictMessage = `${matchedStaff.name} doesn't have the required capability for ${resolvedService.name}.`
        } else if (evalItem?.reason === 'APPOINTMENT_CONFLICT') {
          conflictMessage = `${matchedStaff.name} isn't available from ${formatTime12h(
            startTime
          )}–${formatTime12h(endTime)} because of an existing appointment.`
        } else if (
          evalItem?.reason === 'OUTSIDE_WORKING_HOURS' ||
          evalItem?.reason === 'NOT_WORKING_DAY'
        ) {
          conflictMessage = `${matchedStaff.name} is not scheduled to work during this time (${formatTime12h(
            startTime
          )}–${formatTime12h(endTime)}).`
        } else {
          conflictMessage = `${matchedStaff.name} is not available for this appointment.`
        }

        // Check if other qualifying stylists are available
        if (availability.availableStylists.length > 0) {
          const othersList = availability.availableStylists
            .map((s) => s.staffName)
            .join(', ')
          conflictMessage += ` However, the following stylist(s) are available: ${othersList}.`
        }

        return {
          type: 'error',
          message: conflictMessage,
          selectableStylists: availability.availableStylists,
          timestamp,
        }
      }

      // Stylist is available! Build PendingBooking preview
      const pendingBooking: PendingBooking = {
        clientId: resolvedClient.id,
        clientName: resolvedClient.name,
        clientPhone: resolvedClient.phone,
        serviceId: resolvedService.id,
        serviceName: resolvedService.name,
        staffId: matchedStaff.id,
        staffName: matchedStaff.name,
        staffRole: matchedStaff.role.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        date: resolvedDate,
        startTime,
        endTime,
        duration,
        price,
      }

      return {
        type: 'booking_preview',
        message: 'Please review and confirm the appointment details below:',
        pendingBooking,
        timestamp,
      }
    }

    // CASE B: User did NOT specify a stylist -> Run availability check
    const availability = await availabilityService.findAvailableStylists({
      serviceId: resolvedService.id,
      date: resolvedDate,
      startTime,
    })

    if (availability.availableStylists.length === 0) {
      const todayStr = getSalonDateStr(0)
      const dateLabel = resolvedDate === todayStr ? 'today' : `on ${formatDateDisplay(resolvedDate)}`
      return {
        type: 'error',
        message: `I couldn't find a stylist available for ${resolvedService.name} at ${formatTime12h(
          startTime
        )} ${dateLabel}. ${availability.reasonSummary || ''}`,
        timestamp,
      }
    }

    // Exactly 1 stylist available: prefill in booking preview
    if (availability.availableStylists.length === 1) {
      const singleStylist = availability.availableStylists[0]
      const pendingBooking: PendingBooking = {
        clientId: resolvedClient.id,
        clientName: resolvedClient.name,
        clientPhone: resolvedClient.phone,
        serviceId: resolvedService.id,
        serviceName: resolvedService.name,
        staffId: singleStylist.staffId,
        staffName: singleStylist.staffName,
        staffRole: singleStylist.role,
        date: resolvedDate,
        startTime,
        endTime,
        duration,
        price,
      }

      return {
        type: 'booking_preview',
        message: `I found ${singleStylist.staffName} available. Please review and confirm the booking:`,
        pendingBooking,
        timestamp,
      }
    }

    // MULTIPLE stylists available: DO NOT automatically choose one! Prompt user to choose.
    return {
      type: 'stylist_selection',
      message: `I found ${availability.availableStylists.length} available stylists for this appointment. Which stylist would you like to book?`,
      selectableStylists: availability.availableStylists,
      timestamp,
    }
  },

  /**
   * Called when user chooses a stylist from the multi-stylist selection prompt
   */
  async selectStylist(
    stylistIdOrName: string,
    context: ConversationContext
  ): Promise<AssistantActionResponse> {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    const pending = context.pendingStylistSelection
    if (!pending) {
      return {
        type: 'error',
        message: 'No active stylist selection found. Please start a new booking request.',
        timestamp,
      }
    }

    const matchedStylist = pending.availableStylists.find(
      (s) =>
        s.staffId === stylistIdOrName ||
        s.staffName.toLowerCase() === stylistIdOrName.toLowerCase() ||
        s.staffName.toLowerCase().includes(stylistIdOrName.toLowerCase())
    )

    if (!matchedStylist) {
      return {
        type: 'error',
        message: `I couldn't find '${stylistIdOrName}' among the available stylists. Please choose from: ${pending.availableStylists.map((s) => s.staffName).join(', ')}.`,
        timestamp,
      }
    }

    // Check if client is VIP and stylist is Rajesh (Owner 1)
    const allClients = await clientService.getClients()
    const targetClient = allClients.find((c) => c.id === pending.clientId)
    if (
      targetClient?.isVip &&
      (matchedStylist.staffId === 'staff-real-03' || matchedStylist.staffName.toLowerCase().includes('rajesh'))
    ) {
      return {
        type: 'error',
        message: `Booking Restricted: VIP client ${targetClient.name} cannot be booked with Rajesh (Owner 1) via the AI Assistant. This exclusive tier requires in-salon front-desk manual booking (Rule: fn_enforce_vip_booking_rules).`,
        timestamp,
      }
    }

    const pendingBooking: PendingBooking = {
      clientId: pending.clientId,
      clientName: pending.clientName,
      serviceId: pending.serviceId,
      serviceName: pending.serviceName,
      staffId: matchedStylist.staffId,
      staffName: matchedStylist.staffName,
      staffRole: matchedStylist.role,
      date: pending.date,
      startTime: pending.startTime,
      endTime: pending.endTime,
      duration: pending.duration,
      price: pending.price,
    }

    return {
      type: 'booking_preview',
      message: `Selected ${matchedStylist.staffName}. Please review and confirm the appointment:`,
      pendingBooking,
      timestamp,
    }
  },

  /**
   * Confirms a PendingBooking and creates the actual appointment in the data layer.
   */
  async confirmBooking(
    pendingBooking: PendingBooking | null | undefined
  ): Promise<AssistantActionResponse> {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (!pendingBooking) {
      return {
        type: 'general',
        message:
          "There is no pending booking awaiting confirmation. You can start by saying 'Book Priya Sharma for balayage tomorrow at 4 PM'.",
        timestamp,
      }
    }

    try {
      // Final conflict validation safeguard right before creation
      const created = await appointmentService.createAppointment({
        clientId: pendingBooking.clientId,
        serviceId: pendingBooking.serviceId,
        staffId: pendingBooking.staffId,
        date: pendingBooking.date,
        startTime: pendingBooking.startTime,
        endTime: pendingBooking.endTime,
        price: pendingBooking.price,
        status: 'confirmed',
        notes: pendingBooking.notes || 'Booked via AI Assistant',
      })

      // Strictly verify appointment was committed to the canonical source of truth
      const committed = await appointmentService.getAppointmentById(created.id)
      if (!committed) {
        throw new Error('Appointment persistence verification failed: could not commit to canonical store.')
      }

      // Fetch enriched appointment representation from canonical store
      const enrichedAppointments = await appointmentService.getEnrichedAppointmentsForDate(
        pendingBooking.date
      )
      const enriched =
        enrichedAppointments.find((a) => a.id === created.id) || {
          ...created,
          client: {
            id: pendingBooking.clientId,
            name: pendingBooking.clientName,
            phone: pendingBooking.clientPhone || '',
            email: '',
            notes: '',
            preferences: {},
            salonId: 'salon-luma-01',
            createdAt: new Date().toISOString(),
            totalSpend: 0,
          },
          service: {
            id: pendingBooking.serviceId,
            name: pendingBooking.serviceName,
            description: '',
            duration: pendingBooking.duration,
            price: pendingBooking.price,
            category: 'styling',
            active: true,
            salonId: 'salon-luma-01',
          },
          staff: {
            id: pendingBooking.staffId,
            name: pendingBooking.staffName,
            phone: '',
            email: '',
            role: 'senior_stylist',
            skills: [],
            experience: '',
            active: true,
            workingHours: {} as any,
            salonId: 'salon-luma-01',
          },
        }

      return {
        type: 'booking_confirmed',
        message: 'Appointment booked successfully.',
        confirmedAppointment: enriched,
        timestamp,
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown booking error'
      return {
        type: 'error',
        message: `I couldn't create that appointment: ${errorMsg}. Please check the appointment details and try again.`,
        timestamp,
      }
    }
  },

  /**
   * Cancels a pending booking preview without modifying the data layer.
   */
  cancelBooking(
    pendingBooking: PendingBooking | null | undefined
  ): AssistantActionResponse {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    if (!pendingBooking) {
      return {
        type: 'general',
        message: 'There is no pending booking to cancel.',
        timestamp,
      }
    }

    return {
      type: 'booking_cancelled',
      message: 'Appointment booking cancelled. No appointment was created.',
      timestamp,
    }
  },
}
