import React from 'react'
import type {
  StaffPerformanceItem,
  ServicePerformanceItem,
} from '../../../../../types/financialIntelligence.ts'

interface EmployeeServicePerformanceSectionProps {
  staffPerformance: StaffPerformanceItem[]
  servicePerformance: ServicePerformanceItem[]
}

export const EmployeeServicePerformanceSection: React.FC<EmployeeServicePerformanceSectionProps> = ({
  staffPerformance,
  servicePerformance,
}) => {
  const formatInr = (val: number) =>
    `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div className="fin-double-panel-grid">
      {/* -------------------------------------------------------------------- */}
      {/* Panel 1: Stylist / Staff Revenue Attribution */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-panel-box">
        <div className="panel-box-header">
          <div>
            <h3 className="panel-box-title">Revenue by Stylist & Employee</h3>
            <p className="panel-box-subtitle">Attributed service billings, retail upsells, and staff volume</p>
          </div>
        </div>

        {staffPerformance.length === 0 ? (
          <div className="empty-subtext">No staff billing records found for this period.</div>
        ) : (
          <div className="panel-table-wrap">
            <table className="mini-data-table">
              <thead>
                <tr>
                  <th>Stylist / Staff</th>
                  <th className="text-center">Role</th>
                  <th className="text-right">Service Rev</th>
                  <th className="text-right">Retail Rev</th>
                  <th className="text-center">Services</th>
                  <th className="text-right">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {staffPerformance.map((s) => (
                  <tr key={s.staffId}>
                    <td className="bold">{s.staffName}</td>
                    <td className="text-center">
                      <span className="role-tag">{s.role.replace(/_/g, ' ')}</span>
                    </td>
                    <td className="text-right">{formatInr(s.serviceRevenue)}</td>
                    <td className="text-right">{formatInr(s.productRevenue)}</td>
                    <td className="text-center">{s.serviceCount}</td>
                    <td className="text-right bold text-primary">{formatInr(s.totalRevenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Panel 2: Service Popularity & Revenue Generation */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-panel-box">
        <div className="panel-box-header">
          <div>
            <h3 className="panel-box-title">Top Revenue-Generating Services</h3>
            <p className="panel-box-subtitle">Service volume performed, realized sales revenue, and average price</p>
          </div>
        </div>

        {servicePerformance.length === 0 ? (
          <div className="empty-subtext">No service billings found for this period.</div>
        ) : (
          <div className="panel-table-wrap">
            <table className="mini-data-table">
              <thead>
                <tr>
                  <th>Service Description</th>
                  <th className="text-center">Volume</th>
                  <th className="text-right">Avg Price</th>
                  <th className="text-right">Total Realized</th>
                </tr>
              </thead>
              <tbody>
                {servicePerformance.map((srv, idx) => (
                  <tr key={srv.serviceId + idx}>
                    <td className="bold">{srv.serviceName}</td>
                    <td className="text-center">{srv.volume}</td>
                    <td className="text-right">{formatInr(srv.averagePrice)}</td>
                    <td className="text-right bold text-success">{formatInr(srv.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
