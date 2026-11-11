import { webkit } from 'playwright'

const DEFAULT_TEST_PASSWORD = 'Luma@2026!'

async function runPhase12HardeningE2E() {
  console.log('=================================================================')
  console.log('PLAYWRIGHT E2E BROWSER TEST: PHASE 12.1 HARDENING (FLOWS A - J)')
  console.log('=================================================================\n')

  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  // Track console errors and unhandled rejections for Flow J
  const consoleErrors = []
  const pageErrors = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      // Ignore favicon or non-critical resource 404s if any
      if (!text.includes('favicon.ico')) {
        console.warn(`[Browser Console Error] ${text}`)
        consoleErrors.push(text)
      }
    }
  })

  page.on('pageerror', (err) => {
    console.error(`[Browser Page Error] ${err.message}`)
    pageErrors.push(err.message)
  })

  try {
    // ----------------------------------------------------
    // INITIAL SETUP: Navigate to app and log in as Owner
    // ----------------------------------------------------
    console.log('--- SETUP: Navigate & Login as Owner ---')
    await page.goto('http://127.0.0.1:5173/')
    await page.waitForSelector('.login-card', { timeout: 8000 })

    await page.locator('#login-email').fill('owner1@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✅ Authenticated as Owner 1')

    // ----------------------------------------------------
    // FLOW A: Create unassigned Client -> verify visible -> delete -> reload -> verify NOT present
    // ----------------------------------------------------
    console.log('\n--- FLOW A: Unassigned Client create -> delete -> reload verification ---')
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })

    await page.click('button.add-client-btn')
    await page.waitForSelector('.client-modal-card', { timeout: 5000 })

    const clientNameA = `FlowA Client ${Date.now()}`
    await page.locator('#client-name').fill(clientNameA)
    await page.locator('#client-phone').fill('+91 91111 22222')
    await page.locator('#client-email').fill('flowa.client@example.com')
    await page.click('.modal-btn.submit-btn')

    // Wait for client to appear
    await page.waitForSelector(`.clients-table tr:has-text("${clientNameA}")`, { timeout: 6000 })
    console.log(`✅ Unassigned client "${clientNameA}" created and visible`)

    // Click Delete on this client
    const clientRowA = page.locator(`.clients-table tr:has-text("${clientNameA}")`)
    await clientRowA.locator('.btn-row-delete').click()
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    // Confirm deletion
    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })
    await page.waitForSelector(`.clients-table tr:has-text("${clientNameA}")`, { state: 'detached', timeout: 6000 })
    console.log(`✅ Client "${clientNameA}" deleted in UI`)

    // Reload page and verify still NOT present
    await page.reload()
    await page.waitForSelector('.clients-page-container', { timeout: 8000 })
    const countAAfterReload = await page.locator(`.clients-table tr:has-text("${clientNameA}")`).count()
    if (countAAfterReload > 0) {
      throw new Error(`Flow A FAILED: Client "${clientNameA}" reappeared after page reload!`)
    }
    console.log('✅ FLOW A PASSED: Client remains permanently deleted after reload.')

    // ----------------------------------------------------
    // FLOW B: Create unassigned Service -> verify visible -> delete -> reload -> verify NOT present
    // ----------------------------------------------------
    console.log('\n--- FLOW B: Unassigned Service create -> delete -> reload verification ---')
    await page.click('button.nav-btn[title="Services"]')
    await page.waitForSelector('.services-workspace', { timeout: 6000 })

    await page.click('button.add-service-btn')
    await page.waitForSelector('.service-modal-card', { timeout: 5000 })

    const serviceNameB = `FlowB Service ${Date.now()}`
    await page.locator('#service-name').fill(serviceNameB)
    await page.locator('#service-category').selectOption('haircut')
    await page.locator('#service-duration').fill('35')
    await page.locator('#service-price').fill('450')
    await page.click('.service-modal-card .modal-btn.submit-btn')

    // Wait for service card to appear
    await page.waitForSelector(`.service-card:has-text("${serviceNameB}")`, { timeout: 6000 })
    console.log(`✅ Service "${serviceNameB}" created and visible`)

    // Delete service
    const serviceCardB = page.locator(`.service-card:has-text("${serviceNameB}")`)
    await serviceCardB.locator('.service-delete-btn').click()
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })
    await page.waitForSelector(`.service-card:has-text("${serviceNameB}")`, { state: 'detached', timeout: 6000 })
    console.log(`✅ Service "${serviceNameB}" deleted in UI`)

    // Reload page and verify still NOT present
    await page.reload()
    await page.waitForSelector('.services-workspace', { timeout: 8000 })
    const countBAfterReload = await page.locator(`.service-card:has-text("${serviceNameB}")`).count()
    if (countBAfterReload > 0) {
      throw new Error(`Flow B FAILED: Service "${serviceNameB}" reappeared after page reload!`)
    }
    console.log('✅ FLOW B PASSED: Service remains permanently deleted after reload.')

    // ----------------------------------------------------
    // FLOW C: Create new Receptionist -> login -> logout -> login Owner -> delete Receptionist -> reload -> verify absent & cannot login
    // ----------------------------------------------------
    console.log('\n--- FLOW C: Receptionist lifecycle (Create, Login, Delete, Reload, Auth lock) ---')
    await page.click('button.nav-btn[title="User Management"]')
    await page.waitForSelector('.user-mgmt-page', { timeout: 6000 })

    await page.click('button.btn-create-employee')
    await page.waitForSelector('.user-modal-card', { timeout: 5000 })

    const recEmail = `rec.flowc.${Date.now()}@lumasalon.example.com`
    const recName = 'FlowC Receptionist'
    const recPassword = 'FlowCPassword123!'

    await page.locator('#emp-name').fill(recName)
    await page.locator('#emp-email').fill(recEmail)
    await page.locator('#emp-phone').fill('+91 97777 66666')
    await page.locator('#emp-role').selectOption('RECEPTIONIST')
    await page.locator('#emp-password').fill(recPassword)
    await page.click('button.btn-modal-submit')

    // Wait for row
    await page.waitForSelector(`tr:has-text("${recName}")`, { timeout: 6000 })
    console.log(`✅ Receptionist "${recName}" created and visible in User Management roster`)

    // Log out of Owner
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })
    console.log('✅ Logged out from Owner')

    // Log in as newly created Receptionist
    await page.locator('#login-email').fill(recEmail)
    await page.locator('#login-password').fill(recPassword)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })

    const roleBadge = await page.locator('.user-role-badge').innerText()
    console.log(`✅ Logged in as newly created Receptionist. Role badge: "${roleBadge}"`)
    if (!roleBadge.toUpperCase().includes('RECEPTIONIST')) {
      throw new Error(`Expected role badge RECEPTIONIST, got: ${roleBadge}`)
    }

    // Log out of Receptionist
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    // Log back in as Owner
    await page.locator('#login-email').fill('owner1@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })

    // Navigate to User Management
    await page.click('button.nav-btn[title="User Management"]')
    await page.waitForSelector('.user-mgmt-page', { timeout: 6000 })

    // Delete the newly created Receptionist
    const recRow = page.locator(`tr:has-text("${recEmail}")`)
    await recRow.locator('button.btn-user-delete').click()
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })
    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })
    await page.waitForSelector(`tr:has-text("${recEmail}")`, { state: 'detached', timeout: 6000 })
    console.log(`✅ Receptionist "${recName}" deleted by Owner`)

    // Reload page and verify still NOT present
    await page.reload()
    await page.waitForSelector('.user-mgmt-page', { timeout: 8000 })
    const countRecAfterReload = await page.locator(`tr:has-text("${recEmail}")`).count()
    if (countRecAfterReload > 0) {
      throw new Error(`Flow C FAILED: Receptionist "${recName}" reappeared after reload!`)
    }
    console.log('✅ Receptionist confirmed absent after reload')

    // Logout and verify deleted Receptionist CANNOT log in
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    await page.locator('#login-email').fill(recEmail)
    await page.locator('#login-password').fill(recPassword)
    await page.locator('button.btn-login-submit').click()

    await page.waitForSelector('.login-error-alert', { timeout: 5000 })
    const loginErrorText = await page.locator('.login-error-alert').innerText()
    console.log(`✅ Login attempt for deleted Receptionist correctly rejected: "${loginErrorText}"`)
    console.log('✅ FLOW C PASSED: Receptionist created, logged in, deleted, verified absent and locked out.')

    // Re-login as Owner for remaining flows
    await page.locator('#login-email').fill('owner1@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })

    // ----------------------------------------------------
    // FLOW D: Attempt to delete Client who has appointments -> verify blocked in UI
    // ----------------------------------------------------
    console.log('\n--- FLOW D: Attempt to delete Client with appointments ---')
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })

    // Priya Sharma has appointments
    const priyaRow = page.locator('tr:has-text("Priya Sharma")')
    await page.waitForSelector('tr:has-text("Priya Sharma")', { timeout: 6000 })
    const priyaDeleteBtn = priyaRow.locator('.btn-row-delete')
    const isPriyaDeleteDisabled = await priyaDeleteBtn.isDisabled()
    const priyaTooltip = await priyaDeleteBtn.getAttribute('title')
    console.log(`Priya Sharma delete button disabled: ${isPriyaDeleteDisabled}, title: "${priyaTooltip}"`)

    if (!isPriyaDeleteDisabled) {
      throw new Error('Flow D FAILED: Delete button for client with appointment history is NOT disabled!')
    }
    if (!priyaTooltip.includes('Cannot delete this client because appointment history exists')) {
      throw new Error(`Flow D FAILED: Unexpected tooltip on disabled client delete button: "${priyaTooltip}"`)
    }
    console.log('✅ FLOW D PASSED: Delete action for client with appointments is strictly blocked in UI.')

    // ----------------------------------------------------
    // FLOW E: Attempt to delete Service with appointments -> verify blocked in UI
    // ----------------------------------------------------
    console.log('\n--- FLOW E: Attempt to delete Service with appointments ---')
    await page.click('button.nav-btn[title="Services"]')
    await page.waitForSelector('.services-workspace', { timeout: 6000 })

    // Haircut & Blowdry has appointments
    const haircutCard = page.locator('.service-card:has-text("Haircut & Blowdry")')
    await page.waitForSelector('.service-card:has-text("Haircut & Blowdry")', { timeout: 6000 })
    const haircutDeleteBtn = haircutCard.locator('.service-delete-btn')
    const isHaircutDeleteDisabled = await haircutDeleteBtn.isDisabled()
    const haircutTooltip = await haircutDeleteBtn.getAttribute('title')
    console.log(`Haircut & Blowdry delete button disabled: ${isHaircutDeleteDisabled}, title: "${haircutTooltip}"`)

    if (!isHaircutDeleteDisabled) {
      throw new Error('Flow E FAILED: Delete button for service with appointments is NOT disabled!')
    }
    if (!haircutTooltip.includes('Cannot delete this service because appointment history exists')) {
      throw new Error(`Flow E FAILED: Unexpected tooltip on disabled service delete button: "${haircutTooltip}"`)
    }
    console.log('✅ FLOW E PASSED: Delete action for service with appointments is strictly blocked in UI.')

    // ----------------------------------------------------
    // FLOW F: Attempt to delete Employee with appointments -> verify blocked in UI
    // ----------------------------------------------------
    console.log('\n--- FLOW F: Attempt to delete Employee with appointments ---')
    await page.click('button.nav-btn[title="User Management"]')
    await page.waitForSelector('.user-mgmt-page', { timeout: 6000 })

    // Mia Vance has appointments
    const miaRow = page.locator('tr:has-text("Mia Vance")')
    await page.waitForSelector('tr:has-text("Mia Vance")', { timeout: 6000 })
    const miaDeleteBtn = miaRow.locator('button.btn-user-delete')
    const isMiaDeleteDisabled = await miaDeleteBtn.isDisabled()
    const miaTooltip = await miaDeleteBtn.getAttribute('title')
    console.log(`Mia Vance delete button disabled: ${isMiaDeleteDisabled}, title: "${miaTooltip}"`)

    if (!isMiaDeleteDisabled) {
      throw new Error('Flow F FAILED: Delete button for employee with appointments is NOT disabled!')
    }
    if (!miaTooltip.includes('Cannot delete this employee because appointment history exists')) {
      throw new Error(`Flow F FAILED: Unexpected tooltip on disabled employee delete button: "${miaTooltip}"`)
    }
    console.log('✅ FLOW F PASSED: Delete action for employee with appointments is strictly blocked in UI.')

    // ----------------------------------------------------
    // FLOW G: Select multiple unassigned records -> bulk delete -> verify success -> reload -> verify absent
    // ----------------------------------------------------
    console.log('\n--- FLOW G: Bulk delete multiple unassigned records ---')
    // Create 2 temporary unassigned clients
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })

    const bulkG1 = `BulkG Client 1 ${Date.now()}`
    const bulkG2 = `BulkG Client 2 ${Date.now()}`

    // Create bulkG1
    await page.click('button.add-client-btn')
    await page.waitForSelector('.client-modal-card', { timeout: 5000 })
    await page.locator('#client-name').fill(bulkG1)
    await page.locator('#client-phone').fill('+91 93333 11111')
    await page.click('.modal-btn.submit-btn')
    await page.waitForSelector(`tr:has-text("${bulkG1}")`, { timeout: 6000 })

    // Create bulkG2
    await page.click('button.add-client-btn')
    await page.waitForSelector('.client-modal-card', { timeout: 5000 })
    await page.locator('#client-name').fill(bulkG2)
    await page.locator('#client-phone').fill('+91 93333 22222')
    await page.click('.modal-btn.submit-btn')
    await page.waitForSelector(`tr:has-text("${bulkG2}")`, { timeout: 6000 })

    // Select both via checkbox
    const rowG1 = page.locator(`tr:has-text("${bulkG1}")`)
    const rowG2 = page.locator(`tr:has-text("${bulkG2}")`)
    await rowG1.locator('.row-select-checkbox').click()
    await rowG2.locator('.row-select-checkbox').click()

    // Bulk bar
    await page.waitForSelector('.bulk-action-bar', { timeout: 5000 })
    await page.click('#bulk-delete-action-btn')
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    // Confirm bulk delete
    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })
    await page.waitForSelector(`tr:has-text("${bulkG1}")`, { state: 'detached', timeout: 6000 })
    await page.waitForSelector(`tr:has-text("${bulkG2}")`, { state: 'detached', timeout: 6000 })
    console.log('✅ Bulk deleted 2 unassigned clients in UI')

    // Reload and verify absent
    await page.reload()
    await page.waitForSelector('.clients-page-container', { timeout: 8000 })
    const g1Count = await page.locator(`tr:has-text("${bulkG1}")`).count()
    const g2Count = await page.locator(`tr:has-text("${bulkG2}")`).count()
    if (g1Count > 0 || g2Count > 0) {
      throw new Error('Flow G FAILED: Bulk-deleted clients reappeared after reload!')
    }
    console.log('✅ FLOW G PASSED: Bulk-deleted unassigned records remain permanently deleted after reload.')

    // ----------------------------------------------------
    // FLOW H: Select records where at least one has appointment history -> attempt bulk delete -> verify blocked
    // ----------------------------------------------------
    console.log('\n--- FLOW H: Bulk delete containing appointment history record is blocked ---')
    // Create one unassigned client
    const bulkHClean = `Clean Client H ${Date.now()}`
    await page.click('button.add-client-btn')
    await page.waitForSelector('.client-modal-card', { timeout: 5000 })
    await page.locator('#client-name').fill(bulkHClean)
    await page.locator('#client-phone').fill('+91 94444 33333')
    await page.click('.modal-btn.submit-btn')
    await page.waitForSelector(`tr:has-text("${bulkHClean}")`, { timeout: 6000 })

    // Select Clean Client H AND Priya Sharma (who has appointment history)
    const rowClean = page.locator(`tr:has-text("${bulkHClean}")`)
    const rowReferenced = page.locator('tr:has-text("Priya Sharma")')

    await rowClean.locator('.row-select-checkbox').click()
    await rowReferenced.locator('.row-select-checkbox').click()

    await page.waitForSelector('.bulk-action-bar', { timeout: 5000 })
    await page.click('#bulk-delete-action-btn')
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    // Confirm bulk delete
    await page.click('#delete-modal-confirm-btn')

    // Verify error banner is shown in modal
    await page.waitForSelector('.delete-modal-error-banner', { timeout: 5000 })
    const bulkErrorText = await page.locator('.delete-modal-error-banner').innerText()
    console.log(`✅ Bulk deletion correctly blocked with message: "${bulkErrorText}"`)
    if (!bulkErrorText.includes('Cannot delete clients because appointment history exists')) {
      throw new Error(`Flow H FAILED: Unexpected error message: "${bulkErrorText}"`)
    }

    // Cancel modal
    await page.click('#delete-modal-cancel-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })

    // Verify Clean Client H was NOT deleted (atomic safety)
    const cleanStillExists = await page.locator(`tr:has-text("${bulkHClean}")`).count()
    if (cleanStillExists === 0) {
      throw new Error('Flow H FAILED: Clean client was deleted despite bulk operation being blocked!')
    }
    console.log('✅ Clean client safely preserved after blocked bulk operation')
    console.log('✅ FLOW H PASSED: Bulk delete blocked atomically when referencing appointment records.')

    // ----------------------------------------------------
    // FLOW I: Verify non-owners cannot delete anything
    // ----------------------------------------------------
    console.log('\n--- FLOW I: Non-owners cannot delete anything ---')
    // Logout from Owner
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    // Login as Employee (Rohan Sen)
    await page.locator('#login-email').fill('rohan@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✅ Authenticated as Employee (Rohan Sen)')

    // 1. Employee cannot access User Management (button not in sidebar)
    const empUserMgmtBtn = await page.locator('button.nav-btn[title="User Management"]').count()
    console.log(`User Management button in Employee sidebar: ${empUserMgmtBtn}`)
    if (empUserMgmtBtn > 0) {
      throw new Error('Flow I FAILED: Employee has access to User Management navigation!')
    }

    // 2. Employee in Clients view has NO delete buttons or select checkboxes
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })
    const empClientDeleteControls = await page.locator('.row-select-checkbox, .btn-row-delete').count()
    console.log(`Delete controls in Employee Clients view: ${empClientDeleteControls}`)
    if (empClientDeleteControls > 0) {
      throw new Error('Flow I FAILED: Employee has delete controls in Clients view!')
    }

    // 3. Employee in Services view has NO delete buttons or checkboxes
    await page.click('button.nav-btn[title="My Services"], button.nav-btn[title="Services"]')
    await page.waitForSelector('.services-workspace', { timeout: 6000 })
    const empServiceDeleteControls = await page.locator('.service-select-checkbox, .service-delete-btn').count()
    console.log(`Delete controls in Employee Services view: ${empServiceDeleteControls}`)
    if (empServiceDeleteControls > 0) {
      throw new Error('Flow I FAILED: Employee has delete controls in Services view!')
    }
    console.log('✅ FLOW I PASSED: Non-owners have 0 delete controls across all salon views.')

    // ----------------------------------------------------
    // FLOW J: 0 console errors and 0 unhandled promise rejections
    // ----------------------------------------------------
    console.log('\n--- FLOW J: Console & Runtime Stability Audit ---')
    console.log(`Recorded Browser Console Errors: ${consoleErrors.length}`)
    console.log(`Recorded Browser Page Errors: ${pageErrors.length}`)

    if (consoleErrors.length > 0) {
      throw new Error(`Flow J FAILED: Detected ${consoleErrors.length} browser console errors:\n${consoleErrors.join('\n')}`)
    }
    if (pageErrors.length > 0) {
      throw new Error(`Flow J FAILED: Detected ${pageErrors.length} page/runtime errors:\n${pageErrors.join('\n')}`)
    }
    console.log('✅ FLOW J PASSED: 0 console errors and 0 unhandled exceptions throughout all browser tests!')

    console.log('\n=================================================================')
    console.log('🎉 ALL 10 PLAYWRIGHT E2E FLOWS (A THROUGH J) PASSED SUCCESSFULLY!')
    console.log('=================================================================\n')
  } finally {
    await browser.close()
  }
}

runPhase12HardeningE2E().catch((err) => {
  console.error('\n❌ Playwright E2E Test Suite Failed:', err)
  process.exit(1)
})
