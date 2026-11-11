import React, { useState, useEffect, useMemo } from 'react'
import type { Staff } from '../../types/models'
import { staffService } from '../../services/staffService'
import { StaffCard } from './components/StaffCard'
import { StaffProfileDrawer } from './components/StaffProfileDrawer'
import { StaffFormModal } from './components/StaffFormModal'
import { PlusIcon, SearchIcon, CloseIcon } from '../../components/Icons'
import './StaffView.css'

export const StaffView: React.FC = () => {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  // Drawer & Modal State
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [staffToEdit, setStaffToEdit] = useState<Staff | null>(null)

  // Floating Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadStaff = async () => {
    try {
      setIsLoading(true)
      const data = await staffService.getStaff()
      setStaffList(data)
    } catch (err) {
      console.error('Error loading staff list:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadStaff()
  }, [])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }

  // Filter staff by name, role, or skills
  const filteredStaff = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return staffList

    return staffList.filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(q)
      const roleMatch = s.role.toLowerCase().replace(/_/g, ' ').includes(q)
      const skillMatch = s.skills.some((skill) =>
        skill.toLowerCase().includes(q)
      )
      const phoneMatch = s.phone ? s.phone.includes(q) : false
      return nameMatch || roleMatch || skillMatch || phoneMatch
    })
  }, [staffList, searchQuery])

  const handleOpenAddModal = () => {
    setStaffToEdit(null)
    setIsFormModalOpen(true)
  }

  const handleOpenEditModal = (staff: Staff) => {
    setStaffToEdit(staff)
    setIsFormModalOpen(true)
  }

  const handleSelectStaff = (staff: Staff) => {
    setSelectedStaff(staff)
  }

  const handleCloseDrawer = () => {
    setSelectedStaff(null)
  }

  const handleSaveStaff = async (staffPayload: any, isEdit: boolean) => {
    if (isEdit && staffToEdit) {
      const updated = await staffService.updateStaff(staffToEdit.id, staffPayload)
      setStaffList((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      )
      if (selectedStaff && selectedStaff.id === updated.id) {
        setSelectedStaff(updated)
      }
      showToast(`Updated profile for ${updated.name}`)
    } else {
      const created = await staffService.createStaff(staffPayload)
      setStaffList((prev) => [...prev, created])
      showToast(`Added ${created.name} to the salon team`)
    }
  }

  return (
    <main className="staff-workspace" aria-label="Staff Management">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="luma-floating-toast" role="status">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Workspace Header */}
      <header className="staff-header-section">
        <div className="staff-header-info">
          <div className="staff-title-row">
            <h1 className="staff-main-title">Staff</h1>
            <span className="staff-count-badge" aria-label="Total Staff Count">
              {staffList.length} Team Members
            </span>
          </div>
          <p className="staff-subtitle">
            Manage your salon team, skills, and schedules.
          </p>
        </div>

        <div className="staff-actions-row">
          <button
            type="button"
            className="add-staff-btn"
            onClick={handleOpenAddModal}
            aria-label="Add new staff member"
          >
            <PlusIcon size={18} />
            <span>Add Staff</span>
          </button>
        </div>
      </header>

      {/* Search & Filter Toolbar */}
      <div className="staff-toolbar">
        <div className="staff-search-container">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            className="staff-search-input"
            placeholder="Search by stylist name, role, skill, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search staff members"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Staff Grid List */}
      <section className="staff-content-area" aria-label="Stylist Cards Grid">
        {isLoading ? (
          <div className="staff-loading-state">
            <p>Loading salon team...</p>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="staff-empty-state">
            <p className="empty-title">
              {searchQuery ? 'No matching stylists found.' : 'No staff members added yet.'}
            </p>
            <p className="empty-subtitle">
              {searchQuery
                ? `No staff member matches "${searchQuery}". Try a different keyword.`
                : 'Get started by adding your first team member to the salon.'}
            </p>
            {searchQuery ? (
              <button
                type="button"
                className="empty-reset-btn"
                onClick={() => setSearchQuery('')}
              >
                Clear Search
              </button>
            ) : (
              <button
                type="button"
                className="empty-add-btn"
                onClick={handleOpenAddModal}
              >
                <PlusIcon size={16} />
                <span>Add First Staff Member</span>
              </button>
            )}
          </div>
        ) : (
          <div className="staff-cards-grid">
            {filteredStaff.map((staff) => (
              <StaffCard
                key={staff.id}
                staff={staff}
                onSelect={handleSelectStaff}
              />
            ))}
          </div>
        )}
      </section>

      {/* Staff Profile Slide-Over Drawer */}
      {selectedStaff && (
        <StaffProfileDrawer
          staff={selectedStaff}
          onClose={handleCloseDrawer}
          onEdit={(st) => {
            handleCloseDrawer()
            handleOpenEditModal(st)
          }}
        />
      )}

      {/* Add / Edit Staff Modal */}
      <StaffFormModal
        isOpen={isFormModalOpen}
        staffToEdit={staffToEdit}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveStaff}
      />
    </main>
  )
}
