import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { appointmentStore } from '../../../services/appointmentStore'
import { appointmentService } from '../../../services/appointmentService'
import { staffService } from '../../../services/staffService'
import type { EnrichedAppointment, Staff } from '../../../types/models'
import type { NavId } from '../../../types/salon'
import {
  getSalonDateStr,
  formatTime12h,
  formatCurrency,
} from '../../../utils/formatters'
import {
  CalendarPlusIcon,
  UsersIcon,
  UserCheckIcon,
  ClockIcon,
  ScissorsIcon,
  CalendarIcon,
  RefreshCwIcon,
} from '../../../components/Icons'
import { AppointmentFormModal } from '../../calendar/components/AppointmentFormModal'
import { WalkInIntakeModal } from './components/WalkInIntakeModal'
import { CheckoutBillingDrawer } from './components/CheckoutBillingDrawer'
import './ReceptionistCheckInOut.css'
import './ReceptionistFrontDeskView.css'

interface ReceptionistFrontDeskViewProps {
  receptionistName: string
  onNavigate: (route: NavId) => void
}

type DeskTab = 'waiting' | 'in_progress' | 'expected' | 'completed'

export const ReceptionistFrontDeskView: React.FC<ReceptionistFrontDeskViewProps> = ({
  receptionistName,
  onNavigate,
}) => {
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<DeskTab>('waiting')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStylistFilter, setSelectedStylistFilter] = useState('ALL')
  const [actionError, setActionError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)

  // Modals & Drawers
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false)
  const [billingAppointment, setBillingAppointment] = useState<EnrichedAppointment | null>(null)

  const todayStr = getSalonDateStr(0)

  // Load today's enriched appointments
  const refreshAppointments = useCallback(async () => {
    try {
      setLoading(true)
      const [aptData, staffData] = await Promise.all([
        appointmentService.getEnrichedAppointmentsForDate(todayStr, {
          ignoreScope: true, // Receptionist has salon-wide front-desk visibility
        }),
        staffService.getStaff(),
      ])
      setAppointments(aptData)
      setStaffList(staffData.filter((s) => s.active))
    } catch (err: any) {
      console.error('Failed to load appointments for front desk:', err)
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  useEffect(() => {
    refreshAppointments()

    // Subscribe to real-time changes in the appointment store
    const unsubscribe = appointmentStore.subscribe(() => {
      refreshAppointments()
    })

    return () => {
      unsubscribe()
    }
  }, [refreshAppointments])

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

  // Filter queue by search query
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

  // Filter full schedule timeline by stylist
  const filteredSchedule = useMemo(() => {
    let list = [...appointments].sort((a, b) => a.startTime.localeCompare(b.startTime))
    if (selectedStylistFilter !== 'ALL') {
      list = list.filter((a) => a.staffId === selectedStylistFilter)
    }
    return list
  }, [appointments, selectedStylistFilter])

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
                    <ScissorsIcon size={12} />
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
    <div className="dashboard-workspace-container receptionist-dashboard-container">
      {/* Dashboard Top Header */}
      <DashboardHeader
        role="RECEPTIONIST"
        roleLabel="Front Desk Command Center"
        title="Front Desk Dashboard"
        subtitle={`Welcome, ${receptionistName}. Complete front desk operations: client check-in, lounge queue, bookings, and checkout billing.`}
      />

      {/* Action Header Bar */}
      <div className="receptionist-header-actions">
        <button
          type="button"
          className="rec-btn rec-btn-primary"
          onClick={() => setIsBookingModalOpen(true)}
        >
          <CalendarPlusIcon size={18} />
          <span>+ New Booking</span>
        </button>

        <button
          type="button"
          className="rec-btn rec-btn-walkin"
          onClick={() => setIsWalkInModalOpen(true)}
        >
          <UsersIcon size={18} />
          <span>+ Quick Walk-In</span>
        </button>

        <button
          type="button"
          className="rec-btn rec-btn-secondary"
          onClick={() => onNavigate('billing/new')}
        >
          <ScissorsIcon size={16} />
          <span>Collect Payment / POS</span>
        </button>

        <button
          type="button"
          className="rec-btn rec-btn-secondary"
          onClick={() => onNavigate('calendar')}
        >
          <CalendarIcon size={16} />
          <span>Calendar View</span>
        </button>

        <button
          type="button"
          className="rec-btn rec-btn-refresh"
          onClick={refreshAppointments}
          title="Refresh real-time data"
        >
          <RefreshCwIcon size={16} />
        </button>
      </div>

      {actionError && (
        <div style={{
          padding: '0.75rem 1rem',
          borderRadius: '8px',
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          color: '#f87171',
          fontSize: '0.85rem',
        }}>
          {actionError}
        </div>
      )}

      {/* SECTION 1: LIVE OPERATIONAL STATS KPI BAR */}
      <div className="checkin-kpi-bar">
        <div
          className={`checkin-kpi-card ${activeTab === 'waiting' ? 'active-kpi' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('waiting')}
        >
          <div className="checkin-kpi-icon icon-waiting">
            <ClockIcon size={22} />
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{waitingQueue.length}</span>
            <span className="checkin-kpi-label">Waiting in Lounge</span>
          </div>
        </div>

        <div
          className={`checkin-kpi-card ${activeTab === 'in_progress' ? 'active-kpi' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('in_progress')}
        >
          <div className="checkin-kpi-icon icon-in-service">
            <ScissorsIcon size={22} />
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{inProgressQueue.length}</span>
            <span className="checkin-kpi-label">In Chair / In Progress</span>
          </div>
        </div>

        <div
          className={`checkin-kpi-card ${activeTab === 'expected' ? 'active-kpi' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('expected')}
        >
          <div className="checkin-kpi-icon icon-expected">
            <CalendarIcon size={22} />
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{expectedQueue.length}</span>
            <span className="checkin-kpi-label">Expected Arrivals</span>
          </div>
        </div>

        <div
          className={`checkin-kpi-card ${activeTab === 'completed' ? 'active-kpi' : ''}`}
          style={{ cursor: 'pointer' }}
          onClick={() => setActiveTab('completed')}
        >
          <div className="checkin-kpi-icon icon-completed">
            <UserCheckIcon size={22} />
          </div>
          <div className="checkin-kpi-content">
            <span className="checkin-kpi-value">{completedQueue.length}</span>
            <span className="checkin-kpi-label">Completed Today</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: LIVE GUEST DESK & QUEUE MANAGEMENT */}
      <div className="receptionist-section-block">
        <div className="receptionist-section-header">
          <div className="receptionist-section-title-wrap">
            <div className="section-icon-badge badge-desk">
              <UserCheckIcon size={20} />
            </div>
            <div>
              <h2 className="receptionist-section-title">Live Guest Desk & Queue Management</h2>
              <p className="receptionist-section-subtitle">
                Monitor waiting arrivals, seat clients with stylists, and complete billing.
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar & Queue Selector Tabs */}
        <div className="checkin-toolbar">
          <div className="checkin-tabs-group" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'waiting'}
              className={`checkin-tab-btn ${activeTab === 'waiting' ? 'active tab-waiting' : ''}`}
              onClick={() => setActiveTab('waiting')}
            >
              Waiting Lounge
              <span className="tab-count-chip">{waitingQueue.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'in_progress'}
              className={`checkin-tab-btn ${activeTab === 'in_progress' ? 'active tab-in-service' : ''}`}
              onClick={() => setActiveTab('in_progress')}
            >
              In Chair / In Service
              <span className="tab-count-chip">{inProgressQueue.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'expected'}
              className={`checkin-tab-btn ${activeTab === 'expected' ? 'active tab-expected' : ''}`}
              onClick={() => setActiveTab('expected')}
            >
              Expected Arrivals
              <span className="tab-count-chip">{expectedQueue.length}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'completed'}
              className={`checkin-tab-btn ${activeTab === 'completed' ? 'active tab-completed' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed Today
              <span className="tab-count-chip">{completedQueue.length}</span>
            </button>
          </div>

          <div className="checkin-search-wrap">
            <input
              type="text"
              className="checkin-search-input"
              placeholder="Search guest, stylist, service..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search appointments in queue"
            />
          </div>
        </div>

        {/* Queue Cards List */}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Loading front desk queue...
          </div>
        ) : (
          renderActiveList()
        )}
      </div>

      {/* SECTION 3: TODAY'S SCHEDULE & STYLIST TIMELINE */}
      <div className="receptionist-section-block">
        <div className="receptionist-section-header">
          <div className="receptionist-section-title-wrap">
            <div className="section-icon-badge badge-schedule">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h2 className="receptionist-section-title">Today's Appointment Schedule</h2>
              <p className="receptionist-section-subtitle">
                Chronological timeline of all scheduled bookings across salon stylists.
              </p>
            </div>
          </div>

          <div className="schedule-filter-bar">
            <select
              className="stylist-filter-select"
              value={selectedStylistFilter}
              onChange={(e) => setSelectedStylistFilter(e.target.value)}
              aria-label="Filter schedule by stylist"
            >
              <option value="ALL">All Stylists ({staffList.length})</option>
              {staffList.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="rec-btn rec-btn-secondary"
              onClick={() => onNavigate('calendar')}
            >
              Open Full Calendar
            </button>
          </div>
        </div>

        <div className="schedule-timeline-grid">
          {filteredSchedule.length === 0 ? (
            <div className="timeline-empty-notice">
              No appointments found for today matching the selected filter.
            </div>
          ) : (
            filteredSchedule.map((apt) => {
              const clientName = apt.clientName || apt.client?.name || 'Guest'
              const clientPhone = apt.clientPhone || apt.client?.phone || ''
              const serviceName = apt.serviceName || apt.service?.name || 'Custom Service'
              const staffName = apt.staffName || apt.staff?.name || 'Unassigned'
              const status = apt.status

              return (
                <div key={apt.id} className="schedule-timeline-row">
                  <div className="timeline-time-col">
                    {formatTime12h(apt.startTime)}
                  </div>
                  <div className="timeline-client-col">
                    <span className="timeline-client-name">{clientName}</span>
                    {clientPhone && <span className="timeline-client-phone">{clientPhone}</span>}
                  </div>
                  <div className="timeline-service-col">
                    {serviceName}
                  </div>
                  <div className="timeline-stylist-col">
                    <ScissorsIcon size={13} />
                    <span>{staffName}</span>
                  </div>
                  <div>
                    <span className={`timeline-status-badge status-${status}`}>
                      {status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* MODAL 1: NEW APPOINTMENT BOOKING */}
      {isBookingModalOpen && (
        <AppointmentFormModal
          isOpen={isBookingModalOpen}
          defaultDate={todayStr}
          onClose={() => setIsBookingModalOpen(false)}
          onSaved={() => {
            setIsBookingModalOpen(false)
            refreshAppointments()
          }}
        />
      )}

      {/* MODAL 2: FAST WALK-IN INTAKE */}
      {isWalkInModalOpen && (
        <WalkInIntakeModal
          isOpen={isWalkInModalOpen}
          onClose={() => setIsWalkInModalOpen(false)}
          onSuccess={() => {
            refreshAppointments()
            setActiveTab('waiting')
          }}
        />
      )}

      {/* MODAL 3: CHECKOUT BILLING DRAWER */}
      {billingAppointment && (
        <CheckoutBillingDrawer
          appointment={billingAppointment}
          onClose={() => setBillingAppointment(null)}
          onSuccess={() => {
            setBillingAppointment(null)
            refreshAppointments()
            setActiveTab('completed')
          }}
        />
      )}
    </div>
  )
}
