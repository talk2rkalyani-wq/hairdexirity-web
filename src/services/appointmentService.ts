import type {
  Appointment,
  EnrichedAppointment,
  AppointmentStatus,
} from '../types/models.ts'
import { appointmentStore } from './appointmentStore.ts'
import { staffService } from './staffService.ts'
import { clientService } from './clientService.ts'
import { serviceService } from './serviceService.ts'
import { sessionService } from './sessionService.ts'
import { permissionService } from './permissionService.ts'
import { notificationService } from './notificationService.ts'
import { getSalonDateStr, getDayOfWeekKey, timeToMinutes } from '../utils/formatters.ts'

const getTodayDateStr = (): string => getSalonDateStr(0)

/**
 * Scopes an appointment list to the currently logged-in user's role and identity.
 * For EMPLOYEE roles, strictly isolates records to appointments assigned to their employeeId.
 */
function filterAppointmentsBySession(appointments: Appointment[]): Appointment[] {
  const session = sessionService.getCurrentSession()
  if (!session || !session.isAuthenticated) {
    return []
  }

  // Owners and Receptionists have access to all appointments across the salon
  if (session.role === 'OWNER' || session.role === 'RECEPTIONIST') {
    return appointments
  }

  // Employees only see their own assigned appointments
  if (session.role === 'EMPLOYEE' && session.employeeId) {
    const employeeStaffId = session.employeeId
    return appointments.filter(
      (a) =>
        a.staffId === employeeStaffId ||
        (a as Record<string, any>).assignedEmployeeId === employeeStaffId
    )
  }

  return []
}

/**
 * Helper to enrich appointments with Client, Staff, and Service entities.
 * Resolves against active service layers, falling back to resilient archived
 * entity representations only for legacy orphaned records to guarantee UI never crashes.
 */
async function enrichAppointments(appointments: Appointment[]): Promise<EnrichedAppointment[]> {
  const [clients, staff, services] = await Promise.all([
    clientService.getClients(),
    staffService.getStaff(),
    serviceService.getServices(),
  ])

  return appointments.map((apt) => {
    const rawApt = apt as Record<string, any>

    const client =
      clients.find((c) => c.id === apt.clientId) || {
        id: apt.clientId,
        salonId: apt.salonId || 'salon-luma-01',
        name: apt.clientName || rawApt.clientName || 'Archived Client',
        phone: apt.clientPhone || rawApt.clientPhone || '—',
        email: apt.clientEmail || rawApt.clientEmail || '—',
        preferences: {},
        notes: 'Historical appointment record',
        createdAt: apt.createdAt || apt.date,
        totalSpend: apt.price || 0,
      }

    const stylist =
      staff.find((s) => s.id === apt.staffId) || {
        id: apt.staffId,
        salonId: apt.salonId || 'salon-luma-01',
        name: apt.staffName || rawApt.staffName || 'Former Stylist',
        phone: '—',
        email: '—',
        role: 'junior_stylist' as const,
        skills: [],
        experience: '—',
        active: false,
        workingHours: {
          monday: { open: '10:00', close: '20:00', isOpen: true },
          tuesday: { open: '10:00', close: '20:00', isOpen: true },
          wednesday: { open: '10:00', close: '20:00', isOpen: true },
          thursday: { open: '10:00', close: '20:00', isOpen: true },
          friday: { open: '10:00', close: '21:00', isOpen: true },
          saturday: { open: '09:30', close: '21:00', isOpen: true },
          sunday: { open: '10:00', close: '20:00', isOpen: true },
        },
      }

    const service =
      services.find((srv) => srv.id === apt.serviceId) || {
        id: apt.serviceId,
        salonId: apt.salonId || 'salon-luma-01',
        name: apt.serviceName || rawApt.serviceName || 'Archived Service',
        description: 'Historical salon service',
        duration: 45,
        price: apt.price,
        category: 'haircut' as const,
        active: false,
      }

    return {
      ...apt,
      client,
      staff: stylist,
      service,
    }
  })
}


