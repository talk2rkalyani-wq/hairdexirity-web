import { bookingHandler } from '../src/features/assistant/services/bookingHandler'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import { appointmentService } from '../src/services/appointmentService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { authService } from '../src/services/authService'
import { getSalonDateStr } from '../src/utils/formatters'
import type { ConversationContext } from '../src/features/assistant/types'

async function runPhase9Tests() {
  console.log('==================================================')
  console.log('LUMA SALON — PHASE 9 VERIFICATION SUITE')
  console.log('==================================================\n')

  await authService.login('owner1@lumasalon.example.com', 'Luma@2026!')

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)
  console.log(`Today (Asia/Kolkata): ${todayStr}`)
  console.log(`Tomorrow (Asia/Kolkata): ${tomorrowStr}`)

  // ----------------------------------------------------
  // TEST 1: COMPLETE VALID BOOKING REQUEST -> PREVIEW CREATED, NO APPOINTMENT IN DB
  // ----------------------------------------------------
  console.log('\n--- TEST 1: VALID BOOKING REQUEST -> PREVIEW CREATED, NO DB CREATION ---')
  const q1 = `Book Priya Sharma for balayage tomorrow at 4 PM with Rohan`
  const initialApts = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const initialCount = initialApts.length

  const parsed1 = interpretCommand(q1)
  console.log(`Query: "${q1}"`)
  console.log(`Parsed Intent: ${parsed1.intent}, client: ${parsed1.params?.clientQuery}, service: ${parsed1.params?.serviceQuery}, stylist: ${parsed1.params?.stylistQuery}`)

  const res1 = await executeCommand(parsed1)
  console.log(`Action Response Type: ${res1.type}`)
  console.log(`Message: "${res1.message}"`)

  if (res1.type !== 'booking_preview' || !res1.pendingBooking) {
    throw new Error(`TEST 1 Failed: Expected booking_preview with pendingBooking, got ${res1.type}`)
  }

  // Verify that NO appointment was created in data layer yet
  const aptsAfterPreview = await appointmentService.getAppointmentsForDate(tomorrowStr)
  if (aptsAfterPreview.length !== initialCount) {
    throw new Error(`TEST 1 Failed: Appointment was prematurely created in data layer!`)
  }
  console.log(`Pending Booking verified: Client=${res1.pendingBooking.clientName}, Service=${res1.pendingBooking.serviceName}, Stylist=${res1.pendingBooking.staffName}, Price=₹${res1.pendingBooking.price}`)
  console.log('PASS: TEST 1 passed (Preview created, appointment NOT in data layer yet)')

  // ----------------------------------------------------
  // TEST 2: USER CONFIRMS VALID PREVIEW -> APPOINTMENT CREATED
  // ----------------------------------------------------
  console.log('\n--- TEST 2: USER CONFIRMS VALID PREVIEW -> APPOINTMENT CREATED ---')
  const contextWithPending: ConversationContext = {
    hasPendingBooking: true,
    pendingBooking: res1.pendingBooking,
  }

  const confirmParsed = interpretCommand('Confirm', contextWithPending)
  console.log(`Parsed Confirm Command Intent: ${confirmParsed.intent}`)
  if (confirmParsed.intent !== 'CONFIRM_BOOKING') {
    throw new Error(`TEST 2 Failed: Expected CONFIRM_BOOKING, got ${confirmParsed.intent}`)
  }

  const confirmRes = await executeCommand(confirmParsed, contextWithPending)
  console.log(`Confirm Response Type: ${confirmRes.type}`)
  console.log(`Confirm Message: "${confirmRes.message}"`)

  if (confirmRes.type !== 'booking_confirmed' || !confirmRes.confirmedAppointment) {
    throw new Error(`TEST 2 Failed: Expected booking_confirmed with confirmedAppointment`)
  }

  const aptsAfterConfirm = await appointmentService.getAppointmentsForDate(tomorrowStr)
  if (aptsAfterConfirm.length !== initialCount + 1) {
    throw new Error(`TEST 2 Failed: Appointment count did not increase by 1`)
  }
  const createdApt = aptsAfterConfirm.find((a) => a.id === confirmRes.confirmedAppointment?.id)
  if (!createdApt) {
    throw new Error(`TEST 2 Failed: Created appointment not found in appointmentService`)
  }
  console.log(`PASS: TEST 2 passed (Appointment created with ID: ${createdApt.id})`)

  // ----------------------------------------------------
  // TEST 3: USER CANCELS PREVIEW -> APPOINTMENT NOT CREATED
  // ----------------------------------------------------
  console.log('\n--- TEST 3: USER CANCELS PREVIEW -> APPOINTMENT NOT CREATED ---')
  const q3 = `Book Rahul Sethi for haircut tomorrow at 5 PM with Rohan`
  const parsed3 = interpretCommand(q3)
  const res3 = await executeCommand(parsed3)

  const aptsBeforeCancel = (await appointmentService.getAppointmentsForDate(tomorrowStr)).length
  const context3: ConversationContext = {
    hasPendingBooking: true,
    pendingBooking: res3.pendingBooking,
  }

  const cancelParsed = interpretCommand('Cancel', context3)
  const cancelRes = await executeCommand(cancelParsed, context3)
  console.log(`Cancel Response Type: ${cancelRes.type}`)
  console.log(`Cancel Message: "${cancelRes.message}"`)

  const aptsAfterCancel = (await appointmentService.getAppointmentsForDate(tomorrowStr)).length
  if (aptsAfterCancel !== aptsBeforeCancel) {
    throw new Error(`TEST 3 Failed: Appointment was created despite cancellation!`)
  }
  console.log('PASS: TEST 3 passed (Cancelled, no appointment created)')

  // ----------------------------------------------------
  // TEST 4: CLIENT DOES NOT EXIST -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 4: NON-EXISTENT CLIENT ---')
  const q4 = `Book FakeClientName for balayage tomorrow at 4 PM with Rohan`
  const res4 = await executeCommand(interpretCommand(q4))
  console.log(`Response: "${res4.message}"`)
  if (res4.type !== 'error' || !res4.message.includes("couldn't find a client")) {
    throw new Error(`TEST 4 Failed: Expected error for non-existent client, got ${res4.type}`)
  }
  console.log('PASS: TEST 4 passed')

  // ----------------------------------------------------
  // TEST 5: SERVICE DOES NOT EXIST -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 5: NON-EXISTENT SERVICE ---')
  const q5 = `Book Priya Sharma for SpaceTravelProcedure tomorrow at 4 PM with Rohan`
  const res5 = await executeCommand(interpretCommand(q5))
  console.log(`Response: "${res5.message}"`)
  if (res5.type !== 'error' || !res5.message.includes("couldn't find a service")) {
    throw new Error(`TEST 5 Failed: Expected error for non-existent service, got ${res5.type}`)
  }
  console.log('PASS: TEST 5 passed')

  // ----------------------------------------------------
  // TEST 6: STYLIST DOES NOT EXIST -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 6: NON-EXISTENT STYLIST ---')
  const q6 = `Book Priya Sharma for balayage tomorrow at 4 PM with NonExistentStylist`
  const res6 = await executeCommand(interpretCommand(q6))
  console.log(`Response: "${res6.message}"`)
  if (res6.type !== 'error' || !res6.message.includes("couldn't find a stylist")) {
    throw new Error(`TEST 6 Failed: Expected error for non-existent stylist, got ${res6.type}`)
  }
  console.log('PASS: TEST 6 passed')

  // ----------------------------------------------------
  // TEST 7: STYLIST LACKS REQUIRED CAPABILITY -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 7: STYLIST LACKS CAPABILITY ---')
  // Kabir Sharma has no Balayage skills
  const q7 = `Book Priya Sharma for balayage tomorrow at 4 PM with Kabir`
  const res7 = await executeCommand(interpretCommand(q7))
  console.log(`Response: "${res7.message}"`)
  if (res7.type !== 'error' || !res7.message.includes("doesn't have the required capability")) {
    throw new Error(`TEST 7 Failed: Expected capability rejection for Kabir on balayage, got ${res7.message}`)
  }
  console.log('PASS: TEST 7 passed')

  // ----------------------------------------------------
  // TEST 8: STYLIST OUTSIDE WORKING HOURS -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 8: STYLIST OUTSIDE WORKING HOURS ---')
  // Request at 6:00 AM (salon opens 10:00 AM)
  const q8 = `Book Priya Sharma for balayage tomorrow at 6 AM with Rohan`
  const res8 = await executeCommand(interpretCommand(q8))
  console.log(`Response: "${res8.message}"`)
  if (res8.type !== 'error' || !res8.message.includes('not scheduled to work during this time')) {
    throw new Error(`TEST 8 Failed: Expected outside working hours rejection, got ${res8.message}`)
  }
  console.log('PASS: TEST 8 passed')

  // ----------------------------------------------------
  // TEST 9: STYLIST HAS OVERLAPPING APPOINTMENT -> REJECTED
  // ----------------------------------------------------
  console.log('\n--- TEST 9: STYLIST HAS OVERLAPPING APPOINTMENT ---')
  // From TEST 2, Rohan now has an appointment on tomorrow from 16:00 to 19:00 (Balayage)
  // Attempt to book another client with Rohan at 17:00 tomorrow
  const q9 = `Book Rahul Sethi for haircut tomorrow at 5 PM with Rohan`
  const res9 = await executeCommand(interpretCommand(q9))
  console.log(`Response: "${res9.message}"`)
  if (res9.type !== 'error' || !res9.message.includes('existing appointment')) {
    throw new Error(`TEST 9 Failed: Expected overlapping appointment rejection, got ${res9.message}`)
  }
  console.log('PASS: TEST 9 passed')

  // ----------------------------------------------------
  // TEST 10: CANCELLED APPOINTMENT DOES NOT BLOCK BOOKING
  // ----------------------------------------------------
  console.log('\n--- TEST 10: CANCELLED APPOINTMENT DOES NOT BLOCK BOOKING ---')
  // Cancel the appointment created in TEST 2
  if (confirmRes.confirmedAppointment) {
    await appointmentService.updateAppointmentStatus(confirmRes.confirmedAppointment.id, 'cancelled')
    console.log(`Cancelled appointment ${confirmRes.confirmedAppointment.id}`)
  }

  // Now booking Rohan at 16:00 tomorrow should succeed!
  const q10 = `Book Rahul Sethi for haircut tomorrow at 4 PM with Rohan`
  const res10 = await executeCommand(interpretCommand(q10))
  console.log(`Response Type after cancellation: ${res10.type}`)
  if (res10.type !== 'booking_preview' || !res10.pendingBooking) {
    throw new Error(`TEST 10 Failed: Cancelled appointment is still blocking the slot!`)
  }
  console.log('PASS: TEST 10 passed')

  // ----------------------------------------------------
  // TEST 11: MULTIPLE STYLISTS AVAILABLE -> USER MUST CHOOSE STYLIST
  // ----------------------------------------------------
  console.log('\n--- TEST 11: MULTIPLE STYLISTS AVAILABLE (NO STYLIST SPECIFIED) ---')
  // Haircut tomorrow at 17:00. Both Mia Vance and Rohan Sen are free.
  const q11 = `Book Rahul Sethi for haircut tomorrow at 5 PM`
  const res11 = await executeCommand(interpretCommand(q11))
  console.log(`Response Type: ${res11.type}`)
  console.log(`Message: "${res11.message}"`)
  if (res11.type !== 'stylist_selection' || !res11.selectableStylists || res11.selectableStylists.length < 2) {
    throw new Error(`TEST 11 Failed: Expected stylist_selection with >= 2 stylists, got ${res11.type}`)
  }
  console.log(`Available stylists presented: ${res11.selectableStylists.map((s) => s.staffName).join(', ')}`)
  console.log('PASS: TEST 11 passed')

  // ----------------------------------------------------
  // TEST 12: MISSING CLIENT -> CLARIFICATION REQUESTED
  // ----------------------------------------------------
  console.log('\n--- TEST 12: MISSING CLIENT ---')
  const q12 = `Book balayage tomorrow at 4 PM with Rohan`
  const res12 = await executeCommand(interpretCommand(q12))
  console.log(`Response: "${res12.message}"`)
  if (res12.type !== 'clarification_prompt' || !res12.message.includes('Which client')) {
    throw new Error(`TEST 12 Failed: Expected client clarification prompt, got ${res12.message}`)
  }
  console.log('PASS: TEST 12 passed')

  // ----------------------------------------------------
  // TEST 13: MISSING SERVICE -> CLARIFICATION REQUESTED
  // ----------------------------------------------------
  console.log('\n--- TEST 13: MISSING SERVICE ---')
  const q13 = `Book Priya Sharma tomorrow at 4 PM with Rohan`
  const res13 = await executeCommand(interpretCommand(q13))
  console.log(`Response: "${res13.message}"`)
  if (res13.type !== 'clarification_prompt' || !res13.message.includes('Which service')) {
    throw new Error(`TEST 13 Failed: Expected service clarification prompt, got ${res13.message}`)
  }
  console.log('PASS: TEST 13 passed')

  // ----------------------------------------------------
  // TEST 14: MISSING TIME -> CLARIFICATION REQUESTED
  // ----------------------------------------------------
  console.log('\n--- TEST 14: MISSING TIME ---')
  const q14 = `Book Priya Sharma for balayage tomorrow`
  const res14 = await executeCommand(interpretCommand(q14))
  console.log(`Response: "${res14.message}"`)
  if (res14.type !== 'clarification_prompt' || !res14.message.includes('What time')) {
    throw new Error(`TEST 14 Failed: Expected time clarification prompt, got ${res14.message}`)
  }
  console.log('PASS: TEST 14 passed')

  // ----------------------------------------------------
  // TEST 15: MISSING DATE & TIME -> CLARIFICATION REQUESTED
  // ----------------------------------------------------
  console.log('\n--- TEST 15: MISSING DATE & TIME ---')
  const q15 = `Book Priya Sharma for balayage`
  const res15 = await executeCommand(interpretCommand(q15))
  console.log(`Response: "${res15.message}"`)
  if (res15.type !== 'clarification_prompt') {
    throw new Error(`TEST 15 Failed: Expected clarification prompt, got ${res15.type}`)
  }
  console.log('PASS: TEST 15 passed')

  // ----------------------------------------------------
  // TEST 16 & 17: PRICE AND DURATION COME STRICTLY FROM SERVICE DATA
  // ----------------------------------------------------
  console.log('\n--- TEST 16 & 17: PRICE AND DURATION INTEGRITY ---')
  const balayageSrv = await serviceService.getServiceById('srv-04')
  if (!balayageSrv) throw new Error('Balayage service not found')

  const q16 = `Book Priya Sharma for balayage tomorrow at 15:00 with Mia`
  // Sunday closing is 20:00, so 15:00 to 18:00 fits Mia Vance!
  const res16 = await executeCommand(interpretCommand(q16))
  if (!res16.pendingBooking) throw new Error(`Expected pendingBooking in res16, got: ${res16.message}`)

  console.log(`Service Config: Price=₹${balayageSrv.price}, Duration=${balayageSrv.duration} mins`)
  console.log(`Pending Booking: Price=₹${res16.pendingBooking.price}, Duration=${res16.pendingBooking.duration} mins`)

  if (res16.pendingBooking.price !== balayageSrv.price) {
    throw new Error(`TEST 16 Failed: Price mismatch! Expected ₹${balayageSrv.price}, got ₹${res16.pendingBooking.price}`)
  }
  if (res16.pendingBooking.duration !== balayageSrv.duration) {
    throw new Error(`TEST 17 Failed: Duration mismatch! Expected ${balayageSrv.duration}, got ${res16.pendingBooking.duration}`)
  }
  console.log('PASS: TEST 16 & 17 passed')

  // ----------------------------------------------------
  // TEST 18 & 19: SUCCESSFUL BOOKING APPEARS IN CALENDAR & CLIENT HISTORY
  // ----------------------------------------------------
  console.log('\n--- TEST 18 & 19: CALENDAR AND CLIENT HISTORY SYNCHRONIZATION ---')
  const finalConfirmRes = await executeCommand(
    interpretCommand('Confirm', { hasPendingBooking: true, pendingBooking: res16.pendingBooking }),
    { hasPendingBooking: true, pendingBooking: res16.pendingBooking }
  )

  const newlyBookedId = finalConfirmRes.confirmedAppointment?.id
  if (!newlyBookedId) throw new Error('Failed to create appointment for calendar check')

  // Check Calendar (appointmentService.getAppointmentsForDate)
  const calendarAppointments = await appointmentService.getAppointmentsForDate(tomorrowStr)
  const foundInCalendar = calendarAppointments.some((a) => a.id === newlyBookedId)
  console.log(`Appointment found in Calendar for ${tomorrowStr}: ${foundInCalendar ? 'YES' : 'NO'}`)
  if (!foundInCalendar) {
    throw new Error(`TEST 18 Failed: Appointment not found in calendar for ${tomorrowStr}`)
  }

  // Check Client History (appointmentService.getAppointmentsForClient)
  const clientAppointments = await appointmentService.getAppointmentsForClient(res16.pendingBooking.clientId)
  const foundInClientHistory = clientAppointments.some((a) => a.id === newlyBookedId)
  console.log(`Appointment found in Client history for Priya Sharma: ${foundInClientHistory ? 'YES' : 'NO'}`)
  if (!foundInClientHistory) {
    throw new Error(`TEST 19 Failed: Appointment not found in Priya Sharma's history`)
  }
  console.log('PASS: TEST 18 & 19 passed')

  // ----------------------------------------------------
  // TEST 20: REGRESSION - SHOW_TODAY_BOOKINGS
  // ----------------------------------------------------
  console.log('\n--- TEST 20: REGRESSION - SHOW_TODAY_BOOKINGS ---')
  const bookingsParsed = interpretCommand("Show today's bookings")
  if (bookingsParsed.intent !== 'SHOW_TODAY_BOOKINGS') {
    throw new Error(`TEST 20 Failed: Incorrect intent ${bookingsParsed.intent}`)
  }
  const bookingsRes = await executeCommand(bookingsParsed)
  console.log(`Response: "${bookingsRes.message}" (${bookingsRes.appointments?.length || 0} appointments)`)
  if (!bookingsRes.appointments || bookingsRes.appointments.length === 0) {
    throw new Error(`TEST 20 Failed: No appointments returned`)
  }
  console.log('PASS: TEST 20 passed')

  // ----------------------------------------------------
  // TEST 21: REGRESSION - FIND_AVAILABLE_STYLIST
  // ----------------------------------------------------
  console.log('\n--- TEST 21: REGRESSION - FIND_AVAILABLE_STYLIST ---')
  const availParsed = interpretCommand("Find an available stylist for balayage tomorrow at 2 PM")
  if (availParsed.intent !== 'FIND_AVAILABLE_STYLIST') {
    throw new Error(`TEST 21 Failed: Incorrect intent ${availParsed.intent}`)
  }
  const availRes = await executeCommand(availParsed)
  console.log(`Response: "${availRes.message}"`)
  if (availRes.type !== 'availability_results') {
    throw new Error(`TEST 21 Failed: Expected availability_results, got ${availRes.type}`)
  }
  console.log('PASS: TEST 21 passed')

  console.log('\n==================================================')
  console.log('ALL 21 PHASE 9 VERIFICATION TESTS PASSED!')
  console.log('==================================================')
}

runPhase9Tests().catch((err) => {
  console.error('Phase 9 Test Suite Failed:', err)
  process.exit(1)
})
