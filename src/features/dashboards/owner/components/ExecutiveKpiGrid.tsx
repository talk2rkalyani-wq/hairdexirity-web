// ==============================================================================
// Luma Salon — Executive KPI Cards Grid (Phase 2)
// Real-Time Verified Operational Metrics & Performance Cards
// ==============================================================================

import React from 'react'
import type { ExecutiveDashboardData, MetricComparison } from '../../../../services/ownerDashboardService.ts'
import { formatCurrency } from '../../../../utils/formatters.ts'
import {
  CalendarIcon,
  CheckCircleIcon,
  TrendingUpIcon,
  XCircleIcon,
  ClockIcon,
  UsersIcon,
  InfoIcon,
} from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface ExecutiveKpiGridProps {
  kpis: ExecutiveDashboardData['kpis']
  isToday: boolean
  onNavigate: (route: NavId) => void
}

export const ExecutiveKpiGrid: React.FC<ExecutiveKpiGridProps> = ({
  kpis,
  isToday,
  onNavigate,
}) => {
  const { appointments, completedServices, revenue, cancellations, noShows, capacity } = kpis

  const renderComparisonPill = (
    comparison: MetricComparison,
    invertGoodBad = false
  ) => {
    const isUp = comparison.trend === 'up'
    const isDown = comparison.trend === 'down'
    const isNeutral = comparison.trend === 'neutral'

    // For cancellations/no-shows, down is positive (green) and up is negative (red)
    const isPositive = invertGoodBad ? isDown : isUp
    const isNegative = invertGoodBad ? isUp : isDown

    let pillClass = 'trend-neutral'
    if (isPositive) pillClass = 'trend-positive'
    if (isNegative) pillClass = 'trend-negative'

    const sign = comparison.absoluteChange > 0 ? '+' : ''
    const pctText =
      comparison.percentageChange !== null
        ? `${sign}${comparison.percentageChange}%`
        : `${sign}${comparison.absoluteChange}`

    return (
      <span className={`kpi-trend-pill ${pillClass}`} title={`Previous: ${comparison.previous}`}>
        {isUp && '▲ '}
        {isDown && '▼ '}
        {isNeutral && '— '}
        {pctText} vs prior
      </span>
    )
  }

  return (
    <div className="executive-kpis-grid" role="region" aria-label="Executive Key Performance Indicators">
      {/* KPI 1 — Appointments */}
      <div
        className="kpi-card-interactive"
        onClick={() => onNavigate('calendar')}
        title="Click to open Master Appointment Calendar"
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onNavigate('calendar')
        }}
      >
        <div className="kpi-card-header">
          <span className="kpi-label">{isToday ? "Today's Appointments" : 'Total Appointments'}</span>
          <div className="kpi-icon-wrap icon-purple">
            <CalendarIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{appointments.totalAppointments}</span>
          {renderComparisonPill(appointments.comparison)}
        </div>

        <div className="kpi-subchips-row">
          <span className="chip-status chip-completed" title="Completed">
            {appointments.completedCount} done
          </span>
          <span className="chip-status chip-confirmed" title="Confirmed">
            {appointments.confirmedCount} conf
          </span>
          <span className="chip-status chip-scheduled" title="Scheduled">
            {appointments.scheduledCount} sched
          </span>
          {isToday && appointments.inProgressCount > 0 && (
            <span className="chip-status chip-in-progress" title="Currently Ongoing">
              {appointments.inProgressCount} active
            </span>
          )}
          {appointments.cancelledCount > 0 && (
            <span className="chip-status chip-cancelled" title="Cancelled">
              {appointments.cancelledCount} canc
            </span>
          )}
        </div>
      </div>

      {/* KPI 2 — Completed Services */}
      <div className="kpi-card">
        <div className="kpi-card-header">
          <span className="kpi-label">Completed Services</span>
          <div className="kpi-icon-wrap icon-emerald">
            <CheckCircleIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{completedServices.totalCompleted}</span>
          {renderComparisonPill(completedServices.comparison)}
        </div>

        <div className="kpi-detail-meta">
          <div className="completion-bar-wrap">
            <div
              className="completion-bar-fill"
              style={{ width: `${Math.min(100, completedServices.completionRate)}%` }}
            />
          </div>
          <span className="kpi-meta-text">
            {completedServices.completionRate}% completion rate
          </span>
        </div>
      </div>

      {/* KPI 3 — Completed Service Value (Revenue) */}
      <div className="kpi-card">
        <div className="kpi-card-header">
          <div className="kpi-label-group">
            <span className="kpi-label">Completed Service Value</span>
            <span className="badge-pending-ledger" title={revenue.disclaimer}>
              Ledger Pending
            </span>
          </div>
          <div className="kpi-icon-wrap icon-gold">
            <TrendingUpIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{formatCurrency(revenue.completedServiceValue)}</span>
          {renderComparisonPill(revenue.comparison)}
        </div>

        <div className="kpi-detail-meta">
          <span className="kpi-projected-val">
            +{formatCurrency(revenue.projectedServiceValue)} projected
          </span>
          <span className="kpi-disclaimer-pill" title={revenue.disclaimer}>
            <InfoIcon size={12} /> Service Price Totals
          </span>
        </div>
      </div>

      {/* KPI 4 — Cancelled Appointments */}
      <div className="kpi-card">
        <div className="kpi-card-header">
          <span className="kpi-label">Cancelled Appointments</span>
          <div className="kpi-icon-wrap icon-rose">
            <XCircleIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{cancellations.totalCancelled}</span>
          {renderComparisonPill(cancellations.comparison, true)}
        </div>

        <div className="kpi-detail-meta">
          <span className={`kpi-meta-text ${cancellations.cancellationRate >= 15 ? 'text-warning' : ''}`}>
            {cancellations.cancellationRate}% cancellation rate
          </span>
        </div>
      </div>

      {/* KPI 5 — No-Shows */}
      <div className="kpi-card">
        <div className="kpi-card-header">
          <span className="kpi-label">No-Shows</span>
          <div className="kpi-icon-wrap icon-amber">
            <ClockIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{noShows.totalNoShows}</span>
          {renderComparisonPill(noShows.comparison, true)}
        </div>

        <div className="kpi-detail-meta">
          <span className={`kpi-meta-text ${noShows.noShowRate >= 10 ? 'text-warning' : ''}`}>
            {noShows.noShowRate}% no-show rate
          </span>
        </div>
      </div>

      {/* KPI 6 — Active Staff / Capacity */}
      <div className="kpi-card">
        <div className="kpi-card-header">
          <span className="kpi-label">Operational Capacity</span>
          <div className="kpi-icon-wrap icon-blue">
            <UsersIcon size={18} />
          </div>
        </div>

        <div className="kpi-metric-row">
          <span className="kpi-primary-val">{capacity.activeStylistCount} Stylists</span>
        </div>

        <div className="kpi-detail-meta">
          <span className="kpi-meta-text">
            {capacity.totalStaffCount} on roster &bull; ~{capacity.appointmentsPerActiveStylist} apts/stylist
          </span>
        </div>
      </div>
    </div>
  )
}
