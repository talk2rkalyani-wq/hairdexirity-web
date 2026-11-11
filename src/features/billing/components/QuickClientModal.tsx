import React, { useState } from 'react'
import type { Client } from '../../../types/models.ts'
import { clientService } from '../../../services/clientService.ts'
import { CloseIcon, UsersIcon } from '../../../components/Icons.tsx'
import './QuickClientModal.css'

interface QuickClientModalProps {
  isOpen: boolean
  onClose: () => void
  onClientCreated: (client: Client) => void
}

export const QuickClientModal: React.FC<QuickClientModalProps> = ({
  isOpen,
  onClose,
  onClientCreated,
}) => {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState<'Female' | 'Male' | 'Other'>('Female')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedPhone = phone.trim()

    if (!trimmedName) {
      setError('Client name is required.')
      return
    }

    if (!trimmedPhone || trimmedPhone.length < 7) {
      setError('A valid phone number is required.')
      return
    }

    setError(null)
    setIsSubmitting(true)

    try {
      const newClient = await clientService.createClient({
        name: trimmedName,
        phone: trimmedPhone,
        email: email.trim() || `${trimmedName.toLowerCase().replace(/\s+/g, '')}@guest.example.com`,
        notes: `Quick POS registration (${gender})`,
        preferences: {
          notes: `Added via Quick POS registration (${gender})`,
        },
      })
      onClientCreated(newClient)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create client.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pos-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal-header">
          <div className="modal-header-left">
            <span className="modal-icon-badge">
              <UsersIcon size={18} />
            </span>
            <h3 className="modal-title">Quick Add Customer</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="pos-modal-form">
          {error && <div className="pos-form-alert error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="quick-client-name">
              Full Name <span className="req">*</span>
            </label>
            <input
              id="quick-client-name"
              type="text"
              className="pos-input"
              placeholder="e.g. Ananya Roy"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="quick-client-phone">
              Mobile Phone <span className="req">*</span>
            </label>
            <input
              id="quick-client-phone"
              type="tel"
              className="pos-input"
              placeholder="e.g. +91 98765 43210"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="quick-client-email">
              Email Address (Optional)
            </label>
            <input
              id="quick-client-email"
              type="email"
              className="pos-input"
              placeholder="e.g. ananya@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Client Gender</label>
            <div className="gender-pills-row">
              {(['Female', 'Male', 'Other'] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`gender-pill ${gender === g ? 'active' : ''}`}
                  onClick={() => setGender(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="pos-modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Registering...' : 'Save & Select Customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
