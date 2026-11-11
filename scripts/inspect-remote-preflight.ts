import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

async function runPreflightInspection() {
  console.log('========================================================================');
  console.log('🔍 LUMA SALON: PHASE 6.3 PRODUCTION PREFLIGHT INSPECTION');
  console.log('========================================================================\n');

  const envPath = fs.existsSync('.env.local') ? path.resolve('.env.local') : path.resolve('App code/.env.local');
  const envContent = fs.readFileSync(envPath, 'utf8');
  let supabaseUrl = '';
  let supabaseKey = '';

  for (const line of envContent.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) supabaseUrl = line.split('=')[1].trim().replace(/['"]/g, '');
    if (line.startsWith('VITE_SUPABASE_PUBLISHABLE_KEY=')) supabaseKey = line.split('=')[1].trim().replace(/['"]/g, '');
  }

  console.log('Target Remote Project:', supabaseUrl);

  // 1. Authenticate first as Root Administrator
  console.log('\n--- 1. Authenticating as Root Administrator ---');
  const client = createClient(supabaseUrl, supabaseKey);
  const { data: authData, error: authErr } = await client.auth.signInWithPassword({
    email: 'talk2rkalyani@gmail.com',
    password: 'Luma@2026!'
  });

  if (authErr) {
    console.error('  ❌ Auth failed:', authErr.message);
    process.exit(1);
  }
  const accessToken = authData.session?.access_token || supabaseKey;
  console.log('  ✅ Admin authenticated successfully (UID:', authData.user?.id, ')');

  // 2. Fetch OpenAPI REST Spec with Authenticated Token
  console.log('\n--- 2. Fetching PostgREST OpenAPI Specification ---');
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` }
  });

  if (!res.ok) {
    console.warn(`  Warning: Failed to fetch OpenAPI spec (HTTP ${res.status} ${res.statusText})`);
  } else {
    const spec = await res.json();
    const tables = Object.keys(spec.definitions || {});
    const rpcs = Object.keys(spec.paths || {}).filter(p => p.startsWith('/rpc/'));

    console.log('Remote Exposed Tables (' + tables.length + '):', tables);
    console.log('Remote Exposed RPCs (' + rpcs.length + '):', rpcs);

    // Check specific migration 000007 tables
    const hasInvProducts = tables.includes('inventory_products');
    const hasInvMovements = tables.includes('inventory_stock_movements');
    const hasInvBatch = tables.includes('inventory_batch_commits');
    console.log('\nMigration 000007 Tables in Schema:');
    console.log('  - inventory_products:', hasInvProducts ? 'EXISTS' : 'MISSING');
    console.log('  - inventory_stock_movements:', hasInvMovements ? 'EXISTS' : 'MISSING');
    console.log('  - inventory_batch_commits:', hasInvBatch ? 'EXISTS' : 'MISSING');

    // Check RPCs
    const hasRpcCreate = rpcs.includes('/rpc/rpc_create_inventory_product_with_opening_stock');
    const hasRpcCommit = rpcs.includes('/rpc/rpc_commit_inventory_intake_batch');
    const hasRpcAdjust = rpcs.includes('/rpc/rpc_adjust_inventory_stock');
    console.log('\nMigration RPCs in OpenAPI spec:');
    console.log('  - rpc_create_inventory_product_with_opening_stock (000007):', hasRpcCreate ? 'EXISTS' : 'NOT FOUND');
    console.log('  - rpc_commit_inventory_intake_batch (000007):', hasRpcCommit ? 'EXISTS' : 'NOT FOUND');
    console.log('  - rpc_adjust_inventory_stock (000008):', hasRpcAdjust ? 'EXISTS' : 'NOT FOUND');
  }

  // 3. Inspect Live Table Counts
  console.log('\n--- 3. Verifying Live Production Row Counts ---');
  const allTables = [
    'salons', 'staff', 'services', 'clients', 'administrators',
    'inventory_products', 'inventory_stock_movements', 'inventory_batch_commits'
  ];
  for (const t of allTables) {
    const { count, error } = await client.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`  - ${t.padEnd(28)}: Error (${error.message})`);
    } else {
      console.log(`  - ${t.padEnd(28)}: ${count} rows`);
    }
  }

  // 4. Test RPC Status (000007 vs 000008)
  console.log('\n--- 4. Probing RPC Endpoints ---');

  // Test rpc_adjust_inventory_stock (Migration 000008 probe)
  const { data: adjData, error: adjErr } = await client.rpc('rpc_adjust_inventory_stock', {
    p_salon_id: 'probe-salon',
    p_product_id: '00000000-0000-0000-0000-000000000000',
    p_adjustment_type: 'STOCK_ADJUSTMENT_IN',
    p_quantity: 1,
    p_notes: 'Probe note'
  });

  if (adjErr) {
    console.log('  rpc_adjust_inventory_stock response:');
    console.log('    Code:', adjErr.code);
    console.log('    Message:', adjErr.message);
    if (adjErr.code === 'PGRST202' || adjErr.message.includes('Could not find the function')) {
      console.log('    -> STATUS: Migration 000008 is NOT YET APPLIED remotely.');
    } else {
      console.log('    -> STATUS: Migration 000008 IS APPLIED remotely.');
    }
  } else {
    console.log('  rpc_adjust_inventory_stock returned:', adjData);
  }

  // 5. Test Direct INSERT on inventory_stock_movements (Migration 000009 probe)
  console.log('\n--- 5. Testing Direct INSERT on inventory_stock_movements (Migration 000009 probe) ---');
  // Attempt a direct insert as authenticated admin
  const { data: insData, error: insErr } = await client.from('inventory_stock_movements').insert({
    salon_id: 'probe-non-existent-salon',
    product_id: '00000000-0000-0000-0000-000000000000',
    movement_type: 'STOCK_ADJUSTMENT_IN',
    quantity: 1,
    previous_stock: 0,
    new_stock: 1
  }).select();

  if (insErr) {
    console.log('  Direct INSERT response:');
    console.log('    Code:', insErr.code);
    console.log('    Message:', insErr.message);
    if (insErr.code === '42501' && insErr.message.includes('permission denied for table inventory_stock_movements')) {
      console.log('    -> STATUS: Direct INSERT is already REVOKED (Migration 000009 is applied).');
    } else if (insErr.code === '42501' || insErr.message.includes('row-level security')) {
      console.log('    -> STATUS: Direct INSERT blocked by RLS policy (Migration 000007 state, 000009 NOT applied).');
    } else {
      console.log('    -> STATUS: Direct INSERT failed with FK/Constraint:', insErr.message, '(Migration 000009 NOT applied).');
    }
  } else {
    console.log('  Direct INSERT succeeded! (Migration 000009 NOT applied). Cleaning up probe row...');
    if (insData && insData[0]?.id) {
      await client.from('inventory_stock_movements').delete().eq('id', insData[0].id);
    }
  }

  console.log('\n========================================================================');
  console.log('PREFLIGHT INSPECTION COMPLETE');
  console.log('========================================================================\n');
}

runPreflightInspection().catch(err => {
  console.error('Preflight crashed:', err);
  process.exit(1);
});
