/**
 * Authentication and email verification utilities.
 */

/**
 * Checks if an email is an unverified placeholder address (e.g., @lumasalon.example.com).
 * Placeholder addresses cannot be used for production Supabase authentication, account creation, or invitations.
 */
export function isPlaceholderEmail(email: string): boolean {
  if (!email) return false
  const norm = email.trim().toLowerCase()
  return (
    norm.endsWith('@hairdexirity.example.com') ||
    norm.endsWith('@lumasalon.example.com') ||
    norm.endsWith('@example.com') ||
    norm.includes('example.com')
  )
}

/**
 * Validates password strength (minimum 8 characters).
 */
export function isValidPasswordStrength(password: string): boolean {
  return Boolean(password && password.length >= 8)
}
