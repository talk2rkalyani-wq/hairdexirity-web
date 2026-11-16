-- ==============================================================================
-- 20261116000031_add_body_wax_pricing_columns.sql
-- Add explicit columns for Body Wax Pricing (Normal, Chocolate, Peel off) to public.services table
-- ==============================================================================

ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS price_normal NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_chocolate NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_peel_off NUMERIC(10, 2);

-- Set defaults for any existing Body Wax services
UPDATE public.services
SET pricing_type = 'wax_type',
    price_normal = COALESCE(price_normal, price),
    price_chocolate = COALESCE(price_chocolate, ROUND(price * 1.5, 2)),
    price_peel_off = COALESCE(price_peel_off, ROUND(price * 2.0, 2))
WHERE category = 'Body Wax' AND price_normal IS NULL;

-- Reload PostgREST schema cache so columns are immediately available
NOTIFY pgrst, 'reload schema';
