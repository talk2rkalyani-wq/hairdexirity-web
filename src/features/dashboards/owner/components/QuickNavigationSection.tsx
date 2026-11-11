// ==============================================================================
// Luma Salon — Executive Quick Navigation Shortcuts (Phase 2)
// Direct Operational Shortcuts to Core Applications & Workspaces
// ==============================================================================

import React from 'react'
import {
  CalendarIcon,
  UsersIcon,
  ScissorsIcon,
  PackageIcon,
  ActivityIcon,
  TrendingUpIcon,
  SparkleIcon,
} from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface QuickNavigationSectionProps {
  onNavigate: (route: NavId) => void
}

export const QuickNavigationSection: React.FC<QuickNavigationSectionProps> = ({ onNavigate }) => {
  const shortcuts: {
    id: NavId
    title: string
    subtitle: string
    icon: React.ReactNode
    tag: string
  }[] = [
    {
      id: 'calendar',
      title: 'Master Calendar',
      subtitle: 'Salon appointments & bookings',
      icon: <CalendarIcon size={20} />,
      tag: 'Application',
    },
    {
      id: 'clients',
      title: 'Clients CRM',
      subtitle: 'Client profiles & visit history',
      icon: <UsersIcon size={20} />,
      tag: 'Application',
    },
    {
      id: 'staff',
      title: 'Staff Directory',
      subtitle: 'Stylists & work schedules',
      icon: <UsersIcon size={20} />,
      tag: 'Application',
    },
    {
      id: 'services',
      title: 'Service Catalog',
      subtitle: 'Service pricing & duration',
      icon: <ScissorsIcon size={20} />,
      tag: 'Application',
    },
    {
      id: 'inventory',
      title: 'Product Inventory',
      subtitle: 'Stock tracking & audit intake',
      icon: <PackageIcon size={20} />,
      tag: 'Application',
    },
    {
      id: 'owner/live-operations',
      title: 'Live Operations',
      subtitle: 'Live floor monitor & chairs',
      icon: <ActivityIcon size={20} />,
      tag: 'Workspace',
    },
    {
      id: 'owner/reports',
      title: 'Finance & Reports',
      subtitle: 'Revenue summaries & export',
      icon: <TrendingUpIcon size={20} />,
      tag: 'Workspace',
    },
    {
      id: 'assistant',
      title: 'AI Assistant',
      subtitle: 'Voice & text salon assistant',
      icon: <SparkleIcon size={20} />,
      tag: 'Application',
    },
  ]

  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Quick Operational Shortcuts</h2>
          <span className="card-status-badge">Direct Access</span>
        </div>
      </div>

      <p className="dashboard-page-subtitle">
        Jump directly to core management modules, client directories, and salon operations without leaving the executive view.
      </p>

      <div className="dashboard-quick-links-grid">
        {shortcuts.map((sc) => (
          <button
            key={sc.id}
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate(sc.id)}
          >
            <div className="quick-link-icon">{sc.icon}</div>
            <div className="quick-link-info">
              <div className="quick-title-row">
                <span className="quick-link-title">{sc.title}</span>
                <span className="quick-tag-badge">{sc.tag}</span>
              </div>
              <span className="quick-link-desc">{sc.subtitle}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
