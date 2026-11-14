import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

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

  if (command === 'build') {
    const rawAuthMode =
      process.env.VITE_AUTH_MODE !== undefined
        ? process.env.VITE_AUTH_MODE
        : env.VITE_AUTH_MODE
    const authMode = rawAuthMode ? String(rawAuthMode).trim().toLowerCase() : ''
    const rawUrl =
      process.env.VITE_SUPABASE_URL !== undefined
        ? process.env.VITE_SUPABASE_URL
        : env.VITE_SUPABASE_URL || ''
    const rawKey =
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
    server: {
      host: true,
      port: 5173,
    },
  }
})
