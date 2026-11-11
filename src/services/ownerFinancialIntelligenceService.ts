// ==============================================================================
// Luma Salon — Owner Financial Intelligence Service (Phase 8)
// Executive Financial Aggregations, Authoritative P&L, Accrual Revenue,
// Cash Collections, Receivables Ageing, Supplier Payables, and Staff Attribution
// ==============================================================================

import { supabase, isSupabaseConfigured } from '../lib/supabaseClient.ts'
import { sessionService } from './sessionService.ts'
import type {
  FinancialTimeRangePreset,
  FinancialDateRange,
  OwnerFinancialIntelligenceReport,
  FinancialOverviewKpis,
  DailyTrendPoint,
  TenderBreakdownItem,
  ProfitLossStatement,
  CustomerReceivablesIntelligence,
  SupplierPayablesIntelligence,
  InventoryFinancialIntelligence,
  StaffPerformanceItem,
  ServicePerformanceItem,
} from '../types/financialIntelligence.ts'
import { getSalonDateStr, addDaysToDate } from '../utils/formatters.ts'

/**
 * Computes exact start and end dates for a financial preset in Asia/Kolkata (IST)
 */
export function computeFinancialDateRange(
  preset: FinancialTimeRangePreset,
  customStart?: string,
  customEnd?: string
): FinancialDateRange {
  const today = getSalonDateStr(0)
  const yesterday = getSalonDateStr(-1)
  const [yearStr, monthStr] = today.split('-')
  const currentYear = parseInt(yearStr, 10)
  const currentMonth = parseInt(monthStr, 10)

  switch (preset) {
    case 'today':
      return {
        preset: 'today',
        startDate: today,
        endDate: today,
        label: "Today's Performance",
      }

    case 'yesterday':
      return {
        preset: 'yesterday',
        startDate: yesterday,
        endDate: yesterday,
        label: 'Yesterday',
      }

    case 'this_week': {
      // Find Monday of the current week (ISO week)
      const d = new Date(`${today}T12:00:00+05:30`)
      const day = d.getDay() // 0 = Sun, 1 = Mon...
      const diff = day === 0 ? -6 : 1 - day
      const monday = addDaysToDate(today, diff)
      return {
        preset: 'this_week',
        startDate: monday,
        endDate: today,
        label: 'This Week (Mon–Today)',
      }
    }

    case 'this_month': {
      const startOfMonth = `${yearStr}-${monthStr}-01`
      return {
        preset: 'this_month',
        startDate: startOfMonth,
        endDate: today,
        label: 'This Month',
      }
    }

    case 'last_month': {
      let prevMonthYear = currentYear
      let prevMonth = currentMonth - 1
      if (prevMonth === 0) {
        prevMonth = 12
        prevMonthYear -= 1
      }
      const prevMonthStr = String(prevMonth).padStart(2, '0')
      const startOfLastMonth = `${prevMonthYear}-${prevMonthStr}-01`
      // Last day of previous month
      const lastDayOfPrevMonth = new Date(prevMonthYear, prevMonth, 0).getDate()
      const endOfLastMonth = `${prevMonthYear}-${prevMonthStr}-${String(lastDayOfPrevMonth).padStart(2, '0')}`
      return {
        preset: 'last_month',
        startDate: startOfLastMonth,
        endDate: endOfLastMonth,
        label: 'Previous Month',
      }
    }

    case 'this_year': {
      const startOfYear = `${yearStr}-01-01`
      return {
        preset: 'this_year',
        startDate: startOfYear,
        endDate: today,
        label: `This Year (${yearStr})`,
      }
    }

    case 'last_year': {
      const lastYear = currentYear - 1
      return {
        preset: 'last_year',
        startDate: `${lastYear}-01-01`,
        endDate: `${lastYear}-12-31`,
        label: `Previous Year (${lastYear})`,
      }
    }

    case 'custom':
    default:
      return {
        preset: 'custom',
        startDate: customStart || addDaysToDate(today, -29),
        endDate: customEnd || today,
        label: customStart && customEnd ? `${customStart} to ${customEnd}` : 'Custom Range',
      }
  }
}

