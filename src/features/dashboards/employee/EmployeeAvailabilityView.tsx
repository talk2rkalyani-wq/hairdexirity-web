import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { CoffeeIcon, ClockIcon, SunIcon, CheckIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface EmployeeAvailabilityViewProps {
  onNavigate: (route: NavId) => void
}

export const EmployeeAvailabilityView: React.FC<EmployeeAvailabilityViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="Availability & Breaks"
        subtitle="Manage your daily availability, break slots, and floor schedule status."
      />

      <DashboardFoundationBanner
        moduleName="Stylist Availability & Break Manager"
        scopeDescription="Empowers stylists to request break periods, set temporary lunch unavailable slots, and communicate availability to front-desk receptionists in real time."
        plannedFeatures={[
          'Real-time Break Request System',
          'Lunch & Rest Period Scheduling',
          'Floor Availability Toggle (Active / Away)',
          'Shift Roster & Overtime Tracking',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Today's Shift"
          value="Regular Shift"
          subtext="10:00 - 20:00 Standard"
          icon={<ClockIcon size={20} />}
        />
        <MetricCard
          label="Floor Status"
          value="Available"
          subtext="Ready for assigned clients"
          icon={<SunIcon size={20} />}
        />
        <MetricCard
          label="Allocated Breaks"
          value="1 Hr Total"
          subtext="Lunch (45m) + Rest (15m)"
          icon={<CoffeeIcon size={20} />}
        />
        <MetricCard
          label="Front Desk Sync"
          value="Connected"
          subtext="Status visible to reception"
          icon={<CheckIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Schedule & Availability Information"
        subtitle="Your assigned weekly working hours."
        statusBadge="Shift Status"
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          Your standard working hours are synchronized with the central salon roster. Any emergency shift
          adjustments or break extensions can be coordinated directly with the front desk or salon manager.
        </p>
      </DashboardCard>
    </div>
  )
}

