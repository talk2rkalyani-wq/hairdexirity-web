import type { UserSession, User, UserRole } from '../types/models'
import { userService } from './userService'
import { credentialService } from './credentialService'
import { sessionService } from './sessionService'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'
import { isPlaceholderEmail } from '../utils/authUtils'
import { ROOT_ADMIN_CONFIG, ROOT_ADMIN_EMAIL, isRootAdminEmail } from '../config/adminConfig'

export { isPlaceholderEmail }
export type AuthMode = 'local_mock' | 'supabase_auth'

const AUTH_MODE_STORAGE_KEY = 'luma_salon_auth_mode'

// Current active auth mode. Supports explicit VITE_AUTH_MODE ('supabase_auth' | 'local_mock' | 'local')
function resolveInitialAuthMode(): AuthMode {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(AUTH_MODE_STORAGE_KEY)
      if (saved === 'local_mock' || saved === 'supabase_auth') {
        return saved
      }
    }
  } catch {}

  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AUTH_MODE) {
    const mode = String(import.meta.env.VITE_AUTH_MODE).trim().toLowerCase()
    if (mode === 'supabase_auth') {
      return 'supabase_auth'
    }
    if (mode === 'local_mock' || mode === 'local') {
      return 'local_mock'
    }
  }
  return isSupabaseConfigured() ? 'supabase_auth' : 'local_mock'
}

let currentAuthMode: AuthMode = resolveInitialAuthMode()
let isAuthInitialized = false
let authListenerUnsubscribe: (() => void) | null = null

