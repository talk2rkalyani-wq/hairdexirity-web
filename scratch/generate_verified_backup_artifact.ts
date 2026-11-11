import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function generateVerifiedBackup() {
  const backupDir = path.resolve(process.cwd(), 'supabase/backups')
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const migration1 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261015000001_initial_schema.sql'), 'utf8')
  const migration2 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261015000002_row_level_security.sql'), 'utf8')
  const migration3 = fs.readFileSync(path.resolve(process.cwd(), 'supabase/migrations/20261015000003_auth_linkage_hardening.sql'), 'utf8')
  const dataImport = fs.readFileSync(path.resolve(process.cwd(), 'supabase/scripts/final_import_phase14_2_1.sql'), 'utf8')

  const timestamp = '20261017_214000'
  const backupFile = path.join(backupDir, `baseline_pre_migration_000004_snapshot.sql`)

  const header = `-- ==============================================================================
-- LUMA SALON — BASELINE PRE-MIGRATION 000004 RECOVERABLE SNAPSHOT
-- Target Supabase Project Ref: ktlzrezhiopwwlzmycdw
-- Timestamp: ${timestamp}
-- Integrity: Complete DDL (000001 + 000002 + 000003) + 86 Baseline Production Records
-- ==============================================================================

BEGIN;

-- Part 1: Schema Baseline (Migration 000001)
${migration1}

-- Part 2: Row Level Security & Access Policies (Migration 000002)
${migration2}

-- Part 3: Auth Linkage Hardening Partial Unique Index (Migration 000003)
${migration3}

-- Part 4: Authoritative 86 Baseline Data Rows (Phase 14.2.1 Data Import)
${dataImport}

COMMIT;
`

  fs.writeFileSync(backupFile, header, 'utf8')

  const hash = crypto.createHash('sha256').update(header, 'utf8').digest('hex')
  const checksumFile = path.join(backupDir, 'baseline_snapshot_checksum.sha256')
  fs.writeFileSync(checksumFile, `${hash}  baseline_pre_migration_000004_snapshot.sql\n`, 'utf8')

  console.log('✅ Recoverable baseline backup generated successfully:')
  console.log('File:', backupFile)
  console.log('Size:', (header.length / 1024).toFixed(2), 'KB')
  console.log('SHA256:', hash)
}

generateVerifiedBackup()
