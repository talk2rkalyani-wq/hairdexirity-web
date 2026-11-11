// ==============================================================================
// Luma Salon — Operations Management: Zone 3 Right Today's Schedule Monitor
// ==============================================================================

import React, { useState } from 'react'
import type { Appointment } from '../../../../../types/models.ts'
import type { NavId } from '../../../../../types/salon.ts'
import { CalendarIcon, SearchIcon } from '../../../../../components/Icons.tsx'
import { formatTime12h, formatCurrency } from '../../../../../utils/formatters.ts'

interface TodayScheduleMonitorProps {
  appointments: Appointment[]
  onNavigate: (route: NavId) => void
}

type ScheduleTab = 'active_waiting' | 'upcoming' | 'completed'

export const TodayScheduleMonitor: React.FC<TodayScheduleMonitorProps> = ({
  appointments,
  onNavigate,
}) => {
  const [activeTab, setActiveTab] = useState<ScheduleTab>('active_waiting')
  const [searchQuery, setSearchQuery] = useState('')

  const activeWaitingList = appointments.filter(
    (a) => a.status === 'in_progress' || a.status === 'checked_in'
  )
  const upcomingList = appointments.filter(
    (a) => a.status === 'confirmed' || a.status === 'scheduled'
  )
  const completedList = appointments.filter((a) => a.status === 'completed')

  const getCurrentList = () => {
    switch (activeTab) {
      case 'active_waiting':
        return activeWaitingList
      case 'upcoming':
        return upcomingList
      case 'completed':
        return completedList
    }
  }

  const filteredList = getCurrentList().filter((a) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (a.clientName && a.clientName.toLowerCase().includes(q)) ||
      (a.serviceName && a.serviceName.toLowerCase().includes(q)) ||
      (a.staffName && a.staffName.toLowerCase().includes(q))
    )
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return { label: 'In Chair', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' }
      case 'checked_in':
        return { label: 'Waiting', color: '#fde047', bg: 'rgba(234, 179, 8, 0.15)' }
      case 'confirmed':
        return { label: 'Confirmed', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)' }
      case 'scheduled':
        return { label: 'Scheduled', color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.15)' }
      case 'completed':
        return { label: 'Completed', color: '#34d399', bg: 'rgba(16, 185, 129, 0.15)' }
      default:
        return { label: status, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' }
    }
  }

  return (
    <div className="sched-monitor-card">
      {/* Header */}
      <div className="sched-monitor-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <CalendarIcon size={18} />
          <h3 className="workload-title">Today's Appointment Schedule</h3>
        </div>

        {/* Tab Selection */}
        <div className="sched-tabs-group">
          <button
            type="button"
            className={`sched-tab-btn ${activeTab === 'active_waiting' ? 'active' : ''}`}
            onClick={() => setActiveTab('active_waiting')}
          >
            Active & Waiting ({activeWaitingList.length})
          </button>
          <button
            type="button"
            className={`sched-tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`}
            onClick={() => setActiveTab('upcoming')}
          >
            Upcoming ({upcomingList.length})
          </button>
          <button
            type="button"
            className={`sched-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            Done ({completedList.length})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '8px',
        padding: '6px 12px',
      }}>
        <SearchIcon size={14} className="text-muted" />
        <input
          type="text"
          placeholder="Filter today's bookings by client, stylist, or service..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f8fafc',
            fontSize: '0.82rem',
            width: '100%',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            &times;
          </button>
        )}
      </div>

      {/* Schedule Items List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '380px', overflowY: 'auto' }}>
        {filteredList.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            {searchQuery
              ? `No bookings match "${searchQuery}".`
              : activeTab === 'active_waiting'
              ? 'No appointments currently active in chairs or waiting in lounge.'
              : activeTab === 'upcoming'
              ? 'No further upcoming bookings scheduled for today.'
              : 'No appointments completed yet today.'}
          </div>
        ) : (
          filteredList.map((apt) => {
            const badge = getStatusBadge(apt.status)
            return (
              <div key={apt.id} className="sched-item-row">
                <div className="sched-item-left">
                  <span className="sched-time-pill">
                    {formatTime12h(apt.startTime)}
                  </span>
                  <div className="sched-item-info">
                    <span className="sched-client-name">
                      {apt.clientName || 'Guest'}
                    </span>
                    <span className="sched-service-info">
                      {apt.serviceName || 'Service'} with {apt.staffName || 'Stylist'} • {formatCurrency(apt.price)}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      color: badge.color,
                      background: badge.bg,
                    }}
                  >
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#cbd5e1',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => onNavigate('calendar')}
                  >
                    Calendar →
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

