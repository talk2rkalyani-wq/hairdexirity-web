import { webkit } from 'playwright'

async function runTest() {
  console.log('=== STARTING PLAYWRIGHT WEBKIT REAL BROWSER E2E TEST FOR PHASE 10 ===')
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

  // Clear localStorage and reload for a pristine baseline
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForLoadState('networkidle')
  console.log('App loaded fresh with clean baseline.')

  // Authenticate as Owner
  await page.waitForSelector('.login-card', { timeout: 5000 })
  await page.fill('#login-email', 'owner1@lumasalon.example.com')
  await page.fill('#login-password', 'Luma@2026!')
  await page.click('button.btn-login-submit')
  await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
  console.log('✓ Authenticated as Owner into app shell!')

  // 2. Click the Suggested Action pill: "Send appointment reminders"
  console.log('\n2. Clicking dashboard suggested action: "Send appointment reminders"...')
  const reminderPill = page.locator('button.action-chip:has-text("Send appointment reminders")')
  await reminderPill.waitFor({ state: 'visible', timeout: 5000 })
  await reminderPill.click()

  // 3. Wait for Reminders Preview Card
  console.log('Waiting for RemindersPreviewCard in chat stream...')
  const previewCard = page.locator('.reminders-preview-card')
  await previewCard.waitFor({ state: 'visible', timeout: 8000 })
  console.log('✓ RemindersPreviewCard is visible in browser DOM!')

  const previewText = await previewCard.innerText()
  console.log('Reminders preview card summary:\n', previewText.trim().replace(/\n+/g, ' | '))

  // Verify recipient rows
  const recipientRows = page.locator('.recipient-row')
  const count = await recipientRows.count()
  console.log(`Preview card contains ${count} recipient client(s) for today.`)
  if (count === 0) {
    throw new Error('Expected at least 1 recipient client in reminders preview!')
  }

  // Verify Template Accordion Toggle
  console.log('\n3. Testing WhatsApp template accordion toggle...')
  const templateToggle = page.locator('button.template-toggle-btn')
  await templateToggle.click()
  await page.waitForTimeout(300)
  const templateBox = page.locator('.template-preview-box')
  await templateBox.waitFor({ state: 'visible', timeout: 3000 })
  const templateMsg = await templateBox.innerText()
  console.log('WhatsApp message template:\n', templateMsg.replace(/\n+/g, ' '))
  if (!templateMsg.includes('Luma Salon') || !templateMsg.includes('Galleria Market')) {
    throw new Error('Template text does not include expected salon branding!')
  }

  // 4. Click "[Send Reminders]"
  console.log('\n4. Clicking "Send Reminders" button...')
  const sendBtn = page.locator('button.btn-confirm-reminders')
  await sendBtn.click()

  // 5. Wait for RemindersSentCard
  console.log('Waiting for RemindersSentCard receipt...')
  const sentCard = page.locator('.reminders-sent-card')
  await sentCard.waitFor({ state: 'visible', timeout: 8000 })
  console.log('✓ RemindersSentCard is visible in browser DOM!')

  const sentText = await sentCard.innerText()
  console.log('Sent receipt summary:\n', sentText.trim().replace(/\n+/g, ' | '))

  // 6. Inspect browser localStorage
  console.log('\n5. Checking canonical store persistence in browser localStorage...')
  const storageData = await page.evaluate(() => {
    const raw = localStorage.getItem('luma_salon_appointments_v1')
    return raw ? JSON.parse(raw) : null
  })

  const remindedInStorage = storageData?.filter((a) => a.reminderSent === true)
  console.log(`Appointments with reminderSent === true in localStorage: ${remindedInStorage?.length}`)
  if (!remindedInStorage || remindedInStorage.length === 0) {
    throw new Error('CRITICAL: reminderSent was not persisted to localStorage!')
  }
  console.log('✓ Successfully persisted reminderSent to canonical localStorage!')

  // 7. Test natural language command: "Send reminders for tomorrow"
  console.log('\n6. Testing natural language command: "Send reminders for tomorrow"...')
  const input = page.locator('.composer-input')
  await input.fill('Send reminders for tomorrow')
  await page.keyboard.press('Enter')

  const secondPreviewCard = page.locator('.reminders-preview-card').nth(1)
  await secondPreviewCard.waitFor({ state: 'visible', timeout: 8000 })
  const tomorrowPreviewText = await secondPreviewCard.innerText()
  console.log('Tomorrow reminders preview summary:\n', tomorrowPreviewText.trim().replace(/\n+/g, ' | '))
  if (!tomorrowPreviewText.includes('September 2026')) {
    throw new Error('Expected tomorrow preview to target September 2026!')
  }
  console.log('✓ Tomorrow query correctly targeted tomorrow schedule in September 2026!')

  // Test Cancel button on tomorrow's preview
  console.log('\n7. Testing Cancel button on tomorrow\'s preview...')
  const cancelBtn = page.locator('button.btn-cancel-reminders').last()
  await cancelBtn.click()
  await page.waitForTimeout(600)
  const lastBubble = page.locator('.assistant-bubble').last()
  const cancelBubbleText = await lastBubble.innerText()
  console.log('Assistant response after cancel:\n', cancelBubbleText.trim().replace(/\n+/g, ' | '))
  if (!cancelBubbleText.includes('cancelled')) {
    throw new Error('Cancellation response was not displayed!')
  }
  console.log('✓ Cancellation correctly confirmed without sending!')

  console.log('\n======================================================')
  console.log('ALL PHASE 10 REAL BROWSER ACCEPTANCE CRITERIA PASSED!')
  console.log('======================================================')

  await browser.close()
}

runTest().catch((err) => {
  console.error('\n❌ Playwright Phase 10 Test FAILED:', err)
  process.exit(1)
})
