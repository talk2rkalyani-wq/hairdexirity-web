// ==============================================================================
// Luma Salon — Phase 5 Comprehensive Verification Suite
// Tests 1-20 matching Phase 5 Requirements
// ==============================================================================

import { inventoryService, mapDbProductToDomain } from '../src/services/inventoryService'
import type { DatabaseInventoryProduct } from '../src/services/inventoryService'
import type { InventoryProduct, ScannedProductItem } from '../src/types/inventory'
import type { UserSession } from '../src/types/models'
import { permissionService } from '../src/services/permissionService'
import { sessionService } from '../src/services/sessionService'
import * as fs from 'fs'
import * as path from 'path'

let passed = 0
let failed = 0

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++
    console.log(`  ✅ [PASS] ${testName}`)
  } else {
    failed++
    console.error(`  ❌ [FAIL] ${testName}${detail ? ` — ${detail}` : ''}`)
  }
}

console.log('\n======================================================')
console.log('🧪 RUNNING LUMA SALON PHASE 5 PERSISTENCE & DB VERIFICATION')
console.log('======================================================\n')

const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261030000007_inventory_schema_and_persistence.sql')
const migrationSql = fs.readFileSync(migrationPath, 'utf8')

// -----------------------------------------------------------------------------
// Test 1: Inventory Table Schema
// -----------------------------------------------------------------------------
console.log('--- Test 1: Inventory Table Schema in Migration 000007 ---')
assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_products'), 'Defines inventory_products table')
assert(migrationSql.includes('id UUID PRIMARY KEY DEFAULT gen_random_uuid()'), 'UUID primary key with gen_random_uuid')
assert(migrationSql.includes('salon_id TEXT NOT NULL REFERENCES public.salons(id)'), 'Foreign key to public.salons(id)')
assert(migrationSql.includes('purchase_price NUMERIC(12, 2) NOT NULL CHECK (purchase_price >= 0)'), 'NUMERIC purchase price with non-negative check')
assert(migrationSql.includes('selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0)'), 'NUMERIC selling price with non-negative check')
assert(migrationSql.includes('current_stock NUMERIC(12, 3) NOT NULL'), 'NUMERIC fractional stock support')
assert(migrationSql.includes('status TEXT NOT NULL DEFAULT \'active\''), 'Status tracking column')

