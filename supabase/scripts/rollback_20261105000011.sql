-- ==============================================================================
-- Luma Salon — Safe Rollback & Archival Script for Migration 000011
-- Phase 7.1D: Non-Destructive Accounting Preservation Pattern
-- ==============================================================================
-- CRITICAL STATUTORY COMPLIANCE WARNING:
-- Under Section 36 of the Central Goods and Services Tax (CGST) Act, 2017,
-- registered commercial entities are legally required to retain all books of
-- accounts, tax invoices, and payment vouchers for at least 72 months (6 years).
--
-- NEVER run `DROP TABLE ... CASCADE` on financial tables in a live production environment.
--
-- This script safely distinguishes between:
-- 1. PRE-PRODUCTION ROLLBACK: Tables exist but contain 0 records (safe to drop).
-- 2. POST-PRODUCTION ARCHIVAL: Tables contain live transaction history.
--    Instead of dropping, tables are renamed into an immutable read-only archive
--    preserving historical accounting data intact.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    v_invoice_count INT := 0;
    v_line_item_count INT := 0;
    v_payment_count INT := 0;
    v_total_records INT := 0;
BEGIN
    -- 1. Check each financial table independently for existing records
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoices') THEN
        SELECT count(*) INTO v_invoice_count FROM public.invoices;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'invoice_line_items') THEN
        SELECT count(*) INTO v_line_item_count FROM public.invoice_line_items;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'payments') THEN
        SELECT count(*) INTO v_payment_count FROM public.payments;
    END IF;

    v_total_records := v_invoice_count + v_line_item_count + v_payment_count;

    IF v_total_records > 0 THEN
        -- POST-PRODUCTION ARCHIVAL MODE (Preserve Financial History)
        -- NEVER DROP LIVE FINANCIAL RECORDS: Section 36 CGST Act Compliance
        RAISE NOTICE 'Financial tables contain live accounting data (Invoices: %, Line Items: %, Payments: %, Total: %). Archiving tables to preserve audit records...',
            v_invoice_count, v_line_item_count, v_payment_count, v_total_records;

        -- 1. Drop active triggers and policies
        DROP TRIGGER IF EXISTS trg_reconcile_invoice_payment ON public.payments;
        DROP TRIGGER IF EXISTS trg_protect_finalized_invoices ON public.invoices;
        DROP TRIGGER IF EXISTS trg_protect_finalized_line_items ON public.invoice_line_items;

        DROP POLICY IF EXISTS "Payments readable by billing staff" ON public.payments;
        DROP POLICY IF EXISTS "Payments insertable by billing staff" ON public.payments;
        DROP POLICY IF EXISTS "Line items readable by authorized salon roles" ON public.invoice_line_items;
        DROP POLICY IF EXISTS "Line items insertable by billing staff" ON public.invoice_line_items;
        DROP POLICY IF EXISTS "Invoices readable by authorized salon roles" ON public.invoices;
        DROP POLICY IF EXISTS "Invoices insertable by billing staff" ON public.invoices;
        DROP POLICY IF EXISTS "Invoices updatable by billing staff" ON public.invoices;

        -- 2. Rename tables to immutable archive names (PostgreSQL automatically updates FK constraints between them)
        ALTER TABLE public.payments RENAME TO payments_archive_202611;
        ALTER TABLE public.invoice_line_items RENAME TO invoice_line_items_archive_202611;
        ALTER TABLE public.invoices RENAME TO invoices_archive_202611;

        -- 3. Lock archived tables to strictly read-only
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payments_archive_202611 FROM authenticated, anon, PUBLIC;
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoice_line_items_archive_202611 FROM authenticated, anon, PUBLIC;
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.invoices_archive_202611 FROM authenticated, anon, PUBLIC;

        RAISE NOTICE 'SUCCESS: Live financial records safely archived into invoices_archive_202611, payments_archive_202611, invoice_line_items_archive_202611.';
        RAISE NOTICE 'RESTORATION INSTRUCTIONS: To restore active tables, reverse rename: ALTER TABLE ... RENAME TO ... and re-run migration 000011.';
    ELSE
        -- PRE-PRODUCTION CLEAN ROLLBACK (0 Records Found Across All Tables)
        RAISE NOTICE 'Zero live records detected across all financial tables (Invoices: 0, Line Items: 0, Payments: 0). Proceeding with clean pre-production rollback...';

        -- 1. Drop Triggers and Functions
        DROP TRIGGER IF EXISTS trg_reconcile_invoice_payment ON public.payments;
        DROP TRIGGER IF EXISTS trg_protect_finalized_invoices ON public.invoices;
        DROP TRIGGER IF EXISTS trg_protect_finalized_line_items ON public.invoice_line_items;
        DROP FUNCTION IF EXISTS public.fn_reconcile_invoice_payment();
        DROP FUNCTION IF EXISTS public.fn_protect_finalized_invoices();
        DROP FUNCTION IF EXISTS public.fn_protect_finalized_line_items();
        DROP FUNCTION IF EXISTS public.cancel_invoice(TEXT, TEXT);
        DROP FUNCTION IF EXISTS public.next_invoice_number(TEXT);
        DROP SEQUENCE IF EXISTS public.invoice_number_seq;

        -- 2. Drop Policies
        DROP POLICY IF EXISTS "Payments readable by billing staff" ON public.payments;
        DROP POLICY IF EXISTS "Payments insertable by billing staff" ON public.payments;
        DROP POLICY IF EXISTS "Line items readable by authorized salon roles" ON public.invoice_line_items;
        DROP POLICY IF EXISTS "Line items insertable by billing staff" ON public.invoice_line_items;
        DROP POLICY IF EXISTS "Invoices readable by authorized salon roles" ON public.invoices;
        DROP POLICY IF EXISTS "Invoices insertable by billing staff" ON public.invoices;
        DROP POLICY IF EXISTS "Invoices updatable by billing staff" ON public.invoices;

        -- 3. Drop Empty Tables (Reverse Dependency Order - NEVER CASCADE)
        DROP TABLE IF EXISTS public.payments;
        DROP TABLE IF EXISTS public.invoice_line_items;
        DROP TABLE IF EXISTS public.invoices;

        RAISE NOTICE 'SUCCESS: Clean pre-production rollback completed successfully without CASCADE.';
    END IF;
END $$;

COMMIT;

