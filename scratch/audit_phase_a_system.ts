/**
 * Luma Salon — Phase A: System & Database Comprehensive Audit Script (Refined)
 */

import fs from 'node:fs'
import path from 'node:path'

const SQL_IMPORT_PATH = path.resolve(process.cwd(), 'supabase/scripts/final_import_phase14_2_1.sql')

interface UserRow {
  id: string
  salon_id: string
  name: string
  email: string
  role: string
  employee_id: string | null
  active: boolean
}

interface StaffRow {
  id: string
  salon_id: string
  name: string
  phone: string
  email: string
  role: string
  active: boolean
}

interface AppointmentRow {
  id: string
  client_id: string
  staff_id: string
  service_id: string
  date: string
  start_time: string
  end_time: string
  status: string
  client_name: string
  staff_name: string
  service_name: string
}

function runPhaseAAudit() {
  console.log('=================================================================')
  console.log('LUMA SALON — PHASE A: SYSTEM & DATABASE COMPREHENSIVE AUDIT')
  console.log('=================================================================')

  const content = fs.readFileSync(SQL_IMPORT_PATH, 'utf8')

  // 1. Parse Users (23)
  const users: UserRow[] = []
  const userRegex = /INSERT INTO public\.users \([^\)]+\)\s+VALUES \('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)',\s*([^,\)]+),\s*([^,\)]+),\s*([^\)]+)\);/g
  let match: RegExpExecArray | null
  while ((match = userRegex.exec(content)) !== null) {
    const rawEmp = match[6].trim()
    users.push({
      id: match[1],
      salon_id: match[2],
      name: match[3],
      email: match[4],
      role: match[5],
      employee_id: rawEmp === 'NULL' ? null : rawEmp.replace(/^'|'$/g, ''),
      active: match[8].trim() === 'true',
    })
  }

  // 2. Parse Staff (20)
  const staff: StaffRow[] = []
  const staffRegex = /INSERT INTO public\.staff \([^\)]+\)\s+VALUES \('([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)',/g
  while ((match = staffRegex.exec(content)) !== null) {
    staff.push({
      id: match[1],
      salon_id: match[2],
      name: match[3],
      phone: match[4],
      email: match[5],
      role: match[6],
      active: true,
    })
  }

  // 3. Parse Appointments (18)
  const appts: AppointmentRow[] = []
  const apptLines = content.split('\n').filter(line => line.startsWith('VALUES (\'apt-'))
  for (const line of apptLines) {
    const rawVals = line.replace(/^VALUES \(/, '').replace(/\);$/, '')
    // Split by comma ignoring quotes
    const vals = rawVals.split(/,\s*(?=(?:[^']*'[^']*')*[^']*$)/).map(s => s.trim().replace(/^'|'$/g, ''))
    appts.push({
      id: vals[0],
      client_id: vals[2],
      staff_id: vals[3],
      service_id: vals[5],
      date: vals[6],
      start_time: vals[7],
      end_time: vals[8],
      status: vals[9],
      client_name: vals[15],
      staff_name: vals[18],
      service_name: vals[19],
    })
  }

  console.log(`\n1. CURRENT IMPORTED RECORD COUNTS:`)
  console.log(`- Salons:       1`)
  console.log(`- Services:     10`)
  console.log(`- Clients:      14`)
  console.log(`- Users:        ${users.length}`)
  console.log(`- Staff:        ${staff.length}`)
  console.log(`- Appointments: ${appts.length}`)

  // Staff Appointments Distribution
  const staffApptCounts: Record<string, { count: number; name: string; staffNameSnapshot: string }> = {}
  for (const a of appts) {
    if (!staffApptCounts[a.staff_id]) {
      const s = staff.find(st => st.id === a.staff_id)
      staffApptCounts[a.staff_id] = { count: 0, name: s?.name || 'Unknown', staffNameSnapshot: a.staff_name }
    }
    staffApptCounts[a.staff_id].count++
  }
  console.log(`\n2. STAFF APPOINTMENT LINKAGE DISTRIBUTION:`)
  for (const [staffId, info] of Object.entries(staffApptCounts)) {
    console.log(`- ${staffId} (${info.name}): ${info.count} appointment(s). Snapshot: '${info.staffNameSnapshot}'`)
  }

  // 3. New Master Staff List definition
  const newMasterList = [
    { num: 1, name: 'Riya Balodi', gender: 'Female', jobTitle: 'Salon Manager', isOwner: false, ownerDesignation: null },
    { num: 2, name: 'Priya', gender: 'Female', jobTitle: 'Assistant Salon Manager', isOwner: false, ownerDesignation: null },
    { num: 3, name: 'Rajesh', gender: 'Male', jobTitle: 'Premium Hair Stylist', isOwner: true, ownerDesignation: 'OWNER_1' },
    { num: 4, name: 'Farhaan', gender: 'Male', jobTitle: 'Hair Stylist', isOwner: false, ownerDesignation: null },
    { num: 5, name: 'Ashu', gender: 'Male', jobTitle: 'Hair Stylist', isOwner: false, ownerDesignation: null },
    { num: 6, name: 'Upender', gender: 'Male', jobTitle: 'Hair Stylist', isOwner: false, ownerDesignation: null },
    { num: 7, name: 'Niketa Kaushik', gender: 'Female', jobTitle: 'Make Up Artist', isOwner: true, ownerDesignation: 'OWNER_2' },
    { num: 8, name: 'Tarun Goswami', gender: 'Male', jobTitle: 'Senior Salon Assistant', isOwner: false, ownerDesignation: null },
    { num: 9, name: 'Dev', gender: 'Male', jobTitle: 'Assistant', isOwner: false, ownerDesignation: null },
    { num: 10, name: 'Sushma', gender: 'Female', jobTitle: 'Assistant', isOwner: false, ownerDesignation: null },
    { num: 11, name: 'Soni', gender: 'Male', jobTitle: 'Assistant', isOwner: false, ownerDesignation: null },
    { num: 12, name: 'Nima', gender: 'Female', jobTitle: 'Assistant', isOwner: false, ownerDesignation: null },
    { num: 13, name: 'Sohan', gender: 'Male', jobTitle: 'Pedicurist', isOwner: false, ownerDesignation: null },
    { num: 14, name: 'Sujit', gender: 'Male', jobTitle: 'Pedicurist', isOwner: false, ownerDesignation: null },
    { num: 15, name: 'Deepak', gender: 'Male', jobTitle: 'Pedicurist', isOwner: false, ownerDesignation: null },
    { num: 16, name: 'Pooja', gender: 'Female', jobTitle: 'Beautician', isOwner: false, ownerDesignation: null },
    { num: 17, name: 'Meena', gender: 'Female', jobTitle: 'Beautician', isOwner: false, ownerDesignation: null },
    { num: 18, name: 'Sapna', gender: 'Female', jobTitle: 'Nail Artist', isOwner: false, ownerDesignation: null },
  ]

  console.log(`\n3. NEW MASTER LIST: ${newMasterList.length} members`)
  console.log(`- Owners: ${newMasterList.filter(m => m.isOwner).map(m => `${m.name} (${m.ownerDesignation})`).join(', ')}`)
  console.log(`- Non-Owners: ${newMasterList.filter(m => !m.isOwner).length} members`)

  // Role Breakdown of current users
  const roleBreakdown: Record<string, number> = {}
  for (const u of users) {
    roleBreakdown[u.role] = (roleBreakdown[u.role] || 0) + 1
  }
  console.log(`\n4. CURRENT USER ROLES BREAKDOWN:`, roleBreakdown)

  // Critical Finding: How Rajesh (Owner 1) and Niketa Kaushik (Owner 2) connect to staff
  console.log(`\n5. OWNER LINKAGE ANALYSIS:`)
  console.log(`- Currently in public.users: user-owner-01 ('Owner 1') has employee_id = NULL`)
  console.log(`- Currently in public.users: user-owner-02 ('Owner 2') has employee_id = NULL`)
  console.log(`- In new master list: Rajesh is Owner 1 & Premium Hair Stylist (requires staff record linkage!)`)
  console.log(`- In new master list: Niketa Kaushik is Owner 2 & Make Up Artist (requires staff record linkage!)`)
}

runPhaseAAudit()
