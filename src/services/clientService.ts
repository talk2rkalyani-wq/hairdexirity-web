import type { Client, UserSession } from '../types/models.ts'
import { mockClients } from '../mockData/salonEntities.ts'
import { appointmentStore } from './appointmentStore.ts'
import { permissionService } from './permissionService.ts'
import { sessionService } from './sessionService.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'

const CLIENTS_STORAGE_KEY = 'luma_salon_clients_v1'

type ClientListener = (clients: Client[]) => void
const listeners = new Set<ClientListener>()

function loadInitialClients(): Client[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(CLIENTS_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load clients from localStorage:', err)
  }
  return []
}

let clientsData: Client[] = loadInitialClients()

function persistClients(clients: Client[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients))
    }
  } catch (err) {
    console.warn('Failed to save clients to localStorage:', err)
  }
}

function notifyListeners() {
  const current = [...clientsData]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in client listener:', err)
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === CLIENTS_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          clientsData = parsed
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for clients:', err)
      }
    }
  })
}

function resolveSession(session?: UserSession | null): UserSession | null {
  if (session !== undefined) return session
  return sessionService.getCurrentSession()
}

export const clientService = {
  /**
   * Retrieves all clients with Supabase Cloud real-time sync
   */
  async getClients(): Promise<Client[]> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .order('name', { ascending: true })

        if (!error && data) {
          const remoteClients: Client[] = data.map((row: any) => ({
            id: row.id,
            salonId: row.salon_id || 'salon-luma-01',
            name: row.name,
            phone: row.phone || '',
            email: row.email || '',
            dateOfBirth: row.date_of_birth || undefined,
            preferences: (row.preferences as any) || {},
            notes: row.notes || '',
            createdAt: row.created_at || new Date().toISOString(),
            lastVisitAt: row.last_visit_at || undefined,
            totalSpend: Number(row.total_spend) || 0,
          }))

          // Auto sync local clients to Supabase if remote is currently empty
          if (remoteClients.length === 0 && clientsData.length > 0) {
            for (const c of clientsData) {
              await supabase.from('clients').insert({
                id: c.id,
                salon_id: c.salonId || 'salon-luma-01',
                name: c.name,
                phone: c.phone || '',
                email: c.email || '',
                date_of_birth: c.dateOfBirth || null,
                preferences: c.preferences || {},
                notes: c.notes || '',
                total_spend: c.totalSpend || 0,
                last_visit_at: c.lastVisitAt || null,
                updated_at: new Date().toISOString(),
              })
            }
            return [...clientsData]
          }

          clientsData = remoteClients
          persistClients(clientsData)
          return [...clientsData]
        }
      } catch (err) {
        console.warn('Error fetching clients from Supabase:', err)
      }
    }
    return Promise.resolve([...clientsData])
  },

  /**
   * Retrieves a client by ID
   */
  async getClientById(id: string): Promise<Client | null> {
    const client = clientsData.find((c) => c.id === id)
    return Promise.resolve(client ? { ...client } : null)
  },

  /**
   * Creates a new client profile with Supabase Cloud persistence
   */
  async createClient(
    data: Omit<Client, 'id' | 'salonId' | 'createdAt' | 'totalSpend'>
  ): Promise<Client> {
    const clientId = `cli-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const currentSession = sessionService.getCurrentSession()
    const salonId = currentSession?.salonId || 'salon-luma-01'

    const newClient: Client = {
      ...data,
      id: clientId,
      salonId,
      createdAt: new Date().toISOString(),
      totalSpend: 0,
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('clients').insert({
          id: clientId,
          salon_id: salonId,
          name: newClient.name,
          phone: newClient.phone || '',
          email: newClient.email || '',
          date_of_birth: newClient.dateOfBirth || null,
          preferences: newClient.preferences || {},
          notes: newClient.notes || '',
          total_spend: 0,
          last_visit_at: null,
          updated_at: new Date().toISOString(),
        })
        if (error) console.error('Error inserting client into Supabase:', error)
      } catch (err) {
        console.error('Network error creating client in Supabase:', err)
      }
    }

    clientsData.unshift(newClient)
    persistClients(clientsData)
    notifyListeners()
    return Promise.resolve({ ...newClient })
  },

  /**
   * Updates an existing client
   */
  async updateClient(
    id: string,
    updates: Partial<Client>
  ): Promise<Client | null> {
    const index = clientsData.findIndex((c) => c.id === id)
    if (index === -1) return Promise.resolve(null)

    if (isSupabaseConfigured() && supabase) {
      try {
        const updatePayload: Record<string, any> = {
          updated_at: new Date().toISOString(),
        }
        if (updates.name !== undefined) updatePayload.name = updates.name
        if (updates.phone !== undefined) updatePayload.phone = updates.phone
        if (updates.email !== undefined) updatePayload.email = updates.email
        if (updates.dateOfBirth !== undefined) updatePayload.date_of_birth = updates.dateOfBirth
        if (updates.preferences !== undefined) updatePayload.preferences = updates.preferences
        if (updates.notes !== undefined) updatePayload.notes = updates.notes
        if (updates.totalSpend !== undefined) updatePayload.total_spend = updates.totalSpend
        if (updates.lastVisitAt !== undefined) updatePayload.last_visit_at = updates.lastVisitAt

        const { error } = await supabase
          .from('clients')
          .update(updatePayload)
          .eq('id', id)
        if (error) console.error('Error updating client in Supabase:', error)
      } catch (err) {
        console.error('Network error updating client in Supabase:', err)
      }
    }

    clientsData[index] = { ...clientsData[index], ...updates }
    persistClients(clientsData)
    notifyListeners()
    return Promise.resolve({ ...clientsData[index] })
  },

  /**
   * Permanently deletes a single client profile.
   * Strictly enforces Owner-only authorization and blocks deletion
   * only if an upcoming or currently ongoing appointment references this client.
   */
  async deleteClient(id: string, session?: UserSession | null): Promise<boolean> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteClient(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete client records.'))
    }

    // Appointment protection rule: Block deletion if upcoming or active appointments exist
    if (appointmentStore.hasBlockingAppointmentsForClient(id)) {
      return Promise.reject(
        new Error('Cannot delete this client because an upcoming or active appointment exists for this client.')
      )
    }

    const index = clientsData.findIndex((c) => c.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`Client with ID ${id} not found.`))
    }

    const targetClient = clientsData[index]

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id)
        if (error) console.error('Error deleting client from Supabase:', error)
      } catch (err) {
        console.error('Network error deleting client from Supabase:', err)
      }
    }

    // Snapshot client details into historical appointments before removing entity
    appointmentStore.snapshotClientDetails(id, {
      name: targetClient.name,
      phone: targetClient.phone,
      email: targetClient.email,
    })

    clientsData.splice(index, 1)
    persistClients(clientsData)
    notifyListeners()
    return Promise.resolve(true)
  },

  /**
   * Bulk permanently deletes multiple client profiles.
   * Strictly enforces Owner-only authorization and blocks if any selected
   * client has an upcoming or currently ongoing appointment.
   */
  async deleteClients(
    ids: string[],
    session?: UserSession | null
  ): Promise<{ deletedCount: number; failedCount: number }> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteClient(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete client records.'))
    }

    if (!ids || ids.length === 0) {
      return Promise.resolve({ deletedCount: 0, failedCount: 0 })
    }

    // Check if any selected client has upcoming or active appointments
    const blocked = clientsData.filter(
      (c) => ids.includes(c.id) && appointmentStore.hasBlockingAppointmentsForClient(c.id)
    )
    if (blocked.length > 0) {
      const names = blocked.map((c) => c.name).join(', ')
      return Promise.reject(
        new Error(`Cannot delete clients because upcoming or active appointments exist for: ${names}`)
      )
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error } = await supabase.from('clients').delete().in('id', ids)
        if (error) console.error('Error bulk deleting clients from Supabase:', error)
      } catch (err) {
        console.error('Network error bulk deleting clients from Supabase:', err)
      }
    }

    // Snapshot details for all clients to be deleted
    clientsData
      .filter((c) => ids.includes(c.id))
      .forEach((c) => {
        appointmentStore.snapshotClientDetails(c.id, {
          name: c.name,
          phone: c.phone,
          email: c.email,
        })
      })

    const idSet = new Set(ids)
    const initialCount = clientsData.length
    clientsData = clientsData.filter((c) => !idSet.has(c.id))
    const deletedCount = initialCount - clientsData.length
    const failedCount = ids.length - deletedCount

    persistClients(clientsData)
    notifyListeners()
    return Promise.resolve({ deletedCount, failedCount })
  },

  /**
   * Subscribes to changes in the canonical client collection
   */
  subscribe(listener: ClientListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * AI-Ready helper: Finds clients who have not visited the salon in X days.
   * e.g. "Who hasn't visited in 60 days?"
   */
  async getClientsWithoutVisitSince(daysThreshold: number = 60): Promise<Client[]> {
    const now = new Date().getTime()
    const thresholdMs = daysThreshold * 24 * 60 * 60 * 1000

    const inactiveClients = clientsData.filter((client) => {
      if (!client.lastVisitAt) {
        const createdTime = new Date(client.createdAt).getTime()
        return now - createdTime >= thresholdMs
      }
      const lastVisitTime = new Date(client.lastVisitAt).getTime()
      return now - lastVisitTime >= thresholdMs
    })

    return Promise.resolve(inactiveClients)
  },

  /**
   * Searches clients by name, phone, or email
   */
  async searchClients(query: string): Promise<Client[]> {
    const lower = query.toLowerCase().trim()
    if (!lower) return Promise.resolve([...clientsData])

    const results = clientsData.filter(
      (c) =>
        c.name.toLowerCase().includes(lower) ||
        c.phone.includes(lower) ||
        c.email.toLowerCase().includes(lower)
    )
    return Promise.resolve(results)
  },

  /**
   * Retrieves all appointments for a specific client from the canonical appointment store
   */
  async getClientAppointments(clientId: string) {
    return Promise.resolve(appointmentStore.getByClientId(clientId))
  },

  /**
   * Resets clients to baseline mock dataset (useful for testing)
   */
  resetToMock(): void {
    clientsData = [...mockClients]
    persistClients(clientsData)
    notifyListeners()
  },

  /**
   * Reloads state directly from localStorage (simulates fresh app initialization)
   */
  reloadFromStorage(): void {
    clientsData = loadInitialClients()
    notifyListeners()
  },
}
