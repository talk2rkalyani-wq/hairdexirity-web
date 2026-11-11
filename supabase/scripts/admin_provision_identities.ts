/**
 * Luma Salon — Private Administrative Identity Provisioning Script
 * Phase 14.4B.1: Controlled Pilot Invitation & Safe Account Linkage Engine
 *
 * CRITICAL SECURITY & OPERATIONAL RULES:
 * 1. RUNS EXCLUSIVELY SERVER-SIDE in a trusted administrative Node.js environment.
 * 2. Uses SUPABASE_SERVICE_ROLE_KEY from process.env (NEVER exposed to frontend, VITE_*, or Git).
 * 3. DEFAULTS TO DRY-RUN. Account creation and database linkage require explicit `--execute` flag.
 * 4. NEVER logs passwords, salts, service-role keys, invitation tokens, or recovery links.
 * 5. Strictly verifies target project URL matches the approved project ref (`ktlzrezhiopwwlzmycdw`).
 * 6. Strictly verifies email consistency: LOWER(TRIM(public.users.email)) === LOWER(TRIM(auth.users.email)).
 * 7. RETRY-SAFE & IDEMPOTENT: Never overwrites existing non-null auth_user_id mappings.
 * 8. SINGLE-USER PILOT ENFORCEMENT: Requires explicit `--user-id` for pilot rollout.
 * 9. EXACT ROW COUNT VALIDATION: Verifies that database update affects exactly 1 row.
 * 10. PARTIAL FAILURE RECOVERY: If Auth creation succeeds but DB update fails, records recovery state;
 *     next run reuses the existing Auth user (LINK_EXISTING) without duplicating accounts.
 * 11. NO AUTOMATIC DELETION: Does not auto-delete Auth accounts on rollback.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const EXPECTED_PROJECT_REF = 'ktlzrezhiopwwlzmycdw'
export const DEFAULT_REDIRECT_URL = 'http://localhost:5173/#/reset-password'

export interface ProvisionUserRecord {
  id: string
  salon_id: string
  name: string
  email: string
  role: 'OWNER' | 'RECEPTIONIST' | 'EMPLOYEE'
  employee_id: string | null
  specialty?: string | null
  active: boolean
  auth_user_id?: string | null
}

export interface ProvisionStaffRecord {
  id: string
  name: string
  email: string
  role: string
  active: boolean
}

export interface DryRunItem {
  userId: string
  name: string
  role: string
  normalizedEmail: string
  employeeId: string | null
  staffValidation: 'VALID_MAPPING' | 'NOT_APPLICABLE' | 'STAFF_NOT_FOUND' | 'EMAIL_STAFF_MISMATCH'
  authStatus: 'NOT_PROVISIONED' | 'EXISTS_MATCHED' | 'EXISTS_MISMATCH' | 'ALREADY_LINKED'
  proposedAction: 'INVITE_AND_LINK' | 'LINK_EXISTING' | 'SKIP_ALREADY_LINKED' | 'REJECT_ERROR'
  notes: string
}

export interface ProvisionAuditEntry {
  operationId: string
  timestamp: string
  userId: string
  normalizedEmail: string
  role: string
  action: string
  status: 'SUCCESS' | 'SKIPPED' | 'FAILED' | 'PARTIAL_FAILURE_DB_LINK' | 'DRY_RUN'
  authUserId: string | null
  affectedRows?: number
  message: string
}

/**
 * Normalizes email address for consistent, safe identity comparison.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Basic email format verification.
 */
export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

/**
 * Identifies placeholder or unverified email domains (e.g. @lumasalon.example.com).
 * Prevents dispatching live invitations to non-existent addresses.
 */
export function isPlaceholderEmail(email: string): boolean {
  if (!email) return false
  const norm = normalizeEmail(email)
  return norm.endsWith('@lumasalon.example.com') || norm.endsWith('@example.com') || norm.includes('example.com')
}

/**
 * Validates that the Supabase target URL matches the expected project ref.
 */
export function validateTargetProjectUrl(url: string, expectedRef: string = EXPECTED_PROJECT_REF): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.hostname.startsWith(expectedRef) || parsed.hostname.includes(expectedRef)
  } catch {
    return false
  }
}

/**
 * Validates staff linkage consistency for employee user records.
 */
