// ==============================================================================
// Luma Salon — Executive Date Range Selector (Phase 2)
// Asia/Kolkata Localized Date Presets & Custom Boundary Selection
// ==============================================================================

import React, { useState } from 'react'
import type { DateRange, DateRangePreset } from '../../../../services/ownerDashboardService.ts'
import { formatDate } from '../../../../utils/formatters.ts'
import { CalendarIcon } from '../../../../components/Icons.tsx'

interface DateRangeSelectorProps {
  currentRange: DateRange
  onSelectPreset: (preset: DateRangePreset, customStart?: string, customEnd?: string) => void
  disabled?: boolean
}

const PRESET_OPTIONS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'custom', label: 'Custom' },
]

export const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({
  currentRange,
  onSelectPreset,
  disabled = false,
}) => {
  const [showCustomModal, setShowCustomModal] = useState(false)
  const [customStart, setCustomStart] = useState(currentRange.startDate)
  const [customEnd, setCustomEnd] = useState(currentRange.endDate)
  const [validationError, setValidationError] = useState<string | null>(null)

  const handlePresetClick = (preset: DateRangePreset) => {
    if (disabled) return
    if (preset === 'custom') {
      setShowCustomModal(true)
      return
    }
    setShowCustomModal(false)
    onSelectPreset(preset)
  }

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault()
    if (!customStart || !customEnd) {
      setValidationError('Both start and end dates are required.')
      return
    }
    if (customStart > customEnd) {
      setValidationError('Start date cannot be after end date.')
      return
    }
    setValidationError(null)
    setShowCustomModal(false)
    onSelectPreset('custom', customStart, customEnd)
  }

  return (
    <div className="date-range-selector-container">
      {/* Preset Pill Buttons */}
      <div className="preset-pills-row" role="group" aria-label="Date Range Presets">
        {PRESET_OPTIONS.map((opt) => {
          const isActive = currentRange.preset === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              className={`preset-pill-btn ${isActive ? 'active' : ''}`}
              onClick={() => handlePresetClick(opt.id)}
              disabled={disabled}
              aria-pressed={isActive}
            >
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* Selected Range Display Banner */}
      <div className="active-range-indicator">
        <CalendarIcon size={14} />
        <span className="indicator-label">{currentRange.label}:</span>
        <span className="indicator-dates">
          {formatDate(currentRange.startDate, 'medium')}
          {currentRange.startDate !== currentRange.endDate && (
            <> &ndash; {formatDate(currentRange.endDate, 'medium')}</>
          )}
        </span>
        <span className="comparison-period-note">
          (vs. {formatDate(currentRange.previousStartDate, 'short')} &ndash;{' '}
          {formatDate(currentRange.previousEndDate, 'short')})
        </span>
      </div>

      {/* Custom Date Range Popover / Form */}
      {showCustomModal && (
        <div className="custom-range-dialog-backdrop" onClick={() => setShowCustomModal(false)}>
          <div
            className="custom-range-dialog-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Custom Date Range"
          >
            <div className="dialog-header">
              <h3 className="dialog-title">Select Custom Date Range</h3>
              <button
                type="button"
                className="dialog-close-btn"
                onClick={() => setShowCustomModal(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleApplyCustom} className="custom-range-form">
              <div className="date-inputs-grid">
                <div className="date-field-group">
                  <label htmlFor="custom-start-date" className="date-field-label">
                    From (Asia/Kolkata)
                  </label>
                  <input
                    id="custom-start-date"
                    type="date"
                    className="date-picker-input"
                    value={customStart}
                    onChange={(e) => {
                      setCustomStart(e.target.value)
                      setValidationError(null)
                    }}
                    required
                  />
                </div>

                <div className="date-field-group">
                  <label htmlFor="custom-end-date" className="date-field-label">
                    To (Asia/Kolkata)
                  </label>
                  <input
                    id="custom-end-date"
                    type="date"
                    className="date-picker-input"
                    value={customEnd}
                    onChange={(e) => {
                      setCustomEnd(e.target.value)
                      setValidationError(null)
                    }}
                    required
                  />
                </div>
              </div>

              {validationError && (
                <div className="custom-range-error" role="alert">
                  {validationError}
                </div>
              )}

              <div className="dialog-actions-row">
                <button
                  type="button"
                  className="btn-dialog-cancel"
                  onClick={() => setShowCustomModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-dialog-apply">
                  Apply Filter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

