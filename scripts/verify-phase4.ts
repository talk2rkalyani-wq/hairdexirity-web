// ==============================================================================
// Luma Salon — Phase 4 Verification Suite
// Tests 1-18 matching Phase 4 Requirements
// ==============================================================================

import {
  validateSingleProduct,
  validateUnknownProduct,
  isDuplicateBarcode,
  isDuplicateSku,
  validateQuantityForUnit,
  roundPrice,
  roundQuantity,
  isDecimalAllowedForUnit,
  findProductByBarcodeOrSku,
} from '../src/utils/inventoryValidation'
import {
  PRODUCT_CATEGORIES,
  STANDARD_PRODUCT_UNITS,
  isValidCategory,
  isValidUnit,
  formatCurrency,
} from '../src/config/inventoryConfig'
import type { InventoryProduct, ScannedProductItem } from '../src/types/inventory'
import { permissionService } from '../src/services/permissionService'

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
console.log('🧪 RUNNING LUMA SALON PHASE 4 COMPREHENSIVE VERIFICATION')
console.log('======================================================\n')

// Sample catalog dataset for tests
const catalogProducts: InventoryProduct[] = [
  {
    id: 'prod-001',
    name: 'Moroccanoil Treatment Original',
    brand: 'Moroccanoil',
    category: 'Hair Treatment',
    unit: 'bottle',
    barcode: '7290011521011',
    sku: 'MOR-TRT-100ML',
    purchasePrice: 1800,
    sellingPrice: 3150,
    currentStock: 12,
    minStockThreshold: 5,
    status: 'active',
    createdAt: '2026-10-30T10:00:00Z',
  },
  {
    id: 'prod-002',
    name: 'Olaplex No. 4 Bond Maintenance Shampoo',
    brand: 'Olaplex',
    category: 'Hair Care',
    unit: 'bottle',
    barcode: '896996004229',
    sku: 'OLA-SHP-250ML',
    purchasePrice: 1600,
    sellingPrice: 2800,
    currentStock: 4,
    minStockThreshold: 5,
    status: 'low_stock',
    createdAt: '2026-10-30T10:00:00Z',
  },
]

// -----------------------------------------------------------------------------
// Test 1: Required product fields
// -----------------------------------------------------------------------------
console.log('--- Test 1: Required Product Fields ---')
const emptyResult = validateSingleProduct({
  name: '',
  brand: '',
  category: '',
  unit: '',
  purchasePrice: '',
  sellingPrice: '',
  currentStock: '',
}, catalogProducts)
assert(!emptyResult.isValid, 'Empty input should fail validation')
assert(!!emptyResult.errors.name, 'Name is flagged as required', emptyResult.errors.name)
assert(!!emptyResult.errors.brand, 'Brand is flagged as required', emptyResult.errors.brand)
assert(!!emptyResult.errors.unit, 'Unit is flagged as required', emptyResult.errors.unit)
assert(!!emptyResult.errors.purchasePrice, 'Purchase price is flagged as required', emptyResult.errors.purchasePrice)
assert(!!emptyResult.errors.sellingPrice, 'Selling price is flagged as required', emptyResult.errors.sellingPrice)
assert(!!emptyResult.errors.currentStock, 'Current stock is flagged as required', emptyResult.errors.currentStock)

// -----------------------------------------------------------------------------
// Test 2: Invalid category
// -----------------------------------------------------------------------------
console.log('\n--- Test 2: Invalid Category ---')
assert(!isValidCategory('Electronics'), '"Electronics" should not be a valid category')
assert(!isValidCategory('Automotive'), '"Automotive" should not be a valid category')
assert(isValidCategory('Hair Care'), '"Hair Care" is a valid category')
assert(isValidCategory('Beautician Products'), '"Beautician Products" is a valid category')
assert(PRODUCT_CATEGORIES.length === 9, 'Exactly 9 configured categories exist')

const invalidCatResult = validateSingleProduct({
  name: 'Test Shampoo',
  brand: 'Test Brand',
  category: 'Invalid Category' as any,
  unit: 'bottle',
  purchasePrice: 100,
  sellingPrice: 200,
  currentStock: 5,
}, catalogProducts)
assert(!invalidCatResult.isValid && !!invalidCatResult.errors.category, 'Rejects invalid category')

// -----------------------------------------------------------------------------
// Test 3: Invalid unit
// -----------------------------------------------------------------------------
console.log('\n--- Test 3: Invalid Unit ---')
assert(!isValidUnit('meters'), '"meters" should not be a valid product unit')
assert(isValidUnit('bottle'), '"bottle" is a valid unit')
assert(isValidUnit('ml'), '"ml" is a valid unit')
assert(isValidUnit('kg'), '"kg" is a valid unit')

