/**
 * Luma Salon — Migration & Export Utility (Phase 14.1)
 *
 * Safely extracts, validates, and prepares existing localStorage datasets for
 * PostgreSQL/Supabase ingestion without mutating localStorage or exposing credentials.
 */

import type {
  User,
  Staff,
  Client,
  Service,
  Appointment,
  CredentialRecord,
} from '../types/models'

export const STORAGE_KEYS = {
  USERS: 'luma_salon_users_v1',
  CREDS: 'luma_salon_auth_creds_v1',
  STAFF: 'staff_v1',
  CLIENTS: 'luma_salon_clients_v1',
  SERVICES: 'luma_salon_services_v1',
  APPOINTMENTS: 'luma_salon_appointments_v1',
} as const

export interface ValidationIssue {
  entityType: 'users' | 'staff' | 'clients' | 'services' | 'appointments' | 'credentials'
  recordId?: string
  field?: string
  issueType: 'DUPLICATE_ID' | 'MISSING_REQUIRED_FIELD' | 'INVALID_FORMAT' | 'MISSING_REFERENCE' | 'HISTORICAL_SNAPSHOT_REFERENCE'
  message: string
  severity: 'ERROR' | 'WARNING'
}

export interface MigrationExportPayload {
  exportedAt: string
  version: '1.0.0'
  salonId: string
  counts: {
    users: number
    staff: number
    clients: number
    services: number
    appointments: number
    credentialRecordsCount: number
  }
  data: {
    users: Omit<User, 'avatarUrl'>[]
    staff: Staff[]
    clients: Client[]
    services: Service[]
    appointments: Appointment[]
  }
  validation: {
    isValid: boolean
    errorsCount: number
    warningsCount: number
    issues: ValidationIssue[]
  }
}

export interface StorageAccessor {
  getItem: (key: string) => string | null
}

function getStorage(customStorage?: StorageAccessor): StorageAccessor | null {
  if (customStorage) return customStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage
  }
  return null
}

