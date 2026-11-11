import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { UsersIcon, ScissorsIcon, ClockIcon, AwardIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface ReceptionistWalkInsViewProps {
  onNavigate: (route: NavId) => void
}

export const ReceptionistWalkInsView: React.FC<ReceptionistWalkInsViewProps> = ({ onNavigate }) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="RECEPTIONIST"
        roleLabel="Front Desk Workspace"
        title="Walk-ins"
        subtitle="Manage unscheduled guest arrivals, evaluate wait times, and dispatch available stylists."
      />

      <DashboardFoundationBanner
        moduleName="Walk-in Queue & Rapid Intake"
        scopeDescription="Streamlined intake workflow for walk-in guests, calculating estimated wait times and assigning available stylists based on skills and station availability."
        plannedFeatures={[
          'Instant Guest Intake Form (Name, Phone, Service Requested)',
          'Live Estimated Wait Time Display',
          'Next-Available Stylist Auto-Match',
          'Walk-in to Appointment Conversion',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Walk-in Status"
          value="Open"
          subtext="Accepting floor walk-ins"
          icon={<UsersIcon size={20} />}
        />
        <MetricCard
          label="Average Wait"
          value="~15 Mins"
          subtext="Dynamic station calculation"
          icon={<ClockIcon size={20} />}
        />
        <MetricCard
          label="Available Stations"
          value="Ready"
          subtext="18 styling & wash chairs"
          icon={<ScissorsIcon size={20} />}
        />
        <MetricCard
          label="Express Intake"
          value="Synchronized"
          subtext="Client database integrated"
          icon={<AwardIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Walk-in Queue Actions"
        subtitle="Direct access to front desk tools."
        statusBadge="Walk-in Desk"
      >
        <div className="dashboard-quick-links-grid">
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('receptionist/dashboard')}
          >
            <div className="quick-link-icon">
              <UsersIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Return to Front Desk</span>
              <span className="quick-link-desc">View primary desk overview</span>
            </div>
          </button>
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('clients')}
          >
            <div className="quick-link-icon">
              <UsersIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Search Client History</span>
              <span className="quick-link-desc">Lookup previous visits</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}

