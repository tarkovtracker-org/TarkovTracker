SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- Empty on installation: no historical jobs become eligible and no backfill occurs.
CREATE TABLE private.lifecycle_delivery_eligibility (
 user_id UUID PRIMARY KEY,
 admitted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.lifecycle_delivery_eligibility ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lifecycle_delivery_eligibility FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.admit_new_lifecycle_request() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=NEW.user_id)
 AND NOT EXISTS(SELECT 1 FROM private.lifecycle_delivery_eligibility WHERE user_id=NEW.user_id)
 THEN RAISE EXCEPTION 'Historical deletion requires separate operator review' USING ERRCODE='55000'; END IF;
 INSERT INTO private.lifecycle_delivery_eligibility(user_id) VALUES(NEW.user_id) ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.admit_new_lifecycle_request() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER admit_new_lifecycle_request BEFORE INSERT ON private.lifecycle_requests
 FOR EACH ROW EXECUTE FUNCTION private.admit_new_lifecycle_request();

CREATE FUNCTION public.lifecycle_delivery_health() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object(
 'controls',public.lifecycle_delivery_status(),
 'work', (SELECT COALESCE(jsonb_agg(s),'[]'::jsonb) FROM (
 SELECT kind,state,error_code,count(*) AS count,min(available_at) AS oldest_available_at,
 count(*) FILTER(WHERE state='processing' AND lease_until<now()) AS stale_leases
 FROM private.lifecycle_work GROUP BY kind,state,error_code) s),
 'waiting_for_providers',(SELECT count(*) FROM private.lifecycle_requests WHERE state='provider_wait'),
 'historical_jobs_without_eligibility',(SELECT count(*) FROM public.account_deletion_jobs j
 WHERE NOT EXISTS(SELECT 1 FROM private.lifecycle_delivery_eligibility e WHERE e.user_id=j.user_id)),
 'scheduler_configured_by_migration',false);
$$;
REVOKE ALL ON FUNCTION public.lifecycle_delivery_health() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_delivery_health() TO service_role;
