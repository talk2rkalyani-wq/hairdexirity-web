import { appointmentService } from './appointmentService'
import { appointmentStore } from './appointmentStore'
import { formatTime12h, formatDateDisplay } from '../utils/formatters'
import type {
  PendingReminderBatch,
  PreparedReminderItem,
  SentRemindersReceipt,
} from '../features/assistant/types'

export const reminderService = {
  /**
   * Prepares a batch of appointment reminders for a specific date,
   * optionally filtered to a specific client.
   * Only appointments with status 'scheduled' or 'confirmed' are included.
   */
  async prepareRemindersForDate(
    dateStr: string,
    clientQuery?: string
  ): Promise<PendingReminderBatch> {
    const appointments = await appointmentService.getEnrichedAppointmentsForDate(dateStr)

    // Filter eligible appointments: only active scheduled or confirmed
    let eligible = appointments.filter(
      (a) => a.status === 'scheduled' || a.status === 'confirmed'
    )

    if (clientQuery && clientQuery.trim()) {
      const q = clientQuery.trim().toLowerCase()
      eligible = eligible.filter(
        (a) =>
          a.client?.name.toLowerCase().includes(q) ||
          q.includes(a.client?.name.toLowerCase() || '')
      )
    }

    // Sort chronologically by start time
    eligible.sort((a, b) => a.startTime.localeCompare(b.startTime))

    const formattedDate = formatDateDisplay(dateStr)

    const items: PreparedReminderItem[] = eligible.map((apt) => {
      const clientName = apt.client?.name || 'Valued Client'
      const clientPhone = apt.client?.phone || '+91 98000 00000'
      const serviceName = apt.service?.name || 'Salon Service'
      const staffName = apt.staff?.name || 'Senior Stylist'
      const timeStr = formatTime12h(apt.startTime)

      const messageBody = `Hello ${clientName}! ✨ This is a reminder from Hair Dexirity for your ${serviceName} appointment on ${formattedDate} at ${timeStr} with stylist ${staffName}.\n\n📍 Location: Level 2, Galleria Market, DLF Phase IV, Gurugram.\n📞 Contact: +91 98765 43210\n\nPlease reply "YES" to confirm or call us if you need to reschedule.`

      return {
        appointmentId: apt.id,
        clientId: apt.clientId,
        clientName,
        clientPhone,
        serviceName,
        staffName,
        date: apt.date,
        startTime: apt.startTime,
        endTime: apt.endTime,
        price: apt.price,
        messageBody,
        alreadySent: !!apt.reminderSent,
      }
    })

    return {
      targetDate: dateStr,
      formattedDate,
      totalCount: items.length,
      items,
    }
  },

  /**
   * Dispatches the batch of reminders.
   * Updates each appointment record in the canonical store with reminder metadata.
   */
  async dispatchReminders(batch: PendingReminderBatch): Promise<SentRemindersReceipt> {
    const nowIso = new Date().toISOString()
    const dispatchedTimeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })

    for (const item of batch.items) {
      appointmentStore.update(item.appointmentId, {
        reminderSent: true,
        lastReminderSentAt: nowIso,
        reminderDeliveryStatus: 'delivered',
      })
    }

    return {
      batchDate: batch.targetDate,
      formattedDate: batch.formattedDate,
      sentCount: batch.items.length,
      dispatchedAt: dispatchedTimeStr,
      deliveryChannel: 'WhatsApp & SMS',
      recipients: batch.items.map((it) => ({
        clientName: it.clientName,
        clientPhone: it.clientPhone,
        serviceName: it.serviceName,
        time: formatTime12h(it.startTime),
        status: 'delivered',
      })),
    }
  },
}
