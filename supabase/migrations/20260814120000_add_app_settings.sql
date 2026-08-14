BEGIN;

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_settings FROM PUBLIC;
REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE ALL ON TABLE public.app_settings FROM authenticated;
GRANT ALL ON TABLE public.app_settings TO service_role;

COMMIT;
