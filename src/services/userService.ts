import type { User, EmployeeSpecialty, UserSession, UserRole, OwnerDesignation } from '../types/models'
import { mockUsers } from '../mockData/usersData'
import { permissionService } from './permissionService'
import { staffService } from './staffService'
import { credentialService, DEFAULT_TEST_PASSWORD } from './credentialService'
import { sessionService } from './sessionService'
import { appointmentStore } from './appointmentStore'
import { isPlaceholderEmail } from '../utils/authUtils'
import { isRootAdminEmail } from '../config/adminConfig'
import { createClient } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

function resolveSession(session?: UserSession | null): UserSession | null {
  if (session !== undefined) return session
  return sessionService.getCurrentSession()
}

const USERS_STORAGE_KEY = 'luma_salon_users_v3'

type UserListener = (users: User[]) => void
const listeners = new Set<UserListener>()

function loadInitialUsers(): User[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      // Clean up legacy storage versions
      window.localStorage.removeItem('luma_salon_users_v1')
      window.localStorage.removeItem('luma_salon_users_v2')

      const stored = window.localStorage.getItem(USERS_STORAGE_KEY)
      if (stored !== null) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed.filter((u: User) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email))
        }
      } else {
        const initial = mockUsers.filter((u) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email))
        window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial))
        return initial
      }
    }
  } catch (err) {
    console.warn('Failed to load users from localStorage:', err)
  }
  return mockUsers.filter((u) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email))
}

let canonicalUsers: User[] = loadInitialUsers()

function persistUsers(users: User[]) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
    }
  } catch (err) {
    console.warn('Failed to save users to localStorage:', err)
  }
}

function notifyListeners() {
  const current = [...canonicalUsers]
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in user listener:', err)
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === USERS_STORAGE_KEY && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue)
        if (Array.isArray(parsed)) {
          canonicalUsers = parsed.filter((u: User) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email))
          notifyListeners()
        }
      } catch (err) {
        console.warn('Error parsing storage event for users:', err)
      }
    }
  })
}