function parseStoredArray<T>(storage: StorageAccessor, key: string): T[] {
  try {
    const raw = storage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch (err) {
    console.error(`[MigrationUtility] Failed to parse key ${key}:`, err)
    return []
  }
}

/**
 * Extracts and thoroughly validates existing localStorage data for migration.
 * Does NOT mutate localStorage.
 * Does NOT export plaintext passwords or credential hashes.
 */
export function extractAndValidateLocalStorage(customStorage?: StorageAccessor): MigrationExportPayload {
  const storage = getStorage(customStorage)
  if (!storage) {
    throw new Error('No localStorage accessible for migration extract.')
  }

  // 1. Read records without mutating
  const rawUsers = parseStoredArray<User>(storage, STORAGE_KEYS.USERS)
  const rawStaff = parseStoredArray<Staff>(storage, STORAGE_KEYS.STAFF)
  const rawClients = parseStoredArray<Client>(storage, STORAGE_KEYS.CLIENTS)
  const rawServices = parseStoredArray<Service>(storage, STORAGE_KEYS.SERVICES)
  const rawAppointments = parseStoredArray<Appointment>(storage, STORAGE_KEYS.APPOINTMENTS)
  const rawCreds = parseStoredArray<CredentialRecord>(storage, STORAGE_KEYS.CREDS)

  const issues: ValidationIssue[] = []

  // 2. Validate Duplicate IDs
  function checkDuplicateIds(items: { id: string }[], entityType: ValidationIssue['entityType']) {
    const seen = new Set<string>()
    for (const item of items) {
      if (!item.id) {
        issues.push({
          entityType,
          field: 'id',
          issueType: 'MISSING_REQUIRED_FIELD',
          message: `Missing ID on ${entityType} record`,
          severity: 'ERROR',
        })
        continue
      }
      if (seen.has(item.id)) {
        issues.push({
          entityType,
          recordId: item.id,
          issueType: 'DUPLICATE_ID',
          message: `Duplicate ID '${item.id}' detected in ${entityType}`,
          severity: 'ERROR',
        })
      }
      seen.add(item.id)
    }
  }

  checkDuplicateIds(rawUsers, 'users')
  checkDuplicateIds(rawStaff, 'staff')
  checkDuplicateIds(rawClients, 'clients')
  checkDuplicateIds(rawServices, 'services')
  checkDuplicateIds(rawAppointments, 'appointments')

  // 3. Validate Users
  const userEmails = new Set<string>()
  for (const u of rawUsers) {
    if (!u.email) {
      issues.push({
        entityType: 'users',
        recordId: u.id,
        field: 'email',
        issueType: 'MISSING_REQUIRED_FIELD',
        message: `User ${u.id} has no email address`,
        severity: 'ERROR',
      })
    } else if (userEmails.has(u.email.toLowerCase())) {
      issues.push({
        entityType: 'users',
        recordId: u.id,
        field: 'email',
        issueType: 'DUPLICATE_ID',
        message: `Duplicate user email detected: '${u.email}'`,
        severity: 'ERROR',
      })
    } else {
      userEmails.add(u.email.toLowerCase())
    }

    if (!['ADMIN', 'OWNER', 'RECEPTIONIST', 'EMPLOYEE'].includes(u.role)) {
      issues.push({
        entityType: 'users',
        recordId: u.id,
        field: 'role',
        issueType: 'INVALID_FORMAT',
        message: `User ${u.id} has invalid role '${u.role}'`,
        severity: 'ERROR',
      })
    }

    if (u.role === 'EMPLOYEE' && u.employeeId) {
      const staffExists = rawStaff.some((s) => s.id === u.employeeId)
      if (!staffExists) {
        issues.push({
          entityType: 'users',
          recordId: u.id,
          field: 'employeeId',
          issueType: 'MISSING_REFERENCE',
          message: `User ${u.id} references missing staff profile '${u.employeeId}'`,
          severity: 'ERROR',
        })
      }
    }
  }

  // 4. Validate Services
  for (const s of rawServices) {
    if (typeof s.price !== 'number' || s.price < 0 || isNaN(s.price)) {
      issues.push({
        entityType: 'services',
        recordId: s.id,
        field: 'price',
        issueType: 'INVALID_FORMAT',
        message: `Service ${s.id} (${s.name}) has invalid price: ${s.price}`,
        severity: 'ERROR',
      })
    }
    if (typeof s.duration !== 'number' || s.duration <= 0) {
      issues.push({
        entityType: 'services',
        recordId: s.id,
        field: 'duration',
        issueType: 'INVALID_FORMAT',
        message: `Service ${s.id} (${s.name}) has invalid duration: ${s.duration}`,
        severity: 'ERROR',
      })
    }
  }

  // 5. Validate Appointments & Historical Snapshots
  const clientMap = new Map(rawClients.map((c) => [c.id, c]))
  const staffMap = new Map(rawStaff.map((s) => [s.id, s]))
  const serviceMap = new Map(rawServices.map((srv) => [srv.id, srv]))

  for (const apt of rawAppointments) {
    if (!apt.date || !/^\d{4}-\d{2}-\d{2}$/.test(apt.date)) {
      issues.push({
        entityType: 'appointments',
        recordId: apt.id,
        field: 'date',
        issueType: 'INVALID_FORMAT',
        message: `Appointment ${apt.id} has invalid date format: '${apt.date}'`,
        severity: 'ERROR',
      })
    }
    if (!apt.startTime || !/^\d{2}:\d{2}$/.test(apt.startTime)) {
      issues.push({
        entityType: 'appointments',
        recordId: apt.id,
        field: 'startTime',
        issueType: 'INVALID_FORMAT',
        message: `Appointment ${apt.id} has invalid startTime: '${apt.startTime}'`,
        severity: 'ERROR',
      })
    }
    if (!['scheduled', 'confirmed', 'completed', 'cancelled', 'no-show'].includes(apt.status)) {
      issues.push({
        entityType: 'appointments',
        recordId: apt.id,
        field: 'status',
        issueType: 'INVALID_FORMAT',
        message: `Appointment ${apt.id} has invalid status: '${apt.status}'`,
        severity: 'ERROR',
      })
    }

    // Reference validation vs Snapshot safety
    if (apt.clientId && !clientMap.has(apt.clientId)) {
      if (apt.clientName) {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'clientId',
          issueType: 'HISTORICAL_SNAPSHOT_REFERENCE',
          message: `Appointment ${apt.id} references deleted client '${apt.clientId}', safely preserved via snapshot '${apt.clientName}'`,
          severity: 'WARNING',
        })
      } else {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'clientId',
          issueType: 'MISSING_REFERENCE',
          message: `Appointment ${apt.id} references missing client '${apt.clientId}' without a client snapshot`,
          severity: 'ERROR',
        })
      }
    }

    if (apt.staffId && !staffMap.has(apt.staffId)) {
      if (apt.staffName) {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'staffId',
          issueType: 'HISTORICAL_SNAPSHOT_REFERENCE',
          message: `Appointment ${apt.id} references deleted staff '${apt.staffId}', safely preserved via snapshot '${apt.staffName}'`,
          severity: 'WARNING',
        })
      } else {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'staffId',
          issueType: 'MISSING_REFERENCE',
          message: `Appointment ${apt.id} references missing staff '${apt.staffId}' without a staff snapshot`,
          severity: 'ERROR',
        })
      }
    }

    if (apt.serviceId && !serviceMap.has(apt.serviceId)) {
      if (apt.serviceName) {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'serviceId',
          issueType: 'HISTORICAL_SNAPSHOT_REFERENCE',
          message: `Appointment ${apt.id} references deleted service '${apt.serviceId}', safely preserved via snapshot '${apt.serviceName}'`,
          severity: 'WARNING',
        })
      } else {
        issues.push({
          entityType: 'appointments',
          recordId: apt.id,
          field: 'serviceId',
          issueType: 'MISSING_REFERENCE',
          message: `Appointment ${apt.id} references missing service '${apt.serviceId}' without a service snapshot`,
          severity: 'ERROR',
        })
      }
    }
  }

  const errorsCount = issues.filter((i) => i.severity === 'ERROR').length
  const warningsCount = issues.filter((i) => i.severity === 'WARNING').length

  // Sanitize Users: omit avatarUrl if excessively large
  const sanitizedUsers = rawUsers.map((u) => {
    const { avatarUrl, ...rest } = u
    return rest
  })

  return {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    salonId: 'salon-luma-01',
    counts: {
      users: rawUsers.length,
      staff: rawStaff.length,
      clients: rawClients.length,
      services: rawServices.length,
      appointments: rawAppointments.length,
      credentialRecordsCount: rawCreds.length,
    },
    data: {
      users: sanitizedUsers,
      staff: rawStaff,
      clients: rawClients,
      services: rawServices,
      appointments: rawAppointments,
    },
    validation: {
      isValid: errorsCount === 0,
      errorsCount,
      warningsCount,
      issues,
    },
  }
}