export const appointmentService = {
  /**
   * Subscribes to changes in the canonical appointment store
   */
  subscribe(listener: (appointments: Appointment[]) => void): () => void {
    return appointmentStore.subscribe(listener)
  },

  /**
   * Retrieves all appointments from canonical store, scoped by active session
   */
  async getAppointments(options?: { ignoreScope?: boolean }): Promise<Appointment[]> {
    const all = appointmentStore.getAll()
    if (options?.ignoreScope) return Promise.resolve(all)
    return Promise.resolve(filterAppointmentsBySession(all))
  },

  /**
   * Retrieves an appointment by ID from canonical store, enforcing permission check
   */
  async getAppointmentById(id: string): Promise<Appointment | null> {
    const found = appointmentStore.getById(id)
    if (!found) return Promise.resolve(null)
    const session = sessionService.getCurrentSession()
    if (session && session.isAuthenticated && !permissionService.canViewAppointment(found, session)) {
      return Promise.resolve(null)
    }
    return Promise.resolve(found)
  },

  /**
   * Retrieves appointments for a specific date (YYYY-MM-DD), scoped by active session
   */
  async getAppointmentsForDate(
    date: string,
    options?: { ignoreScope?: boolean }
  ): Promise<Appointment[]> {
    const list = appointmentStore.getByDate(date)
    if (options?.ignoreScope) return Promise.resolve(list)
    return Promise.resolve(filterAppointmentsBySession(list))
  },

  /**
   * AI-Ready helper: Retrieves today's bookings, scoped by active session
   */
  async getTodayAppointments(options?: { ignoreScope?: boolean }): Promise<Appointment[]> {
    return this.getAppointmentsForDate(getTodayDateStr(), options)
  },

  /**
   * Retrieves appointments for a date with joined Client, Staff, and Service details, scoped by session
   */
  async getEnrichedAppointmentsForDate(
    date: string = getTodayDateStr(),
    options?: { ignoreScope?: boolean }
  ): Promise<EnrichedAppointment[]> {
    let appointments = appointmentStore.getByDate(date)
    if (!options?.ignoreScope) {
      appointments = filterAppointmentsBySession(appointments)
    }
    return enrichAppointments(appointments)
  },

  /**
   * Retrieves all appointments for a specific client with joined Service and Staff details,
   * sorted by date descending (most recent first), scoped by session
   */
  async getAppointmentsForClient(
    clientId: string,
    options?: { ignoreScope?: boolean }
  ): Promise<EnrichedAppointment[]> {
    let clientApts = appointmentStore.getByClientId(clientId)
    if (!options?.ignoreScope) {
      clientApts = filterAppointmentsBySession(clientApts)
    }
    return enrichAppointments(clientApts)
  },

  /**
   * Retrieves appointments across a date range (inclusive), enriched with Client, Staff, and Service details, scoped by session
   */
  async getEnrichedAppointmentsForDateRange(
    startDate: string,
    endDate: string,
    options?: { ignoreScope?: boolean }
  ): Promise<EnrichedAppointment[]> {
    let appointments = appointmentStore.getByDateRange(startDate, endDate)
    if (!options?.ignoreScope) {
      appointments = filterAppointmentsBySession(appointments)
    }
    return enrichAppointments(appointments)
  },


  /**
   * Deterministic Business Logic: Validates appointment booking for:
   * 1. Active stylist check
   * 2. Stylist working hours boundary check
   * 3. Stylist overlapping appointment conflict check
   */
  async validateAppointmentBooking(data: {
    staffId: string
    date: string
    startTime: string
    endTime: string
    excludeAppointmentId?: string
  }): Promise<{ isValid: boolean; error?: string }> {
    const { staffId, date, startTime, endTime, excludeAppointmentId } = data

    // 1. Basic time sequence validation
    const startMins = timeToMinutes(startTime)
    const endMins = timeToMinutes(endTime)
    if (endMins <= startMins) {
      return Promise.resolve({
        isValid: false,
        error: 'Appointment end time must be after the start time.',
      })
    }

    // 2. Fetch staff member
    const staff = await staffService.getStaffById(staffId)
    if (!staff) {
      return Promise.resolve({
        isValid: false,
        error: 'Selected stylist does not exist.',
      })
    }

    if (!staff.active) {
      return Promise.resolve({
        isValid: false,
        error: `${staff.name} is currently inactive and cannot accept bookings.`,
      })
    }

    // 3. Working Hours Check (using salon timezone Asia/Kolkata)
    const dayKey = getDayOfWeekKey(date)
    const daySchedule = staff.workingHours?.[dayKey]
    if (!daySchedule || !daySchedule.isOpen) {
      const capitalizedDay = dayKey.charAt(0).toUpperCase() + dayKey.slice(1)
      return Promise.resolve({
        isValid: false,
        error: `${staff.name} is not scheduled to work on ${capitalizedDay}s.`,
      })
    }

    const openMins = timeToMinutes(daySchedule.open)
    const closeMins = timeToMinutes(daySchedule.close)
    if (startMins < openMins || endMins > closeMins) {
      return Promise.resolve({
        isValid: false,
        error: `This stylist is not scheduled to work during this time (${staff.name}'s hours on ${dayKey}: ${daySchedule.open} – ${daySchedule.close}).`,
      })
    }

    // 4. Overlapping Appointment Check against canonical store
    const activeStaffAppointments = appointmentStore
      .getByDate(date)
      .filter(
        (a) =>
          a.staffId === staffId &&
          a.status !== 'cancelled' &&
          a.id !== excludeAppointmentId
      )

    const hasOverlap = activeStaffAppointments.some((apt) => {
      const otherStart = timeToMinutes(apt.startTime)
      const otherEnd = timeToMinutes(apt.endTime)
      // Overlap formula: startA < endB && endA > startB
      return startMins < otherEnd && endMins > otherStart
    })

    if (hasOverlap) {
      return Promise.resolve({
        isValid: false,
        error: `${staff.name} already has an appointment during this time.`,
      })
    }

    return Promise.resolve({ isValid: true })
  },

  /**
   * Creates a new appointment with deterministic business validation,
   * generates a stable unique ID, and persists to the canonical store.
   * Strictly enforces assignment permissions: Only OWNER and RECEPTIONIST can assign services.
   */
  async createAppointment(
    data: Omit<Appointment, 'id' | 'salonId' | 'createdAt'>
  ): Promise<Appointment> {
    if (!permissionService.canAssignServices()) {
      return Promise.reject(
        new Error('Unauthorized: Only salon owners and receptionists can assign or schedule appointments.')
      )
    }

    const validation = await this.validateAppointmentBooking({
      staffId: data.staffId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
    })

    if (!validation.isValid) {
      return Promise.reject(new Error(validation.error || 'Invalid appointment booking.'))
    }

    const [client, staff, service] = await Promise.all([
      clientService.getClientById(data.clientId),
      staffService.getStaffById(data.staffId),
      serviceService.getServiceById(data.serviceId),
    ])

    const uniqueId = `apt-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    const created: Appointment = {
      ...data,
      id: uniqueId,
      salonId: 'salon-luma-01',
      assignedEmployeeId: data.assignedEmployeeId || data.staffId,
      createdAt: new Date().toISOString(),
      clientName: data.clientName || client?.name,
      clientPhone: data.clientPhone || client?.phone,
      clientEmail: data.clientEmail || client?.email,
      staffName: data.staffName || staff?.name,
      serviceName: data.serviceName || service?.name,
    }

    const added = appointmentStore.add(created)

    // Verification check to ensure persistence succeeded
    const verified = appointmentStore.getById(uniqueId)
    if (!verified) {
      return Promise.reject(
        new Error('Failed to commit appointment to canonical storage.')
      )
    }

    return Promise.resolve({ ...added })
  },

  /**
   * Updates an appointment's details with validation on schedule changes,
   * persisting updates directly to canonical store.
   * Enforces role policies: Employees cannot reassign appointments to other staff.
   */
  async updateAppointment(
    id: string,
    updates: Partial<Appointment>
  ): Promise<Appointment> {
    const current = appointmentStore.getById(id)
    if (!current) {
      return Promise.reject(new Error(`Appointment with ID ${id} not found`))
    }

    const session = sessionService.getCurrentSession()
    if (session && session.isAuthenticated && session.role === 'EMPLOYEE') {
      const assigned = current.assignedEmployeeId || current.staffId
      if (assigned !== session.employeeId) {
        return Promise.reject(
          new Error('Unauthorized: You cannot modify appointments assigned to other employees.')
        )
      }
      if (updates.staffId && updates.staffId !== session.employeeId) {
        return Promise.reject(
          new Error('Unauthorized: Employees cannot reassign appointments to other staff members.')
        )
      }
    }

    const updatedStaffId = updates.staffId || current.staffId
    const updatedDate = updates.date || current.date
    const updatedStart = updates.startTime || current.startTime
    const updatedEnd = updates.endTime || current.endTime
    const updatedStatus = updates.status || current.status

    // If timing or stylist changed and appointment is active, validate
    if (
      updatedStatus !== 'cancelled' &&
      (updates.staffId || updates.date || updates.startTime || updates.endTime)
    ) {
      const validation = await this.validateAppointmentBooking({
        staffId: updatedStaffId,
        date: updatedDate,
        startTime: updatedStart,
        endTime: updatedEnd,
        excludeAppointmentId: id,
      })

      if (!validation.isValid) {
        return Promise.reject(new Error(validation.error || 'Invalid appointment update.'))
      }
    }

    const safeUpdates: Partial<Appointment> = {
      ...updates,
      ...(updates.staffId && !updates.assignedEmployeeId
        ? { assignedEmployeeId: updates.staffId }
        : {}),
    }

    const updated = appointmentStore.update(id, safeUpdates)
    if (!updated) {
      return Promise.reject(new Error(`Failed to update appointment ${id}`))
    }

    return Promise.resolve({ ...updated })
  },


  /**
   * Quick status transition helper
   */
  async updateAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    metadata?: { cancellationReason?: string; timestamp?: string }
  ): Promise<Appointment> {
    const updates: Partial<Appointment> = { status }
    const nowIso = metadata?.timestamp || new Date().toISOString()
    
    if (status === 'checked_in') {
      updates.checkedInAt = nowIso
    } else if (status === 'in_progress') {
      updates.serviceStartedAt = nowIso
    } else if (status === 'completed') {
      updates.completedAt = nowIso
    } else if (status === 'cancelled' && metadata?.cancellationReason) {
      updates.cancellationReason = metadata.cancellationReason
    }

    return this.updateAppointment(id, updates)
  },

  /**
   * Checks in a client upon physical arrival at the salon reception.
   * Authorized for: OWNER, ADMIN, RECEPTIONIST.
   */
  async checkInAppointment(
    id: string,
    customTimestamp?: string
  ): Promise<Appointment> {
    const current = appointmentStore.getById(id)
    if (!current) {
      return Promise.reject(new Error(`Appointment ${id} not found.`))
    }

    const session = sessionService.getCurrentSession()
    if (session && session.isAuthenticated && session.role === 'EMPLOYEE') {
      return Promise.reject(
        new Error('Unauthorized: Stylists cannot perform front-desk check-ins. Please contact the receptionist.')
      )
    }

    if (current.status === 'checked_in') {
      return Promise.resolve(current) // Idempotent
    }

    if (current.status === 'completed' || current.status === 'cancelled' || current.status === 'no-show') {
      return Promise.reject(
        new Error(`Cannot check in an appointment that is already ${current.status}.`)
      )
    }

    const nowIso = customTimestamp || new Date().toISOString()
    const updated = await this.updateAppointment(id, {
      status: 'checked_in',
      checkedInAt: nowIso,
    })

    // Dispatch operational notifications for Front Desk & assigned Stylist
    try {
      const salonId = current.salonId || 'salon-luma-01'
      // 1. Receptionist Notification
      notificationService.createNotification({
        salonId,
        targetRole: 'RECEPTIONIST',
        category: 'appointment',
        severity: 'info',
        title: `Client Checked In: ${current.clientName || 'Guest'}`,
        message: `Arrived for ${current.serviceName || 'Service'}. Ready in waiting lounge.`,
        actionUrl: 'receptionist/check-in',
        deduplicationKey: `apt-checkin-${current.id}`,
        metadata: { appointmentId: current.id },
      })

      // 2. Assigned Stylist Notification
      const targetStaffId = current.assignedEmployeeId || current.staffId
      if (targetStaffId) {
        notificationService.createNotification({
          salonId,
          recipientUserId: targetStaffId,
          targetRole: 'EMPLOYEE',
          category: 'appointment',
          severity: 'info',
          title: `Client Waiting in Lounge: ${current.clientName || 'Guest'}`,
          message: `${current.clientName || 'Guest'} has arrived for ${current.serviceName || 'Service'}.`,
          actionUrl: 'employee/service-workflow',
          deduplicationKey: `stylist-waiting-${current.id}`,
          metadata: { appointmentId: current.id },
        })
      }
    } catch (e) {
      console.warn('Failed to dispatch check-in notification:', e)
    }

    return updated
  },

  /**
   * Commences service for a client on the salon floor.
   * Authorized for: Assigned Stylist, Receptionist, Owner, Admin.
   */
  async startServiceAppointment(
    id: string,
    customTimestamp?: string
  ): Promise<Appointment> {
    const current = appointmentStore.getById(id)
    if (!current) {
      return Promise.reject(new Error(`Appointment ${id} not found.`))
    }

    const session = sessionService.getCurrentSession()
    if (session && session.isAuthenticated && session.role === 'EMPLOYEE') {
      const assigned = current.assignedEmployeeId || current.staffId
      if (assigned !== session.employeeId) {
        return Promise.reject(
          new Error('Unauthorized: You can only start services for your own assigned appointments.')
        )
      }
    }

    if (current.status === 'in_progress') {
      return Promise.resolve(current) // Idempotent
    }

    if (current.status === 'completed' || current.status === 'cancelled' || current.status === 'no-show') {
      return Promise.reject(
        new Error(`Cannot start service for an appointment that is already ${current.status}.`)
      )
    }

    const nowIso = customTimestamp || new Date().toISOString()
    const updates: Partial<Appointment> = {
      status: 'in_progress',
      serviceStartedAt: nowIso,
    }
    // If not previously checked in, also record check-in timestamp
    if (!current.checkedInAt) {
      updates.checkedInAt = nowIso
    }

    const updated = await this.updateAppointment(id, updates)

    // Dispatch service completion notice for Front Desk billing
    try {
      const salonId = current.salonId || 'salon-luma-01'
      notificationService.createNotification({
        salonId,
        targetRole: 'RECEPTIONIST',
        category: 'appointment',
        severity: 'info',
        title: `Service Finished: ${current.clientName || 'Client'}`,
        message: `${current.serviceName || 'Service'} completed. Ready for checkout at reception.`,
        actionUrl: 'receptionist/check-in',
        deduplicationKey: `apt-completed-${current.id}`,
        metadata: { appointmentId: current.id },
      })
    } catch (e) {
      console.warn('Failed to dispatch service completion notification:', e)
    }

    return updated
  },

  /**
   * Marks service completed upon finish and checkout.
   * Authorized for: Assigned Stylist, Receptionist, Owner, Admin.
   */
  async completeServiceAppointment(
    id: string,
    customTimestamp?: string
  ): Promise<Appointment> {
    const current = appointmentStore.getById(id)
    if (!current) {
      return Promise.reject(new Error(`Appointment ${id} not found.`))
    }

    const session = sessionService.getCurrentSession()
    if (session && session.isAuthenticated && session.role === 'EMPLOYEE') {
      const assigned = current.assignedEmployeeId || current.staffId
      if (assigned !== session.employeeId) {
        return Promise.reject(
          new Error('Unauthorized: You can only complete services for your own assigned appointments.')
        )
      }
    }

    if (current.status === 'completed') {
      return Promise.resolve(current) // Idempotent
    }

    const nowIso = customTimestamp || new Date().toISOString()
    const updates: Partial<Appointment> = {
      status: 'completed',
      completedAt: nowIso,
    }
    if (!current.checkedInAt) {
      updates.checkedInAt = nowIso
    }
    if (!current.serviceStartedAt) {
      updates.serviceStartedAt = nowIso
    }

    const updated = await this.updateAppointment(id, updates)

    // Dispatch service completion notice for Front Desk billing
    try {
      const salonId = current.salonId || 'salon-luma-01'
      notificationService.createNotification({
        salonId,
        targetRole: 'RECEPTIONIST',
        category: 'appointment',
        severity: 'info',
        title: `Service Finished: ${current.clientName || 'Client'}`,
        message: `${current.serviceName || 'Service'} completed. Ready for checkout at reception.`,
        actionUrl: 'receptionist/check-in',
        deduplicationKey: `apt-completed-${current.id}`,
        metadata: { appointmentId: current.id },
      })
    } catch (e) {
      console.warn('Failed to dispatch service completion notification:', e)
    }

    return updated
  },

  /**
   * Cancels an appointment with an optional reason.
   */
  async cancelAppointment(
    id: string,
    reason?: string
  ): Promise<Appointment> {
    return this.updateAppointment(id, {
      status: 'cancelled',
      ...(reason ? { cancellationReason: reason } : {}),
    })
  },

  /**
   * AI-Ready helper: Computes revenue breakdown for a given date.
   * e.g. "What's today's revenue?"
   */
  async getRevenueForDate(date: string = getTodayDateStr()): Promise<{
    date: string
    totalRevenue: number
    realizedRevenue: number
    projectedRevenue: number
    completedCount: number
    scheduledCount: number
    checkedInCount: number
    inProgressCount: number
    cancelledCount: number
  }> {
    const appointments = appointmentStore.getByDate(date)

    let realizedRevenue = 0 // completed
    let projectedRevenue = 0 // confirmed + scheduled + checked_in + in_progress
    let completedCount = 0
    let scheduledCount = 0
    let checkedInCount = 0
    let inProgressCount = 0
    let cancelledCount = 0

    for (const apt of appointments) {
      if (apt.status === 'completed') {
        realizedRevenue += apt.price
        completedCount++
      } else if (
        apt.status === 'confirmed' ||
        apt.status === 'scheduled' ||
        apt.status === 'checked_in' ||
        apt.status === 'in_progress'
      ) {
        projectedRevenue += apt.price
        if (apt.status === 'checked_in') checkedInCount++
        else if (apt.status === 'in_progress') inProgressCount++
        else scheduledCount++
      } else if (apt.status === 'cancelled' || apt.status === 'no-show') {
        cancelledCount++
      }
    }

    return Promise.resolve({
      date,
      totalRevenue: realizedRevenue + projectedRevenue,
      realizedRevenue,
      projectedRevenue,
      completedCount,
      scheduledCount,
      checkedInCount,
      inProgressCount,
      cancelledCount,
    })
  },

  /**
   * AI-Ready helper: Gets appointments needing reminders (scheduled or confirmed)
   * e.g. "Send appointment reminders"
   */
  async getPendingRemindersForDate(
    date: string = getTodayDateStr()
  ): Promise<EnrichedAppointment[]> {
    const enriched = await this.getEnrichedAppointmentsForDate(date)
    return enriched.filter(
      (apt) => apt.status === 'scheduled' || apt.status === 'confirmed'
    )
  },
}
