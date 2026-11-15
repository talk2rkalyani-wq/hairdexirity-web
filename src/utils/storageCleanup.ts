/**
 * Storage Cleanup Utility
 * Automatically purges legacy dummy mock caches from localStorage
 * while preserving authenticated Owner sessions and real configuration.
 */

const DUMMY_STORAGE_KEYS = [
  'luma_salon_clients_v1',
  'luma_salon_clients_v2',
  'staff_v1',
  'staff_v2',
  'luma_salon_staff_v1',
  'luma_salon_services_v1',
  'luma_salon_services_v2',
  'luma_salon_appointments_v1',
  'luma_salon_invoices_v1',
  'luma_salon_draft_invoices_v1',
  'luma_salon_users_v1',
  'luma_salon_users_v2',
  'luma_salon_auth_creds_v1',
  'luma_salon_auth_creds_v2',
  'luma_salon_auth_creds_v3',
]

export function purgeLegacyDummyStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return

  // 1. Remove all dummy collections
  DUMMY_STORAGE_KEYS.forEach((key) => {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage errors
    }
  })

  // 2. Filter luma_salon_users_v3 to strictly keep OWNER roles
  try {
    const storedUsers = window.localStorage.getItem('luma_salon_users_v3')
    if (storedUsers) {
      const parsed = JSON.parse(storedUsers)
      if (Array.isArray(parsed)) {
        const onlyOwners = parsed.filter(
          (u: { role?: string; email?: string }) =>
            u.role === 'OWNER' && !u.email?.includes('@lumasalon.example.com')
        )
        window.localStorage.setItem('luma_salon_users_v3', JSON.stringify(onlyOwners))
      }
    }
  } catch {
    // Ignore parse error
  }
}

// Run immediately on module load in browser
if (typeof window !== 'undefined') {
  purgeLegacyDummyStorage()
}
