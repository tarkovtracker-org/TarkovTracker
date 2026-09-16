BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Empty-at-install bootstrap history is NOT provider completion. Preserve source evidence.
-- New/late bootstrap inserts forward durably after this DDL commits; old rows use bounded handoff.
CREATE FUNCTION private.forward_bootstrap_discord() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.capture_provider_obligation(NEW.user_id,'discord_cleanup',NEW.discord_id,'bootstrap:'||NEW.id::text);
 UPDATE private.lifecycle_bootstrap_discord SET handed_off_at=clock_timestamp() WHERE id=NEW.id;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.forward_bootstrap_discord() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER forward_bootstrap_discord AFTER INSERT ON private.lifecycle_bootstrap_discord
 FOR EACH ROW EXECUTE FUNCTION private.forward_bootstrap_discord();

CREATE FUNCTION public.handoff_bootstrap_discord(p_limit INTEGER DEFAULT 1) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE item private.lifecycle_bootstrap_discord; total INTEGER:=0;
BEGIN
 IF p_limit<1 OR p_limit>100 OR p_limit IS NULL THEN RAISE EXCEPTION 'Invalid handoff batch'; END IF;
 FOR item IN SELECT * FROM private.lifecycle_bootstrap_discord WHERE handed_off_at IS NULL
 ORDER BY captured_at,id LIMIT p_limit FOR UPDATE SKIP LOCKED LOOP
  PERFORM private.capture_provider_obligation(item.user_id,'discord_cleanup',item.discord_id,'bootstrap:'||item.id::text);
  UPDATE private.lifecycle_bootstrap_discord SET handed_off_at=clock_timestamp() WHERE id=item.id;
  total:=total+1;
 END LOOP;
 RETURN total;
END; $$;
-- Operator action only; deployment never invokes it and no provider HTTP is performed.
REVOKE ALL ON FUNCTION public.handoff_bootstrap_discord(INTEGER) FROM PUBLIC,anon,authenticated,service_role;

-- Do not reopen deletion until every pre-foundation obligation is represented in lifecycle work.
CREATE FUNCTION private.guard_bootstrap_handoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.enabled AND EXISTS(SELECT 1 FROM private.lifecycle_bootstrap_discord WHERE handed_off_at IS NULL)
 THEN RAISE EXCEPTION 'Bootstrap obligations require bounded operator handoff' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_bootstrap_handoff() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_bootstrap_handoff BEFORE UPDATE OF enabled ON private.lifecycle_delivery_controls
 FOR EACH ROW EXECUTE FUNCTION private.guard_bootstrap_handoff();

-- Final runtimes cannot become active merely by deployment. Reopening is an audited operator step.
SELECT public.set_lifecycle_delivery('deletion_intake',false,'B0 handoff: explicit reopening required');
SELECT public.set_lifecycle_delivery('deletion_reconcile',false,'B0 handoff: explicit reopening required');
SELECT public.set_lifecycle_delivery('provider_processing',false,'B0 handoff: explicit reopening required');

COMMIT;
