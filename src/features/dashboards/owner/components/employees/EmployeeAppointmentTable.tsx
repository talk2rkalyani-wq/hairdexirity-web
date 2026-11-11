// ==============================================================================
// Luma Salon — Employee Appointment Ledger Table (Phase 6)
// Filterable, Sortable Appointment History with Verified Lifecycle Inspector
// ==============================================================================

import React, { useState, useMemo } from 'react'
import type { Appointment, AppointmentStatus } from '../../../../../types/models.ts'
import {
  employeePerformanceService,
  type EmployeeAppointmentFilters,
} from '../../../../../services/employeePerformanceService.ts'
import { formatCurrency, formatTime12h, formatDate } from '../../../../../utils/formatters.ts'
import {
  SearchIcon,
  SlidersIcon,
  CalendarIcon,
  ClockIcon,
  ScissorsIcon,
  UsersIcon,
} from '../../../../../components/Icons.tsx'
import { EmployeeLifecycleModal } from './EmployeeLifecycleModal.tsx'

interface EmployeeAppointmentTableProps {
  appointments: Appointment[]
  stylistName: string
}

export const EmployeeAppointmentTable: React.FC<EmployeeAppointmentTableProps> = ({
  appointments,
  stylistName,
}) => {
  const [selectedStatus, setSelectedStatus] = useState<AppointmentStatus | 'all'>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'price_desc' | 'price_asc'>('date_desc')
  const [auditAppointment, setAuditAppointment] = useState<Appointment | null>(null)

  // Filtered and sorted appointments
  const filteredAppointments = useMemo(() => {
    const filters: EmployeeAppointmentFilters = {
      status: selectedStatus,
      category: selectedCategory,
      searchQuery,
      sortBy,
    }
    return employeePerformanceService.filterAppointments(appointments, filters)
  }, [appointments, selectedStatus, selectedCategory, searchQuery, sortBy])

  // Status counts for pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: appointments.length,
      completed: 0,
      in_progress: 0,
      checked_in: 0,
      scheduled: 0,
      cancelled: 0,
      'no-show': 0,
    }
    appointments.forEach((a) => {
      if (counts[a.status] !== undefined) {
        counts[a.status]++
      }
      if (a.status === 'confirmed' || a.status === 'scheduled') {
        counts.scheduled++
      }
    })
    return counts
  }, [appointments])

  const getStatusBadgeClass = (status: AppointmentStatus) => {
    switch (status) {
      case 'completed':
        return 'badge-emerald'
      case 'in_progress':
        return 'badge-purple'
      case 'checked_in':
        return 'badge-amber'
      case 'confirmed':
      case 'scheduled':
        return 'badge-blue'
      case 'cancelled':
        return 'badge-rose'
      case 'no-show':
        return 'badge-slate'
      default:
        return 'badge-slate'
    }
  }

  return (
    <div className="employee-appointment-ledger-card">
      {/* Table Header Row */}
      <div className="ledger-card-header">
        <div className="ledger-title-group">
          <span className="ledger-main-title">
            <CalendarIcon size={16} />
            <span>Appointment History Ledger</span>
          </span>
          <span className="ledger-subtitle">
            Historical & upcoming client sessions assigned to {stylistName} ({filteredAppointments.length} of {appointments.length} records)
          </span>
        </div>

        {/* Search & Sort Controls */}
        <div className="ledger-controls-row">
          <div className="table-search-box">
            <SearchIcon size={14} className="search-icon-muted" />
            <input
              type="text"
              placeholder="Filter by client, service, ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="table-search-input"
            />
          </div>

          <div className="table-sort-box">
            <ScissorsIcon size={14} className="sort-icon-muted" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="table-sort-select"
            >
              <option value="all">All Specialties</option>
              <option value="haircut">Haircuts</option>
              <option value="color">Colors</option>
              <option value="styling">Styling</option>
              <option value="treatment">Treatments</option>
              <option value="extensions">Extensions</option>
            </select>
          </div>

          <div className="table-sort-box">
            <SlidersIcon size={14} className="sort-icon-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="table-sort-select"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="price_asc">Price: Low to High</option>
            </select>
          </div>
        </div>
      </div>

      {/* Status Filter Pills Row */}
      <div className="ledger-filter-pills-row">
        <span className="filter-row-label">
          <SlidersIcon size={13} />
          <span>Status:</span>
        </span>
        <div className="filter-pills-wrap">
          <button
            type="button"
            className={`ledger-filter-pill ${selectedStatus === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('all')}
          >
            All ({statusCounts.all})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill emerald ${selectedStatus === 'completed' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('completed')}
          >
            Completed ({statusCounts.completed})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill purple ${selectedStatus === 'in_progress' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('in_progress')}
          >
            In Progress ({statusCounts.in_progress})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill amber ${selectedStatus === 'checked_in' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('checked_in')}
          >
            Checked In ({statusCounts.checked_in})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill blue ${selectedStatus === 'scheduled' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('scheduled')}
          >
            Scheduled / Confirmed ({statusCounts.scheduled})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill rose ${selectedStatus === 'cancelled' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('cancelled')}
          >
            Cancelled ({statusCounts.cancelled})
          </button>
          <button
            type="button"
            className={`ledger-filter-pill slate ${selectedStatus === 'no-show' ? 'active' : ''}`}
            onClick={() => setSelectedStatus('no-show')}
          >
            No-Show ({statusCounts['no-show']})
          </button>
        </div>
      </div>

      {/* Appointment Table Container */}
      <div className="table-responsive-wrapper">
        <table className="employee-ledger-table">
          <thead>
            <tr>
              <th>Date & Time</th>
              <th>Customer</th>
              <th>Service</th>
              <th>Duration</th>
              <th>Service Price</th>
              <th>Status</th>
              <th className="th-actions">Lifecycle Audit</th>
            </tr>
          </thead>
          <tbody>
            {filteredAppointments.length === 0 ? (
              <tr>
                <td colSpan={7} className="td-empty-state">
                  <div className="table-empty-box">
                    <ScissorsIcon size={24} className="empty-icon-muted" />
                    <span className="empty-title">No appointments found matching filters</span>
                    <span className="empty-desc">Try clearing your search query or selecting a different status filter</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAppointments.map((apt) => {
                const duration = apt.endTime
                  ? (parseInt(apt.endTime.split(':')[0]) * 60 + parseInt(apt.endTime.split(':')[1])) -
                    (parseInt(apt.startTime.split(':')[0]) * 60 + parseInt(apt.startTime.split(':')[1]))
                  : 45

                return (
                  <tr key={apt.id} className="ledger-table-row">
                    {/* Date & Time */}
                    <td className="td-datetime">
                      <div className="td-date-primary">{formatDate(apt.date)}</div>
                      <div className="td-time-sub">
                        <ClockIcon size={12} />
                        <span>
                          {formatTime12h(apt.startTime)} – {formatTime12h(apt.endTime)}
                        </span>
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="td-client">
                      <div className="td-client-name">
                        <UsersIcon size={13} className="text-muted" />
                        <span>{apt.clientName || 'Guest'}</span>
                      </div>
                      {apt.clientPhone && <div className="td-client-phone">{apt.clientPhone}</div>}
                    </td>

                    {/* Service */}
                    <td className="td-service">
                      <div className="td-service-title">{apt.serviceName || 'Service'}</div>
                      <span className="td-service-id">#{apt.id}</span>
                    </td>

                    {/* Duration */}
                    <td className="td-duration">
                      <span className="duration-pill">{duration > 0 ? `${duration}m` : '45m'}</span>
                    </td>

                    {/* Price */}
                    <td className="td-price">
                      <span className="price-tag gold">{formatCurrency(apt.price)}</span>
                    </td>

                    {/* Status */}
                    <td className="td-status">
                      <span className={`status-pill ${getStatusBadgeClass(apt.status)}`}>
                        {apt.status.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Lifecycle Audit Button */}
                    <td className="td-actions">
                      <button
                        type="button"
                        className="audit-milestone-btn"
                        onClick={() => setAuditAppointment(apt)}
                        title="Inspect verified lifecycle timestamps"
                      >
                        <ClockIcon size={12} />
                        <span>Audit Lifecycle</span>
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Lifecycle Audit Modal */}
      {auditAppointment && (
        <EmployeeLifecycleModal
          appointment={auditAppointment}
          onClose={() => setAuditAppointment(null)}
        />
      )}
    </div>
  )
}