/**
 * Generates idempotent SQL statements for a safe, repeatable dry-run import.
 */
export function generateIdempotentSql(payload: MigrationExportPayload): string {
  const sqlLines: string[] = []
  sqlLines.push('-- ==============================================================================')
  sqlLines.push('-- Luma Salon — Idempotent Migration Import Script')
  sqlLines.push(`-- Generated At: ${payload.exportedAt}`)
  sqlLines.push('-- ==============================================================================\n')
  sqlLines.push('BEGIN;\n')

  // 1. Salon
  sqlLines.push(`-- Ensure Salon exists`)
  sqlLines.push(`INSERT INTO public.salons (id, name, owner_name, phone, email, timezone, currency, currency_symbol, language)
VALUES ('salon-luma-01', 'Hair Dexirity', 'Mia', '+91 98765 43210', 'contact@hairdexirity.example.com', 'Asia/Kolkata', 'INR', '₹', 'en')
ON CONFLICT (id) DO NOTHING;\n`)

  // 2. Staff
  sqlLines.push(`-- Import Staff (${payload.counts.staff} records)`)
  for (const s of payload.data.staff) {
    const skillsSql = `ARRAY[${s.skills.map((sk) => `'${sk.replace(/'/g, "''")}'`).join(', ')}]::TEXT[]`
    const hoursJson = JSON.stringify(s.workingHours || {}).replace(/'/g, "''")
    sqlLines.push(`INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('${s.id}', 'salon-luma-01', '${s.name.replace(/'/g, "''")}', '${s.phone}', '${s.email}', '${s.role}', ${skillsSql}, '${s.experience}', ${s.active}, '${hoursJson}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  skills = EXCLUDED.skills,
  working_hours = EXCLUDED.working_hours,
  updated_at = timezone('utc'::text, now());`)
  }
  sqlLines.push('')

  // 3. Users
  sqlLines.push(`-- Import Users (${payload.counts.users} records)`)
  for (const u of payload.data.users) {
    const empIdVal = u.employeeId ? `'${u.employeeId}'` : 'NULL'
    const specVal = u.specialty ? `'${u.specialty.replace(/'/g, "''")}'` : 'NULL'
    sqlLines.push(`INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('${u.id}', 'salon-luma-01', '${u.name.replace(/'/g, "''")}', '${u.email}', '${u.role}', ${empIdVal}, ${specVal}, ${u.active})
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  role = EXCLUDED.role,
  employee_id = EXCLUDED.employee_id,
  specialty = EXCLUDED.specialty,
  active = EXCLUDED.active,
  updated_at = timezone('utc'::text, now());`)
  }
  sqlLines.push('')

  // 4. Services
  sqlLines.push(`-- Import Services (${payload.counts.services} records)`)
  for (const srv of payload.data.services) {
    sqlLines.push(`INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('${srv.id}', 'salon-luma-01', '${srv.name.replace(/'/g, "''")}', '${srv.description.replace(/'/g, "''")}', ${srv.duration}, ${srv.price.toFixed(2)}, '${srv.category}', ${srv.active})
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  duration = EXCLUDED.duration,
  price = EXCLUDED.price,
  category = EXCLUDED.category,
  active = EXCLUDED.active,
  updated_at = timezone('utc'::text, now());`)
  }
  sqlLines.push('')

  // 5. Clients
  sqlLines.push(`-- Import Clients (${payload.counts.clients} records)`)
  for (const c of payload.data.clients) {
    const prefJson = JSON.stringify(c.preferences || {}).replace(/'/g, "''")
    const dobVal = c.dateOfBirth ? `'${c.dateOfBirth}'` : 'NULL'
    const lastVisitVal = c.lastVisitAt ? `'${c.lastVisitAt}'` : 'NULL'
    sqlLines.push(`INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('${c.id}', 'salon-luma-01', '${c.name.replace(/'/g, "''")}', '${c.phone}', '${c.email}', ${dobVal}, '${prefJson}'::jsonb, '${c.notes.replace(/'/g, "''")}', ${c.totalSpend.toFixed(2)}, ${lastVisitVal})
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  phone = EXCLUDED.phone,
  email = EXCLUDED.email,
  preferences = EXCLUDED.preferences,
  notes = EXCLUDED.notes,
  total_spend = EXCLUDED.total_spend,
  last_visit_at = EXCLUDED.last_visit_at,
  updated_at = timezone('utc'::text, now());`)
  }
  sqlLines.push('')

  // 6. Appointments
  sqlLines.push(`-- Import Appointments (${payload.counts.appointments} records)`)
  for (const a of payload.data.appointments) {
    const cliIdVal = a.clientId ? `'${a.clientId}'` : 'NULL'
    const stfIdVal = a.staffId ? `'${a.staffId}'` : 'NULL'
    const srvIdVal = a.serviceId ? `'${a.serviceId}'` : 'NULL'
    const notesVal = a.notes ? `'${a.notes.replace(/'/g, "''")}'` : 'NULL'
    const cliNameVal = a.clientName ? `'${a.clientName.replace(/'/g, "''")}'` : 'NULL'
    const cliPhoneVal = a.clientPhone ? `'${a.clientPhone}'` : 'NULL'
    const cliEmailVal = a.clientEmail ? `'${a.clientEmail}'` : 'NULL'
    const stfNameVal = a.staffName ? `'${a.staffName.replace(/'/g, "''")}'` : 'NULL'
    const srvNameVal = a.serviceName ? `'${a.serviceName.replace(/'/g, "''")}'` : 'NULL'
    const lastRemindVal = a.lastReminderSentAt ? `'${a.lastReminderSentAt}'` : 'NULL'
    const remStatusVal = a.reminderDeliveryStatus ? `'${a.reminderDeliveryStatus}'` : 'NULL'

    sqlLines.push(`INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('${a.id}', 'salon-luma-01', ${cliIdVal}, ${stfIdVal}, ${stfIdVal}, ${srvIdVal}, '${a.date}', '${a.startTime}', '${a.endTime}', '${a.status}', ${a.price.toFixed(2)}, ${notesVal}, ${Boolean(a.reminderSent)}, ${lastRemindVal}, ${remStatusVal}, ${cliNameVal}, ${cliPhoneVal}, ${cliEmailVal}, ${stfNameVal}, ${srvNameVal})
ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  reminder_sent = EXCLUDED.reminder_sent,
  last_reminder_sent_at = EXCLUDED.last_reminder_sent_at,
  reminder_delivery_status = EXCLUDED.reminder_delivery_status,
  client_name = EXCLUDED.client_name,
  staff_name = EXCLUDED.staff_name,
  service_name = EXCLUDED.service_name,
  updated_at = timezone('utc'::text, now());`)
  }
  sqlLines.push('')
  sqlLines.push('COMMIT;')

  return sqlLines.join('\n')
}

