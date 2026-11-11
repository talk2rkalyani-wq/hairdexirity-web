import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { ShieldCheckIcon, SettingsIcon, UsersIcon, AwardIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface OwnerSettingsPermissionsViewProps {
  onNavigate: (route: NavId) => void
}

export const OwnerSettingsPermissionsView: React.FC<OwnerSettingsPermissionsViewProps> = ({
  onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="OWNER"
        roleLabel="Owner Workspace"
        title="Settings & Permissions"
        subtitle="Configure salon security policies, user roles, permission boundaries, and operational settings."
      />

      <DashboardFoundationBanner
        moduleName="Security, Permissions & Settings"
        scopeDescription="Comprehensive control panel for role definitions, salon profile management, access control boundaries, and system integration credentials."
        plannedFeatures={[
          'Role-Based Permission Matrix Inspector',
          'Salon Profile & Working Hours Configuration',
          'Staff Account Activation / Deactivation',
          'Security Audit Trail & Session Control',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Active RBAC Roles"
          value="4 Defined"
          subtext="Admin, Owner, Receptionist, Employee"
          icon={<ShieldCheckIcon size={20} />}
        />
        <MetricCard
          label="Owner Accounts"
          value="2 Max"
          subtext="Owner 1 & Owner 2"
          icon={<AwardIcon size={20} />}
        />
        <MetricCard
          label="Session Validity"
          value="24 Hours"
          subtext="Cryptographically isolated sessions"
          icon={<SettingsIcon size={20} />}
        />
        <MetricCard
          label="User Management"
          value="Available"
          subtext="Manage salon accounts"
          icon={<UsersIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Administrative Controls"
        subtitle="Manage user accounts and system configuration."
        statusBadge="Security"
      >
        <div className="dashboard-quick-links-grid">
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('users')}
          >
            <div className="quick-link-icon">
              <UsersIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">User Management</span>
              <span className="quick-link-desc">Manage salon user accounts & roles</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}

