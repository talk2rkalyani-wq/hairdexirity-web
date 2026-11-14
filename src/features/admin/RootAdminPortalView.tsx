import React, { useState, useEffect, useCallback } from 'react'
import type { User, UserSession } from '../../types/models'
import { userService } from '../../services/userService'
import { authService } from '../../services/authService'
import { DEFAULT_TEST_PASSWORD } from '../../services/credentialService'
import { ROOT_ADMIN_CONFIG, ROOT_ADMIN_EMAIL } from '../../config/adminConfig'
import './RootAdminPortalView.css'

interface RootAdminPortalViewProps {
  session: UserSession
  onLogout: () => void
}

interface OwnerSlotFormState {
  name: string
  email: string
  phone: string
  password: string
  showPassword: boolean
}

const emptyFormState: OwnerSlotFormState = {
  name: '',
  email: '',
  phone: '',
  password: DEFAULT_TEST_PASSWORD,
  showPassword: false,
}

export const RootAdminPortalView: React.FC<RootAdminPortalViewProps> = ({ session, onLogout }) => {
  const [owners, setOwners] = useState<User[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submittingSlot, setSubmittingSlot] = useState<'OWNER_1' | 'OWNER_2' | null>(null)

  // Forms for Slot 1 and Slot 2
  const [slot1Form, setSlot1Form] = useState<OwnerSlotFormState>({ ...emptyFormState })
  const [slot2Form, setSlot2Form] = useState<OwnerSlotFormState>({ ...emptyFormState })

  // Reset password modal state
  const [resetModalOwner, setResetModalOwner] = useState<User | null>(null)
  const [newPasswordInput, setNewPasswordInput] = useState('')
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 4000)
  }, [])

  const loadOwners = useCallback(async () => {
    try {
      setIsLoading(true)
      const all = await userService.getUsers()
      const salonOwners = all.filter((u) => u.role === 'OWNER')
      setOwners(salonOwners)
    } catch (err) {
      console.error('Failed to load salon owners:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadOwners()
    const unsub = userService.subscribe((updated) => {
      setOwners(updated.filter((u) => u.role === 'OWNER'))
    })
    return () => unsub()
  }, [loadOwners])

  // Slot identification strictly by owner designation
  const owner1 = owners.find((o) => o.ownerDesignation === 'OWNER_1') || null
  const owner2 = owners.find((o) => o.ownerDesignation === 'OWNER_2') || null

  // Provisioning handler for Slot 1 or Slot 2
  const handleProvisionOwner = async (slot: 'OWNER_1' | 'OWNER_2') => {
    const form = slot === 'OWNER_1' ? slot1Form : slot2Form
    setErrorMessage(null)

    if (!form.name.trim()) {
      setErrorMessage(`Please enter a full name for ${slot === 'OWNER_1' ? 'Owner 1' : 'Owner 2'}.`)
      return
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      setErrorMessage(`Please enter a valid email address for ${slot === 'OWNER_1' ? 'Owner 1' : 'Owner 2'}.`)
      return
    }
    if (!form.password || form.password.trim().length < 6) {
      setErrorMessage('Password must be at least 6 characters.')
      return
    }

    try {
      setSubmittingSlot(slot)
      const newOwner = await userService.createUser(
        {
          name: form.name.trim(),
          email: form.email.trim(),
          role: 'OWNER',
          phone: form.phone.trim() || undefined,
          initialPassword: form.password.trim() || DEFAULT_TEST_PASSWORD,
          ownerDesignation: slot,
        },
        session
      )

      showToast(`🎉 ${slot === 'OWNER_1' ? 'Owner 1' : 'Owner 2'} (${newOwner.name}) credentials provisioned and registered in Supabase Cloud!`)
      if (slot === 'OWNER_1') {
        setSlot1Form({ ...emptyFormState })
      } else {
        setSlot2Form({ ...emptyFormState })
      }
      await loadOwners()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to provision salon owner.'
      setErrorMessage(msg)
    } finally {
      setSubmittingSlot(null)
    }
  }

  // Toggle owner active status
  const handleToggleOwnerActive = async (owner: User) => {
    try {
      const updated = await userService.toggleUserActive(owner.id, !owner.active, session)
      showToast(`${owner.name} (${owner.ownerDesignation || 'Owner'}) is now ${updated.active ? 'Active' : 'Deactivated'}.`)
      await loadOwners()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle status.'
      setErrorMessage(msg)
    }
  }

  // Delete / Release Owner slot
  const handleDeleteOwner = async (owner: User) => {
    const confirmed = window.confirm(
      `Are you sure you want to remove ${owner.name} (${owner.ownerDesignation || 'Owner'})? This will release the owner slot.`
    )
    if (!confirmed) return

    try {
      await userService.deleteUser(owner.id, session)
      showToast(`${owner.name} was removed. Slot is now available.`)
      await loadOwners()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove owner.'
      setErrorMessage(msg)
    }
  }

  // Open password reset modal
  const handleOpenPasswordReset = (owner: User) => {
    setResetModalOwner(owner)
    setNewPasswordInput('')
  }

  const handleConfirmPasswordReset = async () => {
    if (!resetModalOwner) return

    try {
      setIsResettingPassword(true)
      const res = await authService.requestPasswordReset(resetModalOwner.email)
      showToast(res.message || `Password recovery link sent to ${resetModalOwner.email}!`)
      setResetModalOwner(null)
      setNewPasswordInput('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send password recovery link.'
      alert(msg)
    } finally {
      setIsResettingPassword(false)
    }
  }

  const totalOwnersCount = owners.length

  return (
    <div className="root-admin-portal">
      {/* Ambient background glows */}
      <div className="portal-ambient-orb orb-gold" aria-hidden="true" />
      <div className="portal-ambient-orb orb-indigo" aria-hidden="true" />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="portal-toast" role="status" aria-live="polite">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="portal-header">
        <div className="portal-brand-area">
          <div className="portal-brand-logo">
            <span className="brand-luma">Hair</span>
            <span className="brand-salon">Dexirity</span>
          </div>
          <span className="portal-badge">🛡️ Platform Administration Portal</span>
        </div>

        <div className="portal-header-actions">
          <div className="portal-admin-profile">
            <div className="admin-avatar">
              {ROOT_ADMIN_CONFIG.name.charAt(0).toUpperCase()}
            </div>
            <div className="admin-info-text">
              <span className="admin-name">{ROOT_ADMIN_CONFIG.name}</span>
              <span className="admin-email">{ROOT_ADMIN_EMAIL}</span>
            </div>
          </div>

          <button
            type="button"
            className="btn-portal-signout"
            onClick={onLogout}
            title="Sign out of Root Administrator session"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="portal-main-content">
        {/* Hero Section */}
        <div className="portal-hero">
          <div className="hero-text-block">
            <div className="hero-kicker">Platform Authority &amp; Separation of Duties</div>
            <h1 className="hero-title">Salon Owner Provisioning Portal</h1>
            <p className="hero-subtitle">
              As the platform Root Administrator, this page is exclusively for provisioning and managing credentials for the <strong>2 Salon Owners</strong>.
              All salon operational tools (AI Assistant, Calendar, Clients, Staff Roster, Services) are isolated for Salon Owners and their employees.
            </p>
          </div>

          <div className="hero-status-card">
            <span className="status-metric-label">Owner Slots Occupied</span>
            <div className="status-metric-value">
              <span className="metric-current">{totalOwnersCount}</span>
              <span className="metric-slash">/</span>
              <span className="metric-max">2</span>
            </div>
            <div className="capacity-bar-wrap">
              <div
                className="capacity-bar-fill"
                style={{ width: `${(totalOwnersCount / 2) * 100}%` }}
              />
            </div>
            <span className="status-metric-sub">
              {totalOwnersCount === 2
                ? '✅ Maximum 2 Salon Owners Provisioned'
                : totalOwnersCount === 1
                ? '1 slot remaining for Co-Owner'
                : '2 slots available for provisioning'}
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="portal-error-banner" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
            <button
              type="button"
              className="btn-dismiss-error"
              onClick={() => setErrorMessage(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* The 2 Owner Slots Grid */}
        <div className="owner-slots-grid">
          {/* =============================================================== */}
          {/* SLOT 1: OWNER 1 (Primary Salon Owner) */}
          {/* =============================================================== */}
          <div className={`owner-slot-card ${owner1 ? 'slot-assigned' : 'slot-empty'}`}>
            <div className="slot-card-header">
              <div className="slot-title-area">
                <span className="slot-icon">👑</span>
                <div>
                  <span className="slot-kicker">Designation: OWNER_1</span>
                  <h2 className="slot-title">Salon Owner 1 (Primary Owner)</h2>
                </div>
              </div>
              <span className={`slot-status-pill ${owner1 ? (owner1.active ? 'pill-active' : 'pill-inactive') : 'pill-open'}`}>
                {owner1 ? (owner1.active ? '● Active' : '○ Deactivated') : '○ Available Slot'}
              </span>
            </div>

            {isLoading ? (
              <div className="slot-loading">Loading Owner 1 status...</div>
            ) : owner1 ? (
              /* Assigned Slot View */
              <div className="slot-assigned-body">
                <div className="owner-profile-summary">
                  <div className="owner-avatar-lg">
                    {owner1.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="owner-details">
                    <h3 className="owner-name-display">{owner1.name}</h3>
                    <div className="owner-meta-item">
                      <span className="meta-icon">✉️</span>
                      <span className="meta-text">{owner1.email}</span>
                    </div>
                    {owner1.phone && (
                      <div className="owner-meta-item">
                        <span className="meta-icon">📞</span>
                        <span className="meta-text">{owner1.phone}</span>
                      </div>
                    )}
                    <div className="owner-meta-item">
                      <span className="meta-icon">📅</span>
                      <span className="meta-text">
                        Provisioned: {new Date(owner1.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="owner-meta-item">
                      <span className="meta-icon">{owner1.authUserId ? '⚡' : '☁️'}</span>
                      <span className="meta-text" style={{ color: owner1.authUserId ? '#38bdf8' : '#94a3b8' }}>
                        {owner1.authUserId ? 'Supabase Auth Linked' : 'Profile Provisioned (Cloud)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="owner-credentials-hint">
                  <div className="hint-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Owner Login Credentials Active</span>
                  </div>
                  <p>
                    This owner can log in at <code>#/login</code> to access full salon features, calendar, staff onboarding, and financial summaries.
                  </p>
                </div>

                <div className="slot-actions-row">
                  <button
                    type="button"
                    className={`btn-slot-action ${owner1.active ? 'btn-deactivate' : 'btn-activate'}`}
                    onClick={() => handleToggleOwnerActive(owner1)}
                  >
                    {owner1.active ? 'Deactivate Owner' : 'Reactivate Owner'}
                  </button>
                  <button
                    type="button"
                    className="btn-slot-action btn-reset-pw"
                    onClick={() => handleOpenPasswordReset(owner1)}
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    className="btn-slot-action btn-delete-slot"
                    onClick={() => handleDeleteOwner(owner1)}
                  >
                    Release Slot
                  </button>
                </div>
              </div>
            ) : (
              /* Empty Slot Provisioning Form */
              <form
                className="slot-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleProvisionOwner('OWNER_1')
                }}
              >
                <div className="form-field">
                  <label htmlFor="owner1-name">Owner Full Name *</label>
                  <input
                    id="owner1-name"
                    type="text"
                    className="portal-input"
                    placeholder="e.g. Rajesh Sharma"
                    value={slot1Form.name}
                    onChange={(e) => setSlot1Form({ ...slot1Form, name: e.target.value })}
                    required
                    disabled={submittingSlot === 'OWNER_1'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner1-email">Owner Email Address *</label>
                  <input
                    id="owner1-email"
                    type="email"
                    className="portal-input"
                    placeholder="e.g. rajesh.owner@hairdexirity.example.com"
                    value={slot1Form.email}
                    onChange={(e) => setSlot1Form({ ...slot1Form, email: e.target.value })}
                    required
                    disabled={submittingSlot === 'OWNER_1'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner1-phone">Phone Number (Optional)</label>
                  <input
                    id="owner1-phone"
                    type="tel"
                    className="portal-input"
                    placeholder="+91 98110 00000"
                    value={slot1Form.phone}
                    onChange={(e) => setSlot1Form({ ...slot1Form, phone: e.target.value })}
                    disabled={submittingSlot === 'OWNER_1'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner1-pass">Initial Password *</label>
                  <div className="password-input-wrap">
                    <input
                      id="owner1-pass"
                      type={slot1Form.showPassword ? 'text' : 'password'}
                      className="portal-input"
                      placeholder="••••••••••••"
                      value={slot1Form.password}
                      onChange={(e) => setSlot1Form({ ...slot1Form, password: e.target.value })}
                      required
                      minLength={6}
                      disabled={submittingSlot === 'OWNER_1'}
                    />
                    <button
                      type="button"
                      className="btn-toggle-eye"
                      onClick={() => setSlot1Form({ ...slot1Form, showPassword: !slot1Form.showPassword })}
                      tabIndex={-1}
                    >
                      {slot1Form.showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <span className="field-hint">Default suggested: Luma@2026!</span>
                </div>

                <button
                  type="submit"
                  className="btn-provision-submit"
                  disabled={submittingSlot === 'OWNER_1'}
                >
                  {submittingSlot === 'OWNER_1' ? 'Provisioning Owner 1...' : '👑 Provision Owner 1 Credentials'}
                </button>
              </form>
            )}
          </div>

          {/* =============================================================== */}
          {/* SLOT 2: OWNER 2 (Co-Owner) */}
          {/* =============================================================== */}
          <div className={`owner-slot-card ${owner2 ? 'slot-assigned' : 'slot-empty'}`}>
            <div className="slot-card-header">
              <div className="slot-title-area">
                <span className="slot-icon">👑</span>
                <div>
                  <span className="slot-kicker">Designation: OWNER_2</span>
                  <h2 className="slot-title">Salon Owner 2 (Co-Owner)</h2>
                </div>
              </div>
              <span className={`slot-status-pill ${owner2 ? (owner2.active ? 'pill-active' : 'pill-inactive') : 'pill-open'}`}>
                {owner2 ? (owner2.active ? '● Active' : '○ Deactivated') : '○ Available Slot'}
              </span>
            </div>

            {isLoading ? (
              <div className="slot-loading">Loading Owner 2 status...</div>
            ) : owner2 ? (
              /* Assigned Slot View */
              <div className="slot-assigned-body">
                <div className="owner-profile-summary">
                  <div className="owner-avatar-lg">
                    {owner2.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="owner-details">
                    <h3 className="owner-name-display">{owner2.name}</h3>
                    <div className="owner-meta-item">
                      <span className="meta-icon">✉️</span>
                      <span className="meta-text">{owner2.email}</span>
                    </div>
                    {owner2.phone && (
                      <div className="owner-meta-item">
                        <span className="meta-icon">📞</span>
                        <span className="meta-text">{owner2.phone}</span>
                      </div>
                    )}
                    <div className="owner-meta-item">
                      <span className="meta-icon">📅</span>
                      <span className="meta-text">
                        Provisioned: {new Date(owner2.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="owner-meta-item">
                      <span className="meta-icon">{owner2.authUserId ? '⚡' : '☁️'}</span>
                      <span className="meta-text" style={{ color: owner2.authUserId ? '#38bdf8' : '#94a3b8' }}>
                        {owner2.authUserId ? 'Supabase Auth Linked' : 'Profile Provisioned (Cloud)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="owner-credentials-hint">
                  <div className="hint-header">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <span>Owner Login Credentials Active</span>
                  </div>
                  <p>
                    This co-owner can log in at <code>#/login</code> to access full salon features, calendar, staff onboarding, and financial summaries.
                  </p>
                </div>

                <div className="slot-actions-row">
                  <button
                    type="button"
                    className={`btn-slot-action ${owner2.active ? 'btn-deactivate' : 'btn-activate'}`}
                    onClick={() => handleToggleOwnerActive(owner2)}
                  >
                    {owner2.active ? 'Deactivate Owner' : 'Reactivate Owner'}
                  </button>
                  <button
                    type="button"
                    className="btn-slot-action btn-reset-pw"
                    onClick={() => handleOpenPasswordReset(owner2)}
                  >
                    Change Password
                  </button>
                  <button
                    type="button"
                    className="btn-slot-action btn-delete-slot"
                    onClick={() => handleDeleteOwner(owner2)}
                  >
                    Release Slot
                  </button>
                </div>
              </div>
            ) : (
              /* Empty Slot Provisioning Form */
              <form
                className="slot-form"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleProvisionOwner('OWNER_2')
                }}
              >
                <div className="form-field">
                  <label htmlFor="owner2-name">Owner Full Name *</label>
                  <input
                    id="owner2-name"
                    type="text"
                    className="portal-input"
                    placeholder="e.g. Niketa Kaushik"
                    value={slot2Form.name}
                    onChange={(e) => setSlot2Form({ ...slot2Form, name: e.target.value })}
                    required
                    disabled={submittingSlot === 'OWNER_2'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner2-email">Owner Email Address *</label>
                  <input
                    id="owner2-email"
                    type="email"
                    className="portal-input"
                    placeholder="e.g. niketa.owner@hairdexirity.example.com"
                    value={slot2Form.email}
                    onChange={(e) => setSlot2Form({ ...slot2Form, email: e.target.value })}
                    required
                    disabled={submittingSlot === 'OWNER_2'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner2-phone">Phone Number (Optional)</label>
                  <input
                    id="owner2-phone"
                    type="tel"
                    className="portal-input"
                    placeholder="+91 98110 00000"
                    value={slot2Form.phone}
                    onChange={(e) => setSlot2Form({ ...slot2Form, phone: e.target.value })}
                    disabled={submittingSlot === 'OWNER_2'}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="owner2-pass">Initial Password *</label>
                  <div className="password-input-wrap">
                    <input
                      id="owner2-pass"
                      type={slot2Form.showPassword ? 'text' : 'password'}
                      className="portal-input"
                      placeholder="••••••••••••"
                      value={slot2Form.password}
                      onChange={(e) => setSlot2Form({ ...slot2Form, password: e.target.value })}
                      required
                      minLength={6}
                      disabled={submittingSlot === 'OWNER_2'}
                    />
                    <button
                      type="button"
                      className="btn-toggle-eye"
                      onClick={() => setSlot2Form({ ...slot2Form, showPassword: !slot2Form.showPassword })}
                      tabIndex={-1}
                    >
                      {slot2Form.showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <span className="field-hint">Default suggested: Luma@2026!</span>
                </div>

                <button
                  type="submit"
                  className="btn-provision-submit"
                  disabled={submittingSlot === 'OWNER_2'}
                >
                  {submittingSlot === 'OWNER_2' ? 'Provisioning Owner 2...' : '👑 Provision Owner 2 Credentials'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Workflow Guide: How to Switch to Salon Operations */}
        <section className="workflow-guide-section">
          <div className="workflow-card">
            <div className="workflow-header">
              <span className="workflow-icon">🚀</span>
              <div>
                <h3 className="workflow-title">Ready to Test the Full Salon App?</h3>
                <p className="workflow-desc">
                  Follow this 2-step process to enter the full operational workspace with your newly created Salon Owner credentials:
                </p>
              </div>
            </div>

            <div className="workflow-steps-grid">
              <div className="workflow-step">
                <span className="step-num">1</span>
                <div className="step-content">
                  <h4>Provision Owner Credentials</h4>
                  <p>Fill out Owner 1 or Owner 2 above to create their credentials.</p>
                </div>
              </div>

              <div className="workflow-step">
                <span className="step-num">2</span>
                <div className="step-content">
                  <h4>Sign Out as Root Admin</h4>
                  <p>Click "Sign Out" above to end the Root Administrator session.</p>
                </div>
              </div>

              <div className="workflow-step">
                <span className="step-num">3</span>
                <div className="step-content">
                  <h4>Sign In as Salon Owner</h4>
                  <p>Enter the Owner email &amp; password. The entire Salon App and modules will open!</p>
                </div>
              </div>
            </div>

            <div className="workflow-action-bar">
              <button
                type="button"
                className="btn-workflow-signout"
                onClick={onLogout}
              >
                Sign Out as Root Admin &amp; Go to Login
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Password Reset Modal */}
      {resetModalOwner && (
        <div className="portal-modal-backdrop" onClick={() => setResetModalOwner(null)}>
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-modal-header">
              <h3>Reset Password for {resetModalOwner.name}</h3>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setResetModalOwner(null)}
              >
                ✕
              </button>
            </div>
            <div className="portal-modal-body">
              <p>
                Enter a new password for Owner account (<code>{resetModalOwner.email}</code>):
              </p>
              <input
                type="password"
                className="portal-input"
                placeholder="New password (minimum 6 characters)"
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                autoFocus
              />
            </div>
            <div className="portal-modal-footer">
              <button
                type="button"
                className="btn-modal-cancel"
                onClick={() => setResetModalOwner(null)}
                disabled={isResettingPassword}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-modal-confirm"
                onClick={handleConfirmPasswordReset}
                disabled={isResettingPassword || newPasswordInput.trim().length < 6}
              >
                {isResettingPassword ? 'Updating...' : 'Save New Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

