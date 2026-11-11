// ==============================================================================
// Luma Salon — Owner Financial Intelligence & Executive P&L Types (Phase 8)
// Executive KPI Interfaces, Accrual Revenue, Cash Collections, Receivables,
// Payables, Inventory Financials, and Staff Performance Models
// ==============================================================================

export type FinancialTimeRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_year'
  | 'custom'

export interface FinancialDateRange {
  preset: FinancialTimeRangePreset
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  label: string
}

export interface FinancialOverviewKpis {
  grossSales: number
  discountsTotal: number
  netSales: number
  taxCollected: number
  cgstCollected: number
  sgstCollected: number
  totalInvoiced: number
  totalCollections: number
  customerOutstanding: number
  customerAdvancesBalance: number
  refundsTotal: number
  creditNotesBalance: number
  purchaseExpenses: number
  supplierOutstanding: number
  supplierAdvancesBalance: number
  supplierReturnsTotal: number
  inventoryTotalValue: number
  inventoryRetailValue: number
  inventoryConsumableValue: number
  cogsRetail: number
  consumableUsageCost: number
  stockLossValue: number
  estimatedGrossProfit: number
  recordedOperatingContribution: number
  invoicesCount: number
  paidInvoicesCount: number
  unpaidInvoicesCount: number
}

export interface DailyTrendPoint {
  date: string // YYYY-MM-DD
  displayDate: string // DD/MM
  dayOfWeek: string // Mon, Tue...
  grossSales: number
  netSales: number
  taxAmount: number
  totalInvoiced: number
  invoicesCount: number
  collections: number
  cashCollections: number
  upiCollections: number
  cardCollections: number
  bankCollections: number
}

export interface TenderBreakdownItem {
  method: string
  label: string
  amount: number
  count: number
  percentage: number
}

export interface ProfitLossStatement {
  grossSales: number
  discounts: number
  netSales: number
  refunds: number
  effectiveRevenue: number
  cogsRetail: number
  consumableUsageCost: number
  grossProfit: number
  grossMarginPercentage: number
  stockLosses: number
  recordedOperatingContribution: number
  contributionMarginPercentage: number
  disclaimer: string
}

export interface ReceivablesAgeing {
  current0To30: number
  age31To60: number
  age61To90: number
  over90: number
}

export interface TopDebtorClient {
  clientId: string
  clientName: string
  clientPhone: string
  invoiceCount: number
  totalInvoiced: number
  totalPaid: number
  balanceDue: number
}

export interface CustomerReceivablesIntelligence {
  totalOutstanding: number
  ageing: ReceivablesAgeing
  topDebtors: TopDebtorClient[]
  advancesTotal: number
  advancesUnallocated: number
  creditNotesTotal: number
  creditNotesRemaining: number
}

export interface TopCreditorSupplier {
  supplierId: string
  supplierName: string
  billCount: number
  totalBilled: number
  totalPaid: number
  balanceDue: number
}

export interface SupplierPayablesIntelligence {
  totalOutstanding: number
  totalPurchases: number
  totalPaid: number
  totalAdvances: number
  totalReturns: number
  topCreditors: TopCreditorSupplier[]
}

export interface CategoryValuationItem {
  category: string
  itemType: 'retail' | 'consumable'
  productCount: number
  totalStock: number
  totalValue: number
}

export interface StockLossByTypeItem {
  lossType: string
  count: number
  quantity: number
  totalLossValue: number
}

export interface DeadStockItem {
  productId: string
  name: string
  sku: string
  category: string
  currentStock: number
  unitCost: number
  totalValue: number
  lastMovementDate: string
}

export interface InventoryFinancialIntelligence {
  totalValuation: number
  retailValuation: number
  consumableValuation: number
  valuationByCategory: CategoryValuationItem[]
  stockLossByType: StockLossByTypeItem[]
  deadStock: DeadStockItem[]
}

export interface StaffPerformanceItem {
  staffId: string
  staffName: string
  role: string
  serviceRevenue: number
  productRevenue: number
  totalRevenue: number
  serviceCount: number
  productCount: number
  lineDiscounts: number
}

export interface ServicePerformanceItem {
  serviceId: string
  serviceName: string
  volume: number
  revenue: number
  averagePrice: number
}

export interface OwnerFinancialIntelligenceReport {
  salonId: string
  period: {
    startDate: string
    endDate: string
  }
  dateRange: FinancialDateRange
  kpis: FinancialOverviewKpis
  revenueVsCollections: DailyTrendPoint[]
  collectionsByTender: TenderBreakdownItem[]
  pnlStatement: ProfitLossStatement
  customerReceivables: CustomerReceivablesIntelligence
  supplierPayables: SupplierPayablesIntelligence
  inventoryAnalytics: InventoryFinancialIntelligence
  staffPerformance: StaffPerformanceItem[]
  servicePerformance: ServicePerformanceItem[]
}