export const authService = {
  /**
   * Returns current active authentication mode
   */
  getAuthMode(): AuthMode {
    return currentAuthMode
  },

  /**
   * Returns whether auth initialization has completed
   */
  isInitialized(): boolean {
    return isAuthInitialized
  },

  /**
   * Sets authentication mode explicitly (e.g. for testing or controlled cutover)
   */
  setAuthMode(mode: AuthMode): void {
    currentAuthMode = mode
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode)
      }
    } catch {}
  },

  /**
   * Checks whether an email address is a placeholder address
   */
  isPlaceholderEmail(email: string): boolean {
    return isPlaceholderEmail(email)
  },

  /**
   * Initializes Supabase Auth state listener and session restoration.
   */
  async initAuth(): Promise<void> {
    if (!isSupabaseConfigured() || !supabase) {
      isAuthInitialized = true
      return
    }

    if (authListenerUnsubscribe) {
      isAuthInitialized = true
      return
    }

    // Set up auth state change listener
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, sbSession) => {
      if (event === 'SIGNED_OUT' || !sbSession) {
        if (currentAuthMode === 'supabase_auth') {
          sessionService.logout()
        }
      } else if (event === 'PASSWORD_RECOVERY') {
        if (typeof window !== 'undefined') {
          window.location.hash = '#/login?type=recovery'
        }
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const currentLocal = sessionService.getCurrentSession()
        if (!currentLocal && sbSession.user) {
          // Restore session strictly from database profile linked to auth_user_id
          try {
            await this.resolveAndEstablishSession(sbSession.user.id)
          } catch (err) {
            console.warn('[authService] Failed to restore session from auth state change:', err)
          }
        }
      }
    })

    if (authListener?.subscription) {
      authListenerUnsubscribe = () => {
        authListener.subscription.unsubscribe()
        authListenerUnsubscribe = null
      }
    }

    // Check existing Supabase session on startup if in supabase_auth mode
    if (currentAuthMode === 'supabase_auth') {
      try {
        const { data } = await supabase.auth.getSession()
        if (data?.session?.user && !sessionService.getCurrentSession()) {
          await this.resolveAndEstablishSession(data.session.user.id)
        }
      } catch (err) {
        console.warn('[authService] Failed to restore initial Supabase session:', err)
      } finally {
        isAuthInitialized = true
      }
    } else {
      isAuthInitialized = true
    }
  },

  /**
   * Resolves trusted user profile strictly by authenticated auth_user_id.
   *
   * SECURITY ENFORCEMENT:
   * - Browser login NEVER automatically assigns, updates, or links auth_user_id.
   * - An unlinked Supabase identity fails safely and denies access.
   * - Administrator privilege is granted ONLY via a verified record in public.administrators.
   * - Active status is enforced: inactive users receive "User is disabled. Please contact the administrator."
   */
  async resolveAndEstablishSession(authUserId: string): Promise<UserSession> {
    if (!authUserId) {
      if (supabase) await supabase.auth.signOut().catch(() => {})
      throw new Error('Authentication error: Missing authenticated identity.')
    }

    // 1. Check Root Administrator table (public.administrators) strictly by auth_user_id
    if (supabase) {
      try {
        const { data: adminRecord, error: adminErr } = await supabase
          .from('administrators')
          .select('*')
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        if (!adminErr && adminRecord) {
          // STRICT SECURITY ENFORCEMENT: Exactly 1 single user (ROOT_ADMIN_EMAIL) can hold Root Administrator authority.
          if (isRootAdminEmail(adminRecord.email)) {
            if (!adminRecord.active) {
              await supabase.auth.signOut().catch(() => {})
              throw new Error('User is disabled. Please contact the administrator.')
            }

            const now = new Date()
            const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000)
            const adminSession: UserSession = {
              sessionId: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              userId: adminRecord.id || ROOT_ADMIN_CONFIG.id,
              name: (adminRecord.name || adminRecord.full_name || ROOT_ADMIN_CONFIG.name) as string,
              email: ROOT_ADMIN_EMAIL,
              role: 'ADMIN',
              ownerDesignation: null,
              employeeId: undefined,
              specialty: undefined,
              isAuthenticated: true,
              avatarUrl: undefined,
              createdAt: now.toISOString(),
              expiresAt: expires.toISOString(),
            }
            sessionService.setSession(adminSession)
            return adminSession
          }
          // Any other identity in administrators is rejected from holding admin role and falls through to users table
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'User is disabled. Please contact the administrator.') {
          throw err
        }
        // If table doesn't exist yet, continue to users lookup
      }
    }

    // 2. Check Salon Users table (public.users) strictly by auth_user_id
    let dbUser: Record<string, unknown> | null = null
    if (supabase) {
      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', authUserId)
          .maybeSingle()

        if (!userErr && userData) {
          dbUser = userData
        }
      } catch {
        // Handled below
      }
    }

    // 3. Reject unlinked identity: Fail safely without automatic client-side linkage
    if (!dbUser) {
      if (supabase) await supabase.auth.signOut().catch(() => {})
      throw new Error(
        'Your account is not linked to an active salon profile. Please contact the administrator to complete your setup.'
      )
    }

    // 4. Check active status: Reject disabled accounts with exact specified message
    if (dbUser.active === false) {
      if (supabase) await supabase.auth.signOut().catch(() => {})
      throw new Error('User is disabled. Please contact the administrator.')
    }

    // 5. Validate role: Reject unsupported or inconsistent role
    const validRoles: UserRole[] = ['ADMIN', 'OWNER', 'RECEPTIONIST', 'EMPLOYEE']
    if (!validRoles.includes(dbUser.role as UserRole)) {
      if (supabase) await supabase.auth.signOut().catch(() => {})
      throw new Error('Account role is invalid or unsupported. Please contact the administrator.')
    }

    // 6. Build trusted User model and establish session
    const resolvedUser: User = {
      id: dbUser.id as string,
      salonId: (dbUser.salon_id as string) || 'salon-luma-01',
      name: dbUser.name as string,
      email: dbUser.email as string,
      role: dbUser.role as User['role'],
      ownerDesignation: (dbUser.owner_designation as User['ownerDesignation']) || undefined,
      employeeId: (dbUser.employee_id as string) || undefined,
      specialty: (dbUser.specialty as User['specialty']) || undefined,
      active: Boolean(dbUser.active),
      avatarUrl: (dbUser.avatar_url as string) || undefined,
      createdAt: (dbUser.created_at as string) || new Date().toISOString(),
    }

    return sessionService.loginWithUser(resolvedUser)
  },

  /**
   * Authenticates a user with email and password.
   * In 'supabase_auth' mode: Strictly requires Supabase Auth.
   *   CRITICAL: Never silently falls back to mock credentials on failure.
   * In 'local_mock' mode: Compares against salted SHA-256 password hash.
   * On success, establishes an isolated, time-bounded session.
   */
  async login(email: string, plainTextPassword: string): Promise<UserSession> {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address.')
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      throw new Error('Please enter a valid email address.')
    }
    if (!plainTextPassword) {
      throw new Error('Please enter your password.')
    }

    const normalizedEmail = email.trim().toLowerCase()

    // -------------------------------------------------------------------------
    // PRODUCTION SUPABASE AUTHENTICATION MODE
    // -------------------------------------------------------------------------
    if (currentAuthMode === 'supabase_auth') {
      // 1. Verify email is not an unverified placeholder address
      if (isPlaceholderEmail(normalizedEmail)) {
        throw new Error(
          'Placeholder email addresses (@hairdexirity.example.com) cannot be used for production Supabase authentication. A verified production email address is required.'
        )
      }

      // 2. Verify Supabase client configuration is available
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error(
          'Authentication Error: Supabase client is not configured for production authentication. Fallback to mock credentials is strictly prohibited.'
        )
      }

      try {
        // 3. Authenticate with Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: plainTextPassword,
        })

        if (error || !data.user) {
          const authErrMsg = error?.message || 'Invalid email or password.'
          if (authErrMsg.toLowerCase().includes('invalid login credentials')) {
            throw new Error(
              'Invalid login credentials in Supabase Cloud. Please verify your password, or check in Supabase Dashboard (Authentication → Users) that the user is marked "Confirmed".'
            )
          }
          throw new Error(authErrMsg)
        }

        // 4. Resolve trusted application profile strictly by auth_user_id
        const session = await this.resolveAndEstablishSession(data.user.id)
        return session
      } catch (err: unknown) {
        if (err instanceof Error) {
          const lower = err.message.toLowerCase()
          if (lower.includes('load failed') || lower.includes('failed to fetch')) {
            throw new Error(
              'Connection to Supabase Cloud failed ("Load failed"). Please check your network connection.'
            )
          }
          throw err
        }
        throw new Error('Authentication failed. Please try again.')
      }
    }

    // -------------------------------------------------------------------------
    // DEVELOPMENT / DEMO LOCAL MOCK AUTHENTICATION MODE
    // -------------------------------------------------------------------------
    // 1. Special check for Root Administrator in mock mode
    if (isRootAdminEmail(normalizedEmail)) {
      const isValidAdmin = await credentialService.verifyPassword(normalizedEmail, plainTextPassword)
      if (!isValidAdmin) {
        throw new Error('Invalid email or password.')
      }
      const now = new Date()
      const adminSession: UserSession = {
        sessionId: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        userId: ROOT_ADMIN_CONFIG.id,
        name: `${ROOT_ADMIN_CONFIG.name} (Root Administrator)`,
        email: ROOT_ADMIN_EMAIL,
        role: 'ADMIN',
        ownerDesignation: null,
        employeeId: undefined,
        specialty: undefined,
        isAuthenticated: true,
        avatarUrl: undefined,
        createdAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      }
      sessionService.setSession(adminSession)
      return adminSession
    }

    // 2. Look up user account in canonical users
    const user = await userService.getUserByEmail(normalizedEmail)
    if (!user) {
      throw new Error('Invalid email or password.')
    }

    // 3. Check if user is active: Deny with exact specified message
    if (!user.active) {
      throw new Error('User is disabled. Please contact the administrator.')
    }

    // 4. Cryptographically verify password against salted hash
    const isValidPassword = await credentialService.verifyPassword(normalizedEmail, plainTextPassword)
    if (!isValidPassword) {
      throw new Error('Invalid email or password.')
    }

    // 5. Establish isolated authenticated session
    const session = sessionService.loginWithUser(user)
    return session
  },

  /**
   * Requests a password-reset email.
   * In 'supabase_auth' mode: Uses supabase.auth.resetPasswordForEmail with an allowlisted redirect.
   * Never leaks whether an unverified or nonexistent email exists.
   */
  async requestPasswordReset(email: string): Promise<{ success: boolean; message: string }> {
    if (!email || !email.trim()) {
      throw new Error('Please enter your email address.')
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      throw new Error('Please enter a valid email address.')
    }

    const normalizedEmail = email.trim().toLowerCase()

    if (isPlaceholderEmail(normalizedEmail)) {
      throw new Error('Cannot request password reset for placeholder demo accounts (@hairdexirity.example.com).')
    }

    if (currentAuthMode === 'supabase_auth') {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase client is not configured for password reset.')
      }

      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}${window.location.pathname}#/login?type=recovery`
          : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: redirectUrl,
      })

      if (error) {
        throw new Error(error.message)
      }

      return {
        success: true,
        message: 'If an account exists with this email address, password reset instructions have been sent.',
      }
    }

    // Mock mode response
    return {
      success: true,
      message: 'If an account exists with this email address, password reset instructions have been sent.',
    }
  },

  /**
   * Updates user password after recovery.
   * In 'supabase_auth' mode: Calls supabase.auth.updateUser({ password: newPassword }).
   */
  async updatePassword(newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters long.')
    }

    if (currentAuthMode === 'supabase_auth') {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase client is not configured for password update.')
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        throw new Error(error.message)
      }
      return
    }

    // Mock mode password update
    const session = sessionService.getCurrentSession()
    if (session) {
      await credentialService.changePassword(session.userId, newPassword)
    }
  },

  /**
   * Terminates active session and clears authentication state
   */
  logout(): void {
    if (currentAuthMode === 'supabase_auth' && supabase) {
      void supabase.auth.signOut().catch((err) => {
        console.warn('Error during Supabase Auth signOut:', err)
      })
    }
    sessionService.logout()
  },

  /**
   * Returns current active authenticated session or null
   */
  getCurrentSession(): UserSession | null {
    return sessionService.getCurrentSession()
  },

  /**
   * Evaluates if there is an active authenticated session
   */
  isAuthenticated(): boolean {
    return sessionService.isAuthenticated()
  },

  /**
   * Validates active session against user registry and expiry
   */
  async validateSession(): Promise<boolean> {
    const session = sessionService.getCurrentSession()
    if (!session || !session.isAuthenticated) {
      return false
    }

    // Check account status in user store
    if (session.role === 'ADMIN') {
      return true
    }

    const user = await userService.getUserById(session.userId)
    if (!user || !user.active) {
      this.logout()
      return false
    }

    return true
  },

  /**
   * Subscribes to session and authentication state changes
   */
  subscribe(listener: (session: UserSession | null) => void): () => void {
    return sessionService.subscribe(listener)
  },
}
