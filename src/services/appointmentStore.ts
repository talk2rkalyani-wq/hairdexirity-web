import type { Appointment } from '../types/models.ts'
import { mockAppointments, mockClients, mockStaff, mockServices } from '../mockData/salonEntities.ts'
import { getSalonDateStr, getSalonTimeStr, timeToMinutes } from '../utils/formatters.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'

const STORAGE_KEY = 'luma_salon_appointments_v1'

type AppointmentListener = (appointments: Appointment[]) => void
const listeners = new Set<AppointmentListener>()

function seedWithEntitySnapshots(appointments: Appointment[]): Appointment[] {
  return appointments.map((apt) => {
    const client = mockClients.find((c) => c.id === apt.clientId)
    const staff = mockStaff.find((s) => s.id === apt.staffId)
    const service = mockServices.find((srv) => srv.id === apt.serviceId)
    return {
      ...apt,
      clientName: apt.clientName || client?.name,
      staffName: apt.staffName || staff?.name,
      serviceName: apt.serviceName || service?.name,
    }
  })
}

/**
 * Evaluates whether an appointment blocks entity deletion.
 * Business Rule: Deletion is blocked ONLY when referenced by an upcoming
 * or currently ongoing appointment (status 'scheduled' or 'confirmed').
 * Historical appointments ('completed', 'cancelled', 'no-show', or past dates/times)
 * do NOT block deletion.
 */
export function isAppointmentBlocking(
  apt: Appointment,
  currentDate: string = getSalonDateStr(0),
  currentTime: string = getSalonTimeStr()
): boolean {
  if (
    apt.status !== 'scheduled' &&
    apt.status !== 'confirmed' &&
    apt.status !== 'checked_in' &&
    apt.status !== 'in_progress'
  ) {
    return false
  }

  // Future calendar date strictly blocks
  if (apt.date > currentDate) {
    return true
  }

  // Past calendar date never blocks
  if (apt.date < currentDate) {
    return false
  }

  // Same calendar date (today): check if ongoing or upcoming later today
  const currentMins = timeToMinutes(currentTime)
  const endMins = apt.endTime ? timeToMinutes(apt.endTime) : (timeToMinutes(apt.startTime) + 45)

  return endMins > currentMins
}

/**
 * Reads persisted appointments from localStorage if available.
 * Defaults to empty array to ensure fresh real-data testing.
 */
function loadInitialAppointments(): Appointment[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load appointments from localStorage:', err)
  }

  return []
}

// Canonical In-Memory Appointment Collection
let canonicalAppointments: Appointment[] = loadInitialAppointments()

// Save state to localStorage if in browser environment
function persistToStorage(data: Appointment[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
  } catch (err) {
    console.warn('Failed to save appointments to localStorage:', err)
  }
}

function formatTimeForPostgres(timeStr?: string): string {
  if (!timeStr) return '10:00:00'
  const trimmed = timeStr.trim()
  if (trimmed.length === 5) return `${trimmed}:00`
  return trimmed
}

function formatTimeFromPostgres(timeStr?: any): string {
  if (!timeStr) return '10:00'
  const s = String(timeStr).trim()
  return s.slice(0, 5)
}

