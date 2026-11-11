import type { NavigationItem, OwnerProfile, SuggestedAction } from '../types/salon'
import miaAvatar from '../assets/avatar-mia.jpg'

export const mockOwnerProfile: OwnerProfile = {
  ownerName: 'Mia',
  salonName: 'Hair Dexirity',
  avatarUrl: miaAvatar,
  isOnline: true,
}

export const mockNavItems: NavigationItem[] = [
  { id: 'assistant', label: 'AI Assistant', icon: 'sparkle', active: true },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'clients', label: 'Clients', icon: 'users' },
  { id: 'staff', label: 'Staff', icon: 'staff' },
  { id: 'services', label: 'Services', icon: 'scissors' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

export const mockSuggestedActions: SuggestedAction[] = [
  {
    id: 'bookings',
    label: "Show today's bookings",
    query: "Show today's bookings",
  },
  {
    id: 'stylist',
    label: 'Find available stylist',
    query: 'Find an available stylist for balayage at 4 PM',
  },
  {
    id: 'reminders',
    label: 'Send appointment reminders',
    query: 'Send appointment reminders',
  },
  {
    id: 'add-client',
    label: 'Add a new client',
    query: 'Add a new client',
  },
  {
    id: 'revenue',
    label: "Today's revenue",
    query: "Today's revenue",
  },
]
