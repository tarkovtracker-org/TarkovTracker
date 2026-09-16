BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Both B0-first and chronological replay end with this canonical application-owned capture.
-- Serialize with identity DELETE transactions without modifying any managed Auth object.
LOCK TABLE auth.identities IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.delete_discord_account_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v_id TEXT;
BEGIN
 IF OLD.provider<>'discord' THEN RETURN OLD; END IF;
 v_id:=COALESCE(NULLIF(OLD.identity_data->>'provider_id',''),NULLIF(OLD.identity_data->>'sub',''));
 IF v_id IS NULL THEN SELECT discord_user_id INTO v_id FROM public.discord_account_links WHERE user_id=OLD.user_id; END IF;
 PERFORM private.capture_provider_obligation(OLD.user_id,'discord_cleanup',v_id,'identity:'||OLD.id::text);
 DELETE FROM public.discord_account_links WHERE user_id=OLD.user_id AND (v_id IS NULL OR discord_user_id=v_id);
 UPDATE public.supporters SET discord_user_id=NULL WHERE user_id=OLD.user_id AND (v_id IS NULL OR discord_user_id=v_id);
 RETURN OLD;
END; $$;

REVOKE ALL ON FUNCTION public.delete_discord_account_link() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
