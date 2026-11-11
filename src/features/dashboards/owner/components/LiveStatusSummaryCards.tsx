// ==============================================================================
// Luma Salon — Live Operations Summary Cards (Phase 3)
// Real-Time Workforce Status Counts & Interactive Filter Triggers
// ==============================================================================

import React from 'react'
import type { EmployeeOperationalStatus } from '../../../../services/liveOperationsService.ts'
import {
  UsersIcon,
  CheckCircleIcon,
  ScissorsIcon,
  CoffeeIcon,
  CalendarIcon,
  ClockIcon,
  InfoIcon,
} from '../../../../components/Icons.tsx'

interface LiveStatusSummaryCardsProps {
  totalEmployees: number
  availableCount: number
  busyCount: number
  onBreakCount: number
  onLeaveCount: number
  offShiftCount: number
  unknownCount: number
  activeFilter: EmployeeOperationalStatus | 'ALL'
  onSelectFilter: (status: EmployeeOperationalStatus | 'ALL') => void
}

export const LiveStatusSummaryCards: React.FC<LiveStatusSummaryCardsProps> = ({
  totalEmployees,
  availableCount,
  busyCount,
  onBreakCount,
  onLeaveCount,
  offShiftCount,
  unknownCount,
  activeFilter,
  onSelectFilter,
}) => {
  const cards: {
    id: EmployeeOperationalStatus | 'ALL'
    label: string
    count: number
    icon: React.ReactNode
    accentClass: string
    subtext?: string
  }[] = [
    {
      id: 'ALL',
      label: 'Total Staff',
      count: totalEmployees,
      icon: <UsersIcon size={18} />,
      accentClass: 'accent-white',
      subtext: 'Authorized roster',
    },
    {
      id: 'AVAILABLE',
      label: 'Available',
      count: availableCount,
      icon: <CheckCircleIcon size={18} />,
      accentClass: 'accent-emerald',
      subtext: 'Ready on floor',
    },
    {
      id: 'BUSY',
      label: 'With Customer',
      count: busyCount,
      icon: <ScissorsIcon size={18} />,
      accentClass: 'accent-purple',
      subtext: 'Service in progress',
    },
    {
      id: 'ON_BREAK',
      label: 'On Break',
      count: onBreakCount,
      icon: <CoffeeIcon size={18} />,
      accentClass: 'accent-amber',
      subtext: 'Break ledger pending',
    },
    {
      id: 'ON_LEAVE',
      label: 'On Leave',
      count: onLeaveCount,
      icon: <CalendarIcon size={18} />,
      accentClass: 'accent-blue',
      subtext: 'Leave ledger pending',
    },
    {
      id: 'OFF_SHIFT',
      label: 'Off Shift',
      count: offShiftCount,
      icon: <ClockIcon size={18} />,
      accentClass: 'accent-slate',
      subtext: 'Off duty / scheduled off',
    },
  ]

  if (unknownCount > 0) {
    cards.push({
      id: 'UNKNOWN',
      label: 'Status Unknown',
      count: unknownCount,
      icon: <InfoIcon size={18} />,
      accentClass: 'accent-rose',
      subtext: 'Data unavailable',
    })
  }

  return (
    <div
      className="live-summary-cards-grid"
      role="region"
      aria-label="Staff Status Summary Counts"
    >
      {cards.map((card) => {
        const isSelected = activeFilter === card.id
        return (
          <button
            key={card.id}
            type="button"
            className={`live-summary-card ${card.accentClass} ${isSelected ? 'active-filter' : ''}`}
            onClick={() => onSelectFilter(card.id)}
            title={`Click to filter staff by ${card.label}`}
            aria-pressed={isSelected}
          >
            <div className="summary-card-top">
              <span className="summary-card-label">{card.label}</span>
              <div className="summary-card-icon">{card.icon}</div>
            </div>
            <div className="summary-card-metric-row">
              <span className="summary-card-count">{card.count}</span>
            </div>
            {card.subtext && (
              <span className="summary-card-subtext">{card.subtext}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

