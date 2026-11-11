import React, { useMemo } from 'react'
import type { EnrichedAppointment } from '../../../types/models'
import {
  formatTime12h,
  timeToMinutes,
  getSalonDateStr,
} from '../../../utils/formatters'
import { CalendarCard } from './CalendarCard'
import './DayView.css'

interface DayViewProps {
  selectedDate: string
  appointments: EnrichedAppointment[]
  onSelectAppointment: (appointment: EnrichedAppointment) => void
  onSlotClick?: (date: string, time: string) => void
}

const START_HOUR = 9 // 09:00 AM
const END_HOUR = 21 // 09:00 PM
const START_MINUTES = START_HOUR * 60 // 540
const HOUR_HEIGHT = 88 // pixels per hour for clear legibility

interface PositionedItem {
  appointment: EnrichedAppointment
  top: number
  height: number
  lane: number
  totalLanes: number
}

/**
 * Computes side-by-side positioning for concurrent appointments
 */
function computeDayLayout(appointments: EnrichedAppointment[]): PositionedItem[] {
  if (appointments.length === 0) return []

  // Filter out any appointments completely outside working bounds or invalid times
  const valid = appointments.map((app) => {
    const startMins = Math.max(START_MINUTES, timeToMinutes(app.startTime))
    const endMins = Math.min(END_HOUR * 60, Math.max(startMins + 15, timeToMinutes(app.endTime)))
    return {
      appointment: app,
      startMins,
      endMins,
    }
  })

  // Sort by start time ascending, then duration descending
  valid.sort((a, b) => {
    if (a.startMins !== b.startMins) return a.startMins - b.startMins
    return (b.endMins - b.startMins) - (a.endMins - a.startMins)
  })

  // Cluster overlapping appointments
  const clusters: typeof valid[] = []
  let currentCluster: typeof valid = []
  let clusterEnd = -1

  for (const item of valid) {
    if (currentCluster.length === 0) {
      currentCluster.push(item)
      clusterEnd = item.endMins
    } else if (item.startMins < clusterEnd) {
      // Overlaps with the current cluster
      currentCluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.endMins)
    } else {
      // New cluster
      clusters.push(currentCluster)
      currentCluster = [item]
      clusterEnd = item.endMins
    }
  }
  if (currentCluster.length > 0) {
    clusters.push(currentCluster)
  }

  // For each cluster, assign lanes
  const positionedItems: PositionedItem[] = []

  for (const cluster of clusters) {
    // Array of end times for each lane in this cluster
    const laneEndTimes: number[] = []
    const clusterAssignments: { item: typeof valid[0]; lane: number }[] = []

    for (const item of cluster) {
      // Find the first lane where item starts >= laneEndTimes[lane]
      let assignedLane = -1
      for (let l = 0; l < laneEndTimes.length; l++) {
        if (laneEndTimes[l] <= item.startMins) {
          assignedLane = l
          laneEndTimes[l] = item.endMins
          break
        }
      }
      if (assignedLane === -1) {
        // Create a new lane
        assignedLane = laneEndTimes.length
        laneEndTimes.push(item.endMins)
      }
      clusterAssignments.push({ item, lane: assignedLane })
    }

    const totalLanes = laneEndTimes.length

    for (const { item, lane } of clusterAssignments) {
      const top = ((item.startMins - START_MINUTES) / 60) * HOUR_HEIGHT
      const durationMins = item.endMins - item.startMins
      const height = Math.max(54, (durationMins / 60) * HOUR_HEIGHT - 6)

      positionedItems.push({
        appointment: item.appointment,
        top,
        height,
        lane,
        totalLanes,
      })
    }
  }

  return positionedItems
}

export const DayView: React.FC<DayViewProps> = ({
  selectedDate,
  appointments,
  onSelectAppointment,
  onSlotClick,
}) => {
  // Generate hour marks from 9 to 21
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

  const positionedItems = useMemo(() => {
    return computeDayLayout(appointments)
  }, [appointments])

  // Current time line for today
  const todayStr = getSalonDateStr(0)
  const isToday = selectedDate === todayStr

  // Compute current time position in minutes if today
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const showCurrentTime =
    isToday && nowMinutes >= START_MINUTES && nowMinutes <= END_HOUR * 60
  const currentTimeTop = showCurrentTime
    ? ((nowMinutes - START_MINUTES) / 60) * HOUR_HEIGHT
    : null

  return (
    <div className="day-view-container" role="region" aria-label="Day schedule">
      <div className="day-view-scroll-wrapper">
        <div
          className="day-view-grid"
          style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT + 40 }}
        >
          {/* Time Gutter Column */}
          <div className="day-time-gutter" aria-hidden="true">
            {hours.map((h, idx) => (
              <div
                key={h.timeStr}
                className="day-hour-marker"
                style={{ top: idx * HOUR_HEIGHT }}
              >
                <span className="day-hour-label">{h.label}</span>
              </div>
            ))}
          </div>

          {/* Appointments Grid Canvas */}
          <div className="day-slots-canvas">
            {/* Background Hour Rows */}
            {hours.map((h, idx) => {
              if (idx === hours.length - 1) return null // Last boundary marker
              return (
                <div
                  key={`slot-${h.timeStr}`}
                  className="day-hour-row"
                  style={{
                    top: idx * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                  }}
                  onClick={() => onSlotClick?.(selectedDate, h.timeStr)}
                  title={`Click to book appointment at ${h.label}`}
                  role="button"
                  tabIndex={-1}
                >
                  <div className="day-slot-half-divider" />
                </div>
              )
            })}

            {/* Current Time Indicator Line */}
            {showCurrentTime && currentTimeTop !== null && (
              <div
                className="day-current-time-line"
                style={{ top: currentTimeTop }}
                title="Current Time"
              >
                <span className="current-time-dot" />
                <span className="current-time-label">Now</span>
              </div>
            )}

            {/* Render Positioned Appointment Cards */}
            {positionedItems.map(({ appointment, top, height, lane, totalLanes }) => {
              const widthPercent = 100 / totalLanes
              const leftPercent = lane * widthPercent
              const paddingOffset = totalLanes > 1 ? 6 : 0

              return (
                <div
                  key={appointment.id}
                  className="day-appointment-wrapper"
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(${leftPercent}% + ${lane * 4}px)`,
                    width: `calc(${widthPercent}% - ${paddingOffset}px)`,
                  }}
                >
                  <CalendarCard
                    appointment={appointment}
                    onSelect={onSelectAppointment}
                    compact={height < 70 || totalLanes > 2}
                  />
                </div>
              )
            })}

            {/* Empty State message if no appointments */}
            {appointments.length === 0 && (
              <div className="day-empty-state">
                <div className="day-empty-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="4" width="18" height="18" rx="3" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <h4 className="day-empty-title">No appointments scheduled</h4>
                <p className="day-empty-desc">
                  There are no bookings for this date yet. Click any time slot or use "+ New Appointment" to schedule.
                </p>
                <button
                  type="button"
                  className="day-empty-action-btn"
                  onClick={() => onSlotClick?.(selectedDate, '10:00')}
                >
                  + Book for 10:00 AM
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