function mapRowToAppointment(row: any): Appointment {
  return {
    id: row.id,
    salonId: row.salon_id || 'salon-luma-01',
    clientId: row.client_id || '',
    staffId: row.staff_id || '',
    assignedEmployeeId: row.assigned_employee_id || row.staff_id || '',
    serviceId: row.service_id || '',
    date: row.date,
    startTime: formatTimeFromPostgres(row.start_time),
    endTime: formatTimeFromPostgres(row.end_time),
    status: row.status,
    price: Number(row.price) || 0,
    notes: row.notes || undefined,
    clientName: row.client_name || undefined,
    clientPhone: row.client_phone || undefined,
    clientEmail: row.client_email || undefined,
    staffName: row.staff_name || undefined,
    serviceName: row.service_name || undefined,
    checkedInAt: row.checked_in_at || undefined,
    serviceStartedAt: row.service_started_at || undefined,
    completedAt: row.completed_at || undefined,
    cancellationReason: row.cancellation_reason || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

function mapAppointmentToRow(apt: Appointment): Record<string, any> {
  return {
    id: apt.id,
    salon_id: apt.salonId || 'salon-luma-01',
    client_id: apt.clientId || null,
    staff_id: apt.staffId || null,
    assigned_employee_id: apt.assignedEmployeeId || apt.staffId || null,
    service_id: apt.serviceId || null,
    date: apt.date,
    start_time: formatTimeForPostgres(apt.startTime),
    end_time: formatTimeForPostgres(apt.endTime),
    status: apt.status || 'scheduled',
    price: Number(apt.price) || 0,
    notes: apt.notes || null,
    client_name: apt.clientName || null,
    client_phone: apt.clientPhone || null,
    client_email: apt.clientEmail || null,
    staff_name: apt.staffName || null,
    service_name: apt.serviceName || null,
    checked_in_at: apt.checkedInAt || null,
    service_started_at: apt.serviceStartedAt || null,
    completed_at: apt.completedAt || null,
    cancellation_reason: apt.cancellationReason || null,
    created_at: apt.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

async function insertRemoteAppointment(apt: Appointment): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return

  let row = mapAppointmentToRow(apt)
  try {
    let { error } = await supabase.from('appointments').insert(row)
    if (error) {
      console.warn('Direct insert to Supabase appointments table failed, checking columns/foreign keys:', error)

      // Handle missing optional columns if schema migration hasn't been applied yet
      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const {
          cancellation_reason,
          checked_in_at,
          service_started_at,
          completed_at,
          client_name,
          client_phone,
          client_email,
          staff_name,
          service_name,
          ...coreRow
        } = row
        row = coreRow
        const retryResult = await supabase.from('appointments').insert(row)
        error = retryResult.error
      }

      // Handle foreign key constraint failure
      if (
        error &&
        (error.message?.includes('foreign key') ||
          error.message?.includes('fkey') ||
          error.code === '23503')
      ) {
        const { client_id, staff_id, service_id, assigned_employee_id, ...fallback } = row
        const { error: retryErr } = await supabase.from('appointments').insert({
          ...fallback,
          client_id: null,
          staff_id: null,
          assigned_employee_id: null,
          service_id: null,
        })
        if (retryErr) {
          console.error('Fallback insert without foreign keys also failed:', retryErr)
        }
      }
    }
  } catch (err) {
    console.error('Network error inserting appointment to Supabase:', err)
  }
}

async function updateRemoteAppointment(id: string, updates: Partial<Appointment>): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return

  let payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  }
  if (updates.date !== undefined) payload.date = updates.date
  if (updates.startTime !== undefined) payload.start_time = formatTimeForPostgres(updates.startTime)
  if (updates.endTime !== undefined) payload.end_time = formatTimeForPostgres(updates.endTime)
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.price !== undefined) payload.price = Number(updates.price) || 0
  if (updates.notes !== undefined) payload.notes = updates.notes || null
  if (updates.clientId !== undefined) payload.client_id = updates.clientId || null
  if (updates.staffId !== undefined) payload.staff_id = updates.staffId || null
  if (updates.assignedEmployeeId !== undefined) payload.assigned_employee_id = updates.assignedEmployeeId || null
  if (updates.serviceId !== undefined) payload.service_id = updates.serviceId || null
  if (updates.clientName !== undefined) payload.client_name = updates.clientName || null
  if (updates.clientPhone !== undefined) payload.client_phone = updates.clientPhone || null
  if (updates.clientEmail !== undefined) payload.client_email = updates.clientEmail || null
  if (updates.staffName !== undefined) payload.staff_name = updates.staffName || null
  if (updates.serviceName !== undefined) payload.service_name = updates.serviceName || null
  if (updates.checkedInAt !== undefined) payload.checked_in_at = updates.checkedInAt || null
  if (updates.serviceStartedAt !== undefined) payload.service_started_at = updates.serviceStartedAt || null
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt || null
  if (updates.cancellationReason !== undefined) payload.cancellation_reason = updates.cancellationReason || null

  try {
    let { error } = await supabase.from('appointments').update(payload).eq('id', id)
    if (error) {
      console.warn('Update to Supabase appointments table failed:', error)
      if (error.code === 'PGRST204' || error.message?.includes('schema cache')) {
        const {
          cancellation_reason,
          checked_in_at,
          service_started_at,
          completed_at,
          client_name,
          client_phone,
          client_email,
          staff_name,
          service_name,
          ...corePayload
        } = payload
        payload = corePayload
        const retryResult = await supabase.from('appointments').update(payload).eq('id', id)
        error = retryResult.error
      }
      if (
        error &&
        (error.message?.includes('foreign key') ||
          error.message?.includes('fkey') ||
          error.code === '23503')
      ) {
        const { client_id, staff_id, service_id, assigned_employee_id, ...fallback } = payload
        await supabase.from('appointments').update(fallback).eq('id', id)
      }
    }
  } catch (err) {
    console.error('Network error updating appointment in Supabase:', err)
  }
}

