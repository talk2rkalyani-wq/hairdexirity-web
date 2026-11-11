// ==============================================================================
// Luma Salon — Employee Status Board Component (Phase 3)
// Real-Time Staff Floor Grid, Name Search, Specialization Filters & Card State
// ==============================================================================

import React, { useState, useMemo } from 'react'
import type {
  StaffLiveStatus,
  EmployeeOperationalStatus,
} from '../../../../services/liveOperationsService.ts'
import { formatTime12h } from '../../../../utils/formatters.ts'
import {
  SearchIcon,
  CloseIcon,
  ScissorsIcon,
  ClockIcon,
  ChevronRightIcon,
} from '../../../../components/Icons.tsx'

interface EmployeeStatusBoardProps {
  statuses: StaffLiveStatus[]
  activeStatusFilter: EmployeeOperationalStatus | 'ALL'
  onStatusFilterChange: (status: EmployeeOperationalStatus | 'ALL') => void
  onSelectEmployee: (staffStatus: StaffLiveStatus) => void
}

export const EmployeeStatusBoard: React.FC<EmployeeStatusBoardProps> = ({
  statuses,
  activeStatusFilter,
  onStatusFilterChange,
  onSelectEmployee,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL')

  // Extract all unique skills/specialties across staff
  const availableSpecialties = useMemo(() => {
    const set = new Set<string>()
    statuses.forEach((item) => {
      if (item.staff.skills && Array.isArray(item.staff.skills)) {
        item.staff.skills.forEach((skill) => set.add(skill))
      }
    })
    return ['ALL', ...Array.from(set).sort()]
  }, [statuses])

  // Filtered employees
  const filteredStaff = useMemo(() => {
    return statuses.filter((item) => {
      // 1. Status Filter
      if (activeStatusFilter !== 'ALL' && item.status !== activeStatusFilter) {
        return false
      }

      // 2. Specialty Filter
      if (selectedSpecialty !== 'ALL') {
        const hasSkill =
          item.staff.skills && item.staff.skills.includes(selectedSpecialty)
        if (!hasSkill) return false
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const nameMatch = item.staff.name.toLowerCase().includes(q)
        const titleMatch = item.staff.jobTitle?.toLowerCase().includes(q)
        const roleMatch = item.staff.role.toLowerCase().includes(q)
        if (!nameMatch && !titleMatch && !roleMatch) return false
      }

      return true
    })
  }, [statuses, activeStatusFilter, selectedSpecialty, searchQuery])

  const handleClearAll = () => {
    setSearchQuery('')
    setSelectedSpecialty('ALL')
    onStatusFilterChange('ALL')
  }

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedSpecialty !== 'ALL' ||
    activeStatusFilter !== 'ALL'

  return (
    <section className="dashboard-content-card">
      <div className="card-header-row">
        <div className="card-title-group">
          <h2 className="card-title">Salon Floor Workforce Board</h2>
          <span className="card-status-badge">
            Showing {filteredStaff.length} of {statuses.length} Staff
          </span>
        </div>
        {hasActiveFilters && (
          <button type="button" className="btn-clear-filters" onClick={handleClearAll}>
            <CloseIcon size={14} />
            <span>Clear Filters</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar Row */}
      <div className="board-controls-row">
        {/* Search Input */}
        <div className="board-search-wrap">
          <SearchIcon size={16} className="board-search-icon" />
          <input
            type="text"
            className="board-search-input"
            placeholder="Search employee by name, role, or title..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search employees"
          />
          {searchQuery && (
            <button
              type="button"
              className="btn-search-clear"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search text"
            >
              &times;
            </button>
          )}
        </div>

        {/* Specialization Filter Dropdown */}
        <div className="board-filter-group">
          <label htmlFor="specialty-filter" className="filter-label">
            Specialization:
          </label>
          <select
            id="specialty-filter"
            className="board-filter-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
          >
            {availableSpecialties.map((spec) => (
              <option key={spec} value={spec}>
                {spec === 'ALL' ? 'All Specializations' : spec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Employee Cards Grid */}
      {filteredStaff.length === 0 ? (
        <div className="board-empty-state">
          <div className="empty-state-icon">
            <SearchIcon size={32} />
          </div>
          <span className="empty-state-title">No employees match the selected criteria</span>
          <p className="empty-state-desc">
            Try adjusting your search terms or clearing the operational status and specialization filters.
          </p>
          <button type="button" className="btn-reset-filters" onClick={handleClearAll}>
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="employee-cards-grid" role="list" aria-label="Employees">
          {filteredStaff.map((item) => {
            const { staff, status, statusLabel, shiftHoursToday, currentAppointment } = item

            let statusColorClass = 'status-slate'
            if (status === 'AVAILABLE') statusColorClass = 'status-emerald'
            else if (status === 'BUSY') statusColorClass = 'status-purple'
            else if (status === 'ON_BREAK') statusColorClass = 'status-amber'
            else if (status === 'ON_LEAVE') statusColorClass = 'status-blue'
            else if (status === 'UNKNOWN') statusColorClass = 'status-rose'

            return (
              <div
                key={staff.id}
                className="employee-live-card"
                onClick={() => onSelectEmployee(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelectEmployee(item)
                }}
              >
                {/* Card Top: Avatar, Name & Live Status Badge */}
                <div className="employee-card-header">
                  <div className="card-avatar-wrap">
                    {staff.avatarUrl ? (
                      <img src={staff.avatarUrl} alt={staff.name} className="employee-avatar-img" />
                    ) : (
                      <div className="employee-avatar-initials">{staff.name.charAt(0)}</div>
                    )}
                    <span className={`live-status-dot-badge ${statusColorClass}`} />
                  </div>

                  <div className="employee-info-col">
                    <span className="employee-card-name">{staff.name}</span>
                    <span className="employee-card-role">
                      {staff.jobTitle || 'Hair Stylist'}
                    </span>
                  </div>

                  <span className={`employee-status-badge ${statusColorClass}`}>
                    {statusLabel}
                  </span>
                </div>

                {/* Card Body: Dynamic Operational Context */}
                <div className="employee-card-body">
                  {status === 'BUSY' && currentAppointment && (
                    <div className="busy-context-box">
                      <div className="context-title-row">
                        <ScissorsIcon size={14} className="icon-busy" />
                        <span className="busy-service-name">
                          {currentAppointment.serviceName || 'Active Service'}
                        </span>
                      </div>
                      <span className="busy-client-name">
                        With {currentAppointment.clientName || 'Guest'} &bull;{' '}
                        {formatTime12h(currentAppointment.startTime)} – {formatTime12h(currentAppointment.endTime)}
                      </span>
                    </div>
                  )}

                  {status === 'AVAILABLE' && (
                    <div className="available-context-box">
                      {item.waitingAppointments && item.waitingAppointments.length > 0 ? (
                        <span style={{ color: '#fde047', fontWeight: 600 }}>
                          ⏳ {item.waitingAppointments[0].clientName || 'Guest'} waiting in lounge
                        </span>
                      ) : item.upcomingAppointments.length > 0 ? (
                        <span>
                          Next: {item.upcomingAppointments[0].serviceName || 'Service'} at{' '}
                          {formatTime12h(item.upcomingAppointments[0].startTime)}
                        </span>
                      ) : (
                        <span>Ready on floor for walk-ins & bookings</span>
                      )}
                    </div>
                  )}

                  {status === 'OFF_SHIFT' && (
                    <div className="offshift-context-box">
                      <ClockIcon size={14} />
                      <span>{item.statusReason}</span>
                    </div>
                  )}

                  {status === 'UNKNOWN' && (
                    <div className="unknown-context-box">
                      <span>{item.statusReason}</span>
                    </div>
                  )}

                  {/* Shift Hours & Bookings Count Footer */}
                  <div className="card-footer-meta">
                    <span className="meta-shift-time">
                      {shiftHoursToday && shiftHoursToday.isOpen
                        ? `${formatTime12h(shiftHoursToday.open)} – ${formatTime12h(shiftHoursToday.close)}`
                        : 'Off Today'}
                    </span>
                    <span className="meta-apt-count">
                      {item.totalAppointmentsToday} apt{item.totalAppointmentsToday === 1 ? '' : 's'} today
                    </span>
                  </div>
                </div>

                {/* Card Action Hint */}
                <div className="card-inspect-hint">
                  <span>View Timeline & Schedule</span>
                  <ChevronRightIcon size={14} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

