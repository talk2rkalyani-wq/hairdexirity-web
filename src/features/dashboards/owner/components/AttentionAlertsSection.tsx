// ==============================================================================
// Luma Salon — Executive Attention Alerts Section (Phase 2)
// Proactive Health Monitoring: Stock Alerts, Cancellation Spikes & Shortcuts
// ==============================================================================

import React from 'react'
import type { AttentionAlert } from '../../../../services/ownerDashboardService.ts'
import {
  PackageIcon,
  CalendarIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
} from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface AttentionAlertsSectionProps {
  alerts: AttentionAlert[]
  onNavigate: (route: NavId) => void
}

export const AttentionAlertsSection: React.FC<AttentionAlertsSectionProps> = ({
  alerts,
  onNavigate,
}) => {
  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Executive Attention & Alerts</h2>
          <span
            className={`card-status-badge ${
              alerts.length > 0 ? 'badge-alert-active' : 'badge-alert-nominal'
            }`}
          >
            {alerts.length > 0 ? `${alerts.length} Action${alerts.length > 1 ? 's' : ''} Needed` : 'All Systems Nominal'}
          </span>
        </div>
      </div>

      <p className="dashboard-page-subtitle">
        Automated operational threshold monitoring across inventory stock levels, booking cancellations, and attendance.
      </p>

      {alerts.length === 0 ? (
        <div className="alerts-nominal-banner">
          <div className="nominal-icon-wrap">
            <CheckCircleIcon size={24} />
          </div>
          <div className="nominal-text-wrap">
            <span className="nominal-title">Salon Operations Running Smoothly</span>
            <p className="nominal-desc">
              All inventory stock levels are within configured safe thresholds, and appointment cancellation/no-show rates remain within standard limits.
            </p>
          </div>
        </div>
      ) : (
        <div className="alerts-cards-grid">
          {alerts.map((alert) => {
            const isCritical = alert.severity === 'critical'
            const isInventory = alert.type.startsWith('inventory')

            return (
              <div
                key={alert.id}
                className={`alert-item-card ${isCritical ? 'alert-critical' : 'alert-warning'}`}
              >
                <div className="alert-card-top">
                  <div className="alert-icon-col">
                    {isInventory ? (
                      <PackageIcon size={20} />
                    ) : (
                      <CalendarIcon size={20} />
                    )}
                  </div>
                  <div className="alert-content-col">
                    <div className="alert-title-row">
                      <span className="alert-title">{alert.title}</span>
                      <span className="alert-severity-tag">
                        {isCritical ? 'Immediate Action' : 'Attention'}
                      </span>
                    </div>
                    <p className="alert-description">{alert.description}</p>
                  </div>
                </div>

                <div className="alert-card-footer">
                  <button
                    type="button"
                    className="btn-alert-action"
                    onClick={() => onNavigate(alert.targetRoute)}
                  >
                    <span>{alert.actionLabel}</span>
                    <ExternalLinkIcon size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
