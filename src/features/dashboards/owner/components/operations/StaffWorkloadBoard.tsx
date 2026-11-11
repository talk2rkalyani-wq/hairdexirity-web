// ==============================================================================
// Luma Salon — Operations Management: Zone 3 Left Staff Workload Board
// ==============================================================================

import React, { useState } from 'react'
import type {
  StaffWorkloadSummary,
  WorkloadTier,
} from '../../../../../services/operationsManagementService.ts'
import type { NavId } from '../../../../../types/salon.ts'
import { UsersIcon } from '../../../../../components/Icons.tsx'

interface StaffWorkloadBoardProps {
  workload: StaffWorkloadSummary[]
  onNavigate: (route: NavId) => void
}

export const StaffWorkloadBoard: React.FC<StaffWorkloadBoardProps> = ({
  workload,
  onNavigate,
}) => {
  const [selectedTier, setSelectedTier] = useState<'ALL' | WorkloadTier>('ALL')

  const filteredWorkload = workload.filter((w) => {
    if (selectedTier === 'ALL') return true
    return w.workloadTier === selectedTier
  })

  const overbookedCount = workload.filter((w) => w.workloadTier === 'OVERBOOKED').length
  const optimalCount = workload.filter((w) => w.workloadTier === 'OPTIMAL').length
  const lightCount = workload.filter((w) => w.workloadTier === 'LIGHT').length
  const idleCount = workload.filter((w) => w.workloadTier === 'IDLE').length

  const getTierClass = (tier: WorkloadTier) => {
    switch (tier) {
      case 'OVERBOOKED':
        return 'tier-overbooked'
      case 'OPTIMAL':
        return 'tier-optimal'
      case 'LIGHT':
        return 'tier-light'
      case 'IDLE':
        return 'tier-idle'
    }
  }

  const getFillClass = (tier: WorkloadTier) => {
    switch (tier) {
      case 'OVERBOOKED':
        return 'fill-overbooked'
      case 'OPTIMAL':
        return 'fill-optimal'
      case 'LIGHT':
        return 'fill-light'
      case 'IDLE':
        return 'fill-idle'
    }
  }

  return (
    <div className="workload-card">
      {/* Header */}
      <div className="workload-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <UsersIcon size={18} />
          <h3 className="workload-title">Staff Workload & Capacity</h3>
        </div>
        <button
          type="button"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
          onClick={() => onNavigate('staff')}
        >
          Manage Staff Roster →
        </button>
      </div>

      {/* Tier Filter Pills */}
      <div className="ops-filter-pills" style={{ alignSelf: 'flex-start' }}>
        <button
          type="button"
          className={`ops-filter-pill-btn ${selectedTier === 'ALL' ? 'active' : ''}`}
          onClick={() => setSelectedTier('ALL')}
        >
          All on Shift ({workload.length})
        </button>
        {overbookedCount > 0 && (
          <button
            type="button"
            className={`ops-filter-pill-btn ${selectedTier === 'OVERBOOKED' ? 'active' : ''}`}
            onClick={() => setSelectedTier('OVERBOOKED')}
            style={{ color: '#f87171' }}
          >
            Overbooked ({overbookedCount})
          </button>
        )}
        <button
          type="button"
          className={`ops-filter-pill-btn ${selectedTier === 'OPTIMAL' ? 'active' : ''}`}
          onClick={() => setSelectedTier('OPTIMAL')}
        >
          Optimal ({optimalCount})
        </button>
        <button
          type="button"
          className={`ops-filter-pill-btn ${selectedTier === 'LIGHT' ? 'active' : ''}`}
          onClick={() => setSelectedTier('LIGHT')}
        >
          Light ({lightCount})
        </button>
        {idleCount > 0 && (
          <button
            type="button"
            className={`ops-filter-pill-btn ${selectedTier === 'IDLE' ? 'active' : ''}`}
            onClick={() => setSelectedTier('IDLE')}
          >
            Idle / Walk-ins ({idleCount})
          </button>
        )}
      </div>

      {/* Workload List */}
      <div className="workload-list">
        {filteredWorkload.length === 0 ? (
          <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.82rem', fontStyle: 'italic' }}>
            No staff matching filter "{selectedTier}".
          </div>
        ) : (
          filteredWorkload.map((item) => (
            <div key={item.staffId} className="workload-row">
              <div className="workload-row-top">
                <div className="workload-staff-info">
                  <span className="workload-staff-name">{item.staffName}</span>
                  <span className="workload-staff-specialty">
                    • {item.jobTitle || item.specialty}
                  </span>
                </div>
                <span className={`workload-tier-badge ${getTierClass(item.workloadTier)}`}>
                  {item.workloadTier}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="workload-progress-track">
                <div
                  className={`workload-progress-fill ${getFillClass(item.workloadTier)}`}
                  style={{ width: `${item.utilizationPercentage}%` }}
                />
              </div>

              <div className="workload-row-stats">
                <span>
                  Shift: {item.shiftHours.open} - {item.shiftHours.close}
                </span>
                <span>
                  {item.totalAppointmentsToday} bookings • {item.totalBookedMins}m booked ({item.utilizationPercentage}%)
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

