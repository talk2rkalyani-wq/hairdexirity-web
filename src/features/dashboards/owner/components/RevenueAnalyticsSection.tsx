// ==============================================================================
// Luma Salon — Revenue Analytics Section (Phase 2)
// Completed Service Value Trends, Service Share & Payment Gateway Status
// ==============================================================================

import React from 'react'
import type { ExecutiveDashboardData } from '../../../../services/ownerDashboardService.ts'
import { formatCurrency } from '../../../../utils/formatters.ts'
import { TrendBarChart } from './DashboardCharts.tsx'
import { TrendingUpIcon, InfoIcon, ScissorsIcon } from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface RevenueAnalyticsSectionProps {
  data: ExecutiveDashboardData
  onNavigate: (route: NavId) => void
}

export const RevenueAnalyticsSection: React.FC<RevenueAnalyticsSectionProps> = ({
  data,
  onNavigate,
}) => {
  const { revenue } = data.kpis
  const { comparison } = revenue

  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Revenue & Service Value Analytics</h2>
          <span className="card-status-badge">Completed Work Values</span>
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="btn-card-action"
            onClick={() => onNavigate('owner/reports')}
            title="Open Finance & Reports Workspace"
          >
            <TrendingUpIcon size={14} />
            <span>Finance & Reports</span>
          </button>
        </div>
      </div>

      {/* Prominent Payment Ledger Transparency Notice per Part 1 & Part 3 Audit */}
      <div className="payment-transparency-banner">
        <div className="banner-info-icon">
          <InfoIcon size={20} />
        </div>
        <div className="banner-info-text">
          <span className="banner-headline">
            Architecture Audit Notice: Payment Gateway & Billing Ledger Integration Pending
          </span>
          <p className="banner-body">
            Hair Dexirity's verified database currently tracks appointment service prices and
            completion statuses, but lacks a dedicated payment transactions/invoicing table.
            Revenue metrics below represent <strong>completed appointment service value</strong>,
            not collected bank/card receipts. Unpaid or in-progress bookings are strictly excluded.
          </p>
        </div>
      </div>

      <div className="analytics-split-layout">
        {/* Left Column: Service Value Trend Chart */}
        <div className="analytics-chart-col">
          <div className="chart-meta-header">
            <span className="chart-meta-title">
              Completed Service Value Trend ({data.selectedRange.label})
            </span>
            <span className="chart-meta-total text-purple">
              {formatCurrency(revenue.completedServiceValue)}
            </span>
          </div>

          <TrendBarChart
            data={data.dailyTrend}
            height={200}
            valueKey="completedServiceValue"
            formatAsCurrency={true}
            color="#8b5cf6"
          />

          <div className="revenue-comparison-bar">
            <div className="comparison-metric-item">
              <span className="comp-label">Current Period Total</span>
              <span className="comp-val">{formatCurrency(revenue.completedServiceValue)}</span>
            </div>
            <div className="comparison-metric-item">
              <span className="comp-label">Prior Period Total</span>
              <span className="comp-val">{formatCurrency(comparison.previous)}</span>
            </div>
            <div className="comparison-metric-item">
              <span className="comp-label">Net Variance</span>
              <span
                className={`comp-val ${
                  comparison.absoluteChange >= 0 ? 'text-emerald' : 'text-rose'
                }`}
              >
                {comparison.absoluteChange >= 0 ? '+' : ''}
                {formatCurrency(comparison.absoluteChange)}
                {comparison.percentageChange !== null && ` (${comparison.percentageChange}%)`}
              </span>
            </div>
            <div className="comparison-metric-item">
              <span className="comp-label">Average Ticket Size</span>
              <span className="comp-val text-gold">
                {formatCurrency(revenue.averageTicketValue)}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Top Performing Services */}
        <div className="analytics-services-col">
          <div className="chart-meta-header">
            <span className="chart-meta-title">Top Performing Services</span>
            <span className="chart-meta-total">By Realized Value</span>
          </div>

          {data.topServices.length === 0 ? (
            <div className="services-empty-state">
              <span>No completed service revenue recorded in this period</span>
            </div>
          ) : (
            <div className="top-services-list">
              {data.topServices.map((svc, idx) => (
                <div key={svc.serviceId} className="top-service-row">
                  <div className="service-rank-badge">#{idx + 1}</div>
                  <div className="service-info-col">
                    <div className="service-title-row">
                      <span className="service-name">{svc.serviceName}</span>
                      <span className="service-rev-val">
                        {formatCurrency(svc.completedValue)}
                      </span>
                    </div>
                    <div className="service-progress-track">
                      <div
                        className="service-progress-fill"
                        style={{ width: `${Math.max(5, svc.sharePercentage)}%` }}
                      />
                    </div>
                    <div className="service-subtext-row">
                      <span>{svc.completedCount} completed</span>
                      <span className="service-share-pct">{svc.sharePercentage}% of total</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="services-footer-shortcut">
            <button
              type="button"
              className="btn-services-catalog"
              onClick={() => onNavigate('services')}
            >
              <ScissorsIcon size={14} />
              <span>Manage Salon Service Catalog</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

