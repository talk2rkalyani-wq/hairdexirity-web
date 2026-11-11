import React, { useState, useEffect } from 'react'
import type { EmployeeSpecialty, User, UserRole, OwnerDesignation } from '../../../types/models'
import { userService } from '../../../services/userService'
import { sessionService } from '../../../services/sessionService'
import './CreateEmployeeModal.css'

interface CreateEmployeeModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: (user: User) => void
}

export const CreateEmployeeModal: React.FC<CreateEmployeeModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const currentSession = sessionService.getCurrentSession()
  const isAdmin = currentSession?.role === 'ADMIN'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<UserRole>(isAdmin ? 'OWNER' : 'EMPLOYEE')
  const [ownerDesignation, setOwnerDesignation] = useState<OwnerDesignation>('OWNER_1')
  const [specialty, setSpecialty] = useState<EmployeeSpecialty>('Hair')
  const [skillsInput, setSkillsInput] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isAdmin) {
      setRole('OWNER')
    } else {
      setRole('EMPLOYEE')
    }
  }, [isAdmin, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setErrorMessage(isAdmin ? 'Please enter the owner full name.' : 'Please enter a user name.')
      return
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    try {
      setIsSubmitting(true)
      setErrorMessage(null)

      const effectiveRole = isAdmin ? 'OWNER' : role

      const skills = skillsInput
        ? skillsInput.split(',').map((s) => s.trim()).filter(Boolean)
        : [`${specialty} Specialist`]

      const newUser = await userService.createUser({
        name: name.trim(),
        email: email.trim(),
        role: effectiveRole,
        phone: phone.trim() || undefined,
        specialty: effectiveRole === 'EMPLOYEE' ? specialty : undefined,
        skills: effectiveRole === 'EMPLOYEE' ? skills : undefined,
        initialPassword: password.trim() || undefined,
        ownerDesignation: effectiveRole === 'OWNER' ? ownerDesignation : undefined,
      })

      onCreated(newUser)
      // Reset form
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      setRole(isAdmin ? 'OWNER' : 'EMPLOYEE')
      setSpecialty('Hair')
      setSkillsInput('')
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create user.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="user-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="user-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="document"
      >
        <div className="user-modal-header">
          <div>
            <span className="user-modal-kicker">
              {isAdmin ? '🛡️ Root Administrator Authority' : '💇 Team Onboarding'}
            </span>
            <h2 className="user-modal-title">
              {isAdmin ? 'Create Salon Owner Credentials' : 'Create Staff Profile'}
            </h2>
          </div>
          <button
            type="button"
            className="user-modal-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {errorMessage && (
          <div className="user-modal-error-banner" role="alert">
            <span className="error-icon">⚠️</span>
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="user-modal-form">
          <div className="form-row">
            <label className="form-label" htmlFor="emp-name">
              Full Name <span className="req">*</span>
            </label>
            <input
              id="emp-name"
              type="text"
              className="form-input"
              placeholder={isAdmin ? 'e.g. Rajesh Sharma' : 'e.g. Aarav Mehta'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="emp-email">
              Email Address <span className="req">*</span>
            </label>
            <input
              id="emp-email"
              type="email"
              className="form-input"
              placeholder={isAdmin ? 'e.g. rajesh.owner@hairdexirity.example.com' : 'e.g. stylist@hairdexirity.example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="emp-phone">
              Phone Number
            </label>
            <input
              id="emp-phone"
              type="tel"
              className="form-input"
              placeholder="+91 98110 00000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="emp-password">
              Initial Password <span className="form-hint-inline">(Default: Luma@2026!)</span>
            </label>
            <input
              id="emp-password"
              type="password"
              className="form-input"
              placeholder="Leave blank to use default (Luma@2026!)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
          </div>

          {isAdmin ? (
            <div className="form-row">
              <label className="form-label" htmlFor="owner-designation">
                Owner Designation <span className="req">*</span>
              </label>
              <select
                id="owner-designation"
                className="form-select"
                value={ownerDesignation}
                onChange={(e) => setOwnerDesignation(e.target.value as OwnerDesignation)}
              >
                <option value="OWNER_1">Owner 1 (Primary Salon Owner)</option>
                <option value="OWNER_2">Owner 2 (Co-Owner)</option>
              </select>
              <span className="form-hint">
                Root Administrator can provision up to 2 approved Salon Owners with full operational access.
              </span>
            </div>
          ) : (
            <>
              <div className="form-grid-2col">
                <div className="form-row">
                  <label className="form-label" htmlFor="emp-role">
                    User Role <span className="req">*</span>
                  </label>
                  <select
                    id="emp-role"
                    className="form-select"
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                  >
                    <option value="EMPLOYEE">EMPLOYEE (Stylist / Specialist)</option>
                    <option value="RECEPTIONIST">RECEPTIONIST (Front Desk & Bookings)</option>
                  </select>
                  <span className="form-hint">
                    {role === 'EMPLOYEE'
                      ? 'Creates employee account and linked stylist profile.'
                      : 'Creates front desk receptionist account.'}
                  </span>
                </div>

                {role === 'EMPLOYEE' && (
                  <div className="form-row">
                    <label className="form-label" htmlFor="emp-specialty">
                      Primary Specialty <span className="req">*</span>
                    </label>
                    <select
                      id="emp-specialty"
                      className="form-select"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value as EmployeeSpecialty)}
                    >
                      <option value="Hair">Hair Specialist</option>
                      <option value="Nail">Nail Artist / Specialist</option>
                      <option value="Skin">Skin Specialist</option>
                    </select>
                  </div>
                )}
              </div>

              {role === 'EMPLOYEE' && (
                <div className="form-row">
                  <label className="form-label" htmlFor="emp-skills">
                    Specific Skills & Services (Comma-separated)
                  </label>
                  <input
                    id="emp-skills"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Nail Art, Gel Extensions, Acrylics, Pedicure"
                    value={skillsInput}
                    onChange={(e) => setSkillsInput(e.target.value)}
                  />
                  <span className="form-hint">
                    Used for stylist capability matching and automatic service assignments.
                  </span>
                </div>
              )}
            </>
          )}

          <div className="user-modal-actions">
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
              {isSubmitting
                ? 'Saving...'
                : isAdmin
                ? 'Create Owner Credentials'
                : role === 'EMPLOYEE'
                ? 'Create Employee Profile'
                : 'Create Receptionist Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
