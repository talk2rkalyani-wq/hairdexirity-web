import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { CalendarIcon, ClockIcon, ScissorsIcon, UsersIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface EmployeeAppointmentsViewProps {
  onNavigate: (route: NavId) => void
}

export const EmployeeAppointmentsView: React.FC<EmployeeAppointmentsViewProps> = ({ onNavigate }) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="My Appointments"
        subtitle="View and manage appointments assigned exclusively to you."
      />

      <DashboardFoundationBanner
        moduleName="Stylist Appointment Queue"
        scopeDescription="Displays appointments assigned exclusively to your staff profile. Full database RLS enforces that you only query and view your own client bookings."
        plannedFeatures={[
          'Assigned Client Schedule & Contact Info',
          'Appointment Status Progression (Started, Completed)',
          'Client Formula & Service History Notes',
          'Daily Service Duration Tracker',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Appointment Isolation"
          value="Enforced"
          subtext="Database RLS isolates other stylists"
          icon={<CalendarIcon size={20} />}
        />
        <MetricCard
          label="Assigned Schedule"
          value="Synchronized"
          subtext="Real-time booking updates"
          icon={<ClockIcon size={20} />}
        />
        <MetricCard
          label="Service Assignment"
          value="Personal"
          subtext="Only your booked services"
          icon={<ScissorsIcon size={20} />}
        />
        <MetricCard
          label="Client Details"
          value="Accessible"
          subtext="Notes & preferences visible"
          icon={<UsersIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Calendar & Scheduling"
        subtitle="Open your personal calendar view."
        statusBadge="Personal Schedule"
      >
        <div className="dashboard-quick-links-grid">
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('calendar')}
          >
            <div className="quick-link-icon">
              <CalendarIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Open Scoped Calendar</span>
              <span className="quick-link-desc">View calendar grid for your appointments</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}

