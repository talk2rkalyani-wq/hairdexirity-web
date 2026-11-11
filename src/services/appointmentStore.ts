import type { Appointment } from '../types/models.ts'
import { mockAppointments, mockClients, mockStaff, mockServices } from '../mockData/salonEntities.ts'
import { getSalonDateStr, getSalonTimeStr, timeToMinutes } from '../utils/formatters.ts'

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
 * Reads persisted appointments from localStorage if available,
 * otherwise initializes with mockAppointments with entity snapshots.
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
      } else {
        // Initial setup: persist baseline seed data with snapshots once
        const initial = seedWithEntitySnapshots(mockAppointments)
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
        return initial
      }
    }
  } catch (err) {
    console.warn('Failed to load appointments from localStorage:', err)
  }

  // Fallback to initial mock appointments
  return seedWithEntitySnapshots(mockAppointments)
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
   * Appends a newly created appointment, persists to storage, and notifies subscribers
   */
  add(appointment: Appointment): Appointment {
    canonicalAppointments.push({ ...appointment })
    persistToStorage(canonicalAppointments)
    notifyListeners()
    return { ...appointment }
  },

  /**
   * Updates an existing appointment, persists to storage, and notifies subscribers
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
    return { ...canonicalAppointments[index] }
  },

  /**
   * Removes an appointment by ID from the canonical store
   */
  remove(id: string): boolean {
    const index = canonicalAppointments.findIndex((a) => a.id === id)
    if (index === -1) return false
    canonicalAppointments.splice(index, 1)
    persistToStorage(canonicalAppointments)
    notifyListeners()
    return true
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
