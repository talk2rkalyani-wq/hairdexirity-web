import { webkit } from 'playwright'

async function runTest() {
  console.log('=== STARTING PLAYWRIGHT WEBKIT REAL BROWSER E2E TEST ===')
  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  page.on('console', (msg) => {
    const text = msg.text()
    if (!text.includes('[vite]')) {
      console.log(`[BROWSER CONSOLE ${msg.type()}]:`, text)
    }
  })

  page.on('pageerror', (err) => {
    console.error('[BROWSER PAGE ERROR]:', err)
  })

  // 1. Navigate to app
  console.log('1. Navigating to http://127.0.0.1:5173 ...')
  await page.goto('http://127.0.0.1:5173')
  await page.waitForLoadState('networkidle')

  // Clear localStorage and seed owner session for a pristine baseline
  await page.evaluate(() => {
    localStorage.clear()
    const now = new Date()
    const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const session = {
      sessionId: 'sess-test',
      userId: 'user-owner-01',
      name: 'Owner 1',
      email: 'owner1@lumasalon.example.com',
      role: 'OWNER',
      isAuthenticated: true,
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    }
    localStorage.setItem('luma_salon_session_v1', JSON.stringify(session))
  })
  await page.reload()
  await page.waitForLoadState('networkidle')
  console.log('App loaded with clean baseline.')

  // 2. Locate ChatComposer input
  const input = page.locator('.composer-input')
  await input.waitFor({ state: 'visible', timeout: 5000 })
  console.log('Found composer input.')

  // 3. Type natural language booking command
  const bookingQuery = 'Book Priya Sharma for balayage tomorrow at 4 PM with Rohan'
  console.log(`\n2. Submitting booking command: "${bookingQuery}"`)
  await input.fill(bookingQuery)
  await page.keyboard.press('Enter')

  // 4. Wait for preview card
  console.log('Waiting for booking preview card...')
  const previewCard = page.locator('.booking-preview-card')
  await previewCard.waitFor({ state: 'visible', timeout: 8000 })
  console.log('✓ Booking preview card is visible!')

  const previewText = await previewCard.innerText()
  console.log('Preview card details:\n', previewText.trim().replace(/\n+/g, ' | '))

  // 5. Click "Confirm Booking"
  const confirmBtn = page.locator('.btn-confirm-booking')
  await confirmBtn.waitFor({ state: 'visible', timeout: 5000 })
  console.log('\n3. Clicking "Confirm Booking"...')
  await confirmBtn.click()

  // 6. Wait for confirmed appointment card
  console.log('Waiting for confirmed appointment receipt card...')
  const confirmedCard = page.locator('.booking-confirmed-card')
  await confirmedCard.waitFor({ state: 'visible', timeout: 8000 })
  console.log('✓ Confirmed appointment card is visible!')

  const confirmedText = await confirmedCard.innerText()
  console.log('Confirmed card details:\n', confirmedText.trim().replace(/\n+/g, ' | '))

  const appointmentIdEl = page.locator('.confirmed-val.id-val')
  const newAppointmentId = (await appointmentIdEl.innerText()).trim()
  console.log(`\n>>> Newly generated appointment ID displayed in UI: ${newAppointmentId} <<<`)
  if (!newAppointmentId || !newAppointmentId.startsWith('apt-')) {
    throw new Error(`Invalid appointment ID in confirmation card: "${newAppointmentId}"`)
  }

  // 7. Inspect Canonical Store in LocalStorage
  const storageData = await page.evaluate(() => {
    const raw = localStorage.getItem('luma_salon_appointments_v1')
    return raw ? JSON.parse(raw) : null
  })
  console.log('\n4. Checking browser localStorage:')
  console.log(`Total appointments in localStorage: ${storageData ? storageData.length : 0}`)
  const newlyCreatedInStore = storageData?.find((a) => a.id === newAppointmentId)
  if (!newlyCreatedInStore) {
    throw new Error(`CRITICAL: Newly created appointment ${newAppointmentId} not found in localStorage!`)
  }
  console.log('✓ Found new appointment in localStorage:', JSON.stringify(newlyCreatedInStore, null, 2))

  // Check 18 Sep appointments in localStorage
  const sep18InStore = storageData.filter((a) => a.date === '2026-09-18')
  console.log(`Appointments on 2026-09-18 in localStorage: ${sep18InStore.length}`)

  // 8. Navigate to Calendar
  console.log('\n5. Navigating to Calendar view...')
  const calendarNavBtn = page.locator('button.nav-btn[aria-label="Calendar"]')
  await calendarNavBtn.click()
  await page.waitForTimeout(500)

  // Navigate to Friday, 18 September 2026
  const nextDateBtn = page.locator('button.cal-nav-btn[aria-label="Next date"]')
  await nextDateBtn.click()
  await page.waitForTimeout(500)

  const activeHeaderDate = await page.locator('.cal-nav-date-label').innerText()
  console.log(`Calendar active date header: "${activeHeaderDate}"`)

  const summaryCount = await page.locator('.cal-summary-tag .summary-count').innerText()
  console.log(`Calendar appointment count on this date: ${summaryCount}`)

  // Find all cards on Friday 18 Sep
  const dayCards = page.locator('.cal-appointment-card')
  const cardCount = await dayCards.count()
  console.log(`Total appointment cards rendered in Day View: ${cardCount}`)

  let foundPriyaInCalendar = false
  for (let i = 0; i < cardCount; i++) {
    const card = dayCards.nth(i)
    const text = await card.innerText()
    console.log(`[Calendar Card ${i + 1}]: ${text.replace(/\n+/g, ' | ')}`)
    if (text.includes('Priya Sharma') && text.includes('Balayage & Toning') && text.includes('Rohan Sen')) {
      foundPriyaInCalendar = true
      console.log('>>> ✓ VERIFIED: Priya Sharma appointment found in Calendar Day View! <<<')
    }
  }

  if (!foundPriyaInCalendar) {
    throw new Error('CRITICAL FAILURE: Priya Sharma Balayage appointment is NOT visible in Calendar on Friday, 18 September 2026!')
  }

  // Check Week View
  console.log('\n6. Checking Calendar Week View...')
  const weekToggleBtn = page.locator('button.cal-toggle-btn:has-text("Week")')
  await weekToggleBtn.click()
  await page.waitForTimeout(500)

  const weekCards = page.locator('.cal-appointment-card:has-text("Priya Sharma")')
  const weekPriyaCount = await weekCards.count()
  console.log(`Priya Sharma cards in Week View: ${weekPriyaCount}`)
  if (weekPriyaCount === 0) {
    throw new Error('CRITICAL FAILURE: Priya Sharma appointment is NOT visible in Calendar Week View!')
  }
  console.log('✓ VERIFIED: Priya Sharma appointment is visible in Calendar Week View!')

  // 9. Navigate to Clients -> Priya Sharma -> Service History
  console.log('\n7. Navigating to Clients view...')
  const clientsNavBtn = page.locator('button.nav-btn[aria-label="Clients"]')
  await clientsNavBtn.click()
  await page.waitForTimeout(500)

  console.log('Clicking Priya Sharma in clients table...')
  const priyaRow = page.locator('tr.client-table-row:has-text("Priya Sharma")')
  await priyaRow.click()
  await page.waitForTimeout(600)

  const drawer = page.locator('.client-profile-drawer')
  await drawer.waitFor({ state: 'visible', timeout: 5000 })
  console.log('✓ Client Profile Drawer opened for Priya Sharma.')

  const historyItems = page.locator('.history-item')
  const historyCount = await historyItems.count()
  console.log(`Total Service History items for Priya Sharma: ${historyCount}`)

  let foundNewSep18History = false
  let foundExistingSep17History = false

  for (let i = 0; i < historyCount; i++) {
    const item = historyItems.nth(i)
    const text = await item.innerText()
    console.log(`[History Item ${i + 1}]: ${text.replace(/\n+/g, ' | ')}`)
    if (text.includes('2026-09-18') && text.includes('Balayage & Toning')) {
      foundNewSep18History = true
    }
    if (text.includes('2026-09-17') && text.includes('Balayage & Toning')) {
      foundExistingSep17History = true
    }
  }

  if (!foundNewSep18History) {
    throw new Error('CRITICAL FAILURE: Priya Sharma Service History does NOT contain the new 2026-09-18 appointment!')
  }
  if (!foundExistingSep17History) {
    throw new Error('CRITICAL FAILURE: Existing 2026-09-17 appointment was lost!')
  }
  console.log('>>> ✓ VERIFIED: Priya Sharma Service History contains BOTH existing 17 Sep AND new 18 Sep appointment! <<<')

  // Close drawer
  console.log('Closing Client Profile Drawer...')
  await page.evaluate(() => {
    const btn = document.querySelector('button.drawer-btn.close-btn')
    if (btn) btn.click()
  })
  await page.waitForTimeout(500)

  // 10. Test Availability Conflict Rejection
  console.log('\n8. Checking Availability & Conflict Prevention in AI Assistant...')
  const assistantNavBtn = page.locator('button.nav-btn[aria-label="AI Assistant"]')
  await assistantNavBtn.click()
  await page.waitForTimeout(500)

  const availInput = page.locator('.composer-input')
  const conflictBookingQuery = 'Book Ananya Kapoor for balayage tomorrow at 4 PM with Rohan'
  console.log(`Attempting conflicting booking with Rohan at 4 PM tomorrow: "${conflictBookingQuery}"`)
  await availInput.fill(conflictBookingQuery)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)

  // Check that preview card is NOT shown, or a conflict warning message is shown
  const lastBubble = page.locator('.assistant-bubble').last()
  const responseText = await lastBubble.innerText()
  console.log('Assistant response to conflicting request:\n', responseText.trim().replace(/\n+/g, ' | '))

  const hasConflictIndication = responseText.includes('not available') || 
                                responseText.includes("isn't available") ||
                                responseText.includes('conflict') || 
                                responseText.includes('Unavailable') ||
                                responseText.includes('already has') ||
                                responseText.includes('busy') ||
                                responseText.includes('No available')

  console.log(`Conflict correctly detected and blocked: ${hasConflictIndication}`)
  if (!hasConflictIndication) {
    throw new Error('CRITICAL FAILURE: Conflicting booking for Rohan at 4 PM was not rejected!')
  }

  // 11. Test Browser Refresh Persistence (Requirement H)
  console.log('\n9. Testing Browser Refresh Persistence (Reloading page)...')
  await page.reload()
  await page.waitForLoadState('networkidle')
  console.log('Page reloaded.')

  // Re-verify in Calendar after refresh
  await page.locator('button.nav-btn[aria-label="Calendar"]').click()
  await page.waitForTimeout(500)
  await page.locator('button.cal-nav-btn[aria-label="Next date"]').click()
  await page.waitForTimeout(500)

  const cardsAfterReload = page.locator('.cal-appointment-card:has-text("Priya Sharma")')
  const priyaCardsAfterReload = await cardsAfterReload.count()
  console.log(`Priya Sharma cards in Calendar after page refresh: ${priyaCardsAfterReload}`)
  if (priyaCardsAfterReload === 0) {
    throw new Error('CRITICAL FAILURE: Appointment disappeared after browser refresh!')
  }
  console.log('>>> ✓ VERIFIED: Appointment persists across full browser refresh! <<<')

  // Re-verify in Priya Sharma Client Profile after refresh
  await page.locator('button.nav-btn[aria-label="Clients"]').click()
  await page.waitForTimeout(500)
  await page.locator('tr.client-table-row:has-text("Priya Sharma")').click()
  await page.waitForTimeout(600)
  const sep18HistoryAfterReload = await page.locator('.history-item:has-text("2026-09-18")').count()
  console.log(`Priya Sharma 2026-09-18 history count after page refresh: ${sep18HistoryAfterReload}`)
  if (sep18HistoryAfterReload === 0) {
    throw new Error('CRITICAL FAILURE: Service history entry disappeared after browser refresh!')
  }
  console.log('>>> ✓ VERIFIED: Client service history entry persists across full browser refresh! <<<')

  console.log('\n======================================================')
  console.log('ALL E2E BROWSER ACCEPTANCE CRITERIA PASSED CONVINCINGLY!')
  console.log('======================================================')

  await browser.close()
}

runTest().catch((err) => {
  console.error('\n❌ Playwright E2E Test FAILED:', err)
  process.exit(1)
})