export function validateStaffLink(
  user: ProvisionUserRecord,
  staffMap: Map<string, ProvisionStaffRecord>
): 'VALID_MAPPING' | 'NOT_APPLICABLE' | 'STAFF_NOT_FOUND' | 'EMAIL_STAFF_MISMATCH' {
  if (user.role !== 'EMPLOYEE') {
    if (user.employee_id !== null) {
      return 'STAFF_NOT_FOUND' // Non-employees must not have employee_id
    }
    return 'NOT_APPLICABLE'
  }

  if (!user.employee_id) {
    return 'STAFF_NOT_FOUND'
  }

  const staff = staffMap.get(user.employee_id)
  if (!staff) {
    return 'STAFF_NOT_FOUND'
  }

  if (normalizeEmail(staff.email) !== normalizeEmail(user.email)) {
    return 'EMAIL_STAFF_MISMATCH'
  }

  return 'VALID_MAPPING'
}

/**
 * Evaluates a user record and determines the safe provisioning action.
 */
export function evaluateUserForProvisioning(
  user: ProvisionUserRecord,
  staffMap: Map<string, ProvisionStaffRecord>,
  existingAuthUserMap: Map<string, { id: string; email: string }>
): DryRunItem {
  const normEmail = normalizeEmail(user.email)

  if (!isValidEmailFormat(normEmail)) {
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      normalizedEmail: normEmail,
      employeeId: user.employee_id,
      staffValidation: 'NOT_APPLICABLE',
      authStatus: 'NOT_PROVISIONED',
      proposedAction: 'REJECT_ERROR',
      notes: `Invalid email format: ${user.email}`,
    }
  }

  const staffValidation = validateStaffLink(user, staffMap)

  // Fail-closed if staff link is invalid for employees
  if (staffValidation === 'STAFF_NOT_FOUND' || staffValidation === 'EMAIL_STAFF_MISMATCH') {
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      normalizedEmail: normEmail,
      employeeId: user.employee_id,
      staffValidation,
      authStatus: 'NOT_PROVISIONED',
      proposedAction: 'REJECT_ERROR',
      notes: `Staff mapping validation failed: ${staffValidation}`,
    }
  }

  // Check if public.users record already has an auth_user_id
  if (user.auth_user_id) {
    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      normalizedEmail: normEmail,
      employeeId: user.employee_id,
      staffValidation,
      authStatus: 'ALREADY_LINKED',
      proposedAction: 'SKIP_ALREADY_LINKED',
      notes: `User already linked to auth identity ${user.auth_user_id}. No overwrite permitted.`,
    }
  }

  // Check if an Auth account already exists in auth.users with this email
  const existingAuth = existingAuthUserMap.get(normEmail)
  if (existingAuth) {
    // Identity consistency check
    if (normalizeEmail(existingAuth.email) !== normEmail) {
      return {
        userId: user.id,
        name: user.name,
        role: user.role,
        normalizedEmail: normEmail,
        employeeId: user.employee_id,
        staffValidation,
        authStatus: 'EXISTS_MISMATCH',
        proposedAction: 'REJECT_ERROR',
        notes: `Existing Auth email mismatch: auth (${existingAuth.email}) != public (${normEmail})`,
      }
    }

    return {
      userId: user.id,
      name: user.name,
      role: user.role,
      normalizedEmail: normEmail,
      employeeId: user.employee_id,
      staffValidation,
      authStatus: 'EXISTS_MATCHED',
      proposedAction: 'LINK_EXISTING',
      notes: `Existing Auth identity detected (${existingAuth.id}). Will link safely without sending duplicate invite.`,
    }
  }

  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    normalizedEmail: normEmail,
    employeeId: user.employee_id,
    staffValidation,
    authStatus: 'NOT_PROVISIONED',
    proposedAction: 'INVITE_AND_LINK',
    notes: 'Supabase Auth invitation email will be dispatched and account linked to public.users.',
  }
}

/**
 * Administrative Provisioning Engine (Option A: Invitation Flow)
 */
export class AdminProvisioningEngine {
  private supabaseAdmin: SupabaseClient | null = null
  private isDryRun: boolean = true
  private targetUrl: string = ''
  private redirectUrl: string = DEFAULT_REDIRECT_URL

