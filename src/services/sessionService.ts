import type { UserSession, User } from '../types/models.ts'

const SESSION_STORAGE_KEY = 'luma_salon_session_v2'
export const SESSION_DURATION_HOURS = 24

type SessionListener = (session: UserSession | null) => void
const listeners = new Set<SessionListener>()

/**
 * Builds a valid, time-bounded UserSession object from a User record
 */
export function buildSessionFromUser(user: User): UserSession {
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_DURATION_HOURS * 60 * 60 * 1000)

  return {
    sessionId: `sess-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    userId: user.id,
    salonId: user.salonId,
    name: user.name,
    email: user.email,
    role: user.role,
    ownerDesignation: user.ownerDesignation || null,
    employeeId: user.employeeId,
    specialty: user.specialty,
    isAuthenticated: true,
    avatarUrl: user.avatarUrl,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }
}

/**
 * Validates whether a session object is structurally sound and unexpired
 */
export function isSessionValid(session: UserSession | null): boolean {
  if (!session || !session.userId || !session.isAuthenticated) return false
  if (!session.expiresAt) return true // Legacy fallback

  const expiryTime = new Date(session.expiresAt).getTime()
  return expiryTime > Date.now()
}

/**
 * Initializes session from localStorage.
 * IMPORTANT: Strictly returns null if no valid, unexpired session exists.
 * DOES NOT auto-login as any user.
 */
function loadInitialSession(): UserSession | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
      if (stored && stored !== 'null') {
        const parsed = JSON.parse(stored)
        if (isSessionValid(parsed)) {
          return parsed
        } else {
          // Expired session -> clear
          window.localStorage.removeItem(SESSION_STORAGE_KEY)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to parse session from localStorage:', err)
  }

  return null
}

let activeSession: UserSession | null = loadInitialSession()

function persistSession(session: UserSession | null) {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (session) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
      } else {
        window.localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    }
  } catch (err) {
    console.warn('Failed to persist session to localStorage:', err)
  }
}

function notifyListeners() {
  const current = activeSession ? { ...activeSession } : null
  listeners.forEach((listener) => {
    try {
      listener(current)
    } catch (err) {
      console.error('Error in session listener:', err)
    }
  })
}

// Storage synchronization across tabs
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SESSION_STORAGE_KEY) {
      try {
        if (!event.newValue || event.newValue === 'null') {
          activeSession = null
        } else {
          const parsed = JSON.parse(event.newValue)
          activeSession = isSessionValid(parsed) ? parsed : null
        }
        notifyListeners()
      } catch (err) {
        console.warn('Error parsing storage event for session:', err)
      }
    }
  })
}

export const sessionService = {
  /**
   * Returns current active user session or null if logged out / expired
   */
  getCurrentSession(): UserSession | null {
    if (activeSession && !isSessionValid(activeSession)) {
      this.logout()
      return null
    }
    return activeSession ? { ...activeSession } : null
  },

  /**
   * Checks if there is a valid authenticated session
   */
  isAuthenticated(): boolean {
    const session = this.getCurrentSession()
    return Boolean(session && session.isAuthenticated)
  },

  /**
   * Establishes a session for a given user (used by authService after credential verification)
   */
  loginWithUser(user: User): UserSession {
    activeSession = buildSessionFromUser(user)
    persistSession(activeSession)
    notifyListeners()
    return { ...activeSession }
  },

  /**
   * Establishes an explicit pre-formed session (used by authService or testing)
   */
  setSession(session: UserSession | null): void {
    if (session && isSessionValid(session)) {
      activeSession = { ...session }
      persistSession(activeSession)
    } else {
      activeSession = null
      persistSession(null)
    }
    notifyListeners()
  },

  /**
   * Clears the current session completely (real logout)
   */
  logout(): void {
    activeSession = null
    persistSession(null)
    notifyListeners()
  },

  /**
   * Subscribes to session state transitions
   */
  subscribe(listener: SessionListener): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
