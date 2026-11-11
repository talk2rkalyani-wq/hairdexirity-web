// ==============================================================================
// Luma Salon — Executive Dashboard Charts (Phase 2)
// Pure React + SVG Responsive Data Visualizations
// ==============================================================================

import React, { useState } from 'react'
import { formatCurrency } from '../../../../utils/formatters.ts'
import type { DailyTrendPoint } from '../../../../services/ownerDashboardService.ts'

interface TrendBarChartProps {
  data: DailyTrendPoint[]
  height?: number
  valueKey?: 'completedServiceValue' | 'totalAppointments' | 'completedAppointments'
  formatAsCurrency?: boolean
  color?: string
}

export const TrendBarChart: React.FC<TrendBarChartProps> = ({
  data,
  height = 180,
  valueKey = 'completedServiceValue',
  formatAsCurrency = true,
  color = '#8b5cf6',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!data || data.length === 0) {
    return (
      <div className="chart-empty-placeholder" style={{ height }}>
        <span>No trend data available for this range</span>
      </div>
    )
  }

  const values = data.map((d) => d[valueKey] || 0)
  const maxValue = Math.max(...values, 1)

  const paddingBottom = 28
  const chartHeight = height - paddingBottom
  const barWidthPercent = Math.min(60 / data.length, 14) // responsive bar width

  return (
    <div className="svg-chart-container" style={{ height }}>
      <div className="svg-chart-bars-wrap" style={{ height: chartHeight }}>
        {data.map((item, idx) => {
          const val = item[valueKey] || 0
          const heightPercent = Math.max((val / maxValue) * 100, val > 0 ? 4 : 1)
          const isHovered = hoveredIdx === idx

          return (
            <div
              key={item.date}
              className="chart-bar-column"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{ width: `${barWidthPercent}%` }}
            >
              {/* Tooltip */}
              {isHovered && (
                <div className="chart-bar-tooltip">
                  <div className="tooltip-date">
                    {item.dayOfWeek}, {item.displayDate}
                  </div>
                  <div className="tooltip-val">
                    {formatAsCurrency ? formatCurrency(val) : `${val} appointments`}
                  </div>
                  {valueKey === 'completedServiceValue' && (
                    <div className="tooltip-extra">
                      {item.completedAppointments} completed
                    </div>
                  )}
                </div>
              )}

              {/* Bar track and fill */}
              <div className="chart-bar-track">
                <div
                  className="chart-bar-fill"
                  style={{
                    height: `${heightPercent}%`,
                    background: isHovered
                      ? 'linear-gradient(180deg, #c084fc 0%, #7c3aed 100%)'
                      : `linear-gradient(180deg, ${color} 0%, rgba(124, 58, 237, 0.4) 100%)`,
                    boxShadow: isHovered ? '0 0 12px rgba(168, 85, 247, 0.6)' : 'none',
                  }}
                />
              </div>

              {/* X Axis label */}
              <span className="chart-x-label">
                {data.length <= 14 ? item.displayDate : idx % 3 === 0 ? item.displayDate : ''}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface DistributionBarProps {
  items: {
    label: string
    count: number
    percentage: number
    color: string
  }[]
  totalCount: number
}

export const DistributionBar: React.FC<DistributionBarProps> = ({ items, totalCount }) => {
  if (totalCount === 0) {
    return (
      <div className="distribution-empty">
        <span className="text-muted">No appointments recorded for this period</span>
      </div>
    )
  }

  return (
    <div className="distribution-component">
      {/* Segmented bar */}
      <div className="distribution-bar-track">
        {items.map((item) => {
          if (item.count === 0) return null
          return (
            <div
              key={item.label}
              className="distribution-bar-segment"
              style={{
                width: `${item.percentage}%`,
                backgroundColor: item.color,
              }}
              title={`${item.label}: ${item.count} (${item.percentage}%)`}
            />
          )
        })}
      </div>

      {/* Legend chips */}
      <div className="distribution-legend-grid">
        {items.map((item) => (
          <div key={item.label} className="legend-chip">
            <span className="legend-color-dot" style={{ backgroundColor: item.color }} />
            <span className="legend-label">{item.label}</span>
            <span className="legend-count">{item.count}</span>
            <span className="legend-pct">({item.percentage}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}


