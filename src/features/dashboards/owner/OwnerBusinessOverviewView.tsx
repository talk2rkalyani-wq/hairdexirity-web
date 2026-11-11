// ==============================================================================
// Luma Salon — Owner Business Overview Dashboard View (Phase 2)
// Real-Time Business Metrics, Revenue Analytics & Executive Insights
// ==============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { DashboardHeader } from '../common/DashboardHeader.tsx'
import { DateRangeSelector } from './components/DateRangeSelector.tsx'
import { ExecutiveKpiGrid } from './components/ExecutiveKpiGrid.tsx'
import { AppointmentAnalyticsSection } from './components/AppointmentAnalyticsSection.tsx'
import { RevenueAnalyticsSection } from './components/RevenueAnalyticsSection.tsx'
import { BusinessPerformanceSection } from './components/BusinessPerformanceSection.tsx'
import { AttentionAlertsSection } from './components/AttentionAlertsSection.tsx'
import { QuickNavigationSection } from './components/QuickNavigationSection.tsx'
import {
  ownerDashboardService,
  computeDateRange,
  type DateRangePreset,
  type ExecutiveDashboardData,
} from '../../../services/ownerDashboardService.ts'
import { appointmentStore } from '../../../services/appointmentStore.ts'
import { RefreshCwIcon } from '../../../components/Icons.tsx'
import type { NavId } from '../../../types/salon.ts'
import '../common/DashboardStyles.css'
import './components/OwnerBusinessOverview.css'

interface OwnerBusinessOverviewViewProps {
  ownerName: string
  onNavigate: (route: NavId) => void
}

export const OwnerBusinessOverviewView: React.FC<OwnerBusinessOverviewViewProps> = ({
  ownerName,
  onNavigate,
}) => {
  const [preset, setPreset] = useState<DateRangePreset>('today')
  const [customStart, setCustomStart] = useState<string | undefined>(undefined)
  const [customEnd, setCustomEnd] = useState<string | undefined>(undefined)
  const [dashboardData, setDashboardData] = useState<ExecutiveDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  // Load dashboard data for current active range
  const loadDashboardData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const activeRange = computeDateRange(preset, customStart, customEnd)
      const data = await ownerDashboardService.getDashboardData(activeRange)
      setDashboardData(data)
    } catch (err: any) {
      console.error('Failed to load Owner Executive Dashboard metrics:', err)
      setError(err?.message || 'Failed to aggregate salon operational metrics.')
    } finally {
      setIsLoading(false)
    }
  }, [preset, customStart, customEnd])

  // Initial fetch and reactive subscription to appointment store changes
  useEffect(() => {
    void loadDashboardData()

    // Real-time synchronization: when appointments change in other tabs or views, refresh metrics
    const unsubscribe = appointmentStore.subscribe(() => {
      void loadDashboardData()
    })

    return () => {
      unsubscribe()
    }
  }, [loadDashboardData])

  const handleSelectPreset = (
    newPreset: DateRangePreset,
    newCustomStart?: string,
    newCustomEnd?: string
  ) => {
    setPreset(newPreset)
    setCustomStart(newCustomStart)
    setCustomEnd(newCustomEnd)
  }

  const isTodayActive = preset === 'today'

  return (
    <div className="dashboard-workspace-container" role="main" aria-label="Owner Business Overview">
      {/* 1. Dashboard Header */}
      <DashboardHeader
        role="OWNER"
        roleLabel="Executive Workspace"
        title="Business Overview"
        subtitle={`Welcome back, ${ownerName}. Real-time executive metrics, appointment performance, and salon health.`}
        actions={
          <div className="dashboard-header-actions">
            {dashboardData && (
              <span className="header-timestamp">
                Last updated: {dashboardData.lastUpdated} (IST)
              </span>
            )}
            <button
              type="button"
              className="btn-refresh-dashboard"
              onClick={() => void loadDashboardData()}
              disabled={isLoading}
              title="Refresh all metrics from live database"
            >
              <RefreshCwIcon size={14} className={isLoading ? 'btn-spinner' : ''} />
              <span>{isLoading ? 'Updating...' : 'Refresh'}</span>
            </button>
          </div>
        }
      />

      {/* 2. Date Range Filter */}
      <DateRangeSelector
        currentRange={computeDateRange(preset, customStart, customEnd)}
        onSelectPreset={handleSelectPreset}
        disabled={isLoading}
      />

      {/* Error State Banner */}
      {error && (
        <div className="dashboard-error-banner" role="alert">
          <div className="error-text-wrap">
            <span className="error-title">Data Retrieval Warning</span>
            <span className="error-desc">{error}</span>
          </div>
          <button
            type="button"
            className="btn-error-retry"
            onClick={() => void loadDashboardData()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton Placeholder */}
      {isLoading && !dashboardData && (
        <div className="dashboard-loading-container">
          <div
            className="btn-spinner"
            style={{
              width: '36px',
              height: '36px',
              borderColor: 'rgba(197, 160, 89, 0.2)',
              borderTopColor: '#d4af37',
            }}
          />
          <span className="text-muted" style={{ fontSize: '0.875rem' }}>
            Aggregating executive salon performance indicators...
          </span>
        </div>
      )}

      {/* Dashboard Content Once Loaded */}
      {dashboardData && (
        <>
          {/* 3. Executive KPI Cards */}
          <ExecutiveKpiGrid
            kpis={dashboardData.kpis}
            isToday={isTodayActive}
            onNavigate={onNavigate}
          />

          {/* 4. Attention-Required Alerts (Stock, High Cancellations, No-Shows) */}
          <AttentionAlertsSection
            alerts={dashboardData.attentionAlerts}
            onNavigate={onNavigate}
          />

          {/* 5. Appointment Analytics & Status Distribution */}
          <AppointmentAnalyticsSection
            data={dashboardData}
            onNavigate={onNavigate}
          />

          {/* 6. Revenue & Service Value Analytics */}
          <RevenueAnalyticsSection
            data={dashboardData}
            onNavigate={onNavigate}
          />

          {/* 7. Business Performance & Staff Activity Ratios */}
          <BusinessPerformanceSection
            data={dashboardData}
            onNavigate={onNavigate}
          />

          {/* 8. Quick Navigation to Operational Management */}
          <QuickNavigationSection onNavigate={onNavigate} />
        </>
      )}
    </div>
  )
}
