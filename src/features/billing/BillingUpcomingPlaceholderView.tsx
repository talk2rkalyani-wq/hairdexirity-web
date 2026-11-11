import React from 'react'
import type { NavId } from '../../types/salon.ts'
import {
  FileTextIcon,
  TrendingUpIcon,
  UsersIcon,
  ClipboardListIcon,
  RefreshCwIcon,
  SettingsIcon,
  SparkleIcon,
  ScissorsIcon,
} from '../../components/Icons.tsx'
import './BillingUpcomingPlaceholderView.css'

interface BillingUpcomingPlaceholderViewProps {
  targetRoute: NavId
  onNavigate: (route: NavId) => void
}

const UPCOMING_META: Record<
  string,
  { title: string; phase: string; description: string; icon: React.ReactNode }
> = {
  'billing/invoices': {
    title: 'Invoice History & Public Sharing',
    phase: 'Phase 3 & Phase 4',
    description:
      'Full search, date range filtering, A4 and thermal receipt download, WhatsApp Click-to-Chat delivery, and secure public invoice links.',
    icon: <FileTextIcon size={32} />,
  },
  'billing/payments': {
    title: 'Payments & Cash Drawer Reconciliation',
    phase: 'Phase 4',
    description:
      'Granular tender audit streams, daily cash drawer balancing, bank deposit matching, and advance payment deposits.',
    icon: <TrendingUpIcon size={32} />,
  },
  'billing/ledger': {
    title: 'Customer Accounting Ledger',
    phase: 'Phase 4',
    description:
      'Running debtor and creditor balances, chronological customer statements, debit/credit entries, and PDF statement generation.',
    icon: <UsersIcon size={32} />,
  },
  'billing/estimates': {
    title: 'Estimates & Quotations',
    phase: 'Phase 4',
    description:
      'Bridal and package quotations with expiry dates and 1-click conversion to finalized commercial POS invoices.',
    icon: <ClipboardListIcon size={32} />,
  },
  'billing/refunds': {
    title: 'Refunds & Credit Notes',
    phase: 'Phase 4',
    description:
      'Full and partial payment reversals, store credit notes, and retail inventory restock handling with manager authorization.',
    icon: <RefreshCwIcon size={32} />,
  },
  'billing/reports': {
    title: 'Billing Reports & GST Accounting',
    phase: 'Phase 8',
    description:
      'Taxable turnover reports, GSTR-3B preparation tables, stylist commission tracking, and comprehensive Profit & Loss calculations.',
    icon: <TrendingUpIcon size={32} />,
  },
  'billing/settings': {
    title: 'Billing & Legal Tax Configuration',
    phase: 'Phase 9',
    description:
      'Salon GSTIN registration, invoice numbering sequence prefixes, thermal receipt footers, and discount authorization thresholds.',
    icon: <SettingsIcon size={32} />,
  },
}

export const BillingUpcomingPlaceholderView: React.FC<BillingUpcomingPlaceholderViewProps> = ({
  targetRoute,
  onNavigate,
}) => {
  const meta = UPCOMING_META[targetRoute] || {
    title: 'Upcoming Billing Module',
    phase: 'Subsequent Phase',
    description: 'This operational billing capability is part of the approved 12-phase development roadmap.',
    icon: <SparkleIcon size={32} />,
  }

  return (
    <div className="billing-placeholder-container">
      <div className="billing-placeholder-card">
        <div className="placeholder-icon-wrap">{meta.icon}</div>
        <span className="placeholder-phase-badge">{meta.phase} Roadmap</span>
        <h2 className="placeholder-title">{meta.title}</h2>
        <p className="placeholder-desc">{meta.description}</p>

        <div className="placeholder-actions">
          <button
            type="button"
            className="btn-primary-purple"
            onClick={() => onNavigate('billing/new')}
          >
            <ScissorsIcon size={18} />
            <span>Open New Bill POS</span>
          </button>
          <button
            type="button"
            className="btn-secondary-slate"
            onClick={() => onNavigate('billing/overview')}
          >
            <span>Back to Billing Overview</span>
          </button>
        </div>
      </div>
    </div>
  )
}

