import type {
  Salon,
  Staff,
  Service,
  Client,
  Appointment,
  WeeklySchedule,
} from '../types/models.ts'

const standardSalonHours: WeeklySchedule = {
  monday: { open: '10:00', close: '20:00', isOpen: true },
  tuesday: { open: '10:00', close: '20:00', isOpen: true },
  wednesday: { open: '10:00', close: '20:00', isOpen: true },
  thursday: { open: '10:00', close: '20:00', isOpen: true },
  friday: { open: '10:00', close: '21:00', isOpen: true },
  saturday: { open: '09:30', close: '21:00', isOpen: true },
  sunday: { open: '10:00', close: '20:00', isOpen: true },
}

export const mockSalon: Salon = {
  id: 'salon-luma-01',
  name: 'Hair Dexirity',
  ownerName: 'Salon Owner',
  phone: '+91 98765 43210',
  email: 'contact@hairdexirity.example.com',
  address: {
    street: 'Level 2, Galleria Market, DLF Phase IV',
    city: 'Gurugram',
    state: 'Haryana',
    postalCode: '122009',
    country: 'India',
  },
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  currencySymbol: '₹',
  language: 'en',
  workingHours: standardSalonHours,
  createdAt: '2023-01-15T08:00:00.000Z',
}

/**
 * Clean baseline: All dummy mock staff, services, clients, and appointments deleted.
 * Ready for fresh actual real data.
 */
export const mockStaff: Staff[] = []
export const mockServices: Service[] = []
export const mockClients: Client[] = []
export const mockAppointments: Appointment[] = []
