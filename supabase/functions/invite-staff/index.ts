// ==============================================================================
// Luma Salon — Supabase Edge Function: invite-staff
// Trusted Server-Side Staff Onboarding & Authentication Provisioning
// ==============================================================================
// STRICT SECURITY BOUNDARY:
// - Uses SUPABASE_SERVICE_ROLE_KEY strictly in server-side Deno runtime.
// - NEVER exposes service_role key to browser, Android client, or source control.
// - Validates caller JWT, identity, role, and salon scope before any operation.
// - Only Root Administrator can manage Owner identities.
// - Salon Owners can invite Receptionists and Employees into their own salon.
// - Rejects placeholder addresses (@lumasalon.example.com).
// ==============================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface InviteRequestBody {
  email: string
  name: string
  role: 'OWNER' | 'RECEPTIONIST' | 'EMPLOYEE'
  ownerDesignation?: 'OWNER_1' | 'OWNER_2'
  salonId?: string
  phone?: string
  specialty?: string
  redirectTo?: string
}

function isPlaceholderEmail(email: string): boolean {
  if (!email) return false
  const norm = email.trim().toLowerCase()
  return (
    norm.endsWith('@lumasalon.example.com') ||
    norm.endsWith('@example.com') ||
    norm.includes('example.com')
  )
}

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing service environment variables.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize privileged admin client for server-side auth operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // 2. Validate Caller JWT Token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: missing or invalid authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '').trim()
    const {
      data: { user: callerAuthUser },
      error: tokenError,
    } = await supabaseAdmin.auth.getUser(token)

    if (tokenError || !callerAuthUser) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid or expired session token.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Resolve Caller Permissions (Root Admin or Salon Owner)
    let isCallerAdmin = false
    let callerSalonId: string | null = null
    let callerRole: string | null = null

    // Check administrators table
    const { data: adminRecord } = await supabaseAdmin
      .from('administrators')
      .select('id, email, role, active')
      .eq('auth_user_id', callerAuthUser.id)
      .eq('active', true)
      .maybeSingle()

    if (adminRecord && adminRecord.role === 'ADMIN') {
      isCallerAdmin = true
      callerRole = 'ADMIN'
    } else {
      // Check users table
      const { data: userRecord } = await supabaseAdmin
        .from('users')
        .select('id, salon_id, role, active')
        .eq('auth_user_id', callerAuthUser.id)
        .eq('active', true)
        .maybeSingle()

      if (userRecord) {
        callerRole = userRecord.role
        callerSalonId = userRecord.salon_id
      }
    }

    if (!callerRole) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: caller has no active application profile.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse & Validate Request Body
    const body: InviteRequestBody = await req.json()
    const { email, name, role, ownerDesignation, specialty, phone } = body

    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({ error: 'Validation error: a valid email address is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // STRICT SAFETY GUARD: Block placeholder domain addresses
    if (isPlaceholderEmail(normalizedEmail)) {
      return new Response(
        JSON.stringify({
          error:
            'Security violation: placeholder email addresses (@lumasalon.example.com) are strictly prohibited from receiving invitations or authentication accounts.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Validation error: user full name is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 5. Role & Permission Authorization Matrix
    if (role === 'OWNER') {
      if (!isCallerAdmin) {
        return new Response(
          JSON.stringify({
            error: 'Forbidden: only the root administrator can invite or configure salon owner accounts.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!ownerDesignation || !['OWNER_1', 'OWNER_2'].includes(ownerDesignation)) {
        return new Response(
          JSON.stringify({
            error: 'Validation error: owner designation must be explicitly set to OWNER_1 or OWNER_2.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if this designation is already occupied by a different email
      const { data: existingDesignation } = await supabaseAdmin
        .from('users')
        .select('email, owner_designation')
        .eq('owner_designation', ownerDesignation)
        .maybeSingle()

      if (existingDesignation && existingDesignation.email.toLowerCase() !== normalizedEmail) {
        return new Response(
          JSON.stringify({
            error: `Conflict: ${ownerDesignation} is already assigned to ${existingDesignation.email}. Reassignment requires manual review.`,
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check max 2 owners constraint
      const { count: ownerCount } = await supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'OWNER')

      if (ownerCount !== null && ownerCount >= 2 && !existingDesignation) {
        return new Response(
          JSON.stringify({ error: 'Conflict: Maximum of 2 salon owners already registered.' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else {
      // For RECEPTIONIST or EMPLOYEE: Caller must be OWNER or ADMIN
      if (!isCallerAdmin && callerRole !== 'OWNER') {
        return new Response(
          JSON.stringify({
            error: 'Forbidden: only salon owners or administrators can invite staff members.',
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Salon scoping: non-admins can only invite staff into their own salon
    const targetSalonId = isCallerAdmin
      ? (body.salonId || callerSalonId || 'salon-luma-01')
      : (callerSalonId || 'salon-luma-01')

    // 6. Check existing user record in salon directory to preserve baseline IDs & appointments
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existingUser && existingUser.auth_user_id) {
      return new Response(
        JSON.stringify({
          error: `Conflict: User ${normalizedEmail} is already linked to an authentication identity (${existingUser.auth_user_id}).`,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 7. Send Supabase Auth Invitation
    const redirectUrl = body.redirectTo || 'https://lumasalon.app/#/login?type=invite'
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      normalizedEmail,
      {
        data: {
          name: name.trim(),
          role: role,
        },
        redirectTo: redirectUrl,
      }
    )

    if (inviteError || !inviteData.user) {
      return new Response(
        JSON.stringify({
          error: `Supabase invitation failed: ${inviteError?.message || 'Unknown auth error'}`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const newAuthUserId = inviteData.user.id

    // 8. Link or create the user directory record
    if (existingUser) {
      // PRESERVE historical staff/user record: Update auth_user_id and details
      const { error: updateErr } = await supabaseAdmin
        .from('users')
        .update({
          auth_user_id: newAuthUserId,
          name: name.trim(),
          owner_designation: role === 'OWNER' ? ownerDesignation : null,
          active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingUser.id)

      if (updateErr) {
        return new Response(
          JSON.stringify({
            error: `Failed to link existing user record: ${updateErr.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Invitation successfully sent to ${normalizedEmail}. Linked to existing profile (${existingUser.id}).`,
          userId: existingUser.id,
          authUserId: newAuthUserId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Create new staff profile if EMPLOYEE
      let newStaffId: string | null = null
      if (role === 'EMPLOYEE') {
        newStaffId = `staff-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
        await supabaseAdmin.from('staff').insert({
          id: newStaffId,
          salon_id: targetSalonId,
          name: name.trim(),
          email: normalizedEmail,
          phone: phone || '+91 98110 00000',
          role: 'junior_stylist',
          skills: [specialty || 'General Service'],
          active: true,
          job_title: specialty ? `${specialty} Specialist` : 'Salon Specialist',
        })
      }

      const newUserId = `user-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
      const { error: insertErr } = await supabaseAdmin.from('users').insert({
        id: newUserId,
        salon_id: targetSalonId,
        auth_user_id: newAuthUserId,
        name: name.trim(),
        email: normalizedEmail,
        role: role,
        owner_designation: role === 'OWNER' ? ownerDesignation : null,
        employee_id: newStaffId,
        specialty: specialty || null,
        active: true,
      })

      if (insertErr) {
        return new Response(
          JSON.stringify({
            error: `Failed to create user directory record: ${insertErr.message}`,
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Invitation successfully sent to ${normalizedEmail}. Created profile ${newUserId}.`,
          userId: newUserId,
          authUserId: newAuthUserId,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error.'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