async function deleteRemoteAppointment(id: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return
  try {
    const { error } = await supabase.from('appointments').delete().eq('id', id)
    if (error) console.error('Error deleting appointment from Supabase:', error)
  } catch (err) {
    console.error('Network error deleting appointment from Supabase:', err)
  }
}

let syncInProgress: Promise<Appointment[]> | null = null

async function syncWithSupabase(): Promise<Appointment[]> {
  if (!isSupabaseConfigured() || !supabase) {
    return canonicalAppointments
  }

  if (syncInProgress) {
    return syncInProgress
  }

  syncInProgress = (async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('date', { ascending: true })

      if (!error && data) {
        const remoteAppointments: Appointment[] = data.map(mapRowToAppointment)

        // If remote database is empty, but local storage has created appointments (like Raghav & Sapna),
        // auto-push local appointments to Supabase Cloud
        if (remoteAppointments.length === 0 && canonicalAppointments.length > 0) {
          for (const apt of canonicalAppointments) {
            await insertRemoteAppointment(apt)
          }
          return [...canonicalAppointments]
        }

        canonicalAppointments = remoteAppointments
        persistToStorage(canonicalAppointments)
        notifyListeners()
        return [...canonicalAppointments]
      }
    } catch (err) {
      console.warn('Error fetching appointments from Supabase:', err)
    } finally {
      syncInProgress = null
    }
    return [...canonicalAppointments]
  })()

  return syncInProgress
}

if (typeof window !== 'undefined') {
  syncWithSupabase().catch((err) => console.warn('Initial Supabase appointments sync failed:', err))
}

// Listen for cross-tab or external storage changes
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          canonicalAppointments = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for appointments:', err)
      }
    }
  })
}

function notifyListeners() {
  const current = [...canonicalAppointments]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in appointment listener:', err)
    }
  })
}

