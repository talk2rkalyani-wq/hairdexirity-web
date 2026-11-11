import React, { useState, useEffect } from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import {
  SunIcon,
  CalendarIcon,
  ScissorsIcon,
  CoffeeIcon,
  AwardIcon,
  CheckIcon,
} from '../../../components/Icons'
import { appointmentService } from '../../../services/appointmentService'
import { appointmentStore } from '../../../services/appointmentStore'
import type { EnrichedAppointment } from '../../../types/models'
import type { NavId } from '../../../types/salon'
import {
  getSalonDateStr,
  formatTime12h,
  formatCurrency,
} from '../../../utils/formatters'
import '../common/DashboardStyles.css'

interface EmployeeMyDayViewProps {
  employeeName: string
  specialty?: string
  onNavigate: (route: NavId) => void
}

export const EmployeeMyDayView: React.FC<EmployeeMyDayViewProps> = ({
  employeeName,
  specialty,
  onNavigate,
}) => {
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([])
  const [loading, setLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const todayStr = getSalonDateStr(0)

  const loadAppointments = async () => {
    try {
      // Scoped to this employee's assigned appointments
      const list = await appointmentService.getEnrichedAppointmentsForDate(todayStr)
      setAppointments(list)
    } catch (err: any) {
      console.error('Failed to load stylist appointments for today:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAppointments()
    const unsubscribe = appointmentStore.subscribe(() => {
      loadAppointments()
    })
    return () => unsubscribe()
  }, [todayStr])

  const activeAppointment = appointments.find((a) => a.status === 'in_progress')
  const waitingAppointments = appointments.filter((a) => a.status === 'checked_in')
  const upcomingAppointments = appointments.filter(
    (a) => a.status === 'scheduled' || a.status === 'confirmed'
  )
  const completedAppointments = appointments.filter((a) => a.status === 'completed')

  const handleStartService = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.startServiceAppointment(id)
    } catch (err: any) {
      setActionError(err.message || 'Failed to start service')
    } finally {
      setIsProcessing(null)
    }
  }

  const handleCompleteService = async (id: string) => {
    try {
      setIsProcessing(id)
      setActionError(null)
      await appointmentService.completeServiceAppointment(id)
    } catch (err: any) {
      setActionError(err.message || 'Failed to complete service')
    } finally {
      setIsProcessing(null)
    }
  }

  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="My Day"
        subtitle={`Welcome, ${employeeName}. Here is your personal queue and daily service summary.`}
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

      {/* Dynamic Personal KPIs */}
      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Today's Bookings"
          value={loading ? '...' : String(appointments.length)}
          subtext="Total assigned appointments"
          icon={<CalendarIcon size={20} />}
        />
        <MetricCard
          label="In Service / Waiting"
          value={loading ? '...' : String((activeAppointment ? 1 : 0) + waitingAppointments.length)}
          subtext={activeAppointment ? '1 in chair right now' : waitingAppointments.length > 0 ? `${waitingAppointments.length} in lounge` : 'Chair available'}
          icon={<ScissorsIcon size={20} />}
        />
        <MetricCard
          label="Completed Today"
          value={loading ? '...' : String(completedAppointments.length)}
          subtext="Services completed"
          icon={<CheckIcon size={20} />}
        />
        <MetricCard
          label="Account Status"
          value="On Floor"
          subtext={specialty || 'Hair Specialist'}
          icon={<SunIcon size={20} />}
        />
      </div>

      {/* Active Chairside & Lounge Action Card */}
      {(activeAppointment || waitingAppointments.length > 0) && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backdropFilter: 'blur(8px)',
        }}>
          {/* Active Service in Chair */}
          {activeAppointment && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              padding: '1rem',
              borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.1)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#67e8f9' }}>
                  ✂️ Currently In Chair
                </span>
                <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                  {activeAppointment.clientName || activeAppointment.client?.name || 'Guest'} — {activeAppointment.serviceName || activeAppointment.service?.name || 'Service'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Scheduled: {formatTime12h(activeAppointment.startTime)} – {formatTime12h(activeAppointment.endTime)} • {formatCurrency(activeAppointment.price)}
                </span>
              </div>
              <button
                type="button"
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: '#10b981',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
                disabled={isProcessing === activeAppointment.id}
                onClick={() => handleCompleteService(activeAppointment.id)}
              >
                ✓ Complete Service
              </button>
            </div>
          )}

          {/* Waiting Clients in Lounge */}
          {waitingAppointments.map((apt) => (
            <div
              key={apt.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1rem',
                padding: '1rem',
                borderRadius: '10px',
                background: 'rgba(234, 179, 8, 0.1)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#fde047' }}>
                  ⏳ Client Waiting In Lounge
                </span>
                <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                  {apt.clientName || apt.client?.name || 'Guest'} — {apt.serviceName || apt.service?.name || 'Service'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Arrival: {formatTime12h(apt.startTime)} • Assigned to you
                </span>
              </div>
              <button
                type="button"
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  background: '#06b6d4',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 12px rgba(6, 182, 212, 0.3)',
                }}
                disabled={isProcessing === apt.id}
                onClick={() => handleStartService(apt.id)}
              >
                ▶ Seat & Start Service
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Navigation Cards */}
      <DashboardCard
        title="My Work Areas"
        subtitle="Quick access to your personal schedule, workflow, and availability."
        statusBadge="Personal Workspace"
      >
        <div className="dashboard-quick-links-grid">
          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('employee/appointments')}
          >
            <div className="quick-link-icon">
              <CalendarIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">My Appointments</span>
              <span className="quick-link-desc">View your scheduled bookings ({upcomingAppointments.length} upcoming)</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('employee/service-workflow')}
          >
            <div className="quick-link-icon">
              <ScissorsIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Service Workflow</span>
              <span className="quick-link-desc">Service stages & client notes</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('employee/availability')}
          >
            <div className="quick-link-icon">
              <CoffeeIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">Availability & Breaks</span>
              <span className="quick-link-desc">Daily breaks & working hours</span>
            </div>
          </button>

          <button
            type="button"
            className="quick-link-tile"
            onClick={() => onNavigate('employee/performance')}
          >
            <div className="quick-link-icon">
              <AwardIcon size={20} />
            </div>
            <div className="quick-link-info">
              <span className="quick-link-title">My Performance</span>
              <span className="quick-link-desc">Your personal service milestones</span>
            </div>
          </button>
        </div>
      </DashboardCard>
    </div>
  )
}
