// ==============================================================================
// Luma Salon — Owner Operations Management View (Phase 5)
// Centralized Tactical Control Center: Exceptions, Workload & Customer Flow
// ==============================================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { DashboardHeader } from '../common/DashboardHeader.tsx'
import {
  operationsManagementService,
  type OperationsManagementData,
} from '../../../services/operationsManagementService.ts'
import { appointmentStore } from '../../../services/appointmentStore.ts'
import { staffService } from '../../../services/staffService.ts'
import { OperationsKpiGrid } from './components/operations/OperationsKpiGrid.tsx'
import { OperationsExceptionTray } from './components/operations/OperationsExceptionTray.tsx'
import { StaffWorkloadBoard } from './components/operations/StaffWorkloadBoard.tsx'
import { TodayScheduleMonitor } from './components/operations/TodayScheduleMonitor.tsx'
import { FloorInventoryAlertCard } from './components/operations/FloorInventoryAlertCard.tsx'
import {
  RefreshCwIcon,
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  PackageIcon,
  ScissorsIcon,
} from '../../../components/Icons.tsx'
import type { NavId } from '../../../types/salon.ts'
import '../common/DashboardStyles.css'
import './components/operations/OwnerOperationsManagement.css'

interface OwnerOperationsManagementViewProps {
  onNavigate: (route: NavId) => void
}

export const OwnerOperationsManagementView: React.FC<OwnerOperationsManagementViewProps> = ({
  onNavigate,
}) => {
  const [data, setData] = useState<OperationsManagementData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const exceptionTrayRef = useRef<HTMLDivElement>(null)

  const loadOperationsData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true)
    setError(null)
    try {
      const res = await operationsManagementService.getOperationsData()
      setData(res)
    } catch (err: any) {
      console.error('Failed to aggregate salon operations data:', err)
      setError(err?.message || 'Failed to aggregate real-time salon operations.')
    } finally {
      if (!isSilent) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadOperationsData()

    // 1. Reactive subscription: changes to appointments (bookings, status changes, completions)
    const unsubAppointments = appointmentStore.subscribe(() => {
      void loadOperationsData(true)
    })

    // 2. Reactive subscription: changes to staff roster
    const unsubStaff = staffService.subscribe(() => {
      void loadOperationsData(true)
    })

    // 3. Periodic clock synchronization: re-evaluate delayed arrivals & chair times every 15s
    const clockInterval = setInterval(() => {
      void loadOperationsData(true)
    }, 15000)

    return () => {
      unsubAppointments()
      unsubStaff()
      clearInterval(clockInterval)
    }
  }, [loadOperationsData])

  const scrollToExceptions = () => {
    exceptionTrayRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="dashboard-workspace-container" role="main" aria-label="Owner Operations Management">
      {/* Header */}
      <DashboardHeader
        role="OWNER"
        roleLabel="Tactical Operations Center"
        title="Operations Management"
        subtitle="Centralized operational control center for daily schedule workload, exception triage, and floor capacity."
        actions={
          <div className="dashboard-header-actions">
            {data && (
              <span className="header-timestamp">
                Synchronized: {data.lastUpdated} (IST)
              </span>
            )}
            <button
              type="button"
              className="btn-refresh-dashboard"
              onClick={() => void loadOperationsData()}
              disabled={isLoading}
              title="Refresh operational metrics"
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
            <span className="error-title">Operations Synchronization Notice</span>
            <span className="error-desc">{error}</span>
          </div>
          <button
            type="button"
            className="btn-error-retry"
            onClick={() => void loadOperationsData()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && !data && (
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
            Aggregating today's appointment flow, staff workload, and operational exceptions...
          </span>
        </div>
      )}

      {data && (
        <div className="operations-dashboard-wrap">
          {/* Zone 1: Summary KPI Grid */}
          <OperationsKpiGrid
            kpis={data.kpis}
            onFilterExceptions={scrollToExceptions}
          />

          {/* Zone 2: Operational Exception Tray */}
          <div ref={exceptionTrayRef}>
            <OperationsExceptionTray
              exceptions={data.exceptions}
              onNavigate={onNavigate}
            />
          </div>

          {/* Zone 3: Two-Column Operational Grid */}
          <div className="ops-two-col-grid">
            {/* Left: Staff Workload Board */}
            <StaffWorkloadBoard
              workload={data.staffWorkload}
              onNavigate={onNavigate}
            />

            {/* Right: Today's Schedule Monitor */}
            <TodayScheduleMonitor
              appointments={data.todayAppointments}
              onNavigate={onNavigate}
            />
          </div>

          {/* Zone 4: Floor Inventory Risks */}
          <FloorInventoryAlertCard
            floorInventoryRisks={data.floorInventoryRisks}
            onNavigate={onNavigate}
          />

          {/* Zone 5: Quick Operational Portals */}
          <div className="dashboard-content-card">
            <div className="card-header-row">
              <div className="card-title-group">
                <h3 className="card-title">Operational Navigation Portals</h3>
                <span className="card-status-badge">Direct Access</span>
              </div>
            </div>
            <p className="dashboard-page-subtitle">
              Jump straight into specialized operational modules to adjust schedules, seat clients, manage staff, or restock supplies.
            </p>

            <div className="ops-portals-grid">
              <div
                className="ops-portal-tile"
                onClick={() => onNavigate('calendar')}
                role="button"
                tabIndex={0}
              >
                <div className="quick-link-icon">
                  <CalendarIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Master Calendar</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Grid schedule & bookings</div>
                </div>
              </div>

              <div
                className="ops-portal-tile"
                onClick={() => onNavigate('receptionist/check-in')}
                role="button"
                tabIndex={0}
              >
                <div className="quick-link-icon">
                  <ClockIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Front Desk Check-In</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Waiting lounge & arrival intake</div>
                </div>
              </div>

              <div
                className="ops-portal-tile"
                onClick={() => onNavigate('staff')}
                role="button"
                tabIndex={0}
              >
                <div className="quick-link-icon">
                  <UsersIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Staff Roster</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Hours & stylist assignments</div>
                </div>
              </div>

              <div
                className="ops-portal-tile"
                onClick={() => onNavigate('inventory')}
                role="button"
                tabIndex={0}
              >
                <div className="quick-link-icon">
                  <PackageIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Product Inventory</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Stock intake & adjustments</div>
                </div>
              </div>

              <div
                className="ops-portal-tile"
                onClick={() => onNavigate('services')}
                role="button"
                tabIndex={0}
              >
                <div className="quick-link-icon">
                  <ScissorsIcon size={20} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>Services Catalog</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Menu, durations & pricing</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
