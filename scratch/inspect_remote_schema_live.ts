import fs from 'node:fs'
import path from 'node:path'

async function inspectLiveRemoteSchema() {
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  const content = fs.readFileSync(envLocalPath, 'utf8')
  let supabaseUrl = ''
  let supabaseKey = ''
  for (const line of content.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '')
    if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '')
  }

  console.log('Connecting to live Supabase project:', supabaseUrl)
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to fetch remote OpenAPI schema: HTTP ${res.status} ${res.statusText}`)
  }

  const spec = await res.json()
  const defs = spec.definitions || {}
  console.log('Exposed tables in remote schema:', Object.keys(defs))

  // Inspect existing columns on users table in remote project
  if (defs.users) {
    console.log('Remote "users" columns:', Object.keys(defs.users.properties || {}))
    const hasOwnerDesignation = 'owner_designation' in defs.users.properties
    console.log('Is "owner_designation" already present in remote users table?', hasOwnerDesignation)
  }

  // Inspect existing columns on staff table
  if (defs.staff) {
    console.log('Remote "staff" columns:', Object.keys(defs.staff.properties || {}))
    console.log('Is "job_title" already present in remote staff table?', 'job_title' in defs.staff.properties)
    console.log('Is "gender" already present in remote staff table?', 'gender' in defs.staff.properties)
  }

  // Inspect existing columns on clients table
  if (defs.clients) {
    console.log('Remote "clients" columns:', Object.keys(defs.clients.properties || {}))
    console.log('Is "is_vip" already present in remote clients table?', 'is_vip' in defs.clients.properties)
  }

  // Inspect existing columns on appointments table
  if (defs.appointments) {
    console.log('Remote "appointments" columns:', Object.keys(defs.appointments.properties || {}))
    console.log('Is "booking_source" already present in remote appointments table?', 'booking_source' in defs.appointments.properties)
  }

  // Inspect whether administrators table exists
  console.log('Is "administrators" table already present in remote schema?', 'administrators' in defs)
}

inspectLiveRemoteSchema().catch(err => {
  console.error('Remote inspection error:', err)
  process.exit(1)
})
