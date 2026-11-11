import React from 'react'
import type { Client } from '../../../types/models'
import { formatCurrency } from '../../../utils/formatters'
import { TrashIcon } from '../../../components/Icons'
import { appointmentStore } from '../../../services/appointmentStore'
import './ClientRow.css'

interface ClientRowProps {
  client: Client
  onSelect: (client: Client) => void
  canDelete?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
  onDelete?: (client: Client) => void
}

export function formatLastVisit(lastVisitAt?: string, createdAt?: string): {
  text: string
  isInactive: boolean
} {
  if (!lastVisitAt) {
    if (createdAt) {
      const daysSinceCreated = Math.floor(
        (new Date().getTime() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSinceCreated <= 14) {
        return { text: 'New Client', isInactive: false }
      }
    }
    return { text: 'Never', isInactive: true }
  }

  const visitDate = new Date(lastVisitAt)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays === 0) return { text: 'Today', isInactive: false }
  if (diffDays === 1) return { text: 'Yesterday', isInactive: false }
  if (diffDays < 60) return { text: `${diffDays} days ago`, isInactive: false }
  return { text: `${diffDays} days ago`, isInactive: true }
}

export const ClientRow: React.FC<ClientRowProps> = ({
  client,
  onSelect,
  canDelete = false,
  isSelected = false,
  onToggleSelect,
  onDelete,
}) => {
  const { text: lastVisitText, isInactive } = formatLastVisit(
    client.lastVisitAt,
    client.createdAt
  )

  const statusLabel = isInactive ? 'Inactive' : 'Active'
  const hasBlockingAppointments = appointmentStore.hasBlockingAppointmentsForClient(client.id)

  return (
    <tr
      className={`client-table-row ${isInactive ? 'row-inactive' : ''} ${isSelected ? 'row-selected' : ''}`}
      onClick={() => onSelect(client)}
      tabIndex={0}
      role="row"
      aria-label={`View profile for ${client.name}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(client)
        }
      }}
    >
      {/* Checkbox cell for Owner bulk selection */}
      {canDelete && (
        <td
          className="cell-checkbox"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <input
            type="checkbox"
            className="row-select-checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect?.(client.id)}
            aria-label={`Select client ${client.name}`}
          />
        </td>
      )}

      <td className="cell-client-primary">
        <div className="client-identity">
          <div className="client-avatar" aria-hidden="true">
            {client.name
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </div>
          <div className="client-name-group">
            <span className="client-name">{client.name}</span>
            {client.preferences?.notes && (
              <span className="preferred-stylist-tag">
                {client.preferences.notes}
              </span>
            )}
          </div>
        </div>
      </td>

      <td className="cell-contact">
        <div className="contact-details">
          <span className="client-phone">{client.phone}</span>
          {client.email && <span className="client-email">{client.email}</span>}
        </div>
      </td>

      <td className="cell-visits">
        <span className="visit-count">{appointmentStore.getAppointmentCountForClient(client.id)}</span>
      </td>

      <td className="cell-last-visit">
        <span className="last-visit-text">{lastVisitText}</span>
      </td>

      <td className="cell-spend">
        <span className="spend-amount">{formatCurrency(client.totalSpend)}</span>
      </td>

      <td className="cell-status">
        <span className={`status-pill ${isInactive ? 'pill-inactive' : 'pill-active'}`}>
          <span className="status-dot" />
          {statusLabel}
        </span>
      </td>

      {/* Owner Single Delete Action */}
      {canDelete && (
        <td
          className="cell-actions"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <button
            type="button"
            className={`btn-row-delete ${hasBlockingAppointments ? 'btn-disabled' : ''}`}
            disabled={hasBlockingAppointments}
            onClick={() => {
              if (!hasBlockingAppointments) {
                onDelete?.(client)
              }
            }}
            aria-label={
              hasBlockingAppointments
                ? `Cannot delete ${client.name} (upcoming or active appointment exists)`
                : `Delete client ${client.name}`
            }
            title={
              hasBlockingAppointments
                ? 'Cannot delete this client because an upcoming or active appointment exists for this client.'
                : `Delete ${client.name}`
            }
          >
            <TrashIcon size={15} />
            <span>Delete</span>
          </button>
        </td>
      )}
    </tr>
  )
}