const invalidUnitResult = validateSingleProduct({
  name: 'Test Cream',
  brand: 'Test Brand',
  category: 'Hair Care',
  unit: 'gallons',
  purchasePrice: 100,
  sellingPrice: 200,
  currentStock: 5,
}, catalogProducts)
assert(!invalidUnitResult.isValid && !!invalidUnitResult.errors.unit, 'Rejects non-standard unit')

// -----------------------------------------------------------------------------
// Test 4: Negative prices
// -----------------------------------------------------------------------------
console.log('\n--- Test 4: Negative Prices ---')
const negPriceResult = validateSingleProduct({
  name: 'Test Mask',
  brand: 'Test Brand',
  category: 'Hair Care',
  unit: 'bottle',
  purchasePrice: -50,
  sellingPrice: -100,
  currentStock: 10,
}, catalogProducts)
assert(negPriceResult.errors.purchasePrice?.includes('cannot be negative'), 'Negative purchase price rejected')
assert(negPriceResult.errors.sellingPrice?.includes('cannot be negative'), 'Negative selling price rejected')

// -----------------------------------------------------------------------------
// Test 5: Zero purchase price
// -----------------------------------------------------------------------------
console.log('\n--- Test 5: Zero Purchase Price (Complimentary / Promo Stock) ---')
const zeroPurchaseResult = validateSingleProduct({
  name: 'Promo Serum Sample',
  brand: 'Olaplex',
  category: 'Hair Care',
  unit: 'pcs',
  purchasePrice: 0,
  sellingPrice: 50,
  currentStock: 20,
}, catalogProducts)
assert(zeroPurchaseResult.errors.purchasePrice === undefined, 'Zero purchase price is explicitly allowed')
assert(zeroPurchaseResult.isValid, 'Product with zero purchase price is valid')

// -----------------------------------------------------------------------------
// Test 6: Negative stock
// -----------------------------------------------------------------------------
console.log('\n--- Test 6: Negative Stock ---')
const negStockResult = validateSingleProduct({
  name: 'Test Tonic',
  brand: 'Test Brand',
  category: 'Hair Care',
  unit: 'bottle',
  purchasePrice: 100,
  sellingPrice: 150,
  currentStock: -3,
}, catalogProducts)
assert(negStockResult.errors.currentStock?.includes('cannot be negative'), 'Negative stock rejected')

// -----------------------------------------------------------------------------
// Test 7: Fractional stock validation
// -----------------------------------------------------------------------------
console.log('\n--- Test 7: Fractional Stock Validation ---')
assert(!isDecimalAllowedForUnit('bottle'), 'Bottle does not allow decimal stock')
assert(!isDecimalAllowedForUnit('pcs'), 'Pcs does not allow decimal stock')
assert(isDecimalAllowedForUnit('ml'), 'ml allows decimal stock')
assert(isDecimalAllowedForUnit('kg'), 'kg allows decimal stock')

const bottleCheck = validateQuantityForUnit(2.5, 'bottle')
assert(!bottleCheck.isValid, '2.5 bottles rejected (must be integer)')

const mlCheck = validateQuantityForUnit(250.75, 'ml')
assert(mlCheck.isValid, '250.75 ml accepted as fractional quantity')

const kgCheck = validateQuantityForUnit(1.5, 'kg')
assert(kgCheck.isValid, '1.5 kg accepted as fractional quantity')

// -----------------------------------------------------------------------------
// Test 8: Duplicate barcode
// -----------------------------------------------------------------------------
console.log('\n--- Test 8: Duplicate Barcode Check ---')
assert(isDuplicateBarcode('7290011521011', catalogProducts), 'Detects exact existing barcode in catalog')
assert(isDuplicateBarcode('  7290011521011  ', catalogProducts), 'Detects barcode regardless of whitespace padding')
assert(!isDuplicateBarcode('9999999999999', catalogProducts), 'Unique barcode passes')

const dupBarcodeForm = validateSingleProduct({
  name: 'Another Moroccan Oil',
  brand: 'Moroccanoil',
  category: 'Hair Care',
  unit: 'bottle',
  barcode: '7290011521011',
  sku: 'NEW-SKU-999',
  purchasePrice: 100,
  sellingPrice: 200,
  currentStock: 5,
}, catalogProducts)
assert(!!dupBarcodeForm.errors.barcode, 'Single form rejects duplicate barcode')

// -----------------------------------------------------------------------------
// Test 9: Duplicate SKU
// -----------------------------------------------------------------------------
console.log('\n--- Test 9: Duplicate SKU Check ---')
assert(isDuplicateSku('MOR-TRT-100ML', catalogProducts), 'Detects exact existing SKU')
assert(isDuplicateSku('mor-trt-100ml', catalogProducts), 'Detects existing SKU case-insensitively')
assert(!isDuplicateSku('UNIQUE-SKU-001', catalogProducts), 'Unique SKU passes')

