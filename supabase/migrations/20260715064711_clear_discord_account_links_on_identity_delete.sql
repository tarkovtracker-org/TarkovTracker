BEGIN;

CREATE OR REPLACE FUNCTION public.delete_discord_account_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_discord_user_id TEXT;
BEGIN
  IF OLD.provider <> 'discord' THEN
    RETURN OLD;
  END IF;

  v_discord_user_id := COALESCE(
    NULLIF(OLD.identity_data ->> 'provider_id', ''),
    NULLIF(OLD.identity_data ->> 'sub', '')
  );

  IF v_discord_user_id IS NULL THEN
    DELETE FROM public.discord_account_links
    WHERE user_id = OLD.user_id;

    UPDATE public.supporters
    SET discord_user_id = NULL
    WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;

  DELETE FROM public.discord_account_links
  WHERE user_id = OLD.user_id
    AND discord_user_id = v_discord_user_id;

  UPDATE public.supporters
  SET discord_user_id = NULL
  WHERE user_id = OLD.user_id
    AND discord_user_id = v_discord_user_id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_discord_account_link() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_discord_account_link() FROM anon;
REVOKE ALL ON FUNCTION public.delete_discord_account_link() FROM authenticated;

DROP TRIGGER IF EXISTS trg_delete_discord_account_link ON auth.identities;
CREATE TRIGGER trg_delete_discord_account_link
  AFTER DELETE ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION public.delete_discord_account_link();

UPDATE public.supporters AS supporters
SET discord_user_id = NULL
WHERE supporters.discord_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM auth.identities AS identities
    WHERE identities.provider = 'discord'
      AND identities.user_id = supporters.user_id
      AND COALESCE(
        NULLIF(identities.identity_data ->> 'provider_id', ''),
        NULLIF(identities.identity_data ->> 'sub', '')
      ) = supporters.discord_user_id
  );

DELETE FROM public.discord_account_links AS links
WHERE NOT EXISTS (
  SELECT 1
  FROM auth.identities AS identities
  WHERE identities.provider = 'discord'
    AND identities.user_id = links.user_id
    AND COALESCE(
      NULLIF(identities.identity_data ->> 'provider_id', ''),
      NULLIF(identities.identity_data ->> 'sub', '')
    ) = links.discord_user_id
);

COMMIT;
