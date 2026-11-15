import type { Staff, WeeklySchedule } from '../types/models.ts'
import { mockStaff } from '../mockData/salonEntities.ts'
import { appointmentStore } from './appointmentStore.ts'
import { sessionService } from './sessionService.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'

const STAFF_STORAGE_KEY = 'staff_v2'

type StaffListener = (staff: Staff[]) => void
const listeners = new Set<StaffListener>()

const defaultWorkingHours: WeeklySchedule = {
  monday: { open: '10:00', close: '20:00', isOpen: true },
  tuesday: { open: '10:00', close: '20:00', isOpen: true },
  wednesday: { open: '10:00', close: '20:00', isOpen: true },
  thursday: { open: '10:00', close: '20:00', isOpen: true },
  friday: { open: '10:00', close: '21:00', isOpen: true },
  saturday: { open: '09:30', close: '21:00', isOpen: true },
  sunday: { open: '10:00', close: '20:00', isOpen: true },
}

function loadInitialStaff(): Staff[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(STAFF_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load staff from localStorage:', err)
  }
  return []
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
   * Retrieves all staff members.
   * Real-time sync with Supabase Cloud table 'staff'.
   */
  async getStaff(): Promise<Staff[]> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('staff')
          .select('*')
          .order('created_at', { ascending: true })

        if (!error && data) {
          const remoteStaff: Staff[] = data.map((row: any) => ({
            id: row.id,
            salonId: row.salon_id || 'salon-luma-01',
            name: row.name,
            phone: row.phone || '',
            email: row.email || '',
            role: row.role,
            skills: Array.isArray(row.skills) ? row.skills : [],
            experience: row.experience || '',
            active: Boolean(row.active),
            workingHours: row.working_hours || defaultWorkingHours,
            avatarUrl: row.avatar_url || undefined,
            gender: row.gender || undefined,
            jobTitle: row.job_title || undefined,
          }))

          // If Supabase is currently empty, but localStorage has newly created staff (like Sapna),
          // automatically push local staff to Supabase Cloud
          if (remoteStaff.length === 0 && staffData.length > 0) {
            for (const s of staffData) {
              const insertRow: Record<string, any> = {
                id: s.id,
                salon_id: s.salonId || 'salon-luma-01',
                name: s.name,
                phone: s.phone || '',
                email: s.email || '',
                role: s.role || 'senior_stylist',
                skills: s.skills || [],
                experience: s.experience || '',
                active: s.active !== undefined ? s.active : true,
                working_hours: s.workingHours || defaultWorkingHours,
                avatar_url: s.avatarUrl || null,
                gender: s.gender || null,
                job_title: s.jobTitle || null,
                updated_at: new Date().toISOString(),
              }
              const { error: insErr } = await supabase.from('staff').insert(insertRow)
              if (insErr && (insErr.message?.includes('gender') || insErr.message?.includes('job_title'))) {
                const { gender, job_title, ...fallback } = insertRow
                await supabase.from('staff').insert(fallback)
              }
            }
            return [...staffData]
          }

          staffData = remoteStaff
          persistStaff(staffData)
          return [...staffData]
        }
      } catch (err) {
        console.warn('Error fetching staff from Supabase:', err)
      }
    }
    return Promise.resolve([...staffData])
  },

  /**
   * Retrieves only currently active staff members
   */
  async getActiveStaff(): Promise<Staff[]> {
    const all = await this.getStaff()
    return all.filter((s) => s.active)
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
   * Creates a new staff member with real-time Supabase Cloud persistence
   */
  async createStaff(
    newStaff: Omit<Staff, 'id' | 'salonId' | 'workingHours'> & {
      id?: string
      workingHours?: WeeklySchedule
    }
  ): Promise<Staff> {
    const staffId = newStaff.id || `staff-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const currentSession = sessionService.getCurrentSession()
    const salonId = currentSession?.salonId || 'salon-luma-01'

    const created: Staff = {
      ...newStaff,
      id: staffId,
      salonId,
      skills: newStaff.skills || [],
      experience: newStaff.experience || '1 year',
      active: newStaff.active !== undefined ? newStaff.active : true,
      workingHours: newStaff.workingHours || defaultWorkingHours,
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const insertPayload: Record<string, any> = {
          id: staffId,
          salon_id: salonId,
          name: created.name,
          phone: created.phone || '',
          email: created.email || '',
          role: created.role || 'senior_stylist',
          skills: created.skills || [],
          experience: created.experience || '',
          active: created.active !== undefined ? created.active : true,
          working_hours: created.workingHours || defaultWorkingHours,
          avatar_url: created.avatarUrl || null,
          gender: created.gender || null,
          job_title: created.jobTitle || null,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('staff')
          .insert(insertPayload)

        if (error) {
          console.warn('Direct insert to Supabase staff table failed, attempting fallback:', error)
          if (error.message?.includes('gender') || error.message?.includes('job_title')) {
            const { gender, job_title, ...fallback } = insertPayload
            const { error: retryErr } = await supabase.from('staff').insert(fallback)
            if (retryErr) {
              console.error('Fallback insert to Supabase staff also failed:', retryErr)
            }
          }
        }
      } catch (err) {
        console.error('Network error creating staff in Supabase:', err)
      }
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

    if (isSupabaseConfigured() && supabase) {
      try {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        }
        if (updates.name !== undefined) updatePayload.name = updates.name
        if (updates.phone !== undefined) updatePayload.phone = updates.phone
        if (updates.email !== undefined) updatePayload.email = updates.email
        if (updates.role !== undefined) updatePayload.role = updates.role
        if (updates.skills !== undefined) updatePayload.skills = updates.skills
        if (updates.experience !== undefined) updatePayload.experience = updates.experience
        if (updates.active !== undefined) updatePayload.active = updates.active
        if (updates.workingHours !== undefined) updatePayload.working_hours = updates.workingHours
        if (updates.avatarUrl !== undefined) updatePayload.avatar_url = updates.avatarUrl
        if (updates.gender !== undefined) updatePayload.gender = updates.gender
        if (updates.jobTitle !== undefined) updatePayload.job_title = updates.jobTitle

        const { error } = await supabase
          .from('staff')
          .update(updatePayload)
          .eq('id', id)

        if (error && (error.message?.includes('gender') || error.message?.includes('job_title'))) {
          const { gender, job_title, ...fallback } = updatePayload
          await supabase.from('staff').update(fallback).eq('id', id)
        }
      } catch (err) {
        console.error('Error updating staff in Supabase:', err)
      }
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

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('staff').delete().eq('id', id)
        if (error) console.error('Error deleting staff from Supabase:', error)
      } catch (err) {
        console.error('Network error deleting staff from Supabase:', err)
      }
    }

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

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('staff').delete().in('id', ids)
        if (error) console.error('Error batch deleting staff from Supabase:', error)
      } catch (err) {
        console.error('Network error batch deleting staff from Supabase:', err)
      }
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



