import type { CredentialRecord } from '../types/models.ts'
import { mockUsers } from '../mockData/usersData.ts'
import { ROOT_ADMIN_CONFIG } from '../config/adminConfig.ts'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'

export const DEFAULT_TEST_PASSWORD = 'Luma@2026!'

/**
 * Computes a SHA-256 digest using standard Web Crypto API.
 * Used strictly for in-memory fallback comparison in demo/test environments.
 * NEVER persisted to localStorage.
 */
async function computeHash(text: string): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(text)
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(64, '0')
}

/**
 * Generates a salted hash for a password (in-memory demo fallback only)
 */
export async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  return computeHash(`${password}:${salt}`)
}

/**
 * Pure in-memory credentials for offline/demo/test environments.
 * CRITICAL SECURITY COMPLIANCE (Phase 2.2):
 * Passwords, salts, and hashes are STRICTLY FORBIDDEN from being persisted to browser localStorage.
 */
let inMemoryCredentials: CredentialRecord[] = []
let hasInitialized = false

/**
 * Ensures any legacy credential storage keys are completely expunged from the browser.
 */
function purgeLegacyCredentialStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('luma_salon_auth_creds_v1')
      window.localStorage.removeItem('luma_salon_auth_creds_v2')
      window.localStorage.removeItem('luma_salon_auth_creds_v3')
    }
  } catch (err) {
    console.warn('Failed to purge legacy credentials from storage:', err)
  }
}

/**
 * Reads any locally stored demo users from localStorage so their credentials
 * can be verified in offline Demo Mode across page reloads.
 */
function getStoredLocalUsers(): Array<{ id: string; email: string; createdAt?: string }> {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem('luma_salon_users_v3')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          return parsed
        }
      }
    }
  } catch (err) {
    console.warn('Failed to inspect local users for credentials:', err)
  }
  return []
}

/**
 * Initializes in-memory baseline credentials.
 */
async function initializeCredentials(): Promise<CredentialRecord[]> {
  if (hasInitialized && inMemoryCredentials.length > 0) {
    return inMemoryCredentials
  }

  purgeLegacyCredentialStorage()
  hasInitialized = true

  const seeded: CredentialRecord[] = []
  const adminSalt = `salt-${ROOT_ADMIN_CONFIG.id}`
  const adminHash = await hashPasswordWithSalt(DEFAULT_TEST_PASSWORD, adminSalt)
  seeded.push({
    userId: ROOT_ADMIN_CONFIG.id,
    email: ROOT_ADMIN_CONFIG.email.toLowerCase(),
    salt: adminSalt,
    passwordHash: adminHash,
    updatedAt: new Date().toISOString(),
  })

  for (const user of mockUsers) {
    const salt = `salt-${user.id}`
    const passwordHash = await hashPasswordWithSalt(DEFAULT_TEST_PASSWORD, salt)
    seeded.push({
      userId: user.id,
      email: user.email.toLowerCase(),
      salt,
      passwordHash,
      updatedAt: user.createdAt,
    })
  }

  // Also seed any salon owners or employees created via the UI in Demo Mode
  const localUsers = getStoredLocalUsers()
  for (const u of localUsers) {
    if (u.email && !seeded.some((s) => s.email === u.email.toLowerCase())) {
      const salt = `salt-${u.id}`
      const passwordHash = await hashPasswordWithSalt(DEFAULT_TEST_PASSWORD, salt)
      seeded.push({
        userId: u.id,
        email: u.email.toLowerCase(),
        salt,
        passwordHash,
        updatedAt: u.createdAt || new Date().toISOString(),
      })
    }
  }

  inMemoryCredentials = seeded
  return inMemoryCredentials
}

// Eager initialization
void initializeCredentials()

export interface OwnerDiscountApprovalResult {
  success: boolean
  grantId: string
  ownerId: string
  ownerName: string
  discountPercent: number
  discountAmount: number
  subtotal: number
  expiresAt: string
}

