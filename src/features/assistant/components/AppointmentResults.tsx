import React from 'react'
import type { EnrichedAppointment } from '../../../types/models'
import { AppointmentCard } from './AppointmentCard'
import './AppointmentResults.css'

interface AppointmentResultsProps {
  appointments: EnrichedAppointment[]
}

export const AppointmentResults: React.FC<AppointmentResultsProps> = ({
  appointments,
}) => {
  const completedCount = appointments.filter((a) => a.status === 'completed').length
  const confirmedCount = appointments.filter((a) => a.status === 'confirmed').length
  const scheduledCount = appointments.filter((a) => a.status === 'scheduled').length

  return (
    <div className="appointment-results-container" aria-label="Appointment Results">
      {/* Summary metric bar */}
      <div className="results-metric-bar">
        <span className="results-count-pill">
          {appointments.length} Total Bookings
        </span>
        <div className="results-metrics-group">
          {completedCount > 0 && (
            <span className="metric-chip completed">{completedCount} Completed</span>
          )}
          {confirmedCount > 0 && (
            <span className="metric-chip confirmed">{confirmedCount} Confirmed</span>
          )}
          {scheduledCount > 0 && (
            <span className="metric-chip scheduled">{scheduledCount} Scheduled</span>
          )}
        </div>
      </div>

      {/* Cards list */}
      <div className="results-cards-list" role="list">
        {appointments.map((appointment) => (
          <AppointmentCard key={appointment.id} appointment={appointment} />
        ))}
      </div>
    </div>
  )
}
