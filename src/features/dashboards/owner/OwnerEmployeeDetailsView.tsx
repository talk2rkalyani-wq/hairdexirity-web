// ==============================================================================
// Luma Salon — Owner Individual Employee Details Workspace (Phase 6)
// Deep-Dive Stylist Performance, Service Value Metrics, Workload & Verified Lifecycle
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { NavId } from '../../../types/salon.ts'
import type { Staff } from '../../../types/models.ts'
import {
  employeePerformanceService,
  type EmployeeTimeRangePreset,
  type EmployeePerformanceReport,
} from '../../../services/employeePerformanceService.ts'
import { liveOperationsService, type StaffLiveStatus } from '../../../services/liveOperationsService.ts'
import { appointmentStore } from '../../../services/appointmentStore.ts'
import { DashboardHeader } from '../common/DashboardHeader.tsx'
import { EmployeeSelectorBar } from './components/employees/EmployeeSelectorBar.tsx'
import { EmployeeProfileCard } from './components/employees/EmployeeProfileCard.tsx'
import { EmployeePerformanceKpiGrid } from './components/employees/EmployeePerformanceKpiGrid.tsx'
import { EmployeeWorkloadSection } from './components/employees/EmployeeWorkloadSection.tsx'
import { EmployeeAppointmentTable } from './components/employees/EmployeeAppointmentTable.tsx'
import { CalendarIcon, RefreshCwIcon } from '../../../components/Icons.tsx'
import './components/employees/EmployeeDetails.css'
import '../common/DashboardStyles.css'

interface OwnerEmployeeDetailsViewProps {
  onNavigate: (route: NavId) => void
  initialStaffId?: string
}

const PRESET_OPTIONS: { id: EmployeeTimeRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'all_time', label: 'All Time' },
]

export const OwnerEmployeeDetailsView: React.FC<OwnerEmployeeDetailsViewProps> = ({
  onNavigate,
  initialStaffId,
}) => {
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<string>('')
  const [timePreset, setTimePreset] = useState<EmployeeTimeRangePreset>('today')
  const [report, setReport] = useState<EmployeePerformanceReport | null>(null)
  const [liveStatusMap, setLiveStatusMap] = useState<Map<string, StaffLiveStatus>>(new Map())
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // 1. Initial Load: Retrieve Staff Roster & URL Params
  useEffect(() => {
    let isMounted = true

    const initializeRoster = async () => {
      try {
        setIsLoading(true)
        const staff = await employeePerformanceService.getStaffList()
        if (!isMounted) return
        setStaffList(staff)

        // Check for deep-linking URL parameter: ?staffId=xxx or prop
        let targetId = initialStaffId
        if (!targetId && typeof window !== 'undefined') {
          const hashOrSearch = window.location.hash || window.location.search
          const match = hashOrSearch.match(/[?&]staffId=([^&]+)/)
          if (match && match[1]) {
            targetId = decodeURIComponent(match[1])
          }
        }

        // If target exists in roster, select it; otherwise default to first active senior/master stylist
        if (targetId && staff.some((s) => s.id === targetId)) {
          setSelectedStaffId(targetId)
        } else {
          const firstCandidate = staff.find((s) => s.active && s.role !== 'owner') || staff[0]
          if (firstCandidate) setSelectedStaffId(firstCandidate.id)
        }

        // Load live operations status map for selector indicators
        try {
          const liveSummary = await liveOperationsService.getLiveOperationsSummary()
          const map = new Map<string, StaffLiveStatus>()
          liveSummary.statuses.forEach((st) => map.set(st.staff.id, st))
          setLiveStatusMap(map)
        } catch (err) {
          console.warn('Failed to load live status map:', err)
        }
      } catch (err) {
        console.error('Failed to load staff roster for employee details:', err)
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    initializeRoster()

    return () => {
      isMounted = false
    }
  }, [initialStaffId])

  // 2. Fetch Employee Performance Report on Staff or Preset Change
  const loadReport = useCallback(async () => {
    if (!selectedStaffId) return
    try {
      const data = await employeePerformanceService.getEmployeeReport(
        selectedStaffId,
        timePreset
      )
      setReport(data)
    } catch (err) {
      console.error('Failed to generate employee report:', err)
    }
  }, [selectedStaffId, timePreset])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  // 3. Listen to reactive updates in appointment store (e.g. check-ins, completions)
  useEffect(() => {
    const unsubscribe = appointmentStore.subscribe(() => {
      loadReport()
    })
    return () => {
      unsubscribe()
    }
  }, [loadReport])

  const selectedStaff = useMemo(() => {
    return staffList.find((s) => s.id === selectedStaffId) || null
  }, [staffList, selectedStaffId])

  return (
    <div className="dashboard-workspace-container employee-details-workspace">
      {/* Workspace Header */}
      <DashboardHeader
        role="OWNER"
        roleLabel="Owner Workspace"
        title="Stylist Performance & Workload Analytics"
        subtitle="Individual stylist productivity, completed service values, appointment history, and chair floor utilization."
        actions={
          <button
            type="button"
            className="header-refresh-btn"
            onClick={loadReport}
            title="Refresh analytics data"
          >
            <RefreshCwIcon size={14} className={isLoading ? 'spin-icon' : ''} />
            <span>{report?.selectedRange?.label || 'Today'}</span>
          </button>
        }
      />

      {isLoading && !report && (
        <div className="employee-loading-box">
          <RefreshCwIcon size={24} className="spin-icon" />
          <span>Loading stylist analytics...</span>
        </div>
      )}

      {/* 1. Stylist Selector & Fast Switcher */}
      <EmployeeSelectorBar
        staffList={staffList}
        selectedStaffId={selectedStaffId}
        onSelectStaff={(id) => setSelectedStaffId(id)}
        liveStatusMap={liveStatusMap}
      />

      {/* 2. Stylist Profile Header Card */}
      {selectedStaff && (
        <EmployeeProfileCard
          staff={selectedStaff}
          liveStatus={report?.liveStatus || null}
          onNavigate={onNavigate}
        />
      )}

      {/* 3. Time Range Preset Pills Bar */}
      <div className="employee-time-filter-row">
        <div className="time-filter-pills-group">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`time-filter-pill ${timePreset === opt.id ? 'active' : ''}`}
              onClick={() => setTimePreset(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {report && (
          <div className="active-range-indicator">
            <CalendarIcon size={14} />
            <span>
              {report.selectedRange.startDate === report.selectedRange.endDate
                ? report.selectedRange.startDate
                : `${report.selectedRange.startDate} to ${report.selectedRange.endDate}`}
            </span>
          </div>
        )}
      </div>

      {/* 4. Performance & Productivity KPI Grid */}
      {report && <EmployeePerformanceKpiGrid kpis={report.kpis} />}

      {/* 5. Workload Visualizations & Service Categories */}
      {report && (
        <EmployeeWorkloadSection
          dailyTrends={report.dailyTrends}
          categoryBreakdown={report.categoryBreakdown}
          hourlyDistribution={report.hourlyDistribution}
        />
      )}

      {/* 6. Historical & Upcoming Appointment Ledger Table with Lifecycle Inspector */}
      {report && selectedStaff && (
        <EmployeeAppointmentTable
          appointments={report.appointments}
          stylistName={selectedStaff.name}
        />
      )}
    </div>
  )
}
