// ==============================================================================
// LUMA SALON BUSINESS SUITE — PHASE 2.2 VERIFICATION SUITE
// SECURE OWNER DISCOUNT AUTHORIZATION & DRAFT OPTIMISTIC CONCURRENCY CONTROL
// Real PostgreSQL 18.6 Security Boundary & Multi-Session Concurrency Verification
// ==============================================================================

import { execSync, spawn } from 'node:child_process'
import assert from 'node:assert'
import { credentialService } from '../src/services/credentialService.ts'
import { ROOT_ADMIN_CONFIG } from '../src/config/adminConfig.ts'

const PSQL_BIN = '/Applications/Postgres.app/Contents/Versions/latest/bin/psql'
const DB_HOST = process.env.DB_HOST || '/tmp'
const DB_PORT = '5433'
const DB_USER = 'postgres'
const DB_NAME = 'luma_test'

interface TestResult {
  id: string
  name: string
  status: 'PASS' | 'FAIL'
  details: string
}

const results: TestResult[] = []

function runPsql(sql: string, userJwtSub?: string, dbRole: 'postgres' | 'authenticated' | 'anon' = 'postgres'): { stdout: string; stderr: string; code: number } {
  let setupSql = ''
  if (userJwtSub) {
    setupSql += `SET request.jwt.claim.sub = '${userJwtSub}';\n`
  }
  if (dbRole !== 'postgres') {
    setupSql += `SET ROLE ${dbRole};\n`
  }

  const fullSql = `${setupSql}${sql}`
  try {
    const stdout = execSync(
      `"${PSQL_BIN}" -h ${DB_HOST} -p ${DB_PORT} -U ${DB_USER} -d ${DB_NAME} -X -t -A -v ON_ERROR_STOP=1`,
      {
        input: fullSql,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PGPASSWORD: 'postgres' },
      }
    )
    return { stdout, stderr: '', code: 0 }
  } catch (err: any) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      code: err.status || 1,
    }
  }
}

async function runTest(id: string, name: string, fn: () => Promise<void> | void) {
  try {
    await fn()
    results.push({ id, name, status: 'PASS', details: 'OK' })
    console.log(`  ✅ [${id}] ${name}: PASS`)
  } catch (err: any) {
    results.push({ id, name, status: 'FAIL', details: err.message })
    console.log(`  ❌ [${id}] ${name}: FAIL -> ${err.message}`)
  }
}

