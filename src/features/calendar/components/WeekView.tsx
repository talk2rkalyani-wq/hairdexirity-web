import React, { useMemo } from 'react'
import type { EnrichedAppointment } from '../../../types/models'
import {
  getWeekDates,
  formatTime12h,
  timeToMinutes,
} from '../../../utils/formatters'
import { CalendarCard } from './CalendarCard'
import './WeekView.css'

interface WeekViewProps {
  selectedDate: string
  appointments: EnrichedAppointment[]
  onSelectAppointment: (appointment: EnrichedAppointment) => void
  onSelectDate?: (dateStr: string) => void
  onSlotClick?: (date: string, time: string) => void
}

const START_HOUR = 9 // 09:00 AM
const END_HOUR = 21 // 09:00 PM
const START_MINUTES = START_HOUR * 60 // 540
const HOUR_HEIGHT = 72 // Compact hour height for week view

export const WeekView: React.FC<WeekViewProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onSelectDate,
  onSlotClick,
}) => {
  const weekDays = useMemo(() => getWeekDates(selectedDate), [selectedDate])

  const hours = useMemo(() => {
    const list: { hour: number; label: string; timeStr: string }[] = []
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      const timeStr = `${String(h).padStart(2, '0')}:00`
      list.push({
        hour: h,
        label: formatTime12h(timeStr),
        timeStr,
      })
    }
    return list
  }, [])

  // Map appointments to their respective date string
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, EnrichedAppointment[]>()
    for (const day of weekDays) {
      map.set(day.dateStr, [])
    }
    for (const app of appointments) {
      if (map.has(app.date)) {
        map.get(app.date)!.push(app)
      }
    }
    // Sort each day's appointments by start time
    map.forEach((list) => {
      list.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    })
    return map
  }, [weekDays, appointments])

  return (
    <div className="week-view-container" role="region" aria-label="Week schedule">
      {/* Mobile Day Selector Bar */}
      <div className="week-mobile-bar">
        {weekDays.map((day) => {
          const isSelected = day.dateStr === selectedDate
          const count = appointmentsByDate.get(day.dateStr)?.length || 0
          return (
            <button
              key={day.dateStr}
              type="button"
              className={`week-mobile-day-btn ${isSelected ? 'active' : ''} ${day.isToday ? 'is-today' : ''}`}
              onClick={() => onSelectDate?.(day.dateStr)}
            >
              <span className="mob-weekday">{day.formattedShort}</span>
              <span className="mob-daynum">{day.dayNum}</span>
              {count > 0 && <span className="mob-count">{count}</span>}
            </button>
          )
        })}
      </div>

      <div className="week-scroll-wrapper">
        <div
          className="week-grid-table"
          style={{ minHeight: (END_HOUR - START_HOUR) * HOUR_HEIGHT + 70 }}
        >
          {/* Header Row: Column Headers */}
          <div className="week-header-row">
            {/* Gutter corner */}
            <div className="week-gutter-corner">
              <span className="week-tz-tag">IST (UTC+5:30)</span>
            </div>

            {/* 7 Day Headers */}
            {weekDays.map((day) => {
              const isSelected = day.dateStr === selectedDate
              const count = appointmentsByDate.get(day.dateStr)?.length || 0

              return (
                <div
                  key={day.dateStr}
                  className={`week-day-header ${day.isToday ? 'today-col' : ''} ${
                    isSelected ? 'selected-col' : ''
                  }`}
                  onClick={() => onSelectDate?.(day.dateStr)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onSelectDate?.(day.dateStr)
                  }}
                  title={`View day: ${day.formattedShort}, ${day.dateStr}`}
                >
                  <div className="week-header-info">
                    <span className="week-header-dayname">{day.formattedShort}</span>
                    <span className="week-header-daynum">{day.dayNum}</span>
                  </div>
                  {day.isToday && <span className="week-today-badge">Today</span>}
                  {count > 0 && (
                    <span className="week-appt-count-badge" title={`${count} bookings`}>
                      {count} {count === 1 ? 'booking' : 'bookings'}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Main Body: Time Gutter + 7 Columns */}
          <div className="week-body-row">
            {/* Time Gutter Column */}
            <div className="week-time-gutter" aria-hidden="true">
              {hours.map((h, idx) => (
                <div
                  key={h.timeStr}
                  className="week-hour-marker"
                  style={{ top: idx * HOUR_HEIGHT }}
                >
                  <span className="week-hour-label">{h.label}</span>
                </div>
              ))}
            </div>

            {/* 7 Day Columns Canvas */}
            <div className="week-columns-canvas">
              {weekDays.map((day) => {
                const dayApps = appointmentsByDate.get(day.dateStr) || []
                const isSelected = day.dateStr === selectedDate

                return (
                  <div
                    key={day.dateStr}
                    className={`week-day-column ${day.isToday ? 'today-column' : ''} ${
                      isSelected ? 'selected-column' : ''
                    }`}
                  >
                    {/* Hour background grid lines */}
                    {hours.map((h, idx) => {
                      if (idx === hours.length - 1) return null
                      return (
                        <div
                          key={`row-${h.timeStr}`}
                          className="week-slot-row"
                          style={{
                            top: idx * HOUR_HEIGHT,
                            height: HOUR_HEIGHT,
                          }}
                          onClick={() => onSlotClick?.(day.dateStr, h.timeStr)}
                          title={`Book on ${day.formattedShort} at ${h.label}`}
                          role="button"
                          tabIndex={-1}
                        >
                          <div className="week-slot-dash" />
                        </div>
                      )
                    })}

                    {/* Positioned Appointments for this day */}
                    {dayApps.map((app) => {
                      const startMins = Math.max(START_MINUTES, timeToMinutes(app.startTime))
                      const endMins = Math.min(
                        END_HOUR * 60,
                        Math.max(startMins + 15, timeToMinutes(app.endTime))
                      )
                      const top = ((startMins - START_MINUTES) / 60) * HOUR_HEIGHT
                      const durationMins = endMins - startMins
                      const height = Math.max(48, (durationMins / 60) * HOUR_HEIGHT - 4)

                      return (
                        <div
                          key={app.id}
                          className="week-card-wrapper"
                          style={{
                            top: `${top}px`,
                            height: `${height}px`,
                          }}
                        >
                          <CalendarCard
                            appointment={app}
                            onSelect={onSelectAppointment}
                            compact={true}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
