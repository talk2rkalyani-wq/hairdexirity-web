import type {
  ParsedCommand,
  AssistantActionResponse,
  ConversationContext,
  PendingBooking,
  PendingReminderBatch,
} from '../types'
import { appointmentService } from '../../../services/appointmentService'
import { serviceService } from '../../../services/serviceService'
import { availabilityService } from '../../../services/availabilityService'
import { reminderService } from '../../../services/reminderService'
import { sessionService } from '../../../services/sessionService'
import { permissionService } from '../../../services/permissionService'
import { bookingHandler } from './bookingHandler'
import { formatCurrency, getSalonDateStr } from '../../../utils/formatters'

/**
 * Action Handler:
 * Dispatches interpreted commands to corresponding application services
 * and returns structured assistant responses.
 */
export async function executeCommand(
  command: ParsedCommand,
  context?: ConversationContext
): Promise<AssistantActionResponse> {
  const timestamp = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
  const session = sessionService.getCurrentSession()

  switch (command.intent) {
    case 'SHOW_TODAY_BOOKINGS': {
      try {
        const dateStr =
          (command.params?.date as string) || getSalonDateStr(0)
        const targetStylistQuery = command.params?.stylistQuery as string | undefined

        // Role check for Employee
        if (session && session.isAuthenticated && session.role === 'EMPLOYEE') {
          // If query mentions another stylist, reject with permission error
          if (targetStylistQuery) {
            const myNameLower = (session.name || '').toLowerCase()
            const queryLower = targetStylistQuery.toLowerCase()
            const firstName = myNameLower.split(' ')[0]
            if (!myNameLower.includes(queryLower) && !queryLower.includes(firstName)) {
              return {
                type: 'error',
                message: 'You do not have permission to view appointments for other employees.',
                timestamp,
              }
            }
          }

          // Scoped to the logged in employee's appointments
          const appointments =
            await appointmentService.getEnrichedAppointmentsForDate(dateStr)

          if (!appointments || appointments.length === 0) {
            return {
              type: 'empty',
              message: "You don't have any appointments scheduled for today.",
              timestamp,
            }
          }

          return {
            type: 'appointment_list',
            message: 'Here are your scheduled appointments for today:',
            appointments,
            timestamp,
          }
        }

        // For OWNER or RECEPTIONIST: show salon-wide or filter by specific stylist
        let appointments =
          await appointmentService.getEnrichedAppointmentsForDate(dateStr, { ignoreScope: true })

        if (targetStylistQuery) {
          const q = targetStylistQuery.toLowerCase()
          appointments = appointments.filter((a) =>
            (a.staff?.name || '').toLowerCase().includes(q)
          )
        }

        if (!appointments || appointments.length === 0) {
          const targetNote = targetStylistQuery ? ` for ${targetStylistQuery}` : ''
          return {
            type: 'empty',
            message: `You don't have any appointments scheduled${targetNote} for today.`,
            timestamp,
          }
        }

        return {
          type: 'appointment_list',
          message: "Here are today's appointments:",
          appointments,
          timestamp,
        }
      } catch (error) {
        console.error('Error fetching appointments:', error)
        return {
          type: 'error',
          message:
            "I encountered an unexpected issue checking today's schedule. Please try again.",
          timestamp,
        }
      }
    }

    case 'SHOW_TODAY_REVENUE': {
      try {
        if (session && session.isAuthenticated && !permissionService.canViewSalonRevenue(session)) {
          return {
            type: 'error',
            message: 'Revenue summaries are only accessible to salon owners and managers.',
            timestamp,
          }
        }

        const dateStr =
          (command.params?.date as string) || getSalonDateStr(0)

        const rev = await appointmentService.getRevenueForDate(dateStr)
        const totalFmt = formatCurrency(rev.totalRevenue)
        const realizedFmt = formatCurrency(rev.realizedRevenue)
        const projectedFmt = formatCurrency(rev.projectedRevenue)

        const msg = `Today's total projected revenue is ${totalFmt}. (Realized: ${realizedFmt} from ${rev.completedCount} completed appointments, Projected: ${projectedFmt} from ${rev.scheduledCount} upcoming appointments).`

        return {
          type: 'revenue_summary',
          message: msg,
          timestamp,
        }
      } catch (error) {

        console.error('Error fetching revenue:', error)
        return {
          type: 'error',
          message:
            "I encountered an issue computing today's revenue. Please try again.",
          timestamp,
        }
      }
    }

    case 'FIND_AVAILABLE_STYLIST': {
      try {
        const { serviceQuery, startTime, date, missingService, missingTime } =
          command.params || {}

        // 1. Missing Service Clarification
        if (missingService || !serviceQuery) {
          return {
            type: 'clarification_prompt',
            message:
              'Which service would you like to book? (e.g., Haircut & Blowdry, Balayage & Toning, Hair Spa, Global Hair Color)',
            timestamp,
          }
        }

        // 2. Resolve Service
        const allServices = await serviceService.getServices()
        const activeServices = allServices.filter((s) => s.active)
        const queryStr = (serviceQuery as string).trim().toLowerCase()

        // Match exact or partial
        let matchedService = activeServices.find(
          (s) => s.name.toLowerCase() === queryStr
        )
        if (!matchedService) {
          matchedService = activeServices.find(
            (s) =>
              s.name.toLowerCase().includes(queryStr) ||
              queryStr.includes(s.name.toLowerCase())
          )
        }
        if (!matchedService) {
          const queryTokens = queryStr.split(/\s+/)
          matchedService = activeServices.find((s) => {
            const sTokens = s.name.toLowerCase().split(/\s+/)
            return queryTokens.some((t) => sTokens.includes(t))
          })
        }

        if (!matchedService) {
          return {
            type: 'error',
            message: `I couldn't find a service matching '${serviceQuery}'. Available services include Haircut & Blowdry, Balayage & Toning, Hair Spa & Deep Conditioning, Global Hair Color, and Keratin Treatment.`,
            timestamp,
          }
        }

        // 3. Missing Time Clarification
        if (missingTime || !startTime) {
          return {
            type: 'clarification_prompt',
            message: `What time would you like the appointment for ${matchedService.name}? (e.g., 2 PM, 4:00 PM)`,
            timestamp,
          }
        }

        // 4. Check Stylist Availability
        const availability = await availabilityService.findAvailableStylists({
          serviceId: matchedService.id,
          date: (date as string) || getSalonDateStr(0),
          startTime: startTime as string,
        })

        return {
          type: 'availability_results',
          message: availability.summaryMessage,
          availabilityResults: availability,
          timestamp,
        }
      } catch (error) {
        console.error('Error finding available stylists:', error)
        return {
          type: 'error',
          message:
            'I encountered an unexpected issue while checking stylist availability. Please try again.',
          timestamp,
        }
      }
    }

    case 'CREATE_APPOINTMENT_REQUEST': {
      try {
        if (session && session.isAuthenticated && !permissionService.canAssignServices(session)) {
          return {
            type: 'error',
            message:
              'You do not have permission to book or assign appointments to employees. Please contact the salon owner or receptionist.',
            timestamp,
          }
        }
        return await bookingHandler.processBookingRequest(command.params || {}, context)
      } catch (error) {
        console.error('Error processing booking request:', error)
        return {
          type: 'error',
          message:
            'I encountered an unexpected issue while preparing the booking preview. Please try again.',
          timestamp,
        }
      }
    }

    case 'CONFIRM_BOOKING': {
      try {
        if (session && session.isAuthenticated && !permissionService.canAssignServices(session)) {
          return {
            type: 'error',
            message: 'You do not have permission to book or assign appointments to employees.',
            timestamp,
          }
        }
        const pending = (command.params?.pendingBooking as PendingBooking) || context?.pendingBooking
        return await bookingHandler.confirmBooking(pending)
      } catch (error) {
        console.error('Error confirming booking:', error)
        return {
          type: 'error',
          message:
            "I couldn't create that appointment. Please check the appointment details and try again.",
          timestamp,
        }
      }
    }

    case 'CANCEL_BOOKING': {
      const pending = (command.params?.pendingBooking as PendingBooking) || context?.pendingBooking
      return bookingHandler.cancelBooking(pending)
    }

    case 'SELECT_STYLIST': {
      const stylistIdOrName = (command.params?.stylistIdOrName as string) || command.rawInput
      return await bookingHandler.selectStylist(stylistIdOrName, context || {})
    }

    case 'SEND_APPOINTMENT_REMINDERS': {
      try {
        if (session && session.isAuthenticated && !permissionService.canSendSalonReminders(session)) {
          return {
            type: 'error',
            message:
              'You do not have permission to dispatch salon-wide appointment reminders. This action requires Owner or Receptionist privileges.',
            timestamp,
          }
        }

        const dateStr = (command.params?.date as string) || getSalonDateStr(0)
        const clientQuery = command.params?.clientQuery as string | undefined

        const batch = await reminderService.prepareRemindersForDate(dateStr, clientQuery)

        if (batch.totalCount === 0) {
          const clientNote = clientQuery ? ` for '${clientQuery}'` : ''
          return {
            type: 'empty',
            message: `No active upcoming appointments found${clientNote} on ${batch.formattedDate} to send reminders for.`,
            timestamp,
          }
        }

        const countText = batch.totalCount === 1 ? '1 client' : `${batch.totalCount} clients`
        return {
          type: 'reminders_preview',
          message: `I found ${countText} with upcoming appointments on ${batch.formattedDate}. Review the message preview below before dispatching:`,
          pendingReminders: batch,
          timestamp,
        }
      } catch (error) {
        console.error('Error preparing reminders:', error)
        return {
          type: 'error',
          message: 'I encountered an error preparing the appointment reminders. Please try again.',
          timestamp,
        }
      }
    }

    case 'CONFIRM_SEND_REMINDERS': {
      try {
        if (session && session.isAuthenticated && !permissionService.canSendSalonReminders(session)) {
          return {
            type: 'error',
            message: 'You do not have permission to dispatch appointment reminders.',
            timestamp,
          }
        }

        const batch =
          (command.params?.pendingReminders as PendingReminderBatch) ||
          context?.pendingReminders

        if (!batch || batch.items.length === 0) {
          return {
            type: 'error',
            message: 'There are no pending reminders to dispatch.',
            timestamp,
          }
        }

        const receipt = await reminderService.dispatchReminders(batch)
        const countText =
          receipt.sentCount === 1
            ? '1 appointment reminder'
            : `${receipt.sentCount} appointment reminders`

        return {
          type: 'reminders_sent',
          message: `Dispatched ${countText} successfully via WhatsApp and SMS for ${receipt.formattedDate}.`,
          sentRemindersReceipt: receipt,
          timestamp,
        }
      } catch (error) {
        console.error('Error dispatching reminders:', error)
        return {
          type: 'error',
          message: 'Failed to send reminders. Please try again.',
          timestamp,
        }
      }
    }

    case 'CANCEL_SEND_REMINDERS': {
      return {
        type: 'general',
        message: 'Reminder dispatch was cancelled. No messages were sent.',
        timestamp,
      }
    }

    case 'UNKNOWN':
    default: {
      return {
        type: 'general',
        message:
          "I can manage your salon schedule! Try asking \"Book Priya Sharma for balayage tomorrow at 4 PM with Rohan\", \"Find an available stylist for balayage at 4 PM\", or \"Show today's bookings\".",
        timestamp,
      }
    }
  }
}
