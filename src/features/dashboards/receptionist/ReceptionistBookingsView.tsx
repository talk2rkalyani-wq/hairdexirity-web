import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { CalendarPlusIcon, CalendarIcon, UsersIcon, ScissorsIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface ReceptionistBookingsViewProps {
  onNavigate: (route: NavId) => void
}

export const ReceptionistBookingsView: React.FC<ReceptionistBookingsViewProps> = ({ onNavigate }) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="RECEPTIONIST"
        roleLabel="Front Desk Workspace"
        title="New Booking"
        subtitle="Schedule new client appointments, select preferred stylists, and configure service bookings."
      />

      <DashboardFoundationBanner
        moduleName="Front Desk Booking Engine"
        scopeDescription="Dedicated fast-booking interface for front desk staff to schedule appointments, check stylist slot conflicts, and send automated client confirmations."
        plannedFeatures={[
          'Fast Client Lookup & Phone Search',
          'Service Multi-Select & Duration Calculator',
          'Stylist Conflict-Free Slot Finder',
          'Immediate WhatsApp / SMS Booking Confirmation',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Booking Mode"
          value="In-Salon & Phone"
          subtext="Front desk reservation desk"
          icon={<CalendarPlusIcon size={20} />}
        />
        <MetricCard
          label="Stylist Availability"
          value="Conflict Guard"
          subtext="Prevents double-booking slots"
          icon={<CalendarIcon size={20} />}
        />
        <MetricCard
          label="Client Directory"
          value="Active"
          subtext="Instant auto-complete lookup"
          icon={<UsersIcon size={20} />}
        />
        <MetricCard
          label="Service Menu"
          value="Synchronized"
          subtext="Current durations & prices"
          icon={<ScissorsIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Booking Actions"
        subtitle="Open operational calendar for direct booking creation."
        statusBadge="Booking Portal"
      >
        <div className="dashboard-quick-links-grid">
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('receptionist/calendar')}
          >
            <div className="quick-link-icon">
              <CalendarIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Open Appointment Calendar</span>
              <span className="quick-link-desc">Select date & time slot to book</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}

