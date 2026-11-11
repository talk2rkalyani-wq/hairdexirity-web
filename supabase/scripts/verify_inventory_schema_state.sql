-- ==============================================================================
-- Luma Salon — Schema State Verification for Inventory Module
-- Non-destructive inspection query verifying tables, columns, constraints & RLS
-- ==============================================================================

SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name IN ('inventory_products', 'inventory_stock_movements', 'inventory_batch_commits')
ORDER BY table_name, ordinal_position;

-- Verify RLS is enabled and forced
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled,
    relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN ('inventory_products', 'inventory_stock_movements', 'inventory_batch_commits');

-- Verify unique indexes
SELECT
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('inventory_products', 'inventory_stock_movements', 'inventory_batch_commits')
ORDER BY tablename, indexname;

-- Verify RPC functions
SELECT 
    routine_name, 
    routine_type, 
    security_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('rpc_create_inventory_product_with_opening_stock', 'rpc_commit_inventory_intake_batch');

