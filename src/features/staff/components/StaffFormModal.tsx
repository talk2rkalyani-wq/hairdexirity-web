import React, { useState, useEffect } from 'react'
import type { Staff, StaffRole, DayOfWeek, WeeklySchedule, Service } from '../../../types/models'
import { serviceService } from '../../../services/serviceService'
import { CloseIcon, CheckIcon, PlusIcon } from '../../../components/Icons'
import './StaffFormModal.css'

interface StaffFormModalProps {
  isOpen: boolean
  staffToEdit?: Staff | null
  onClose: () => void
  onSave: (staffData: any, isEdit: boolean) => Promise<void>
}

const defaultWorkingHours: WeeklySchedule = {
  monday: { open: '10:00', close: '20:00', isOpen: true },
  tuesday: { open: '10:00', close: '20:00', isOpen: true },
  wednesday: { open: '10:00', close: '20:00', isOpen: true },
  thursday: { open: '10:00', close: '20:00', isOpen: true },
  friday: { open: '10:00', close: '21:00', isOpen: true },
  saturday: { open: '09:30', close: '21:00', isOpen: true },
  sunday: { open: '10:00', close: '20:00', isOpen: true },
}

const daysList: { key: DayOfWeek; label: string }[] = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
]

export const StaffFormModal: React.FC<StaffFormModalProps> = ({
  isOpen,
  staffToEdit,
  onClose,
  onSave,
}) => {
  const isEdit = Boolean(staffToEdit)

  // Form State
  const [name, setName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other' | ''>('')
  const [role, setRole] = useState<StaffRole>('senior_stylist')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [experience, setExperience] = useState('')
  const [active, setActive] = useState(true)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [customSkillInput, setCustomSkillInput] = useState('')
  const [workingHours, setWorkingHours] = useState<WeeklySchedule>(defaultWorkingHours)

  // Salon services available for skill tagging
  const [availableServices, setAvailableServices] = useState<string[]>([])

  // Validation & feedback state
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  useEffect(() => {
    if (!isOpen) return

    // Load available salon services to suggest skills
    serviceService.getServices().then((srvs: Service[]) => {
      const names = srvs.map((s: Service) => s.name)
      setAvailableServices(names)
    })

    if (staffToEdit) {
      setName(staffToEdit.name || '')
      setJobTitle(staffToEdit.jobTitle || '')
      setGender((staffToEdit.gender as 'Male' | 'Female' | 'Other') || '')
      setRole(staffToEdit.role || 'senior_stylist')
      setPhone(staffToEdit.phone || '')
      setEmail(staffToEdit.email || '')
      setExperience(staffToEdit.experience || '')
      setActive(staffToEdit.active !== undefined ? staffToEdit.active : true)
      setSelectedSkills(staffToEdit.skills || [])
      setWorkingHours(staffToEdit.workingHours || defaultWorkingHours)
    } else {
      setName('')
      setJobTitle('')
      setGender('')
      setRole('senior_stylist')
      setPhone('')
      setEmail('')
      setExperience('')
      setActive(true)
      setSelectedSkills([])
      setWorkingHours(defaultWorkingHours)
    }
    setCustomSkillInput('')
    setErrors({})
    setShowSuccessToast(false)
  }, [isOpen, staffToEdit])

  if (!isOpen) return null

  const validate = (): boolean => {
    const errs: { name?: string; phone?: string } = {}
    if (!name.trim()) errs.name = 'Staff name is required.'
    if (phone.trim() && phone.trim().length < 8) {
      errs.phone = 'Please enter a valid phone number (e.g. +91 98111 22334).'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleToggleSkill = (skill: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  const handleAddCustomSkill = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = customSkillInput.trim()
    if (trimmed && !selectedSkills.includes(trimmed)) {
      setSelectedSkills((prev) => [...prev, trimmed])
      setCustomSkillInput('')
    }
  }

  const handleRemoveSkill = (skillToRemove: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s !== skillToRemove))
  }

  const handleToggleDay = (dayKey: DayOfWeek) => {
    setWorkingHours((prev: WeeklySchedule) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        isOpen: !prev[dayKey].isOpen,
      },
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)

    const payload = {
      name: name.trim(),
      jobTitle: jobTitle.trim() || undefined,
      gender: gender || undefined,
      role,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      experience: experience.trim() || '1 year',
      active,
      skills: selectedSkills,
      workingHours,
    }

    try {
      await onSave(payload, isEdit)
      setShowSuccessToast(true)
      setTimeout(() => {
        setIsSubmitting(false)
        onClose()
      }, 600)
    } catch (err) {
      console.error('Error saving staff:', err)
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} aria-hidden="true">
      <div
        className="staff-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Edit Staff Member' : 'Add New Staff Member'}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 className="modal-title">
              {isEdit ? 'Edit Staff Member' : 'Add New Staff Member'}
            </h3>
            <p className="modal-subtitle">
              {isEdit
                ? 'Update stylist contact info, role, and capabilities.'
                : 'Enter team member details to add them to your salon roster.'}
            </p>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <CloseIcon size={20} />
          </button>
        </div>

        {/* Success Banner */}
        {showSuccessToast && (
          <div className="modal-success-banner" role="status">
            <CheckIcon size={16} />
            <span>
              {isEdit
                ? 'Staff member updated successfully!'
                : 'New staff member added successfully!'}
            </span>
          </div>
        )}

        {/* Form Body */}
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="modal-form-body">
            {/* Required Group: Name & Role */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="staff-name">
                  Full Name <span className="req">*</span>
                </label>
                <input
                  id="staff-name"
                  type="text"
                  className={`field-input ${errors.name ? 'input-error' : ''}`}
                  placeholder="e.g. Simran Kaur"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                {errors.name && <span className="error-text">{errors.name}</span>}
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="staff-role">
                  Role / Designation <span className="req">*</span>
                </label>
                <select
                  id="staff-role"
                  className="field-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                >
                  <option value="owner">Salon Owner</option>
                  <option value="master_stylist">Master Stylist</option>
                  <option value="senior_stylist">Senior Stylist</option>
                  <option value="colorist">Color Specialist</option>
                  <option value="junior_stylist">Junior Stylist</option>
                </select>
              </div>
            </div>

            {/* Approved Master List Fields: Job Title & Gender */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="staff-job-title">
                  Official Job Title <span className="opt">(e.g. Hair Stylist, Beautician)</span>
                </label>
                <input
                  id="staff-job-title"
                  type="text"
                  className="field-input"
                  placeholder="e.g. Premium Hair Stylist"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="staff-gender">
                  Gender <span className="opt">(Optional)</span>
                </label>
                <select
                  id="staff-gender"
                  className="field-select"
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'Male' | 'Female' | 'Other' | '')}
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            {/* Contact Group */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="staff-phone">
                  Phone Number <span className="opt">(Optional)</span>
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  className={`field-input ${errors.phone ? 'input-error' : ''}`}
                  placeholder="e.g. +91 98111 22334"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                {errors.phone && <span className="error-text">{errors.phone}</span>}
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="staff-email">
                  Email Address <span className="opt">(Optional)</span>
                </label>
                <input
                  id="staff-email"
                  type="email"
                  className="field-input"
                  placeholder="e.g. stylist@hairdexirity.example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {/* Experience & Status Group */}
            <div className="form-group-grid-2">
              <div className="form-field">
                <label className="field-label" htmlFor="staff-experience">
                  Experience Level
                </label>
                <input
                  id="staff-experience"
                  type="text"
                  className="field-input"
                  placeholder="e.g. 5 years, 8 years"
                  value={experience}
                  onChange={(e) => setExperience(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="field-label" htmlFor="staff-status">
                  Active Status
                </label>
                <div className="status-toggle-wrap">
                  <label className="checkbox-label">
                    <input
                      id="staff-status"
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span className="checkbox-text">
                      {active ? 'Available for client bookings' : 'Currently inactive'}
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Section: Skills & Service Capabilities */}
            <div className="form-divider" />
            <div className="skills-picker-section">
              <div className="skills-section-header">
                <div>
                  <h4 className="form-section-title">Service Capabilities & Skills</h4>
                  <p className="form-section-subtitle">
                    Select the salon services this stylist is certified/skilled to perform.
                  </p>
                </div>
              </div>

              {/* Service Quick-Select Chips */}
              <div className="service-tags-picker" role="group" aria-label="Available services">
                {availableServices.map((srvName) => {
                  const isSelected = selectedSkills.includes(srvName)
                  return (
                    <button
                      key={srvName}
                      type="button"
                      className={`skill-pick-chip ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggleSkill(srvName)}
                    >
                      {isSelected && <CheckIcon size={12} />}
                      <span>{srvName}</span>
                    </button>
                  )
                })}
              </div>

              {/* Custom Skill Input */}
              <div className="custom-skill-input-row">
                <input
                  type="text"
                  className="field-input custom-skill-input"
                  placeholder="Add custom skill (e.g. Bridal Specialist, Hair Spa Rituals)"
                  value={customSkillInput}
                  onChange={(e) => setCustomSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddCustomSkill(e)
                    }
                  }}
                />
                <button
                  type="button"
                  className="add-skill-btn"
                  onClick={handleAddCustomSkill}
                  disabled={!customSkillInput.trim()}
                >
                  <PlusIcon size={16} />
                  <span>Add</span>
                </button>
              </div>

              {/* Current Selected Skills Tags */}
              <div className="selected-skills-review">
                <span className="review-label">Active Skills ({selectedSkills.length}):</span>
                <div className="selected-tags-list">
                  {selectedSkills.length === 0 ? (
                    <span className="no-skills-notice">None selected yet.</span>
                  ) : (
                    selectedSkills.map((skill) => (
                      <span key={skill} className="active-tag-chip">
                        <span>{skill}</span>
                        <button
                          type="button"
                          className="remove-tag-btn"
                          onClick={() => handleRemoveSkill(skill)}
                          aria-label={`Remove skill ${skill}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Section: Working Schedule Summary */}
            <div className="form-divider" />
            <div className="schedule-picker-section">
              <h4 className="form-section-title">Weekly Working Days</h4>
              <p className="form-section-subtitle">
                Click a day to toggle between working day and day off.
              </p>
              <div className="days-toggle-row">
                {daysList.map(({ key, label }) => {
                  const isWorking = workingHours[key]?.isOpen ?? true
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`day-toggle-chip ${isWorking ? 'day-working' : 'day-off'}`}
                      onClick={() => handleToggleDay(key)}
                      title={`${label}: ${isWorking ? 'Working' : 'Day off'}`}
                    >
                      <span className="day-label">{label}</span>
                      <span className="day-status-text">{isWorking ? 'ON' : 'OFF'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="modal-footer">
            <button
              type="button"
              className="modal-btn cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-btn submit-btn"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? 'Saving...'
                : isEdit
                ? 'Save Changes'
                : 'Add Staff Member'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