class OwnerFinancialIntelligenceService {
  private getActiveSalonId(salonIdOverride?: string): string {
    return (
      salonIdOverride ||
      sessionService.getCurrentSession()?.salonId ||
      'salon-luma-01'
    )
  }

  /**
   * Fetches authoritative financial intelligence data from PostgreSQL stored RPC
   */
  async getFinancialIntelligence(
    dateRange: FinancialDateRange,
    salonIdOverride?: string
  ): Promise<OwnerFinancialIntelligenceReport> {
    const salonId = this.getActiveSalonId(salonIdOverride)

    if (isSupabaseConfigured() && supabase) {
      try {
        const { data, error } = await supabase.rpc(
          'rpc_get_owner_financial_intelligence',
          {
            p_salon_id: salonId,
            p_start_date: dateRange.startDate,
            p_end_date: dateRange.endDate,
          }
        )

        if (!error && data) {
          return this.mapRpcPayloadToDomain(data, dateRange)
        }
        if (error) {
          console.warn('[FinancialIntelligence] RPC error, using fallback:', error.message)
        }
      } catch (err: any) {
        console.warn('[FinancialIntelligence] Failed to execute RPC:', err?.message || err)
      }
    }

    // Fallback: Return empty/zero baseline structure if database connection is unavailable
    return this.createEmptyReport(salonId, dateRange)
  }

