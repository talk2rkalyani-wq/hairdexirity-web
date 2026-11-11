import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import { reminderService } from '../src/services/reminderService'
import { appointmentStore } from '../src/services/appointmentStore'
import { appointmentService } from '../src/services/appointmentService'
import { authService } from '../src/services/authService'
import { getSalonDateStr } from '../src/utils/formatters'

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`)
    throw new Error(`Assertion failed: ${message}`)
  }
  console.log(`✅ PASS: ${message}`)
}

async function runPhase10Tests() {
  console.log('=================================================================')
  console.log('PHASE 10: AI APPOINTMENT REMINDERS TEST SUITE')
  console.log('=================================================================\n')

  await authService.login('owner1@lumasalon.example.com', 'Luma@2026!')

  appointmentStore.resetToMock()
  const todayStr = getSalonDateStr(0) // 2026-09-17
  const tomorrowStr = getSalonDateStr(1) // 2026-09-18

  // ----------------------------------------------------
  // Test 1: Command Interpreter for Suggested Action
  // ----------------------------------------------------
  console.log('--- Test Group 1: Command Interpretation ---')
  const cmd1 = interpretCommand('Send appointment reminders')
  assert(cmd1.intent === 'SEND_APPOINTMENT_REMINDERS', 'Exact dashboard suggested action matches SEND_APPOINTMENT_REMINDERS')
  assert(cmd1.params?.date === todayStr, `Defaults target date to today (${todayStr})`)

  const cmd2 = interpretCommand('Send reminders for tomorrow')
  assert(cmd2.intent === 'SEND_APPOINTMENT_REMINDERS', 'Tomorrow query matches SEND_APPOINTMENT_REMINDERS')
  assert(cmd2.params?.date === tomorrowStr, `Resolves tomorrow to ${tomorrowStr}`)

  const cmd3 = interpretCommand('Send reminder to Priya Sharma')
  assert(cmd3.intent === 'SEND_APPOINTMENT_REMINDERS', 'Specific client query matches SEND_APPOINTMENT_REMINDERS')
  assert(cmd3.params?.clientQuery === 'Priya Sharma', 'Extracts target client Priya Sharma')

  // ----------------------------------------------------
  // Test 2: Reminder Preparation & Filtering (Safety: No mutation on preview)
  // ----------------------------------------------------
  console.log('\n--- Test Group 2: Reminder Preparation & Safe Preview ---')
  const batchToday = await reminderService.prepareRemindersForDate(todayStr)
  assert(batchToday.totalCount > 0, `Found ${batchToday.totalCount} active appointments for today`)

  // Check filtering: No cancelled appointments should be included
  const allTodayInStore = appointmentStore.getByDate(todayStr)
  const cancelledInStore = allTodayInStore.filter((a) => a.status === 'cancelled')
  for (const c of cancelledInStore) {
    const included = batchToday.items.some((it) => it.appointmentId === c.id)
    assert(!included, `Cancelled appointment ${c.id} correctly excluded from reminders`)
  }

  // Check filtering: No completed appointments should be included
  const completedInStore = allTodayInStore.filter((a) => a.status === 'completed')
  for (const c of completedInStore) {
    const included = batchToday.items.some((it) => it.appointmentId === c.id)
    assert(!included, `Completed appointment ${c.id} correctly excluded from reminders`)
  }

  // Verify message body formatting
  const firstItem = batchToday.items[0]
  assert(firstItem.messageBody.includes('Luma Salon'), 'Message body contains salon name Luma Salon')
  assert(firstItem.messageBody.includes('Galleria Market'), 'Message body contains salon address Galleria Market')
  assert(firstItem.messageBody.includes('+91 98765 43210'), 'Message body contains salon contact number')
  assert(firstItem.messageBody.includes(firstItem.clientName), 'Message body includes client name')
  assert(firstItem.messageBody.includes(firstItem.serviceName), 'Message body includes service name')

  // Safety: Verify store records still do NOT have reminderSent = true
  const aptBeforeSend = appointmentStore.getById(firstItem.appointmentId)
  assert(!aptBeforeSend?.reminderSent, 'Store is NOT mutated before user confirms sending reminders')

  // ----------------------------------------------------
  // Test 3: Action Handler Flow with Preview & Confirmation
  // ----------------------------------------------------
  console.log('\n--- Test Group 3: Action Handler Interactive Flow ---')
  const actionRes1 = await executeCommand(cmd1)
  assert(actionRes1.type === 'reminders_preview', 'Action handler returns reminders_preview response')
  assert(!!actionRes1.pendingReminders, 'Pending reminders batch attached to response')
  assert(actionRes1.pendingReminders?.totalCount === batchToday.totalCount, 'Pending batch count matches eligible count')

  // Now simulate user confirming "Send"
  const confirmCmd = interpretCommand('Send', {
    hasPendingReminders: true,
    pendingReminders: actionRes1.pendingReminders,
  })
  assert(confirmCmd.intent === 'CONFIRM_SEND_REMINDERS', "Interprets 'Send' with active batch as CONFIRM_SEND_REMINDERS")

  const confirmRes = await executeCommand(confirmCmd, {
    hasPendingReminders: true,
    pendingReminders: actionRes1.pendingReminders,
  })
  assert(confirmRes.type === 'reminders_sent', 'Action handler returns reminders_sent on confirmation')
  assert(!!confirmRes.sentRemindersReceipt, 'Sent receipt attached to response')
  assert(confirmRes.sentRemindersReceipt?.sentCount === batchToday.totalCount, 'Receipt count matches dispatched count')

  // ----------------------------------------------------
  // Test 4: Canonical Store Persistence Verification
  // ----------------------------------------------------
  console.log('\n--- Test Group 4: Canonical Store Audit Persistence ---')
  const aptAfterSend = appointmentStore.getById(firstItem.appointmentId)
  assert(aptAfterSend?.reminderSent === true, 'Appointment record has reminderSent = true in canonical store')
  assert(!!aptAfterSend?.lastReminderSentAt, 'Appointment record has valid lastReminderSentAt timestamp')
  assert(aptAfterSend?.reminderDeliveryStatus === 'delivered', "Appointment delivery status is 'delivered'")

  // ----------------------------------------------------
  // Test 5: Cancellation Flow
  // ----------------------------------------------------
  console.log('\n--- Test Group 5: Cancellation Safety ---')
  const cancelCmd = interpretCommand('Cancel', {
    hasPendingReminders: true,
    pendingReminders: actionRes1.pendingReminders,
  })
  assert(cancelCmd.intent === 'CANCEL_SEND_REMINDERS', "Interprets 'Cancel' as CANCEL_SEND_REMINDERS")

  const cancelRes = await executeCommand(cancelCmd)
  assert(cancelRes.type === 'general', 'Returns general cancellation response')
  assert(cancelRes.message.includes('cancelled'), 'Message confirms cancellation')

  // ----------------------------------------------------
  // Test 6: Regressions on Existing AI Features
  // ----------------------------------------------------
  console.log('\n--- Test Group 6: Regressions Suite ---')
  // A. SHOW_TODAY_BOOKINGS
  const bookingsRes = await executeCommand(interpretCommand("Show today's bookings"))
  assert(bookingsRes.type === 'appointment_list', 'Regression: SHOW_TODAY_BOOKINGS still works')
  assert(bookingsRes.appointments!.length > 0, 'Regression: Returns today appointments')

  // B. FIND_AVAILABLE_STYLIST
  const availRes = await executeCommand(interpretCommand('Find an available stylist for balayage at 4 PM'))
  assert(availRes.type === 'availability_results', 'Regression: FIND_AVAILABLE_STYLIST still works')

  // C. CREATE_APPOINTMENT_REQUEST
  const bookRes = await executeCommand(interpretCommand('Book Priya Sharma for balayage tomorrow at 4 PM with Rohan'))
  assert(bookRes.type === 'booking_preview', 'Regression: CREATE_APPOINTMENT_REQUEST still works')
  assert(bookRes.pendingBooking?.price === 4500, 'Regression: Booking preview has correct price ₹4,500')

  console.log('\n=================================================================')
  console.log('ALL PHASE 10 AUTOMATED UNIT TESTS PASSED (100% SUCCESS)!')
  console.log('=================================================================')
}

runPhase10Tests().catch((err) => {
  console.error('Test suite failure:', err)
  process.exit(1)
})
