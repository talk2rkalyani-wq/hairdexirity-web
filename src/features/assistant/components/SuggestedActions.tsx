import React from 'react'
import type { SuggestedAction } from '../../../types/salon'
import './SuggestedActions.css'

interface SuggestedActionsProps {
  actions: SuggestedAction[]
  onSelectAction: (query: string) => void
}

export const SuggestedActions: React.FC<SuggestedActionsProps> = ({
  actions,
  onSelectAction,
}) => {
  return (
    <section className="suggested-actions-container" aria-label="Suggested Actions">
      <h2 className="suggested-actions-title">SUGGESTED ACTIONS</h2>

      <div className="chips-grid" role="group" aria-label="Quick prompt suggestions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="action-chip"
            onClick={() => onSelectAction(action.query)}
            aria-label={`Suggest action: ${action.label}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  )
}
