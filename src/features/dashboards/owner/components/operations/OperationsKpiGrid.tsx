// ==============================================================================
// Luma Salon — Operations Management: Zone 1 KPI Summary Grid
// ==============================================================================

import React from 'react'
import type { OperationsManagementKpis } from '../../../../../services/operationsManagementService.ts'
import {
  CalendarIcon,
  ScissorsIcon,
  ClockIcon,
  UserCheckIcon,
  CheckIcon,
  AlertTriangleIcon,
} from '../../../../../components/Icons.tsx'

interface OperationsKpiGridProps {
  kpis: OperationsManagementKpis
  onFilterExceptions?: () => void
}

export const OperationsKpiGrid: React.FC<OperationsKpiGridProps> = ({
  kpis,
  onFilterExceptions,
}) => {
  return (
    <div className="ops-kpi-grid">
      {/* 1. Today's Total Appointments */}
      <div className="ops-kpi-card">
        <div className="ops-kpi-icon icon-total">
          <CalendarIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.totalAppointmentsToday}</span>
          <span className="ops-kpi-label">Today's Workload</span>
        </div>
      </div>

      {/* 2. In Chair / Active */}
      <div className="ops-kpi-card">
        <div className="ops-kpi-icon icon-in-chair">
          <ScissorsIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.inProgressCount}</span>
          <span className="ops-kpi-label">In Chair (Active)</span>
        </div>
      </div>

      {/* 3. Waiting Lounge */}
      <div className="ops-kpi-card">
        <div className="ops-kpi-icon icon-waiting">
          <ClockIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.waitingLoungeCount}</span>
          <span className="ops-kpi-label">Waiting in Lounge</span>
        </div>
      </div>

      {/* 4. Expected Upcoming */}
      <div className="ops-kpi-card">
        <div className="ops-kpi-icon icon-expected">
          <UserCheckIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.expectedUpcomingCount}</span>
          <span className="ops-kpi-label">Expected Today</span>
        </div>
      </div>

      {/* 5. Completed Visits */}
      <div className="ops-kpi-card">
        <div className="ops-kpi-icon icon-completed">
          <CheckIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.completedCount}</span>
          <span className="ops-kpi-label">Completed Visits</span>
        </div>
      </div>

      {/* 6. Active Exceptions */}
      <div
        className="ops-kpi-card"
        onClick={onFilterExceptions}
        style={{ cursor: onFilterExceptions ? 'pointer' : 'default' }}
      >
        <div className="ops-kpi-icon icon-exceptions">
          <AlertTriangleIcon size={22} />
        </div>
        <div className="ops-kpi-content">
          <span className="ops-kpi-value">{kpis.totalExceptionsCount}</span>
          <span className="ops-kpi-label">
            {kpis.criticalExceptionsCount > 0
              ? `${kpis.criticalExceptionsCount} Critical Issues`
              : 'Operational Alerts'}
          </span>
        </div>
      </div>
    </div>
  )
}