/**
 * Generates strict INSERT-only SQL statements for initial migration.
 * Phase 14.2.1:
 * - Pure INSERT statements without ON CONFLICT DO UPDATE or DO NOTHING.
 * - Entire script wrapped in atomic BEGIN ... COMMIT block.
 * - Pre-flight check asserts all 6 tables are completely empty before starting.
 * - Any duplicate ID or key collision immediately aborts transaction and rolls back.
 * - Post-import assertion validates exact row counts before committing.
 * - auth_user_id is omitted and strictly defaults to NULL (no fake auth IDs).
 * - Excludes all credentials, salts, and password hashes.
 */
export function generateInsertOnlySql(payload: MigrationExportPayload): string {
  const sqlLines: string[] = []
  sqlLines.push('-- ==============================================================================')
  sqlLines.push('-- Luma Salon — Phase 14.2.1 Strict INSERT-Only Migration Script')
  sqlLines.push(`-- Generated At: ${payload.exportedAt}`)
  sqlLines.push('-- Strategy: Atomic Transaction, Pre-Flight Guard, Fail-Fast on Any Conflict')
  sqlLines.push('-- ==============================================================================\n')
  sqlLines.push('BEGIN;\n')

  // Pre-flight check
  sqlLines.push(`-- 0. PRE-FLIGHT GUARD: Ensure all target tables are clean before inserting`)
  sqlLines.push(`DO $$
BEGIN
  IF (SELECT count(*) FROM public.salons) > 0 OR
     (SELECT count(*) FROM public.staff) > 0 OR
     (SELECT count(*) FROM public.users) > 0 OR
     (SELECT count(*) FROM public.services) > 0 OR
     (SELECT count(*) FROM public.clients) > 0 OR
     (SELECT count(*) FROM public.appointments) > 0 THEN
    RAISE EXCEPTION 'Target database already contains records. Aborting INSERT-only initial migration to prevent overwriting or collisions.';
  END IF;
END $$;\n`)

  // 1. Salon
  sqlLines.push(`-- 1. Insert Salon (1 record)`)
  sqlLines.push(`INSERT INTO public.salons (id, name, owner_name, phone, email, timezone, currency, currency_symbol, language)
VALUES ('salon-luma-01', 'Hair Dexirity', 'Mia', '+91 98765 43210', 'contact@hairdexirity.example.com', 'Asia/Kolkata', 'INR', '₹', 'en');\n`)

  // 2. Staff
  sqlLines.push(`-- 2. Insert Staff (${payload.counts.staff} records)`)
  for (const s of payload.data.staff) {
    const skillsSql = `ARRAY[${s.skills.map((sk) => `'${sk.replace(/'/g, "''")}'`).join(', ')}]::TEXT[]`
    const hoursJson = JSON.stringify(s.workingHours || {}).replace(/'/g, "''")
    sqlLines.push(`INSERT INTO public.staff (id, salon_id, name, phone, email, role, skills, experience, active, working_hours)
VALUES ('${s.id}', 'salon-luma-01', '${s.name.replace(/'/g, "''")}', '${s.phone}', '${s.email}', '${s.role}', ${skillsSql}, '${s.experience}', ${s.active}, '${hoursJson}'::jsonb);`)
  }
  sqlLines.push('')

  // 3. Users
  sqlLines.push(`-- 3. Insert Users (${payload.counts.users} records - auth_user_id strictly NULL)`)
  for (const u of payload.data.users) {
    const empIdVal = u.employeeId ? `'${u.employeeId}'` : 'NULL'
    const specVal = u.specialty ? `'${u.specialty.replace(/'/g, "''")}'` : 'NULL'
    sqlLines.push(`INSERT INTO public.users (id, salon_id, name, email, role, employee_id, specialty, active)
VALUES ('${u.id}', 'salon-luma-01', '${u.name.replace(/'/g, "''")}', '${u.email}', '${u.role}', ${empIdVal}, ${specVal}, ${u.active});`)
  }
  sqlLines.push('')

  // 4. Services
  sqlLines.push(`-- 4. Insert Services (${payload.counts.services} records)`)
  for (const srv of payload.data.services) {
    sqlLines.push(`INSERT INTO public.services (id, salon_id, name, description, duration, price, category, active)
VALUES ('${srv.id}', 'salon-luma-01', '${srv.name.replace(/'/g, "''")}', '${srv.description.replace(/'/g, "''")}', ${srv.duration}, ${srv.price.toFixed(2)}, '${srv.category}', ${srv.active});`)
  }
  sqlLines.push('')

  // 5. Clients
  sqlLines.push(`-- 5. Insert Clients (${payload.counts.clients} records)`)
  for (const c of payload.data.clients) {
    const prefJson = JSON.stringify(c.preferences || {}).replace(/'/g, "''")
    const dobVal = c.dateOfBirth ? `'${c.dateOfBirth}'` : 'NULL'
    const lastVisitVal = c.lastVisitAt ? `'${c.lastVisitAt}'` : 'NULL'
    sqlLines.push(`INSERT INTO public.clients (id, salon_id, name, phone, email, date_of_birth, preferences, notes, total_spend, last_visit_at)
VALUES ('${c.id}', 'salon-luma-01', '${c.name.replace(/'/g, "''")}', '${c.phone}', '${c.email}', ${dobVal}, '${prefJson}'::jsonb, '${c.notes.replace(/'/g, "''")}', ${c.totalSpend.toFixed(2)}, ${lastVisitVal});`)
  }
  sqlLines.push('')

  // 6. Appointments
  sqlLines.push(`-- 6. Insert Appointments (${payload.counts.appointments} records with historical snapshots)`)
  for (const a of payload.data.appointments) {
    const cliIdVal = a.clientId ? `'${a.clientId}'` : 'NULL'
    const stfIdVal = a.staffId ? `'${a.staffId}'` : 'NULL'
    const srvIdVal = a.serviceId ? `'${a.serviceId}'` : 'NULL'
    const notesVal = a.notes ? `'${a.notes.replace(/'/g, "''")}'` : 'NULL'
    const cliNameVal = a.clientName ? `'${a.clientName.replace(/'/g, "''")}'` : 'NULL'
    const cliPhoneVal = a.clientPhone ? `'${a.clientPhone}'` : 'NULL'
    const cliEmailVal = a.clientEmail ? `'${a.clientEmail}'` : 'NULL'
    const stfNameVal = a.staffName ? `'${a.staffName.replace(/'/g, "''")}'` : 'NULL'
    const srvNameVal = a.serviceName ? `'${a.serviceName.replace(/'/g, "''")}'` : 'NULL'
    const lastRemindVal = a.lastReminderSentAt ? `'${a.lastReminderSentAt}'` : 'NULL'
    const remStatusVal = a.reminderDeliveryStatus ? `'${a.reminderDeliveryStatus}'` : 'NULL'

    sqlLines.push(`INSERT INTO public.appointments (id, salon_id, client_id, staff_id, assigned_employee_id, service_id, date, start_time, end_time, status, price, notes, reminder_sent, last_reminder_sent_at, reminder_delivery_status, client_name, client_phone, client_email, staff_name, service_name)
VALUES ('${a.id}', 'salon-luma-01', ${cliIdVal}, ${stfIdVal}, ${stfIdVal}, ${srvIdVal}, '${a.date}', '${a.startTime}', '${a.endTime}', '${a.status}', ${a.price.toFixed(2)}, ${notesVal}, ${Boolean(a.reminderSent)}, ${lastRemindVal}, ${remStatusVal}, ${cliNameVal}, ${cliPhoneVal}, ${cliEmailVal}, ${stfNameVal}, ${srvNameVal});`)
  }
  sqlLines.push('')

  // Post-import verification
  sqlLines.push(`-- 7. POST-IMPORT VERIFICATION: Ensure exact expected row counts are present before commit`)
  sqlLines.push(`DO $$
DECLARE
  v_salons INT;
  v_staff INT;
  v_users INT;
  v_services INT;
  v_clients INT;
  v_appointments INT;
BEGIN
  SELECT count(*) INTO v_salons FROM public.salons;
  SELECT count(*) INTO v_staff FROM public.staff;
  SELECT count(*) INTO v_users FROM public.users;
  SELECT count(*) INTO v_services FROM public.services;
  SELECT count(*) INTO v_clients FROM public.clients;
  SELECT count(*) INTO v_appointments FROM public.appointments;

  IF v_salons != 1 OR
     v_staff != ${payload.counts.staff} OR
     v_users != ${payload.counts.users} OR
     v_services != ${payload.counts.services} OR
     v_clients != ${payload.counts.clients} OR
     v_appointments != ${payload.counts.appointments} THEN
    RAISE EXCEPTION 'Post-import row count mismatch! Rolling back. (Found: salons=%, staff=%, users=%, services=%, clients=%, appointments=%)',
      v_salons, v_staff, v_users, v_services, v_clients, v_appointments;
  END IF;
END $$;\n`)

  sqlLines.push('COMMIT;')

  return sqlLines.join('\n')
}