  constructor(options: {
    supabaseUrl?: string
    serviceRoleKey?: string
    execute?: boolean
    redirectUrl?: string
    expectedProjectRef?: string
  }) {
    this.isDryRun = !options.execute
    this.redirectUrl = options.redirectUrl || DEFAULT_REDIRECT_URL
    this.targetUrl = options.supabaseUrl || ''

    if (this.targetUrl) {
      const expectedRef = options.expectedProjectRef || EXPECTED_PROJECT_REF
      if (!validateTargetProjectUrl(this.targetUrl, expectedRef)) {
        throw new Error(
          `Target Project Verification Failed: URL does not match approved project ref '${expectedRef}'. Operation aborted for safety.`
        )
      }
    }

    if (options.supabaseUrl && options.serviceRoleKey) {
      this.supabaseAdmin = createClient(options.supabaseUrl, options.serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    }
  }

  /**
   * Generates a dry-run analysis for a list of users and staff.
   */
  public generateDryRunReport(
    users: ProvisionUserRecord[],
    staff: ProvisionStaffRecord[],
    existingAuthUsers: Array<{ id: string; email: string }> = []
  ): {
    items: DryRunItem[]
    summary: {
      totalUsers: number
      byRole: Record<string, number>
      uniqueEmails: number
      inviteAndLinkCount: number
      linkExistingCount: number
      skipAlreadyLinkedCount: number
      rejectErrorCount: number
    }
  } {
    const staffMap = new Map<string, ProvisionStaffRecord>(staff.map((s) => [s.id, s]))
    const authMap = new Map<string, { id: string; email: string }>(
      existingAuthUsers.map((a) => [normalizeEmail(a.email), a])
    )

    const uniqueEmails = new Set(users.map((u) => normalizeEmail(u.email)))
    const byRole: Record<string, number> = { OWNER: 0, RECEPTIONIST: 0, EMPLOYEE: 0 }
    let inviteAndLinkCount = 0
    let linkExistingCount = 0
    let skipAlreadyLinkedCount = 0
    let rejectErrorCount = 0

    const items: DryRunItem[] = []

    for (const u of users) {
      byRole[u.role] = (byRole[u.role] || 0) + 1
      const item = evaluateUserForProvisioning(u, staffMap, authMap)
      items.push(item)

      if (item.proposedAction === 'INVITE_AND_LINK') inviteAndLinkCount++
      else if (item.proposedAction === 'LINK_EXISTING') linkExistingCount++
      else if (item.proposedAction === 'SKIP_ALREADY_LINKED') skipAlreadyLinkedCount++
      else if (item.proposedAction === 'REJECT_ERROR') rejectErrorCount++
    }

    return {
      items,
      summary: {
        totalUsers: users.length,
        byRole,
        uniqueEmails: uniqueEmails.size,
        inviteAndLinkCount,
        linkExistingCount,
        skipAlreadyLinkedCount,
        rejectErrorCount,
      },
    }
  }

  /**
   * Executes the invitation provisioning and linking procedure safely.
   *
   * SAFEGUARDS:
   * 1. Requires execute: true.
   * 2. If pilotUserId is specified, ONLY that single user is processed.
   * 3. Uses Supabase inviteUserByEmail() (Option A).
   * 4. Updates public.users setting auth_user_id and verifies exactly 1 row was updated.
   * 5. Partial failure recovery: if invite succeeds but DB update fails, reports PARTIAL_FAILURE_DB_LINK
   *    and does NOT delete Auth account; subsequent run links it cleanly.
   */
  public async executeProvisioning(
    users: ProvisionUserRecord[],
    staff: ProvisionStaffRecord[],
    options: { pilotUserId?: string } = {}
  ): Promise<ProvisionAuditEntry[]> {
    if (this.isDryRun) {
      throw new Error('Safety Lock: Execution attempted while in dry-run mode. Specify execute: true.')
    }

    if (!this.supabaseAdmin) {
      throw new Error('Supabase admin client not initialized. Missing SUPABASE_SERVICE_ROLE_KEY.')
    }

    // Filter to single pilot user if requested
    let targetUsers = users
    if (options.pilotUserId) {
      targetUsers = users.filter((u) => u.id === options.pilotUserId)
      if (targetUsers.length !== 1) {
        throw new Error(`Pilot user '${options.pilotUserId}' not found in user candidate list.`)
      }
    } else {
      // Guard against accidental full rollout without explicit flag
      throw new Error(
        'Safety Lock: Pilot rollout requires specifying pilotUserId. Full multi-user rollout not approved in Phase 14.4B.1.'
      )
    }

    const auditLog: ProvisionAuditEntry[] = []
    const staffMap = new Map<string, ProvisionStaffRecord>(staff.map((s) => [s.id, s]))

    // 1. Fetch current auth users from Supabase Admin API
    const { data: authData, error: authListError } = await this.supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (authListError) {
      throw new Error(`Failed to list existing auth users: ${authListError.message}`)
    }

    const existingAuthMap = new Map<string, { id: string; email: string }>(
      authData.users.map((u) => [normalizeEmail(u.email || ''), { id: u.id, email: u.email || '' }])
    )

    for (const user of targetUsers) {
      const opId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`
      const normEmail = normalizeEmail(user.email)
      const evaluation = evaluateUserForProvisioning(user, staffMap, existingAuthMap)

      if (evaluation.proposedAction === 'REJECT_ERROR') {
        auditLog.push({
          operationId: opId,
          timestamp: new Date().toISOString(),
          userId: user.id,
          normalizedEmail: normEmail,
          role: user.role,
          action: 'VALIDATION_REJECTION',
          status: 'FAILED',
          authUserId: null,
          message: evaluation.notes,
        })
        continue
      }

      if (evaluation.proposedAction === 'SKIP_ALREADY_LINKED') {
        auditLog.push({
          operationId: opId,
          timestamp: new Date().toISOString(),
          userId: user.id,
          normalizedEmail: normEmail,
          role: user.role,
          action: 'SKIP_LINKED',
          status: 'SKIPPED',
          authUserId: user.auth_user_id || null,
          message: evaluation.notes,
        })
        continue
      }

      let targetAuthId: string

      // Case A: Identity already exists in auth.users
      if (evaluation.proposedAction === 'LINK_EXISTING') {
        const existingAuth = existingAuthMap.get(normEmail)!
        targetAuthId = existingAuth.id
      } else {
        // Safety Guard: Block dispatching invitations to placeholder email addresses
        if (isPlaceholderEmail(normEmail)) {
          auditLog.push({
            operationId: opId,
            timestamp: new Date().toISOString(),
            userId: user.id,
            normalizedEmail: normEmail,
            role: user.role,
            action: 'SEND_INVITATION',
            status: 'FAILED',
            authUserId: null,
            message: `Blocked: Placeholder email address (${normEmail}) cannot receive live Supabase Auth invitations. Update to a real verified inbox required.`,
          })
          continue
        }

        // Case B: Dispatch Supabase Auth Invitation Email (Option A)
        const { data: inviteData, error: inviteError } = await this.supabaseAdmin.auth.admin.inviteUserByEmail(
          normEmail,
          {
            redirectTo: this.redirectUrl,
            data: {
              name: user.name,
              role: user.role,
              app_user_id: user.id,
              employee_id: user.employee_id,
            },
          }
        )

        if (inviteError || !inviteData?.user?.id) {
          auditLog.push({
            operationId: opId,
            timestamp: new Date().toISOString(),
            userId: user.id,
            normalizedEmail: normEmail,
            role: user.role,
            action: 'SEND_INVITATION',
            status: 'FAILED',
            authUserId: null,
            message: `Invitation failed: ${inviteError?.message || 'Unknown error'}`,
          })
          continue
        }

        targetAuthId = inviteData.user.id
        existingAuthMap.set(normEmail, { id: targetAuthId, email: normEmail })
      }

      // Link identity in public.users: strictly check auth_user_id IS NULL to avoid overwriting
      const { data: updateData, error: updateError } = await this.supabaseAdmin
        .from('users')
        .update({
          auth_user_id: targetAuthId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
        .is('auth_user_id', null)
        .select('id, auth_user_id')

      if (updateError) {
        auditLog.push({
          operationId: opId,
          timestamp: new Date().toISOString(),
          userId: user.id,
          normalizedEmail: normEmail,
          role: user.role,
          action: 'LINK_PUBLIC_USER',
          status: 'PARTIAL_FAILURE_DB_LINK',
          authUserId: targetAuthId,
          affectedRows: 0,
          message: `Database linkage failed (${updateError.message}). Auth account retained; subsequent run will link existing identity safely.`,
        })
      } else if (!updateData || updateData.length !== 1) {
        // Unexpected affected rows count (expected exactly 1)
        auditLog.push({
          operationId: opId,
          timestamp: new Date().toISOString(),
          userId: user.id,
          normalizedEmail: normEmail,
          role: user.role,
          action: 'LINK_PUBLIC_USER',
          status: 'PARTIAL_FAILURE_DB_LINK',
          authUserId: targetAuthId,
          affectedRows: updateData?.length || 0,
          message: `Database linkage updated unexpected number of rows (${updateData?.length || 0}). Auth account retained.`,
        })
      } else {
        auditLog.push({
          operationId: opId,
          timestamp: new Date().toISOString(),
          userId: user.id,
          normalizedEmail: normEmail,
          role: user.role,
          action: evaluation.proposedAction === 'LINK_EXISTING' ? 'LINK_EXISTING' : 'INVITE_AND_LINK',
          status: 'SUCCESS',
          authUserId: targetAuthId,
          affectedRows: 1,
          message: 'Invitation dispatched and public.users linked successfully (1 row affected).',
        })
      }
    }

    return auditLog
  }
}
