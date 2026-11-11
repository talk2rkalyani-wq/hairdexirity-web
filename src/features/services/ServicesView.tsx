import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Service, ServiceCategory, UserSession } from '../../types/models'
import { serviceService } from '../../services/serviceService'
import { sessionService } from '../../services/sessionService'
import { permissionService } from '../../services/permissionService'
import { appointmentStore } from '../../services/appointmentStore'
import { ServiceCard } from './components/ServiceCard'
import { ServiceFormModal } from './components/ServiceFormModal'
import { DeleteConfirmationModal } from '../../components/DeleteConfirmationModal'
import { BulkActionBar } from '../../components/BulkActionBar'
import { PlusIcon, SearchIcon, CloseIcon } from '../../components/Icons'
import './ServicesView.css'

type CategoryFilter = 'all' | ServiceCategory

const categories: { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All Services' },
  { key: 'haircut', label: 'Haircut' },
  { key: 'color', label: 'Color' },
  { key: 'treatment', label: 'Treatment' },
  { key: 'styling', label: 'Skin & Nails' },
  { key: 'extensions', label: 'Extensions' },
]

export const ServicesView: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() => sessionService.getCurrentSession())
  const canManage = permissionService.canAssignServices(session)
  const canDelete = permissionService.canDeleteService(session)
  const isEmployee = session?.role === 'EMPLOYEE'

  // Selection & Bulk State
  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(new Set())

  // Single Delete State
  const [serviceToDelete, setServiceToDelete] = useState<Service | null>(null)
  const [isDeletingSingle, setIsDeletingSingle] = useState(false)
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(null)

  // Bulk Delete State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  const selectAllRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsub = sessionService.subscribe((s) => {
      setSession(s)
      if (!permissionService.canDeleteService(s)) {
        setSelectedServiceIds(new Set())
      }
    })
    return () => unsub()
  }, [])

  const [servicesList, setServicesList] = useState<Service[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [serviceToEdit, setServiceToEdit] = useState<Service | null>(null)

  // Floating Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const loadServices = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await serviceService.getServices()
      setServicesList(data)
    } catch (err) {
      console.error('Error loading services:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServices()
    const unsub = serviceService.subscribe((updated) => {
      setServicesList(updated)
    })
    const unsubAppts = appointmentStore.subscribe(() => {
      serviceService.getServices().then((data) => setServicesList([...data]))
    })
    return () => {
      unsub()
      unsubAppts()
    }
  }, [loadServices])

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3000)
  }, [])

  // Filter services by category and search text
  const filteredServices = useMemo(() => {
    return servicesList.filter((srv) => {
      if (selectedCategory !== 'all' && srv.category !== selectedCategory) {
        return false
      }

      const q = searchQuery.toLowerCase().trim()
      if (!q) return true

      const nameMatch = srv.name.toLowerCase().includes(q)
      const descMatch = srv.description ? srv.description.toLowerCase().includes(q) : false
      const catMatch = srv.category.toLowerCase().includes(q)
      const priceMatch = srv.price.toString().includes(q)

      return nameMatch || descMatch || catMatch || priceMatch
    })
  }, [servicesList, selectedCategory, searchQuery])

  // Bulk Selection Handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedServiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isAllSelected = useMemo(() => {
    if (filteredServices.length === 0) return false
    return filteredServices.every((s) => selectedServiceIds.has(s.id))
  }, [filteredServices, selectedServiceIds])

  const isIndeterminate = useMemo(() => {
    if (filteredServices.length === 0) return false
    const count = filteredServices.filter((s) => selectedServiceIds.has(s.id)).length
    return count > 0 && count < filteredServices.length
  }, [filteredServices, selectedServiceIds])

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate
    }
  }, [isIndeterminate])

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      setSelectedServiceIds((prev) => {
        const next = new Set(prev)
        filteredServices.forEach((s) => next.delete(s.id))
        return next
      })
    } else {
      setSelectedServiceIds((prev) => {
        const next = new Set(prev)
        filteredServices.forEach((s) => next.add(s.id))
        return next
      })
    }
  }, [isAllSelected, filteredServices])

  const handleClearSelection = useCallback(() => {
    setSelectedServiceIds(new Set())
  }, [])

  // Single Delete Handlers
  const handleInitiateSingleDelete = useCallback((service: Service) => {
    setServiceToDelete(service)
    setSingleDeleteError(null)
  }, [])

  const handleConfirmSingleDelete = useCallback(async () => {
    if (!serviceToDelete) return
    setIsDeletingSingle(true)
    setSingleDeleteError(null)
    try {
      await serviceService.deleteService(serviceToDelete.id)
      showToast(`Service "${serviceToDelete.name}" was deleted successfully.`)
      setSelectedServiceIds((prev) => {
        const next = new Set(prev)
        next.delete(serviceToDelete.id)
        return next
      })
      setServiceToDelete(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete service.'
      setSingleDeleteError(msg)
    } finally {
      setIsDeletingSingle(false)
    }
  }, [serviceToDelete, showToast])

  const handleCancelSingleDelete = useCallback(() => {
    setServiceToDelete(null)
    setSingleDeleteError(null)
  }, [])

  // Bulk Delete Handlers
  const handleInitiateBulkDelete = useCallback(() => {
    if (selectedServiceIds.size === 0) return
    setIsBulkModalOpen(true)
    setBulkDeleteError(null)
  }, [selectedServiceIds.size])

  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedServiceIds.size === 0) return
    setIsDeletingBulk(true)
    setBulkDeleteError(null)
    try {
      const ids = Array.from(selectedServiceIds)
      const res = await serviceService.deleteServices(ids)
      showToast(
        res.deletedCount === 1
          ? '1 service deleted successfully.'
          : `${res.deletedCount} services deleted successfully.`
      )
      setSelectedServiceIds(new Set())
      setIsBulkModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete services.'
      setBulkDeleteError(msg)
    } finally {
      setIsDeletingBulk(false)
    }
  }, [selectedServiceIds, showToast])

  const handleCancelBulkDelete = useCallback(() => {
    setIsBulkModalOpen(false)
    setBulkDeleteError(null)
  }, [])

  // Form Modal Handlers
  const handleOpenAddModal = () => {
    setServiceToEdit(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (service: Service) => {
    setServiceToEdit(service)
    setIsModalOpen(true)
  }

  const handleSaveService = async (payload: any, isEdit: boolean) => {
    if (isEdit && serviceToEdit) {
      const updated = await serviceService.updateService(serviceToEdit.id, payload)
      showToast(`Updated "${updated.name}"`)
    } else {
      const created = await serviceService.createService(payload)
      showToast(`Created service "${created.name}"`)
    }
  }

  return (
    <main className="services-workspace" aria-label="Services Management">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="luma-floating-toast" role="status">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="services-header-section">
        <div className="services-header-info">
          <div className="services-title-row">
            <h1 className="services-main-title">{isEmployee ? 'My Services' : 'Services'}</h1>
            <span className="services-count-badge" aria-label="Total Services Count">
              {servicesList.length} Services
            </span>
          </div>
          <p className="services-subtitle">
            {isEmployee
              ? 'View salon service offerings, categories, and durations.'
              : 'Manage the services your salon offers.'}
          </p>
        </div>

        {canManage && (
          <div className="services-actions-row">
            <button
              type="button"
              className="add-service-btn"
              onClick={handleOpenAddModal}
              aria-label="Add new salon service"
            >
              <PlusIcon size={18} />
              <span>Add Service</span>
            </button>
          </div>
        )}
      </header>

      {/* Toolbar & Filters */}
      <div className="services-toolbar">
        {/* Search */}
        <div className="services-search-container">
          <SearchIcon size={18} className="search-icon" />
          <input
            type="text"
            className="services-search-input"
            placeholder="Search by service name, description, or price..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search salon services"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search query"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>

        {/* Owner Select All Checkbox Control */}
        {canDelete && filteredServices.length > 0 && (
          <div className="services-select-all-wrap">
            <label className="services-select-all-label">
              <input
                type="checkbox"
                ref={selectAllRef}
                className="row-select-checkbox"
                checked={isAllSelected}
                onChange={handleToggleSelectAll}
                aria-label="Select all displayed services"
              />
              <span>Select All</span>
            </label>
          </div>
        )}

        {/* Category Filter Chips */}
        <div className="category-chips-row" role="group" aria-label="Filter by category">
          {categories.map(({ key, label }) => {
            const isSelected = selectedCategory === key
            return (
              <button
                key={key}
                type="button"
                className={`category-filter-chip ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedCategory(key)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Services Grid Content */}
      <section className="services-content-area" aria-label="Services Cards Grid">
        {isLoading ? (
          <div className="services-loading-state">
            <p>Loading services catalog...</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="services-empty-state">
            <p className="empty-title">
              {searchQuery || selectedCategory !== 'all'
                ? 'No matching services found.'
                : 'No services created yet.'}
            </p>
            <p className="empty-subtitle">
              {searchQuery || selectedCategory !== 'all'
                ? 'Try adjusting your search query or selecting a different category filter.'
                : 'Add the first haircut, color, or treatment service offered by your salon.'}
            </p>
            {searchQuery || selectedCategory !== 'all' ? (
              <button
                type="button"
                className="empty-reset-btn"
                onClick={() => {
                  setSearchQuery('')
                  setSelectedCategory('all')
                }}
              >
                Reset Filters
              </button>
            ) : (
              <button
                type="button"
                className="empty-add-btn"
                onClick={handleOpenAddModal}
              >
                <PlusIcon size={16} />
                <span>Add First Service</span>
              </button>
            )}
          </div>
        ) : (
          <div className="services-cards-grid">
            {filteredServices.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                onEdit={handleOpenEditModal}
                canEdit={canManage}
                canDelete={canDelete}
                isSelected={selectedServiceIds.has(service.id)}
                onToggleSelect={handleToggleSelect}
                onDelete={handleInitiateSingleDelete}
              />
            ))}
          </div>
        )}
      </section>

      {/* Add / Edit Service Modal */}
      <ServiceFormModal
        isOpen={isModalOpen}
        serviceToEdit={serviceToEdit}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveService}
      />

      {/* Floating Bulk Action Toolbar (Owner only) */}
      {canDelete && (
        <BulkActionBar
          selectedCount={selectedServiceIds.size}
          entityName="services"
          onDelete={handleInitiateBulkDelete}
          onClearSelection={handleClearSelection}
          disabled={isDeletingBulk}
        />
      )}

      {/* Single Service Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(serviceToDelete)}
        title="Delete Service?"
        itemName={serviceToDelete?.name}
        itemType="Service"
        confirmButtonText="Delete"
        isDeleting={isDeletingSingle}
        error={singleDeleteError}
        onConfirm={handleConfirmSingleDelete}
        onCancel={handleCancelSingleDelete}
      />

      {/* Bulk Service Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isBulkModalOpen}
        title={`Delete ${selectedServiceIds.size} Services?`}
        itemCount={selectedServiceIds.size}
        itemType="Service"
        confirmButtonText={`Delete ${selectedServiceIds.size} Services`}
        isDeleting={isDeletingBulk}
        error={bulkDeleteError}
        onConfirm={handleConfirmBulkDelete}
        onCancel={handleCancelBulkDelete}
      />
    </main>
  )
}
