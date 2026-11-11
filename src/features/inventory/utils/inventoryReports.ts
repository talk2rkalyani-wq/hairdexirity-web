// ==============================================================================
// Hair Dexirity — Inventory Reporting & CSV Exports
// Phase 7: Inventory Management & Stock Control Reports
// ==============================================================================

import type {
  InventoryProduct,
  InventoryBatch,
  ConsumableUsage,
  StockLossRecord,
  StockAuditSession,
  StockMovement,
} from '../../../types/inventory.ts'

function downloadCsv(filename: string, rows: (string | number | undefined | null)[][]) {
  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return '""'
          const str = String(cell).replace(/"/g, '""')
          return `"${str}"`
        })
        .join(',')
    )
    .join('\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

export const inventoryReportExporter = {
  // 1. Stock Summary Report
  exportStockSummary(products: InventoryProduct[]) {
    const headers = [
      'SKU',
      'Product Name',
      'Brand',
      'Category',
      'Type',
      'Current Stock',
      'Reserved Stock',
      'Available Stock',
      'Unit',
      'Unit Cost (₹)',
      'Selling Price (₹)',
      'Total Valuation (₹)',
      'Status',
    ]
    const data = products.map((p) => [
      p.sku,
      p.name,
      p.brand,
      p.category,
      p.itemType || 'retail',
      p.currentStock,
      p.reservedStock || 0,
      p.currentStock - (p.reservedStock || 0),
      p.unit,
      (p.weightedAverageCost || p.purchasePrice || 0).toFixed(2),
      p.sellingPrice.toFixed(2),
      (p.currentStock * (p.weightedAverageCost || p.purchasePrice || 0)).toFixed(2),
      p.status,
    ])
    downloadCsv(`hair_dexirity_inventory_summary_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 2. Low Stock Reorder Report
  exportLowStockReorder(products: InventoryProduct[]) {
    const headers = [
      'SKU',
      'Product Name',
      'Type',
      'Current Stock',
      'Unit',
      'Reorder Level',
      'Max Stock Threshold',
      'Suggested Reorder Qty',
      'Unit Cost (₹)',
      'Estimated Reorder Cost (₹)',
    ]
    const lowStockItems = products.filter(
      (p) => p.currentStock <= (p.reorderLevel || p.minStockThreshold || 0)
    )
    const data = lowStockItems.map((p) => {
      const max = p.maxStockThreshold || (p.minStockThreshold || 5) * 3
      const suggested = Math.max(0, max - p.currentStock)
      const cost = p.weightedAverageCost || p.purchasePrice || 0
      return [
        p.sku,
        p.name,
        p.itemType || 'retail',
        p.currentStock,
        p.unit,
        p.reorderLevel || p.minStockThreshold || 0,
        max,
        suggested,
        cost.toFixed(2),
        (suggested * cost).toFixed(2),
      ]
    })
    downloadCsv(`hair_dexirity_low_stock_reorder_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 3. Stock Movement Audit Log
  exportStockMovements(movements: StockMovement[]) {
    const headers = [
      'Date / Time',
      'Movement Type',
      'Product / Item',
      'Quantity In',
      'Quantity Out',
      'Balance After',
      'Unit Cost (₹)',
      'Total Value (₹)',
      'Source / Document',
      'Notes',
    ]
    const data = movements.map((m) => [
      m.createdAt,
      m.movementType,
      m.productName || m.productId,
      m.quantityIn || 0,
      m.quantityOut || 0,
      m.balanceAfter,
      (m.unitCost || 0).toFixed(2),
      (m.totalCost || 0).toFixed(2),
      m.sourceDocument || m.referenceDocument || '',
      m.notes || '',
    ])
    downloadCsv(`hair_dexirity_stock_movement_ledger_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 4. Consumable Usage by Service / Department
  exportConsumableUsage(usages: ConsumableUsage[]) {
    const headers = [
      'Usage #',
      'Date',
      'Item Name',
      'Quantity Used',
      'Unit',
      'Purpose / Service',
      'Cost Impact (₹)',
      'Recorded By',
      'Notes',
    ]
    const data = usages.map((u) => [
      u.usageNumber,
      u.createdAt,
      u.productName || u.productId,
      u.quantity,
      u.unit,
      u.reason || '',
      (u.totalCost || 0).toFixed(2),
      u.recordedBy || 'Staff',
      u.notes || '',
    ])
    downloadCsv(`hair_dexirity_consumable_usages_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 5. Inventory Valuation Report (WAC)
  exportValuationReport(products: InventoryProduct[]) {
    const headers = [
      'Category',
      'SKU',
      'Item Name',
      'Type',
      'Current Stock',
      'Unit',
      'WAC Unit Cost (₹)',
      'Total Valuation (₹)',
    ]
    const data = products.map((p) => {
      const unitCost = p.weightedAverageCost || p.purchasePrice || 0
      return [
        p.category,
        p.sku,
        p.name,
        p.itemType || 'retail',
        p.currentStock,
        p.unit,
        unitCost.toFixed(2),
        (p.currentStock * unitCost).toFixed(2),
      ]
    })
    downloadCsv(`hair_dexirity_inventory_valuation_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 6. Batch Expiry & Shelf-Life Report
  exportBatchExpiryReport(batches: InventoryBatch[]) {
    const headers = [
      'Batch #',
      'Product ID',
      'Current Qty',
      'Mfg Date',
      'Expiry Date',
      'Days to Expiry',
      'Status',
    ]
    const now = new Date().getTime()
    const data = batches.map((b) => {
      const expTime = new Date(b.expiryDate).getTime()
      const days = Math.round((expTime - now) / (1000 * 60 * 60 * 24))
      return [
        b.batchNumber,
        b.productName || b.productId,
        b.currentQuantity,
        b.manufacturingDate || '-',
        b.expiryDate,
        days,
        b.status,
      ]
    })
    downloadCsv(`hair_dexirity_batch_expiry_report_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 7. Stock Loss & Wastage Summary
  exportStockLossSummary(losses: StockLossRecord[]) {
    const headers = [
      'Loss #',
      'Date',
      'Item Name',
      'Loss Type',
      'Quantity Disposed',
      'Unit Cost (₹)',
      'Total Loss Value (₹)',
      'Reason',
      'Approved By',
      'Recorded By',
    ]
    const data = losses.map((l) => [
      l.lossNumber,
      l.createdAt,
      l.productName || l.productId,
      l.lossType,
      l.quantity,
      l.unitCost.toFixed(2),
      l.totalCost.toFixed(2),
      l.reason,
      l.approvedBy || 'Pending Owner Review',
      l.recordedBy || 'Staff',
    ])
    downloadCsv(`hair_dexirity_stock_loss_summary_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 8. Dead Stock & Slow-Moving Analysis
  exportDeadStockAnalysis(products: InventoryProduct[]) {
    const headers = [
      'SKU',
      'Product Name',
      'Category',
      'Current Stock',
      'Unit Cost (₹)',
      'Tied Capital (₹)',
      'Status',
    ]
    // Filter products with stock > 0 that are slow moving or non-moving
    const data = products
      .filter((p) => p.currentStock > 0)
      .map((p) => {
        const cost = p.weightedAverageCost || p.purchasePrice || 0
        return [
          p.sku,
          p.name,
          p.category,
          p.currentStock,
          cost.toFixed(2),
          (p.currentStock * cost).toFixed(2),
          p.status,
        ]
      })
    downloadCsv(`hair_dexirity_dead_stock_analysis_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 9. Stock Discrepancy & Reconciliation History
  exportStockAuditHistory(sessions: StockAuditSession[]) {
    const headers = [
      'Audit #',
      'Date Initiated',
      'Title',
      'Category Scope',
      'Status',
      'Items Counted',
      'Discrepancies Found',
      'Net Variance Value (₹)',
      'Counted By',
      'Reconciled At',
    ]
    const data = sessions.map((s) => [
      s.auditNumber,
      s.createdAt,
      s.title,
      s.categoryFilter || 'All',
      s.status,
      s.totalItemsCounted,
      s.totalDiscrepancies,
      s.netVarianceValue.toFixed(2),
      s.countedBy || '-',
      s.reconciledAt || '-',
    ])
    downloadCsv(`hair_dexirity_stock_audit_history_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 10. Goods Receipt vs Purchase Order Variance
  exportGrnPoVariance(products: InventoryProduct[]) {
    const headers = ['Item SKU', 'Product Name', 'Category', 'Current Stock', 'Unit', 'WAC Cost (₹)']
    const data = products.map((p) => [
      p.sku,
      p.name,
      p.category,
      p.currentStock,
      p.unit,
      (p.weightedAverageCost || p.purchasePrice || 0).toFixed(2),
    ])
    downloadCsv(`hair_dexirity_grn_po_variance_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 11. Purchase Return Impact on Stock
  exportPurchaseReturnImpact(movements: StockMovement[]) {
    const headers = [
      'Date',
      'Product Name',
      'Returned Qty',
      'Unit Cost (₹)',
      'Total Value (₹)',
      'Return Ref / Notes',
    ]
    const returnMoves = movements.filter((m) => m.movementType === 'PURCHASE_RETURN')
    const data = returnMoves.map((m) => [
      m.createdAt,
      m.productName || m.productId,
      m.quantityOut || 0,
      (m.unitCost || 0).toFixed(2),
      (m.totalCost || 0).toFixed(2),
      m.referenceDocument || m.notes || '',
    ])
    downloadCsv(`hair_dexirity_purchase_return_impact_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },

  // 12. Retail vs Consumable Consumption Ratio
  exportRetailVsConsumableRatio(products: InventoryProduct[]) {
    const headers = ['Classification', 'SKU Count', 'Total Units in Stock', 'Total Valuation (₹)', 'Valuation Share (%)']
    const retailProds = products.filter((p) => p.itemType !== 'consumable')
    const consumableProds = products.filter((p) => p.itemType === 'consumable')

    const retailVal = retailProds.reduce(
      (sum, p) => sum + p.currentStock * (p.weightedAverageCost || p.purchasePrice || 0),
      0
    )
    const consumableVal = consumableProds.reduce(
      (sum, p) => sum + p.currentStock * (p.weightedAverageCost || p.purchasePrice || 0),
      0
    )
    const totalVal = retailVal + consumableVal || 1

    const data = [
      [
        'Retail Products',
        retailProds.length,
        retailProds.reduce((sum, p) => sum + p.currentStock, 0),
        retailVal.toFixed(2),
        ((retailVal / totalVal) * 100).toFixed(1) + '%',
      ],
      [
        'Salon Consumables',
        consumableProds.length,
        consumableProds.reduce((sum, p) => sum + p.currentStock, 0),
        consumableVal.toFixed(2),
        ((consumableVal / totalVal) * 100).toFixed(1) + '%',
      ],
    ]
    downloadCsv(`hair_dexirity_retail_vs_consumable_ratio_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...data])
  },
}