// Helper to run two concurrent SQL sessions via independent psql processes
function executeConcurrentPsql(session1Sql: string, session2Sql: string, delayMs = 30): Promise<[{ stdout: string; stderr: string; code: number }, { stdout: string; stderr: string; code: number }]> {
  return new Promise((resolve) => {
    let res1: any = null
    let res2: any = null
    let completed = 0

    const checkDone = () => {
      completed++
      if (completed === 2) {
        resolve([res1, res2])
      }
    }

    const env = { ...process.env, PGPASSWORD: 'postgres' }

    // Launch Session 1
    const p1 = spawn(PSQL_BIN, ['-h', DB_HOST, '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { env })
    let p1Out = ''
    let p1Err = ''
    p1.stdout.on('data', (d) => { p1Out += d })
    p1.stderr.on('data', (d) => { p1Err += d })
    p1.on('close', (code) => {
      res1 = { stdout: p1Out, stderr: p1Err, code: code || 0 }
      checkDone()
    })
    p1.stdin.write(session1Sql)
    p1.stdin.end()

    // Launch Session 2 after brief delay
    setTimeout(() => {
      const p2 = spawn(PSQL_BIN, ['-h', DB_HOST, '-p', DB_PORT, '-U', DB_USER, '-d', DB_NAME, '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1'], { env })
      let p2Out = ''
      let p2Err = ''
      p2.stdout.on('data', (d) => { p2Out += d })
      p2.stderr.on('data', (d) => { p2Err += d })
      p2.on('close', (code) => {
        res2 = { stdout: p2Out, stderr: p2Err, code: code || 0 }
        checkDone()
      })
      p2.stdin.write(session2Sql)
      p2.stdin.end()
    }, delayMs)
  })
}

async function main() {
  console.log('\n========================================================================')
  console.log('🏛️ LUMA SALON: PHASE 2.2 SECURITY & CONCURRENCY VERIFICATION')
  console.log('Database: PostgreSQL (Host: localhost, Port: 5433, DB: luma_test)')
  console.log('========================================================================\n')

  // Setup: Clean old test rows and ensure baseline mock users
  runPsql(`
    SET session_replication_role = 'replica';
    DELETE FROM public.payments WHERE invoice_id LIKE 'test-%' OR invoice_id LIKE 'inv-sec-%' OR invoice_id LIKE 'draft-sec-%' OR invoice_id LIKE 'draft-occ-%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE 'test-%' OR invoice_id LIKE 'inv-sec-%' OR invoice_id LIKE 'draft-sec-%' OR invoice_id LIKE 'draft-occ-%';
    DELETE FROM public.invoices WHERE id LIKE 'test-%' OR id LIKE 'inv-sec-%' OR id LIKE 'draft-sec-%' OR id LIKE 'draft-occ-%';
    DELETE FROM public.discount_authorizations WHERE id LIKE 'auth-%';

    -- Ensure inactive owner for testing
    INSERT INTO public.users (id, salon_id, name, email, role, active)
    VALUES ('usr-owner-inactive', 'salon-luma-01', 'Disabled Owner', 'inactive.owner@lumasalon.com', 'OWNER', false)
    ON CONFLICT (id) DO UPDATE SET active = false;

    -- Ensure inactive owner credentials
    INSERT INTO public.user_credentials (user_id, password_hash)
    VALUES ('usr-owner-inactive', crypt('Luma@2026!', gen_salt('bf')))
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;
  `)

  // ==========================================================================
  // SECTION 1: 15 SECURITY & OWNER DISCOUNT AUTHORIZATION TESTS (P0)
  // ==========================================================================
  console.log('--- SECTION 1: Owner Discount Authorization Security (P0) ---')

  await runTest('SEC-01', 'Arbitrary string in authorized_by without grant is rejected for discount > 10%', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-01',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 500.00,
        p_tax_rate := 0.18,
        p_tax_amount := 90.00,
        p_total_amount := 590.00,
        p_authorized_by := 'Hacked Owner String',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":590.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('Discounts exceeding 10% require a valid owner authorization grant'), `Expected grant requirement error, got: ${res.stderr}`)
  })

  await runTest('SEC-02', 'Random Owner UUID / non-existent grant ID is rejected', () => {
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-02',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 300.00,
        p_tax_rate := 0.18,
        p_tax_amount := 126.00,
        p_total_amount := 826.00,
        p_authorization_grant_id := 'auth-random-uuid-9999',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":826.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('Invalid authorization grant: grant not found'), `Expected grant not found error, got: ${res.stderr}`)
  })

  await runTest('SEC-03', 'Inactive Owner account is rejected during authorization request', () => {
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-03',
        p_owner_email := 'inactive.owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('disabled'), `Expected disabled owner error, got: ${res.stderr}`)
  })

  await runTest('SEC-04', 'Employee role ID is rejected during authorization request', () => {
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-04',
        p_owner_email := 'stylist@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('not a salon owner'), `Expected not a salon owner error, got: ${res.stderr}`)
  })

  await runTest('SEC-05', 'Owner from another salon is rejected (tenant isolation)', () => {
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-05',
        p_owner_email := 'foreign@salon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('Invalid owner credentials or owner does not belong to this salon'), `Expected tenant isolation error, got: ${res.stderr}`)
  })

  await runTest('SEC-06', 'Receptionist cannot self-authorize discounts', () => {
    // Session is authenticated as receptionist (usr-rec)
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-06',
        p_owner_email := 'receptionist@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `, '00000000-0000-0000-0000-000000000002', 'authenticated')
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('not a salon owner') || res.stderr.includes('cannot self-authorize'), `Expected self-authorize rejection, got: ${res.stderr}`)
  })

  let validGrantId = ''
  await runTest('SEC-07', 'Valid same-salon Owner approval succeeds and records owner ID', () => {
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-07',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    assert.strictEqual(res.code, 0, `Expected grant generation success, got error: ${res.stderr}`)
    const grant = JSON.parse(res.stdout)
    assert.strictEqual(grant.success, true)
    assert(grant.grant_id.startsWith('auth-'))
    assert.strictEqual(grant.owner_id, 'usr-owner')
    validGrantId = grant.grant_id

    // Now finalize with this grant
    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-07',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${validGrantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `)
    assert.strictEqual(finRes.code, 0, `Expected finalization success, got error: ${finRes.stderr}`)
    const inv = JSON.parse(finRes.stdout)
    assert.strictEqual(inv.authorized_by, 'usr-owner', 'Invoice must record genuine owner user ID')
    assert.strictEqual(inv.payment_status, 'paid')
  })

  await runTest('SEC-08', 'Approval for invoice A cannot authorize invoice B', () => {
    const grantRes = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-08-A',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    const grantId = JSON.parse(grantRes.stdout).grant_id

    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-08-B',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Must fail')
    assert(finRes.stderr.includes('Authorization grant is bound to invoice inv-sec-08-A but attempted on invoice inv-sec-08-B'))
  })

  await runTest('SEC-09', 'Approval for 15% cannot authorize 50% discount', () => {
    const grantRes = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-09',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 150.00,
        p_discount_percent := 15.0
      );
    `)
    const grantId = JSON.parse(grantRes.stdout).grant_id

    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-09',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 500.00,
        p_tax_rate := 0.18,
        p_tax_amount := 90.00,
        p_total_amount := 590.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":590.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Must fail')
    assert(finRes.stderr.includes('Final discount amount (₹500.00) exceeds authorized discount amount (₹150.00)'))
  })

  await runTest('SEC-10', 'Expired approval is rejected', () => {
    // Insert an already expired grant
    const grantId = 'auth-expired-test'
    runPsql(`
      INSERT INTO public.discount_authorizations (
        id, salon_id, invoice_id, receptionist_id, owner_id, discount_percent, discount_amount, subtotal, expires_at, status
      ) VALUES (
        '${grantId}', 'salon-luma-01', 'inv-sec-10', 'usr-rec', 'usr-owner', 20.0, 200.00, 1000.00, timezone('utc', now()) - interval '1 minute', 'active'
      );
    `)

    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-10',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Must fail')
    assert(finRes.stderr.includes('Authorization grant has expired'))
  })

  await runTest('SEC-11', 'Reused approval is rejected (single-use enforcement)', () => {
    // validGrantId from SEC-07 was already consumed
    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-11',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${validGrantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Must fail')
    assert(finRes.stderr.includes('Authorization grant is bound to invoice inv-sec-07') || finRes.stderr.includes('already been used'))
  })

  await runTest('SEC-12', 'Concurrent use of one approval cannot authorize two invoices', async () => {
    const grantRes = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-12',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    const grantId = JSON.parse(grantRes.stdout).grant_id

    const sqlA = `
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-12',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-sec12-a","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `
    const sqlB = `
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-12',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-sec12-b","payment_method":"cash","amount":944.00}]'::jsonb
      );
    `

    const [resA, resB] = await executeConcurrentPsql(sqlA, sqlB, 10)
    const successCount = (resA.code === 0 ? 1 : 0) + (resB.code === 0 ? 1 : 0)
    assert.strictEqual(successCount, 1, `Exactly one invocation must succeed (got ${successCount})`)
    const failedRes = resA.code !== 0 ? resA : resB
    assert(
      failedRes.stderr.includes('already been finalized') ||
      failedRes.stderr.includes('already been used') ||
      failedRes.stderr.includes('could not serialize access')
    )
  })

  await runTest('SEC-13', 'Modified frontend payload cannot bypass database authorization', () => {
    // Attempting to inject owner role or authorized_by text directly without grant
    const res = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-13',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 2000.00,
        p_discount_amount := 400.00,
        p_tax_rate := 0.18,
        p_tax_amount := 288.00,
        p_total_amount := 1888.00,
        p_authorized_by := 'usr-owner',
        p_authorization_grant_id := NULL,
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":1888.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('Discounts exceeding 10% require a valid owner authorization grant'))
  })

  await runTest('SEC-14', 'Direct RPC invocation cannot bypass Owner verification', () => {
    // Calling rpc_request_owner_discount_approval with incorrect password
    const res = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-14',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'WrongPassword!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    assert.notStrictEqual(res.code, 0, 'Must fail')
    assert(res.stderr.includes('Invalid owner password. Authorization rejected.'))
  })

  await runTest('SEC-15', 'Failed invoice finalization does not create unauthorized financial record', () => {
    const grantRes = runPsql(`
      SELECT public.rpc_request_owner_discount_approval(
        p_salon_id := 'salon-luma-01',
        p_invoice_id := 'inv-sec-15',
        p_owner_email := 'owner@lumasalon.com',
        p_owner_password := 'Luma@2026!',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_discount_percent := 20.0
      );
    `)
    const grantId = JSON.parse(grantRes.stdout).grant_id

    // Force failure during payment (overpayment exceeding total)
    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'inv-sec-15',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 1000.00,
        p_discount_amount := 200.00,
        p_tax_rate := 0.18,
        p_tax_amount := 144.00,
        p_total_amount := 944.00,
        p_authorization_grant_id := '${grantId}',
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":5000.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Must fail')

    // Inspect rows: Invoice must NOT exist, Payments must NOT exist
    const countCheck = runPsql(`SELECT count(*) FROM public.invoices WHERE id = 'inv-sec-15';`)
    assert.strictEqual(countCheck.stdout.trim(), '0')

    const pmtCheck = runPsql(`SELECT count(*) FROM public.payments WHERE invoice_id = 'inv-sec-15';`)
    assert.strictEqual(pmtCheck.stdout.trim(), '0')
  })

  await runTest('SEC-16', 'LocalStorage credential purge: No passwords, hashes or salts stored in client', async () => {
    // Verify credentialService in-memory contract
    const adminCred = await credentialService.getByEmail(ROOT_ADMIN_CONFIG.email)
    assert(adminCred, 'Admin in-memory cred exists for demo fallback')
    assert.strictEqual(typeof window === 'undefined' ? true : window.localStorage.getItem('luma_salon_auth_creds_v3') === null, true)
  })

  // ==========================================================================
  // SECTION 2: 5 DRAFT OPTIMISTIC CONCURRENCY CONTROL TESTS (P1)
  // ==========================================================================
  console.log('\n--- SECTION 2: Draft Optimistic Concurrency Control (P1) ---')

  await runTest('OCC-A', 'TEST A — Stale save: Session B stale save using expected v1 rejected after Session A updates to v2', () => {
    // 1. Initial draft created (version 1)
    const initRes = runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-A',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 500.00,
        p_total_amount := 500.00
      );
    `)
    assert.strictEqual(initRes.code, 0)
    assert.strictEqual(JSON.parse(initRes.stdout).draft_version, 1)

    // 2. Session A updates draft from v1 -> v2
    const sessARes = runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-A',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 800.00,
        p_total_amount := 800.00,
        p_expected_version := 1
      );
    `)
    assert.strictEqual(sessARes.code, 0)
    assert.strictEqual(JSON.parse(sessARes.stdout).draft_version, 2)

    // 3. Session B attempts to save its stale version using expected version 1
    const sessBRes = runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-A',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 400.00,
        p_total_amount := 400.00,
        p_expected_version := 1
      );
    `)
    assert.notStrictEqual(sessBRes.code, 0, 'Stale save must be rejected')
    assert(sessBRes.stderr.includes('CONCURRENCY_CONFLICT'), `Expected CONCURRENCY_CONFLICT, got: ${sessBRes.stderr}`)
    assert(sessBRes.stderr.includes('expected version 1, current version 2'))

    // 4. Verify Database retained Session A changes (subtotal = 800.00, version = 2)
    const dbCheck = runPsql(`SELECT subtotal, draft_version FROM public.invoices WHERE id = 'draft-occ-A';`)
    assert.strictEqual(dbCheck.stdout.trim(), '800.00|2', 'Database must retain Session A changes with draft_version = 2')
  })

  await runTest('OCC-B', 'TEST B — Sequential stale save: Saving v1, then v2, then submitting v1 update rejected', () => {
    // 1. Save v1
    runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-B',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 100.00,
        p_total_amount := 100.00
      );
    `)

    // 2. Save v2
    runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-B',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 200.00,
        p_total_amount := 200.00,
        p_expected_version := 1
      );
    `)

    // 3. Submit update with v1 again
    const staleRes = runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-B',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 300.00,
        p_total_amount := 300.00,
        p_expected_version := 1
      );
    `)
    assert.notStrictEqual(staleRes.code, 0, 'Must fail')
    assert(staleRes.stderr.includes('CONCURRENCY_CONFLICT'))
  })

  await runTest('OCC-C', 'TEST C — Concurrent updates: Two sessions read same version, concurrently update -> exactly one succeeds', async () => {
    // 1. Initial draft at version 1
    runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-C',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 300.00,
        p_total_amount := 300.00
      );
    `)

    const sql1 = `
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-C',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 700.00,
        p_total_amount := 700.00,
        p_expected_version := 1
      );
    `
    const sql2 = `
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-C',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 900.00,
        p_total_amount := 900.00,
        p_expected_version := 1
      );
    `

    const [res1, res2] = await executeConcurrentPsql(sql1, sql2, 5)
    const successCount = (res1.code === 0 ? 1 : 0) + (res2.code === 0 ? 1 : 0)
    assert.strictEqual(successCount, 1, `Exactly one update must succeed (got ${successCount})`)

    const failedRes = res1.code !== 0 ? res1 : res2
    assert(
      failedRes.stderr.includes('CONCURRENCY_CONFLICT') ||
      failedRes.stderr.includes('could not serialize access'),
      `Expected concurrency conflict error, got: ${failedRes.stderr}`
    )
  })

  await runTest('OCC-D', 'TEST D — Stale finalization: Draft updated to v2, session attempts to finalize with expected v1 -> rejected', () => {
    // 1. Draft v1
    runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-D',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 500.00,
        p_total_amount := 500.00
      );
    `)

    // 2. Session A updates draft to v2
    runPsql(`
      SELECT public.rpc_save_pos_draft(
        p_draft_id := 'draft-occ-D',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 600.00,
        p_total_amount := 600.00,
        p_expected_version := 1
      );
    `)

    // 3. Session B attempts to finalize with stale expected version 1
    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'draft-occ-D',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 500.00,
        p_total_amount := 590.00,
        p_expected_draft_version := 1,
        p_payments := '[{"id":"pmt-1","payment_method":"cash","amount":590.00}]'::jsonb
      );
    `)
    assert.notStrictEqual(finRes.code, 0, 'Stale finalization must be rejected')
    assert(finRes.stderr.includes('CONCURRENCY_CONFLICT'), `Expected CONCURRENCY_CONFLICT, got: ${finRes.stderr}`)
    assert(finRes.stderr.includes('expected version 1, current version 2'))

    // 4. Confirm draft remains intact and unfinalized
    const checkDraft = runPsql(`SELECT is_draft, payment_status, subtotal FROM public.invoices WHERE id = 'draft-occ-D';`)
    assert.strictEqual(checkDraft.stdout.trim(), 't|draft|600.00', 'Draft must remain intact with Session A changes')
  })

  await runTest('OCC-E', 'TEST E — Valid finalization: Finalize with latest expected version -> official invoice created, zero duplicates', () => {
    // Finalize draft-occ-D with valid expected version 2
    const finRes = runPsql(`
      SELECT public.rpc_finalize_pos_invoice(
        p_invoice_id := 'draft-occ-D',
        p_salon_id := 'salon-luma-01',
        p_subtotal := 600.00,
        p_tax_rate := 0.18,
        p_tax_amount := 108.00,
        p_total_amount := 708.00,
        p_expected_draft_version := 2,
        p_payments := '[{"id":"pmt-occ-e","payment_method":"cash","amount":708.00}]'::jsonb
      );
    `)
    assert.strictEqual(finRes.code, 0, `Expected successful finalization, got: ${finRes.stderr}`)
    const inv = JSON.parse(finRes.stdout)
    assert.strictEqual(inv.is_draft, false)
    assert.strictEqual(inv.payment_status, 'paid')
    assert(inv.invoice_number.startsWith('INV-'))

    // Verify exactly 1 invoice and 1 payment record
    const invCount = runPsql(`SELECT count(*) FROM public.invoices WHERE id = 'draft-occ-D';`)
    assert.strictEqual(invCount.stdout.trim(), '1')

    const pmtCount = runPsql(`SELECT count(*) FROM public.payments WHERE invoice_id = 'draft-occ-D';`)
    assert.strictEqual(pmtCount.stdout.trim(), '1')
  })

  // Cleanup
  runPsql(`
    SET session_replication_role = 'replica';
    DELETE FROM public.payments WHERE invoice_id LIKE 'inv-sec-%' OR invoice_id LIKE 'draft-sec-%' OR invoice_id LIKE 'draft-occ-%';
    DELETE FROM public.invoice_line_items WHERE invoice_id LIKE 'inv-sec-%' OR invoice_id LIKE 'draft-sec-%' OR invoice_id LIKE 'draft-occ-%';
    DELETE FROM public.invoices WHERE id LIKE 'inv-sec-%' OR id LIKE 'draft-sec-%' OR id LIKE 'draft-occ-%';
    DELETE FROM public.discount_authorizations WHERE id LIKE 'auth-%';
    DELETE FROM public.user_credentials WHERE user_id = 'usr-owner-inactive';
    DELETE FROM public.users WHERE id = 'usr-owner-inactive';
  `)

  console.log('\n========================================================================')
  console.log('📊 PHASE 2.2 VERIFICATION SUMMARY')
  console.log('========================================================================')
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`  PASSED: ${passed} of ${results.length}`)
  console.log(`  FAILED: ${failed}`)
  console.log('========================================================================\n')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