export const appointmentStore = {
  /**
   * Returns a copy of all appointments in the canonical collection
   */
  getAll(): Appointment[] {
    return [...canonicalAppointments]
  },

  /**
   * Returns an appointment by its unique ID
   */
  getById(id: string): Appointment | null {
    const found = canonicalAppointments.find((a) => a.id === id)
    return found ? { ...found } : null
  },

  /**
   * Returns appointments for a specific date (YYYY-MM-DD), sorted by start time
   */
  getByDate(date: string): Appointment[] {
    return canonicalAppointments
      .filter((a) => a.date === date)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .map((a) => ({ ...a }))
  },

  /**
   * Returns appointments for a client, sorted by date descending then start time
   */
  getByClientId(clientId: string): Appointment[] {
    return canonicalAppointments
      .filter((a) => a.clientId === clientId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime))
      .map((a) => ({ ...a }))
  },

  /**
   * Returns appointments in a date range [startDate, endDate] inclusive
   */
  getByDateRange(startDate: string, endDate: string): Appointment[] {
    return canonicalAppointments
      .filter((a) => a.date >= startDate && a.date <= endDate)
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((a) => ({ ...a }))
  },

  /**
   * Returns appointments that have checked in and are waiting in the lounge, optionally filtered by date
   */
  getCheckedInAppointments(date?: string): Appointment[] {
    return canonicalAppointments
      .filter((a) => a.status === 'checked_in' && (!date || a.date === date))
      .sort((a, b) => (a.checkedInAt || '').localeCompare(b.checkedInAt || '') || a.startTime.localeCompare(b.startTime))
      .map((a) => ({ ...a }))
  },

  /**
   * Returns appointments where service is currently in progress, optionally filtered by date
   */
  getInProgressAppointments(date?: string): Appointment[] {
    return canonicalAppointments
      .filter((a) => a.status === 'in_progress' && (!date || a.date === date))
      .sort((a, b) => (a.serviceStartedAt || '').localeCompare(b.serviceStartedAt || '') || a.startTime.localeCompare(b.startTime))
      .map((a) => ({ ...a }))
  },

  /**
   * Checks whether any appointment exists referencing a given client ID
   */
  hasAppointmentsForClient(clientId: string): boolean {
    return canonicalAppointments.some((a) => a.clientId === clientId)
  },

  /**
   * Returns appointment count for a given client ID
   */
  getAppointmentCountForClient(clientId: string): number {
    return canonicalAppointments.filter((a) => a.clientId === clientId).length
  },

  /**
   * Checks whether an upcoming or currently ongoing appointment references a given client ID.
   * Only appointments that are 'scheduled' or 'confirmed' and in the future or ongoing will return true.
   */
  hasBlockingAppointmentsForClient(
    clientId: string,
    currentDate?: string,
    currentTime?: string
  ): boolean {
    return canonicalAppointments.some(
      (a) => a.clientId === clientId && isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Returns all upcoming or currently ongoing appointments for a given client ID
   */
  getBlockingAppointmentsForClient(
    clientId: string,
    currentDate?: string,
    currentTime?: string
  ): Appointment[] {
    return canonicalAppointments.filter(
      (a) => a.clientId === clientId && isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Checks whether any appointment exists referencing a given service ID
   */
  hasAppointmentsForService(serviceId: string): boolean {
    return canonicalAppointments.some((a) => a.serviceId === serviceId)
  },

  /**
   * Returns appointment count for a given service ID
   */
  getAppointmentCountForService(serviceId: string): number {
    return canonicalAppointments.filter((a) => a.serviceId === serviceId).length
  },

  /**
   * Checks whether an upcoming or currently ongoing appointment references a given service ID.
   */
  hasBlockingAppointmentsForService(
    serviceId: string,
    currentDate?: string,
    currentTime?: string
  ): boolean {
    return canonicalAppointments.some(
      (a) => a.serviceId === serviceId && isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Returns all upcoming or currently ongoing appointments for a given service ID
   */
  getBlockingAppointmentsForService(
    serviceId: string,
    currentDate?: string,
    currentTime?: string
  ): Appointment[] {
    return canonicalAppointments.filter(
      (a) => a.serviceId === serviceId && isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Checks whether any appointment exists referencing a given staff or employee ID
   */
  hasAppointmentsForStaff(staffOrEmployeeId: string): boolean {
    return canonicalAppointments.some(
      (a) => a.staffId === staffOrEmployeeId || (a as any).assignedEmployeeId === staffOrEmployeeId
    )
  },

  /**
   * Returns appointment count for a given staff or employee ID
   */
  getAppointmentCountForStaff(staffOrEmployeeId: string): number {
    return canonicalAppointments.filter(
      (a) => a.staffId === staffOrEmployeeId || (a as any).assignedEmployeeId === staffOrEmployeeId
    ).length
  },

  /**
   * Checks whether an upcoming or currently ongoing appointment references a given staff or employee ID.
   */
  hasBlockingAppointmentsForStaff(
    staffOrEmployeeId: string,
    currentDate?: string,
    currentTime?: string
  ): boolean {
    return canonicalAppointments.some(
      (a) =>
        (a.staffId === staffOrEmployeeId || (a as any).assignedEmployeeId === staffOrEmployeeId) &&
        isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Returns all upcoming or currently ongoing appointments for a given staff or employee ID
   */
  getBlockingAppointmentsForStaff(
    staffOrEmployeeId: string,
    currentDate?: string,
    currentTime?: string
  ): Appointment[] {
    return canonicalAppointments.filter(
      (a) =>
        (a.staffId === staffOrEmployeeId || (a as any).assignedEmployeeId === staffOrEmployeeId) &&
        isAppointmentBlocking(a, currentDate, currentTime)
    )
  },

  /**
   * Captures snapshot of client name/phone/email on all appointments for this client.
   * Preserves historical reporting integrity when client profile is deleted.
   */
  snapshotClientDetails(
    clientId: string,
    details: { name: string; phone?: string; email?: string }
  ): void {
    let mutated = false
    canonicalAppointments.forEach((a) => {
      if (a.clientId === clientId) {
        if (!a.clientName) {
          a.clientName = details.name
          mutated = true
        }
        if (details.phone && !a.clientPhone) {
          a.clientPhone = details.phone
          mutated = true
        }
        if (details.email && !a.clientEmail) {
          a.clientEmail = details.email
          mutated = true
        }
      }
    })
    if (mutated) {
      persistToStorage(canonicalAppointments)
      notifyListeners()
    }
  },

  /**
   * Captures snapshot of service name on all appointments for this service.
   * Preserves historical reporting integrity when service is deleted.
   */
  snapshotServiceDetails(
    serviceId: string,
    details: { name: string }
  ): void {
    let mutated = false
    canonicalAppointments.forEach((a) => {
      if (a.serviceId === serviceId) {
        if (!a.serviceName) {
          a.serviceName = details.name
          mutated = true
        }
      }
    })
    if (mutated) {
      persistToStorage(canonicalAppointments)
      notifyListeners()
    }
  },

  /**
   * Captures snapshot of staff name on all appointments for this staff member.
   * Preserves historical reporting integrity when staff is deleted.
   */
  snapshotStaffDetails(
    staffOrEmployeeId: string,
    details: { name: string }
  ): void {
    let mutated = false
    canonicalAppointments.forEach((a) => {
      if (a.staffId === staffOrEmployeeId || (a as any).assignedEmployeeId === staffOrEmployeeId) {
        if (!a.staffName) {
          a.staffName = details.name
          mutated = true
        }
      }
    })
    if (mutated) {
      persistToStorage(canonicalAppointments)
      notifyListeners()
    }
  },

  /**
   * Appends a newly created appointment, persists to storage, notifies subscribers,
   * and synchronizes to Supabase Cloud
   */
  add(appointment: Appointment): Appointment {
    canonicalAppointments.push({ ...appointment })
    persistToStorage(canonicalAppointments)
    notifyListeners()
    insertRemoteAppointment(appointment).catch((err) =>
      console.warn('[appointmentStore] Async insert to Supabase encountered error:', err)
    )
    return { ...appointment }
  },

  /**
   * Async variant of add ensuring Supabase write is awaited
   */
  async addAsync(appointment: Appointment): Promise<Appointment> {
    canonicalAppointments.push({ ...appointment })
    persistToStorage(canonicalAppointments)
    notifyListeners()
    await insertRemoteAppointment(appointment)
    return { ...appointment }
  },

  /**
   * Updates an existing appointment, persists to storage, notifies subscribers,
   * and synchronizes to Supabase Cloud
   */
  update(id: string, updates: Partial<Appointment>): Appointment | null {
    const index = canonicalAppointments.findIndex((a) => a.id === id)
    if (index === -1) return null

    canonicalAppointments[index] = {
      ...canonicalAppointments[index],
      ...updates,
    }
    persistToStorage(canonicalAppointments)
    notifyListeners()
    updateRemoteAppointment(id, updates).catch((err) =>
      console.warn('[appointmentStore] Async update to Supabase encountered error:', err)
    )
    return { ...canonicalAppointments[index] }
  },

  /**
   * Async variant of update ensuring Supabase write is awaited
   */
  async updateAsync(id: string, updates: Partial<Appointment>): Promise<Appointment | null> {
    const index = canonicalAppointments.findIndex((a) => a.id === id)
    if (index === -1) return null

    canonicalAppointments[index] = {
      ...canonicalAppointments[index],
      ...updates,
    }
    persistToStorage(canonicalAppointments)
    notifyListeners()
    await updateRemoteAppointment(id, updates)
    return { ...canonicalAppointments[index] }
  },

  /**
   * Removes an appointment by ID from the canonical store and Supabase Cloud
   */
  remove(id: string): boolean {
    const index = canonicalAppointments.findIndex((a) => a.id === id)
    if (index === -1) return false
    canonicalAppointments.splice(index, 1)
    persistToStorage(canonicalAppointments)
    notifyListeners()
    deleteRemoteAppointment(id).catch((err) =>
      console.warn('[appointmentStore] Async delete from Supabase encountered error:', err)
    )
    return true
  },

  /**
   * Async variant of remove ensuring Supabase deletion is awaited
   */
  async removeAsync(id: string): Promise<boolean> {
    const index = canonicalAppointments.findIndex((a) => a.id === id)
    if (index === -1) return false
    canonicalAppointments.splice(index, 1)
    persistToStorage(canonicalAppointments)
    notifyListeners()
    await deleteRemoteAppointment(id)
    return true
  },

  /**
   * Manually triggers synchronization with Supabase Cloud
   */
  async syncWithSupabase(): Promise<Appointment[]> {
    return syncWithSupabase()
  },

  /**
   * Subscribes to changes in the canonical appointment store
   */
  subscribe(listener: AppointmentListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Resets the store back to the baseline mock appointments (useful for tests)
   */
  resetToMock(): void {
    canonicalAppointments = seedWithEntitySnapshots(mockAppointments)
    persistToStorage(canonicalAppointments)
    notifyListeners()
  },

  /**
   * Reloads state directly from localStorage (simulates fresh app initialization)
   */
  reloadFromStorage(): void {
    canonicalAppointments = loadInitialAppointments()
    notifyListeners()
  },
}
