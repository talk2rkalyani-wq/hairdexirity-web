// ==============================================================================
// Luma Salon — Owner Live Operations Dashboard View (Phase 3)
// Real-Time Employee Monitoring, Availability & Salon Floor Visibility
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '../common/DashboardHeader.tsx'
import { LiveStatusSummaryCards } from './components/LiveStatusSummaryCards.tsx'
import { EmployeeStatusBoard } from './components/EmployeeStatusBoard.tsx'
import { EmployeeDetailDrawer } from './components/EmployeeDetailDrawer.tsx'
import {
  liveOperationsService,
  type LiveOperationsSummary,
  type EmployeeOperationalStatus,
  type StaffLiveStatus,
} from '../../../services/liveOperationsService.ts'
import { appointmentStore } from '../../../services/appointmentStore.ts'
import { staffService } from '../../../services/staffService.ts'
import { RefreshCwIcon } from '../../../components/Icons.tsx'
import type { NavId } from '../../../types/salon.ts'
import '../common/DashboardStyles.css'
import './components/LiveOperationsStyles.css'

interface OwnerLiveOperationsViewProps {
  onNavigate: (route: NavId) => void
}

export const OwnerLiveOperationsView: React.FC<OwnerLiveOperationsViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  const [summary, setSummary] = useState<LiveOperationsSummary | null>(null)
  const [activeFilter, setActiveFilter] = useState<EmployeeOperationalStatus | 'ALL'>('ALL')
  const [selectedStaffStatus, setSelectedStaffStatus] = useState<StaffLiveStatus | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Fetch live operations status
  const loadLiveOperations = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true)
    setError(null)
    try {
      const data = await liveOperationsService.getLiveOperationsSummary()
      setSummary(data)

      // If drawer is open, keep selected staff status updated
      setSelectedStaffStatus((prev) => {
        if (!prev) return null
        const found = data.statuses.find((s) => s.staff.id === prev.staff.id)
        return found || null
      })
    } catch (err: any) {
      console.error('Failed to load Live Operations workforce data:', err)
      setError(err?.message || 'Failed to aggregate real-time workforce metrics.')
    } finally {
      if (!isSilent) setIsLoading(false)
    }
  }, [])

  // Initial fetch, store subscriptions & interval clock synchronization
  useEffect(() => {
    void loadLiveOperations()

    // 1. Reactive subscription: changes to appointments (bookings, completions, cancellations)
    const unsubAppointments = appointmentStore.subscribe(() => {
      void loadLiveOperations(true)
    })

    // 2. Reactive subscription: changes to staff profiles or roster
    const unsubStaff = staffService.subscribe(() => {
      void loadLiveOperations(true)
    })

    // 3. Periodic clock synchronization: evaluate appointment start/end and shift transitions every 15s
    const clockInterval = setInterval(() => {
      void loadLiveOperations(true)
    }, 15000)

    return () => {
      unsubAppointments()
      unsubStaff()
      clearInterval(clockInterval)
    }
  }, [loadLiveOperations])

  const handleSelectFilter = (newFilter: EmployeeOperationalStatus | 'ALL') => {
    // If clicking same active filter, toggle back to 'ALL'
    if (activeFilter === newFilter && newFilter !== 'ALL') {
      setActiveFilter('ALL')
    } else {
      setActiveFilter(newFilter)
    }
  }

  return (
    <div className="dashboard-workspace-container" role="main" aria-label="Owner Live Operations">
      {/* 1. Header with Live Status & Manual Refresh */}
      <DashboardHeader
        role="OWNER"
        roleLabel="Live Floor Workspace"
        title="Live Operations"
        subtitle="Real-time workforce monitoring, chair engagement, and salon floor stylist availability."
        actions={
          <div className="dashboard-header-actions">
            {summary && (
              <span className="header-timestamp">
                Synchronized: {summary.lastUpdated} (IST)
              </span>
            )}
            <button
              type="button"
              className="btn-refresh-dashboard"
              onClick={() => void loadLiveOperations()}
              disabled={isLoading}
              title="Refresh workforce status from live database"
            >
              <RefreshCwIcon size={14} className={isLoading ? 'btn-spinner' : ''} />
              <span>{isLoading ? 'Synchronizing...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* Error Banner */}
      {error && (
        <div className="dashboard-error-banner" role="alert">
          <div className="error-text-wrap">
            <span className="error-title">Workforce Synchronization Warning</span>
            <span className="error-desc">{error}</span>
          </div>
          <button
            type="button"
            className="btn-error-retry"
            onClick={() => void loadLiveOperations()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && !summary && (
        <div className="dashboard-loading-container">
          <div
            className="btn-spinner"
            style={{
              width: '36px',
              height: '36px',
              borderColor: 'rgba(197, 160, 89, 0.2)',
              borderTopColor: '#d4af37',
            }}
          />
          <span className="text-muted" style={{ fontSize: '0.875rem' }}>
            Determining real-time salon floor operational states...
          </span>
        </div>
      )}

      {/* Summary Cards and Employee Board */}
      {summary && (
        <>
          {/* 2. Status Summary Cards */}
          <LiveStatusSummaryCards
            totalEmployees={summary.totalEmployees}
            availableCount={summary.availableCount}
            busyCount={summary.busyCount}
            onBreakCount={summary.onBreakCount}
            onLeaveCount={summary.onLeaveCount}
            offShiftCount={summary.offShiftCount}
            unknownCount={summary.unknownCount}
            activeFilter={activeFilter}
            onSelectFilter={handleSelectFilter}
          />

          {/* 3. Employee Floor Status Board */}
          <EmployeeStatusBoard
            statuses={summary.statuses}
            activeStatusFilter={activeFilter}
            onStatusFilterChange={setActiveFilter}
            onSelectEmployee={setSelectedStaffStatus}
          />
        </>
      )}

      {/* 4. Individual Employee Detail Drawer */}
      <EmployeeDetailDrawer
        staffStatus={selectedStaffStatus}
        onClose={() => setSelectedStaffStatus(null)}
      />
    </div>
  )
}
