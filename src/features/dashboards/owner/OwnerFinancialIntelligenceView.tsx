import React, { useState, useEffect, useCallback } from 'react'
import type { FinancialTimeRangePreset, OwnerFinancialIntelligenceReport } from '../../../types/financialIntelligence.ts'
import {
  ownerFinancialIntelligenceService,
  computeFinancialDateRange,
} from '../../../services/ownerFinancialIntelligenceService.ts'
import { financialIntelligenceExportService } from '../../../services/financialIntelligenceExportService.ts'
import { FinancialKpiSummaryGrid } from './components/financialIntelligence/FinancialKpiSummaryGrid.tsx'
import { RevenueCollectionsTrendSection } from './components/financialIntelligence/RevenueCollectionsTrendSection.tsx'
import { ProfitLossStatementTable } from './components/financialIntelligence/ProfitLossStatementTable.tsx'
import { CustomerSupplierIntelligenceSection } from './components/financialIntelligence/CustomerSupplierIntelligenceSection.tsx'
import { InventoryCostIntelligenceSection } from './components/financialIntelligence/InventoryCostIntelligenceSection.tsx'
import { EmployeeServicePerformanceSection } from './components/financialIntelligence/EmployeeServicePerformanceSection.tsx'
import './OwnerFinancialIntelligenceView.css'

import type { NavId } from '../../../types/salon.ts'

interface OwnerFinancialIntelligenceViewProps {
  onNavigate?: (route: NavId) => void
}

type TabKey = 'overview' | 'receivables' | 'inventory' | 'performance' | 'exports'

