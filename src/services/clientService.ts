import type { Client, UserSession } from '../types/models.ts'
import { mockClients } from '../mockData/salonEntities.ts'
import { appointmentStore } from './appointmentStore.ts'
import { permissionService } from './permissionService.ts'
import { sessionService } from './sessionService.ts'

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
      } else {
        const initial = [...mockClients]
        window.localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(initial))
        return initial
      }
    }
  } catch (err) {
    console.warn('Failed to load clients from localStorage:', err)
  }
  return [...mockClients]
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
   * Retrieves all clients
   */
  async getClients(): Promise<Client[]> {
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
   * Creates a new client profile
   */
  async createClient(
    data: Omit<Client, 'id' | 'salonId' | 'createdAt' | 'totalSpend'>
  ): Promise<Client> {
    const newClient: Client = {
      ...data,
      id: `cli-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      salonId: 'salon-luma-01',
      createdAt: new Date().toISOString(),
      totalSpend: 0,
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
