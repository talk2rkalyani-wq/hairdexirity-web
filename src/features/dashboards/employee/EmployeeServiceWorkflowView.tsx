import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { ScissorsIcon, ClockIcon, CheckIcon, UserCheckIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface EmployeeServiceWorkflowViewProps {
  onNavigate: (route: NavId) => void
}

export const EmployeeServiceWorkflowView: React.FC<EmployeeServiceWorkflowViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="Service Workflow"
        subtitle="Manage chairside client service stages, consultations, and treatment steps."
      />

      <DashboardFoundationBanner
        moduleName="Chairside Service Workflow"
        scopeDescription="Tracks active client treatment steps (Consultation -> Wash & Prep -> Execution -> Styling -> Completed), with timer guidance and service notes."
        plannedFeatures={[
          'Multi-Stage Service Step Tracker',
          'Color & Chemical Formula Log',
          'Service Duration & Overrun Alerts',
          'Add-on Service Suggestions',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Workflow Stages"
          value="4 Steps"
          subtext="Consultation, Service, Styling, Complete"
          icon={<ScissorsIcon size={20} />}
        />
        <MetricCard
          label="Chairside Timer"
          value="Ready"
          subtext="Precision service tracking"
          icon={<ClockIcon size={20} />}
        />
        <MetricCard
          label="Formula Logging"
          value="Enabled"
          subtext="Store client chemical mixtures"
          icon={<CheckIcon size={20} />}
        />
        <MetricCard
          label="Client Verification"
          value="Synchronized"
          subtext="Preferences loaded automatically"
          icon={<UserCheckIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Service Execution Guidelines"
        subtitle="Operational standard operating procedures for stylists."
        statusBadge="Workflow Standard"
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          Ensure client consultation is completed prior to beginning chemical or cut treatments. Record
          any client sensitivity or custom hair color formulas in the service notes to preserve continuity
          for return visits.
        </p>
      </DashboardCard>
    </div>
  )
}

