// Core Salon Data Domain Models

export type StaffRole =
  | 'owner'
  | 'master_stylist'
  | 'senior_stylist'
  | 'colorist'
  | 'junior_stylist'

export type ServiceCategory =
  | 'haircut'
  | 'color'
  | 'styling'
  | 'treatment'
  | 'extensions'

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no-show'

export interface DayHours {
  open: string // e.g. "09:00"
  close: string // e.g. "19:00"
  isOpen: boolean
}

export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export type WeeklySchedule = Record<DayOfWeek, DayHours>

export interface SalonAddress {
  street: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface Salon {
  id: string
  name: string
  ownerName: string
  phone: string
  email: string
  address: SalonAddress
  timezone: string
  currency: string
  currencySymbol: string
  language: string
  workingHours: WeeklySchedule
  createdAt: string
}

export interface Staff {
  id: string
  salonId: string
  name: string
  phone: string
  email: string
  role: StaffRole
  skills: string[]
  experience: string
  active: boolean
  workingHours: WeeklySchedule
  avatarUrl?: string
  gender?: 'Male' | 'Female' | 'Other'
  jobTitle?: string
}

export interface Service {
  id: string
  salonId: string
  name: string
  description: string
  duration: number // in minutes
  price: number
  category: ServiceCategory
  active: boolean
}

export interface ClientPreferences {
  preferredStylistId?: string
  preferredBeverage?: string
  hairType?: string
  allergies?: string
  notes?: string
}

export interface Client {
  id: string
  salonId: string
  name: string
  phone: string
  email: string
  dateOfBirth?: string
  preferences: ClientPreferences
  notes: string
  createdAt: string
  lastVisitAt?: string
  totalSpend: number
  isVip?: boolean
}

export interface Appointment {
  id: string
  salonId: string
  clientId: string
  staffId: string
  assignedEmployeeId?: string
  serviceId: string
  date: string // Format "YYYY-MM-DD"
  startTime: string // Format "HH:mm" (24h)
  endTime: string // Format "HH:mm" (24h)
  status: AppointmentStatus
  price: number
  notes?: string
  createdAt: string
  reminderSent?: boolean
  lastReminderSentAt?: string
  reminderDeliveryStatus?: 'pending' | 'sent' | 'delivered' | 'failed'
  bookingSource?: 'online' | 'in_salon' | 'ai_assistant'
  // Operational check-in & lifecycle tracking
  checkedInAt?: string
  serviceStartedAt?: string
  completedAt?: string
  cancellationReason?: string
  // Historical snapshot metadata
  clientName?: string
  clientPhone?: string
  clientEmail?: string
  staffName?: string
  serviceName?: string
}

// Joined View Model for UI and AI assistant responses
export interface EnrichedAppointment extends Appointment {
  client?: Client
  staff?: Staff
  service?: Service
}

// ==========================================
// Phase 11 & Phase B: User Management & Admin Models
// ==========================================

export type UserRole = 'ADMIN' | 'OWNER' | 'RECEPTIONIST' | 'EMPLOYEE'

export type OwnerDesignation = 'OWNER_1' | 'OWNER_2'

export type EmployeeSpecialty = 'Hair' | 'Skin' | 'Nail' | string

export interface Administrator {
  id: string
  authUserId?: string
  email: string
  name: string
  role: 'ADMIN'
  active: boolean
  createdAt: string
  updatedAt?: string
}

export interface User {
  id: string
  salonId: string
  name: string
  email: string
  role: UserRole
  phone?: string
  ownerDesignation?: OwnerDesignation | null
  employeeId?: string // linked staffId if role === 'EMPLOYEE'
  specialty?: EmployeeSpecialty
  active: boolean
  avatarUrl?: string
  createdAt: string
  updatedAt?: string
  authUserId?: string
}

export interface UserSession {
  sessionId: string
  userId: string
  salonId?: string
  name: string
  email: string
  role: UserRole
  ownerDesignation?: OwnerDesignation | null
  employeeId?: string
  specialty?: EmployeeSpecialty
  isAuthenticated: boolean
  avatarUrl?: string
  createdAt: string
  expiresAt: string
}

export interface CredentialRecord {
  userId: string
  email: string
  salt: string
  passwordHash: string
  updatedAt: string
}

// Product Inventory Domain Types (Phase 2)
export * from './inventory'


