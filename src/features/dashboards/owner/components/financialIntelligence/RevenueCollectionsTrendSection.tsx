import React from 'react'
import type {
  DailyTrendPoint,
  TenderBreakdownItem,
} from '../../../../../types/financialIntelligence.ts'

interface RevenueCollectionsTrendSectionProps {
  dailyTrends: DailyTrendPoint[]
  collectionsByTender: TenderBreakdownItem[]
  totalRevenue: number
  totalCollections: number
}

export const RevenueCollectionsTrendSection: React.FC<RevenueCollectionsTrendSectionProps> = ({
  dailyTrends,
  collectionsByTender,
  totalRevenue,
  totalCollections,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const timingGap = totalRevenue - totalCollections

  // Find max daily value for scaling trend bars
  const maxVal = Math.max(
    ...dailyTrends.map((d) => Math.max(d.netSales, d.collections)),
    1000
  )

  return (
    <div className="fin-section-container">
      <div className="fin-section-header">
        <div>
          <h3 className="fin-section-title">Revenue (Accrual) vs Actual Collections (Cash)</h3>
          <p className="fin-section-subtitle">
            Visualizing invoiced sales revenue versus actual payment receipts realized across tenders
          </p>
        </div>
        <div className="fin-timing-gap-pill">
          <span className="gap-label">Accrual-Cash Timing Gap:</span>
          <span className={`gap-amount ${timingGap >= 0 ? 'positive' : 'negative'}`}>
            {formatInr(Math.abs(timingGap))} {timingGap >= 0 ? '(Uncollected)' : '(Surplus/Advances)'}
          </span>
        </div>
      </div>

      <div className="fin-trend-grid">
        {/* Trend Bar Chart */}
        <div className="fin-chart-panel">
          <div className="chart-legend">
            <span className="legend-item">
              <span className="legend-dot dot-sales"></span> Net Invoiced Revenue
            </span>
            <span className="legend-item">
              <span className="legend-dot dot-collections"></span> Actual Collections
            </span>
          </div>

          {dailyTrends.length === 0 ? (
            <div className="empty-chart-notice">No daily data available for selected period.</div>
          ) : (
            <div className="trend-bars-scroll">
              <div className="trend-bars-container">
                {dailyTrends.map((d) => {
                  const salesHeight = Math.min(100, Math.max(4, (d.netSales / maxVal) * 100))
                  const collectionsHeight = Math.min(100, Math.max(4, (d.collections / maxVal) * 100))
                  return (
                    <div key={d.date} className="trend-day-col" title={`${d.date} (${d.dayOfWeek})\nSales: ${formatInr(d.netSales)}\nCollections: ${formatInr(d.collections)}`}>
                      <div className="bars-pair">
                        <div
                          className="trend-bar bar-sales"
                          style={{ height: `${salesHeight}%` }}
                        ></div>
                        <div
                          className="trend-bar bar-collections"
                          style={{ height: `${collectionsHeight}%` }}
                        ></div>
                      </div>
                      <span className="trend-day-label">{d.displayDate}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Payment Tenders Distribution Breakdown */}
        <div className="fin-tender-panel">
          <h4 className="panel-subheading">Collections by Payment Tender</h4>
          <div className="tender-list">
            {collectionsByTender.length === 0 ? (
              <div className="empty-subtext">No payments recorded in this period.</div>
            ) : (
              collectionsByTender.map((t) => (
                <div key={t.method} className="tender-row">
                  <div className="tender-row-top">
                    <span className="tender-name">{t.label}</span>
                    <span className="tender-amount">{formatInr(t.amount)}</span>
                  </div>
                  <div className="tender-bar-bg">
                    <div
                      className="tender-bar-fill"
                      style={{ width: `${Math.min(100, t.percentage)}%` }}
                    ></div>
                  </div>
                  <div className="tender-row-meta">
                    <span>{t.count} transaction{t.count === 1 ? '' : 's'}</span>
                    <span className="tender-pct">{t.percentage}% of total</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
