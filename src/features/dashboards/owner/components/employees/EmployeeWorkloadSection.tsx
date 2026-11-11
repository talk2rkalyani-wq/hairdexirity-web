// ==============================================================================
// Luma Salon — Employee Workload & Visualizations Section (Phase 6)
// Daily Trend Chart, Service Category Breakdown & Peak Hour Distribution
// ==============================================================================

import React, { useState } from 'react'
import type {
  EmployeeCategoryBreakdown,
  HourlyDistributionPoint,
} from '../../../../../services/employeePerformanceService.ts'
import type { DailyTrendPoint } from '../../../../../services/ownerDashboardService.ts'
import { TrendBarChart } from '../DashboardCharts.tsx'
import { formatCurrency } from '../../../../../utils/formatters.ts'
import { TrendingUpIcon, ScissorsIcon, ClockIcon } from '../../../../../components/Icons.tsx'

interface EmployeeWorkloadSectionProps {
  dailyTrends: DailyTrendPoint[]
  categoryBreakdown: EmployeeCategoryBreakdown[]
  hourlyDistribution: HourlyDistributionPoint[]
}

export const EmployeeWorkloadSection: React.FC<EmployeeWorkloadSectionProps> = ({
  dailyTrends,
  categoryBreakdown,
  hourlyDistribution,
}) => {
  const [chartMetric, setChartMetric] = useState<'completedServiceValue' | 'totalAppointments'>(
    'completedServiceValue'
  )

  // Find peak hour
  const peakHour = [...hourlyDistribution].sort((a, b) => b.appointmentCount - a.appointmentCount)[0]

  return (
    <div className="employee-workload-grid">
      {/* Left Panel: Daily Trends Visualizations */}
      <div className="workload-card chart-panel">
        <div className="panel-header-row">
          <div className="panel-title-group">
            <span className="panel-title">
              <TrendingUpIcon size={16} />
              <span>Daily Performance & Volume Trend</span>
            </span>
            <span className="panel-subtitle">Day-by-day output across selected timeframe</span>
          </div>

          <div className="chart-metric-toggle-pills">
            <button
              type="button"
              className={`metric-toggle-pill ${chartMetric === 'completedServiceValue' ? 'active' : ''}`}
              onClick={() => setChartMetric('completedServiceValue')}
            >
              Service Value (₹)
            </button>
            <button
              type="button"
              className={`metric-toggle-pill ${chartMetric === 'totalAppointments' ? 'active' : ''}`}
              onClick={() => setChartMetric('totalAppointments')}
            >
              Booking Count
            </button>
          </div>
        </div>

        <div className="chart-wrapper-box">
          <TrendBarChart
            data={dailyTrends}
            height={190}
            valueKey={chartMetric}
            formatAsCurrency={chartMetric === 'completedServiceValue'}
            color={chartMetric === 'completedServiceValue' ? '#d97706' : '#8b5cf6'}
          />
        </div>
      </div>

      {/* Right Panel: Service Category & Peak Hours */}
      <div className="workload-card breakdown-panel">
        <div className="panel-header-row">
          <div className="panel-title-group">
            <span className="panel-title">
              <ScissorsIcon size={16} />
              <span>Service Category Allocation</span>
            </span>
            <span className="panel-subtitle">Distribution across specialties</span>
          </div>
        </div>

        {/* Category Breakdown Progress Bars */}
        <div className="category-bars-list">
          {categoryBreakdown.length === 0 ? (
            <div className="empty-category-hint">No service bookings in this timeframe</div>
          ) : (
            categoryBreakdown.map((cat) => (
              <div key={cat.category} className="category-row-item">
                <div className="category-row-header">
                  <span className="category-name">{cat.categoryLabel}</span>
                  <div className="category-values">
                    <span className="category-count">{cat.count} bookings</span>
                    <span className="category-price">{formatCurrency(cat.completedValue)}</span>
                  </div>
                </div>
                <div className="category-progress-track">
                  <div
                    className="category-progress-fill"
                    style={{ width: `${Math.min(100, Math.max(4, cat.percentage))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Peak Chair Hours Mini-Card */}
        <div className="peak-hours-card">
          <div className="peak-header">
            <ClockIcon size={14} className="peak-icon" />
            <span className="peak-title">Peak Chair Window:</span>
            <span className="peak-highlight">
              {peakHour && peakHour.appointmentCount > 0
                ? `${peakHour.hourLabel} (${peakHour.appointmentCount} bookings)`
                : 'Balanced across shift'}
            </span>
          </div>
          <div className="peak-hours-mini-bars">
            {hourlyDistribution.map((item) => {
              const maxCount = Math.max(...hourlyDistribution.map((h) => h.appointmentCount), 1)
              const heightPct = Math.max((item.appointmentCount / maxCount) * 100, 8)
              return (
                <div
                  key={item.hour24}
                  className="peak-bar-col"
                  title={`${item.hourLabel}: ${item.appointmentCount} appointments (${formatCurrency(item.completedValue)})`}
                >
                  <div className="peak-bar-track">
                    <div className="peak-bar-fill" style={{ height: `${heightPct}%` }} />
                  </div>
                  <span className="peak-bar-label">{item.hour24}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

