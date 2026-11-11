import { webkit } from 'playwright'

async function runPhase11BrowserE2E() {
  console.log('=== STARTING PLAYWRIGHT REAL BROWSER E2E TEST FOR PHASE 11 ===')
  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  try {
    // 1. Navigate to application
    console.log('\n1. Navigating to http://127.0.0.1:5173/ ...')
    await page.goto('http://127.0.0.1:5173/')
    await page.waitForTimeout(1000)
    const rootHtml = await page.locator('#root').innerHTML()
    console.log('Root HTML length:', rootHtml.length, 'snippet:', rootHtml.slice(0, 150))

    // If login view is shown, select Owner 1 persona
    if (rootHtml.includes('login-view-container') || rootHtml.includes('login-portal')) {
      console.log('Login portal detected, selecting Owner 1 persona...')
      await page.click('.persona-btn:has-text("Owner 1")')
      await page.waitForTimeout(1000)
    }

    await page.waitForSelector('.luma-app-shell', { timeout: 10000 })
    console.log('✓ App loaded successfully into .luma-app-shell!')

    // 2. Check initial session as Owner
    console.log('\n2. Verifying Owner session & Header profile...')
    await page.waitForSelector('.user-profile-btn', { timeout: 5000 })
    const profileRoleBadge = await page.locator('.user-role-badge').innerText()
    console.log(`Active Role Badge: "${profileRoleBadge}"`)
    if (!profileRoleBadge.includes('OWNER')) {
      throw new Error(`Expected OWNER badge, got: ${profileRoleBadge}`)
    }

    // Check sidebar navigation items: Owner must see "User Management"
    const usersNavBtn = page.locator('button.nav-btn[title="User Management"]')
    const usersNavVisible = await usersNavBtn.isVisible()
    console.log(`"User Management" Nav Button visible: ${usersNavVisible}`)
    if (!usersNavVisible) {
      throw new Error('Owner should see "User Management" navigation button in sidebar!')
    }

    // 3. Navigate to User Management
    console.log('\n3. Navigating to User Management workspace...')
    await usersNavBtn.click()
    await page.waitForSelector('.user-mgmt-page', { timeout: 5000 })
    const headerTitle = await page.locator('.user-mgmt-main-title').innerText()
    console.log(`User Management Title: "${headerTitle}"`)
    if (!headerTitle.includes('User Management')) {
      throw new Error(`Expected User Management, got: ${headerTitle}`)
    }

    // Verify user count
    const statCards = await page.locator('.stat-card .stat-value').allInnerTexts()
    console.log(`Stat values (Total, Active Employees, Owners, Receptionists): ${statCards.join(', ')}`)
    const totalUsers = parseInt(statCards[0], 10)
    if (totalUsers < 23) {
      throw new Error(`Expected at least 23 users, found ${totalUsers}`)
    }

    // 4. Test Add Employee Modal
    console.log('\n4. Opening "+ Create Employee" modal...')
    const addEmployeeBtn = page.locator('button.btn-create-employee')
    await addEmployeeBtn.click()
    await page.waitForSelector('.user-modal-card', { timeout: 5000 })

    // Verify role locked
    const lockedRoleText = await page.locator('.role-locked-badge').innerText()
    console.log(`Locked Role Tag: "${lockedRoleText}"`)
    if (!lockedRoleText.includes('EMPLOYEE')) {
      throw new Error(`Role must be locked to EMPLOYEE, got: ${lockedRoleText}`)
    }

    // Fill form
    const uniqueEmail = `vikram.test.${Date.now()}@lumasalon.example.com`
    await page.fill('#emp-name', 'Vikram Test Specialist')
    await page.fill('#emp-email', uniqueEmail)
    await page.fill('#emp-phone', '+91 98119 99888')
    await page.selectOption('#emp-specialty', 'Hair')

    // Submit form
    console.log('Submitting new employee form...')
    await page.click('.user-modal-card button.btn-modal-submit')
    await page.waitForSelector('.user-modal-card', { state: 'detached', timeout: 5000 })
    console.log('✓ Modal closed successfully.')

    // Verify user list updated
    await page.waitForTimeout(600)
    const newTotalUsers = parseInt(await page.locator('.stat-card .stat-value').first().innerText(), 10)
    console.log(`New Total Users count: ${newTotalUsers}`)
    if (newTotalUsers !== totalUsers + 1) {
      throw new Error(`Expected count ${totalUsers + 1}, got ${newTotalUsers}`)
    }

    // 5. Switch to Receptionist session via Header switcher
    console.log('\n5. Switching persona to Receptionist...')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.quick-switch-item:has-text("Receptionist 1")')
    await page.waitForTimeout(600)

    const recRoleBadge = await page.locator('.user-role-badge').innerText()
    console.log(`Switched Role: "${recRoleBadge}"`)
    if (!recRoleBadge.includes('RECEPTIONIST')) {
      throw new Error(`Expected RECEPTIONIST badge, got: ${recRoleBadge}`)
    }

    // Check that "User Management" is no longer visible in sidebar
    const usersNavVisibleRec = await page.locator('button.nav-btn[title="User Management"]').isVisible()
    console.log(`"User Management" Nav Button visible for Receptionist: ${usersNavVisibleRec}`)
    if (usersNavVisibleRec) {
      throw new Error('Receptionist MUST NOT see User Management nav button!')
    }

    // 6. Switch to Employee session (Rohan Sen)
    console.log('\n6. Switching persona to Employee (Rohan Sen)...')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.quick-switch-item:has-text("Rohan Sen")')
    await page.waitForTimeout(600)

    const empRoleBadge = await page.locator('.user-role-badge').innerText()
    console.log(`Switched Role: "${empRoleBadge}"`)
    if (!empRoleBadge.includes('EMPLOYEE')) {
      throw new Error(`Expected EMPLOYEE badge, got: ${empRoleBadge}`)
    }

    // Verify sidebar shows "My Calendar" instead of "Calendar"
    const calendarNavBtn = page.locator('button.nav-btn[title="My Calendar"]')
    const calendarVisible = await calendarNavBtn.isVisible()
    console.log(`"My Calendar" button visible for Employee: ${calendarVisible}`)
    if (!calendarVisible) {
      throw new Error('Employee must see "My Calendar" navigation button!')
    }

    // 7. Check Calendar Isolation for Employee
    console.log('\n7. Checking Calendar Isolation for Rohan Sen...')
    await calendarNavBtn.click()
    await page.waitForSelector('.cal-page-container', { timeout: 5000 })
    const calTitle = await page.locator('.cal-main-title').innerText()
    console.log(`Calendar Page Title: "${calTitle}"`)
    if (!calTitle.includes('My Calendar')) {
      throw new Error(`Expected "My Calendar", got: ${calTitle}`)
    }

    // Verify "+ New Appointment" button is NOT present for employee
    const newAptBtnVisible = await page.locator('.cal-primary-action-btn').isVisible()
    console.log(`"+ New Appointment" button visible for Employee: ${newAptBtnVisible}`)
    if (newAptBtnVisible) {
      throw new Error('Employee must NOT see + New Appointment button!')
    }

    // 8. Test AI Assistant Role Enforcement for Employee
    console.log('\n8. Testing AI Assistant role restrictions for Employee...')
    const assistantNavBtn = page.locator('button.nav-btn[title="AI Assistant"]')
    await assistantNavBtn.click()
    await page.waitForSelector('.composer-input', { timeout: 5000 })

    // A. Query other stylist's appointments
    console.log('Sending: "Show Mia\'s appointments"...')
    await page.fill('.composer-input', "Show Mia's appointments")
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    const assistantBubbles = await page.locator('.assistant-bubble').allInnerTexts()
    const lastMsg = assistantBubbles[assistantBubbles.length - 1]
    console.log(`Assistant reply: "${lastMsg.replace(/\n+/g, ' ')}"`)
    if (!lastMsg.includes('permission to view appointments for other employees')) {
      throw new Error(`Expected permission denied message, got: ${lastMsg}`)
    }

    // B. Query reminder dispatch
    console.log('Sending: "Send appointment reminders"...')
    await page.fill('.composer-input', 'Send appointment reminders')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1000)

    const updatedBubbles = await page.locator('.assistant-bubble').allInnerTexts()
    const lastReminderMsg = updatedBubbles[updatedBubbles.length - 1]
    console.log(`Assistant reply for reminders: "${lastReminderMsg.replace(/\n+/g, ' ')}"`)
    if (!lastReminderMsg.includes('permission to dispatch salon-wide appointment reminders')) {
      throw new Error(`Expected reminder permission error, got: ${lastReminderMsg}`)
    }

    // 9. Switch back to Owner and verify full access
    console.log('\n9. Switching persona back to Owner 1...')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.quick-switch-item:has-text("Owner 1")')
    await page.waitForTimeout(600)

    const ownerRestored = await page.locator('.user-role-badge').innerText()
    console.log(`Restored Role Badge: "${ownerRestored}"`)
    if (!ownerRestored.includes('OWNER')) {
      throw new Error(`Expected OWNER badge, got: ${ownerRestored}`)
    }

    const usersNavRestored = await page.locator('button.nav-btn[title="User Management"]').isVisible()
    console.log(`"User Management" Nav Item restored for Owner: ${usersNavRestored}`)
    if (!usersNavRestored) {
      throw new Error('Owner must see User Management nav item restored!')
    }

    console.log('\n=================================================================')
    console.log('ALL PHASE 11 REAL BROWSER E2E ACCEPTANCE TESTS PASSED (100%)!')
    console.log('=================================================================')
  } finally {
    await browser.close()
  }
}

runPhase11BrowserE2E().catch((err) => {
  console.error('\n❌ Playwright Phase 11 Test FAILED:', err)
  process.exit(1)
})
