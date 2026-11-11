import React from 'react'
import { CalendarView } from '../../calendar/CalendarView'
import type { NavId } from '../../../types/salon'

interface ReceptionistCalendarViewProps {
  onNavigate?: (route: NavId) => void
}

export const ReceptionistCalendarView: React.FC<ReceptionistCalendarViewProps> = () => {
  return <CalendarView />
}

