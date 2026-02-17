-- Add tarkov_uid column to user_progress for linking tarkov.dev profiles
ALTER TABLE public.user_progress
ADD COLUMN IF NOT EXISTS tarkov_uid BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_progress_tarkov_uid_unique'
      AND conrelid = 'public.user_progress'::regclass
  ) THEN
    ALTER TABLE public.user_progress
    ADD CONSTRAINT user_progress_tarkov_uid_unique UNIQUE (tarkov_uid);
  END IF;
END;
$$;

-- Update sanitize function to pass through tarkovDevProfile in mode data
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
      'tarkovDevProfile',
      CASE
        WHEN jsonb_typeof(payload->'tarkovDevProfile') = 'object'
        THEN payload->'tarkovDevProfile'
        ELSE NULL
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

DO $$
DECLARE
  sanitized jsonb;
BEGIN
  sanitized := public.sanitize_user_progress_mode_data(
    jsonb_build_object(
      'displayName',
      '  Import Tester  ',
      'hideoutModules',
      jsonb_build_object('station', jsonb_build_object('complete', true)),
      'hideoutParts',
      jsonb_build_object('part', jsonb_build_object('count', 1)),
      'level',
      0,
      'pmcFaction',
      'USEC',
      'prestigeLevel',
      9,
      'skillOffsets',
      jsonb_build_object('Endurance', 3),
      'skills',
      jsonb_build_object('Endurance', 10),
      'tarkovDevProfile',
      jsonb_build_object('aid', 12345, 'importedAt', 1730000000),
      'taskCompletions',
      jsonb_build_object('task', jsonb_build_object('complete', true)),
      'taskObjectives',
      jsonb_build_object('objective', jsonb_build_object('count', 1)),
      'traders',
      jsonb_build_object('prapor', jsonb_build_object('level', 2)),
      'xpOffset',
      42,
      'unexpected',
      true
    )
  );
  IF sanitized->>'displayName' <> 'Import Tester' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: displayName not trimmed as expected';
  END IF;
  IF (sanitized->>'level')::int <> 1 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: level is not clamped to minimum 1';
  END IF;
  IF (sanitized->>'prestigeLevel')::int <> 6 THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: prestigeLevel is not clamped to max 6';
  END IF;
  IF jsonb_typeof(sanitized->'tarkovDevProfile') <> 'object' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: tarkovDevProfile object was not preserved';
  END IF;
  IF sanitized ? 'unexpected' THEN
    RAISE EXCEPTION
      'sanitize_user_progress_mode_data regression: unknown payload keys were not stripped';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_progress_tarkov_uid_unique'
      AND conrelid = 'public.user_progress'::regclass
  ) THEN
    RAISE EXCEPTION
      'migration regression: user_progress_tarkov_uid_unique constraint was not created';
  END IF;
END;
$$;