  private mapRpcPayloadToDomain(
    raw: any,
    dateRange: FinancialDateRange
  ): OwnerFinancialIntelligenceReport {
    const k = raw.kpis || {}
    const pnl = raw.pnl_statement || {}
    const cr = raw.customer_receivables || {}
    const sp = raw.supplier_payables || {}
    const inv = raw.inventory_analytics || {}

    const kpis: FinancialOverviewKpis = {
      grossSales: Number(k.gross_sales || 0),
      discountsTotal: Number(k.discounts_total || 0),
      netSales: Number(k.net_sales || 0),
      taxCollected: Number(k.tax_collected || 0),
      cgstCollected: Number(k.cgst_collected || 0),
      sgstCollected: Number(k.sgst_collected || 0),
      totalInvoiced: Number(k.total_invoiced || 0),
      totalCollections: Number(k.total_collections || 0),
      customerOutstanding: Number(k.customer_outstanding || 0),
      customerAdvancesBalance: Number(k.customer_advances_balance || 0),
      refundsTotal: Number(k.refunds_total || 0),
      creditNotesBalance: Number(k.credit_notes_balance || 0),
      purchaseExpenses: Number(k.purchase_expenses || 0),
      supplierOutstanding: Number(k.supplier_outstanding || 0),
      supplierAdvancesBalance: Number(k.supplier_advances_balance || 0),
      supplierReturnsTotal: Number(k.supplier_returns_total || 0),
      inventoryTotalValue: Number(k.inventory_total_value || 0),
      inventoryRetailValue: Number(k.inventory_retail_value || 0),
      inventoryConsumableValue: Number(k.inventory_consumable_value || 0),
      cogsRetail: Number(k.cogs_retail || 0),
      consumableUsageCost: Number(k.consumable_usage_cost || 0),
      stockLossValue: Number(k.stock_loss_value || 0),
      estimatedGrossProfit: Number(k.estimated_gross_profit || 0),
      recordedOperatingContribution: Number(k.recorded_operating_contribution || 0),
      invoicesCount: Number(k.invoices_count || 0),
      paidInvoicesCount: Number(k.paid_invoices_count || 0),
      unpaidInvoicesCount: Number(k.unpaid_invoices_count || 0),
    }

    const pnlStatement: ProfitLossStatement = {
      grossSales: Number(pnl.gross_sales || 0),
      discounts: Number(pnl.discounts || 0),
      netSales: Number(pnl.net_sales || 0),
      refunds: Number(pnl.refunds || 0),
      effectiveRevenue: Number(pnl.effective_revenue || 0),
      cogsRetail: Number(pnl.cogs_retail || 0),
      consumableUsageCost: Number(pnl.consumable_usage_cost || 0),
      grossProfit: Number(pnl.gross_profit || 0),
      grossMarginPercentage: Number(pnl.gross_margin_percentage || 0),
      stockLosses: Number(pnl.stock_losses || 0),
      recordedOperatingContribution: Number(pnl.recorded_operating_contribution || 0),
      contributionMarginPercentage: Number(pnl.contribution_margin_percentage || 0),
      disclaimer:
        pnl.disclaimer ||
        'Recorded operating contribution excludes off-ledger salon facility lease/rent, utility overheads, and non-system operating expenses which are not tracked in the application database.',
    }

    const customerReceivables: CustomerReceivablesIntelligence = {
      totalOutstanding: Number(cr.total_outstanding || 0),
      ageing: {
        current0To30: Number(cr.ageing?.current_0_30 || 0),
        age31To60: Number(cr.ageing?.age_31_60 || 0),
        age61To90: Number(cr.ageing?.age_61_90 || 0),
        over90: Number(cr.ageing?.over_90 || 0),
      },
      topDebtors: (cr.top_debtors || []).map((d: any) => ({
        clientId: d.client_id,
        clientName: d.client_name,
        clientPhone: d.client_phone || '',
        invoiceCount: Number(d.invoice_count || 0),
        totalInvoiced: Number(d.total_invoiced || 0),
        totalPaid: Number(d.total_paid || 0),
        balanceDue: Number(d.balance_due || 0),
      })),
      advancesTotal: Number(cr.advances_total || 0),
      advancesUnallocated: Number(cr.advances_unallocated || 0),
      creditNotesTotal: Number(cr.credit_notes_total || 0),
      creditNotesRemaining: Number(cr.credit_notes_remaining || 0),
    }

    const supplierPayables: SupplierPayablesIntelligence = {
      totalOutstanding: Number(sp.total_outstanding || 0),
      totalPurchases: Number(sp.total_purchases || 0),
      totalPaid: Number(sp.total_paid || 0),
      totalAdvances: Number(sp.total_advances || 0),
      totalReturns: Number(sp.total_returns || 0),
      topCreditors: (sp.top_creditors || []).map((c: any) => ({
        supplierId: c.supplier_id,
        supplierName: c.supplier_name,
        billCount: Number(c.bill_count || 0),
        totalBilled: Number(c.total_billed || 0),
        totalPaid: Number(c.total_paid || 0),
        balanceDue: Number(c.balance_due || 0),
      })),
    }

    const inventoryAnalytics: InventoryFinancialIntelligence = {
      totalValuation: Number(inv.total_valuation || 0),
      retailValuation: Number(inv.retail_valuation || 0),
      consumableValuation: Number(inv.consumable_valuation || 0),
      valuationByCategory: (inv.valuation_by_category || []).map((vc: any) => ({
        category: vc.category,
        itemType: vc.item_type,
        productCount: Number(vc.product_count || 0),
        totalStock: Number(vc.total_stock || 0),
        totalValue: Number(vc.total_value || 0),
      })),
      stockLossByType: (inv.stock_loss_by_type || []).map((lt: any) => ({
        lossType: lt.loss_type,
        count: Number(lt.count || 0),
        quantity: Number(lt.quantity || 0),
        totalLossValue: Number(lt.total_loss_value || 0),
      })),
      deadStock: (inv.dead_stock || []).map((ds: any) => ({
        productId: ds.product_id,
        name: ds.name,
        sku: ds.sku,
        category: ds.category,
        currentStock: Number(ds.current_stock || 0),
        unitCost: Number(ds.unit_cost || 0),
        totalValue: Number(ds.total_value || 0),
        lastMovementDate: ds.last_movement_date,
      })),
    }

    const revenueVsCollections: DailyTrendPoint[] = (raw.revenue_vs_collections || []).map((t: any) => ({
      date: t.date,
      displayDate: t.display_date,
      dayOfWeek: t.day_of_week,
      grossSales: Number(t.gross_sales || 0),
      netSales: Number(t.net_sales || 0),
      taxAmount: Number(t.tax_amount || 0),
      totalInvoiced: Number(t.total_invoiced || 0),
      invoicesCount: Number(t.invoices_count || 0),
      collections: Number(t.collections || 0),
      cashCollections: Number(t.cash_collections || 0),
      upiCollections: Number(t.upi_collections || 0),
      cardCollections: Number(t.card_collections || 0),
      bankCollections: Number(t.bank_collections || 0),
    }))

    const collectionsByTender: TenderBreakdownItem[] = (raw.collections_by_tender || []).map((tc: any) => ({
      method: tc.method,
      label: tc.label,
      amount: Number(tc.amount || 0),
      count: Number(tc.count || 0),
      percentage: Number(tc.percentage || 0),
    }))

    const staffPerformance: StaffPerformanceItem[] = (raw.staff_performance || []).map((sp: any) => ({
      staffId: sp.staff_id,
      staffName: sp.staff_name,
      role: sp.role,
      serviceRevenue: Number(sp.service_revenue || 0),
      productRevenue: Number(sp.product_revenue || 0),
      totalRevenue: Number(sp.total_revenue || 0),
      serviceCount: Number(sp.service_count || 0),
      productCount: Number(sp.product_count || 0),
      lineDiscounts: Number(sp.line_discounts || 0),
    }))

    const servicePerformance: ServicePerformanceItem[] = (raw.service_performance || []).map((srv: any) => ({
      serviceId: srv.service_id,
      serviceName: srv.service_name,
      volume: Number(srv.volume || 0),
      revenue: Number(srv.revenue || 0),
      averagePrice: Number(srv.average_price || 0),
    }))

    return {
      salonId: raw.salon_id || 'salon-luma-01',
      period: raw.period || { startDate: dateRange.startDate, endDate: dateRange.endDate },
      dateRange,
      kpis,
      revenueVsCollections,
      collectionsByTender,
      pnlStatement,
      customerReceivables,
      supplierPayables,
      inventoryAnalytics,
      staffPerformance,
      servicePerformance,
    }
  }