export const credentialService = {
  /**
   * Retrieves in-memory credential record for an email address (offline demo mode)
   */
  async getByEmail(email: string): Promise<CredentialRecord | null> {
    await initializeCredentials()
    const normalized = email.trim().toLowerCase()
    let found = inMemoryCredentials.find((c) => c.email === normalized)
    if (!found) {
      const localUsers = getStoredLocalUsers()
      const match = localUsers.find((u) => u.email && u.email.toLowerCase() === normalized)
      if (match) {
        const salt = `salt-${match.id}`
        const passwordHash = await hashPasswordWithSalt(DEFAULT_TEST_PASSWORD, salt)
        found = {
          userId: match.id,
          email: normalized,
          salt,
          passwordHash,
          updatedAt: match.createdAt || new Date().toISOString(),
        }
        inMemoryCredentials.push(found)
      }
    }
    return found ? { ...found } : null
  },

  /**
   * Retrieves in-memory credential record by User ID (offline demo mode)
   */
  async getByUserId(userId: string): Promise<CredentialRecord | null> {
    await initializeCredentials()
    const found = inMemoryCredentials.find((c) => c.userId === userId)
    return found ? { ...found } : null
  },

  /**
   * Mock password verification has been removed.
   * Real-time authentication is strictly handled via Supabase Auth Cloud.
   */
  async verifyPassword(): Promise<boolean> {
    throw new Error('Offline mock credential verification has been removed. All authentication must use Supabase Cloud.')
  },

  /**
   * Secure Owner Discount Authorization (Phase 2.2 P0):
   * Authenticates Owner credentials server-side via Supabase RPC (bcrypt verification in PostgreSQL).
   * Issues a short-lived, single-use approval grant bound strictly to salon, invoice, and financial values.
   */
  async requestOwnerDiscountApproval(params: {
    salonId: string
    invoiceId: string
    ownerEmail: string
    ownerPassword: string
    subtotal: number
    discountAmount: number
    discountPercent: number
  }): Promise<OwnerDiscountApprovalResult> {
    if (!isSupabaseConfigured() || !supabase) {
      throw new Error('Authentication Error: Supabase Cloud client is required for owner discount authorization.')
    }

    const { data, error } = await supabase.rpc('rpc_request_owner_discount_approval', {
      p_salon_id: params.salonId,
      p_invoice_id: params.invoiceId,
      p_owner_email: params.ownerEmail,
      p_owner_password: params.ownerPassword,
      p_subtotal: params.subtotal,
      p_discount_amount: params.discountAmount,
      p_discount_percent: params.discountPercent,
    })

    if (error || !data) {
      throw new Error(error?.message || 'Failed to obtain owner authorization for discount.')
    }

    return {
      success: true,
      grantId: data.grant_id,
      ownerId: data.owner_id,
      ownerName: data.owner_name,
      discountPercent: data.discount_percent,
      discountAmount: data.discount_amount,
      subtotal: data.subtotal,
      expiresAt: data.expires_at,
    }
  },

  /**
   * Registers in-memory credentials for a newly created user/employee (offline demo mode)
   */
  async registerUserCredentials(
    userId: string,
    email: string,
    password?: string
  ): Promise<CredentialRecord> {
    await initializeCredentials()
    const effectivePassword = password && password.trim().length >= 6 ? password.trim() : DEFAULT_TEST_PASSWORD
    const salt = `salt-${userId}-${Date.now()}`
    const passwordHash = await hashPasswordWithSalt(effectivePassword, salt)

    const newRecord: CredentialRecord = {
      userId,
      email: email.trim().toLowerCase(),
      salt,
      passwordHash,
      updatedAt: new Date().toISOString(),
    }

    inMemoryCredentials = inMemoryCredentials.filter((c) => c.userId !== userId && c.email !== newRecord.email)
    inMemoryCredentials.push(newRecord)
    return newRecord
  },

  /**
   * Updates credentials for an existing user (offline demo mode)
   */
  async changePassword(userId: string, newPassword: string): Promise<void> {
    await initializeCredentials()
    const existing = inMemoryCredentials.find((c) => c.userId === userId)
    if (!existing) {
      throw new Error(`Credential record for user ${userId} not found.`)
    }
    await this.registerUserCredentials(userId, existing.email, newPassword)
  },

  /**
   * Purges credentials for a deleted user
   */
  async removeUserCredentials(userId: string): Promise<void> {
    await initializeCredentials()
    inMemoryCredentials = inMemoryCredentials.filter((c) => c.userId !== userId)
  },

  /**
   * Purges credentials for a batch of deleted users
   */
  async removeUserCredentialsBatch(userIds: string[]): Promise<void> {
    await initializeCredentials()
    const idSet = new Set(userIds)
    inMemoryCredentials = inMemoryCredentials.filter((c) => !idSet.has(c.userId))
  },

  /**
   * Resets credential store to pristine baseline
   */
  async resetToBaseline(): Promise<void> {
    purgeLegacyCredentialStorage()
    inMemoryCredentials = []
    hasInitialized = false
    await initializeCredentials()
  },

  /**
   * Reloads state (noop in memory-only mode; ensures legacy storage remains purged)
   */
  async reloadFromStorage(): Promise<void> {
    purgeLegacyCredentialStorage()
  },
}