export const userService = {
  /**
   * Retrieves all users in the salon.
   * Fetches real-time profiles directly from Supabase Cloud when configured.
   * STRICT POLICY: Root Administrator is NEVER listed in the salon user list.
   */
  async getUsers(): Promise<User[]> {
    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .order('created_at', { ascending: true })

        if (!error && data) {
          const remoteUsers: User[] = data.map((row: Record<string, unknown>) => {
            const cached = canonicalUsers.find(
              (c) => c.id === row.id || c.email?.toLowerCase() === (row.email as string)?.toLowerCase()
            )
            return {
              id: row.id as string,
              salonId: (row.salon_id as string) || 'salon-luma-01',
              name: row.name as string,
              email: row.email as string,
              role: row.role as UserRole,
              phone: cached?.phone || undefined,
              ownerDesignation: (row.owner_designation as OwnerDesignation) || undefined,
              employeeId: (row.employee_id as string) || undefined,
              specialty: (row.specialty as EmployeeSpecialty) || undefined,
              active: Boolean(row.active),
              avatarUrl: (row.avatar_url as string) || undefined,
              createdAt: (row.created_at as string) || new Date().toISOString(),
              updatedAt: (row.updated_at as string) || undefined,
              authUserId: (row.auth_user_id as string) || undefined,
            }
          })

          canonicalUsers = remoteUsers
          persistUsers(canonicalUsers)
          return remoteUsers.filter((u) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email))
        }
      } catch (err) {
        console.warn('[userService] Failed to load users from Supabase, returning local cache:', err)
      }
    }
    return Promise.resolve(canonicalUsers.filter((u) => u.role !== 'ADMIN' && !isRootAdminEmail(u.email)))
  },

  /**
   * Retrieves active users in the salon.
   * Strictly excludes Root Administrator.
   */
  async getActiveUsers(): Promise<User[]> {
    const all = await this.getUsers()
    return all.filter((u) => u.active)
  },

  /**
   * Retrieves users filtered by role.
   * ADMIN is not a salon user role and returns empty.
   */
  async getUsersByRole(role: User['role']): Promise<User[]> {
    if (role === 'ADMIN') return []
    const all = await this.getUsers()
    return all.filter((u) => u.role === role)
  },

  /**
   * Retrieves a user by their user ID
   */
  async getUserById(id: string): Promise<User | null> {
    const all = await this.getUsers()
    const found = all.find((u) => u.id === id)
    return found ? { ...found } : null
  },

  /**
   * Retrieves a user by their email address
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const normalized = email.trim().toLowerCase()
    if (isRootAdminEmail(normalized)) {
      return null
    }
    const all = await this.getUsers()
    const found = all.find((u) => u.email.toLowerCase() === normalized)
    return found ? { ...found } : null
  },

  /**
   * Retrieves a user by linked employee/staff ID
   */
  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    const all = await this.getUsers()
    const found = all.find((u) => u.employeeId === employeeId)
    return found ? { ...found } : null
  },

  /**
   * Creates a new user account supporting any valid salon role (OWNER, RECEPTIONIST, EMPLOYEE).
   * Fully integrated with Supabase Auth (Cloud) and public.users PostgreSQL table.
   */
  async createUser(
    data: {
      name: string
      email: string
      role: UserRole
      phone?: string
      specialty?: EmployeeSpecialty
      skills?: string[]
      initialPassword?: string
      ownerDesignation?: OwnerDesignation
    },
    session?: UserSession | null
  ): Promise<User> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(
        new Error('Unauthorized: Authentication required to create user accounts.')
      )
    }

    // STRICT ROLE SEPARATION:
    // 1. Root Administrator (talk2rkalyani@gmail.com) can ONLY create Salon Owner credentials.
    if (s.role === 'ADMIN') {
      if (data.role !== 'OWNER') {
        return Promise.reject(
          new Error('Forbidden: The Root Administrator can only create Salon Owner credentials.')
        )
      }
      const existingOwners = (await this.getUsers()).filter((u) => u.role === 'OWNER')
      if (existingOwners.length >= 2 && !existingOwners.some((o) => o.ownerDesignation === data.ownerDesignation)) {
        return Promise.reject(
          new Error('Cannot create owner: Salon already has the maximum allowed 2 owners.')
        )
      }
    } else if (s.role === 'OWNER') {
      // 2. Salon Owners create employees/staff and receptionists, but CANNOT create other Owners or Admins.
      if (data.role === 'OWNER') {
        return Promise.reject(
          new Error('Forbidden: Only the Root Administrator can create or provision Salon Owner accounts.')
        )
      }
      if (data.role === 'ADMIN') {
        return Promise.reject(
          new Error('Forbidden: Administrator accounts cannot be created from this interface.')
        )
      }
    } else {
      return Promise.reject(
        new Error('Unauthorized: Only salon owners or administrators can create user accounts.')
      )
    }

    if (!data.name || !data.name.trim()) {
      return Promise.reject(new Error('User name is required.'))
    }
    if (!data.email || !data.email.includes('@')) {
      return Promise.reject(new Error('Valid email address is required.'))
    }

    const normalizedEmail = data.email.trim().toLowerCase()
    if (isPlaceholderEmail(normalizedEmail)) {
      return Promise.reject(
        new Error('Placeholder email addresses (@hairdexirity.example.com) cannot be used for user creation. A verified email address is required.')
      )
    }

    const existingUsers = await this.getUsers()
    if (existingUsers.some((u) => u.email.toLowerCase() === normalizedEmail && u.ownerDesignation !== data.ownerDesignation)) {
      return Promise.reject(
        new Error(`A user with email ${data.email} already exists.`)
      )
    }

    const timestamp = Date.now()
    const randomSuffix = Math.floor(1000 + Math.random() * 9000)
    let newUserId = `user-${timestamp}-${randomSuffix}`
    let newStaffId: string | undefined = undefined
    let authUserId: string | undefined = undefined

    // 1. If role is EMPLOYEE, create matching staff profile in staffService
    if (data.role === 'EMPLOYEE') {
      newStaffId = `staff-${timestamp}-${randomSuffix}`
      await staffService.createStaff({
        id: newStaffId,
        name: data.name.trim(),
        phone: data.phone?.trim() || '+91 98110 00000',
        email: normalizedEmail,
        role: 'junior_stylist',
        skills: data.skills && data.skills.length > 0 ? data.skills : [`${data.specialty || 'Hair'} Specialist`],
        experience: '1 year',
        active: true,
      })
    }

    // 2. Build canonical user profile
    const existingOwners = (await this.getUsers()).filter((u) => u.role === 'OWNER')
    const ownerDesig = data.role === 'OWNER'
      ? (data.ownerDesignation || (existingOwners.length === 0 ? 'OWNER_1' : 'OWNER_2'))
      : undefined

    if (data.role === 'OWNER' && ownerDesig) {
      newUserId = `user-owner-${ownerDesig.toLowerCase().replace('_', '-')}`
    }

    // 3. Supabase Cloud Integration (Auth signup + database table synchronization)
    if (isSupabaseConfigured() && supabase) {
      // Step A: Register auth credentials in Supabase Auth via non-persisting client
      const sbUrl = import.meta.env.VITE_SUPABASE_URL
      const sbKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY
      if (sbUrl && sbKey) {
        try {
          const tempAuthClient = createClient(sbUrl, sbKey, {
            auth: {
              persistSession: false,
              autoRefreshToken: false,
              detectSessionInUrl: false,
            },
          })
          const { data: authData, error: authErr } = await tempAuthClient.auth.signUp({
            email: normalizedEmail,
            password: data.initialPassword || DEFAULT_TEST_PASSWORD,
            options: {
              data: {
                name: data.name.trim(),
                role: data.role,
                owner_designation: ownerDesig || null,
              },
            },
          })
          if (!authErr && authData?.user) {
            authUserId = authData.user.id
          } else if (authErr) {
            if (!authErr.message.toLowerCase().includes('already registered')) {
              console.warn('[userService] Supabase auth signUp notice:', authErr.message)
            }
          }
        } catch (authErr) {
          console.warn('[userService] Supabase auth registration notice:', authErr)
        }
      }

      // Step B: Persist to Supabase public.users table
      try {
        let existingDbRecord: Record<string, unknown> | null = null
        if (ownerDesig) {
          const { data: byDesig } = await supabase
            .from('users')
            .select('*')
            .eq('owner_designation', ownerDesig)
            .maybeSingle()
          existingDbRecord = byDesig
        }
        if (!existingDbRecord && newUserId) {
          const { data: byId } = await supabase
            .from('users')
            .select('*')
            .eq('id', newUserId)
            .maybeSingle()
          existingDbRecord = byId
        }
        if (!existingDbRecord) {
          const { data: byEmail } = await supabase
            .from('users')
            .select('*')
            .eq('email', normalizedEmail)
            .maybeSingle()
          existingDbRecord = byEmail
        }

        if (existingDbRecord) {
          const { data: updatedRow, error: updateErr } = await supabase
            .from('users')
            .update({
              name: data.name.trim(),
              email: normalizedEmail,
              auth_user_id: authUserId || (existingDbRecord.auth_user_id as string) || null,
              role: data.role,
              owner_designation: ownerDesig || (existingDbRecord.owner_designation as string) || null,
              active: true,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingDbRecord.id)
            .select()
            .single()

          if (updateErr) {
            throw new Error(`Database error updating owner profile: ${updateErr.message}`)
          }
          if (updatedRow) {
            newUserId = updatedRow.id
          }
        } else {
          const { data: insertedRow, error: insertErr } = await supabase
            .from('users')
            .insert({
              id: newUserId,
              salon_id: 'salon-luma-01',
              name: data.name.trim(),
              email: normalizedEmail,
              role: data.role,
              owner_designation: ownerDesig || null,
              employee_id: newStaffId || null,
              specialty: data.role === 'EMPLOYEE' ? data.specialty || null : null,
              auth_user_id: authUserId || null,
              active: true,
            })
            .select()
            .single()

          if (insertErr) {
            throw new Error(`Database error creating owner profile: ${insertErr.message}`)
          }
          if (insertedRow) {
            newUserId = insertedRow.id
          }
        }
      } catch (dbErr: unknown) {
        const msg = dbErr instanceof Error ? dbErr.message : 'Database error while saving user profile.'
        console.error('[userService] Supabase database error:', msg)
        throw new Error(msg)
      }
    }

    // 4. Build trusted local User model
    const newUser: User = {
      id: newUserId,
      salonId: 'salon-luma-01',
      name: data.name.trim(),
      email: normalizedEmail,
      phone: data.phone?.trim() || undefined,
      role: data.role,
      ownerDesignation: ownerDesig,
      employeeId: newStaffId,
      specialty: data.role === 'EMPLOYEE' ? data.specialty : undefined,
      active: true,
      createdAt: new Date().toISOString(),
      authUserId,
    }

    await credentialService.registerUserCredentials(newUserId, normalizedEmail, data.initialPassword)

    canonicalUsers = canonicalUsers.filter((u) => u.id !== newUserId && u.email.toLowerCase() !== normalizedEmail)
    canonicalUsers.push(newUser)
    persistUsers(canonicalUsers)
    notifyListeners()

    return newUser
  },

  /**
   * Creates a new employee user account and matching staff record.
   * Backward-compatible convenience method.
   */
  async createEmployee(
    data: {
      name: string
      email: string
      specialty: EmployeeSpecialty
      skills?: string[]
      phone?: string
      initialPassword?: string
    },
    session?: UserSession | null
  ): Promise<User> {
    return this.createUser(
      {
        ...data,
        role: 'EMPLOYEE',
      },
      session
    )
  },

  /**
   * Updates an employee user profile.
   * Strictly enforces permission: Only OWNER can edit employee profiles.
   */
  async updateUser(id: string, updates: Partial<User>, session?: UserSession | null): Promise<User> {
    const s = resolveSession(session)
    if (!permissionService.canEditEmployee(s)) {
      return Promise.reject(
        new Error('Unauthorized: Only salon owners or administrators can edit user accounts.')
      )
    }

    const index = canonicalUsers.findIndex((u) => u.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`User with ID ${id} not found.`))
    }

    const targetUser = canonicalUsers[index]
    if ((targetUser.role === 'OWNER' || targetUser.role === 'ADMIN') && !permissionService.canManageOwners(s)) {
      return Promise.reject(
        new Error('Forbidden: Only the system administrator can edit owner or administrator accounts.')
      )
    }

    // Safety: Forbid altering privileged identity/tenant fields through ordinary profile edit
    const safeUpdates = { ...updates }
    delete safeUpdates.id
    delete safeUpdates.role
    delete (safeUpdates as Record<string, unknown>).salonId
    delete (safeUpdates as Record<string, unknown>).salon_id
    delete (safeUpdates as Record<string, unknown>).ownerDesignation
    delete (safeUpdates as Record<string, unknown>).owner_designation
    delete (safeUpdates as Record<string, unknown>).employeeId
    delete (safeUpdates as Record<string, unknown>).employee_id
    delete (safeUpdates as Record<string, unknown>).auth_user_id

    canonicalUsers[index] = {
      ...canonicalUsers[index],
      ...safeUpdates,
    }

    persistUsers(canonicalUsers)
    notifyListeners()

    return Promise.resolve({ ...canonicalUsers[index] })
  },

  /**
   * Activates or deactivates an employee user.
   * Strictly enforces permission: Only OWNER can deactivate employees.
   */
  async toggleUserActive(id: string, active: boolean, session?: UserSession | null): Promise<User> {
    const s = resolveSession(session)
    if (!permissionService.canDeactivateEmployee(s)) {
      return Promise.reject(
        new Error('Unauthorized: Only salon owners or administrators can change user activation status.')
      )
    }

    const index = canonicalUsers.findIndex((u) => u.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`User with ID ${id} not found.`))
    }

    const targetUser = canonicalUsers[index]
    if (targetUser.role === 'ADMIN' || isRootAdminEmail(targetUser.email)) {
      return Promise.reject(new Error('Forbidden: Root Administrator account cannot be deactivated.'))
    }
    if (targetUser.role === 'OWNER') {
      if (!permissionService.canManageOwners(s)) {
        return Promise.reject(
          new Error('Forbidden: Only the system administrator can change owner account status.')
        )
      }
      if (!active) {
        const activeOwners = canonicalUsers.filter((u) => u.role === 'OWNER' && u.active)
        if (activeOwners.length <= 1) {
          return Promise.reject(new Error('Cannot deactivate the last active owner account.'))
        }
      }
    }

    if (isSupabaseConfigured() && supabase) {
      try {
        const { error: dbErr } = await supabase
          .from('users')
          .update({
            active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)

        if (dbErr) {
          throw new Error(`Database error updating status: ${dbErr.message}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error updating status.'
        console.error('[userService] Supabase toggleUserActive error:', msg)
        throw new Error(msg)
      }
    }

    canonicalUsers[index].active = active

    // Also toggle matching staff record if linked
    if (canonicalUsers[index].employeeId) {
      try {
        await staffService.updateStaff(canonicalUsers[index].employeeId!, { active })
      } catch (err) {
        console.warn('Failed to synchronize staff active state:', err)
      }
    }

    persistUsers(canonicalUsers)
    notifyListeners()

    return Promise.resolve({ ...canonicalUsers[index] })
  },

  /**
   * Permanently deletes a single user account.
   * Strictly enforces Owner-only authorization, Last Owner protection,
   * and appointment history reference checks for employees.
   */
  async deleteUser(id: string, session?: UserSession | null): Promise<boolean> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteUser(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete user accounts.'))
    }

    const index = canonicalUsers.findIndex((u) => u.id === id)
    if (index === -1) {
      return Promise.reject(new Error(`User with ID ${id} not found.`))
    }

    const targetUser = canonicalUsers[index]

    // Root Administrator and Owner Account Protection Rules
    if (targetUser.role === 'ADMIN' || isRootAdminEmail(targetUser.email)) {
      return Promise.reject(new Error('Forbidden: Root Administrator account cannot be deleted.'))
    }
    if (targetUser.role === 'OWNER') {
      if (!permissionService.canManageOwners(s)) {
        return Promise.reject(
          new Error('Forbidden: Only the system administrator can manage salon owner accounts.')
        )
      }
      // System Administrator can release/delete owner accounts to free up provisioned slots
    }

    // Appointment Reference Protection: If employee has upcoming or active appointments, block deletion
    if (targetUser.role === 'EMPLOYEE') {
      const staffRefId = targetUser.employeeId || targetUser.id
      if (
        appointmentStore.hasBlockingAppointmentsForStaff(staffRefId) ||
        appointmentStore.hasBlockingAppointmentsForStaff(targetUser.id)
      ) {
        return Promise.reject(
          new Error('Cannot delete this employee because an upcoming or active appointment exists for this employee.')
        )
      }
    }

    // Snapshot staff details into historical appointments
    const staffId = targetUser.employeeId || targetUser.id
    appointmentStore.snapshotStaffDetails(staffId, {
      name: targetUser.name,
    })

    // 1. If employee, remove matching staff profile in staffService
    if (targetUser.employeeId) {
      try {
        await staffService.deleteStaff(targetUser.employeeId)
      } catch (err) {
        console.warn('Failed to clean up staff record for deleted employee:', err)
      }
    }

    // 2. Remove credentials in credentialService
    try {
      await credentialService.removeUserCredentials(targetUser.id)
    } catch (err) {
      console.warn('Failed to purge credentials for deleted user:', err)
    }

    // 3. Delete from Supabase public.users table
    if (isSupabaseConfigured() && supabase) {
      try {
        const { error: dbErr } = await supabase
          .from('users')
          .delete()
          .eq('id', id)

        if (dbErr) {
          throw new Error(`Database error deleting user: ${dbErr.message}`)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Database error deleting user.'
        console.error('[userService] Supabase deleteUser error:', msg)
        throw new Error(msg)
      }
    }

    // 4. Remove from canonical users list
    canonicalUsers.splice(index, 1)
    persistUsers(canonicalUsers)
    notifyListeners()

    return Promise.resolve(true)
  },

  /**
   * Bulk permanently deletes multiple user accounts.
   * Strictly enforces Owner-only authorization, Last Owner protection,
   * and appointment reference checks for employees across the batch.
   */
  async deleteUsers(
    ids: string[],
    session?: UserSession | null
  ): Promise<{ deletedCount: number; failedCount: number }> {
    const s = resolveSession(session)
    if (!s || !s.isAuthenticated) {
      return Promise.reject(new Error('Unauthorized: Please log in to delete records.'))
    }
    if (!permissionService.canDeleteUser(s)) {
      return Promise.reject(new Error('Forbidden: Only salon owners can delete user accounts.'))
    }

    if (!ids || ids.length === 0) {
      return Promise.resolve({ deletedCount: 0, failedCount: 0 })
    }

    const idSet = new Set(ids)
    const targets = canonicalUsers.filter((u) => idSet.has(u.id))

    // Root Administrator Protection check across batch
    if (targets.some((u) => u.role === 'ADMIN')) {
      return Promise.reject(new Error('Forbidden: Root Administrator account cannot be deleted.'))
    }

    // Owner Account Management check across batch
    const ownersInBatch = targets.filter((u) => u.role === 'OWNER')
    if (ownersInBatch.length > 0) {
      if (!permissionService.canManageOwners(s)) {
        return Promise.reject(
          new Error('Forbidden: Only the system administrator can delete salon owner accounts.')
        )
      }
      const totalOwners = canonicalUsers.filter((u) => u.role === 'OWNER').length
      if (totalOwners - ownersInBatch.length < 1) {
        return Promise.reject(new Error('Cannot delete the last owner account.'))
      }
    }

    // Appointment Reference Protection check across entire batch:
    // Block only if employee has upcoming or active appointments
    const blockedEmployees = targets.filter((u) => {
      if (u.role === 'EMPLOYEE') {
        const staffRefId = u.employeeId || u.id
        return (
          appointmentStore.hasBlockingAppointmentsForStaff(staffRefId) ||
          appointmentStore.hasBlockingAppointmentsForStaff(u.id)
        )
      }
      return false
    })
    if (blockedEmployees.length > 0) {
      const names = blockedEmployees.map((u) => u.name).join(', ')
      return Promise.reject(
        new Error(`Cannot delete employees because upcoming or active appointments exist for: ${names}`)
      )
    }

    // Snapshot staff details for historical appointments before removing
    targets.forEach((u) => {
      if (u.role === 'EMPLOYEE') {
        const staffRefId = u.employeeId || u.id
        appointmentStore.snapshotStaffDetails(staffRefId, {
          name: u.name,
        })
      }
    })

    // Clean up staff profiles and credentials
    const staffIdsToDelete: string[] = []
    const userIdsToDelete: string[] = []
    targets.forEach((u) => {
      userIdsToDelete.push(u.id)
      if (u.employeeId) staffIdsToDelete.push(u.employeeId)
    })

    if (staffIdsToDelete.length > 0) {
      try {
        await staffService.deleteStaffBatch(staffIdsToDelete)
      } catch (err) {
        console.warn('Failed to clean up batch staff records:', err)
      }
    }

    try {
      await credentialService.removeUserCredentialsBatch(userIdsToDelete)
    } catch (err) {
      console.warn('Failed to purge batch user credentials:', err)
    }

    const initialLen = canonicalUsers.length
    canonicalUsers = canonicalUsers.filter((u) => !idSet.has(u.id))
    const deletedCount = initialLen - canonicalUsers.length
    const failedCount = ids.length - deletedCount

    persistUsers(canonicalUsers)
    notifyListeners()

    return Promise.resolve({ deletedCount, failedCount })
  },

  /**
   * Subscribes to user collection changes
   */
  subscribe(listener: UserListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  /**
   * Resets users to initial mock dataset (useful for testing)
   */
  resetToMock(): void {
    canonicalUsers = [...mockUsers]
    persistUsers(canonicalUsers)
    notifyListeners()
  },

  /**
   * Reloads state directly from localStorage (simulates fresh app initialization)
   */
  reloadFromStorage(): void {
    canonicalUsers = loadInitialUsers()
    notifyListeners()
  },
}

