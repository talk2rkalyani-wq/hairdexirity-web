import { bookingHandler } from '../src/features/assistant/services/bookingHandler'
import { appointmentService } from '../src/services/appointmentService'
import { getSalonDateStr } from '../src/utils/formatters'

async function run() {
  const tomorrowStr = getSalonDateStr(1)
  console.log('Tomorrow date string:', tomorrowStr)

  // 1. Process booking request
  const previewRes = await bookingHandler.processBookingRequest({
    clientQuery: 'Priya Sharma',
    serviceQuery: 'balayage',
    stylistQuery: 'Rohan',
    date: tomorrowStr,
    startTime: '16:00',
  })

  console.log('Preview Result Type:', previewRes.type)
  console.log('Pending Booking:', previewRes.pendingBooking)

  if (!previewRes.pendingBooking) {
    console.error('Failed to get pending booking')
    return
  }

  // 2. Confirm booking
  const confirmRes = await bookingHandler.confirmBooking(previewRes.pendingBooking)
  console.log('Confirm Result Type:', confirmRes.type)
  console.log('Confirmed Appointment:', confirmRes.confirmedAppointment)

  // 3. Check Calendar for tomorrow
  const calAppointments = await appointmentService.getEnrichedAppointmentsForDate(tomorrowStr)
  console.log(`\nCalendar appointments for ${tomorrowStr} (${calAppointments.length} total):`)
  for (const apt of calAppointments) {
    console.log(`- [${apt.id}] ${apt.startTime}-${apt.endTime}: Client: "${apt.client?.name}", Service: "${apt.service?.name}", Stylist: "${apt.staff?.name}", Price: ${apt.price}, Status: ${apt.status}`)
  }

  // 4. Check Client history for Priya Sharma (cli-01)
  const clientApts = await appointmentService.getAppointmentsForClient('cli-01')
  console.log(`\nClient history for Priya Sharma (${clientApts.length} total):`)
  for (const apt of clientApts) {
    console.log(`- [${apt.id}] Date: ${apt.date}, ${apt.startTime}-${apt.endTime}: Service: "${apt.service?.name}", Stylist: "${apt.staff?.name}", Status: ${apt.status}`)
  }
}

run().catch(console.error)
