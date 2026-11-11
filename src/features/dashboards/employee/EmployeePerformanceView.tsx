import React from 'react'
import { DashboardHeader } from '../common/DashboardHeader'
import { DashboardCard, MetricCard } from '../common/DashboardCard'
import { DashboardFoundationBanner } from '../common/DashboardStateContainers'
import { AwardIcon, TrendingUpIcon, ScissorsIcon, UsersIcon } from '../../../components/Icons'
import type { NavId } from '../../../types/salon'
import '../common/DashboardStyles.css'

interface EmployeePerformanceViewProps {
  onNavigate: (route: NavId) => void
}

export const EmployeePerformanceView: React.FC<EmployeePerformanceViewProps> = ({
  onNavigate: _onNavigate,
}) => {
  return (
    <div className="dashboard-workspace-container">
      <DashboardHeader
        role="EMPLOYEE"
        roleLabel="Stylist Workspace"
        title="My Performance"
        subtitle="Track personal service milestones, client retention, and review highlights."
      />

      <DashboardFoundationBanner
        moduleName="Stylist Performance & Growth"
        scopeDescription="Personalized performance feedback dashboard displaying completed services count, client repeat rates, and service targets without exposing salon-wide finances."
        plannedFeatures={[
          'Completed Service Counts by Category',
          'Client Rebooking & Retention Rate',
          'Client Feedback & Five-Star Ratings',
          'Professional Development & Skill Badges',
        ]}
      />

      <div className="dashboard-metrics-grid">
        <MetricCard
          label="Service Target"
          value="Tracked"
          subtext="Monthly completion milestone"
          icon={<TrendingUpIcon size={20} />}
        />
        <MetricCard
          label="Client Satisfaction"
          value="Top Tier"
          subtext="Consistent positive feedback"
          icon={<AwardIcon size={20} />}
        />
        <MetricCard
          label="Primary Category"
          value="Styling & Cut"
          subtext="Core specialization"
          icon={<ScissorsIcon size={20} />}
        />
        <MetricCard
          label="Client Rebooking"
          value="Tracked"
          subtext="Return clients prioritized"
          icon={<UsersIcon size={20} />}
        />
      </div>

      <DashboardCard
        title="Performance & Excellence Summary"
        subtitle="Your ongoing quality standards at Hair Dexirity."
        statusBadge="Personal Milestone"
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: '1.6', margin: 0 }}>
          Individual stylist performance metrics focus on service craftsmanship, punctuality, client satisfaction,
          and repeat booking rates. Detailed metrics and monthly milestones will be calculated in subsequent phases.
        </p>
      </DashboardCard>
    </div>
  )
}