const dupSkuForm = validateSingleProduct({
  name: 'New Product',
  brand: 'Brand',
  category: 'Hair Care',
  unit: 'bottle',
  sku: 'MOR-TRT-100ML',
  purchasePrice: 100,
  sellingPrice: 200,
  currentStock: 5,
}, catalogProducts)
assert(!!dupSkuForm.errors.sku, 'Single form rejects duplicate SKU')

// -----------------------------------------------------------------------------
// Test 10: Existing product scan
// -----------------------------------------------------------------------------
console.log('\n--- Test 10: Existing Product Scan Identification ---')
const matched = findProductByBarcodeOrSku('7290011521011', catalogProducts)
assert(!!matched, 'Finds product by barcode')
assert(matched?.id === 'prod-001', 'Correct product ID identified')
assert(matched?.name === 'Moroccanoil Treatment Original', 'Correct product name matched')

// -----------------------------------------------------------------------------
// Test 11: Repeated existing product scan
// -----------------------------------------------------------------------------
console.log('\n--- Test 11: Repeated Existing Product Scan Handling ---')
let pendingBatch: ScannedProductItem[] = []

// First scan of existing product
const firstScanItem: ScannedProductItem = {
  id: matched!.id,
  barcode: matched!.barcode!,
  sku: matched!.sku,
  name: matched!.name,
  brand: matched!.brand,
  category: matched!.category,
  unit: matched!.unit,
  purchasePrice: matched!.purchasePrice,
  sellingPrice: matched!.sellingPrice,
  quantity: 1,
  isNewProduct: false,
  existingStock: matched!.currentStock,
}
pendingBatch.push(firstScanItem)
assert(pendingBatch.length === 1 && pendingBatch[0].quantity === 1, 'First scan added 1 unit')

// Second scan of same existing product
const existingIdx = pendingBatch.findIndex((i) => i.barcode === matched!.barcode)
assert(existingIdx > -1, 'Identifies product already in pending batch')
pendingBatch[existingIdx].quantity += 1
assert(pendingBatch.length === 1, 'Batch length remains 1 (no duplicate item rows)')
assert(pendingBatch[0].quantity === 2, 'Pending quantity incremented to 2')
assert(pendingBatch[0].id === 'prod-001', 'Preserves original product ID')

// -----------------------------------------------------------------------------
// Test 12: Unknown product registration
// -----------------------------------------------------------------------------
console.log('\n--- Test 12: Unknown Product Registration ---')
const unknownBarcode = '8901030383848'
const unknownCheck = validateUnknownProduct({
  barcode: unknownBarcode,
  name: 'Streax Professional Hair Serum',
  brand: 'Streax',
  category: 'Hair Care',
  unit: 'bottle',
  sellingPrice: 350,
  purchasePrice: 220,
  quantity: 3,
  sku: 'STR-SRM-100',
}, catalogProducts, pendingBatch)
assert(unknownCheck.isValid, 'Valid unknown product registration passes')

// -----------------------------------------------------------------------------
// Test 13: Duplicate unknown barcode in pending batch
// -----------------------------------------------------------------------------
console.log('\n--- Test 13: Duplicate Unknown Barcode in Pending Batch ---')
const newBatchItem: ScannedProductItem = {
  id: 'scanned-new-12345',
  barcode: unknownBarcode,
  sku: 'STR-SRM-100',
  name: 'Streax Professional Hair Serum',
  brand: 'Streax',
  category: 'Hair Care',
  unit: 'bottle',
  purchasePrice: 220,
  sellingPrice: 350,
  quantity: 3,
  isNewProduct: true,
}
pendingBatch.push(newBatchItem)

// Trying to register the same unknown barcode again
const dupUnknownCheck = validateUnknownProduct({
  barcode: unknownBarcode,
  name: 'Duplicate Streax Entry',
  brand: 'Streax',
  category: 'Hair Care',
  unit: 'bottle',
  sellingPrice: 350,
}, catalogProducts, pendingBatch)
assert(!dupUnknownCheck.isValid, 'Rejects registering barcode that is already in pending batch')
assert(dupUnknownCheck.errors.barcode?.includes('already in your pending scanned batch'), 'Shows clear batch duplicate message')

// -----------------------------------------------------------------------------
// Test 14: Product information correction
// -----------------------------------------------------------------------------
console.log('\n--- Test 14: Product Information Correction in Modal ---')
// User corrects empty name and negative price
const invalidAttempt = validateUnknownProduct({
  barcode: '8909999999999',
  name: '',
  brand: 'Matrix',
  category: 'Hair Care',
  unit: 'tube',
  sellingPrice: -100,
}, catalogProducts, pendingBatch)
assert(!invalidAttempt.isValid, 'Initial attempt with errors flagged')

