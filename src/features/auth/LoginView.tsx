import React, { useState, useEffect } from 'react'
import { authService } from '../../services/authService'
import type { UserSession } from '../../types/models'
import './LoginView.css'

export type AuthModeView = 'sign_in' | 'forgot_password' | 'update_password'

interface LoginViewProps {
  onLoginSuccess?: (session: UserSession) => void
}

export const LoginView: React.FC<LoginViewProps> = ({ onLoginSuccess }) => {
  const [viewMode, setViewMode] = useState<AuthModeView>('sign_in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)



  // Check if opened from password recovery link (#/login?type=recovery or hash tokens)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash
      const search = window.location.search
      if (
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        hash.includes('access_token=')
      ) {
        setViewMode('update_password')
      }
    }
  }, [])

  const resetFormFeedback = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  // Handle standard email/password sign-in
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    resetFormFeedback()

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    if (!password) {
      setErrorMessage('Please enter your password.')
      return
    }

    try {
      setIsSubmitting(true)
      const session = await authService.login(email.trim(), password)
      if (onLoginSuccess) {
        onLoginSuccess(session)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials. Please try again.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle forgot password request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    resetFormFeedback()

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please enter a valid email address.')
      return
    }

    try {
      setIsSubmitting(true)
      const res = await authService.requestPasswordReset(email.trim())
      setSuccessMessage(res.message || 'If an account exists with this email address, password reset instructions have been sent.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to request password reset. Please try again.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle setting new password after recovery
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting) return
    resetFormFeedback()

    if (!password) {
      setErrorMessage('Please enter a new password.')
      return
    }

    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters long.')
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    try {
      setIsSubmitting(true)
      await authService.updatePassword(password)
      setSuccessMessage('Your password has been updated successfully. Please sign in with your new password.')
      setPassword('')
      setConfirmPassword('')
      setViewMode('sign_in')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password. Please try again.'
      setErrorMessage(msg)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="luma-login-container">
      <div className="login-ambient-orb orb-1" aria-hidden="true" />
      <div className="login-ambient-orb orb-2" aria-hidden="true" />

      <main className="login-card" role="main">
        {/* Brand Header */}
        <div className="login-header">
          <div className="login-brand" aria-label="Hair Dexirity">
            <span className="brand-luma">Hair</span>
            <span className="brand-salon">Dexirity</span>
          </div>

          {viewMode === 'sign_in' && (
            <>
              <h1 className="login-title">Sign In to Hair Dexirity</h1>
              <p className="login-subtitle">
                Enter your authorized salon email and password to access your role-isolated workspace.
              </p>
            </>
          )}

          {viewMode === 'forgot_password' && (
            <>
              <h1 className="login-title">Reset Password</h1>
              <p className="login-subtitle">
                Enter your registered email address and we'll send a secure password recovery link.
              </p>
            </>
          )}

          {viewMode === 'update_password' && (
            <>
              <h1 className="login-title">Set New Password</h1>
              <p className="login-subtitle">
                Choose a strong password with at least 8 characters for your Hair Dexirity account.
              </p>
            </>
          )}
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="login-error-alert" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div className="login-success-alert" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* ===================================================================
            VIEW 1: SIGN IN FORM
            =================================================================== */}
        {viewMode === 'sign_in' && (
          <form onSubmit={handleSignIn} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Email Address
              </label>
              <div className="input-icon-wrap">
                <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="login-email"
                  type="email"
                  className="login-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="password-label-row">
                <label className="form-label" htmlFor="login-password">
                  Password
                </label>
                <button
                  type="button"
                  className="btn-forgot-password-link"
                  onClick={() => {
                    resetFormFeedback()
                    setViewMode('forgot_password')
                  }}
                  disabled={isSubmitting}
                >
                  Forgot password?
                </button>
              </div>
              <div className="input-icon-wrap">
                <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="btn-loading-content">
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Authenticating...</span>
                </span>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>
        )}

        {/* ===================================================================
            VIEW 2: FORGOT PASSWORD FORM
            =================================================================== */}
        {viewMode === 'forgot_password' && (
          <form onSubmit={handleForgotPassword} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="forgot-email">
                Account Email Address
              </label>
              <div className="input-icon-wrap">
                <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input
                  id="forgot-email"
                  type="email"
                  className="login-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="btn-loading-content">
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Sending recovery link...</span>
                </span>
              ) : (
                <span>Send Recovery Link</span>
              )}
            </button>

            <button
              type="button"
              className="btn-back-link"
              onClick={() => {
                resetFormFeedback()
                setViewMode('sign_in')
              }}
              disabled={isSubmitting}
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {/* ===================================================================
            VIEW 3: SET NEW PASSWORD FORM (RECOVERY)
            =================================================================== */}
        {viewMode === 'update_password' && (
          <form onSubmit={handleUpdatePassword} className="login-form" noValidate>
            <div className="form-group">
              <label className="form-label" htmlFor="new-password">
                New Password (minimum 8 characters)
              </label>
              <div className="input-icon-wrap">
                <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="confirm-password">
                Confirm New Password
              </label>
              <div className="input-icon-wrap">
                <svg className="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  className="btn-toggle-password"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn-login-submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <span className="btn-loading-content">
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>Updating password...</span>
                </span>
              ) : (
                <span>Update Password</span>
              )}
            </button>

            <button
              type="button"
              className="btn-back-link"
              onClick={() => {
                resetFormFeedback()
                setViewMode('sign_in')
              }}
              disabled={isSubmitting}
            >
              ← Back to Sign In
            </button>
          </form>
        )}

        {/* Security badge footer */}
        <div className="login-footer">
          <div className="security-note">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Supabase Email-and-Password Authentication &amp; Row Level Security</span>
          </div>
        </div>
      </main>
    </div>
  )
}
