// ==============================================================================
// Luma Salon — Business Performance Section (Phase 2)
// Operational Ratios, Stylist Activity & Efficiency Indicators
// ==============================================================================

import React from 'react'
import type { ExecutiveDashboardData } from '../../../../services/ownerDashboardService.ts'
import { formatCurrency } from '../../../../utils/formatters.ts'
import { UsersIcon, AwardIcon } from '../../../../components/Icons.tsx'
import type { NavId } from '../../../../types/salon.ts'

interface BusinessPerformanceSectionProps {
  data: ExecutiveDashboardData
  onNavigate: (route: NavId) => void
}

export const BusinessPerformanceSection: React.FC<BusinessPerformanceSectionProps> = ({
  data,
  onNavigate,
}) => {
  const { kpis, stylistActivity } = data
  const { capacity } = kpis

  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Staff Activity & Operational Ratios</h2>
          <span className="card-status-badge">Productivity</span>
        </div>
        <div className="card-actions">
          <button
            type="button"
            className="btn-card-action"
            onClick={() => onNavigate('staff')}
            title="Open Staff Directory"
          >
            <UsersIcon size={14} />
            <span>Staff Directory</span>
          </button>
        </div>
      </div>

      <p className="dashboard-page-subtitle">
        Workforce engagement, service volume distribution across salon stylists, and key operational ratios.
      </p>

      {/* Stylist Activity Table / Grid */}
      <div className="performance-content-grid">
        <div className="stylist-activity-container">
          <div className="chart-meta-header">
            <span className="chart-meta-title">Top Active Stylists</span>
            <span className="chart-meta-total">{capacity.activeStylistCount} Active</span>
          </div>

          {stylistActivity.length === 0 ? (
            <div className="stylist-empty-state">
              <span>No stylist appointment records for this period</span>
            </div>
          ) : (
            <div className="stylist-table-wrap">
              <table className="stylist-performance-table">
                <thead>
                  <tr>
                    <th>Stylist Name</th>
                    <th>Bookings</th>
                    <th>Completed</th>
                    <th>Service Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stylistActivity.map((stylist) => (
                    <tr key={stylist.staffId}>
                      <td className="stylist-name-cell">
                        <div className="stylist-avatar-placeholder">
                          {stylist.staffName.charAt(0)}
                        </div>
                        <span className="stylist-fullname">{stylist.staffName}</span>
                      </td>
                      <td>
                        <span className="table-count-pill">{stylist.appointmentCount}</span>
                      </td>
                      <td>
                        <span className="table-count-pill pill-completed">
                          {stylist.completedCount}
                        </span>
                      </td>
                      <td className="stylist-value-cell">
                        {formatCurrency(stylist.completedValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Operational Efficiency Highlights */}
        <div className="efficiency-highlights-col">
          <div className="chart-meta-header">
            <span className="chart-meta-title">Operational Health Scores</span>
            <span className="chart-meta-total">Metrics</span>
          </div>

          <div className="efficiency-cards-list">
            <div className="efficiency-stat-card">
              <div className="stat-card-icon icon-emerald">
                <AwardIcon size={18} />
              </div>
              <div className="stat-card-body">
                <span className="stat-title">Service Completion Ratio</span>
                <span className="stat-value text-emerald">
                  {kpis.completedServices.completionRate}%
                </span>
                <span className="stat-desc">
                  {kpis.completedServices.totalCompleted} of {kpis.appointments.totalAppointments} appointments fulfilled
                </span>
              </div>
            </div>

            <div className="efficiency-stat-card">
              <div className="stat-card-icon icon-purple">
                <UsersIcon size={18} />
              </div>
              <div className="stat-card-body">
                <span className="stat-title">Stylist Utilization Density</span>
                <span className="stat-value text-purple">
                  ~{capacity.appointmentsPerActiveStylist} apts/stylist
                </span>
                <span className="stat-desc">
                  Based on {capacity.activeStylistCount} active salon stylists on roster
                </span>
              </div>
            </div>

            <div className="efficiency-stat-card">
              <div className="stat-card-icon icon-gold">
                <AwardIcon size={18} />
              </div>
              <div className="stat-card-body">
                <span className="stat-title">Average Completed Ticket</span>
                <span className="stat-value text-gold">
                  {formatCurrency(kpis.revenue.averageTicketValue)}
                </span>
                <span className="stat-desc">
                  Average gross service value per completed appointment
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