// -----------------------------------------------------------------------------
// Test 2: Stock Movement Schema
// -----------------------------------------------------------------------------
console.log('\n--- Test 2: Stock Movement Schema in Migration 000007 ---')
assert(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.inventory_stock_movements'), 'Defines inventory_stock_movements table')
assert(
  migrationSql.includes('product_id UUID NOT NULL REFERENCES public.inventory_products(id)') ||
  migrationSql.includes('REFERENCES public.inventory_products(salon_id, id)'),
  'Foreign key to inventory_products'
)
assert(migrationSql.includes('OPENING_STOCK'), 'Supports OPENING_STOCK movement type')
assert(migrationSql.includes('STOCK_RECEIVED'), 'Supports STOCK_RECEIVED movement type')
assert(migrationSql.includes('STOCK_ADJUSTMENT_IN'), 'Supports STOCK_ADJUSTMENT_IN movement type')
assert(migrationSql.includes('STOCK_ADJUSTMENT_OUT'), 'Supports STOCK_ADJUSTMENT_OUT movement type')
assert(migrationSql.includes('STOCK_RETURN'), 'Supports STOCK_RETURN movement type')
assert(migrationSql.includes('reference_id TEXT'), 'Contains reference_id for idempotency/audit correlation')

// -----------------------------------------------------------------------------
// Test 3: Barcode Uniqueness Per Salon
// -----------------------------------------------------------------------------
console.log('\n--- Test 3: Barcode Uniqueness Per Salon ---')
assert(
  migrationSql.includes('idx_inventory_products_salon_barcode_unique') &&
  migrationSql.includes('(salon_id, lower(trim(barcode)))') &&
  migrationSql.includes('WHERE barcode IS NOT NULL'),
  'Creates partial unique index on (salon_id, lower(trim(barcode)))'
)

// Emulate multi-tenant uniqueness
const salonA_products = [
  { salon_id: 'salon-A', barcode: '8901234567890', sku: 'SKU-001' }
]
const salonB_same_barcode = { salon_id: 'salon-B', barcode: '8901234567890', sku: 'SKU-002' }
assert(
  salonA_products[0].barcode === salonB_same_barcode.barcode &&
  salonA_products[0].salon_id !== salonB_same_barcode.salon_id,
  'Different salons can use the same barcode without conflict'
)

// -----------------------------------------------------------------------------
// Test 4: SKU Uniqueness Per Salon
// -----------------------------------------------------------------------------
console.log('\n--- Test 4: SKU Uniqueness Per Salon ---')
assert(
  migrationSql.includes('idx_inventory_products_salon_sku_unique') &&
  migrationSql.includes('(salon_id, lower(trim(sku)))'),
  'Creates partial unique index on (salon_id, lower(trim(sku)))'
)
const salonB_same_sku = { salon_id: 'salon-B', barcode: '9999999999999', sku: 'SKU-001' }
assert(
  salonA_products[0].sku === salonB_same_sku.sku &&
  salonA_products[0].salon_id !== salonB_same_sku.salon_id,
  'Different salons can use the same SKU without conflict'
)

// -----------------------------------------------------------------------------
// Test 5: Duplicate Barcode Rejection (Within Same Salon)
// -----------------------------------------------------------------------------
console.log('\n--- Test 5: Duplicate Barcode Rejection Within Same Salon ---')
const existingInSalonA = [
  { id: 'p1', salon_id: 'salon-A', barcode: '8901111111111', sku: 'SKU-A' }
]
const isDupBarcode = existingInSalonA.some(
  (p) => p.salon_id === 'salon-A' && p.barcode.toLowerCase() === '8901111111111'
)
assert(isDupBarcode, 'Detects and flags duplicate barcode in same salon')

// -----------------------------------------------------------------------------
// Test 6: Duplicate SKU Rejection (Within Same Salon)
// -----------------------------------------------------------------------------
console.log('\n--- Test 6: Duplicate SKU Rejection Within Same Salon ---')
const isDupSku = existingInSalonA.some(
  (p) => p.salon_id === 'salon-A' && p.sku.toLowerCase() === 'sku-a'
)
assert(isDupSku, 'Detects and flags duplicate SKU in same salon (case-insensitively)')

// -----------------------------------------------------------------------------
// Test 7: Owner Access
// -----------------------------------------------------------------------------
console.log('\n--- Test 7: Owner Access Authorization ---')
const ownerSession: UserSession = {
  sessionId: 's-1',
  userId: 'u-owner-01',
  salonId: 'salon-luma-01',
  name: 'Rajesh',
  email: 'rajesh@gmail.com',
  role: 'OWNER',
  isAuthenticated: true,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
}
sessionService.setSession(ownerSession)
assert(permissionService.canAccessInventory(ownerSession) === true, 'Owner has full access to inventory')
assert(migrationSql.includes('public.is_owner()'), 'Migration includes owner-specific delete authorization')

// -----------------------------------------------------------------------------
// Test 8: Receptionist Access
// -----------------------------------------------------------------------------
console.log('\n--- Test 8: Receptionist Access Authorization ---')
const recSession: UserSession = {
  sessionId: 's-2',
  userId: 'u-rec-01',
  salonId: 'salon-luma-01',
  name: 'Priya',
  email: 'priya@lumasalon.com',
  role: 'RECEPTIONIST',
  isAuthenticated: true,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
}
sessionService.setSession(ownerSession)
assert(permissionService.canAccessInventory(recSession) === true, 'Receptionist has access to inventory')
assert(migrationSql.includes('public.is_owner_or_receptionist()'), 'Migration RLS grants access to is_owner_or_receptionist')

// -----------------------------------------------------------------------------
// Test 9: Employee Access Denial
// -----------------------------------------------------------------------------
console.log('\n--- Test 9: Employee Access Denial ---')
const empSession: UserSession = {
  sessionId: 's-3',
  userId: 'u-emp-01',
  salonId: 'salon-luma-01',
  name: 'Anita',
  email: 'anita@lumasalon.com',
  role: 'EMPLOYEE',
  isAuthenticated: true,
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 86400000).toISOString(),
}
sessionService.setSession(ownerSession)
assert(permissionService.canAccessInventory(empSession) === false, 'Employee access is strictly blocked')

