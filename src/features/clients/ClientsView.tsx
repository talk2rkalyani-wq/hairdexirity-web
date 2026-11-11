import React, { useState, useEffect, useMemo, useCallback } from 'react'
import type { Client, UserSession } from '../../types/models'
import { clientService } from '../../services/clientService'
import { sessionService } from '../../services/sessionService'
import { permissionService } from '../../services/permissionService'
import { appointmentStore } from '../../services/appointmentStore'
import { ClientList } from './components/ClientList'
import { ClientProfileDrawer } from './components/ClientProfileDrawer'
import { ClientFormModal } from './components/ClientFormModal'
import { DeleteConfirmationModal } from '../../components/DeleteConfirmationModal'
import { BulkActionBar } from '../../components/BulkActionBar'
import { SearchIcon, PlusIcon, CloseIcon } from '../../components/Icons'
import './ClientsView.css'

export const ClientsView: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(() => sessionService.getCurrentSession())
  const [clients, setClients] = useState<Client[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  // Selection & Bulk Actions State (Owner only)
  const [selectedClientIds, setSelectedClientIds] = useState<Set<string>>(new Set())

  // Drawer & Form Modal States
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Single Deletion State
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null)
  const [isDeletingSingle, setIsDeletingSingle] = useState(false)
  const [singleDeleteError, setSingleDeleteError] = useState<string | null>(null)

  // Bulk Deletion State
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [isDeletingBulk, setIsDeletingBulk] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)

  const canDelete = permissionService.canDeleteClient(session)

  // Listen to session changes
  useEffect(() => {
    const unsub = sessionService.subscribe((s) => {
      setSession(s)
      if (!permissionService.canDeleteClient(s)) {
        setSelectedClientIds(new Set())
      }
    })
    return () => unsub()
  }, [])

  // Load clients and subscribe to canonical clientStore updates
  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true)
      const data = await clientService.getClients()
      setClients(data)
    } catch (err) {
      console.error('Failed to load clients:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClients()
    const unsubClients = clientService.subscribe((updated) => {
      setClients(updated)
    })
    const unsubAppts = appointmentStore.subscribe(() => {
      clientService.getClients().then((data) => setClients([...data]))
    })
    return () => {
      unsubClients()
      unsubAppts()
    }
  }, [loadClients])

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg)
    setTimeout(() => {
      setToastMessage(null)
    }, 3500)
  }, [])

  // Fast case-insensitive search across name, phone, and email
  const filteredClients = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return clients

    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.email.toLowerCase().includes(q)
    )
  }, [clients, searchQuery])

  // Bulk Selection Handlers
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedClientIds((prev) => {
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
    if (filteredClients.length === 0) return false
    return filteredClients.every((c) => selectedClientIds.has(c.id))
  }, [filteredClients, selectedClientIds])

  const isIndeterminate = useMemo(() => {
    if (filteredClients.length === 0) return false
    const count = filteredClients.filter((c) => selectedClientIds.has(c.id)).length
    return count > 0 && count < filteredClients.length
  }, [filteredClients, selectedClientIds])

  const handleToggleSelectAll = useCallback(() => {
    if (isAllSelected) {
      // Deselect all visible
      setSelectedClientIds((prev) => {
        const next = new Set(prev)
        filteredClients.forEach((c) => next.delete(c.id))
        return next
      })
    } else {
      // Select all visible
      setSelectedClientIds((prev) => {
        const next = new Set(prev)
        filteredClients.forEach((c) => next.add(c.id))
        return next
      })
    }
  }, [isAllSelected, filteredClients])

  const handleClearSelection = useCallback(() => {
    setSelectedClientIds(new Set())
  }, [])

  // Single Delete Handlers
  const handleInitiateSingleDelete = useCallback((client: Client) => {
    setClientToDelete(client)
    setSingleDeleteError(null)
  }, [])

  const handleConfirmSingleDelete = useCallback(async () => {
    if (!clientToDelete) return
    setIsDeletingSingle(true)
    setSingleDeleteError(null)
    try {
      await clientService.deleteClient(clientToDelete.id)
      showToast(`${clientToDelete.name} was deleted successfully.`)
      setSelectedClientIds((prev) => {
        const next = new Set(prev)
        next.delete(clientToDelete.id)
        return next
      })
      if (selectedClient && selectedClient.id === clientToDelete.id) {
        setSelectedClient(null)
      }
      setClientToDelete(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete client.'
      setSingleDeleteError(msg)
    } finally {
      setIsDeletingSingle(false)
    }
  }, [clientToDelete, selectedClient, showToast])

  const handleCancelSingleDelete = useCallback(() => {
    setClientToDelete(null)
    setSingleDeleteError(null)
  }, [])

  // Bulk Delete Handlers
  const handleInitiateBulkDelete = useCallback(() => {
    if (selectedClientIds.size === 0) return
    setIsBulkModalOpen(true)
    setBulkDeleteError(null)
  }, [selectedClientIds.size])

  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedClientIds.size === 0) return
    setIsDeletingBulk(true)
    setBulkDeleteError(null)
    try {
      const ids = Array.from(selectedClientIds)
      const res = await clientService.deleteClients(ids)
      showToast(
        res.deletedCount === 1
          ? '1 client deleted successfully.'
          : `${res.deletedCount} clients deleted successfully.`
      )
      if (selectedClient && selectedClientIds.has(selectedClient.id)) {
        setSelectedClient(null)
      }
      setSelectedClientIds(new Set())
      setIsBulkModalOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to delete clients.'
      setBulkDeleteError(msg)
    } finally {
      setIsDeletingBulk(false)
    }
  }, [selectedClientIds, selectedClient, showToast])

  const handleCancelBulkDelete = useCallback(() => {
    setIsBulkModalOpen(false)
    setBulkDeleteError(null)
  }, [])

  // Form Modal Handlers
  const handleOpenAddModal = () => {
    setClientToEdit(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (client: Client) => {
    setClientToEdit(client)
    setIsModalOpen(true)
  }

  const handleSaveClient = async (payload: any, isEdit: boolean) => {
    if (isEdit && clientToEdit) {
      const updated = await clientService.updateClient(clientToEdit.id, payload)
      if (updated) {
        if (selectedClient && selectedClient.id === updated.id) {
          setSelectedClient(updated)
        }
        showToast(`Saved changes for ${updated.name}`)
      }
    } else {
      const created = await clientService.createClient(payload)
      showToast(`Added ${created.name} to clients`)
    }
  }

  return (
    <div className="clients-page-container">
      {/* Toast alert */}
      {toastMessage && (
        <div className="clients-toast" role="alert">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Area */}
      <header className="clients-page-header">
        <div className="header-text-group">
          <div className="title-row">
            <h1 className="clients-page-title">Clients</h1>
            <span className="clients-count-badge">
              {clients.length} {clients.length === 1 ? 'Client' : 'Clients'}
            </span>
          </div>
          <p className="clients-page-subtitle">
            Manage your salon's client relationships.
          </p>
        </div>

        <button
          type="button"
          className="add-client-btn"
          onClick={handleOpenAddModal}
          aria-label="Add new client"
        >
          <PlusIcon size={18} />
          <span>Add Client</span>
        </button>
      </header>

      {/* Search Bar */}
      <div className="clients-search-bar" role="search">
        <div className="search-input-wrap">
          <SearchIcon className="search-icon" size={18} />
          <input
            type="text"
            className="search-input"
            placeholder="Search clients by name, phone, or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search clients"
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search filter"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Loading or Client List */}
      <main className="clients-content-body">
        {isLoading ? (
          <div className="clients-loading-card">
            <span className="loading-pulse-dot" />
            <span>Loading clients directory...</span>
          </div>
        ) : (
          <ClientList
            clients={filteredClients}
            searchQuery={searchQuery}
            onClearSearch={() => setSearchQuery('')}
            onAddClient={handleOpenAddModal}
            onSelectClient={setSelectedClient}
            canDelete={canDelete}
            selectedIds={selectedClientIds}
            onToggleSelect={handleToggleSelect}
            onToggleSelectAll={handleToggleSelectAll}
            isAllSelected={isAllSelected}
            isIndeterminate={isIndeterminate}
            onDeleteClient={handleInitiateSingleDelete}
          />
        )}
      </main>

      {/* Slide-out Client Profile Details */}
      {selectedClient && (
        <ClientProfileDrawer
          client={selectedClient}
          onClose={() => setSelectedClient(null)}
          onEdit={handleOpenEditModal}
          canDelete={canDelete}
          onDelete={handleInitiateSingleDelete}
        />
      )}

      {/* Add / Edit Client Modal */}
      <ClientFormModal
        isOpen={isModalOpen}
        clientToEdit={clientToEdit}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveClient}
      />

      {/* Floating Bulk Action Toolbar (Owner only) */}
      {canDelete && (
        <BulkActionBar
          selectedCount={selectedClientIds.size}
          entityName="clients"
          onDelete={handleInitiateBulkDelete}
          onClearSelection={handleClearSelection}
          disabled={isDeletingBulk}
        />
      )}

      {/* Single Client Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={Boolean(clientToDelete)}
        title="Delete Client?"
        itemName={clientToDelete?.name}
        itemType="Client"
        confirmButtonText="Delete"
        isDeleting={isDeletingSingle}
        error={singleDeleteError}
        onConfirm={handleConfirmSingleDelete}
        onCancel={handleCancelSingleDelete}
      />

      {/* Bulk Client Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isBulkModalOpen}
        title={`Delete ${selectedClientIds.size} Clients?`}
        itemCount={selectedClientIds.size}
        itemType="Client"
        confirmButtonText={`Delete ${selectedClientIds.size} Clients`}
        isDeleting={isDeletingBulk}
        error={bulkDeleteError}
        onConfirm={handleConfirmBulkDelete}
        onCancel={handleCancelBulkDelete}
      />
    </div>
  )
}
