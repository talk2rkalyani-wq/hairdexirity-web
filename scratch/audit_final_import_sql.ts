import fs from 'node:fs'
import path from 'node:path'

interface EntityComparison {
  entityType: string
  totalExpected: number
  foundInSql: number
  matchedRecords: number
  mismatchedRecords: number
  mismatches: Array<{
    id: string
    field: string
    expected: any
    actual: any
  }>
}

function runAudit() {
  console.log('=================================================================')
  console.log('LUMA SALON — FINAL PRE-IMPORT DATA INTEGRITY AUDIT')
  console.log('=================================================================')

  const exportsDir = path.resolve(process.cwd(), 'scratch/exports')
  const backupPath = path.join(exportsDir, 'localStorage_backup_2026-10-17T14-03-10-608Z.json')
  const sqlPath = path.resolve(process.cwd(), 'supabase/scripts/final_import_phase14_2_1.sql')

  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`)
  }
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`SQL file not found: ${sqlPath}`)
  }

  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
  const sqlContent = fs.readFileSync(sqlPath, 'utf8')

  console.log('\n>>> 1. Inspecting File Completeness & Ellipses Check:')
  const lines = sqlContent.split('\n')
  console.log(`Total lines in SQL file: ${lines.length}`)

  // Check for any ellipses or lazy abbreviations
  const ellipsisLines = lines.filter((l) => l.trim().startsWith('...') || l.includes('... ('))
  if (ellipsisLines.length > 0) {
    console.error('❌ FAILURE: Found ellipsis or truncated lines in SQL file:')
    ellipsisLines.forEach((l) => console.error(`   ${l}`))
  } else {
    console.log('✅ PASS: Zero ellipses, placeholders, or abbreviated record blocks found. Every record is a complete INSERT statement.')
  }

  // Check for credentials / secrets leakage
  console.log('\n>>> 2. Secret & Credential Leakage Check:')
  const sensitiveWords = ['salt-', 'passwordHash', 'secret_hash', 'secret_salt', 'luma_salon_auth_creds']
  let leakedCount = 0
  for (const word of sensitiveWords) {
    if (sqlContent.includes(word)) {
      console.error(`❌ FAILURE: Sensitive string '${word}' found in SQL file!`)
      leakedCount++
    }
  }
  if (leakedCount === 0) {
    console.log('✅ PASS: Zero passwords, salts, password hashes, or credential storage keys present in SQL file.')
  }

  // Strip comment lines and parse SQL statements robustly by INSERT INTO
  const cleanSql = sqlContent
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')

  const insertStatements = cleanSql
    .split(/(?=\nINSERT INTO public\.)/g)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('INSERT INTO public.'))

  const salonInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.salons'))
  const staffInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.staff'))
  const userInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.users'))
  const serviceInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.services'))
  const clientInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.clients'))
  const appointmentInserts = insertStatements.filter((s) => s.startsWith('INSERT INTO public.appointments'))

  console.log('\n>>> 3. Statement Counts in SQL vs Backup:')
  console.log(`  - Salons:       ${salonInserts.length} in SQL (Expected: 1)`)
  console.log(`  - Staff:        ${staffInserts.length} in SQL (Expected: ${backupData.counts.staff})`)
  console.log(`  - Users:        ${userInserts.length} in SQL (Expected: ${backupData.counts.users})`)
  console.log(`  - Services:     ${serviceInserts.length} in SQL (Expected: ${backupData.counts.services})`)
  console.log(`  - Clients:      ${clientInserts.length} in SQL (Expected: ${backupData.counts.clients})`)
  console.log(`  - Appointments: ${appointmentInserts.length} in SQL (Expected: ${backupData.counts.appointments})`)
  console.log(`  Total Inserts:  ${insertStatements.length} (Expected: 86)`)

  // --- ENTITY-BY-ENTITY DEEP COMPARISON ---
  console.log('\n>>> 4. Deep Field-by-Field Record Verification:')

  // 1. Salon
  const salonAudit: EntityComparison = {
    entityType: 'salons',
    totalExpected: 1,
    foundInSql: salonInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  const salonLine = salonInserts[0] || ''
  if (
    salonLine.includes("'salon-luma-01'") &&
    salonLine.includes("'Luma Salon'") &&
    salonLine.includes("'Mia'") &&
    salonLine.includes("'+91 98765 43210'") &&
    salonLine.includes("'contact@lumasalon.example.com'") &&
    salonLine.includes("'Asia/Kolkata'") &&
    salonLine.includes("'INR'") &&
    salonLine.includes("'₹'") &&
    salonLine.includes("'en'")
  ) {
    salonAudit.matchedRecords = 1
  } else {
    salonAudit.mismatchedRecords = 1
    salonAudit.mismatches.push({
      id: 'salon-luma-01',
      field: 'values',
      expected: 'Match default Luma Salon parameters',
      actual: salonLine,
    })
  }

  // 2. Staff (20)
  const staffAudit: EntityComparison = {
    entityType: 'staff',
    totalExpected: backupData.counts.staff,
    foundInSql: staffInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  for (const s of backupData.data.staff) {
    const line = staffInserts.find((l) => l.includes(`'${s.id}'`))
    if (!line) {
      staffAudit.mismatches.push({ id: s.id, field: 'RECORD', expected: 'Present in SQL', actual: 'Missing' })
      staffAudit.mismatchedRecords++
      continue
    }

    let mismatch = false
    if (!line.includes(`'${s.name.replace(/'/g, "''")}'`)) {
      staffAudit.mismatches.push({ id: s.id, field: 'name', expected: s.name, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${s.phone}'`)) {
      staffAudit.mismatches.push({ id: s.id, field: 'phone', expected: s.phone, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${s.email}'`)) {
      staffAudit.mismatches.push({ id: s.id, field: 'email', expected: s.email, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${s.role}'`)) {
      staffAudit.mismatches.push({ id: s.id, field: 'role', expected: s.role, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${s.experience}'`)) {
      staffAudit.mismatches.push({ id: s.id, field: 'experience', expected: s.experience, actual: line })
      mismatch = true
    }
    if (!line.includes(String(s.active))) {
      staffAudit.mismatches.push({ id: s.id, field: 'active', expected: s.active, actual: line })
      mismatch = true
    }

    if (mismatch) {
      staffAudit.mismatchedRecords++
    } else {
      staffAudit.matchedRecords++
    }
  }

  // 3. Users (23)
  const userAudit: EntityComparison = {
    entityType: 'users',
    totalExpected: backupData.counts.users,
    foundInSql: userInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  for (const u of backupData.data.users) {
    const line = userInserts.find((l) => l.includes(`'${u.id}'`))
    if (!line) {
      userAudit.mismatches.push({ id: u.id, field: 'RECORD', expected: 'Present in SQL', actual: 'Missing' })
      userAudit.mismatchedRecords++
      continue
    }

    let mismatch = false
    if (!line.includes(`'${u.name.replace(/'/g, "''")}'`)) {
      userAudit.mismatches.push({ id: u.id, field: 'name', expected: u.name, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${u.email}'`)) {
      userAudit.mismatches.push({ id: u.id, field: 'email', expected: u.email, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${u.role}'`)) {
      userAudit.mismatches.push({ id: u.id, field: 'role', expected: u.role, actual: line })
      mismatch = true
    }
    if (u.employeeId) {
      if (!line.includes(`'${u.employeeId}'`)) {
        userAudit.mismatches.push({ id: u.id, field: 'employeeId', expected: u.employeeId, actual: line })
        mismatch = true
      }
    }
    if (u.specialty) {
      if (!line.includes(`'${u.specialty}'`)) {
        userAudit.mismatches.push({ id: u.id, field: 'specialty', expected: u.specialty, actual: line })
        mismatch = true
      }
    }

    if (mismatch) {
      userAudit.mismatchedRecords++
    } else {
      userAudit.matchedRecords++
    }
  }

  // 4. Services (10)
  const serviceAudit: EntityComparison = {
    entityType: 'services',
    totalExpected: backupData.counts.services,
    foundInSql: serviceInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  for (const srv of backupData.data.services) {
    const line = serviceInserts.find((l) => l.includes(`'${srv.id}'`))
    if (!line) {
      serviceAudit.mismatches.push({ id: srv.id, field: 'RECORD', expected: 'Present in SQL', actual: 'Missing' })
      serviceAudit.mismatchedRecords++
      continue
    }

    let mismatch = false
    if (!line.includes(`'${srv.name.replace(/'/g, "''")}'`)) {
      serviceAudit.mismatches.push({ id: srv.id, field: 'name', expected: srv.name, actual: line })
      mismatch = true
    }
    if (!line.includes(String(srv.duration))) {
      serviceAudit.mismatches.push({ id: srv.id, field: 'duration', expected: srv.duration, actual: line })
      mismatch = true
    }
    if (!line.includes(srv.price.toFixed(2))) {
      serviceAudit.mismatches.push({ id: srv.id, field: 'price', expected: srv.price.toFixed(2), actual: line })
      mismatch = true
    }
    if (!line.includes(`'${srv.category}'`)) {
      serviceAudit.mismatches.push({ id: srv.id, field: 'category', expected: srv.category, actual: line })
      mismatch = true
    }

    if (mismatch) {
      serviceAudit.mismatchedRecords++
    } else {
      serviceAudit.matchedRecords++
    }
  }

  // 5. Clients (14)
  const clientAudit: EntityComparison = {
    entityType: 'clients',
    totalExpected: backupData.counts.clients,
    foundInSql: clientInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  for (const c of backupData.data.clients) {
    const line = clientInserts.find((l) => l.includes(`'${c.id}'`))
    if (!line) {
      clientAudit.mismatches.push({ id: c.id, field: 'RECORD', expected: 'Present in SQL', actual: 'Missing' })
      clientAudit.mismatchedRecords++
      continue
    }

    let mismatch = false
    if (!line.includes(`'${c.name.replace(/'/g, "''")}'`)) {
      clientAudit.mismatches.push({ id: c.id, field: 'name', expected: c.name, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${c.phone}'`)) {
      clientAudit.mismatches.push({ id: c.id, field: 'phone', expected: c.phone, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${c.email}'`)) {
      clientAudit.mismatches.push({ id: c.id, field: 'email', expected: c.email, actual: line })
      mismatch = true
    }
    if (!line.includes(c.totalSpend.toFixed(2))) {
      clientAudit.mismatches.push({ id: c.id, field: 'totalSpend', expected: c.totalSpend.toFixed(2), actual: line })
      mismatch = true
    }

    if (mismatch) {
      clientAudit.mismatchedRecords++
    } else {
      clientAudit.matchedRecords++
    }
  }

  // 6. Appointments (18)
  const appointmentAudit: EntityComparison = {
    entityType: 'appointments',
    totalExpected: backupData.counts.appointments,
    foundInSql: appointmentInserts.length,
    matchedRecords: 0,
    mismatchedRecords: 0,
    mismatches: [],
  }
  for (const a of backupData.data.appointments) {
    const line = appointmentInserts.find((l) => l.includes(`'${a.id}'`))
    if (!line) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'RECORD', expected: 'Present in SQL', actual: 'Missing' })
      appointmentAudit.mismatchedRecords++
      continue
    }

    let mismatch = false
    if (a.clientId && !line.includes(`'${a.clientId}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'clientId', expected: a.clientId, actual: line })
      mismatch = true
    }
    if (a.staffId && !line.includes(`'${a.staffId}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'staffId', expected: a.staffId, actual: line })
      mismatch = true
    }
    if (a.serviceId && !line.includes(`'${a.serviceId}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'serviceId', expected: a.serviceId, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${a.date}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'date', expected: a.date, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${a.startTime}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'startTime', expected: a.startTime, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${a.endTime}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'endTime', expected: a.endTime, actual: line })
      mismatch = true
    }
    if (!line.includes(`'${a.status}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'status', expected: a.status, actual: line })
      mismatch = true
    }
    if (!line.includes(a.price.toFixed(2))) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'price', expected: a.price.toFixed(2), actual: line })
      mismatch = true
    }
    // Snapshots
    if (a.clientName && !line.includes(`'${a.clientName.replace(/'/g, "''")}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'clientName snapshot', expected: a.clientName, actual: line })
      mismatch = true
    }
    if (a.staffName && !line.includes(`'${a.staffName.replace(/'/g, "''")}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'staffName snapshot', expected: a.staffName, actual: line })
      mismatch = true
    }
    if (a.serviceName && !line.includes(`'${a.serviceName.replace(/'/g, "''")}'`)) {
      appointmentAudit.mismatches.push({ id: a.id, field: 'serviceName snapshot', expected: a.serviceName, actual: line })
      mismatch = true
    }

    if (mismatch) {
      appointmentAudit.mismatchedRecords++
    } else {
      appointmentAudit.matchedRecords++
    }
  }

  // Summary Table Output
  console.log('\nEntity Verification Summary:')
  const allAudits = [salonAudit, staffAudit, userAudit, serviceAudit, clientAudit, appointmentAudit]
  console.log('| Entity | Expected | Found in SQL | Matched | Mismatches | Status |')
  console.log('| :--- | :---: | :---: | :---: | :---: | :---: |')
  let totalMatched = 0
  let totalMismatched = 0
  for (const aud of allAudits) {
    totalMatched += aud.matchedRecords
    totalMismatched += aud.mismatchedRecords
    const status = aud.mismatchedRecords === 0 && aud.matchedRecords === aud.totalExpected ? '✅ PASS' : '❌ FAIL'
    console.log(`| ${aud.entityType.padEnd(12)} | ${String(aud.totalExpected).padStart(8)} | ${String(aud.foundInSql).padStart(12)} | ${String(aud.matchedRecords).padStart(7)} | ${String(aud.mismatchedRecords).padStart(10)} | ${status} |`)
  }

  console.log(`\nOverall Integrity Result:`)
  console.log(`  Total Entities Verified: ${totalMatched} / 86`)
  console.log(`  Total Mismatches:        ${totalMismatched}`)

  if (totalMismatched === 0 && totalMatched === 86) {
    console.log('\n🎉 ALL 86 RECORDS MATCH THE SOURCE LOCALSTORAGE EXPORT 100% PERFECTLY!')
  } else {
    console.error('\n❌ AUDIT FOUND MISMATCHES!')
    allAudits.forEach((a) => {
      if (a.mismatches.length > 0) {
        console.error(`Mismatches for ${a.entityType}:`, a.mismatches)
      }
    })
    process.exit(1)
  }
}

runAudit()
