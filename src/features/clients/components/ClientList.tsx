import React, { useRef, useEffect } from 'react'
import type { Client } from '../../../types/models'
import { formatCurrency } from '../../../utils/formatters'
import { ClientRow, formatLastVisit } from './ClientRow'
import { TrashIcon } from '../../../components/Icons'
import './ClientList.css'

interface ClientListProps {
  clients: Client[]
  searchQuery: string
  onClearSearch: () => void
  onAddClient: () => void
  onSelectClient: (client: Client) => void
  canDelete?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleSelectAll?: () => void
  isAllSelected?: boolean
  isIndeterminate?: boolean
  onDeleteClient?: (client: Client) => void
}

export const ClientList: React.FC<ClientListProps> = ({
  clients,
  searchQuery,
  onClearSearch,
  onAddClient,
  onSelectClient,
  canDelete = false,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  isAllSelected = false,
  isIndeterminate = false,
  onDeleteClient,
}) => {
  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  // 1. Search Empty State
  if (clients.length === 0 && searchQuery.trim().length > 0) {
    return (
      <div className="clients-empty-box" role="status">
        <div className="empty-icon-wrap" aria-hidden="true">
          <span>🔍</span>
        </div>
        <h3 className="empty-title">No clients found</h3>
        <p className="empty-desc">
          No clients match "<strong>{searchQuery}</strong>". Check the spelling or clear the filter.
        </p>
        <button
          type="button"
          className="empty-action-btn"
          onClick={onClearSearch}
        >
          Clear Search Filter
        </button>
      </div>
    )
  }

  // 2. Complete Zero State
  if (clients.length === 0) {
    return (
      <div className="clients-empty-box" role="status">
        <div className="empty-icon-wrap" aria-hidden="true">
          <span>👥</span>
        </div>
        <h3 className="empty-title">No clients in your salon yet</h3>
        <p className="empty-desc">
          Get started by adding your first client profile to manage preferences and bookings.
        </p>
        <button
          type="button"
          className="empty-action-btn primary-btn"
          onClick={onAddClient}
        >
          Add Your First Client
        </button>
      </div>
    )
  }

  return (
    <div className="client-list-container">
      {/* Desktop & Laptop Table View */}
      <div className="desktop-table-wrap">
        <table className="clients-table" aria-label="Salon Clients Directory">
          <thead>
            <tr>
              {canDelete && (
                <th scope="col" className="th-checkbox">
                  <input
                    type="checkbox"
                    ref={selectAllRef}
                    className="row-select-checkbox"
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                    aria-label="Select all clients"
                  />
                </th>
              )}
              <th scope="col" className="th-client">Client</th>
              <th scope="col" className="th-phone">Phone</th>
              <th scope="col" className="th-visit">Last Visit</th>
              <th scope="col" className="th-spend">Total Spend</th>
              <th scope="col" className="th-status">Status</th>
              {canDelete && <th scope="col" className="th-actions">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => (
              <ClientRow
                key={client.id}
                client={client}
                onSelect={onSelectClient}
                canDelete={canDelete}
                isSelected={selectedIds?.has(client.id)}
                onToggleSelect={onToggleSelect}
                onDelete={onDeleteClient}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Responsive Cards View */}
      <div className="mobile-cards-wrap" role="list" aria-label="Salon Clients List">
        {clients.map((client) => {
          const { text: lastVisitText, isInactive } = formatLastVisit(
            client.lastVisitAt,
            client.createdAt
          )
          const isSelected = selectedIds?.has(client.id)

          return (
            <article
              key={client.id}
              className={`mobile-client-card ${isInactive ? 'card-inactive' : ''} ${isSelected ? 'card-selected' : ''}`}
              onClick={() => onSelectClient(client)}
              tabIndex={0}
              role="listitem"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelectClient(client)
                }
              }}
            >
              <div className="mobile-card-top">
                <div className="client-identity">
                  {canDelete && (
                    <div
                      className="mobile-card-checkbox-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="row-select-checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect?.(client.id)}
                        aria-label={`Select client ${client.name}`}
                      />
                    </div>
                  )}

                  <div className="client-avatar-mini" aria-hidden="true">
                    {client.name
                      .split(' ')
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div className="client-name-group">
                    <h4 className="client-name">{client.name}</h4>
                    <span className="client-phone-sub">{client.phone}</span>
                  </div>
                </div>

                <div className="mobile-card-actions-right">
                  <span className={`status-pill ${isInactive ? 'pill-inactive' : 'pill-active'}`}>
                    {isInactive ? 'Inactive' : 'Active'}
                  </span>

                  {canDelete && (
                    <button
                      type="button"
                      className="btn-mobile-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteClient?.(client)
                      }}
                      aria-label={`Delete client ${client.name}`}
                      title={`Delete ${client.name}`}
                    >
                      <TrashIcon size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="mobile-card-details">
                <div className="detail-stat">
                  <span className="stat-label">Last Visit</span>
                  <span className="stat-value">{lastVisitText}</span>
                </div>
                <div className="detail-stat">
                  <span className="stat-label">Total Spend</span>
                  <span className="stat-value spend-accent">
                    {formatCurrency(client.totalSpend)}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
