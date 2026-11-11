import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { FileTextIcon, CalendarIcon, CheckIcon, ClockIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface EmployeeLeaveManagementViewProps {
  onNavigate: (route: NavId) => void
}

export const EmployeeLeaveManagementView: React.FC<EmployeeLeaveManagementViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="Leave Management"
        subtitle="Submit leave requests, view vacation balances, and check approval statuses."
      />

      <DashboardFoundationBanner
        moduleName="Leave & Absence Management"
        scopeDescription="Self-service leave management interface for submitting planned time off, tracking remaining PTO allowances, and receiving owner approval notifications."
        plannedFeatures={[
          'Leave Request Submission (Casual, Sick, Vacation)',
          'Annual Paid Time Off (PTO) Ledger',
          'Manager & Owner Approval Workflow',
          'Calendar Schedule Blackout Integration',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Leave Policy"
          value="Standard Salon"
          subtext="Annual Paid Time Off"
          icon={<FileTextIcon size={20} />}
        />
        <MetricCard
          label="Pending Requests"
          value="0 Pending"
          subtext="All previous requests resolved"
          icon={<ClockIcon size={20} />}
        />
        <MetricCard
          label="Approval Status"
          value="Synchronized"
          subtext="Managed by Salon Owners"
          icon={<CheckIcon size={20} />}
        />
        <MetricCard
          label="Calendar Sync"
          value="Automatic"
          subtext="Approved leave blocks booking slots"
          icon={<CalendarIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Leave Request Protocol"
        subtitle="Standard operating procedures for advance notice."
        statusBadge="PTO Policy"
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          Planned leave should be submitted at least 7 days in advance to allow the front desk to adjust client
          reception bookings and reassign any pre-scheduled appointments.
        </p>
      </DashboardCard>
    </div>
  )
}

