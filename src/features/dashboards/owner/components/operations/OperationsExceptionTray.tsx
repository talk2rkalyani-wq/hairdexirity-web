// ==============================================================================
// Luma Salon — Operations Management: Zone 2 Operational Exception Tray
// ==============================================================================

import React, { useState } from 'react'
import type {
  OperationsException,
  ExceptionSeverity,
} from '../../../../../services/operationsManagementService.ts'
import type { NavId } from '../../../../../types/salon.ts'
import { AlertTriangleIcon, CheckIcon } from '../../../../../components/Icons.tsx'

interface OperationsExceptionTrayProps {
  exceptions: OperationsException[]
  onNavigate: (route: NavId) => void
}

export const OperationsExceptionTray: React.FC<OperationsExceptionTrayProps> = ({
  exceptions,
  onNavigate,
}) => {
  const [severityFilter, setSeverityFilter] = useState<'ALL' | ExceptionSeverity>('ALL')

  const filteredExceptions = exceptions.filter((exc) => {
    if (severityFilter === 'ALL') return true
    return exc.severity === severityFilter
  })

  const criticalCount = exceptions.filter((e) => e.severity === 'CRITICAL').length
  const warningCount = exceptions.filter((e) => e.severity === 'WARNING').length
  const infoCount = exceptions.filter((e) => e.severity === 'INFO').length

  const getActionLabel = (target: string) => {
    switch (target) {
      case 'receptionist/check-in':
        return 'Open Check-In Desk →'
      case 'staff':
        return 'View Staff Roster →'
      case 'inventory':
        return 'Open Inventory →'
      default:
        return 'View in Calendar →'
    }
  }

  return (
    <div className="ops-exception-tray">
      {/* Tray Header */}
      <div className="ops-tray-header">
        <div className="ops-tray-title-group">
          <h2 className="ops-tray-title">
            <AlertTriangleIcon size={18} />
            <span>Today's Operational Exceptions</span>
          </h2>
          {exceptions.length > 0 ? (
            <span className="ops-tray-badge badge-critical">
              {exceptions.length} Attention Required
            </span>
          ) : (
            <span className="ops-tray-badge badge-clear">
              ✓ All Clear
            </span>
          )}
        </div>

        {/* Severity Filter Pills */}
        {exceptions.length > 0 && (
          <div className="ops-filter-pills">
            <button
              type="button"
              className={`ops-filter-pill-btn ${severityFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setSeverityFilter('ALL')}
            >
              All ({exceptions.length})
            </button>
            {criticalCount > 0 && (
              <button
                type="button"
                className={`ops-filter-pill-btn ${severityFilter === 'CRITICAL' ? 'active' : ''}`}
                onClick={() => setSeverityFilter('CRITICAL')}
              >
                Critical ({criticalCount})
              </button>
            )}
            {warningCount > 0 && (
              <button
                type="button"
                className={`ops-filter-pill-btn ${severityFilter === 'WARNING' ? 'active' : ''}`}
                onClick={() => setSeverityFilter('WARNING')}
              >
                Warnings ({warningCount})
              </button>
            )}
            {infoCount > 0 && (
              <button
                type="button"
                className={`ops-filter-pill-btn ${severityFilter === 'INFO' ? 'active' : ''}`}
                onClick={() => setSeverityFilter('INFO')}
              >
                Notes ({infoCount})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Exception List */}
      {exceptions.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1.25rem',
          borderRadius: '10px',
          background: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          color: '#34d399',
          fontSize: '0.875rem',
        }}>
          <CheckIcon size={20} />
          <div>
            <strong>Zero Operational Exceptions:</strong> Today's schedule, customer arrivals, and styling chairs are running cleanly without detected conflicts or delays.
          </div>
        </div>
      ) : filteredExceptions.length === 0 ? (
        <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>
          No exceptions matching severity filter "{severityFilter}".
        </div>
      ) : (
        <div className="ops-exception-list">
          {filteredExceptions.map((exc) => {
            const sevClass =
              exc.severity === 'CRITICAL'
                ? 'card-sev-critical'
                : exc.severity === 'WARNING'
                ? 'card-sev-warning'
                : 'card-sev-info'

            return (
              <div key={exc.id} className={`ops-exception-card ${sevClass}`}>
                <div className="ops-exception-body">
                  <div className="ops-exception-headline">
                    <span>{exc.title}</span>
                  </div>
                  <div className="ops-exception-desc">{exc.description}</div>
                </div>

                <button
                  type="button"
                  className="btn-resolve-exception"
                  onClick={() => onNavigate(exc.targetRoute as NavId)}
                >
                  {getActionLabel(exc.targetRoute)}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

