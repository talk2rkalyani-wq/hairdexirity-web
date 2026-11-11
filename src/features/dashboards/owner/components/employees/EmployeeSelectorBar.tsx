// ==============================================================================
// Luma Salon — Employee Selector Bar (Phase 6)
// Searchable Stylist Dropdown, Quick-Switch Chips & Roster Filter
// ==============================================================================

import React, { useState, useMemo } from 'react'
import type { Staff } from '../../../../../types/models.ts'
import type { StaffLiveStatus } from '../../../../../services/liveOperationsService.ts'
import { SearchIcon, UsersIcon, ScissorsIcon, ChevronDownIcon } from '../../../../../components/Icons.tsx'

interface EmployeeSelectorBarProps {
  staffList: Staff[]
  selectedStaffId: string
  onSelectStaff: (staffId: string) => void
  liveStatusMap?: Map<string, StaffLiveStatus>
}

export const EmployeeSelectorBar: React.FC<EmployeeSelectorBarProps> = ({
  staffList,
  selectedStaffId,
  onSelectStaff,
  liveStatusMap,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string>('ALL')

  const selectedStaff = useMemo(() => {
    return staffList.find((s) => s.id === selectedStaffId) || staffList[0]
  }, [staffList, selectedStaffId])

  // Filter staff by search and role
  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return staffList.filter((s) => {
      const matchesSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        (s.jobTitle && s.jobTitle.toLowerCase().includes(q)) ||
        (s.skills && s.skills.some((sk) => sk.toLowerCase().includes(q)))

      const matchesRole = roleFilter === 'ALL' || s.role === roleFilter
      return matchesSearch && matchesRole
    })
  }, [staffList, searchQuery, roleFilter])

  // Top 5 senior or most active stylists for quick switching
  const quickSwitchStylists = useMemo(() => {
    return staffList
      .filter((s) => s.active && s.role !== 'owner')
      .slice(0, 5)
  }, [staffList])

  const getStatusDotClass = (staffId: string) => {
    if (!liveStatusMap) return ''
    const live = liveStatusMap.get(staffId)
    if (!live) return 'dot-slate'
    if (live.status === 'AVAILABLE') return 'dot-emerald'
    if (live.status === 'BUSY') return 'dot-purple'
    if (live.status === 'ON_BREAK') return 'dot-amber'
    if (live.status === 'ON_LEAVE') return 'dot-blue'
    return 'dot-slate'
  }

  return (
    <div className="employee-selector-bar-card">
      <div className="selector-main-row">
        {/* Left: Dropdown Trigger & Active Stylist Preview */}
        <div className="selector-control-group">
          <label className="selector-field-label" htmlFor="stylist-selector-input">
            <UsersIcon size={14} />
            <span>Selected Stylist Profile</span>
          </label>

          <div className="custom-select-wrapper">
            <button
              id="stylist-selector-input"
              type="button"
              className="custom-select-trigger"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              aria-haspopup="listbox"
            >
              <div className="selected-staff-pill">
                <div className="staff-avatar-mini">
                  {selectedStaff?.avatarUrl ? (
                    <img src={selectedStaff.avatarUrl} alt={selectedStaff.name} />
                  ) : (
                    <span>{selectedStaff?.name ? selectedStaff.name.charAt(0) : 'S'}</span>
                  )}
                  <span className={`avatar-status-dot ${getStatusDotClass(selectedStaff?.id || '')}`} />
                </div>
                <div className="selected-staff-meta">
                  <span className="selected-staff-name">{selectedStaff?.name || 'Select Stylist'}</span>
                  <span className="selected-staff-sub">
                    {selectedStaff?.jobTitle || selectedStaff?.role?.replace('_', ' ') || 'Stylist'} &bull;{' '}
                    {selectedStaff?.active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <ChevronDownIcon size={16} className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`} />
            </button>

            {/* Dropdown Menu Overlay */}
            {isDropdownOpen && (
              <div className="custom-select-dropdown" role="listbox">
                <div className="dropdown-search-box">
                  <SearchIcon size={14} className="search-icon-muted" />
                  <input
                    type="text"
                    placeholder="Search by name, skill, title..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="dropdown-search-input"
                  />
                </div>

                <div className="dropdown-role-filter-row">
                  <button
                    type="button"
                    className={`role-filter-chip ${roleFilter === 'ALL' ? 'active' : ''}`}
                    onClick={() => setRoleFilter('ALL')}
                  >
                    All ({staffList.length})
                  </button>
                  <button
                    type="button"
                    className={`role-filter-chip ${roleFilter === 'master_stylist' ? 'active' : ''}`}
                    onClick={() => setRoleFilter('master_stylist')}
                  >
                    Master
                  </button>
                  <button
                    type="button"
                    className={`role-filter-chip ${roleFilter === 'senior_stylist' ? 'active' : ''}`}
                    onClick={() => setRoleFilter('senior_stylist')}
                  >
                    Senior
                  </button>
                  <button
                    type="button"
                    className={`role-filter-chip ${roleFilter === 'junior_stylist' ? 'active' : ''}`}
                    onClick={() => setRoleFilter('junior_stylist')}
                  >
                    Junior
                  </button>
                </div>

                <div className="dropdown-options-list">
                  {filteredStaff.length === 0 ? (
                    <div className="dropdown-empty-state">No matching stylists found</div>
                  ) : (
                    filteredStaff.map((staff) => {
                      const isSelected = staff.id === selectedStaffId
                      return (
                        <button
                          key={staff.id}
                          type="button"
                          className={`dropdown-option-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            onSelectStaff(staff.id)
                            setIsDropdownOpen(false)
                          }}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <div className="staff-avatar-mini">
                            {staff.avatarUrl ? (
                              <img src={staff.avatarUrl} alt={staff.name} />
                            ) : (
                              <span>{staff.name.charAt(0)}</span>
                            )}
                            <span className={`avatar-status-dot ${getStatusDotClass(staff.id)}`} />
                          </div>
                          <div className="option-info">
                            <span className="option-name">{staff.name}</span>
                            <span className="option-title">
                              {staff.jobTitle || staff.role.replace('_', ' ')}
                            </span>
                          </div>
                          {staff.active ? (
                            <span className="badge-active-mini">Active</span>
                          ) : (
                            <span className="badge-inactive-mini">Inactive</span>
                          )}
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick-Switch Stylist Chips */}
        <div className="quick-switch-section">
          <span className="quick-switch-label">
            <ScissorsIcon size={13} />
            <span>Quick Jump:</span>
          </span>
          <div className="quick-switch-chips">
            {quickSwitchStylists.map((stylist) => {
              const isSelected = stylist.id === selectedStaffId
              return (
                <button
                  key={stylist.id}
                  type="button"
                  className={`quick-stylist-chip ${isSelected ? 'active' : ''}`}
                  onClick={() => onSelectStaff(stylist.id)}
                  title={`View details for ${stylist.name}`}
                >
                  <span className="chip-initial">{stylist.name.charAt(0)}</span>
                  <span className="chip-name">{stylist.name.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

