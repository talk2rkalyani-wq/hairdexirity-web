import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { EnrichedAppointment, AppointmentStatus } from '../../types/models'
import { appointmentService } from '../../services/appointmentService'
import { sessionService } from '../../services/sessionService'
import { permissionService } from '../../services/permissionService'
import {
  getSalonDateStr,
  addDaysToDate,
  getWeekDates,
  formatDateDisplay,
  formatWeekRangeDisplay,
} from '../../utils/formatters'
import { DayView } from './components/DayView'
import { WeekView } from './components/WeekView'
import { AppointmentDetailDrawer } from './components/AppointmentDetailDrawer'
import { AppointmentFormModal } from './components/AppointmentFormModal'
import './CalendarView.css'

export type CalendarViewMode = 'day' | 'week'

interface ToastState {
  message: string
  type: 'success' | 'info' | 'error'
}

export const CalendarView: React.FC = () => {
  // Session & Permission state
  const [session, setSession] = useState(() => sessionService.getCurrentSession())
  const canAssign = permissionService.canAssignServices(session)
  const isEmployee = session?.role === 'EMPLOYEE'

  // Calendar View State
  const [viewMode, setViewMode] = useState<CalendarViewMode>('day')
  const [selectedDate, setSelectedDate] = useState<string>(() => getSalonDateStr(0))
  const [appointments, setAppointments] = useState<EnrichedAppointment[]>([])
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)


  // Drawer and Modal States
  const [selectedAppointment, setSelectedAppointment] = useState<EnrichedAppointment | null>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean
    appointment?: EnrichedAppointment | null
    defaultDate?: string
    defaultTime?: string
  }>({
    isOpen: false,
  })

  // Toast notification state
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type })
    setTimeout(() => {
      setToast(null)
    }, 3500)
  }, [])

  // Refresh calendar data trigger
  const triggerRefresh = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  // Compute current week range for week view
  const weekInfo = useMemo(() => {
    const dates = getWeekDates(selectedDate)
    return {
      dates,
      start: dates[0].dateStr,
      end: dates[6].dateStr,
    }
  }, [selectedDate])

  // Asynchronously load appointments based on active view mode and date
  useEffect(() => {
    let isMounted = true

    const loadAppointments = async () => {
      try {
        let list: EnrichedAppointment[] = []
        if (viewMode === 'day') {
          list = await appointmentService.getEnrichedAppointmentsForDate(selectedDate)
        } else {
          list = await appointmentService.getEnrichedAppointmentsForDateRange(
            weekInfo.start,
            weekInfo.end
          )
        }
        if (isMounted) {
          setAppointments(list)
        }
      } catch (err) {
        console.error('Failed to load appointments:', err)
      }
    }

    loadAppointments()

    const unsubscribe = appointmentService.subscribe(() => {
      loadAppointments()
    })

    const unsubSession = sessionService.subscribe((newSession) => {
      setSession(newSession)
      loadAppointments()
    })

    return () => {
      isMounted = false
      unsubscribe()
      unsubSession()
    }
  }, [viewMode, selectedDate, weekInfo, refreshTrigger])

  // Header display title
  const headerDateLabel = useMemo(() => {
    if (viewMode === 'day') {
      return formatDateDisplay(selectedDate)
    } else {
      return formatWeekRangeDisplay(weekInfo.start, weekInfo.end)
    }
  }, [viewMode, selectedDate, weekInfo])

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'day') {
      setSelectedDate((curr) => addDaysToDate(curr, -1))
    } else {
      setSelectedDate((curr) => addDaysToDate(curr, -7))
    }
  }

  const handleNext = () => {
    if (viewMode === 'day') {
      setSelectedDate((curr) => addDaysToDate(curr, 1))
    } else {
      setSelectedDate((curr) => addDaysToDate(curr, 7))
    }
  }

  const handleToday = () => {
    setSelectedDate(getSalonDateStr(0))
  }

  // Appointment Selection (opens Detail Drawer)
  const handleSelectAppointment = (appointment: EnrichedAppointment) => {
    setSelectedAppointment(appointment)
    setIsDrawerOpen(true)
  }

  // Slot click (opens New Appointment modal prefilled with date & time if authorized)
  const handleSlotClick = (date: string, time: string) => {
    if (!canAssign) {
      showToast('Only salon owners and receptionists can schedule new appointments.', 'info')
      return
    }

    setModalConfig({
      isOpen: true,
      appointment: null,
      defaultDate: date,
      defaultTime: time,
    })
  }


  // Open Edit modal from Drawer
  const handleEditAppointment = (appointment: EnrichedAppointment) => {
    setIsDrawerOpen(false)
    setModalConfig({
      isOpen: true,
      appointment,
    })
  }

  // Status transition from Drawer
  const handleStatusChange = async (appointmentId: string, newStatus: AppointmentStatus) => {
    try {
      const updated = await appointmentService.updateAppointmentStatus(appointmentId, newStatus)
      if (selectedAppointment && selectedAppointment.id === appointmentId) {
        setSelectedAppointment({
          ...selectedAppointment,
          ...updated,
        })
      }
      triggerRefresh()
      showToast(`Appointment status updated to ${newStatus}`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update status.'
      showToast(msg, 'error')
    }
  }

  // Saved appointment callback (from Modal)
  const handleSavedAppointment = (_saved: EnrichedAppointment) => {
    triggerRefresh()
    showToast(
      modalConfig.appointment
        ? 'Appointment updated successfully.'
        : 'Appointment scheduled successfully.',
      'success'
    )
  }

  return (
    <div className="cal-page-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`cal-toast-banner toast-${toast.type}`} role="status">
          <span className="toast-dot" />
          <span className="toast-message">{toast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="cal-top-header">
        <div className="cal-header-titles">
          <h1 className="cal-main-title">{isEmployee ? 'My Calendar' : 'Calendar'}</h1>
          <p className="cal-sub-title">
            {isEmployee
              ? 'View your assigned appointments and client schedule.'
              : 'Manage your salon appointments and schedule.'}
          </p>
        </div>

        <div className="cal-header-actions">
          {/* View Toggle: Day | Week */}
          <div className="cal-view-toggle" role="group" aria-label="Calendar view switcher">
            <button
              type="button"
              className={`cal-toggle-btn ${viewMode === 'day' ? 'active' : ''}`}
              onClick={() => setViewMode('day')}
            >
              Day
            </button>
            <button
              type="button"
              className={`cal-toggle-btn ${viewMode === 'week' ? 'active' : ''}`}
              onClick={() => setViewMode('week')}
            >
              Week
            </button>
          </div>

          {/* New Appointment Button */}
          {canAssign && (
            <button
              type="button"
              className="cal-primary-action-btn"
              onClick={() =>
                setModalConfig({
                  isOpen: true,
                  appointment: null,
                  defaultDate: selectedDate,
                  defaultTime: '10:00',
                })
              }
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>+ New Appointment</span>
            </button>
          )}
        </div>
      </header>


      {/* Navigation Sub-Bar */}
      <div className="cal-nav-toolbar">
        <div className="cal-nav-controls">
          <button
            type="button"
            className="cal-nav-btn"
            onClick={handlePrev}
            aria-label="Previous date"
            title="Previous"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <button
            type="button"
            className="cal-today-btn"
            onClick={handleToday}
          >
            Today
          </button>

          <button
            type="button"
            className="cal-nav-btn"
            onClick={handleNext}
            aria-label="Next date"
            title="Next"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* Formatted Date Title */}
          <h2 className="cal-nav-date-label">{headerDateLabel}</h2>
        </div>

        {/* Appointment count summary tag */}
        <div className="cal-summary-tag">
          <span className="summary-count">{appointments.length}</span>
          <span className="summary-text">
            {appointments.length === 1 ? 'appointment' : 'appointments'}
          </span>
        </div>
      </div>

      {/* Main Calendar View Area */}
      <main className="cal-content-area">
        {viewMode === 'day' ? (
          <DayView
            selectedDate={selectedDate}
            appointments={appointments}
            onSelectAppointment={handleSelectAppointment}
            onSlotClick={handleSlotClick}
          />
        ) : (
          <WeekView
            selectedDate={selectedDate}
            appointments={appointments}
            onSelectAppointment={handleSelectAppointment}
            onSelectDate={(date) => {
              setSelectedDate(date)
              setViewMode('day')
            }}
            onSlotClick={handleSlotClick}
          />
        )}
      </main>

      {/* Slide-over Detail Drawer */}
      <AppointmentDetailDrawer
        isOpen={isDrawerOpen}
        appointment={selectedAppointment}
        onClose={() => setIsDrawerOpen(false)}
        onEdit={handleEditAppointment}
        onStatusChange={handleStatusChange}
        canEdit={canAssign}
      />


      {/* Create / Edit Form Modal */}
      <AppointmentFormModal
        isOpen={modalConfig.isOpen}
        initialAppointment={modalConfig.appointment}
        defaultDate={modalConfig.defaultDate}
        defaultTime={modalConfig.defaultTime}
        onClose={() => setModalConfig({ isOpen: false })}
        onSaved={handleSavedAppointment}
      />
    </div>
  )
}
export default CalendarView
