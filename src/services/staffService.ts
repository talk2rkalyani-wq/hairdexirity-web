import type { Staff, WeeklySchedule } from '../types/models.ts'
import { mockStaff } from '../mockData/salonEntities.ts'
import { appointmentStore } from './appointmentStore.ts'

const STAFF_STORAGE_KEY = 'staff_v2'

type StaffListener = (staff: Staff[]) => void
const listeners = new Set<StaffListener>()

function loadInitialStaff(): Staff[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STAFF_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      } else {
        const initial = [...mockStaff]
        window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(initial))
        return initial
      }
    }
  } catch (err) {
    console.warn('Failed to load staff from localStorage:', err)
  }
  return [...mockStaff]
}

let staffData: Staff[] = loadInitialStaff()

function persistStaff(data: Staff[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STAFF_STORAGE_KEY, JSON.stringify(data))
    }
  } catch (err) {
    console.warn('Failed to save staff to localStorage:', err)
  }
}

function notifyListeners() {
  const current = [...staffData]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in staff listener:', err)
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STAFF_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          staffData = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for staff:', err)
      }
    }
  })
}

// Helper: parse HH:mm to minutes since midnight
const timeToMinutes = (timeStr: string): number => {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + m
}

export const staffService = {
  /**
   * Retrieves all staff members
   */
  async getStaff(): Promise<Staff[]> {
    return Promise.resolve([...staffData])
  },

  /**
   * Retrieves only currently active staff members
   */
  async getActiveStaff(): Promise<Staff[]> {
    return Promise.resolve(staffData.filter((s) => s.active))
  },

  /**
   * Retrieves a staff member by ID
   */
  async getStaffById(id: string): Promise<Staff | null> {
    const staff = staffData.find((s) => s.id === id)
    return Promise.resolve(staff ? { ...staff } : null)
  },

  /**
   * AI-Ready helper: Finds stylists who do NOT have an overlapping appointment
   * on the specified date and time window.
   */
  async findAvailableStaff(
    date: string,
    startTime: string,
    durationMinutes: number = 60
  ): Promise<Staff[]> {
    const requestedStart = timeToMinutes(startTime)
    const requestedEnd = requestedStart + durationMinutes

    // Find appointments on that date that are active (not cancelled) from canonical store
    const activeAppointments = appointmentStore
      .getByDate(date)
      .filter((a) => a.status !== 'cancelled')

    const busyStaffIds = new Set(
      activeAppointments
        .filter((apt) => {
          const aptStart = timeToMinutes(apt.startTime)
          const aptEnd = timeToMinutes(apt.endTime)
          // Overlap check: start < otherEnd && end > otherStart
          return requestedStart < aptEnd && requestedEnd > aptStart
        })
        .map((apt) => apt.staffId)
    )

    const availableStaff = staffData.filter(
      (staff) => staff.active && !busyStaffIds.has(staff.id)
    )

    return Promise.resolve(availableStaff)
  },

  /**
   * Creates a new staff member
   */
  async createStaff(
    newStaff: Omit<Staff, 'id' | 'salonId' | 'workingHours'> & {
      id?: string
      workingHours?: WeeklySchedule
    }
  ): Promise<Staff> {
    const defaultHours = staffData[0]?.workingHours || {
      monday: { open: '10:00', close: '20:00', isOpen: true },
      tuesday: { open: '10:00', close: '20:00', isOpen: true },
      wednesday: { open: '10:00', close: '20:00', isOpen: true },
      thursday: { open: '10:00', close: '20:00', isOpen: true },
      friday: { open: '10:00', close: '21:00', isOpen: true },
      saturday: { open: '09:30', close: '21:00', isOpen: true },
      sunday: { open: '10:00', close: '20:00', isOpen: true },
    }

    const created: Staff = {
      ...newStaff,
      id: newStaff.id || `staff-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      salonId: 'salon-luma-01',
      skills: newStaff.skills || [],
      experience: newStaff.experience || '1 year',
      active: newStaff.active !== undefined ? newStaff.active : true,
      workingHours: newStaff.workingHours || defaultHours,
    }
    staffData.push(created)
    persistStaff(staffData)
    notifyListeners()
    return Promise.resolve({ ...created })
  },

  /**
   * Updates an existing staff member's details
   */
  async updateStaff(
    id: string,
    updates: Partial<Staff>
  ): Promise<Staff> {
    const index = staffData.findIndex((s) => s.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Staff member with ID ${id} not found`))
    }
    staffData[index] = {
      ...staffData[index],
      ...updates,
    }
    persistStaff(staffData)
    notifyListeners()
    return Promise.resolve({ ...staffData[index] })
  },

  /**
   * Capability matching helper: Determines whether a stylist can perform a particular service.
   * Compares skill names against service name, ID, or category keywords.
   */
  canStaffPerformService(staff: Staff, serviceNameOrKeyword: string): boolean {
    if (!staff.skills || staff.skills.length === 0) return false
    const query = serviceNameOrKeyword.toLowerCase().trim()
    return staff.skills.some((skill) => {
      const s = skill.toLowerCase().trim()
      return s.includes(query) || query.includes(s)
    })
  },

  /**
   * AI-Ready helper: Finds active stylists capable of performing a specific service.
   * e.g. "Find an available stylist for balayage"
   */
  async getStaffForService(serviceNameOrKeyword: string): Promise<Staff[]> {
    const activeStaff = await this.getActiveStaff()
    return activeStaff.filter((staff) =>
      this.canStaffPerformService(staff, serviceNameOrKeyword)
    )
  },

  /**
   * Deletes a staff member by ID
   */
  async deleteStaff(id: string): Promise<boolean> {
    if (appointmentStore.hasBlockingAppointmentsForStaff(id)) {
      return Promise.reject(
        new Error('Cannot delete this employee because an upcoming or active appointment exists for this employee.')
      )
    }

    const index = staffData.findIndex((s) => s.id === id)
    if (index === -1) return Promise.resolve(false)

    // Snapshot staff details into historical appointments before removing entity
    appointmentStore.snapshotStaffDetails(id, {
      name: staffData[index].name,
    })

    staffData.splice(index, 1)
    persistStaff(staffData)
    notifyListeners()
    return Promise.resolve(true)
  },

  /**
   * Deletes multiple staff members by IDs
   */
  async deleteStaffBatch(ids: string[]): Promise<number> {
    if (!ids || ids.length === 0) return Promise.resolve(0)

    const blocked = staffData.filter(
      (s) => ids.includes(s.id) && appointmentStore.hasBlockingAppointmentsForStaff(s.id)
    )
    if (blocked.length > 0) {
      const names = blocked.map((s) => s.name).join(', ')
      return Promise.reject(
        new Error(`Cannot delete employees because upcoming or active appointments exist for: ${names}`)
      )
    }

    // Snapshot details for all staff to be deleted
    staffData
      .filter((s) => ids.includes(s.id))
      .forEach((s) => {
        appointmentStore.snapshotStaffDetails(s.id, {
          name: s.name,
        })
      })

    const idSet = new Set(ids)
    const initialLen = staffData.length
    staffData = staffData.filter((s) => !idSet.has(s.id))
    const deletedCount = initialLen - staffData.length
    persistStaff(staffData)
    notifyListeners()
    return Promise.resolve(deletedCount)
  },

  /**
   * Subscribes to changes in staffData
   */
  subscribe(listener: StaffListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Resets staffData to initial mockStaff (useful for tests)
   */
  resetToMock(): void {
    staffData = [...mockStaff]
    persistStaff(staffData)
    notifyListeners()
  },

  /**
   * Reloads state directly from localStorage (simulates fresh app initialization)
   */
  reloadFromStorage(): void {
    staffData = loadInitialStaff()
    notifyListeners()
  },
}



