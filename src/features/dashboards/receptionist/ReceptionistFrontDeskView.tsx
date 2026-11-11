import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import {
  ClipboardListIcon,
  CalendarIcon,
  CalendarPlusIcon,
  UserCheckIcon,
  UsersIcon,
  ClockIcon,
} from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface ReceptionistFrontDeskViewProps {
  receptionistName: string
  onNavigate: (route: NavId) => void
}

export const ReceptionistFrontDeskView: React.FC<ReceptionistFrontDeskViewProps> = ({
  receptionistName,
  onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="RECEPTIONIST"
        roleLabel="Front Desk Workspace"
        title="Today's Front Desk"
        subtitle={`Welcome, ${receptionistName}. Front desk operations, appointment calendar, and client check-in.`}
      />

      <DashboardFoundationBanner
        moduleName="Today's Front Desk Command Center"
        scopeDescription="The operational command hub for salon receptionists to manage daily arrivals, walk-in inquiries, stylist assignments, and checkout billing."
        plannedFeatures={[
          'Today\'s Arrival & Expected Guest Queue',
          'Fast Walk-in Registration & Stylist Assignment',
          'One-Click Check-In & Check-Out Billing',
          'Live Stylist Station Availability Feed',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Desk Operations"
          value="Online"
          subtext="Main reception desk ready"
          icon={<ClipboardListIcon size={20} />}
        />
        <MetricCard
          label="Today's Bookings"
          value="Salon-Wide"
          subtext="Full schedule accessible"
          icon={<CalendarIcon size={20} />}
        />
        <MetricCard
          label="Stylist Roster"
          value="18 Stylists"
          subtext="Available for service dispatch"
          icon={<UsersIcon size={20} />}
        />
        <MetricCard
          label="Operating Hours"
          value="10:00 - 20:00"
          subtext="Asia/Kolkata timezone"
          icon={<ClockIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Front Desk Actions"
        subtitle="Quick access to appointment booking, calendar, and reception workflows."
        statusBadge="Front Desk Ready"
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
              <span className="quick-link-title">Appointment Calendar</span>
              <span className="quick-link-desc">Salon-wide schedule & timings</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('receptionist/bookings')}
          >
            <div className="quick-link-icon">
              <CalendarPlusIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">New Booking</span>
              <span className="quick-link-desc">Schedule client appointments</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('receptionist/walk-ins')}
          >
            <div className="quick-link-icon">
              <UsersIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Walk-ins</span>
              <span className="quick-link-desc">Register walk-in clients</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('receptionist/check-in')}
          >
            <div className="quick-link-icon">
              <UserCheckIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Check-in / Check-out</span>
              <span className="quick-link-desc">Manage guest arrival & departure</span>
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
              <span className="quick-link-title">Clients Directory</span>
              <span className="quick-link-desc">Search client profiles & contacts</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}

