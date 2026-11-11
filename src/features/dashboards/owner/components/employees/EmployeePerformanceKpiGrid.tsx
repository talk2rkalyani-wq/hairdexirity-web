// ==============================================================================
// Luma Salon — Employee Performance KPI Grid (Phase 6)
// 8 High-Contrast Executive Metrics: Service Value, Productivity & Utilization
// ==============================================================================

import React, { useState } from 'react'
import type { EmployeeKpiMetrics } from '../../../../../services/employeePerformanceService.ts'
import { formatCurrency } from '../../../../../utils/formatters.ts'
import {
  TrendingUpIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
  AwardIcon,
  UsersIcon,
  ScissorsIcon,
  InfoIcon,
} from '../../../../../components/Icons.tsx'

interface EmployeePerformanceKpiGridProps {
  kpis: EmployeeKpiMetrics
}

export const EmployeePerformanceKpiGrid: React.FC<EmployeePerformanceKpiGridProps> = ({ kpis }) => {
  const [showDisclaimer, setShowDisclaimer] = useState(false)

  const bookedHours = Math.round((kpis.totalBookedMinutes / 60) * 10) / 10
  const scheduledHours = Math.round((kpis.totalScheduledShiftMinutes / 60) * 10) / 10

  // Utilization color class
  let utilClass = 'util-slate'
  let utilLabel = 'Low Activity'
  if (kpis.utilizationRate >= 85) {
    utilClass = 'util-amber'
    utilLabel = 'High Capacity'
  } else if (kpis.utilizationRate >= 50) {
    utilClass = 'util-emerald'
    utilLabel = 'Optimal Load'
  } else if (kpis.utilizationRate > 0) {
    utilClass = 'util-blue'
    utilLabel = 'Moderate'
  }

  // Completion rate pill
  let completionClass = 'rate-slate'
  if (kpis.completionRate >= 80) completionClass = 'rate-emerald'
  else if (kpis.completionRate >= 60) completionClass = 'rate-amber'
  else if (kpis.completionRate > 0) completionClass = 'rate-rose'

  return (
    <div className="employee-kpi-section">
      {/* Disclaimer Alert Bar */}
      <div className="financial-boundary-banner">
        <div className="banner-left">
          <InfoIcon size={16} className="info-icon-gold" />
          <span className="banner-text">
            <strong>Gross Completed Service Value</strong> is calculated from verified service prices.
            Commission splits and payment gateway settlements are not yet integrated.
          </span>
        </div>
        <button
          type="button"
          className="disclaimer-toggle-btn"
          onClick={() => setShowDisclaimer(!showDisclaimer)}
        >
          {showDisclaimer ? 'Hide Details' : 'View Methodology'}
        </button>
      </div>

      {showDisclaimer && (
        <div className="disclaimer-expanded-box">
          <p>{kpis.disclaimer}</p>
          <span className="disclaimer-meta">
            Authoritative source: <code>public.appointments</code> (price snapshot upon service completion).
          </span>
        </div>
      )}

      {/* 8-Card Responsive KPI Grid */}
      <div className="employee-kpi-cards-grid">
        {/* 1. Completed Service Value */}
        <div className="kpi-card card-gold">
          <div className="kpi-card-header">
            <span className="kpi-label">Completed Service Value</span>
            <div className="kpi-icon-wrap gold">
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value gold">{formatCurrency(kpis.completedServiceValue)}</span>
          </div>
          <span className="kpi-subtext">
            From {kpis.completedCount} completed {kpis.completedCount === 1 ? 'service' : 'services'}
          </span>
        </div>

        {/* 2. Projected Value */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Projected In Pipeline</span>
            <div className="kpi-icon-wrap purple">
              <ClockIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value purple">{formatCurrency(kpis.projectedServiceValue)}</span>
          </div>
          <span className="kpi-subtext">
            {kpis.scheduledCount + kpis.checkedInCount + kpis.inProgressCount} active / upcoming bookings
          </span>
        </div>

        {/* 3. Total Assigned Bookings */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Total Assigned Bookings</span>
            <div className="kpi-icon-wrap blue">
              <UsersIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value">{kpis.totalAppointments}</span>
            <span className="kpi-unit">Slots</span>
          </div>
          <span className="kpi-subtext">
            {kpis.completedCount} finished &bull; {kpis.inProgressCount} in chair
          </span>
        </div>

        {/* 4. Average Ticket Value */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Average Ticket Value</span>
            <div className="kpi-icon-wrap emerald">
              <AwardIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value emerald">{formatCurrency(kpis.averageTicketValue)}</span>
          </div>
          <span className="kpi-subtext">Avg value per completed appointment</span>
        </div>

        {/* 5. Completion Ratio */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Completion Ratio</span>
            <div className="kpi-icon-wrap emerald">
              <CheckCircleIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className={`kpi-primary-value ${completionClass}`}>{kpis.completionRate}%</span>
          </div>
          <span className="kpi-subtext">
            {kpis.completedCount} of {kpis.totalAppointments} assigned fulfilled
          </span>
        </div>

        {/* 6. Cancellation & No-Show Rate */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Cancellations & No-Shows</span>
            <div className="kpi-icon-wrap rose">
              <XCircleIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value rose">
              {Math.round((kpis.cancellationRate + kpis.noShowRate) * 10) / 10}%
            </span>
          </div>
          <span className="kpi-subtext">
            {kpis.cancelledCount} canc ({kpis.cancellationRate}%) &bull; {kpis.noShowCount} no-show ({kpis.noShowRate}%)
          </span>
        </div>

        {/* 7. Booked Chair Hours */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Booked Chair Time</span>
            <div className="kpi-icon-wrap purple">
              <ScissorsIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value">{bookedHours}</span>
            <span className="kpi-unit">Hours</span>
          </div>
          <span className="kpi-subtext">
            Across {kpis.totalAppointments - kpis.cancelledCount - kpis.noShowCount} active client sessions
          </span>
        </div>

        {/* 8. Shift Utilization Rate */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Shift Floor Utilization</span>
            <div className={`kpi-icon-wrap ${utilClass}`}>
              <ClockIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className={`kpi-primary-value ${utilClass}`}>{kpis.utilizationRate}%</span>
            <span className={`kpi-status-pill ${utilClass}`}>{utilLabel}</span>
          </div>
          <span className="kpi-subtext">
            {bookedHours}h booked of {scheduledHours}h scheduled shift
          </span>
        </div>
      </div>
    </div>
  )
}

