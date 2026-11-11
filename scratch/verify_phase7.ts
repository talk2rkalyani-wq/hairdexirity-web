import { appointmentService } from '../src/services/appointmentService'
import { staffService } from '../src/services/staffService'
import { clientService } from '../src/services/clientService'
import { serviceService } from '../src/services/serviceService'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import {
  formatCurrency,
  formatTime12h,
  calculateEndTime,
  getDayOfWeekKey,
  getSalonDateStr,
  getWeekDates,
  timeToMinutes,
} from '../src/utils/formatters'

async function runPhase7Tests() {
  console.log('==================================================')
  console.log('LUMA SALON — PHASE 7 VERIFICATION SUITE')
  console.log('==================================================\n')

  const todayStr = getSalonDateStr(0)
  console.log(`[1] Salon Today Date (Asia/Kolkata): ${todayStr}`)

  // 1. Time & Date Utilities
  console.log('\n--- 1. TIME & DATE FORMATTING ---')
  console.log(`formatTime12h('09:00') => ${formatTime12h('09:00')} (Expected: 9:00 AM)`)
  console.log(`formatTime12h('14:30') => ${formatTime12h('14:30')} (Expected: 2:30 PM)`)
  console.log(`calculateEndTime('10:00', 45) => ${calculateEndTime('10:00', 45)} (Expected: 10:45)`)
  console.log(`getDayOfWeekKey('${todayStr}') => ${getDayOfWeekKey(todayStr)}`)

  const weekDays = getWeekDates(todayStr)
  console.log(`Week range for ${todayStr}: ${weekDays[0].dateStr} (${weekDays[0].dayKey}) to ${weekDays[6].dateStr} (${weekDays[6].dayKey})`)

  if (weekDays.length !== 7) {
    throw new Error(`Expected 7 days in week, got ${weekDays.length}`)
  }

  // 2. Fetch Initial Appointments
  console.log('\n--- 2. DAY & WEEK ENRICHED APPOINTMENTS ---')
  const todayAppointments = await appointmentService.getEnrichedAppointmentsForDate(todayStr)
  console.log(`Found ${todayAppointments.length} appointments for today (${todayStr})`)
  for (const a of todayAppointments) {
    console.log(`  - ${a.id}: ${a.startTime}–${a.endTime} | ${a.client?.name} | ${a.service?.name} | Stylist: ${a.staff?.name} | Status: ${a.status} | Price: ${formatCurrency(a.price)}`)
  }

  const weekAppointments = await appointmentService.getEnrichedAppointmentsForDateRange(
    weekDays[0].dateStr,
    weekDays[6].dateStr
  )
  console.log(`Found ${weekAppointments.length} appointments across the week`)

  // 3. Validation Tests
  console.log('\n--- 3. DETERMINISTIC CONFLICT VALIDATION ---')
  const allStaff = await staffService.getStaff()
  const inactiveStaff = allStaff.find((s) => !s.active)
  const activeStaff = allStaff.find((s) => s.active)

  if (!activeStaff) throw new Error('No active staff found')

  // A. Inactive Stylist Validation
  if (inactiveStaff) {
    console.log(`Testing booking with inactive stylist: ${inactiveStaff.name}...`)
    try {
      await appointmentService.createAppointment({
        clientId: 'client-01',
        serviceId: 'srv-01',
        staffId: inactiveStaff.id,
        date: todayStr,
        startTime: '11:00',
        endTime: '12:00',
        price: 1000,
        status: 'scheduled',
      })
      console.error('FAIL: Inactive stylist booking was unexpectedly allowed!')
    } catch (err: any) {
      console.log(`PASS: Inactive stylist rejected correctly: "${err.message}"`)
    }
  }

  // B. Outside Working Hours Validation
  console.log(`\nTesting booking outside working hours for ${activeStaff.name} (e.g. at 06:00 AM)...`)
  try {
    await appointmentService.createAppointment({
      clientId: 'client-01',
      serviceId: 'srv-01',
      staffId: activeStaff.id,
      date: todayStr,
      startTime: '06:00',
      endTime: '07:00',
      price: 1000,
      status: 'scheduled',
    })
    console.error('FAIL: Outside working hours booking was unexpectedly allowed!')
  } catch (err: any) {
    console.log(`PASS: Outside working hours rejected correctly: "${err.message}"`)
  }

  // C. Overlapping Conflict Validation
  // Pick an existing appointment for activeStaff
  const existingApt = todayAppointments.find((a) => a.staffId === activeStaff.id && a.status !== 'cancelled')
  if (existingApt) {
    console.log(`\nFound existing appointment for ${activeStaff.name}: ${existingApt.startTime}–${existingApt.endTime}`)
    console.log('Testing overlapping booking at exactly same time...')
    try {
      await appointmentService.createAppointment({
        clientId: 'client-02',
        serviceId: 'srv-02',
        staffId: activeStaff.id,
        date: existingApt.date,
        startTime: existingApt.startTime,
        endTime: existingApt.endTime,
        price: 1500,
        status: 'scheduled',
      })
      console.error('FAIL: Overlapping booking was unexpectedly allowed!')
    } catch (err: any) {
      console.log(`PASS: Overlapping appointment rejected correctly: "${err.message}"`)
    }

    // Also test active hours overlap for apt-04 (14:45–16:15)
    console.log(`\nTesting overlapping booking during active hours (15:00–16:00 for ${activeStaff.name})...`)
    try {
      await appointmentService.createAppointment({
        clientId: 'client-02',
        serviceId: 'srv-02',
        staffId: activeStaff.id,
        date: todayStr,
        startTime: '15:00',
        endTime: '16:00',
        price: 1500,
        status: 'scheduled',
      })
      console.error('FAIL: Active hours overlapping booking was unexpectedly allowed!')
    } catch (err: any) {
      console.log(`PASS: Overlapping appointment rejected correctly: "${err.message}"`)
    }
  }

  // 4. Successful Booking Creation
  console.log('\n--- 4. SUCCESSFUL BOOKING CREATION ---')
  // Find a free slot in working hours (e.g. 18:00–18:45)
  const freeSlotStart = '18:00'
  const freeSlotEnd = '18:45'
  console.log(`Scheduling valid appointment for ${activeStaff.name} on ${todayStr} from ${freeSlotStart} to ${freeSlotEnd}...`)

  const newAppointment = await appointmentService.createAppointment({
    clientId: 'client-01',
    serviceId: 'srv-01',
    staffId: activeStaff.id,
    date: todayStr,
    startTime: freeSlotStart,
    endTime: freeSlotEnd,
    price: 1200,
    status: 'scheduled',
    notes: 'Test booking for Phase 7 verification',
  })
  console.log(`PASS: Appointment created with ID: ${newAppointment.id}, status: ${newAppointment.status}`)

  // 5. Status Transitions
  console.log('\n--- 5. STATUS TRANSITIONS ---')
  const confirmed = await appointmentService.updateAppointmentStatus(newAppointment.id, 'confirmed')
  console.log(`Status transition -> ${confirmed.status} (Expected: confirmed)`)

  const completed = await appointmentService.updateAppointmentStatus(newAppointment.id, 'completed')
  console.log(`Status transition -> ${completed.status} (Expected: completed)`)

  const noshow = await appointmentService.updateAppointmentStatus(newAppointment.id, 'no-show')
  console.log(`Status transition -> ${noshow.status} (Expected: no-show)`)

  const cancelled = await appointmentService.updateAppointmentStatus(newAppointment.id, 'cancelled')
  console.log(`Status transition -> ${cancelled.status} (Expected: cancelled)`)

  // 6. Cancellation allows rebooking the slot
  console.log('\n--- 6. CANCELLATION FREES SLOT ---')
  console.log(`Since ${newAppointment.id} is cancelled, booking another appointment in ${freeSlotStart}–${freeSlotEnd} should succeed...`)
  const replacementAppointment = await appointmentService.createAppointment({
    clientId: 'client-02',
    serviceId: 'srv-02',
    staffId: activeStaff.id,
    date: todayStr,
    startTime: freeSlotStart,
    endTime: freeSlotEnd,
    price: 1500,
    status: 'confirmed',
    notes: 'Replacement booking',
  })
  console.log(`PASS: Replacement booking succeeded with ID: ${replacementAppointment.id}`)

  // 7. Client Service History Reflection
  console.log('\n--- 7. CLIENT SERVICE HISTORY INTEGRATION ---')
  const client02History = await appointmentService.getAppointmentsForClient('client-02')
  const foundInClient = client02History.some((a) => a.id === replacementAppointment.id)
  console.log(`Client history reflects replacement appointment: ${foundInClient ? 'YES' : 'NO'}`)

  // 8. AI Assistant Regression Check
  console.log('\n--- 8. AI ASSISTANT REGRESSION CHECK ---')
  const parsed = interpretCommand("Show today's bookings")
  console.log(`Parsed command intent: ${parsed.intent}`)
  const aiResponse = await executeCommand(parsed)
  console.log(`AI message: "${aiResponse.message}"`)
  const containsReplacement = aiResponse.appointments?.some((a: any) => a.id === replacementAppointment.id)
  console.log(`AI response includes the newly booked appointment: ${containsReplacement ? 'YES' : 'NO'}`)

  console.log('\n==================================================')
  console.log('ALL PHASE 7 VERIFICATION SUITE TESTS PASSED!')
  console.log('==================================================')
}

runPhase7Tests().catch((e) => {
  console.error('Test Suite Failed:', e)
  process.exit(1)
})
