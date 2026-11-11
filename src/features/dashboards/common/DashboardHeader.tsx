import React from 'react'
import type { UserRole } from '../../../types/models'
import './DashboardStyles.css'

interface DashboardHeaderProps {
  role: UserRole
  roleLabel: string
  title: string
  subtitle: string
  actions?: React.ReactNode
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  role,
  roleLabel,
  title,
  subtitle,
  actions,
}) => {
  const getBadgeClass = () => {
    switch (role) {
      case 'OWNER':
        return 'badge-owner'
      case 'EMPLOYEE':
        return 'badge-employee'
      case 'RECEPTIONIST':
        return 'badge-receptionist'
      default:
        return 'badge-owner'
    }
  }

  return (
    <header className="dashboard-page-header">
      <div className="dashboard-header-text">
        <div className="dashboard-role-tag-row">
          <span className={`dashboard-workspace-badge ${getBadgeClass()}`}>
            {roleLabel}
          </span>
          <span className="badge-phase-tag">Phase 1 Foundation</span>
        </div>
        <h1 className="dashboard-page-title">{title}</h1>
        <p className="dashboard-page-subtitle">{subtitle}</p>
      </div>
      {actions && <div className="dashboard-header-actions">{actions}</div>}
    </header>
  )
}

