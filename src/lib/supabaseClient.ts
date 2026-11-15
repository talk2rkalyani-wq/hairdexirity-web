import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const getEnvVar = (name: string): string | undefined => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[name]) {
    return import.meta.env[name] as string
  }
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (proc?.env?.[name]) {
    return proc.env[name]
  }
  return undefined
}

const FALLBACK_SUPABASE_URL = 'https://ktlzrezhiopwwlzmycdw.supabase.co'
const FALLBACK_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bHpyZXpoaW9wd3dsem15Y2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzU3NzEsImV4cCI6MjEwNzY1MTc3MX0.lwZBnTM7YW9oLgFlrTXoVOk2Ts3qObBeMmmLXpKRH5E'

const isPlaceholder = (val?: string): boolean => {
  if (!val) return true
  const lower = val.toLowerCase()
  return (
    lower.includes('your-project-ref') ||
    lower.includes('your-supabase-publishable') ||
    lower.includes('placeholder')
  )
}

const envUrl = getEnvVar('VITE_SUPABASE_URL')
const rawUrl = (!envUrl || isPlaceholder(envUrl)) ? FALLBACK_SUPABASE_URL : envUrl
const supabaseUrl = rawUrl ? rawUrl.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') : undefined

const envKey = getEnvVar('VITE_SUPABASE_PUBLISHABLE_KEY') || getEnvVar('VITE_SUPABASE_ANON_KEY')
const supabaseKey = (!envKey || isPlaceholder(envKey)) ? FALLBACK_SUPABASE_KEY : envKey

export const isSupabaseConfigured = (): boolean => {
  return Boolean(supabaseUrl && supabaseKey && !isPlaceholder(supabaseUrl) && !isPlaceholder(supabaseKey))
}

let clientInstance: SupabaseClient | null = null

if (isSupabaseConfigured()) {
  try {
    clientInstance = createClient(supabaseUrl!, supabaseKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  } catch (err) {
    console.warn('[Supabase] Failed to initialize Supabase client:', err)
    clientInstance = null
  }
} else {
  // Gracefully inform developer without disrupting localStorage fallback operations
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    console.info(
      '[Supabase] Remote database credentials not detected. The application is operating seamlessly in local offline/localStorage persistence mode.'
    )
  }
}

/**
 * Returns the active Supabase client if configured, or null if operating in local mode.
 */
export const getSupabaseClient = (): SupabaseClient | null => {
  return clientInstance
}

/**
 * Direct reference to the Supabase client instance (or null in local mode).
 */
export const supabase = clientInstance
