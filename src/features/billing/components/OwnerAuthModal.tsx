import React, { useState, useEffect } from 'react'
import { userService } from '../../../services/userService.ts'
import { sessionService } from '../../../services/sessionService.ts'
import { credentialService } from '../../../services/credentialService.ts'
import type { User } from '../../../types/models.ts'
import { ShieldCheckIcon, CloseIcon, AlertTriangleIcon } from '../../../components/Icons.tsx'
import './QuickClientModal.css'

interface OwnerAuthModalProps {
  isOpen: boolean
  requestedDiscountPercent: number
  requestedDiscountAmount: number
  subtotal: number
  invoiceId?: string
  onClose: () => void
  onAuthorized: (grantId: string, authorizingOwner: string) => void
}

export const OwnerAuthModal: React.FC<OwnerAuthModalProps> = ({
  isOpen,
  requestedDiscountPercent,
  requestedDiscountAmount,
  subtotal,
  invoiceId,
  onClose,
  onAuthorized,
}) => {
  const [owners, setOwners] = useState<User[]>([])
  const [selectedEmail, setSelectedEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState<boolean>(false)

  useEffect(() => {
    if (!isOpen) return
    setPassword('')
    setError(null)

    // Load registered salon owners scoped strictly to active salon session
    const currentSalonId = sessionService.getCurrentSession()?.salonId
    userService.getUsers().then((users) => {
      const salonOwners = users.filter(
        (u) => u.role === 'OWNER' && u.active && (!currentSalonId || u.salonId === currentSalonId)
      )
      setOwners(salonOwners)
      if (salonOwners.length > 0) {
        setSelectedEmail(salonOwners[0].email)
      }
    })
  }, [isOpen])

  if (!isOpen) return null

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmail) {
      setError('Please select an active Salon Owner.')
      return
    }
    if (!password) {
      setError('Owner password is required to authorize special discounts.')
      return
    }

    setError(null)
    setIsValidating(true)

    try {
      const currentSalonId = sessionService.getCurrentSession()?.salonId || 'salon-luma-01'
      const effectiveInvoiceId = invoiceId || 'inv-pos-draft'
      const effectiveSubtotal = subtotal > 0 ? subtotal : (requestedDiscountAmount > 0 ? requestedDiscountAmount / 0.1 : 1000)

      // Request server-authenticated one-time discount approval grant (Phase 2.2 P0)
      const approval = await credentialService.requestOwnerDiscountApproval({
        salonId: currentSalonId,
        invoiceId: effectiveInvoiceId,
        ownerEmail: selectedEmail,
        ownerPassword: password,
        subtotal: effectiveSubtotal,
        discountAmount: requestedDiscountAmount,
        discountPercent: requestedDiscountPercent,
      })

      onAuthorized(approval.grantId, approval.ownerName)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Authorization failed. Please try again.')
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <div className="pos-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="pos-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="pos-modal-header">
          <div className="modal-header-left">
            <span className="modal-icon-badge warning">
              <ShieldCheckIcon size={18} />
            </span>
            <h3 className="modal-title">Manager Authorization Required</h3>
          </div>
          <button type="button" className="btn-close-modal" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="auth-warning-banner">
          <AlertTriangleIcon size={18} />
          <span>
            Discount of <strong>{requestedDiscountPercent.toFixed(1)}% (₹{requestedDiscountAmount.toFixed(2)})</strong> exceeds the standard receptionist limit (10.0%). Salon Owner credentials are required to apply this discount.
          </span>
        </div>

        <form onSubmit={handleAuthorize} className="pos-modal-form">
          {error && <div className="pos-form-alert error">{error}</div>}

          <div className="form-group">
            <label className="form-label" htmlFor="owner-email-select">
              Authorizing Salon Owner
            </label>
            <select
              id="owner-email-select"
              className="pos-input pos-select"
              value={selectedEmail}
              onChange={(e) => setSelectedEmail(e.target.value)}
            >
              {owners.map((o) => (
                <option key={o.id} value={o.email}>
                  {o.name} ({o.email})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="owner-auth-password">
              Owner Password <span className="req">*</span>
            </label>
            <input
              id="owner-auth-password"
              type="password"
              className="pos-input"
              placeholder="Enter owner password to authorize"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>

          <div className="pos-modal-footer">
            <button
              type="button"
              className="btn-modal-cancel"
              onClick={onClose}
              disabled={isValidating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-modal-submit gold"
              disabled={isValidating}
            >
              {isValidating ? 'Verifying with Server...' : 'Authorize Discount'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
