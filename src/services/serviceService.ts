import type { Service, ServiceCategory, UserSession } from '../types/models.ts'
import { mockServices } from '../mockData/salonEntities.ts'
import { appointmentStore } from './appointmentStore.ts'
import { permissionService } from './permissionService.ts'
import { sessionService } from './sessionService.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'

const SERVICES_STORAGE_KEY = 'luma_salon_services_v1'

type ServiceListener = (services: Service[]) => void
const listeners = new Set<ServiceListener>()

function loadInitialServices(): Service[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(SERVICES_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load services from localStorage:', err)
  }
  return []
}

let servicesData: Service[] = loadInitialServices()

function persistServices(services: Service[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SERVICES_STORAGE_KEY, JSON.stringify(services))
    }
  } catch (err) {
    console.warn('Failed to save services to localStorage:', err)
  }
}

function notifyListeners() {
  const current = [...servicesData]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in service listener:', err)
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SERVICES_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          servicesData = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for services:', err)
      }
    }
  })
}

function resolveSession(session?: UserSession | null): UserSession | null {
  if (session !== undefined) return session
  return sessionService.getCurrentSession()
}

export const serviceService = {
  /**
   * Retrieves all available services with Supabase Cloud real-time sync
   */
  async getServices(): Promise<Service[]> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('services')
          .select('*')
          .order('name', { ascending: true })

        if (!error && data) {
          const remoteServices: Service[] = data.map((row: any) => ({
            id: row.id,
            salonId: row.salon_id || 'salon-luma-01',
            name: row.name,
            description: row.description || '',
            duration: Number(row.duration) || 30,
            price: Number(row.price) || 0,
            category: row.category as ServiceCategory,
            active: Boolean(row.active),
          }))

          // Auto sync local services to Supabase if remote is currently empty
          if (remoteServices.length === 0 && servicesData.length > 0) {
            for (const s of servicesData) {
              await supabase.from('services').insert({
                id: s.id,
                salon_id: s.salonId || 'salon-luma-01',
                name: s.name,
                description: s.description || '',
                duration: s.duration,
                price: s.price,
                category: s.category,
                active: s.active !== undefined ? s.active : true,
                updated_at: new Date().toISOString(),
              })
            }
            return [...servicesData]
          }

          servicesData = remoteServices
          persistServices(servicesData)
          return [...servicesData]
        }
      } catch (err) {
        console.warn('Error fetching services from Supabase:', err)
      }
    }
    return Promise.resolve([...servicesData])
  },

  /**
   * Retrieves active services only
   */
  async getActiveServices(): Promise<Service[]> {
    const all = await this.getServices()
    return all.filter((s) => s.active)
  },

  /**
   * Retrieves a service by ID
   */
  async getServiceById(id: string): Promise<Service | null> {
    const service = servicesData.find((s) => s.id === id)
    return Promise.resolve(service ? { ...service } : null)
  },

  /**
   * Retrieves services by category
   */
  async getServicesByCategory(category: ServiceCategory): Promise<Service[]> {
    const all = await this.getServices()
    return all.filter((s) => s.category === category && s.active)
  },

  /**
   * Creates a new service with Supabase Cloud persistence
   */
  async createService(
    newService: Omit<Service, 'id' | 'salonId'>
  ): Promise<Service> {
    const srvId = `srv-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const currentSession = sessionService.getCurrentSession()
    const salonId = currentSession?.salonId || 'salon-luma-01'

    const created: Service = {
      ...newService,
      id: srvId,
      salonId,
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('services').insert({
          id: srvId,
          salon_id: salonId,
          name: created.name,
          description: created.description || '',
          duration: created.duration,
          price: created.price,
          category: created.category,
          active: created.active !== undefined ? created.active : true,
          updated_at: new Date().toISOString(),
        })
        if (error) console.error('Error inserting service into Supabase:', error)
      } catch (err) {
        console.error('Network error creating service in Supabase:', err)
      }
    }

    servicesData.push(created)
    persistServices(servicesData)
    notifyListeners()
    return Promise.resolve({ ...created })
  },

  /**
   * Updates an existing service
   */
  async updateService(
    id: string,
    updates: Partial<Service>
  ): Promise<Service> {
    const index = servicesData.findIndex((s) => s.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Service with ID ${id} not found`))
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        }
        if (updates.name !== undefined) updatePayload.name = updates.name
        if (updates.description !== undefined) updatePayload.description = updates.description
        if (updates.duration !== undefined) updatePayload.duration = updates.duration
        if (updates.price !== undefined) updatePayload.price = updates.price
        if (updates.category !== undefined) updatePayload.category = updates.category
        if (updates.active !== undefined) updatePayload.active = updates.active

        const { error } = await supabase
          .from('services')
          .update(updatePayload)
          .eq('id', id)
        if (error) console.error('Error updating service in Supabase:', error)
      } catch (err) {
        console.error('Network error updating service in Supabase:', err)
      }
    }

    servicesData[index] = {
      ...servicesData[index],
      ...updates,
    }
    persistServices(servicesData)
    notifyListeners()
    return Promise.resolve({ ...servicesData[index] })
  },

  /**
   * Permanently deletes a single salon service.
   * Strictly enforces Owner-only authorization and blocks deletion
   * only if an upcoming or currently ongoing appointment references this service.
   */
  async deleteService(id: string, session?: UserSession | null): Promise<boolean> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteService(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete service offerings.'))
    }

    // Appointment protection rule: Block deletion if upcoming or active appointments exist
    if (appointmentStore.hasBlockingAppointmentsForService(id)) {
      return Promise.reject(
        new Error('Cannot delete this service because an upcoming or active appointment exists for this service.')
      )
    }

    const index = servicesData.findIndex((srv) => srv.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Service with ID ${id} not found`))
    }

    const targetService = servicesData[index]

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('services').delete().eq('id', id)
        if (error) console.error('Error deleting service from Supabase:', error)
      } catch (err) {
        console.error('Network error deleting service from Supabase:', err)
      }
    }

    // Snapshot service details into historical appointments before removing entity
    appointmentStore.snapshotServiceDetails(id, {
      name: targetService.name,
    })

    servicesData.splice(index, 1)
    persistServices(servicesData)
    notifyListeners()
    return Promise.resolve(true)
  },

  /**
   * Bulk permanently deletes multiple salon services.
   * Strictly enforces Owner-only authorization and blocks if any selected
   * service has an upcoming or currently ongoing appointment.
   */
  async deleteServices(
    ids: string[],
    session?: UserSession | null
  ): Promise<{ deletedCount: number; failedCount: number }> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteService(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete service offerings.'))
    }

    if (!ids || ids.length === 0) {
      return Promise.resolve({ deletedCount: 0, failedCount: 0 })
    }

    // Check if any selected service has upcoming or active appointments
    const blocked = servicesData.filter(
      (srv) => ids.includes(srv.id) && appointmentStore.hasBlockingAppointmentsForService(srv.id)
    )
    if (blocked.length > 0) {
      const names = blocked.map((s) => s.name).join(', ')
      return Promise.reject(
        new Error(`Cannot delete services because upcoming or active appointments exist for: ${names}`)
      )
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('services').delete().in('id', ids)
        if (error) console.error('Error bulk deleting services from Supabase:', error)
      } catch (err) {
        console.error('Network error bulk deleting services from Supabase:', err)
      }
    }

    // Snapshot details for all services to be deleted
    servicesData
      .filter((s) => ids.includes(s.id))
      .forEach((s) => {
        appointmentStore.snapshotServiceDetails(s.id, {
          name: s.name,
        })
      })

    const idSet = new Set(ids)
    const initialLen = servicesData.length
    servicesData = servicesData.filter((s) => !idSet.has(s.id))
    const deletedCount = initialLen - servicesData.length
    const failedCount = ids.length - deletedCount

    persistServices(servicesData)
    notifyListeners()
    return Promise.resolve({ deletedCount, failedCount })
  },

  /**
   * Subscribes to changes in the canonical services collection
   */
  subscribe(listener: ServiceListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Resets services to baseline mock dataset (useful for testing)
   */
  resetToMock(): void {
    servicesData = [...mockServices]
    persistServices(servicesData)
    notifyListeners()
  },

  /**
   * Reloads state directly from localStorage (simulates fresh app initialization)
   */
  reloadFromStorage(): void {
    servicesData = loadInitialServices()
    notifyListeners()
  },
}
