import type { Salon } from '../types/models'
import type { NavigationItem, OwnerProfile, SuggestedAction } from '../types/salon'
import { mockSalon } from '../mockData/salonEntities'
import {
  mockOwnerProfile,
  mockNavItems,
  mockSuggestedActions,
} from '../mockData/salonData'

// In-memory clone to simulate persistence
let salonData: Salon = { ...mockSalon }

export const salonService = {
  /**
   * Retrieves the current salon profile and configuration
   */
  async getSalon(): Promise<Salon> {
    return Promise.resolve({ ...salonData })
  },

  /**
   * Updates salon configuration or details
   */
  async updateSalon(updates: Partial<Salon>): Promise<Salon> {
    salonData = { ...salonData, ...updates }
    return Promise.resolve({ ...salonData })
  },

  /**
   * Retrieves the salon owner profile for app header and personalization
   */
  async getOwnerProfile(): Promise<OwnerProfile> {
    return Promise.resolve({ ...mockOwnerProfile })
  },

  /**
   * Retrieves navigation items for the application shell
   */
  async getNavigationItems(): Promise<NavigationItem[]> {
    return Promise.resolve([...mockNavItems])
  },

  /**
   * Retrieves quick suggestion chips for the AI Salon Assistant
   */
  async getSuggestedActions(): Promise<SuggestedAction[]> {
    return Promise.resolve([...mockSuggestedActions])
  },
}
