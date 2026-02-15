CREATE OR REPLACE FUNCTION public.sanitize_user_progress_mode_data(payload jsonb)
RETURNS jsonb
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'displayName',
      CASE
        WHEN jsonb_typeof(payload->'displayName') = 'string'
          AND nullif(btrim(payload->>'displayName'), '') IS NOT NULL
        THEN to_jsonb(left(btrim(payload->>'displayName'), 64))
        ELSE NULL
      END,
      'hideoutModules',
      CASE
        WHEN jsonb_typeof(payload->'hideoutModules') = 'object'
        THEN payload->'hideoutModules'
        ELSE '{}'::jsonb
      END,
      'hideoutParts',
      CASE
        WHEN jsonb_typeof(payload->'hideoutParts') = 'object'
        THEN payload->'hideoutParts'
        ELSE '{}'::jsonb
      END,
      'lastApiUpdate',
      CASE
        WHEN jsonb_typeof(payload->'lastApiUpdate') = 'object'
        THEN payload->'lastApiUpdate'
        ELSE NULL
      END,
      'level',
      CASE
        WHEN jsonb_typeof(payload->'level') = 'number'
        THEN to_jsonb(greatest(1, trunc((payload->>'level')::numeric)::int))
        ELSE NULL
      END,
      'pmcFaction',
      CASE
        WHEN payload->>'pmcFaction' IN ('BEAR', 'USEC')
        THEN to_jsonb(payload->>'pmcFaction')
        ELSE NULL
      END,
      'prestigeLevel',
      CASE
        WHEN jsonb_typeof(payload->'prestigeLevel') = 'number'
        THEN to_jsonb(least(6, greatest(0, trunc((payload->>'prestigeLevel')::numeric)::int)))
        ELSE NULL
      END,
      'skillOffsets',
      CASE
        WHEN jsonb_typeof(payload->'skillOffsets') = 'object'
        THEN payload->'skillOffsets'
        ELSE '{}'::jsonb
      END,
      'skills',
      CASE
        WHEN jsonb_typeof(payload->'skills') = 'object'
        THEN payload->'skills'
        ELSE '{}'::jsonb
      END,
      'taskCompletions',
      CASE
        WHEN jsonb_typeof(payload->'taskCompletions') = 'object'
        THEN payload->'taskCompletions'
        ELSE '{}'::jsonb
      END,
      'taskObjectives',
      CASE
        WHEN jsonb_typeof(payload->'taskObjectives') = 'object'
        THEN payload->'taskObjectives'
        ELSE '{}'::jsonb
      END,
      'traders',
      CASE
        WHEN jsonb_typeof(payload->'traders') = 'object'
        THEN payload->'traders'
        ELSE '{}'::jsonb
      END,
      'xpOffset',
      CASE
        WHEN jsonb_typeof(payload->'xpOffset') = 'number'
        THEN to_jsonb(trunc((payload->>'xpOffset')::numeric)::int)
        ELSE NULL
      END
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.sanitize_user_progress_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.pvp_data := public.sanitize_user_progress_mode_data(COALESCE(NEW.pvp_data, '{}'::jsonb));
  NEW.pve_data := public.sanitize_user_progress_mode_data(COALESCE(NEW.pve_data, '{}'::jsonb));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sanitize_user_progress_payload ON public.user_progress;
CREATE TRIGGER sanitize_user_progress_payload
BEFORE INSERT OR UPDATE OF pvp_data, pve_data
ON public.user_progress
FOR EACH ROW
EXECUTE FUNCTION public.sanitize_user_progress_row();
-- Intentionally skip an immediate full-table UPDATE on public.user_progress in this migration.
-- The sanitize_user_progress_payload trigger now enforces sanitize_user_progress_mode_data
-- for all new writes/updates without forcing a single heavy backfill transaction.
-- If existing rows need normalization, run a batched backfill manually in a maintenance window:
--
-- DO $$
-- DECLARE
--   rows_updated integer := 0;
-- BEGIN
--   LOOP
--     WITH batch AS (
--       SELECT ctid
--       FROM public.user_progress
--       WHERE
--         pvp_data IS DISTINCT FROM public.sanitize_user_progress_mode_data(COALESCE(pvp_data, '{}'::jsonb))
--         OR pve_data IS DISTINCT FROM public.sanitize_user_progress_mode_data(COALESCE(pve_data, '{}'::jsonb))
--       LIMIT 500
--     )
--     UPDATE public.user_progress up
--     SET
--       pvp_data = public.sanitize_user_progress_mode_data(COALESCE(up.pvp_data, '{}'::jsonb)),
--       pve_data = public.sanitize_user_progress_mode_data(COALESCE(up.pve_data, '{}'::jsonb))
--     FROM batch
--     WHERE up.ctid = batch.ctid;
--
--     GET DIAGNOSTICS rows_updated = ROW_COUNT;
--     EXIT WHEN rows_updated = 0;
--     PERFORM pg_sleep(0.05);
--   END LOOP;
-- END;
-- $$;
