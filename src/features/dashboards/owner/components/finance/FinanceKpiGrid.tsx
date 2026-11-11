// ==============================================================================
// Luma Salon — Executive Finance KPI Grid (Phase 7)
// Commercial Revenue, Settled Cash Flow, GST & Tender Metrics
// ==============================================================================

import React from 'react'
import type { FinancialSummaryKpis } from '../../../../../types/finance.ts'
import { formatCurrency } from '../../../../../utils/formatters.ts'
import {
  TrendingUpIcon,
  ShieldCheckIcon,
  AwardIcon,
  UsersIcon,
  ClockIcon,
  TagIcon,
  CheckCircleIcon,
  InfoIcon,
} from '../../../../../components/Icons.tsx'

interface FinanceKpiGridProps {
  kpis: FinancialSummaryKpis
}

export const FinanceKpiGrid: React.FC<FinanceKpiGridProps> = ({ kpis }) => {
  return (
    <div className="finance-kpis-wrapper">
      {/* Real Cash Flow Verification Banner */}
      <div className="settled-revenue-banner">
        <div className="banner-left">
          <ShieldCheckIcon size={16} className="text-emerald" />
          <span className="banner-text">
            <strong>Verified Commercial Ledger:</strong> Reflects actual transactional payments
            collected across Cash, UPI, and Card POS terminals. Tax (GST) is segregated.
          </span>
        </div>
        <div className="banner-right">
          <span className="digital-share-pill">
            {kpis.digitalSharePercentage}% Digital Tender Share
          </span>
        </div>
      </div>

      {/* 8-Card Responsive KPI Grid */}
      <div className="finance-kpi-grid">
        {/* 1. Total Collected Revenue */}
        <div className="kpi-card card-gold">
          <div className="kpi-card-header">
            <span className="kpi-label">Total Collected Revenue</span>
            <div className="kpi-icon-wrap gold">
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value gold">{formatCurrency(kpis.totalCollectedRevenue)}</span>
          </div>
          <span className="kpi-subtext">
            Settled receipts across all tender methods
          </span>
        </div>

        {/* 2. Total Invoiced Amount */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Total Billed Invoices</span>
            <div className="kpi-icon-wrap purple">
              <AwardIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value purple">{formatCurrency(kpis.totalInvoicedAmount)}</span>
          </div>
          <span className="kpi-subtext">
            {kpis.totalInvoicesCount} invoices ({kpis.paidInvoicesCount} fully paid)
          </span>
        </div>

        {/* 3. Outstanding Receivables */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Outstanding Receivables</span>
            <div className={`kpi-icon-wrap ${kpis.outstandingReceivables > 0 ? 'rose' : 'emerald'}`}>
              <ClockIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className={`kpi-primary-value ${kpis.outstandingReceivables > 0 ? 'rose' : 'emerald'}`}>
              {formatCurrency(kpis.outstandingReceivables)}
            </span>
          </div>
          <span className="kpi-subtext">
            {kpis.unpaidInvoicesCount} pending / partial balances
          </span>
        </div>

        {/* 4. GST Tax Collected */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">GST Tax Collected (18%)</span>
            <div className="kpi-icon-wrap blue">
              <InfoIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value blue">{formatCurrency(kpis.totalTaxCollected)}</span>
          </div>
          <span className="kpi-subtext">
            CGST: {formatCurrency(kpis.totalCgstCollected)} &bull; SGST: {formatCurrency(kpis.totalSgstCollected)}
          </span>
        </div>

        {/* 5. Average Ticket Value */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Average Ticket Size</span>
            <div className="kpi-icon-wrap emerald">
              <CheckCircleIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value emerald">{formatCurrency(kpis.averageTicketValue)}</span>
          </div>
          <span className="kpi-subtext">Average spend per client transaction</span>
        </div>

        {/* 6. Digital Payment Volume */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Digital Receipts (UPI/Card)</span>
            <div className="kpi-icon-wrap purple">
              <UsersIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value purple">{formatCurrency(kpis.digitalCollected)}</span>
          </div>
          <span className="kpi-subtext">
            {kpis.digitalSharePercentage}% of total salon turnover
          </span>
        </div>

        {/* 7. Cash In Hand Receipts */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Cash Collected</span>
            <div className="kpi-icon-wrap gold">
              <TrendingUpIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value">{formatCurrency(kpis.cashCollected)}</span>
          </div>
          <span className="kpi-subtext">
            Physical currency received at front desk
          </span>
        </div>

        {/* 8. Total Discounts Given */}
        <div className="kpi-card">
          <div className="kpi-card-header">
            <span className="kpi-label">Discounts & Promos</span>
            <div className="kpi-icon-wrap rose">
              <TagIcon size={18} />
            </div>
          </div>
          <div className="kpi-value-row">
            <span className="kpi-primary-value rose">{formatCurrency(kpis.totalDiscountsGiven)}</span>
          </div>
          <span className="kpi-subtext">
            Promotional goodwill & seasonal fee waivers
          </span>
        </div>
      </div>
    </div>
  )
}

