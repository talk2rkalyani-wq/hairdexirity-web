// ==============================================================================
// Luma Salon — Appointment Performance Section (Phase 2)
// Volume Trends, Status Distribution & Service Demand Breakdown
// ==============================================================================

import React, { useState } from 'react'
import type { ExecutiveDashboardData } from '../../../../services/ownerDashboardService.ts'
import { TrendBarChart, DistributionBar } from './DashboardCharts.tsx'
import { CalendarIcon, ExternalLinkIcon } from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface AppointmentAnalyticsSectionProps {
  data: ExecutiveDashboardData
  onNavigate: (route: NavId) => void
}

export const AppointmentAnalyticsSection: React.FC<AppointmentAnalyticsSectionProps> = ({
  data,
  onNavigate,
}) => {
  const [metricView, setMetricView] = useState<'total' | 'completed'>('total')

  const totalApts = data.kpis.appointments.totalAppointments

  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Appointment Analytics</h2>
          <span className="card-status-badge">Volume & Distribution</span>
        </div>
        <div className="card-actions">
          <div className="chart-toggle-group">
            <button
              type="button"
              className={`btn-chart-toggle ${metricView === 'total' ? 'active' : ''}`}
              onClick={() => setMetricView('total')}
            >
              Total Bookings
            </button>
            <button
              type="button"
              className={`btn-chart-toggle ${metricView === 'completed' ? 'active' : ''}`}
              onClick={() => setMetricView('completed')}
            >
              Completed
            </button>
          </div>
          <button
            type="button"
            className="btn-card-action"
            onClick={() => onNavigate('calendar')}
            title="Open Master Calendar"
          >
            <CalendarIcon size={14} />
            <span>Master Calendar</span>
            <ExternalLinkIcon size={12} />
          </button>
        </div>
      </div>

      <p className="dashboard-page-subtitle">
        Real-time tracking of salon bookings, status proportions, and daily workflow pacing.
      </p>

      <div className="analytics-split-layout">
        {/* Left Col: Trend Bar Chart */}
        <div className="analytics-chart-col">
          <div className="chart-meta-header">
            <span className="chart-meta-title">
              Daily Appointment Flow ({data.selectedRange.label})
            </span>
            <span className="chart-meta-total">
              {metricView === 'total' ? totalApts : data.kpis.completedServices.totalCompleted} Total
            </span>
          </div>

          <TrendBarChart
            data={data.dailyTrend}
            height={190}
            valueKey={metricView === 'total' ? 'totalAppointments' : 'completedAppointments'}
            formatAsCurrency={false}
            color={metricView === 'total' ? '#a78bfa' : '#34d399'}
          />
        </div>

        {/* Right Col: Status Distribution Breakdown */}
        <div className="analytics-distribution-col">
          <div className="chart-meta-header">
            <span className="chart-meta-title">Status Distribution Breakdown</span>
            <span className="chart-meta-total">{totalApts} Recorded</span>
          </div>

          <DistributionBar
            items={data.statusDistribution}
            totalCount={totalApts}
          />

          <div className="status-summary-cards">
            <div className="status-mini-card">
              <span className="mini-card-label">Completion Ratio</span>
              <span className="mini-card-value text-emerald">
                {data.kpis.completedServices.completionRate}%
              </span>
            </div>
            <div className="status-mini-card">
              <span className="mini-card-label">Cancellation Ratio</span>
              <span className="mini-card-value text-rose">
                {data.kpis.cancellations.cancellationRate}%
              </span>
            </div>
            <div className="status-mini-card">
              <span className="mini-card-label">No-Show Ratio</span>
              <span className="mini-card-value text-amber">
                {data.kpis.noShows.noShowRate}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

