// ==============================================================================
// Luma Salon — Owner Finance & Revenue Intelligence Workspace (Phase 7)
// Commercial Billing Reconciliation, Cash Flow Trends, GST & Invoicing Ledgers
// ==============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { NavId } from '../../../types/salon.ts'
import type {
  Invoice,
  FinancialSummaryKpis,
  PaymentMethodShare,
  DailyCashFlowPoint,
} from '../../../types/finance.ts'
import { billingService } from '../../../services/billingService.ts'
import { financialReportsService } from '../../../services/financialReportsService.ts'
import {
  computeDateRange,
  type DateRangePreset,
  type DateRange,
} from '../../../services/ownerDashboardService.ts'
import { DashboardHeader } from '../common/DashboardHeader.tsx'
import { FinanceKpiGrid } from './components/finance/FinanceKpiGrid.tsx'
import { CashFlowTrendChart } from './components/finance/CashFlowTrendChart.tsx'
import { PaymentMethodBreakdown } from './components/finance/PaymentMethodBreakdown.tsx'
import { InvoiceLedgerTable } from './components/finance/InvoiceLedgerTable.tsx'
import { CalendarIcon, RefreshCwIcon } from '../../../components/Icons.tsx'
import './components/finance/FinanceReports.css'
import '../common/DashboardStyles.css'

interface OwnerFinanceReportsViewProps {
  onNavigate: (route: NavId) => void
}

const PRESET_OPTIONS: { id: DateRangePreset; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last_7_days', label: 'Last 7 Days' },
  { id: 'last_30_days', label: 'Last 30 Days' },
  { id: 'this_month', label: 'This Month' },
]

export const OwnerFinanceReportsView: React.FC<OwnerFinanceReportsViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  const [timePreset, setTimePreset] = useState<DateRangePreset>('today')
  const [invoices, setInvoices] = useState<Invoice[]>(() => billingService.getAllInvoices())
  const [isLoading, setIsLoading] = useState<boolean>(false)

  // Compute active date range
  const activeDateRange: DateRange = useMemo(() => {
    return computeDateRange(timePreset)
  }, [timePreset])

  // Load and refresh invoices
  const refreshInvoices = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await billingService.fetchInvoicesAsync()
      setInvoices(all)
    } catch {
      setInvoices(billingService.getAllInvoices())
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Initial async remote sync & listener subscription
  useEffect(() => {
    billingService.fetchInvoicesAsync().catch(() => {})

    const unsubscribe = billingService.subscribe((updated) => {
      setInvoices(updated)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  // Derive Financial KPIs
  const kpis: FinancialSummaryKpis = useMemo(() => {
    return financialReportsService.getFinancialSummary(activeDateRange)
  }, [activeDateRange, invoices])

  // Derive Payment Method Shares
  const methodShares: PaymentMethodShare[] = useMemo(() => {
    return financialReportsService.getPaymentMethodBreakdown(activeDateRange)
  }, [activeDateRange, invoices])

  // Derive Cash Flow Trends
  const dailyCashFlow: DailyCashFlowPoint[] = useMemo(() => {
    return financialReportsService.getCashFlowDailyTrends(activeDateRange)
  }, [activeDateRange, invoices])

  return (
    <div className="dashboard-workspace-container owner-finance-workspace">
      {/* Workspace Header */}
      <DashboardHeader
        role="OWNER"
        roleLabel="Owner Workspace"
        title="Commercial Finance & Revenue Intelligence"
        subtitle="End-of-day cash reconciliation, GST accounting records, tender breakdowns, and commercial customer invoices."
        actions={
          <button
            type="button"
            className="header-refresh-btn"
            onClick={refreshInvoices}
            title="Refresh financial records"
          >
            <RefreshCwIcon size={14} className={isLoading ? 'spin-icon' : ''} />
            <span>{activeDateRange.label}</span>
          </button>
        }
      />

      {/* Date Range Preset Selector Bar */}
      <div className="employee-time-filter-row">
        <div className="time-filter-pills-group">
          {PRESET_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`time-filter-pill ${timePreset === opt.id ? 'active' : ''}`}
              onClick={() => setTimePreset(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="active-range-indicator">
          <CalendarIcon size={14} />
          <span>
            {activeDateRange.startDate === activeDateRange.endDate
              ? activeDateRange.startDate
              : `${activeDateRange.startDate} to ${activeDateRange.endDate}`}
          </span>
        </div>
      </div>

      {/* 1. Executive Financial KPI Grid */}
      <FinanceKpiGrid kpis={kpis} />

      {/* 2. Visuals Section: Cash Flow Trend & Payment Breakdown */}
      <div className="finance-visuals-grid">
        <CashFlowTrendChart data={dailyCashFlow} />
        <PaymentMethodBreakdown
          methodShares={methodShares}
          totalRevenue={kpis.totalCollectedRevenue}
        />
      </div>

      {/* 3. Invoicing Ledger Table */}
      <InvoiceLedgerTable invoices={invoices} />
    </div>
  )
}
