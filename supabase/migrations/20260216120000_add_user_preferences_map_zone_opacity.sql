ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS map_zone_opacity DOUBLE PRECISION DEFAULT 0.24;

UPDATE public.user_preferences
SET map_zone_opacity = 0.24
WHERE map_zone_opacity IS NULL;

ALTER TABLE public.user_preferences
  ALTER COLUMN map_zone_opacity SET DEFAULT 0.24,
  ALTER COLUMN map_zone_opacity SET NOT NULL;
