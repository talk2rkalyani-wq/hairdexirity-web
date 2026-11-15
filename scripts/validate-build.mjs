#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function loadEnvFile(filename) {
  const filePath = path.join(rootDir, filename)
  if (!fs.existsSync(filePath)) return {}
  const content = fs.readFileSync(filePath, 'utf-8')
  const env = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim()
      const val = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '')
      env[key] = val
    }
  }
  return env
}

const fileEnv = { ...loadEnvFile('.env'), ...loadEnvFile('.env.local') }
const authMode = (process.env.VITE_AUTH_MODE !== undefined ? process.env.VITE_AUTH_MODE : (fileEnv.VITE_AUTH_MODE || '')).trim().toLowerCase()
const supabaseUrl = (process.env.VITE_SUPABASE_URL !== undefined ? process.env.VITE_SUPABASE_URL : (fileEnv.VITE_SUPABASE_URL || '')).trim()
const supabaseKey = (
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY !== undefined
    ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
    : (fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '')
).trim()

const isPlaceholder = (val) => {
  if (!val) return true
  const lower = val.toLowerCase()
  return (
    lower.includes('your-project-ref') ||
    lower.includes('your-supabase-publishable') ||
    lower.includes('placeholder')
  )
}

const isProductionDeploy =
  process.env.VERCEL_ENV === 'production' ||
  process.env.APP_ENV === 'production' ||
  process.env.BUILD_TARGET === 'production'

console.log('[Build Validation] Target environment:', isProductionDeploy ? 'PRODUCTION' : 'DEVELOPMENT/PREVIEW')
console.log('[Build Validation] Configured VITE_AUTH_MODE:', authMode || '(unset)')

if (isProductionDeploy) {
  if (!authMode) {
    console.error('❌ [Production Build Failure] VITE_AUTH_MODE is missing. Production deployment requires VITE_AUTH_MODE=supabase_auth.')
    process.exit(1)
  }
  if (authMode !== 'supabase_auth') {
    console.error(`❌ [Production Build Failure] VITE_AUTH_MODE must be 'supabase_auth' for production deployment. Received: '${authMode}'. Mock or demo modes are strictly forbidden in production.`)
    process.exit(1)
  }
  if (!supabaseUrl || isPlaceholder(supabaseUrl)) {
    console.error('❌ [Production Build Failure] VITE_SUPABASE_URL is missing or contains placeholder values for production deployment.')
    process.exit(1)
  }
  if (!supabaseKey || isPlaceholder(supabaseKey)) {
    console.error('❌ [Production Build Failure] VITE_SUPABASE_PUBLISHABLE_KEY is missing or contains placeholder values for production deployment.')
    process.exit(1)
  }
  console.log('✅ [Build Validation] Production authentication lockdown verified.')
} else {
  if (authMode === 'supabase_auth') {
    if (!supabaseUrl || isPlaceholder(supabaseUrl) || !supabaseKey || isPlaceholder(supabaseKey)) {
      console.error('❌ [Build Failure] VITE_AUTH_MODE is set to supabase_auth but valid Supabase credentials were not found.')
      process.exit(1)
    }
  }
  console.log('✅ [Build Validation] Local / Preview configuration valid.')
}

