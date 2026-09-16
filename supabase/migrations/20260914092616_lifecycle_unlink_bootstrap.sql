BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Serializes installation with authoritative Auth DELETE transactions, including cascades.
-- This acquires a transaction lock only: no managed table, trigger, row or grant is changed.
-- Identity writes can wait briefly; timeout rolls back the entire bootstrap.
LOCK TABLE auth.identities IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE private.lifecycle_bootstrap_discord (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL,
 source_key TEXT NOT NULL UNIQUE,
 discord_id TEXT,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 handed_off_at TIMESTAMPTZ
);
ALTER TABLE private.lifecycle_bootstrap_discord ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lifecycle_bootstrap_discord FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.preserve_bootstrap_discord(p_user UUID,p_source TEXT,p_discord TEXT)
RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO private.lifecycle_bootstrap_discord(user_id,source_key,discord_id)
 VALUES(p_user,p_source||':'||COALESCE(p_discord,'unknown'),p_discord)
 ON CONFLICT(source_key) DO NOTHING;
$$;
REVOKE ALL ON FUNCTION private.preserve_bootstrap_discord(UUID,TEXT,TEXT)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.delete_discord_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE identifier TEXT; known TEXT;
BEGIN
 IF OLD.provider<>'discord' THEN RETURN OLD; END IF;
 identifier:=COALESCE(NULLIF(OLD.identity_data->>'provider_id',''),NULLIF(OLD.identity_data->>'sub',''));
 -- Prefer the removed identity. Fall back only when it has no identifier; never revoke a different current link. No Auth FK.
 FOR known IN
 SELECT identifier WHERE identifier IS NOT NULL
 UNION SELECT discord_user_id FROM public.discord_account_links WHERE identifier IS NULL AND user_id=OLD.user_id AND discord_user_id IS NOT NULL
 UNION SELECT discord_user_id FROM public.supporters WHERE identifier IS NULL AND user_id=OLD.user_id AND discord_user_id IS NOT NULL
 LOOP
  PERFORM private.preserve_bootstrap_discord(OLD.user_id,'identity:'||OLD.id::text,known);
 END LOOP;
 IF NOT FOUND THEN
  PERFORM private.preserve_bootstrap_discord(OLD.user_id,'identity:'||OLD.id::text,NULL);
 END IF;
 DELETE FROM public.discord_account_links WHERE user_id=OLD.user_id AND (identifier IS NULL OR discord_user_id=identifier);
 UPDATE public.supporters SET discord_user_id=NULL WHERE user_id=OLD.user_id AND (identifier IS NULL OR discord_user_id=identifier);
 RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION public.delete_discord_account_link() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.capture_bootstrap_link_removal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.discord_user_id IS NOT DISTINCT FROM NEW.discord_user_id THEN RETURN NEW; END IF;
 IF OLD.discord_user_id IS NOT NULL THEN
  PERFORM private.preserve_bootstrap_discord(OLD.user_id,TG_TABLE_NAME||':'||OLD.user_id::text||':'||txid_current()::text,OLD.discord_user_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.capture_bootstrap_link_removal() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER capture_bootstrap_discord_link BEFORE DELETE OR UPDATE OF discord_user_id ON public.discord_account_links
 FOR EACH ROW EXECUTE FUNCTION private.capture_bootstrap_link_removal();
CREATE TRIGGER capture_bootstrap_supporter_link BEFORE DELETE OR UPDATE OF discord_user_id ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.capture_bootstrap_link_removal();

COMMIT;
