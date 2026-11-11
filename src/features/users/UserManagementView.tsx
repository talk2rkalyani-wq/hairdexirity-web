import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { User, UserRole } from '../../types/models'
import { userService } from '../../services/userService'
import { sessionService } from '../../services/sessionService'
import { permissionService } from '../../services/permissionService'
import { appointmentStore } from '../../services/appointmentStore'
import { CreateEmployeeModal } from './components/CreateEmployeeModal'
import { DeleteConfirmationModal } from '../../components/DeleteConfirmationModal'
import { BulkActionBar } from '../../components/BulkActionBar'
import { TrashIcon } from '../../components/Icons'
import { isRootAdminEmail, ROOT_ADMIN_EMAIL } from '../../config/adminConfig'
import './UserManagementView.css'

export const UserManagementView: React.FC = () => {
  const [session, setSession] = useState(() => sessionService.getCurrentSession())
  const [users, setUsers] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL')
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('ALL')
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Selection & Bulk Actions State (Owner only)
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set())

  // Single Delete State
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [isDeletingSingle, setIsDeletingSingle] = useState(false)
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(null)

  // Bulk Delete State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  const selectAllRef = useRef<HTMLInputElement>(null)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3500)
  }, [])

  // Listen to session changes
  useEffect(() => {
    const unsub = sessionService.subscribe((s) => {
      setSession(s)
      if (!permissionService.canDeleteUser(s)) {
        setSelectedUserIds(new Set())
      }
    })
    return () => unsub()
  }, [])

  const loadUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await userService.getUsers()
      setUsers(data)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadUsers()
    const unsubUsers = userService.subscribe((updated) => {
      setUsers(updated)
    })
    const unsubAppts = appointmentStore.subscribe(() => {
      userService.getUsers().then((data) => setUsers([...data]))
    })
    return () => {
      unsubUsers()
      unsubAppts()
    }
  }, [loadUsers])

  // Permission Guard Check
  const hasAccess = permissionService.canAccessUserManagement(session)

  // Compute Metrics (strictly excludes Root Administrator from salon team metrics)
  const stats = useMemo(() => {
    const salonUsers = users.filter((u) => !isRootAdminEmail(u.email) && u.role !== 'ADMIN')
    const total = salonUsers.length
    const owners = salonUsers.filter((u) => u.role === 'OWNER').length
    const receptionists = salonUsers.filter((u) => u.role === 'RECEPTIONIST').length
    const employees = salonUsers.filter((u) => u.role === 'EMPLOYEE')
    const activeEmployees = employees.filter((e) => e.active).length

    return { total, owners, receptionists, activeEmployees, totalEmployees: employees.length }
  }, [users])

  // Filtered Users (strictly excludes Root Administrator from User Listing)
  const filteredUsers = useMemo(() => {
    const salonUsers = users.filter((u) => !isRootAdminEmail(u.email) && u.role !== 'ADMIN')
    const q = searchQuery.toLowerCase().trim()
    return salonUsers.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false
      if (specialtyFilter !== 'ALL' && u.specialty !== specialtyFilter) return false

      if (q) {
        const nameMatch = u.name.toLowerCase().includes(q)
        const emailMatch = u.email.toLowerCase().includes(q)
        const specMatch = u.specialty ? u.specialty.toLowerCase().includes(q) : false
        return nameMatch || emailMatch || specMatch
      }
      return true
    })
  }, [users, searchQuery, roleFilter, specialtyFilter])

  // Bulk Selection Handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isAllSelected = useMemo(() => {
    if (filteredUsers.length === 0) return false
    return filteredUsers.every((u) => selectedUserIds.has(u.id))
  }, [filteredUsers, selectedUserIds])

  const isIndeterminate = useMemo(() => {
    if (filteredUsers.length === 0) return false
    const count = filteredUsers.filter((u) => selectedUserIds.has(u.id)).length
    return count > 0 && count < filteredUsers.length
  }, [filteredUsers, selectedUserIds])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedUserIds((prev) => {
        const next = new Set(prev)
        filteredUsers.forEach((u) => next.delete(u.id))
        return next
      })
    } else {
      setSelectedUserIds((prev) => {
        const next = new Set(prev)
        filteredUsers.forEach((u) => next.add(u.id))
        return next
      })
    }
  }, [isAllSelected, filteredUsers])

  const handleClearSelection = useCallback(() => {
    setSelectedUserIds(new Set())
  }, [])

  // Single Delete Handlers
  const handleInitiateSingleDelete = useCallback((user: User) => {
    setUserToDelete(user)
    setSingleDeleteError(null)
  }, [])

  const handleConfirmSingleDelete = useCallback(async () => {
    if (!userToDelete) return
    setIsDeletingSingle(true)
    setSingleDeleteError(null)
    try {
      await userService.deleteUser(userToDelete.id)
      showToast(`User account for ${userToDelete.name} was deleted successfully.`)
      setSelectedUserIds((prev) => {
        const next = new Set(prev)
        next.delete(userToDelete.id)
        return next
      })
      setUserToDelete(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete user.'
      setSingleDeleteError(msg)
    } finally {
      setIsDeletingSingle(false)
    }
  }, [userToDelete, showToast])

  const handleCancelSingleDelete = useCallback(() => {
    setUserToDelete(null)
    setSingleDeleteError(null)
  }, [])

  // Bulk Delete Handlers
  const handleInitiateBulkDelete = useCallback(() => {
    if (selectedUserIds.size === 0) return
    setIsBulkModalOpen(true)
    setBulkDeleteError(null)
  }, [selectedUserIds.size])

  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedUserIds.size === 0) return
    setIsDeletingBulk(true)
    setBulkDeleteError(null)
    try {
      const ids = Array.from(selectedUserIds)
      const res = await userService.deleteUsers(ids)
      showToast(
        res.deletedCount === 1
          ? '1 user account deleted successfully.'
          : `${res.deletedCount} user accounts deleted successfully.`
      )
      setSelectedUserIds(new Set())
      setIsBulkModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete user accounts.'
      setBulkDeleteError(msg)
    } finally {
      setIsDeletingBulk(false)
    }
  }, [selectedUserIds, showToast])

  const handleCancelBulkDelete = useCallback(() => {
    setIsBulkModalOpen(false)
    setBulkDeleteError(null)
  }, [])

  const handleToggleActive = async (user: User) => {
    try {
      const updated = await userService.toggleUserActive(user.id, !user.active)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      showToast(`${user.name} is now ${updated.active ? 'Active' : 'Deactivated'}.`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Action failed.'
      showToast(msg)
    }
  }

  const handleCreated = (newUser: User) => {
    showToast(`Created ${newUser.role.toLowerCase()} account for ${newUser.name}.`)
    loadUsers()
  }

  // Access Denied Fallback
  if (!hasAccess) {
    return (
      <main className="user-mgmt-page access-denied-wrapper" aria-label="Access Denied">
        <div className="access-denied-card">
          <div className="access-denied-icon">🔒</div>
          <h2 className="access-denied-title">Access Denied</h2>
          <p className="access-denied-desc">
            The User Management workspace is restricted exclusively to Salon Owners.
            Your current role (<strong>{session?.role || 'Guest'}</strong>) does not have permission
            to view or modify user accounts.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="user-mgmt-page" aria-label="User Management Workspace">
      {toastMessage && (
        <div className="user-mgmt-toast" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <header className="user-mgmt-header">
        <div>
          <h1 className="user-mgmt-title">
            {session?.role === 'ADMIN' ? 'Owner Credentials & Salon Governance' : 'User Management'}
          </h1>
          <p className="user-mgmt-subtitle">
            {session?.role === 'ADMIN'
              ? `As Root Administrator (${ROOT_ADMIN_EMAIL}), you provision and govern Salon Owner accounts exclusively.`
              : 'Manage salon team accounts, specialties, active roles, and credentials.'}
          </p>
        </div>

        <button
          type="button"
          className="btn-create-employee"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>{session?.role === 'ADMIN' ? '+ Create Salon Owner' : '+ Create User'}</span>
        </button>
      </header>

      {/* Overview Stat Cards */}
      <section className="user-stats-grid" aria-label="Salon Team Statistics">
        <div className="stat-card">
          <span className="stat-label">Total Users</span>
          <span className="stat-value">{stats.total}</span>
          <span className="stat-note">Across all roles</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Employees</span>
          <span className="stat-value stat-emp">{stats.activeEmployees}</span>
          <span className="stat-note">Out of {stats.totalEmployees} registered</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Salon Owners</span>
          <span className="stat-value stat-owner">{stats.owners}</span>
          <span className="stat-note">Full administration</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Receptionists</span>
          <span className="stat-value stat-rec">{stats.receptionists}</span>
          <span className="stat-note">Front desk operations</span>
        </div>
      </section>

      {/* Controls & Filter Bar */}
      <section className="user-controls-bar" aria-label="Filter Users">
        <div className="user-search-wrap">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="search-icon">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="user-search-input"
            placeholder="Search by name, email, or specialty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="user-search-clear"
              onClick={() => setSearchQuery('')}
            >
              ✕
            </button>
          )}
        </div>

        <div className="user-filters-group">
          {/* Role Filter */}
          <div className="filter-pill-group" role="group" aria-label="Filter by role">
            <button
              type="button"
              className={`filter-pill ${roleFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setRoleFilter('ALL')}
            >
              All Roles
            </button>
            <button
              type="button"
              className={`filter-pill ${roleFilter === 'OWNER' ? 'active' : ''}`}
              onClick={() => setRoleFilter('OWNER')}
            >
              Owners ({stats.owners})
            </button>
            <button
              type="button"
              className={`filter-pill ${roleFilter === 'RECEPTIONIST' ? 'active' : ''}`}
              onClick={() => setRoleFilter('RECEPTIONIST')}
            >
              Reception ({stats.receptionists})
            </button>
            <button
              type="button"
              className={`filter-pill ${roleFilter === 'EMPLOYEE' ? 'active' : ''}`}
              onClick={() => setRoleFilter('EMPLOYEE')}
            >
              Employees ({stats.totalEmployees})
            </button>
          </div>

          {/* Specialty Filter */}
          <select
            className="specialty-dropdown"
            value={specialtyFilter}
            onChange={(e) => setSpecialtyFilter(e.target.value)}
            aria-label="Filter by specialty"
          >
            <option value="ALL">All Specialties</option>
            <option value="Hair">Hair</option>
            <option value="Skin">Skin</option>
            <option value="Nail">Nail</option>
          </select>
        </div>
      </section>

      {/* Users Table / Grid */}
      <section className="user-table-wrapper" aria-label="User Roster">
        {isLoading ? (
          <div className="user-empty-state">Loading salon team accounts...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="user-empty-state">
            <p>
              {session?.role === 'ADMIN'
                ? 'No salon owners provisioned yet. Click "+ Create Salon Owner" to provision your first Owner credentials.'
                : 'No salon team accounts found.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="user-table-desktop">
              <table className="user-table">
                <thead>
                  <tr>
                    <th className="th-checkbox">
                      <input
                        type="checkbox"
                        ref={selectAllRef}
                        className="row-select-checkbox"
                        checked={isAllSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all user accounts"
                      />
                    </th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Specialty</th>
                    <th>Status</th>
                    <th className="actions-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const isSelf = session?.userId === user.id
                    const isSelected = selectedUserIds.has(user.id)
                    const isLastOwner = user.role === 'OWNER' && stats.owners <= 1
                    const isEmployeeWithBlockingAppointments =
                      user.role === 'EMPLOYEE' &&
                      (appointmentStore.hasBlockingAppointmentsForStaff(user.id) ||
                        Boolean(user.employeeId && appointmentStore.hasBlockingAppointmentsForStaff(user.employeeId)))

                    return (
                      <tr
                        key={user.id}
                        className={`${!user.active ? 'row-inactive' : ''} ${isSelected ? 'row-selected' : ''}`}
                      >
                        <td
                          className="cell-checkbox"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="row-select-checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(user.id)}
                            disabled={user.role === 'ADMIN' || (user.role === 'OWNER' && !permissionService.canManageOwners(session))}
                            aria-label={`Select user ${user.name}`}
                          />
                        </td>

                        <td className="user-identity-cell">
                          <div className="user-avatar-circle">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="user-name-box">
                            <span className="user-row-name">
                              {user.name}
                              {user.ownerDesignation && (
                                <span className="owner-desig-tag" style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#c5a059', fontWeight: 600 }}>
                                  ({user.ownerDesignation})
                                </span>
                              )}
                              {isSelf && <span className="self-tag">(You)</span>}
                            </span>
                            <span className="user-row-email">{user.email}</span>
                          </div>
                        </td>

                        <td>
                          <span className={`role-tag role-${user.role.toLowerCase()}`}>
                            {user.role}
                          </span>
                        </td>

                        <td>
                          {user.specialty ? (
                            <span className={`specialty-tag spec-${user.specialty.toLowerCase()}`}>
                              {user.specialty}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        <td>
                          <span className={`status-pill ${user.active ? 'active' : 'inactive'}`}>
                            <span className="status-dot" />
                            {user.active ? 'Active' : 'Deactivated'}
                          </span>
                        </td>

                        <td className="actions-cell">
                          <div className="user-actions-group">
                            {user.role === 'EMPLOYEE' ? (
                              <button
                                type="button"
                                className={`btn-action-toggle ${user.active ? 'btn-deactivate' : 'btn-activate'}`}
                                onClick={() => handleToggleActive(user)}
                              >
                                {user.active ? 'Deactivate' : 'Activate'}
                              </button>
                            ) : null}

                            {user.role === 'ADMIN' ? (
                              <span
                                className="locked-action"
                                title="Root Administrator account is protected and cannot be deleted."
                              >
                                🛡️ Root Admin
                              </span>
                            ) : user.role === 'OWNER' && !permissionService.canManageOwners(session) ? (
                              <span
                                className="locked-action"
                                title="Salon Owners cannot manage or delete Owner accounts (Admin-only privilege)."
                              >
                                👑 Protected
                              </span>
                            ) : isLastOwner ? (
                              <span
                                className="locked-action"
                                title="Cannot delete the last owner account."
                              >
                                Protected
                              </span>
                            ) : isEmployeeWithBlockingAppointments ? (
                              <button
                                type="button"
                                className="btn-user-delete btn-disabled"
                                disabled
                                aria-label={`Cannot delete employee ${user.name} (upcoming or active appointment exists)`}
                                title="Cannot delete this employee because an upcoming or active appointment exists for this employee."
                              >
                                <TrashIcon size={14} />
                                <span>Delete</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-user-delete"
                                onClick={() => handleInitiateSingleDelete(user)}
                                aria-label={`Delete user ${user.name}`}
                                title={`Delete user ${user.name}`}
                              >
                                <TrashIcon size={14} />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards List View */}
            <div className="user-mobile-cards-list">
              {filteredUsers.map((user) => {
                const isSelf = session?.userId === user.id
                const isSelected = selectedUserIds.has(user.id)
                const isLastOwner = user.role === 'OWNER' && stats.owners <= 1
                const isEmployeeWithBlockingAppointments =
                  user.role === 'EMPLOYEE' &&
                  (appointmentStore.hasBlockingAppointmentsForStaff(user.id) ||
                    Boolean(user.employeeId && appointmentStore.hasBlockingAppointmentsForStaff(user.employeeId)))
                const canSelect = !(user.role === 'ADMIN' || (user.role === 'OWNER' && !permissionService.canManageOwners(session)))

                return (
                  <div
                    key={user.id}
                    className={`user-mobile-card ${!user.active ? 'card-inactive' : ''} ${isSelected ? 'card-selected' : ''}`}
                    onClick={() => canSelect && handleToggleSelect(user.id)}
                  >
                    <div className="user-card-top-row">
                      <div className="user-card-identity">
                        {canSelect && (
                          <div className="user-card-checkbox-wrap" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="row-select-checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(user.id)}
                              aria-label={`Select user ${user.name}`}
                            />
                          </div>
                        )}
                        <div className="user-avatar-circle">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="user-name-box">
                          <span className="user-row-name">
                            {user.name}
                            {user.ownerDesignation && (
                              <span className="owner-desig-tag" style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#c5a059', fontWeight: 600 }}>
                                ({user.ownerDesignation})
                              </span>
                            )}
                            {isSelf && <span className="self-tag">(You)</span>}
                          </span>
                          <span className="user-row-email">{user.email}</span>
                        </div>
                      </div>

                      <span className={`status-pill ${user.active ? 'active' : 'inactive'}`}>
                        <span className="status-dot" />
                        {user.active ? 'Active' : 'Deactivated'}
                      </span>
                    </div>

                    <div className="user-card-bottom-row">
                      <div className="user-card-badges">
                        <span className={`role-tag role-${user.role.toLowerCase()}`}>
                          {user.role}
                        </span>
                        {user.specialty && (
                          <span className={`specialty-tag spec-${user.specialty.toLowerCase()}`}>
                            {user.specialty}
                          </span>
                        )}
                      </div>

                      <div className="user-card-actions" onClick={(e) => e.stopPropagation()}>
                        {user.role === 'EMPLOYEE' ? (
                          <button
                            type="button"
                            className={`btn-action-toggle ${user.active ? 'btn-deactivate' : 'btn-activate'}`}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.active ? 'Deactivate' : 'Activate'}
                          </button>
                        ) : null}

                        {user.role === 'ADMIN' ? (
                          <span className="locked-action" title="Root Admin account is protected">🛡️ Root Admin</span>
                        ) : user.role === 'OWNER' && !permissionService.canManageOwners(session) ? (
                          <span className="locked-action" title="Protected Owner account">👑 Protected</span>
                        ) : isLastOwner ? (
                          <span className="locked-action" title="Last owner">Protected</span>
                        ) : isEmployeeWithBlockingAppointments ? (
                          <button
                            type="button"
                            className="btn-user-delete btn-disabled"
                            disabled
                            title="Cannot delete employee with active appointments"
                          >
                            <TrashIcon size={14} />
                            <span>Delete</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-user-delete"
                            onClick={() => handleInitiateSingleDelete(user)}
                            aria-label={`Delete user ${user.name}`}
                          >
                            <TrashIcon size={14} />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </section>

      {/* Create Employee Modal */}
      <CreateEmployeeModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreated}
      />

      {/* Floating Bulk Action Toolbar */}
      <BulkActionBar
        selectedCount={selectedUserIds.size}
        entityName="users"
        onDelete={handleInitiateBulkDelete}
        onClearSelection={handleClearSelection}
        disabled={isDeletingBulk}
      />

      {/* Single User Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(userToDelete)}
        title="Delete User?"
        itemName={userToDelete ? `${userToDelete.name} (${userToDelete.role})` : undefined}
        itemType="User"
        confirmButtonText="Delete"
        isDeleting={isDeletingSingle}
        error={singleDeleteError}
        onConfirm={handleConfirmSingleDelete}
        onCancel={handleCancelSingleDelete}
      />

      {/* Bulk User Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isBulkModalOpen}
        title={`Delete ${selectedUserIds.size} Users?`}
        itemCount={selectedUserIds.size}
        itemType="User"
        confirmButtonText={`Delete ${selectedUserIds.size} Users`}
        isDeleting={isDeletingBulk}
        error={bulkDeleteError}
        onConfirm={handleConfirmBulkDelete}
        onCancel={handleCancelBulkDelete}
      />
    </main>
  )
}
