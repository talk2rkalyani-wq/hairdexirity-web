/**
 * Root Administrator Configuration
 * Dedicated single source of truth for the platform Root Administrator identity.
 */
export const ROOT_ADMIN_CONFIG = {
  id: 'admin-root-01',
  email: 'talk2rkalyani@gmail.com',
  name: 'Kalyani',
  role: 'ADMIN' as const,
  salonId: 'salon-luma-01',
} as const

export const ROOT_ADMIN_EMAIL = ROOT_ADMIN_CONFIG.email

/**
 * Checks whether an email address belongs to the Root Administrator (case-insensitive).
 */
export function isRootAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return email.trim().toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()
}

