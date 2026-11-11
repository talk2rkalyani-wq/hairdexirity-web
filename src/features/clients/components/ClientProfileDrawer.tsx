import React, { useState, useEffect } from 'react'
import type { Client, EnrichedAppointment, Staff } from '../../../types/models'
import type { Quotation } from '../../../types/finance'
import { quotationService } from '../../../services/quotationService'
import { appointmentService } from '../../../services/appointmentService'
import { appointmentStore } from '../../../services/appointmentStore'
import { staffService } from '../../../services/staffService'
import { CloseIcon, EditIcon, PhoneIcon, MailIcon, TrashIcon } from '../../../components/Icons'
import { formatCurrency } from '../../../utils/formatters'
import { formatLastVisit } from './ClientRow'
import './ClientProfileDrawer.css'

interface ClientProfileDrawerProps {
  client: Client
  onClose: () => void
  onEdit: (client: Client) => void
  canDelete?: boolean
  onDelete?: (client: Client) => void
}

export const ClientProfileDrawer: React.FC<ClientProfileDrawerProps> = ({
  client,
  onClose,
  onEdit,
  canDelete = false,
  onDelete,
}) => {

  const [history, setHistory] = useState<EnrichedAppointment[]>([])
  const [preferredStylist, setPreferredStylist] = useState<Staff | null>(null)
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [clientQuotations, setClientQuotations] = useState<Quotation[]>([])
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(true)

  useEffect(() => {
    let isMounted = true
    setIsLoadingHistory(true)
    setIsLoadingQuotes(true)

    const fetchHistory = () => {
      appointmentService.getAppointmentsForClient(client.id).then((apts) => {
        if (isMounted) {
          setHistory(apts)
          setIsLoadingHistory(false)
        }
      })
      quotationService.getQuotationsForClient(client.id).then((quotes) => {
        if (isMounted) {
          setClientQuotations(quotes)
          setIsLoadingQuotes(false)
        }
      })
    }

    // 1. Fetch appointments & quotations for this client
    fetchHistory()

    // Real-time subscription to appointment store changes
    const unsubscribe = appointmentService.subscribe(() => {
      fetchHistory()
    })

    // 2. Fetch preferred stylist name if specified
    if (client.preferences.preferredStylistId) {
      staffService.getStaffById(client.preferences.preferredStylistId).then((staff) => {
        if (isMounted) setPreferredStylist(staff)
      })
    } else {
      setPreferredStylist(null)
    }

    return () => {
      isMounted = false
      unsubscribe()
    }
  }, [client.id, client.preferences.preferredStylistId])

  const { text: lastVisitText, isInactive } = formatLastVisit(
    client.lastVisitAt,
    client.createdAt
  )

  const completedVisits = history.filter((a) => a.status === 'completed').length

  return (
    <div className="drawer-overlay" onClick={onClose} aria-hidden="true">
      <aside
        className="client-profile-drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Profile for ${client.name}`}
      >
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="header-identity">
            <div className="drawer-avatar" aria-hidden="true">
              {client.name
                .split(' ')
                .map((n) => n[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div>
              <h2 className="drawer-client-name">{client.name}</h2>
              <span className={`status-pill ${isInactive ? 'pill-inactive' : 'pill-active'}`}>
                {isInactive ? 'Inactive Client' : 'Active Client'}
              </span>
            </div>
          </div>

          <div className="drawer-actions">
            <button
              type="button"
              className="drawer-btn edit-btn"
              onClick={() => onEdit(client)}
              title="Edit client details"
              aria-label="Edit client"
            >
              <EditIcon size={16} />
              <span>Edit</span>
            </button>
            {canDelete && (
              <button
                type="button"
                className={`drawer-btn delete-btn ${appointmentStore.hasBlockingAppointmentsForClient(client.id) ? 'btn-disabled' : ''}`}
                disabled={appointmentStore.hasBlockingAppointmentsForClient(client.id)}
                onClick={() => {
                  if (!appointmentStore.hasBlockingAppointmentsForClient(client.id)) {
                    onDelete?.(client)
                  }
                }}
                title={
                  appointmentStore.hasBlockingAppointmentsForClient(client.id)
                    ? 'Cannot delete this client because an upcoming or active appointment exists for this client.'
                    : 'Delete client'
                }
                aria-label={
                  appointmentStore.hasBlockingAppointmentsForClient(client.id)
                    ? `Cannot delete ${client.name} (upcoming or active appointment exists)`
                    : 'Delete client'
                }
              >
                <TrashIcon size={16} />
                <span>Delete</span>
              </button>
            )}
            <button
              type="button"
              className="drawer-btn close-btn"
              onClick={onClose}
              title="Close panel"
              aria-label="Close client panel"
            >
              <CloseIcon size={20} />
            </button>
          </div>

        </div>

        {/* Drawer Scrollable Content */}
        <div className="drawer-body">
          {/* Quick Contact Bar */}
          <div className="quick-contact-bar">
            <a href={`tel:${client.phone}`} className="contact-link">
              <PhoneIcon size={15} />
              <span>{client.phone}</span>
            </a>
            {client.email && (
              <a href={`mailto:${client.email}`} className="contact-link">
                <MailIcon size={15} />
                <span>{client.email}</span>
              </a>
            )}
          </div>

          {/* Visit Information Stats */}
          <section className="drawer-section" aria-label="Visit Overview">
            <h3 className="section-title">Visit Information</h3>
            <div className="metrics-grid-3">
              <div className="metric-box">
                <span className="metric-label">Last Visit</span>
                <span className="metric-value">{lastVisitText}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Completed Visits</span>
                <span className="metric-value">{completedVisits}</span>
              </div>
              <div className="metric-box">
                <span className="metric-label">Total Spend</span>
                <span className="metric-value spend">{formatCurrency(client.totalSpend)}</span>
              </div>
            </div>
          </section>

          {/* Client Preferences & Information */}
          <section className="drawer-section" aria-label="Client Preferences">
            <h3 className="section-title">Preferences & Notes</h3>
            <div className="preferences-card">
              {preferredStylist && (
                <div className="pref-item">
                  <span className="pref-label">Preferred Stylist:</span>
                  <span className="pref-value highlight">{preferredStylist.name}</span>
                </div>
              )}
              {client.preferences.hairType && (
                <div className="pref-item">
                  <span className="pref-label">Hair Profile:</span>
                  <span className="pref-value">{client.preferences.hairType}</span>
                </div>
              )}
              {client.preferences.preferredBeverage && (
                <div className="pref-item">
                  <span className="pref-label">Beverage Preference:</span>
                  <span className="pref-value">{client.preferences.preferredBeverage}</span>
                </div>
              )}
              {client.preferences.allergies && (
                <div className="pref-item">
                  <span className="pref-label">Allergies / Sensitivities:</span>
                  <span className="pref-value warning">{client.preferences.allergies}</span>
                </div>
              )}
              {client.dateOfBirth && (
                <div className="pref-item">
                  <span className="pref-label">Date of Birth:</span>
                  <span className="pref-value">{client.dateOfBirth}</span>
                </div>
              )}
              {client.preferences.notes && (
                <div className="pref-item col">
                  <span className="pref-label">Styling Notes:</span>
                  <p className="pref-note-text">{client.preferences.notes}</p>
                </div>
              )}
              {client.notes && (
                <div className="pref-item col">
                  <span className="pref-label">General Salon Notes:</span>
                  <p className="pref-note-text">{client.notes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Service History */}
          <section className="drawer-section" aria-label="Service History">
            <div className="section-header-row">
              <h3 className="section-title">Service History</h3>
              <span className="history-count">{history.length} Entries</span>
            </div>

            {isLoadingHistory ? (
              <div className="history-loading">Loading appointments history...</div>
            ) : history.length === 0 ? (
              <div className="history-empty">
                <p>No appointment records found for this client yet.</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((apt) => (
                  <div key={apt.id} className="history-item">
                    <div className="history-item-top">
                      <span className="history-date">{apt.date}</span>
                      <span className={`status-pill pill-${apt.status}`}>
                        {apt.status}
                      </span>
                    </div>
                    <div className="history-item-mid">
                      <span className="history-service">{apt.service?.name || 'Service'}</span>
                      <span className="history-price">{formatCurrency(apt.price)}</span>
                    </div>
                    <div className="history-item-bottom">
                      <span className="history-staff">
                        Stylist: <strong>{apt.staff?.name || 'Assigned Staff'}</strong>
                      </span>
                      <span className="history-time">{apt.startTime} – {apt.endTime}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quotations & Estimates History */}
          <section className="drawer-section" aria-label="Estimates History">
            <div className="section-header-row">
              <h3 className="section-title">Estimates & Quotations</h3>
              <span className="history-count">{clientQuotations.length} Quotes</span>
            </div>

            {isLoadingQuotes ? (
              <div className="history-loading">Loading quotations history...</div>
            ) : clientQuotations.length === 0 ? (
              <div className="history-empty">
                <p>No estimates or quotations created for this client.</p>
              </div>
            ) : (
              <div className="history-list">
                {clientQuotations.map((q) => (
                  <div key={q.id} className="history-item">
                    <div className="history-item-top">
                      <strong className="quote-number-tag">{q.quotationNumber}</strong>
                      <span className={`status-pill pill-${q.status}`}>
                        {q.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="history-item-mid">
                      <span className="history-service">Valid until {q.validUntil}</span>
                      <span className="history-price" style={{ color: '#c5a059' }}>{formatCurrency(q.totalAmount)}</span>
                    </div>
                    {q.convertedInvoiceId && (
                      <div className="history-item-bottom">
                        <span style={{ fontSize: '0.75rem', color: '#7c3aed' }}>
                          Converted to Invoice
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}
