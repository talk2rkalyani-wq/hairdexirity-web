import React from 'react'
import './DashboardStyles.css'

interface DashboardCardProps {
  title: string
  subtitle?: string
  statusBadge?: string
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
}

export const DashboardCard: React.FC<DashboardCardProps> = ({
  title,
  subtitle,
  statusBadge,
  children,
  className = '',
  actions,
}) => {
  return (
    <section className={`dashboard-content-card ${className}`}>
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">{title}</h2>
          {statusBadge && <span className="card-status-badge">{statusBadge}</span>}
        </div>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
      {subtitle && <p className="dashboard-page-subtitle">{subtitle}</p>}
      <div className="card-body">{children}</div>
    </section>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  subtext?: string
  icon: React.ReactNode
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  icon,
}) => {
  return (
    <div className="dashboard-metric-card">
      <div className="metric-card-top">
        <span className="metric-label">{label}</span>
        <div className="metric-icon-wrap">{icon}</div>
      </div>
      <div className="metric-main-value">{value}</div>
      {subtext && <div className="metric-subtext">{subtext}</div>}
    </div>
  )
}

