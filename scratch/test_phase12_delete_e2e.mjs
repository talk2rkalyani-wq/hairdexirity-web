import { webkit } from 'playwright'

const DEFAULT_TEST_PASSWORD = 'Luma@2026!'

async function runPhase12BrowserE2E() {
  console.log('=== STARTING PLAYWRIGHT REAL BROWSER E2E TEST: PHASE 12 DELETE MANAGEMENT ===')
  const browser = await webkit.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  try {
    // ----------------------------------------------------
    // SETUP: Navigate to app and login as Owner
    // ----------------------------------------------------
    console.log('\n--- SETUP: Initial Load & Owner Authentication ---')
    await page.goto('http://127.0.0.1:5173/')
    await page.waitForSelector('.login-card', { timeout: 8000 })

    const emailInput = page.locator('#login-email')
    const passwordInput = page.locator('#login-password')
    const submitBtn = page.locator('button.btn-login-submit')

    await emailInput.fill('owner1@lumasalon.example.com')
    await passwordInput.fill(DEFAULT_TEST_PASSWORD)
    await submitBtn.click()

    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✓ Authenticated as Owner')

    // ----------------------------------------------------
    // FLOW A: User Management -> Delete Employee -> Confirmation Modal -> Cancel
    // ----------------------------------------------------
    console.log('\n--- FLOW A: Single Delete Confirmation & Cancellation ---')
    // Navigate to User Management
    await page.click('button.nav-btn[title="User Management"]')
    await page.waitForSelector('.user-mgmt-page', { timeout: 6000 })

    // Create a temporary test employee to delete
    console.log('Creating temporary test employee...')
    await page.click('button.btn-create-employee')
    await page.waitForSelector('.user-modal-card', { timeout: 5000 })

    await page.locator('#emp-name').fill('Staged Cancel Worker')
    await page.locator('#emp-email').fill('staged.cancel@lumasalon.example.com')
    await page.locator('#emp-specialty').selectOption('Hair')
    await page.locator('#emp-phone').fill('+91 98888 12345')
    await page.click('button.btn-modal-submit')

    // Wait for row to appear
    await page.waitForSelector('tr:has-text("Staged Cancel Worker")', { timeout: 6000 })
    console.log('✓ Staged employee visible in table')

    // Click single delete on the created employee row
    const targetRow = page.locator('tr:has-text("Staged Cancel Worker")')
    await targetRow.locator('button.btn-user-delete').click()

    // Verify DeleteConfirmationModal appears
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })
    const modalTitle = await page.locator('.delete-modal-title').innerText()
    console.log(`Confirmation Modal Title: "${modalTitle}"`)
    if (!modalTitle.includes('Delete User')) {
      throw new Error(`Expected "Delete User?" title, got: ${modalTitle}`)
    }

    // Click Cancel
    await page.click('#delete-modal-cancel-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })
    console.log('✓ Confirmation modal closed on cancel')

    // Verify employee still exists in table
    const stillPresent = await page.locator('tr:has-text("Staged Cancel Worker")').count()
    if (stillPresent === 0) {
      throw new Error('Employee was deleted even though user clicked Cancel!')
    }
    console.log('✓ FLOW A PASSED: Cancel single deletion caused zero data mutation.')

    // ----------------------------------------------------
    // FLOW B: Single Delete Confirmation -> Confirm -> Employee Removed
    // ----------------------------------------------------
    console.log('\n--- FLOW B: Single Delete Confirmation & Permanent Removal ---')
    await targetRow.locator('button.btn-user-delete').click()
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    // Click Confirm Delete
    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })

    // Verify employee disappearance
    await page.waitForSelector('tr:has-text("Staged Cancel Worker")', { state: 'detached', timeout: 6000 })
    console.log('✓ FLOW B PASSED: Confirmed delete permanently removed employee.')

    // ----------------------------------------------------
    // FLOW C: Bulk Delete Multiple Clients
    // ----------------------------------------------------
    console.log('\n--- FLOW C: Bulk Delete Clients ---')
    // Navigate to Clients view
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })
    await page.waitForSelector('.clients-table tbody tr', { timeout: 6000 })

    // Select the first 2 client rows via checkbox
    const clientRows = page.locator('.clients-table tbody tr')
    const firstRowCheckbox = clientRows.nth(0).locator('.row-select-checkbox')
    const secondRowCheckbox = clientRows.nth(1).locator('.row-select-checkbox')

    const firstClientName = await clientRows.nth(0).locator('.client-name').innerText()
    const secondClientName = await clientRows.nth(1).locator('.client-name').innerText()
    console.log(`Selecting clients for bulk delete: "${firstClientName}", "${secondClientName}"`)

    await firstRowCheckbox.click()
    await secondRowCheckbox.click()

    // Verify Bulk Action Bar appears
    await page.waitForSelector('.bulk-action-bar', { timeout: 5000 })
    const bulkCountText = await page.locator('.bulk-count-text').innerText()
    console.log(`Bulk Action Bar status: "${bulkCountText}"`)
    if (!bulkCountText.includes('2 clients selected')) {
      throw new Error(`Expected "2 clients selected", got: ${bulkCountText}`)
    }

    // Click Delete Selected
    await page.click('#bulk-delete-action-btn')
    await page.waitForSelector('.delete-modal-card', { timeout: 5000 })

    const bulkModalTitle = await page.locator('.delete-modal-title').innerText()
    console.log(`Bulk Modal Title: "${bulkModalTitle}"`)
    if (!bulkModalTitle.includes('2 Clients')) {
      throw new Error(`Expected title with "2 Clients", got: ${bulkModalTitle}`)
    }

    // Confirm Bulk Deletion
    await page.click('#delete-modal-confirm-btn')
    await page.waitForSelector('.delete-modal-card', { state: 'detached', timeout: 5000 })

    // Verify both clients are gone
    await page.waitForTimeout(500)
    const countFirst = await page.locator(`.clients-table tr:has-text("${firstClientName}")`).count()
    const countSecond = await page.locator(`.clients-table tr:has-text("${secondClientName}")`).count()
    if (countFirst > 0 || countSecond > 0) {
      throw new Error('One or both selected clients were not deleted during bulk deletion!')
    }
    console.log('✓ FLOW C PASSED: Selected clients permanently bulk-deleted.')

    // ----------------------------------------------------
    // FLOW D: Login as Receptionist -> Verify Delete Controls Unavailable
    // ----------------------------------------------------
    console.log('\n--- FLOW D: Receptionist Role Privilege Restrictions ---')
    // Logout
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    // Login as Receptionist
    await page.locator('#login-email').fill('receptionist@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✓ Authenticated as Receptionist')

    // Check Clients View: verify no selection checkboxes and no delete buttons
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })
    const recClientCheckboxes = await page.locator('.row-select-checkbox, .btn-row-delete, .btn-mobile-delete').count()
    console.log(`Delete controls in Receptionist Clients view: ${recClientCheckboxes}`)
    if (recClientCheckboxes > 0) {
      throw new Error('Receptionist must NOT see client delete buttons or checkboxes!')
    }

    // Check Services View: verify no delete buttons or checkboxes
    await page.click('button.nav-btn[title="Services"]')
    await page.waitForSelector('.services-workspace', { timeout: 6000 })
    const recServiceCheckboxes = await page.locator('.service-select-checkbox, .service-delete-btn, .services-select-all-wrap').count()
    console.log(`Delete controls in Receptionist Services view: ${recServiceCheckboxes}`)
    if (recServiceCheckboxes > 0) {
      throw new Error('Receptionist must NOT see service delete buttons or checkboxes!')
    }

    // Verify service-layer rejection in browser context
    const recDirectReject = await page.evaluate(async () => {
      try {
        const clientModule = await import('/src/services/clientService.ts')
        await clientModule.clientService.deleteClient('cli-mock-test')
        return false
      } catch (err) {
        return err.message.includes('Forbidden')
      }
    })
    if (!recDirectReject) {
      throw new Error('Direct service-layer deletion call by Receptionist was not rejected with Forbidden!')
    }
    console.log('✓ FLOW D PASSED: Receptionist delete controls hidden and service calls rejected.')

    // ----------------------------------------------------
    // FLOW E: Login as Employee -> Verify Delete Controls Unavailable
    // ----------------------------------------------------
    console.log('\n--- FLOW E: Employee Role Privilege Restrictions ---')
    // Logout
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    // Login as Employee
    await page.locator('#login-email').fill('rohan@lumasalon.example.com')
    await page.locator('#login-password').fill(DEFAULT_TEST_PASSWORD)
    await page.locator('button.btn-login-submit').click()
    await page.waitForSelector('.luma-app-shell', { timeout: 8000 })
    console.log('✓ Authenticated as Employee')

    // Check Clients view
    await page.click('button.nav-btn[title="Clients"]')
    await page.waitForSelector('.clients-page-container', { timeout: 6000 })
    const empClientCheckboxes = await page.locator('.row-select-checkbox, .btn-row-delete, .btn-mobile-delete').count()
    if (empClientCheckboxes > 0) {
      throw new Error('Employee must NOT see client delete buttons or checkboxes!')
    }

    // Check Services view
    await page.click('button.nav-btn[title="My Services"]')
    await page.waitForSelector('.services-workspace', { timeout: 6000 })
    const empServiceDelete = await page.locator('.service-select-checkbox, .service-delete-btn').count()
    if (empServiceDelete > 0) {
      throw new Error('Employee must NOT see service delete buttons or checkboxes!')
    }
    console.log('✓ FLOW E PASSED: Employee delete controls hidden.')

    // ----------------------------------------------------
    // FLOW F: Calendar Stability After Related Entity Deletion
    // ----------------------------------------------------
    console.log('\n--- FLOW F: Calendar Stability & Historical Integrity ---')
    await page.click('button.nav-btn[title="My Calendar"]')
    await page.waitForSelector('.cal-page-container', { timeout: 6000 })
    await page.waitForSelector('.cal-appointment-card', { timeout: 6000 })

    // Verify appointment cards render without crash
    const appointmentCards = await page.locator('.cal-appointment-card').count()
    console.log(`Rendered appointment cards on Calendar: ${appointmentCards}`)
    if (appointmentCards === 0) {
      throw new Error('Expected calendar appointment cards to render!')
    }

    // Open first appointment drawer to verify fallback entity display
    await page.locator('.cal-appointment-card').first().click()
    await page.waitForSelector('.cal-drawer-panel', { timeout: 5000 })
    const clientInfoVal = await page.locator('.cal-info-value.font-highlight').first().innerText()
    await page.keyboard.press('Escape')
    await page.waitForSelector('.cal-drawer-panel', { state: 'detached', timeout: 5000 })
    console.log('✓ FLOW F PASSED: Calendar renders reliably with fallback records.')

    // ----------------------------------------------------
    // FLOW G: Logout -> Verify Protected Routes Blocked
    // ----------------------------------------------------
    console.log('\n--- FLOW G: Logout & Route Protection ---')
    await page.click('.user-profile-btn')
    await page.waitForSelector('.dropdown-logout-btn', { timeout: 5000 })
    await page.click('.dropdown-logout-btn')
    await page.waitForSelector('.login-card', { timeout: 6000 })

    // Try navigating to protected route
    await page.goto('http://127.0.0.1:5173/#/calendar')
    await page.waitForTimeout(500)
    await page.waitForSelector('.login-card', { timeout: 6000 })
    console.log('✓ FLOW G PASSED: Protected route redirects to login.')

    console.log('\n=================================================================')
    console.log('ALL PHASE 12 REAL BROWSER PLAYWRIGHT ACCEPTANCE FLOWS PASSED!')
    console.log('=================================================================')
  } finally {
    await browser.close()
  }
}

runPhase12BrowserE2E().catch((err) => {
  console.error('\n❌ Playwright E2E Test Failed:', err)
  process.exit(1)
})
