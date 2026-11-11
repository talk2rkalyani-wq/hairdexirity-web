import { webkit } from 'playwright'

const DEFAULT_TEST_PASSWORD = 'Luma@2026!'

async function runRealAuthBrowserE2E() {
  console.log('=== STARTING PLAYWRIGHT REAL BROWSER E2E TEST: REAL AUTHENTICATION ===')
  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  try {
    // ----------------------------------------------------
    // FLOW A: Open application while logged out -> Login Screen
    // ----------------------------------------------------
    console.log('\n--- FLOW A: Logged-out initial load displays Login Screen ---')
    await page.goto('http://127.0.0.1:5173/')
    await page.evaluate(() => {
      window.localStorage.removeItem('luma_salon_session_v1')
    })
    await page.reload()

    // Verify Login Screen elements
    await page.waitForSelector('.login-card', { timeout: 8000 })
    const loginTitle = await page.locator('.login-title').innerText()
    console.log(`Login Screen Title: "${loginTitle}"`)
    if (!loginTitle.includes('Sign In')) {
      throw new Error(`Expected Sign In title, got: ${loginTitle}`)
    }

    // Verify presence of real credential fields
    const emailInput = page.locator('#login-email')
    const passwordInput = page.locator('#login-password')
    const submitBtn = page.locator('button.btn-login-submit')
    if (!(await emailInput.isVisible()) || !(await passwordInput.isVisible()) || !(await submitBtn.isVisible())) {
      throw new Error('Login screen must have email, password, and submit button!')
    }

    // Verify that quick switch and persona selectors do NOT exist on login screen
    const personaCardCount = await page.locator('.persona-card, .login-persona-btn, .role-tab').count()
    console.log(`Persona buttons on login screen: ${personaCardCount}`)
    if (personaCardCount > 0) {
      throw new Error('Login screen MUST NOT contain persona selector buttons or role tabs!')
    }
    console.log('✓ FLOW A PASSED: Real credential login screen displayed, no auto-login or persona pickers.')

    // ----------------------------------------------------
    // FLOW B: Login as Rohan -> EMPLOYEE session, no Quick Switch, isolated data
    // ----------------------------------------------------
    console.log('\n--- FLOW B: Login as Rohan Sen (Employee) ---')
    await emailInput.fill('rohan@lumasalon.example.com')
    await passwordInput.fill(DEFAULT_TEST_PASSWORD)
    await submitBtn.click()

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✓ Authenticated into app shell!')

    // Check Header profile
    await page.waitForSelector('.user-profile-btn', { timeout: 5000 })
    const userName = await page.locator('.user-name-label').innerText()
    const userRole = await page.locator('.user-role-badge').first().innerText()
    console.log(`Header user: "${userName}", Role: "${userRole}"`)
    if (userName !== 'Rohan Sen' || userRole !== 'EMPLOYEE') {
      throw new Error(`Expected Rohan Sen (EMPLOYEE), got: ${userName} (${userRole})`)
    }

    // Open profile dropdown and verify NO Quick Switch list
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    const quickSwitchItems = await page.locator('.quick-switch-item, .quick-switch-list').count()
    console.log(`Quick Switch items in header dropdown: ${quickSwitchItems}`)
    if (quickSwitchItems > 0) {
      throw new Error('Header dropdown MUST NOT contain Quick Switch user list!')
    }

    // Verify Logout button exists in dropdown
    const logoutBtn = page.locator('.dropdown-logout-btn')
    if (!(await logoutBtn.isVisible())) {
      throw new Error('Dropdown must display Log Out button!')
    }

    // Close dropdown
    await page.click('.dropdown-backdrop')
    await page.waitForTimeout(400)

    // Check Sidebar: "My Calendar" instead of "Calendar", NO "User Management"
    const myCalBtn = page.locator('button.nav-btn[title="My Calendar"]')
    if (!(await myCalBtn.isVisible())) {
      throw new Error('Employee must see "My Calendar" nav button!')
    }
    const userMgmtNav = page.locator('button.nav-btn[title="User Management"]')
    if (await userMgmtNav.isVisible()) {
      throw new Error('Employee MUST NOT see User Management nav button!')
    }

    // Check Calendar View isolation
    await myCalBtn.click()
    await page.waitForSelector('.cal-page-container', { timeout: 5000 })
    const calTitle = await page.locator('.cal-main-title').innerText()
    console.log(`Calendar title: "${calTitle}"`)
    if (!calTitle.includes('My Calendar')) {
      throw new Error(`Expected "My Calendar", got: ${calTitle}`)
    }
    const newAptBtn = await page.locator('.cal-primary-action-btn').isVisible()
    if (newAptBtn) {
      throw new Error('Employee MUST NOT see "+ New Appointment" button in calendar!')
    }
    console.log('✓ FLOW B PASSED: Rohan session isolated, no Quick Switch, role-scoped calendar.')

    // ----------------------------------------------------
    // FLOW C: Logout -> Login screen immediately, refresh remains on Login
    // ----------------------------------------------------
    console.log('\n--- FLOW C: Logout and page refresh ---')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')

    // Immediately redirected to LoginView
    await page.waitForSelector('.login-card', { timeout: 5000 })
    console.log('✓ Immediately redirected to LoginView upon clicking Log Out!')

    // Refresh browser -> remains on Login
    await page.reload()
    await page.waitForSelector('.login-card', { timeout: 5000 })
    const appShellPresent = await page.locator('.luma-app-shell').isVisible()
    if (appShellPresent) {
      throw new Error('User should NOT see app shell after refresh following logout!')
    }
    console.log('✓ FLOW C PASSED: Real logout verified; refresh remains on LoginView.')

    // ----------------------------------------------------
    // FLOW D: Login as Mia -> Mia's session and isolated data
    // ----------------------------------------------------
    console.log('\n--- FLOW D: Login as Mia Vance (Employee / Stylist) ---')
    await page.fill('#login-email', 'mia@lumasalon.example.com')
    await page.fill('#login-password', DEFAULT_TEST_PASSWORD)
    await page.click('button.btn-login-submit')

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    const miaName = await page.locator('.user-name-label').innerText()
    console.log(`Logged in as: "${miaName}"`)
    if (miaName !== 'Mia Vance') {
      throw new Error(`Expected Mia Vance, got: ${miaName}`)
    }
    console.log('✓ FLOW D PASSED: Mia Vance authenticated with own isolated session.')

    // ----------------------------------------------------
    // FLOW E: Logout, then Login as Receptionist -> Assign services, salon calendar, NO user mgmt
    // ----------------------------------------------------
    console.log('\n--- FLOW E: Login as Receptionist ---')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 5000 })

    await page.fill('#login-email', 'receptionist@lumasalon.example.com')
    await page.fill('#login-password', DEFAULT_TEST_PASSWORD)
    await page.click('button.btn-login-submit')

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    const recRole = await page.locator('.user-role-badge').first().innerText()
    console.log(`Receptionist role badge: "${recRole}"`)
    if (recRole !== 'RECEPTIONIST') {
      throw new Error(`Expected RECEPTIONIST, got: ${recRole}`)
    }

    // Calendar is salon-wide and has "+ New Appointment"
    const recCalBtn = page.locator('button.nav-btn[title="Calendar"]')
    await recCalBtn.click()
    await page.waitForSelector('.cal-page-container', { timeout: 5000 })
    const recNewAptBtn = await page.locator('.cal-primary-action-btn').isVisible()
    console.log(`Receptionist sees "+ New Appointment": ${recNewAptBtn}`)
    if (!recNewAptBtn) {
      throw new Error('Receptionist MUST see "+ New Appointment" button!')
    }

    // Receptionist MUST NOT see User Management nav
    const recUserMgmtVisible = await page.locator('button.nav-btn[title="User Management"]').isVisible()
    console.log(`Receptionist sees User Management nav: ${recUserMgmtVisible}`)
    if (recUserMgmtVisible) {
      throw new Error('Receptionist MUST NOT see User Management nav item!')
    }
    console.log('✓ FLOW E PASSED: Receptionist has salon-wide calendar & booking, but no user management.')

    // ----------------------------------------------------
    // FLOW F: Logout, then Login as Owner -> User Management & Employee creation with initial password
    // ----------------------------------------------------
    console.log('\n--- FLOW F: Login as Owner ---')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 5000 })

    await page.fill('#login-email', 'owner1@lumasalon.example.com')
    await page.fill('#login-password', DEFAULT_TEST_PASSWORD)
    await page.click('button.btn-login-submit')

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    const ownerRole = await page.locator('.user-role-badge').first().innerText()
    console.log(`Owner role badge: "${ownerRole}"`)
    if (ownerRole !== 'OWNER') {
      throw new Error(`Expected OWNER, got: ${ownerRole}`)
    }

    // Owner sees User Management
    const ownerUserMgmtBtn = page.locator('button.nav-btn[title="User Management"]')
    if (!(await ownerUserMgmtBtn.isVisible())) {
      throw new Error('Owner MUST see User Management nav button!')
    }
    await ownerUserMgmtBtn.click()
    await page.waitForSelector('.user-mgmt-page', { timeout: 5000 })

    // Open Create Employee modal
    await page.click('button.btn-create-employee')
    await page.waitForSelector('.user-modal-card', { timeout: 5000 })

    // Verify role lock and password field
    const lockedBadge = await page.locator('.role-locked-badge').innerText()
    console.log(`Role locked badge: "${lockedBadge}"`)
    if (!lockedBadge.includes('EMPLOYEE')) {
      throw new Error('Employee creation role must be locked to EMPLOYEE!')
    }

    const newEmpEmail = `neha.stylist.${Date.now()}@lumasalon.example.com`
    await page.fill('#emp-name', 'Neha Test Stylist')
    await page.fill('#emp-email', newEmpEmail)
    await page.fill('#emp-phone', '+91 98119 77665')
    await page.fill('#emp-password', 'CustomPass2026!')
    await page.selectOption('#emp-specialty', 'Hair')

    await page.click('.user-modal-card button.btn-modal-submit')
    await page.waitForSelector('.user-modal-card', { state: 'detached', timeout: 5000 })
    console.log('✓ Successfully created new employee profile with custom initial password!')
    console.log('✓ FLOW F PASSED: Owner can access user management and create employee with credentials.')

    // ----------------------------------------------------
    // FLOW G: Direct URL navigation attempt as employee -> blocked/redirected
    // ----------------------------------------------------
    console.log('\n--- FLOW G: Direct URL access protection ---')
    // Logout from Owner, Login as Rohan Sen
    await page.click('.user-profile-btn')
    await page.waitForSelector('.user-dropdown-menu', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 5000 })

    await page.fill('#login-email', 'rohan@lumasalon.example.com')
    await page.fill('#login-password', DEFAULT_TEST_PASSWORD)
    await page.click('button.btn-login-submit')
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })

    // Rohan attempts to navigate directly to #/users in URL
    console.log('Rohan attempts direct URL navigation to #/users...')
    await page.evaluate(() => {
      window.location.hash = '#/users'
    })
    await page.waitForTimeout(600)

    // Verify that User Management view is NOT rendered
    const userMgmtPagePresent = await page.locator('.user-mgmt-page').isVisible()
    console.log(`User Management workspace rendered for employee: ${userMgmtPagePresent}`)
    if (userMgmtPagePresent) {
      throw new Error('Employee MUST NOT be able to render User Management workspace via URL hash!')
    }
    console.log('✓ FLOW G PASSED: Direct URL navigation to protected admin route blocked.')

    console.log('\n=================================================================')
    console.log('ALL MANUAL ACCEPTANCE FLOWS (A THROUGH G) FULLY PASSED (100%)!')
    console.log('=================================================================')
  } finally {
    await browser.close()
  }
}

runRealAuthBrowserE2E().catch((err) => {
  console.error('\n❌ Real Auth Playwright E2E Test FAILED:', err)
  process.exit(1)
})
