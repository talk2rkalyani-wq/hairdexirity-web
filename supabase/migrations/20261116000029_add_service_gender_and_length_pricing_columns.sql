-- ==============================================================================
-- 20261116000029_add_service_gender_and_length_pricing_columns.sql
-- Add explicit columns for Gender and Hair Length Pricing to public.services table
-- ==============================================================================

ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS pricing_type TEXT DEFAULT 'gender',
ADD COLUMN IF NOT EXISTS price_male NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_female NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_short NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_medium NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_long NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS price_vlong NUMERIC(10, 2);

-- Set defaults for any existing rows
UPDATE public.services
SET pricing_type = COALESCE(pricing_type, 'gender'),
    price_male = COALESCE(price_male, price),
    price_female = COALESCE(price_female, price)
WHERE price_male IS NULL AND price_female IS NULL;

-- Reload PostgREST schema cache so columns are immediately visible in API
NOTIFY pgrst, 'reload schema';