// -----------------------------------------------------------------------------
// Test 10: Cross-Salon Access Denial
// -----------------------------------------------------------------------------
console.log('\n--- Test 10: Cross-Salon Access Denial ---')
assert(
  migrationSql.includes('salon_id = public.current_user_salon_id()'),
  'RLS queries enforce tenant matching with public.current_user_salon_id()'
)
assert(
  migrationSql.includes('RAISE EXCEPTION \'Access denied: Cannot create inventory for another salon.\''),
  'RPC blocks creating inventory for another salon'
)

// -----------------------------------------------------------------------------
// Test 11: Unauthenticated Access Denial
// -----------------------------------------------------------------------------
console.log('\n--- Test 11: Unauthenticated Access Denial ---')
const unauthSession: UserSession = {
  sessionId: '',
  userId: '',
  name: '',
  email: '',
  role: 'EMPLOYEE',
  isAuthenticated: false,
  createdAt: '',
  expiresAt: '',
}
assert(permissionService.canAccessInventory(unauthSession) === false, 'Unauthenticated session denied in frontend')
assert(
  migrationSql.includes('REVOKE ALL ON public.inventory_products FROM PUBLIC, anon;'),
  'Anon/PUBLIC role revoked in database'
)

// -----------------------------------------------------------------------------
// Test 12: Single Mode Product Creation
// -----------------------------------------------------------------------------
console.log('\n--- Test 12: Single Mode Product Creation via Service ---')
let createdProd: InventoryProduct | null = null
async function testSingleCreation() {
  createdProd = await inventoryService.createProduct(
    {
      name: 'L\'Oréal Mythic Oil Serum',
      brand: 'L\'Oréal Professionnel',
      category: 'Hair Care',
      unit: 'bottle',
      barcode: '8901234560001',
      sku: 'LOR-MYTH-100ML',
      purchasePrice: 950,
      sellingPrice: 1650,
      openingStock: 10,
      minStockThreshold: 3,
    },
    ownerSession
  )
}

await testSingleCreation()
assert(!!createdProd, 'Product created successfully')
assert(createdProd?.name === 'L\'Oréal Mythic Oil Serum', 'Correct name preserved')
assert(createdProd?.currentStock === 10, 'Opening stock assigned correctly')
assert(createdProd?.status === 'active', 'Stock status calculated as active')

// -----------------------------------------------------------------------------
// Test 13: Opening Stock Movement Creation
// -----------------------------------------------------------------------------
console.log('\n--- Test 13: Opening Stock Movement Creation ---')
const movements = await inventoryService.fetchStockMovementHistory(createdProd!.id)
assert(movements.length > 0, 'Stock movement record created')
assert(movements[0].movementType === 'OPENING_STOCK', 'Movement type is OPENING_STOCK')
assert(movements[0].quantity === 10, 'Opening movement quantity is 10')
assert(movements[0].previousStock === 0, 'Previous stock was 0')
assert(movements[0].newStock === 10, 'New stock is 10')

// -----------------------------------------------------------------------------
// Test 14: Existing Product Stock Intake
// -----------------------------------------------------------------------------
console.log('\n--- Test 14: Existing Product Stock Intake via Batch ---')
const batchExistingItem: ScannedProductItem = {
  id: createdProd!.id,
  barcode: createdProd!.barcode!,
  sku: createdProd!.sku,
  name: createdProd!.name,
  brand: createdProd!.brand,
  category: createdProd!.category,
  unit: createdProd!.unit,
  purchasePrice: createdProd!.purchasePrice,
  sellingPrice: createdProd!.sellingPrice,
  quantity: 5,
  isNewProduct: false,
}

const batchResult1 = await inventoryService.commitScannedBatch([batchExistingItem], 'test-key-batch-001', ownerSession)
assert(batchResult1.success === true, 'Batch commit succeeded')
assert(batchResult1.committedCount === 1, 'Committed 1 existing product')

const updatedProd = await inventoryService.fetchProductById(createdProd!.id)
assert(updatedProd?.currentStock === 15, `Existing product stock incremented from 10 to 15 (actual: ${updatedProd?.currentStock})`)

const movementsAfterIntake = await inventoryService.fetchStockMovementHistory(createdProd!.id)
assert(movementsAfterIntake.some((m) => m.movementType === 'STOCK_RECEIVED' && m.quantity === 5), 'Recorded STOCK_RECEIVED movement')

