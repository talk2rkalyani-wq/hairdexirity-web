import React, { useState, useEffect, useMemo } from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { appointmentStore } from '../../../services/appointmentStore'
import { appointmentService } from '../../../services/appointmentService'
import type { EnrichedAppointment } from '../../../types/models'
import type { NavId } from '../../../types/salon'
import {
  getSalonDateStr,
  formatTime12h,
  formatCurrency,
} from '../../../utils/formatters'
import { CheckoutBillingDrawer } from './components/CheckoutBillingDrawer'
import './ReceptionistCheckInOut.css'

interface ReceptionistCheckInOutViewProps {
  onNavigate: (route: NavId) => void
}

type DeskTab = 'waiting' | 'expected' | 'in_progress' | 'completed'

export const ReceptionistCheckInOutView: React.FC<ReceptionistCheckInOutViewProps> = ({ onNavigate }) => {
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<DeskTab>('waiting')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [billingAppointment, setBillingAppointment] = useState<EnrichedAppointment | null>(null)

  const todayStr = getSalonDateStr(0)

  // Load today's enriched appointments
  const refreshAppointments = async () => {
    try {
      const data = await appointmentService.getEnrichedAppointmentsForDate(todayStr, {
        ignoreScope: true, // Receptionist has salon-wide front-desk visibility
      })
      setAppointments(data)
    } catch (err: any) {
      console.error('Failed to load appointments for check-in desk:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshAppointments()

    // Subscribe to real-time changes in the appointment store
    const unsubscribe = appointmentStore.subscribe(() => {
      refreshAppointments()
    })

    return () => {
      unsubscribe()
    }
  }, [todayStr])

  // Filter queues
  const waitingQueue = useMemo(
    () => appointments.filter((a) => a.status === 'checked_in'),
    [appointments]
  )

  const inProgressQueue = useMemo(
    () => appointments.filter((a) => a.status === 'in_progress'),
    [appointments]
  )

  const expectedQueue = useMemo(
    () => appointments.filter((a) => a.status === 'confirmed' || a.status === 'scheduled'),
    [appointments]
  )

  const completedQueue = useMemo(
    () => appointments.filter((a) => a.status === 'completed'),
    [appointments]
  )

  // Filter by search query
  const filterList = (list: EnrichedAppointment[]) => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.toLowerCase()
    return list.filter((a) => {
      const cName = a.clientName || a.client?.name || ''
      const sName = a.serviceName || a.service?.name || ''
      const stName = a.staffName || a.staff?.name || ''
      const phone = a.clientPhone || a.client?.phone || ''
      return (
        cName.toLowerCase().includes(q) ||
        sName.toLowerCase().includes(q) ||
        stName.toLowerCase().includes(q) ||
        phone.includes(q)
      )
    })
  }

  // Action handlers
  const handleCheckIn = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.checkInAppointment(id)
      setActiveTab('waiting')
    } catch (err: any) {
      setActionError(err.message || 'Check-in failed')
    } finally {
      setIsProcessing(null)
    }
  }

  const handleStartService = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.startServiceAppointment(id)
      setActiveTab('in_progress')
    } catch (err: any) {
      setActionError(err.message || 'Starting service failed')
    } finally {
      setIsProcessing(null)
    }
  }

  const handleCompleteService = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.completeServiceAppointment(id)
      setActiveTab('completed')
    } catch (err: any) {
      setActionError(err.message || 'Completing service failed')
    } finally {
      setIsProcessing(null)
    }
  }

  const handleMarkNoShow = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.updateAppointmentStatus(id, 'no-show')
    } catch (err: any) {
      setActionError(err.message || 'Updating status failed')
    } finally {
      setIsProcessing(null)
    }
  }

  // Calculate wait duration helper
  const getElapsedMinutes = (isoString?: string): number => {
    if (!isoString) return 0
    const diffMs = Date.now() - new Date(isoString).getTime()
    return Math.max(0, Math.floor(diffMs / 60000))
  }

  const renderActiveList = () => {
    let list: EnrichedAppointment[] = []
    let cardType: 'card-waiting' | 'card-in-progress' | 'card-expected' | 'card-completed' = 'card-expected'

    switch (activeTab) {
      case 'waiting':
        list = waitingQueue
        cardType = 'card-waiting'
        break
      case 'in_progress':
        list = inProgressQueue
        cardType = 'card-in-progress'
        break
      case 'expected':
        list = expectedQueue
        cardType = 'card-expected'
        break
      case 'completed':
        list = completedQueue
        cardType = 'card-completed'
        break
    }

    const filtered = filterList(list)

    if (filtered.length === 0) {
      return (
        <div className="checkin-empty-queue">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="checkin-empty-title">
            {activeTab === 'waiting' && 'No clients currently waiting in the lounge'}
            {activeTab === 'in_progress' && 'No services currently active on the floor'}
            {activeTab === 'expected' && 'No pending arrivals expected right now'}
            {activeTab === 'completed' && 'No appointments completed yet today'}
          </div>
          <div className="checkin-empty-desc">
            {searchQuery
              ? `No matching appointments found for "${searchQuery}".`
              : 'Appointments will appear here automatically as clients arrive and progress through service.'}
          </div>
        </div>
      )
    }

    return (
      <div className="checkin-queue-grid">
        {filtered.map((apt) => {
          const clientName = apt.clientName || apt.client?.name || 'Guest'
          const clientPhone = apt.clientPhone || apt.client?.phone || 'No phone recorded'
          const serviceName = apt.serviceName || apt.service?.name || 'Custom Service'
          const staffName = apt.staffName || apt.staff?.name || 'Assigned Stylist'
          const duration = apt.service?.duration || 45
          const isVip = apt.client?.isVip
          const waitMins = getElapsedMinutes(apt.checkedInAt)
          const inServiceMins = getElapsedMinutes(apt.serviceStartedAt)

          return (
            <div key={apt.id} className={`checkin-item-card ${cardType}`}>
              <div className="checkin-card-header">
                <div className="checkin-client-info">
                  <div className="checkin-client-name-row">
                    <span className="checkin-client-name">{clientName}</span>
                    {isVip && <span className="checkin-vip-tag">VIP</span>}
                  </div>
                  <span className="checkin-client-phone">{clientPhone}</span>
                </div>
                <span className="checkin-time-badge">
                  {formatTime12h(apt.startTime)}
                </span>
              </div>

              {/* Status Alert Badge */}
              {activeTab === 'waiting' && (
                <div className="checkin-timer-alert timer-waiting">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>In Waiting Lounge • {waitMins > 0 ? `${waitMins}m elapsed` : 'Just checked in'}</span>
                </div>
              )}

              {activeTab === 'in_progress' && (
                <div className="checkin-timer-alert timer-inprogress">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>In Chair • {inServiceMins > 0 ? `${inServiceMins}m in service` : 'Service started'}</span>
                </div>
              )}

              <div className="checkin-card-details">
                <div className="checkin-detail-row">
                  <span className="checkin-detail-label">Service</span>
                  <span className="checkin-detail-value">{serviceName}</span>
                </div>
                <div className="checkin-detail-row">
                  <span className="checkin-detail-label">Stylist</span>
                  <span className="checkin-stylist-assigned">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="6" cy="6" r="3" />
                      <circle cx="6" cy="18" r="3" />
                      <line x1="20" y1="4" x2="8.12" y2="15.88" />
                      <line x1="14.47" y1="14.48" x2="20" y2="20" />
                      <line x1="8.12" y1="8.12" x2="12" y2="12" />
                    </svg>
                    {staffName}
                  </span>
                </div>
                <div className="checkin-detail-row">
                  <span className="checkin-detail-label">Duration & Value</span>
                  <span className="checkin-detail-value">
                    {duration} mins • {formatCurrency(apt.price)}
                  </span>
                </div>
                {apt.notes && (
                  <div className="checkin-detail-row">
                    <span className="checkin-detail-label">Notes</span>
                    <span className="checkin-detail-value" style={{ fontStyle: 'italic' }}>
                      {apt.notes}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="checkin-card-actions">
                {activeTab === 'expected' && (
                  <>
                    <button
                      type="button"
                      className="btn-checkin-primary action-checkin"
                      disabled={isProcessing === apt.id}
                      onClick={() => handleCheckIn(apt.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                        <polyline points="10 17 15 12 10 7" />
                        <line x1="15" y1="12" x2="3" y2="12" />
                      </svg>
                      {isProcessing === apt.id ? 'Checking In...' : 'Check In Client'}
                    </button>
                    <button
                      type="button"
                      className="btn-checkin-secondary"
                      onClick={() => handleMarkNoShow(apt.id)}
                    >
                      No-Show
                    </button>
                  </>
                )}

                {activeTab === 'waiting' && (
                  <>
                    <button
                      type="button"
                      className="btn-checkin-primary action-startservice"
                      disabled={isProcessing === apt.id}
                      onClick={() => handleStartService(apt.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                      {isProcessing === apt.id ? 'Seating...' : 'Seat & Start Service'}
                    </button>
                    <button
                      type="button"
                      className="btn-checkin-secondary"
                      onClick={() => handleCompleteService(apt.id)}
                    >
                      Quick Done
                    </button>
                  </>
                )}

                {activeTab === 'in_progress' && (
                  <button
                    type="button"
                    className="btn-checkin-primary action-complete"
                    disabled={isProcessing === apt.id}
                    onClick={() => setBillingAppointment(apt)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    {isProcessing === apt.id ? 'Processing...' : 'Complete & Checkout'}
                  </button>
                )}

                {activeTab === 'completed' && (
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600 }}>
                    ✓ Completed Visit
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="RECEPTIONIST"
        roleLabel="Front Desk Operations"
        title="Check-In & Check-Out Desk"
        subtitle="Live arrival reception, waiting lounge monitoring, and client checkout desk."
      />

      {actionError && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#f87171',
          fontSize: '0.85rem',
        }}>
          ⚠️ {actionError}
        </div>
      )}

      {/* KPI Metric Counter Cards */}
      <div className="checkin-kpi-bar">
        <div className="checkin-kpi-card" onClick={() => setActiveTab('waiting')} style={{ cursor: 'pointer' }}>
          <div className="checkin-kpi-icon icon-waiting">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{waitingQueue.length}</span>
            <span className="checkin-kpi-label">Waiting in Lounge</span>
          </div>
        </div>

        <div className="checkin-kpi-card" onClick={() => setActiveTab('in_progress')} style={{ cursor: 'pointer' }}>
          <div className="checkin-kpi-icon icon-in-service">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <line x1="20" y1="4" x2="8.12" y2="15.88" />
              <line x1="14.47" y1="14.48" x2="20" y2="20" />
              <line x1="8.12" y1="8.12" x2="12" y2="12" />
            </svg>
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{inProgressQueue.length}</span>
            <span className="checkin-kpi-label">In Chair / In Progress</span>
          </div>
        </div>

        <div className="checkin-kpi-card" onClick={() => setActiveTab('expected')} style={{ cursor: 'pointer' }}>
          <div className="checkin-kpi-icon icon-expected">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{expectedQueue.length}</span>
            <span className="checkin-kpi-label">Expected Today</span>
          </div>
        </div>

        <div className="checkin-kpi-card" onClick={() => setActiveTab('completed')} style={{ cursor: 'pointer' }}>
          <div className="checkin-kpi-icon icon-completed">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{completedQueue.length}</span>
            <span className="checkin-kpi-label">Completed Today</span>
          </div>
        </div>
      </div>

      {/* Toolbar: Filter Tabs + Search */}
      <div className="checkin-toolbar">
        <div className="checkin-tabs-group">
          <button
            type="button"
            className={`checkin-tab-btn ${activeTab === 'waiting' ? 'active' : ''}`}
            onClick={() => setActiveTab('waiting')}
          >
            <span>Waiting Lounge</span>
            <span className="checkin-tab-badge">{waitingQueue.length}</span>
          </button>

          <button
            type="button"
            className={`checkin-tab-btn ${activeTab === 'expected' ? 'active' : ''}`}
            onClick={() => setActiveTab('expected')}
          >
            <span>Expected Today</span>
            <span className="checkin-tab-badge">{expectedQueue.length}</span>
          </button>

          <button
            type="button"
            className={`checkin-tab-btn ${activeTab === 'in_progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('in_progress')}
          >
            <span>In Service</span>
            <span className="checkin-tab-badge">{inProgressQueue.length}</span>
          </button>

          <button
            type="button"
            className={`checkin-tab-btn ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <span>Completed</span>
            <span className="checkin-tab-badge">{completedQueue.length}</span>
          </button>
        </div>

        <div className="checkin-search-box">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="checkin-search-input"
            placeholder="Search client, stylist, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Render active queue */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          Loading front desk operational queues...
        </div>
      ) : (
        renderActiveList()
      )}

      {/* Quick Navigation to Full Calendar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button
          type="button"
          className="btn-checkin-secondary"
          onClick={() => onNavigate('receptionist/calendar')}
        >
          View Full Master Calendar →
        </button>
      </div>

      {/* Front Desk Checkout & Invoicing Drawer */}
      {billingAppointment && (
        <CheckoutBillingDrawer
          appointment={billingAppointment}
          onClose={() => setBillingAppointment(null)}
          onSuccess={() => {
            setBillingAppointment(null)
            setActiveTab('completed')
            refreshAppointments()
          }}
        />
      )}
    </div>
  )
}