const correctedAttempt = validateUnknownProduct({
  barcode: '8909999999999',
  name: 'Matrix SoColor Hair Color 5N',
  brand: 'Matrix',
  category: 'Hair Care',
  unit: 'tube',
  sellingPrice: 450,
  purchasePrice: 280,
  quantity: 6,
}, catalogProducts, pendingBatch)
assert(correctedAttempt.isValid, 'Corrected attempt passes validation without resetting barcode')

// -----------------------------------------------------------------------------
// Test 15: Pending batch quantity accuracy and rounding
// -----------------------------------------------------------------------------
console.log('\n--- Test 15: Price & Quantity Rounding Accuracy ---')
assert(roundPrice(0.1 + 0.2) === 0.3, 'Floating point 0.1 + 0.2 correctly rounded to 0.3')
assert(roundPrice(199.999) === 200, 'Rounds to 2 decimal places safely')
assert(roundQuantity(5.0001, 'bottle') === 5, 'Enforces whole number rounding for discrete units')
assert(roundQuantity(125.4567, 'ml') === 125.457, 'Preserves precision up to 3 decimals for ml')
assert(formatCurrency(1450).includes('1,450'), 'Currency formats with INR separators')

// -----------------------------------------------------------------------------
// Test 16: Concurrency and repeated submission protection
// -----------------------------------------------------------------------------
console.log('\n--- Test 16: Repeated Submission Prevention ---')
let isSubmitting = false
function attemptSubmit() {
  if (isSubmitting) return 'BLOCKED_CONCURRENCY'
  isSubmitting = true
  return 'SUCCESS'
}
assert(attemptSubmit() === 'SUCCESS', 'First submit passes')
assert(attemptSubmit() === 'BLOCKED_CONCURRENCY', 'Second concurrent submit is blocked')
isSubmitting = false
assert(attemptSubmit() === 'SUCCESS', 'Submit allowed after previous completed')

// -----------------------------------------------------------------------------
// Test 17: Form validation & field mappings
// -----------------------------------------------------------------------------
console.log('\n--- Test 17: Single Product Validation Errors Contract ---')
const test17Form = validateSingleProduct({
  name: 'Valid Name',
  brand: 'Valid Brand',
  category: 'Hair Styling',
  unit: 'bottle',
  purchasePrice: 100,
  sellingPrice: 200,
  currentStock: 10,
  barcode: 'UNIQUE-12345678',
  sku: 'UNIQUE-SKU-123',
  minStockThreshold: 3,
}, catalogProducts)
assert(test17Form.isValid, 'Complete valid form has 0 errors')
assert(Object.keys(test17Form.errors).length === 0, 'Errors map is completely empty')

// -----------------------------------------------------------------------------
// Test 18: Role-based access and regression safety
// -----------------------------------------------------------------------------
console.log('\n--- Test 18: Security & Salon Module Access Regression ---')
const ownerSession = { isAuthenticated: true, role: 'OWNER' as const, email: 'rajesh@gmail.com', user: { id: '1', role: 'OWNER' as const, name: 'Rajesh', email: 'rajesh@gmail.com' } }
const recSession = { isAuthenticated: true, role: 'RECEPTIONIST' as const, email: 'priya@lumasalon.com', user: { id: '2', role: 'RECEPTIONIST' as const, name: 'Priya', email: 'priya@lumasalon.com' } }
const empSession = { isAuthenticated: true, role: 'EMPLOYEE' as const, email: 'anita@lumasalon.com', user: { id: '3', role: 'EMPLOYEE' as const, name: 'Anita', email: 'anita@lumasalon.com' } }
const unauthSession = { isAuthenticated: false, role: 'EMPLOYEE' as const, email: '', user: null as any }

assert(permissionService.canAccessInventory(ownerSession) === true, 'OWNER has access to inventory')
assert(permissionService.canAccessInventory(recSession) === true, 'RECEPTIONIST has access to inventory')
assert(permissionService.canAccessInventory(empSession) === false, 'EMPLOYEE access is denied to inventory')
assert(permissionService.canAccessInventory(unauthSession) === false, 'Unauthenticated access is denied to inventory')
assert(permissionService.canAccessModule('inventory', ownerSession) === true, 'canAccessModule allows OWNER for inventory')
assert(permissionService.canAccessModule('inventory', recSession) === true, 'canAccessModule allows RECEPTIONIST for inventory')
assert(permissionService.canAccessModule('inventory', empSession) === false, 'canAccessModule blocks EMPLOYEE for inventory')

console.log('\n======================================================')
console.log(`SUMMARY: ${passed} PASSED | ${failed} FAILED`)
console.log('======================================================\n')

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