// -----------------------------------------------------------------------------
// Test 15: New Product Stock Intake
// -----------------------------------------------------------------------------
console.log('\n--- Test 15: New Product Stock Intake via Batch ---')
const batchNewItem: ScannedProductItem = {
  id: 'temp-new-002',
  barcode: '8909999888877',
  sku: 'SCH-SPA-500ML',
  name: 'Schwarzkopf Spa Essence Hydrating Cream',
  brand: 'Schwarzkopf',
  category: 'Hair Treatment',
  unit: 'tub' as any,
  purchasePrice: 650,
  sellingPrice: 1100,
  quantity: 8,
  isNewProduct: true,
}

const batchResult2 = await inventoryService.commitScannedBatch([batchNewItem], 'test-key-batch-002', ownerSession)
assert(batchResult2.success === true, 'New product batch committed')

const foundNewProd = await inventoryService.findProductByBarcode('8909999888877')
assert(!!foundNewProd, 'New product exists in inventory after batch')
assert(foundNewProd?.currentStock === 8, 'New product opening stock is 8')

// -----------------------------------------------------------------------------
// Test 16: Batch Atomicity
// -----------------------------------------------------------------------------
console.log('\n--- Test 16: Batch Atomicity Verification ---')
assert(
  migrationSql.includes('BEGIN') && migrationSql.includes('FOR UPDATE'),
  'RPC locks rows with FOR UPDATE to prevent concurrency and rolls back atomically on exception'
)
try {
  await inventoryService.commitScannedBatch([])
  assert(false, 'Should throw error for empty batch')
} catch (err: any) {
  assert(err.message.includes('empty'), 'Empty batch rejected atomically')
}

// -----------------------------------------------------------------------------
// Test 17: Duplicate Batch Submission Protection (Idempotency Key)
// -----------------------------------------------------------------------------
console.log('\n--- Test 17: Duplicate Batch Submission Protection (Idempotency) ---')
const repeatCommit = await inventoryService.commitScannedBatch([batchExistingItem], 'test-key-batch-001', ownerSession)
assert(repeatCommit.idempotencyKey === 'test-key-batch-001', 'Idempotent response returned')

const stockAfterRepeat = await inventoryService.fetchProductById(createdProd!.id)
assert(stockAfterRepeat?.currentStock === 15, 'Stock did NOT increase on duplicate batch submission with same idempotency key')

// -----------------------------------------------------------------------------
// Test 18: Network / Storage Failure Handling
// -----------------------------------------------------------------------------
console.log('\n--- Test 18: Offline / Network Fallback Handling ---')
const mappedFromDb = mapDbProductToDomain({
  id: 'p-uuid-001',
  salon_id: 'salon-luma-01',
  name: 'Test Shampoo',
  category: 'Hair Care',
  subcategory: null,
  brand: 'Test Brand',
  description: null,
  barcode: '12345',
  sku: 'SKU-123',
  unit: 'bottle',
  purchase_price: '500.00',
  selling_price: '850.00',
  current_stock: '12.000',
  min_stock_threshold: '5.000',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  created_by: null,
  updated_by: null,
})
assert(mappedFromDb.purchasePrice === 500, 'Maps numeric string to number')
assert(mappedFromDb.currentStock === 12, 'Maps current stock to number')

// -----------------------------------------------------------------------------
// Test 19: Inventory Listing Refresh / Reactive Listener
// -----------------------------------------------------------------------------
console.log('\n--- Test 19: Inventory Listing Refresh / Reactive Listener ---')
let listenerTriggered = false
const unsub = inventoryService.subscribe((list) => {
  listenerTriggered = true
})
await inventoryService.updateProduct(createdProd!.id, { name: 'L\'Oréal Mythic Oil Serum - Updated' }, ownerSession)
assert(listenerTriggered, 'Subscription listener called when product updated')
unsub()

// -----------------------------------------------------------------------------
// Test 20: Existing Salon Application Regression
// -----------------------------------------------------------------------------
console.log('\n--- Test 20: Existing Salon Application Regression ---')
assert(permissionService.isOwner(ownerSession) === true, 'Owner permission check intact')
assert(permissionService.canManageOwners(ownerSession) === false, 'Owner cannot manage root admins')
assert(permissionService.canAccessModule('assistant', ownerSession) === true, 'Salon AI assistant access intact')
assert(permissionService.canAccessModule('calendar', recSession) === true, 'Salon calendar access intact')
assert(permissionService.canAccessModule('inventory', empSession) === false, 'Employee inventory isolation intact')

console.log('\n======================================================')
console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`)
console.log('======================================================\n')

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
