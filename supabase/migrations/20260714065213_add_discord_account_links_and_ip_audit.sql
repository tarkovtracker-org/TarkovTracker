BEGIN;

CREATE TABLE IF NOT EXISTS public.discord_account_links (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id TEXT NOT NULL UNIQUE,
  discord_username TEXT NOT NULL,
  discord_display_name TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.account_ip_audit (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL CHECK (ip_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_user_agent TEXT,
  seen_count BIGINT NOT NULL DEFAULT 1 CHECK (seen_count > 0),
  PRIMARY KEY (user_id, ip_hash)
);

CREATE INDEX IF NOT EXISTS idx_account_ip_audit_last_seen_at
  ON public.account_ip_audit(last_seen_at DESC);

ALTER TABLE public.discord_account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_ip_audit ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.discord_account_links TO authenticated;
GRANT ALL ON public.discord_account_links TO service_role;
GRANT ALL ON public.account_ip_audit TO service_role;

DROP POLICY IF EXISTS "Users can view own Discord account link" ON public.discord_account_links;
CREATE POLICY "Users can view own Discord account link" ON public.discord_account_links
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role full access" ON public.discord_account_links;
CREATE POLICY "Service role full access" ON public.discord_account_links
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access" ON public.account_ip_audit;
CREATE POLICY "Service role full access" ON public.account_ip_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.track_account_ip_audit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.first_seen_at = OLD.first_seen_at;
  NEW.seen_count = OLD.seen_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_account_ip_audit_update ON public.account_ip_audit;
CREATE TRIGGER trg_account_ip_audit_update
  BEFORE UPDATE ON public.account_ip_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.track_account_ip_audit_update();

CREATE OR REPLACE FUNCTION public.set_discord_account_link_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discord_account_links_updated_at ON public.discord_account_links;
CREATE TRIGGER trg_discord_account_links_updated_at
  BEFORE UPDATE ON public.discord_account_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_discord_account_link_updated_at();

CREATE OR REPLACE FUNCTION public.sync_discord_account_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_discord_user_id TEXT;
  v_discord_username TEXT;
  v_discord_display_name TEXT;
BEGIN
  IF NEW.provider <> 'discord' THEN
    RETURN NEW;
  END IF;

  v_discord_user_id := COALESCE(
    NULLIF(NEW.identity_data ->> 'provider_id', ''),
    NULLIF(NEW.identity_data ->> 'sub', '')
  );

  IF v_discord_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_discord_username := COALESCE(
    NULLIF(NEW.identity_data ->> 'username', ''),
    NULLIF(NEW.identity_data ->> 'preferred_username', ''),
    NULLIF(NEW.identity_data ->> 'global_name', ''),
    v_discord_user_id
  );
  v_discord_display_name := COALESCE(
    NULLIF(NEW.identity_data ->> 'global_name', ''),
    NULLIF(NEW.identity_data ->> 'full_name', ''),
    NULLIF(NEW.identity_data ->> 'name', '')
  );

  -- Reassign the Discord identity if it was previously linked to another user
  -- so the unique(discord_user_id) constraint cannot abort this auth write.
  DELETE FROM public.discord_account_links
  WHERE discord_user_id = v_discord_user_id
    AND user_id <> NEW.user_id;

  INSERT INTO public.discord_account_links (
    user_id,
    discord_user_id,
    discord_username,
    discord_display_name,
    linked_at
  )
  VALUES (
    NEW.user_id,
    v_discord_user_id,
    v_discord_username,
    v_discord_display_name,
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    discord_user_id = EXCLUDED.discord_user_id,
    discord_username = EXCLUDED.discord_username,
    discord_display_name = EXCLUDED.discord_display_name,
    linked_at = LEAST(public.discord_account_links.linked_at, EXCLUDED.linked_at);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_discord_account_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_discord_account_link() FROM anon;
REVOKE ALL ON FUNCTION public.sync_discord_account_link() FROM authenticated;

DROP TRIGGER IF EXISTS trg_sync_discord_account_link ON auth.identities;
CREATE TRIGGER trg_sync_discord_account_link
  AFTER INSERT OR UPDATE OF provider, identity_data ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_discord_account_link();

DELETE FROM public.discord_account_links AS existing
USING auth.identities AS identities
WHERE identities.provider = 'discord'
  AND existing.discord_user_id = COALESCE(
    NULLIF(identities.identity_data ->> 'provider_id', ''),
    NULLIF(identities.identity_data ->> 'sub', '')
  )
  AND existing.user_id <> identities.user_id;

INSERT INTO public.discord_account_links (
  user_id,
  discord_user_id,
  discord_username,
  discord_display_name,
  linked_at
)
SELECT
  identities.user_id,
  COALESCE(
    NULLIF(identities.identity_data ->> 'provider_id', ''),
    NULLIF(identities.identity_data ->> 'sub', '')
  ),
  COALESCE(
    NULLIF(identities.identity_data ->> 'username', ''),
    NULLIF(identities.identity_data ->> 'preferred_username', ''),
    NULLIF(identities.identity_data ->> 'global_name', ''),
    COALESCE(
      NULLIF(identities.identity_data ->> 'provider_id', ''),
      NULLIF(identities.identity_data ->> 'sub', '')
    )
  ),
  COALESCE(
    NULLIF(identities.identity_data ->> 'global_name', ''),
    NULLIF(identities.identity_data ->> 'full_name', ''),
    NULLIF(identities.identity_data ->> 'name', '')
  ),
  COALESCE(identities.created_at, NOW())
FROM auth.identities AS identities
WHERE identities.provider = 'discord'
  AND COALESCE(
    NULLIF(identities.identity_data ->> 'provider_id', ''),
    NULLIF(identities.identity_data ->> 'sub', '')
  ) IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET
  discord_user_id = EXCLUDED.discord_user_id,
  discord_username = EXCLUDED.discord_username,
  discord_display_name = EXCLUDED.discord_display_name,
  linked_at = LEAST(public.discord_account_links.linked_at, EXCLUDED.linked_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'supporters'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.supporters;
  END IF;
END $$;

COMMIT;
