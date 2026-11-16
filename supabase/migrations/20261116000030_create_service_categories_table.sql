-- ==============================================================================
-- 20261116000030_create_service_categories_table.sql
-- Create public.service_categories table and link service categories to Supabase
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.service_categories (
    id TEXT PRIMARY KEY,
    salon_id TEXT NOT NULL REFERENCES public.salons(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_service_categories_salon_name UNIQUE (salon_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_categories_salon_id ON public.service_categories(salon_id);
CREATE INDEX IF NOT EXISTS idx_service_categories_display_order ON public.service_categories(display_order);

-- Enable Row Level Security
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Service categories viewable by authenticated users" ON public.service_categories;
CREATE POLICY "Service categories viewable by authenticated users"
    ON public.service_categories FOR SELECT
    TO authenticated
    USING (
        salon_id = public.current_user_salon_id()
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner_or_receptionist()
    );

DROP POLICY IF EXISTS "Service categories insertable by owners" ON public.service_categories;
CREATE POLICY "Service categories insertable by owners"
    ON public.service_categories FOR INSERT
    TO authenticated
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Service categories updatable by owners" ON public.service_categories;
CREATE POLICY "Service categories updatable by owners"
    ON public.service_categories FOR UPDATE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    )
    WITH CHECK (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

DROP POLICY IF EXISTS "Service categories deletable by owners" ON public.service_categories;
CREATE POLICY "Service categories deletable by owners"
    ON public.service_categories FOR DELETE
    TO authenticated
    USING (
        (salon_id = public.current_user_salon_id() AND public.is_owner())
        OR EXISTS (SELECT 1 FROM public.administrators a WHERE a.auth_user_id = auth.uid() AND a.active = true)
        OR public.is_owner()
    );

-- Seed the 19 standard categories for each salon in public.salons
INSERT INTO public.service_categories (id, salon_id, name, display_order, active)
SELECT
    'cat-' || s.id || '-' || LOWER(REGEXP_REPLACE(v.name, '[^a-zA-Z0-9]+', '-', 'g')),
    s.id,
    v.name,
    v.ord,
    true
FROM public.salons s
CROSS JOIN (
    VALUES
        ('Hair', 1),
        ('Hair Color', 2),
        ('Bespoke Hair Color', 3),
        ('Hair Texture', 4),
        ('Hair Rituals', 5),
        ('Kids hair Cut', 6),
        ('Threading', 7),
        ('Face Wax', 8),
        ('Body Wax', 9),
        ('Pedicure', 10),
        ('Manicure', 11),
        ('D-Tan', 12),
        ('Bleach', 13),
        ('Nails', 14),
        ('Nail Art', 15),
        ('Massages', 16),
        ('Make UP', 17),
        ('Facial', 18),
        ('Skin Ritual', 19)
) AS v(name, ord)
ON CONFLICT (salon_id, name) DO UPDATE
SET display_order = EXCLUDED.display_order,
    active = EXCLUDED.active;

-- Update legacy service categories in public.services to match the new category names
UPDATE public.services
SET category = 'Hair'
WHERE category IN ('haircut', 'styling', 'extensions');

UPDATE public.services
SET category = 'Hair Color'
WHERE category = 'color';

UPDATE public.services
SET category = 'Hair Rituals'
WHERE category = 'treatment';

-- Reload schema cache
NOTIFY pgrst, 'reload schema';
