import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const FALLBACK_SUPABASE_URL = 'https://ktlzrezhiopwwlzmycdw.supabase.co'
const FALLBACK_SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0bHpyZXpoaW9wd3dsem15Y2R3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwNzU3NzEsImV4cCI6MjEwNzY1MTc3MX0.lwZBnTM7YW9oLgFlrTXoVOk2Ts3qObBeMmmLXpKRH5E'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Production build enforcement:
  // Triggered when VERCEL_ENV === 'production' (Vercel automated deployment),
  // APP_ENV === 'production' / BUILD_TARGET === 'production',
  // or explicitly via mode === 'production-lockdown'.
  const isProductionDeploy =
    process.env.VERCEL_ENV === 'production' ||
    process.env.APP_ENV === 'production' ||
    process.env.BUILD_TARGET === 'production' ||
    mode === 'production-lockdown'

  const rawAuthMode =
    process.env.VITE_AUTH_MODE !== undefined
      ? process.env.VITE_AUTH_MODE
      : env.VITE_AUTH_MODE
  const authMode = (rawAuthMode ? String(rawAuthMode).trim().toLowerCase() : '') || 'supabase_auth'

  let rawUrl =
    process.env.VITE_SUPABASE_URL !== undefined
      ? process.env.VITE_SUPABASE_URL
      : env.VITE_SUPABASE_URL || ''

  let rawKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined
      ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      : env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        process.env.VITE_SUPABASE_ANON_KEY ||
        env.VITE_SUPABASE_ANON_KEY ||
        ''

  const isPlaceholder = (val: string): boolean => {
    if (!val) return true
    const lower = val.toLowerCase()
    return (
      lower.includes('your-project-ref') ||
      lower.includes('your-supabase-publishable') ||
      lower.includes('placeholder')
    )
  }

  if (!rawUrl || isPlaceholder(rawUrl)) {
    rawUrl = FALLBACK_SUPABASE_URL
  }

  if (!rawKey || isPlaceholder(rawKey)) {
    rawKey = FALLBACK_SUPABASE_KEY
  }

  if (command === 'build') {
    if (isProductionDeploy) {
      if (!authMode) {
        throw new Error(
          '\n❌ [Production Build Failure] VITE_AUTH_MODE is missing. Production deployment requires VITE_AUTH_MODE=supabase_auth.\n'
        )
      }
      if (authMode !== 'supabase_auth') {
        throw new Error(
          `\n❌ [Production Build Failure] VITE_AUTH_MODE must be 'supabase_auth' for production deployment. Received: '${authMode}'. Mock or demo modes are strictly forbidden in production.\n`
        )
      }
      if (!rawUrl || isPlaceholder(rawUrl)) {
        throw new Error(
          '\n❌ [Production Build Failure] Missing or placeholder VITE_SUPABASE_URL for production deployment.\n'
        )
      }
      if (!rawKey || isPlaceholder(rawKey)) {
        throw new Error(
          '\n❌ [Production Build Failure] Missing or placeholder VITE_SUPABASE_PUBLISHABLE_KEY for production deployment.\n'
        )
      }
    } else if (authMode === 'supabase_auth') {
      if (!rawUrl || isPlaceholder(rawUrl) || !rawKey || isPlaceholder(rawKey)) {
        throw new Error(
          '\n❌ [Build Failure] VITE_AUTH_MODE is set to supabase_auth but valid Supabase credentials (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY) were not found.\n'
        )
      }
    }
  }

  return {
    base: './',
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(rawUrl),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(rawKey),
      'import.meta.env.VITE_AUTH_MODE': JSON.stringify(authMode),
    },
    server: {
      host: true,
      port: 5173,
    },
  }
})
