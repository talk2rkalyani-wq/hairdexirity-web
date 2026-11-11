import React from 'react'
import { SparkleIcon, ShieldCheckIcon } from '../../../components/Icons'
import './DashboardStyles.css'

interface FoundationBannerProps {
  moduleName: string
  scopeDescription: string
  plannedFeatures: string[]
}

export const DashboardFoundationBanner: React.FC<FoundationBannerProps> = ({
  moduleName,
  scopeDescription,
  plannedFeatures,
}) => {
  return (
    <div className="dashboard-foundation-banner">
      <div className="banner-icon-col">
        <SparkleIcon size={24} />
      </div>
      <div className="banner-content-col">
        <h3 className="banner-title">{moduleName} — Phase 1 Architectural Foundation</h3>
        <p className="banner-desc">{scopeDescription}</p>
        <div className="banner-feature-list">
          {plannedFeatures.map((feat, idx) => (
            <span key={idx} className="banner-pill">
              • {feat}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

interface AccessDeniedProps {
  attemptedRoute?: string
  userRole?: string
  onReturnToDashboard: () => void
}

export const DashboardAccessDeniedState: React.FC<AccessDeniedProps> = ({
  attemptedRoute,
  userRole,
  onReturnToDashboard,
}) => {
  return (
    <div className="access-denied-container">
      <div className="access-denied-card">
        <div className="access-denied-icon-wrap">
          <ShieldCheckIcon size={32} />
        </div>
        <h2 className="access-denied-title">Access Restricted</h2>
        <p className="access-denied-desc">
          You are signed in as <strong>{userRole || 'User'}</strong>. The route{' '}
          {attemptedRoute ? <code>{attemptedRoute}</code> : 'requested'} is outside your authorized workspace.
          Role-Based Access Control (RBAC) enforces strict workspace isolation.
        </p>
        <button
          type="button"
          className="access-denied-action-btn"
          onClick={onReturnToDashboard}
        >
          Return to Authorized Dashboard
        </button>
      </div>
    </div>
  )
}

export const DashboardLoadingState: React.FC<{ message?: string }> = ({
  message = 'Loading workspace...',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4rem 1rem',
        gap: '1rem',
        color: 'var(--text-secondary)',
      }}
    >
      <div
        className="btn-spinner"
        style={{
          width: '32px',
          height: '32px',
          borderColor: 'rgba(99, 102, 241, 0.2)',
          borderTopColor: '#6366f1',
        }}
      />
      <span style={{ fontSize: '0.875rem' }}>{message}</span>
    </div>
  )
}

