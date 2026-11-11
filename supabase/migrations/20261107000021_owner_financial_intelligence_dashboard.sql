-- ==============================================================================
-- Migration: 20261107000021_owner_financial_intelligence_dashboard.sql
-- Description: Phase 8 Owner Financial Intelligence Dashboard RPC & Views
-- Scope: Consolidated Executive P&L, Accrual Revenue, Cash Collections,
--        Customer Receivables Ageing, Supplier Payables, Inventory COGS,
--        and Stylist/Service Performance Analytics.
-- ==============================================================================

-- 1. Performance Indexes for Financial Intelligence Aggregations
CREATE INDEX IF NOT EXISTS idx_invoices_fin_perf
    ON public.invoices (salon_id, is_draft, date, payment_status);

CREATE INDEX IF NOT EXISTS idx_payments_fin_perf
    ON public.payments (salon_id, created_at, payment_method);

CREATE INDEX IF NOT EXISTS idx_line_items_fin_perf
    ON public.invoice_line_items (salon_id, staff_id, item_type);

CREATE INDEX IF NOT EXISTS idx_stock_movements_fin_perf
    ON public.inventory_stock_movements (salon_id, movement_type, created_at);

CREATE INDEX IF NOT EXISTS idx_consumable_usages_fin_perf
    ON public.consumable_usages (salon_id, created_at);

CREATE INDEX IF NOT EXISTS idx_stock_loss_fin_perf
    ON public.stock_loss_records (salon_id, created_at);

