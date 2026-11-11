import React from 'react'
import { TrashIcon, CloseIcon } from './Icons'
import './BulkActionBar.css'

interface BulkActionBarProps {
  selectedCount: number
  entityName?: string
  onDelete: () => void
  onClearSelection: () => void
  disabled?: boolean
}

export const BulkActionBar: React.FC<BulkActionBarProps> = ({
  selectedCount,
  entityName = 'records',
  onDelete,
  onClearSelection,
  disabled = false,
}) => {
  if (selectedCount <= 0) return null

  return (
    <aside className="bulk-action-bar" role="toolbar" aria-label="Bulk actions toolbar">
      <div className="bulk-action-inner">
        <div className="bulk-count-group">
          <span className="bulk-count-badge">{selectedCount}</span>
          <span className="bulk-count-text">
            {selectedCount === 1 ? `1 ${entityName.replace(/s$/, '')} selected` : `${selectedCount} ${entityName} selected`}
          </span>
        </div>

        <div className="bulk-actions-group">
          <button
            type="button"
            className="bulk-delete-btn"
            onClick={onDelete}
            disabled={disabled}
            id="bulk-delete-action-btn"
            aria-label={`Delete ${selectedCount} selected ${entityName}`}
          >
            <TrashIcon size={16} />
            <span>Delete Selected</span>
          </button>

          <button
            type="button"
            className="bulk-cancel-btn"
            onClick={onClearSelection}
            disabled={disabled}
            id="bulk-cancel-selection-btn"
            aria-label="Clear selection"
            title="Clear selected checkboxes"
          >
            <CloseIcon size={14} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </aside>
  )
}