  private createEmptyReport(
    salonId: string,
    dateRange: FinancialDateRange
  ): OwnerFinancialIntelligenceReport {
    return {
      salonId,
      period: { startDate: dateRange.startDate, endDate: dateRange.endDate },
      dateRange,
      kpis: {
        grossSales: 0,
        discountsTotal: 0,
        netSales: 0,
        taxCollected: 0,
        cgstCollected: 0,
        sgstCollected: 0,
        totalInvoiced: 0,
        totalCollections: 0,
        customerOutstanding: 0,
        customerAdvancesBalance: 0,
        refundsTotal: 0,
        creditNotesBalance: 0,
        purchaseExpenses: 0,
        supplierOutstanding: 0,
        supplierAdvancesBalance: 0,
        supplierReturnsTotal: 0,
        inventoryTotalValue: 0,
        inventoryRetailValue: 0,
        inventoryConsumableValue: 0,
        cogsRetail: 0,
        consumableUsageCost: 0,
        stockLossValue: 0,
        estimatedGrossProfit: 0,
        recordedOperatingContribution: 0,
        invoicesCount: 0,
        paidInvoicesCount: 0,
        unpaidInvoicesCount: 0,
      },
      revenueVsCollections: [],
      collectionsByTender: [],
      pnlStatement: {
        grossSales: 0,
        discounts: 0,
        netSales: 0,
        refunds: 0,
        effectiveRevenue: 0,
        cogsRetail: 0,
        consumableUsageCost: 0,
        grossProfit: 0,
        grossMarginPercentage: 0,
        stockLosses: 0,
        recordedOperatingContribution: 0,
        contributionMarginPercentage: 0,
        disclaimer: 'No financial data found for the selected period.',
      },
      customerReceivables: {
        totalOutstanding: 0,
        ageing: { current0To30: 0, age31To60: 0, age61To90: 0, over90: 0 },
        topDebtors: [],
        advancesTotal: 0,
        advancesUnallocated: 0,
        creditNotesTotal: 0,
        creditNotesRemaining: 0,
      },
      supplierPayables: {
        totalOutstanding: 0,
        totalPurchases: 0,
        totalPaid: 0,
        totalAdvances: 0,
        totalReturns: 0,
        topCreditors: [],
      },
      inventoryAnalytics: {
        totalValuation: 0,
        retailValuation: 0,
        consumableValuation: 0,
        valuationByCategory: [],
        stockLossByType: [],
        deadStock: [],
      },
      staffPerformance: [],
      servicePerformance: [],
    }
  }
}

export const ownerFinancialIntelligenceService = new OwnerFinancialIntelligenceService()