-- ==============================================================================
-- 2. Core Security Definer Function: rpc_get_owner_financial_intelligence
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.rpc_get_owner_financial_intelligence(
    p_salon_id TEXT,
    p_start_date DATE DEFAULT CURRENT_DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_salon TEXT;
    v_res JSONB;

    -- Revenue & Sales Aggregates
    v_gross_sales NUMERIC := 0;
    v_discounts_total NUMERIC := 0;
    v_net_sales NUMERIC := 0;
    v_tax_collected NUMERIC := 0;
    v_cgst_collected NUMERIC := 0;
    v_sgst_collected NUMERIC := 0;
    v_total_invoiced NUMERIC := 0;
    v_invoices_count INT := 0;
    v_paid_invoices_count INT := 0;
    v_unpaid_invoices_count INT := 0;

    -- Collections
    v_total_collections NUMERIC := 0;
    v_collections_by_tender JSONB := '[]'::JSONB;

    -- Customer Receivables & Credits
    v_customer_outstanding NUMERIC := 0;
    v_age_0_30 NUMERIC := 0;
    v_age_31_60 NUMERIC := 0;
    v_age_61_90 NUMERIC := 0;
    v_age_over_90 NUMERIC := 0;
    v_top_debtors JSONB := '[]'::JSONB;
    v_customer_advances_total NUMERIC := 0;
    v_customer_advances_unallocated NUMERIC := 0;
    v_credit_notes_total NUMERIC := 0;
    v_credit_notes_remaining NUMERIC := 0;
    v_refunds_total NUMERIC := 0;

    -- Procurement & Supplier Payables
    v_purchase_expenses NUMERIC := 0;
    v_supplier_outstanding NUMERIC := 0;
    v_supplier_paid_total NUMERIC := 0;
    v_supplier_advances_balance NUMERIC := 0;
    v_supplier_returns_total NUMERIC := 0;
    v_top_creditors JSONB := '[]'::JSONB;

    -- Inventory & Cost Intelligence
    v_inventory_total_value NUMERIC := 0;
    v_inventory_retail_value NUMERIC := 0;
    v_inventory_consumable_value NUMERIC := 0;
    v_cogs_retail NUMERIC := 0;
    v_consumable_usage_cost NUMERIC := 0;
    v_stock_loss_value NUMERIC := 0;
    v_valuation_by_category JSONB := '[]'::JSONB;
    v_stock_loss_by_type JSONB := '[]'::JSONB;
    v_dead_stock JSONB := '[]'::JSONB;

    -- Profitability Math
    v_effective_revenue NUMERIC := 0;
    v_estimated_gross_profit NUMERIC := 0;
    v_gross_margin_pct NUMERIC := 0;
    v_recorded_operating_contribution NUMERIC := 0;
    v_contribution_margin_pct NUMERIC := 0;

    -- Daily Trend Series & Attributions
    v_daily_trends JSONB := '[]'::JSONB;
    v_staff_performance JSONB := '[]'::JSONB;
    v_service_performance JSONB := '[]'::JSONB;
BEGIN
    -- 1. Tenant & Role Authorization
    v_caller_salon := public.current_user_salon_id();
    IF v_caller_salon IS NOT NULL AND v_caller_salon <> p_salon_id THEN
        RAISE EXCEPTION 'Unauthorized: Caller salon % does not match requested salon %', v_caller_salon, p_salon_id;
    END IF;

    IF auth.uid() IS NOT NULL AND NOT public.is_owner() THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Only salon owners can access the financial intelligence dashboard';
    END IF;

    -- 2. Accrual Revenue & Invoice Aggregations
    SELECT
        COALESCE(SUM(subtotal), 0),
        COALESCE(SUM(discount_amount), 0),
        COALESCE(SUM(subtotal - discount_amount), 0),
        COALESCE(SUM(tax_amount), 0),
        COALESCE(SUM(CASE WHEN cgst_amount > 0 THEN cgst_amount ELSE ROUND(tax_amount / 2.0, 2) END), 0),
        COALESCE(SUM(CASE WHEN sgst_amount > 0 THEN sgst_amount ELSE ROUND(tax_amount / 2.0, 2) END), 0),
        COALESCE(SUM(total_amount), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE payment_status = 'paid'),
        COUNT(*) FILTER (WHERE payment_status IN ('unpaid', 'partial'))
    INTO
        v_gross_sales,
        v_discounts_total,
        v_net_sales,
        v_tax_collected,
        v_cgst_collected,
        v_sgst_collected,
        v_total_invoiced,
        v_invoices_count,
        v_paid_invoices_count,
        v_unpaid_invoices_count
    FROM public.invoices
    WHERE salon_id = p_salon_id
      AND is_draft = false
      AND payment_status <> 'cancelled'
      AND date BETWEEN p_start_date AND p_end_date;

    -- 3. Actual Cash Collections & Tender Distribution
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_collections
    FROM public.payments
    WHERE salon_id = p_salon_id
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    SELECT COALESCE(jsonb_agg(tender_row), '[]'::JSONB)
    INTO v_collections_by_tender
    FROM (
        SELECT
            payment_method AS method,
            CASE payment_method
                WHEN 'cash' THEN 'Cash Tendered'
                WHEN 'upi' THEN 'UPI (GPay / PhonePe / Paytm)'
                WHEN 'card' THEN 'Credit / Debit Card'
                WHEN 'bank' THEN 'Bank Transfer (NEFT / IMPS)'
                WHEN 'advance' THEN 'Advance Allocation'
                WHEN 'credit_note' THEN 'Credit Note Allocation'
                ELSE 'Other Methods'
            END AS label,
            ROUND(SUM(amount), 2) AS amount,
            COUNT(*) AS count,
            CASE WHEN v_total_collections > 0
                 THEN ROUND((SUM(amount) / v_total_collections) * 100.0, 1)
                 ELSE 0.0
            END AS percentage
        FROM public.payments
        WHERE salon_id = p_salon_id
          AND created_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY payment_method
        ORDER BY amount DESC
    ) tender_row;

    -- 4. Customer Receivables, Ageing & Credits
    SELECT COALESCE(SUM(balance_due), 0)
    INTO v_customer_outstanding
    FROM public.invoices
    WHERE salon_id = p_salon_id
      AND is_draft = false
      AND payment_status IN ('unpaid', 'partial');

    -- Ageing buckets
    SELECT
        COALESCE(SUM(balance_due) FILTER (WHERE (CURRENT_DATE - date) <= 30), 0),
        COALESCE(SUM(balance_due) FILTER (WHERE (CURRENT_DATE - date) BETWEEN 31 AND 60), 0),
        COALESCE(SUM(balance_due) FILTER (WHERE (CURRENT_DATE - date) BETWEEN 61 AND 90), 0),
        COALESCE(SUM(balance_due) FILTER (WHERE (CURRENT_DATE - date) > 90), 0)
    INTO
        v_age_0_30,
        v_age_31_60,
        v_age_61_90,
        v_age_over_90
    FROM public.invoices
    WHERE salon_id = p_salon_id
      AND is_draft = false
      AND payment_status IN ('unpaid', 'partial');

    -- Top 10 Debtor Clients
    SELECT COALESCE(jsonb_agg(debtor_row), '[]'::JSONB)
    INTO v_top_debtors
    FROM (
        SELECT
            COALESCE(client_id, 'walk-in') AS client_id,
            client_name,
            COALESCE(client_phone, '') AS client_phone,
            COUNT(*) AS invoice_count,
            ROUND(SUM(total_amount), 2) AS total_invoiced,
            ROUND(SUM(paid_amount), 2) AS total_paid,
            ROUND(SUM(balance_due), 2) AS balance_due
        FROM public.invoices
        WHERE salon_id = p_salon_id
          AND is_draft = false
          AND payment_status IN ('unpaid', 'partial')
        GROUP BY client_id, client_name, client_phone
        ORDER BY balance_due DESC
        LIMIT 10
    ) debtor_row;

    -- Customer Advances
    SELECT
        COALESCE(SUM(amount), 0),
        COALESCE(SUM(remaining_amount), 0)
    INTO
        v_customer_advances_total,
        v_customer_advances_unallocated
    FROM public.customer_advances
    WHERE salon_id = p_salon_id;

    -- Customer Refunds
    SELECT COALESCE(SUM(amount), 0)
    INTO v_refunds_total
    FROM public.refunds
    WHERE salon_id = p_salon_id
      AND status = 'completed'
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    -- Credit Notes
    SELECT
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(remaining_amount), 0)
    INTO
        v_credit_notes_total,
        v_credit_notes_remaining
    FROM public.credit_notes
    WHERE salon_id = p_salon_id
      AND status <> 'cancelled';

    -- 5. Procurement Expenses & Supplier Payables
    SELECT
        COALESCE(SUM(total_amount), 0)
    INTO v_purchase_expenses
    FROM public.purchase_bills
    WHERE salon_id = p_salon_id
      AND status <> 'cancelled'
      AND bill_date BETWEEN p_start_date AND p_end_date;

    SELECT
        COALESCE(SUM(balance_due), 0),
        COALESCE(SUM(paid_amount), 0)
    INTO
        v_supplier_outstanding,
        v_supplier_paid_total
    FROM public.purchase_bills
    WHERE salon_id = p_salon_id
      AND status IN ('unpaid', 'partially_paid');

    SELECT COALESCE(SUM(unallocated_amount), 0)
    INTO v_supplier_advances_balance
    FROM public.supplier_payments
    WHERE salon_id = p_salon_id;

    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_supplier_returns_total
    FROM public.purchase_returns
    WHERE salon_id = p_salon_id
      AND return_date BETWEEN p_start_date AND p_end_date;

    -- Top 10 Creditor Suppliers
    SELECT COALESCE(jsonb_agg(creditor_row), '[]'::JSONB)
    INTO v_top_creditors
    FROM (
        SELECT
            pb.supplier_id,
            s.name AS supplier_name,
            COUNT(*) AS bill_count,
            ROUND(SUM(pb.total_amount), 2) AS total_billed,
            ROUND(SUM(pb.paid_amount), 2) AS total_paid,
            ROUND(SUM(pb.balance_due), 2) AS balance_due
        FROM public.purchase_bills pb
        JOIN public.suppliers s ON s.id = pb.supplier_id
        WHERE pb.salon_id = p_salon_id
          AND pb.status IN ('unpaid', 'partially_paid')
        GROUP BY pb.supplier_id, s.name
        ORDER BY balance_due DESC
        LIMIT 10
    ) creditor_row;

    -- 6. Inventory Valuation & Cost Intelligence
    SELECT
        COALESCE(SUM(current_stock * purchase_price), 0),
        COALESCE(SUM(CASE WHEN item_type = 'retail' THEN current_stock * purchase_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN item_type = 'consumable' THEN current_stock * purchase_price ELSE 0 END), 0)
    INTO
        v_inventory_total_value,
        v_inventory_retail_value,
        v_inventory_consumable_value
    FROM public.inventory_products
    WHERE salon_id = p_salon_id
      AND status <> 'archived';

    -- COGS (Retail sales deductions)
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_cogs_retail
    FROM public.inventory_stock_movements
    WHERE salon_id = p_salon_id
      AND movement_type = 'SALE_DEDUCTION'
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    -- Salon Consumable Usage Cost
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_consumable_usage_cost
    FROM public.consumable_usages
    WHERE salon_id = p_salon_id
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    -- Stock Losses & Wastage Valuation
    SELECT COALESCE(SUM(total_cost), 0)
    INTO v_stock_loss_value
    FROM public.stock_loss_records
    WHERE salon_id = p_salon_id
      AND created_at::date BETWEEN p_start_date AND p_end_date;

    -- Valuation by Category
    SELECT COALESCE(jsonb_agg(cat_row), '[]'::JSONB)
    INTO v_valuation_by_category
    FROM (
        SELECT
            category,
            item_type,
            COUNT(*) AS product_count,
            ROUND(SUM(current_stock), 2) AS total_stock,
            ROUND(SUM(current_stock * purchase_price), 2) AS total_value
        FROM public.inventory_products
        WHERE salon_id = p_salon_id
          AND status <> 'archived'
        GROUP BY category, item_type
        ORDER BY total_value DESC
    ) cat_row;

    -- Stock Loss breakdown by Type
    SELECT COALESCE(jsonb_agg(loss_row), '[]'::JSONB)
    INTO v_stock_loss_by_type
    FROM (
        SELECT
            loss_type,
            COUNT(*) AS count,
            ROUND(SUM(quantity), 2) AS quantity,
            ROUND(SUM(total_cost), 2) AS total_loss_value
        FROM public.stock_loss_records
        WHERE salon_id = p_salon_id
          AND created_at::date BETWEEN p_start_date AND p_end_date
        GROUP BY loss_type
        ORDER BY total_loss_value DESC
    ) loss_row;

    -- Dead Stock (No sales or movement in >= 60 days)
    SELECT COALESCE(jsonb_agg(dead_row), '[]'::JSONB)
    INTO v_dead_stock
    FROM (
        SELECT
            p.id AS product_id,
            p.name,
            p.sku,
            p.category,
            p.current_stock,
            p.purchase_price AS unit_cost,
            ROUND(p.current_stock * p.purchase_price, 2) AS total_value,
            COALESCE(MAX(m.created_at)::text, p.created_at::text) AS last_movement_date
        FROM public.inventory_products p
        LEFT JOIN public.inventory_stock_movements m ON m.product_id = p.id
        WHERE p.salon_id = p_salon_id
          AND p.status <> 'archived'
          AND p.current_stock > 0
        GROUP BY p.id, p.name, p.sku, p.category, p.current_stock, p.purchase_price, p.created_at
        HAVING COALESCE(MAX(m.created_at), p.created_at) < (NOW() - INTERVAL '60 days')
        ORDER BY total_value DESC
        LIMIT 15
    ) dead_row;

    -- 7. Profit & Loss Computations
    v_effective_revenue := v_net_sales - v_refunds_total;
    v_estimated_gross_profit := v_effective_revenue - v_cogs_retail - v_consumable_usage_cost;

    IF v_effective_revenue > 0 THEN
        v_gross_margin_pct := ROUND((v_estimated_gross_profit / v_effective_revenue) * 100.0, 1);
    ELSE
        v_gross_margin_pct := 0.0;
    END IF;

    v_recorded_operating_contribution := v_estimated_gross_profit - v_stock_loss_value;

    IF v_effective_revenue > 0 THEN
        v_contribution_margin_pct := ROUND((v_recorded_operating_contribution / v_effective_revenue) * 100.0, 1);
    ELSE
        v_contribution_margin_pct := 0.0;
    END IF;

    -- 8. Daily Trend Points (Revenue vs Collections)
    SELECT COALESCE(jsonb_agg(trend_row), '[]'::JSONB)
    INTO v_daily_trends
    FROM (
        WITH dates AS (
            SELECT generate_series(p_start_date, p_end_date, '1 day'::interval)::date AS d
        ),
        daily_inv AS (
            SELECT
                date AS d,
                ROUND(SUM(subtotal), 2) AS gross_sales,
                ROUND(SUM(subtotal - discount_amount), 2) AS net_sales,
                ROUND(SUM(tax_amount), 2) AS tax_amount,
                ROUND(SUM(total_amount), 2) AS total_invoiced,
                COUNT(*) AS invoices_count
            FROM public.invoices
            WHERE salon_id = p_salon_id
              AND is_draft = false
              AND payment_status <> 'cancelled'
              AND date BETWEEN p_start_date AND p_end_date
            GROUP BY date
        ),
        daily_pmt AS (
            SELECT
                created_at::date AS d,
                ROUND(SUM(amount), 2) AS collections,
                ROUND(SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END), 2) AS cash_collections,
                ROUND(SUM(CASE WHEN payment_method = 'upi' THEN amount ELSE 0 END), 2) AS upi_collections,
                ROUND(SUM(CASE WHEN payment_method = 'card' THEN amount ELSE 0 END), 2) AS card_collections,
                ROUND(SUM(CASE WHEN payment_method = 'bank' THEN amount ELSE 0 END), 2) AS bank_collections
            FROM public.payments
            WHERE salon_id = p_salon_id
              AND created_at::date BETWEEN p_start_date AND p_end_date
            GROUP BY created_at::date
        )
        SELECT
            dates.d::text AS date,
            to_char(dates.d, 'DD/MM') AS display_date,
            to_char(dates.d, 'Dy') AS day_of_week,
            COALESCE(daily_inv.gross_sales, 0.00) AS gross_sales,
            COALESCE(daily_inv.net_sales, 0.00) AS net_sales,
            COALESCE(daily_inv.tax_amount, 0.00) AS tax_amount,
            COALESCE(daily_inv.total_invoiced, 0.00) AS total_invoiced,
            COALESCE(daily_inv.invoices_count, 0) AS invoices_count,
            COALESCE(daily_pmt.collections, 0.00) AS collections,
            COALESCE(daily_pmt.cash_collections, 0.00) AS cash_collections,
            COALESCE(daily_pmt.upi_collections, 0.00) AS upi_collections,
            COALESCE(daily_pmt.card_collections, 0.00) AS card_collections,
            COALESCE(daily_pmt.bank_collections, 0.00) AS bank_collections
        FROM dates
        LEFT JOIN daily_inv ON daily_inv.d = dates.d
        LEFT JOIN daily_pmt ON daily_pmt.d = dates.d
        ORDER BY dates.d ASC
    ) trend_row;

    -- 9. Stylist / Employee Performance Attribution
    SELECT COALESCE(jsonb_agg(staff_row), '[]'::JSONB)
    INTO v_staff_performance
    FROM (
        SELECT
            li.staff_id,
            COALESCE(s.name, 'Unassigned Stylist') AS staff_name,
            COALESCE(s.role, 'stylist') AS role,
            ROUND(SUM(CASE WHEN li.item_type = 'service' THEN li.total_price - li.tax_amount ELSE 0 END), 2) AS service_revenue,
            ROUND(SUM(CASE WHEN li.item_type IN ('product', 'retail') THEN li.total_price - li.tax_amount ELSE 0 END), 2) AS product_revenue,
            ROUND(SUM(li.total_price - li.tax_amount), 2) AS total_revenue,
            COUNT(*) FILTER (WHERE li.item_type = 'service') AS service_count,
            COUNT(*) FILTER (WHERE li.item_type IN ('product', 'retail')) AS product_count,
            ROUND(SUM(li.discount_amount), 2) AS line_discounts
        FROM public.invoice_line_items li
        JOIN public.invoices inv ON inv.id = li.invoice_id AND inv.salon_id = li.salon_id
        LEFT JOIN public.staff s ON s.id = li.staff_id
        WHERE li.salon_id = p_salon_id
          AND inv.is_draft = false
          AND inv.payment_status <> 'cancelled'
          AND inv.date BETWEEN p_start_date AND p_end_date
          AND li.staff_id IS NOT NULL
        GROUP BY li.staff_id, s.name, s.role
        ORDER BY total_revenue DESC
    ) staff_row;

    -- 10. Service Ranking & Performance
    SELECT COALESCE(jsonb_agg(srv_row), '[]'::JSONB)
    INTO v_service_performance
    FROM (
        SELECT
            COALESCE(li.service_id, 'custom') AS service_id,
            li.description AS service_name,
            COUNT(*) AS volume,
            ROUND(SUM(li.total_price - li.tax_amount), 2) AS revenue,
            ROUND(AVG(li.unit_price), 2) AS average_price
        FROM public.invoice_line_items li
        JOIN public.invoices inv ON inv.id = li.invoice_id AND inv.salon_id = li.salon_id
        WHERE li.salon_id = p_salon_id
          AND inv.is_draft = false
          AND inv.payment_status <> 'cancelled'
          AND inv.date BETWEEN p_start_date AND p_end_date
          AND li.item_type = 'service'
        GROUP BY li.service_id, li.description
        ORDER BY revenue DESC
        LIMIT 20
    ) srv_row;

    -- 11. Assemble Master Intelligence Payload
    v_res := jsonb_build_object(
        'salon_id', p_salon_id,
        'period', jsonb_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date
        ),
        'kpis', jsonb_build_object(
            'gross_sales', ROUND(v_gross_sales, 2),
            'discounts_total', ROUND(v_discounts_total, 2),
            'net_sales', ROUND(v_net_sales, 2),
            'tax_collected', ROUND(v_tax_collected, 2),
            'cgst_collected', ROUND(v_cgst_collected, 2),
            'sgst_collected', ROUND(v_sgst_collected, 2),
            'total_invoiced', ROUND(v_total_invoiced, 2),
            'total_collections', ROUND(v_total_collections, 2),
            'customer_outstanding', ROUND(v_customer_outstanding, 2),
            'customer_advances_balance', ROUND(v_customer_advances_unallocated, 2),
            'refunds_total', ROUND(v_refunds_total, 2),
            'credit_notes_balance', ROUND(v_credit_notes_remaining, 2),
            'purchase_expenses', ROUND(v_purchase_expenses, 2),
            'supplier_outstanding', ROUND(v_supplier_outstanding, 2),
            'supplier_advances_balance', ROUND(v_supplier_advances_balance, 2),
            'supplier_returns_total', ROUND(v_supplier_returns_total, 2),
            'inventory_total_value', ROUND(v_inventory_total_value, 2),
            'inventory_retail_value', ROUND(v_inventory_retail_value, 2),
            'inventory_consumable_value', ROUND(v_inventory_consumable_value, 2),
            'cogs_retail', ROUND(v_cogs_retail, 2),
            'consumable_usage_cost', ROUND(v_consumable_usage_cost, 2),
            'stock_loss_value', ROUND(v_stock_loss_value, 2),
            'estimated_gross_profit', ROUND(v_estimated_gross_profit, 2),
            'recorded_operating_contribution', ROUND(v_recorded_operating_contribution, 2),
            'invoices_count', v_invoices_count,
            'paid_invoices_count', v_paid_invoices_count,
            'unpaid_invoices_count', v_unpaid_invoices_count
        ),
        'revenue_vs_collections', v_daily_trends,
        'collections_by_tender', v_collections_by_tender,
        'pnl_statement', jsonb_build_object(
            'gross_sales', ROUND(v_gross_sales, 2),
            'discounts', ROUND(v_discounts_total, 2),
            'net_sales', ROUND(v_net_sales, 2),
            'refunds', ROUND(v_refunds_total, 2),
            'effective_revenue', ROUND(v_effective_revenue, 2),
            'cogs_retail', ROUND(v_cogs_retail, 2),
            'consumable_usage_cost', ROUND(v_consumable_usage_cost, 2),
            'gross_profit', ROUND(v_estimated_gross_profit, 2),
            'gross_margin_percentage', v_gross_margin_pct,
            'stock_losses', ROUND(v_stock_loss_value, 2),
            'recorded_operating_contribution', ROUND(v_recorded_operating_contribution, 2),
            'contribution_margin_percentage', v_contribution_margin_pct,
            'disclaimer', 'Recorded operating contribution excludes off-ledger salon facility lease/rent, utility overheads, and non-system operating expenses which are not tracked in the application database.'
        ),
        'customer_receivables', jsonb_build_object(
            'total_outstanding', ROUND(v_customer_outstanding, 2),
            'ageing', jsonb_build_object(
                'current_0_30', ROUND(v_age_0_30, 2),
                'age_31_60', ROUND(v_age_31_60, 2),
                'age_61_90', ROUND(v_age_61_90, 2),
                'over_90', ROUND(v_age_over_90, 2)
            ),
            'top_debtors', v_top_debtors,
            'advances_total', ROUND(v_customer_advances_total, 2),
            'advances_unallocated', ROUND(v_customer_advances_unallocated, 2),
            'credit_notes_total', ROUND(v_credit_notes_total, 2),
            'credit_notes_remaining', ROUND(v_credit_notes_remaining, 2)
        ),
        'supplier_payables', jsonb_build_object(
            'total_outstanding', ROUND(v_supplier_outstanding, 2),
            'total_purchases', ROUND(v_purchase_expenses, 2),
            'total_paid', ROUND(v_supplier_paid_total, 2),
            'total_advances', ROUND(v_supplier_advances_balance, 2),
            'total_returns', ROUND(v_supplier_returns_total, 2),
            'top_creditors', v_top_creditors
        ),
        'inventory_analytics', jsonb_build_object(
            'total_valuation', ROUND(v_inventory_total_value, 2),
            'retail_valuation', ROUND(v_inventory_retail_value, 2),
            'consumable_valuation', ROUND(v_inventory_consumable_value, 2),
            'valuation_by_category', v_valuation_by_category,
            'stock_loss_by_type', v_stock_loss_by_type,
            'dead_stock', v_dead_stock
        ),
        'staff_performance', v_staff_performance,
        'service_performance', v_service_performance
    );

    RETURN v_res;
END;
$$;

-- Grant execution permissions
REVOKE ALL ON FUNCTION public.rpc_get_owner_financial_intelligence(TEXT, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_get_owner_financial_intelligence(TEXT, DATE, DATE) TO authenticated, anon;
