// ==============================================================================
// Luma Salon — Daily Cash Flow Trend Chart Component (Phase 7)
// Responsive SVG Chart: Cash vs Digital Daily Settled Revenue
// ==============================================================================

import React, { useState } from 'react'
import type { DailyCashFlowPoint } from '../../../../../types/finance.ts'
import { formatCurrency } from '../../../../../utils/formatters.ts'
import { TrendingUpIcon } from '../../../../../components/Icons.tsx'

interface CashFlowTrendChartProps {
  data: DailyCashFlowPoint[]
  height?: number
}

export const CashFlowTrendChart: React.FC<CashFlowTrendChartProps> = ({
  data,
  height = 190,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [metricView, setMetricView] = useState<'total' | 'split'>('total')

  if (!data || data.length === 0) {
    return (
      <div className="cashflow-chart-empty" style={{ height }}>
        <span>No cash flow records for this timeframe</span>
      </div>
    )
  }

  const maxTotal = Math.max(...data.map((d) => d.totalCollected), 1000)
  const chartHeight = height - 32
  const barWidth = Math.min(54 / data.length, 12)

  return (
    <div className="cashflow-trend-card">
      <div className="chart-header-row">
        <div className="chart-title-group">
          <span className="chart-main-title">
            <TrendingUpIcon size={16} />
            <span>Daily Cash Flow & Settled Revenue</span>
          </span>
          <span className="chart-subtitle">
            Day-by-day revenue receipts deposited into bank / cash drawer
          </span>
        </div>

        <div className="chart-view-toggle">
          <button
            type="button"
            className={`view-toggle-btn ${metricView === 'total' ? 'active' : ''}`}
            onClick={() => setMetricView('total')}
          >
            Total Settled (₹)
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${metricView === 'split' ? 'active' : ''}`}
            onClick={() => setMetricView('split')}
          >
            Digital vs Cash
          </button>
        </div>
      </div>

      {/* SVG Responsive Bar Visualizer */}
      <div className="cashflow-svg-container" style={{ height }}>
        <div className="cashflow-bars-wrap" style={{ height: chartHeight }}>
          {data.map((item, idx) => {
            const isHovered = hoveredIdx === idx
            const totalPct = Math.max((item.totalCollected / maxTotal) * 100, item.totalCollected > 0 ? 5 : 1)
            const digitalAmt = item.upiAmount + item.cardAmount
            const digitalPct = Math.max((digitalAmt / maxTotal) * 100, digitalAmt > 0 ? 3 : 0)
            const cashPct = Math.max((item.cashAmount / maxTotal) * 100, item.cashAmount > 0 ? 3 : 0)

            return (
              <div
                key={item.date}
                className="cashflow-bar-column"
                style={{ width: `${barWidth}%` }}
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Tooltip */}
                {isHovered && (
                  <div className="cashflow-tooltip">
                    <span className="tooltip-date">{item.displayDate} ({item.dayOfWeek})</span>
                    <span className="tooltip-total gold">{formatCurrency(item.totalCollected)}</span>
                    <div className="tooltip-breakdown">
                      <span>UPI: {formatCurrency(item.upiAmount)}</span>
                      <span>Card: {formatCurrency(item.cardAmount)}</span>
                      <span>Cash: {formatCurrency(item.cashAmount)}</span>
                    </div>
                    <span className="tooltip-invoices">{item.invoiceCount} invoices</span>
                  </div>
                )}

                {/* Bars */}
                {metricView === 'total' ? (
                  <div
                    className="cashflow-bar total"
                    style={{ height: `${totalPct}%` }}
                  />
                ) : (
                  <div className="split-bars-group">
                    <div
                      className="cashflow-bar digital"
                      style={{ height: `${digitalPct}%` }}
                      title={`Digital: ${formatCurrency(digitalAmt)}`}
                    />
                    <div
                      className="cashflow-bar cash"
                      style={{ height: `${cashPct}%` }}
                      title={`Cash: ${formatCurrency(item.cashAmount)}`}
                    />
                  </div>
                )}

                <span className="bar-axis-label">{item.displayDate}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chart Legend */}
      {metricView === 'split' && (
        <div className="cashflow-legend-row">
          <div className="legend-item">
            <span className="legend-color digital" />
            <span>Digital Receipts (UPI + Card)</span>
          </div>
          <div className="legend-item">
            <span className="legend-color cash" />
            <span>Physical Cash Tender</span>
          </div>
        </div>
      )}
    </div>
  )
}

