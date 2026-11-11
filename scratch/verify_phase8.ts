import { availabilityService, isStaffCapableForService } from '../src/services/availabilityService'
import { serviceService } from '../src/services/serviceService'
import { staffService } from '../src/services/staffService'
import { appointmentService } from '../src/services/appointmentService'
import { interpretCommand } from '../src/features/assistant/services/commandInterpreter'
import { executeCommand } from '../src/features/assistant/services/actionHandler'
import { authService } from '../src/services/authService'
import {
  parseNaturalTime,
  parseNaturalDate,
  getSalonDateStr,
} from '../src/utils/formatters'

async function runPhase8Tests() {
  console.log('==================================================')
  console.log('LUMA SALON — PHASE 8 VERIFICATION SUITE')
  console.log('==================================================\n')

  await authService.login('owner1@lumasalon.example.com', 'Luma@2026!')

  const todayStr = getSalonDateStr(0)
  const tomorrowStr = getSalonDateStr(1)
  console.log(`Salon Today (Asia/Kolkata): ${todayStr}`)
  console.log(`Salon Tomorrow (Asia/Kolkata): ${tomorrowStr}`)

  // ----------------------------------------------------
  // TEST 9: TIME NORMALIZATION
  // ----------------------------------------------------
  console.log('\n--- TEST 9: TIME NORMALIZATION ---')
  const timesToTest = [
    { raw: '4 PM', expected: '16:00' },
    { raw: '4:00 PM', expected: '16:00' },
    { raw: '4pm', expected: '16:00' },
    { raw: '16:00', expected: '16:00' },
    { raw: '9 AM', expected: '09:00' },
    { raw: '2:30 pm', expected: '14:30' },
  ]
  for (const item of timesToTest) {
    const res = parseNaturalTime(item.raw)
    console.log(`parseNaturalTime('${item.raw}') => ${res} (Expected: ${item.expected})`)
    if (res !== item.expected) {
      throw new Error(`Time parsing failed for '${item.raw}': got ${res}, expected ${item.expected}`)
    }
  }
  console.log('PASS: TEST 9 passed')

  // ----------------------------------------------------
  // TEST 10: DATE NORMALIZATION
  // ----------------------------------------------------
  console.log('\n--- TEST 10: DATE NORMALIZATION ---')
  const dateToday = parseNaturalDate('today')
  const dateTomorrow = parseNaturalDate('tomorrow')
  console.log(`parseNaturalDate('today') => ${dateToday} (Expected: ${todayStr})`)
  console.log(`parseNaturalDate('tomorrow') => ${dateTomorrow} (Expected: ${tomorrowStr})`)
  if (dateToday !== todayStr || dateTomorrow !== tomorrowStr) {
    throw new Error('Date parsing failed')
  }
  console.log('PASS: TEST 10 passed')

  // ----------------------------------------------------
  // TEST 1: VALID SERVICE + TIME + AVAILABLE STYLIST
  // ----------------------------------------------------
  console.log('\n--- TEST 1: VALID SERVICE + TIME + AVAILABLE STYLIST ---')
  // Balayage & Toning (srv-04, 180 min) at 16:00 (4:00 PM) today
  // On Thursday: Salon open 10:00-20:00.
  // 16:00-19:00 is inside working hours.
  // Rohan Sen has skills: ['Balayage & Foils', 'Blonde & Toning']
  // Rohan's appointment on today: apt-03 is 11:30–14:30. Free from 14:30 onwards!
  const res1 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-04',
    date: todayStr,
    startTime: '16:00',
  })
  console.log(`Summary: "${res1.summaryMessage}"`)
  console.log(`Available Stylists: ${res1.availableStylists.map((s) => `${s.staffName} (${s.formattedTimeWindow})`).join(', ')}`)
  const hasRohan = res1.availableStylists.some((s) => s.staffName === 'Rohan Sen')
  if (!hasRohan) {
    throw new Error('Expected Rohan Sen to be available for Balayage at 16:00!')
  }
  console.log('PASS: TEST 1 passed')

  // ----------------------------------------------------
  // TEST 2: STYLIST LACKS SERVICE CAPABILITY
  // ----------------------------------------------------
  console.log('\n--- TEST 2: STYLIST LACKS CAPABILITY EXCLUSION ---')
  const allStaff = await staffService.getStaff()
  const balayageService = await serviceService.getServiceById('srv-04')
  if (!balayageService) throw new Error('Balayage service not found')

  const kabir = allStaff.find((s) => s.name === 'Kabir Sharma')
  if (!kabir) throw new Error('Kabir Sharma not found')

  const kabirCapability = isStaffCapableForService(kabir, balayageService)
  console.log(`Kabir Sharma capability for Balayage: capable=${kabirCapability.capable}, matchedSkills=[${kabirCapability.matchedSkills.join(', ')}]`)
  if (kabirCapability.capable) {
    throw new Error('Kabir Sharma should not be capable of Balayage!')
  }
  const inRes1 = res1.availableStylists.some((s) => s.staffName === 'Kabir Sharma')
  if (inRes1) {
    throw new Error('Kabir Sharma should NOT be in available stylists!')
  }
  console.log('PASS: TEST 2 passed')

  // ----------------------------------------------------
  // TEST 3: STYLIST OUTSIDE WORKING HOURS
  // ----------------------------------------------------
  console.log('\n--- TEST 3: OUTSIDE WORKING HOURS EXCLUSION ---')
  // Inquiry at 06:00 AM (salon opens 10:00 AM)
  const res3 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-01',
    date: todayStr,
    startTime: '06:00',
  })
  console.log(`Summary: "${res3.summaryMessage}"`)
  console.log(`Reason: "${res3.reasonSummary}"`)
  if (res3.availableStylists.length !== 0) {
    throw new Error('Expected 0 stylists available at 06:00 AM!')
  }
  console.log('PASS: TEST 3 passed')

  // ----------------------------------------------------
  // TEST 4: EXISTING OVERLAPPING APPOINTMENT CONFLICT
  // ----------------------------------------------------
  console.log('\n--- TEST 4: APPOINTMENT CONFLICT EXCLUSION ---')
  // Today Mia Vance has appointment apt-04 from 14:45 to 16:15.
  // Checking availability for Mia at 15:00 should exclude her!
  const res4 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-04',
    date: todayStr,
    startTime: '15:00',
  })
  const miaInRes4 = res4.availableStylists.some((s) => s.staffName === 'Mia Vance')
  console.log(`Mia Vance in results at 15:00 (during her 14:45-16:15 appointment): ${miaInRes4 ? 'YES (FAIL)' : 'NO (CORRECT)'}`)
  if (miaInRes4) {
    throw new Error('Mia Vance should be excluded due to overlapping appointment at 15:00!')
  }
  console.log('PASS: TEST 4 passed')

  // ----------------------------------------------------
  // TEST 5: CANCELLED APPOINTMENT DOES NOT BLOCK AVAILABILITY
  // ----------------------------------------------------
  console.log('\n--- TEST 5: CANCELLED APPOINTMENT DOES NOT BLOCK AVAILABILITY ---')
  // Create a dummy appointment for Rohan Sen at 16:00-17:00, then cancel it
  const dummyApt = await appointmentService.createAppointment({
    clientId: 'client-01',
    serviceId: 'srv-01',
    staffId: 'staff-02', // Rohan
    date: tomorrowStr,
    startTime: '16:00',
    endTime: '17:00',
    price: 600,
    status: 'scheduled',
  })
  console.log(`Created temporary appointment ${dummyApt.id} for Rohan Sen on ${tomorrowStr}`)

  // Cancel it
  await appointmentService.updateAppointmentStatus(dummyApt.id, 'cancelled')
  console.log(`Cancelled appointment ${dummyApt.id}`)

  // Now check availability for Rohan at 16:00 on tomorrowStr
  const res5 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-01', // Haircut (45 min)
    date: tomorrowStr,
    startTime: '16:00',
  })
  const rohanInRes5 = res5.availableStylists.some((s) => s.staffName === 'Rohan Sen')
  console.log(`Rohan Sen available after cancellation: ${rohanInRes5 ? 'YES' : 'NO'}`)
  if (!rohanInRes5) {
    throw new Error('Rohan Sen should be available after appointment cancellation!')
  }
  console.log('PASS: TEST 5 passed')

  // ----------------------------------------------------
  // TEST 6: LONG SERVICE DURATION CROSSING BOUNDARY
  // ----------------------------------------------------
  console.log('\n--- TEST 6: LONG DURATION CROSSING CLOSING TIME EXCLUSION ---')
  // Balayage (180 min = 3h). If requested at 19:00 (7:00 PM), finishes at 22:00.
  // Saturday closing time is 21:00 (9:00 PM).
  // 22:00 > 21:00 -> Must be excluded!
  const res6 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-04',
    date: todayStr,
    startTime: '19:00',
  })
  console.log(`Summary at 19:00 (180 min service): "${res6.summaryMessage}"`)
  console.log(`Reason: "${res6.reasonSummary}"`)
  if (res6.availableStylists.length !== 0) {
    throw new Error('Service extending past closing time should have 0 available stylists!')
  }
  console.log('PASS: TEST 6 passed')

  // ----------------------------------------------------
  // TEST 7: MULTIPLE AVAILABLE STYLISTS
  // ----------------------------------------------------
  console.log('\n--- TEST 7: MULTIPLE AVAILABLE STYLISTS ---')
  // Haircut (srv-01, 45 min) on tomorrow at 16:00 (4:00 PM).
  // Both Mia Vance and Rohan Sen are capable and working with no bookings at 16:00.
  const res7 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-01',
    date: tomorrowStr,
    startTime: '16:00',
  })
  console.log(`Found ${res7.availableStylists.length} stylists for Haircut: ${res7.availableStylists.map((s) => s.staffName).join(', ')}`)
  if (res7.availableStylists.length < 2) {
    throw new Error(`Expected at least 2 available stylists, got ${res7.availableStylists.length}`)
  }
  console.log('PASS: TEST 7 passed')

  // ----------------------------------------------------
  // TEST 8: NO AVAILABLE STYLIST WITH FACTUAL EXPLANATION
  // ----------------------------------------------------
  console.log('\n--- TEST 8: NO AVAILABLE STYLIST WITH FACTUAL EXPLANATION ---')
  // Request Balayage today at 12:00.
  // Today at 12:00:
  // - Rohan Sen is booked with apt-03 (11:30–14:30)
  // - What about Mia Vance? Mia is capable. If we check, let's see if reason details are returned.
  const res8 = await availabilityService.findAvailableStylists({
    serviceId: 'srv-04',
    date: todayStr,
    startTime: '12:00',
  })
  console.log(`Summary: "${res8.summaryMessage}"`)
  console.log(`Factual reason summary: "${res8.reasonSummary}"`)
  if (res8.availableStylists.length === 0 && !res8.reasonSummary) {
    throw new Error('Expected factual reason summary when 0 stylists are available!')
  }
  console.log('PASS: TEST 8 passed')

  // ----------------------------------------------------
  // TEST 11: REGRESSION CHECK ("Show today's bookings")
  // ----------------------------------------------------
  console.log('\n--- TEST 11: REGRESSION CHECK ---')
  const bookingsCmd = interpretCommand("Show today's bookings")
  console.log(`Command intent: ${bookingsCmd.intent}`)
  if (bookingsCmd.intent !== 'SHOW_TODAY_BOOKINGS') {
    throw new Error("Regression: 'Show today's bookings' intent failed!")
  }
  const bookingsResult = await executeCommand(bookingsCmd)
  console.log(`Assistant response: "${bookingsResult.message}" (${bookingsResult.appointments?.length || 0} appointments)`)
  if (!bookingsResult.appointments || bookingsResult.appointments.length === 0) {
    throw new Error("Regression: 'Show today's bookings' returned no appointments!")
  }
  console.log('PASS: TEST 11 passed')

  // ----------------------------------------------------
  // NATURAL LANGUAGE COMMAND INTERPRETER & ACTION TESTS
  // ----------------------------------------------------
  console.log('\n--- NATURAL LANGUAGE TARGET QUERIES ---')
  const naturalQueries = [
    { query: 'Find an available stylist for balayage at 4 PM', expectedIntent: 'FIND_AVAILABLE_STYLIST', expectAvailable: true },
    { query: 'Who is available for balayage at 4 PM?', expectedIntent: 'FIND_AVAILABLE_STYLIST', expectAvailable: true },
    { query: 'Find a stylist for hair spa at 3 PM today', expectedIntent: 'FIND_AVAILABLE_STYLIST' },
    { query: 'Who can do hair color at 5 PM?', expectedIntent: 'FIND_AVAILABLE_STYLIST' },
    { query: 'Is anyone available for keratin at 2 PM?', expectedIntent: 'FIND_AVAILABLE_STYLIST' },
    { query: 'Find a stylist for keratin tomorrow at 2 PM', expectedIntent: 'FIND_AVAILABLE_STYLIST' },
    { query: 'Who is available?', expectedIntent: 'FIND_AVAILABLE_STYLIST', expectedType: 'clarification_prompt' },
    { query: 'Who can do balayage?', expectedIntent: 'FIND_AVAILABLE_STYLIST', expectedType: 'clarification_prompt' },
  ]

  for (const q of naturalQueries) {
    const parsed = interpretCommand(q.query)
    console.log(`\nQuery: "${q.query}"`)
    console.log(`  -> Intent: ${parsed.intent}, serviceQuery: ${parsed.params?.serviceQuery}, time: ${parsed.params?.startTime}, date: ${parsed.params?.date}`)
    if (parsed.intent !== q.expectedIntent) {
      throw new Error(`Query "${q.query}" failed intent match. Expected ${q.expectedIntent}, got ${parsed.intent}`)
    }

    const actionRes = await executeCommand(parsed)
    console.log(`  -> Action Type: ${actionRes.type}`)
    console.log(`  -> Message: "${actionRes.message}"`)

    if (q.expectedType && actionRes.type !== q.expectedType) {
      throw new Error(`Expected action type ${q.expectedType}, got ${actionRes.type}`)
    }

    if (q.expectAvailable) {
      if (!actionRes.availabilityResults || actionRes.availabilityResults.availableStylists.length === 0) {
        throw new Error(`Expected available stylists for "${q.query}"`)
      }
      console.log(`  -> Stylists found: ${actionRes.availabilityResults.availableStylists.map((s) => s.staffName).join(', ')}`)
    }
  }

  console.log('\n==================================================')
  console.log('ALL PHASE 8 VERIFICATION TESTS PASSED!')
  console.log('==================================================')
}

runPhase8Tests().catch((err) => {
  console.error('Phase 8 Test Suite Failed:', err)
  process.exit(1)
})