export const OwnerFinancialIntelligenceView: React.FC<OwnerFinancialIntelligenceViewProps> = ({
  onNavigate,
}) => {
  const [preset, setPreset] = useState<FinancialTimeRangePreset>('this_month')
  const [customStart, setCustomStart] = useState<string>('')
  const [customEnd, setCustomEnd] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [report, setReport] = useState<OwnerFinancialIntelligenceReport | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false)

  const dateRange = computeFinancialDateRange(preset, customStart, customEnd)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await ownerFinancialIntelligenceService.getFinancialIntelligence(dateRange)
      setReport(data)
    } catch (err: any) {
      console.error('[FinancialIntelligence] Load failed:', err)
      setError(err?.message || 'Failed to load financial intelligence metrics.')
    } finally {
      setIsLoading(false)
    }
  }, [dateRange.startDate, dateRange.endDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // CSV download helper
  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // PDF download helper
  const downloadPdf = async () => {
    if (!report) return
    setIsExportingPdf(true)
    try {
      const blob = await financialIntelligenceExportService.generateFinancialSummaryPdf(report)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Hair_Dexirity_Financial_Summary_${report.period.startDate}_to_${report.period.endDate}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('PDF export failed:', err)
      alert('Failed to generate PDF summary.')
    } finally {
      setIsExportingPdf(false)
    }
  }

  return (
    <div className="fin-intel-workspace">
      {/* -------------------------------------------------------------------- */}
      {/* 1. Executive Header */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-intel-header">
        <div>
          <div className="fin-intel-badge">Executive Financial Intelligence</div>
          <h1 className="fin-intel-title">Salon Business Performance & P&L</h1>
          <p className="fin-intel-subtitle">
            Consolidated accrual sales revenue, actual cash collections, customer receivables, supplier payables, and operating contribution
          </p>
        </div>

        {/* Action Controls */}
        <div className="fin-header-controls">
          <button
            type="button"
            className="fin-btn-secondary"
            onClick={loadData}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
          <button
            type="button"
            className="fin-btn-primary"
            onClick={downloadPdf}
            disabled={isLoading || !report || isExportingPdf}
          >
            {isExportingPdf ? 'Exporting PDF...' : '📄 Download PDF Summary'}
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. Date Range Filter Toolbar */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-filter-toolbar">
        <div className="preset-buttons-group">
          {(
            [
              ['today', 'Today'],
              ['yesterday', 'Yesterday'],
              ['this_week', 'This Week'],
              ['this_month', 'This Month'],
              ['last_month', 'Previous Month'],
              ['this_year', 'This Year'],
              ['last_year', 'Previous Year'],
              ['custom', 'Custom Range'],
            ] as const
          ).map(([pKey, pLabel]) => (
            <button
              key={pKey}
              type="button"
              className={`preset-pill ${preset === pKey ? 'active' : ''}`}
              onClick={() => setPreset(pKey)}
            >
              {pLabel}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="custom-range-inputs">
            <label>
              From:
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label>
              To:
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </div>
        )}

        <div className="active-period-info">
          <span>Active Period:</span>
          <strong>{dateRange.startDate} to {dateRange.endDate}</strong>
          <span className="timezone-tag">IST (Asia/Kolkata)</span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 3. High-Level Executive KPI Grid */}
      {/* -------------------------------------------------------------------- */}
      {report && (
        <FinancialKpiSummaryGrid
          kpis={report.kpis}
          onDrillDown={(target) => setActiveTab(target as TabKey)}
        />
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 4. Tab Navigation */}
      {/* -------------------------------------------------------------------- */}
      <div className="fin-subnav-tabs">
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📈 Overview & P&L Statement
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'receivables' ? 'active' : ''}`}
          onClick={() => setActiveTab('receivables')}
        >
          👥 Receivables & Payables
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          📦 Inventory Valuation & COGS
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'performance' ? 'active' : ''}`}
          onClick={() => setActiveTab('performance')}
        >
          ✂️ Stylist & Service Attribution
        </button>
        <button
          type="button"
          className={`subnav-tab ${activeTab === 'exports' ? 'active' : ''}`}
          onClick={() => setActiveTab('exports')}
        >
          📥 Reports & Exports Hub
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 5. Tab Content Views */}
      {/* -------------------------------------------------------------------- */}
      {isLoading ? (
        <div className="fin-loading-state">
          <div className="loading-spinner"></div>
          <p>Calculating authoritative financial intelligence from database records...</p>
        </div>
      ) : error ? (
        <div className="fin-error-state">
          <h4>Unable to load financial intelligence</h4>
          <p>{error}</p>
          <button type="button" className="fin-btn-secondary" onClick={loadData}>
            Try Again
          </button>
        </div>
      ) : report ? (
        <>
          {/* Tab 1: Overview & P&L */}
          {activeTab === 'overview' && (
            <div className="tab-pane-content">
              <RevenueCollectionsTrendSection
                dailyTrends={report.revenueVsCollections}
                collectionsByTender={report.collectionsByTender}
                totalRevenue={report.kpis.netSales}
                totalCollections={report.kpis.totalCollections}
              />
              <ProfitLossStatementTable
                pnl={report.pnlStatement}
                taxCollected={report.kpis.taxCollected}
              />
            </div>
          )}

          {/* Tab 2: Receivables & Payables */}
          {activeTab === 'receivables' && (
            <div className="tab-pane-content">
              <CustomerSupplierIntelligenceSection
                customerReceivables={report.customerReceivables}
                supplierPayables={report.supplierPayables}
                onNavigate={onNavigate}
              />
            </div>
          )}

          {/* Tab 3: Inventory Financials */}
          {activeTab === 'inventory' && (
            <div className="tab-pane-content">
              <InventoryCostIntelligenceSection
                inventory={report.inventoryAnalytics}
                kpis={report.kpis}
                onNavigate={onNavigate}
              />
            </div>
          )}

          {/* Tab 4: Stylists & Services */}
          {activeTab === 'performance' && (
            <div className="tab-pane-content">
              <EmployeeServicePerformanceSection
                staffPerformance={report.staffPerformance}
                servicePerformance={report.servicePerformance}
              />
            </div>
          )}

          {/* Tab 5: Exports Hub */}
          {activeTab === 'exports' && (
            <div className="tab-pane-content">
              <div className="exports-hub-container">
                <div className="exports-hub-header">
                  <div>
                    <h3 className="exports-title">Financial Reports & Data Exports</h3>
                    <p className="exports-subtitle">
                      RFC-4180 compliant CSV accounting files and high-fidelity vector PDF summaries for external accounting & tax auditing
                    </p>
                  </div>
                </div>

                <div className="exports-cards-grid">
                  {/* Export 1 */}
                  <div className="export-card">
                    <div className="export-card-icon">📊</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Financial Summary Report</h4>
                      <p className="export-desc">Consolidated executive KPIs, revenue, collections, and P&L metrics</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportFinancialSummaryCsv(report),
                          `Hair_Dexirity_Financial_Summary_${report.period.startDate}_to_${report.period.endDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 2 */}
                  <div className="export-card">
                    <div className="export-card-icon">📈</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Revenue Report</h4>
                      <p className="export-desc">Daily accrual sales, discounts, taxes, and net revenue breakdown</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportRevenueReportCsv(report),
                          `Hair_Dexirity_Revenue_Report_${report.period.startDate}_to_${report.period.endDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 3 */}
                  <div className="export-card">
                    <div className="export-card-icon">💳</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Collections Report</h4>
                      <p className="export-desc">Daily realized cash and digital collections across Cash, UPI, Card, Bank</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportCollectionsReportCsv(report),
                          `Hair_Dexirity_Collections_Report_${report.period.startDate}_to_${report.period.endDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 4 */}
                  <div className="export-card">
                    <div className="export-card-icon">📋</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Profit & Loss Statement</h4>
                      <p className="export-desc">Itemized P&L waterfall with COGS, consumables, and operating contribution</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportProfitLossCsv(report),
                          `Hair_Dexirity_Profit_Loss_${report.period.startDate}_to_${report.period.endDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 5 */}
                  <div className="export-card">
                    <div className="export-card-icon">👥</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Customer Outstanding & Ageing</h4>
                      <p className="export-desc">Accounts receivable ageing schedule (0–30, 31–60, 61–90, 90+) and debtor accounts</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportCustomerOutstandingCsv(report),
                          `Hair_Dexirity_Customer_Outstanding_${report.period.startDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 6 */}
                  <div className="export-card">
                    <div className="export-card-icon">🏢</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Supplier Outstanding & Payables</h4>
                      <p className="export-desc">Accounts payable balances by vendor, bills count, and supplier advances</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportSupplierOutstandingCsv(report),
                          `Hair_Dexirity_Supplier_Payables_${report.period.startDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 7 */}
                  <div className="export-card">
                    <div className="export-card-icon">📦</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Inventory Valuation Report</h4>
                      <p className="export-desc">Stock value by category, retail vs consumables, and 60+ days dead stock items</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportInventoryValuationCsv(report),
                          `Hair_Dexirity_Inventory_Valuation_${report.period.startDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>

                  {/* Export 8 */}
                  <div className="export-card">
                    <div className="export-card-icon">✂️</div>
                    <div className="export-card-info">
                      <h4 className="export-name">Employee Performance Report</h4>
                      <p className="export-desc">Stylist-wise service billings, retail product upsells, and discounts authorized</p>
                    </div>
                    <button
                      type="button"
                      className="export-btn"
                      onClick={() =>
                        downloadCsv(
                          financialIntelligenceExportService.exportEmployeePerformanceCsv(report),
                          `Hair_Dexirity_Employee_Performance_${report.period.startDate}_to_${report.period.endDate}.csv`
                        )
                      }
                    >
                      Download CSV
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
