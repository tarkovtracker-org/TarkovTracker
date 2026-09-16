BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- UNDEPLOYED billing bootstrap: apply on A+C before reservation-aware Nuxt routes.
-- Legacy deletion/reconcile must already be bridged and drained; this does not
-- make old deletion handlers safe. No provider call, backfill or scheduler.
CREATE TABLE private.provider_initiations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL,
 operation TEXT NOT NULL CHECK(operation IN ('checkout','portal')),
 fingerprint TEXT NOT NULL,
 customer_id TEXT,
 state TEXT NOT NULL DEFAULT 'unresolved' CHECK(state IN ('unresolved','reconciled')),
 resource_id TEXT,
 review_required BOOLEAN NOT NULL DEFAULT FALSE,
 attempts INTEGER NOT NULL DEFAULT 0,
 first_failure_at TIMESTAMPTZ,
 next_check_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 error_code TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX provider_initiations_user ON private.provider_initiations(user_id) WHERE state='unresolved';
CREATE TABLE private.provider_assets (
 user_id UUID NOT NULL,provider_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,provider_id)
);
ALTER TABLE private.provider_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.provider_assets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lifecycle_user_lock(p_user UUID) RETURNS void
LANGUAGE sql SET search_path='' AS $$ SELECT pg_advisory_xact_lock(784114,hashtext(p_user::text)); $$;

ALTER TABLE private.provider_initiations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.provider_initiations FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.reserve_provider_initiation(p_user_id UUID,p_operation TEXT,p_fingerprint TEXT,p_customer_id TEXT DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v UUID; existing private.provider_initiations; blocked BOOLEAN := FALSE;
BEGIN
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF to_regclass('private.lifecycle_requests') IS NOT NULL THEN
   EXECUTE 'SELECT EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=$1 AND state IN (''sealed'',''prepared'',''auth_authorized'',''completed''))'
   INTO blocked USING p_user_id;
 END IF;
 IF blocked THEN
   RAISE EXCEPTION 'Account deletion preparation has started' USING ERRCODE='55000';
 END IF;
 IF p_operation='checkout' THEN
   SELECT * INTO existing FROM private.provider_initiations WHERE user_id=p_user_id AND operation='checkout' AND state='unresolved' ORDER BY created_at LIMIT 1;
   IF FOUND THEN
     IF existing.fingerprint<>p_fingerprint OR existing.created_at<clock_timestamp()-INTERVAL '23 hours' THEN
       RAISE EXCEPTION 'Existing checkout requires reconciliation' USING ERRCODE='55000';
     END IF;
     RETURN existing.id;
   END IF;
 END IF;
 IF p_customer_id IS NOT NULL THEN INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_customer_id) ON CONFLICT DO NOTHING; END IF;
 INSERT INTO private.provider_initiations(user_id,operation,fingerprint,customer_id) VALUES(p_user_id,p_operation,p_fingerprint,p_customer_id) RETURNING id INTO v;
 RETURN v;
END; $$;
CREATE FUNCTION public.record_provider_initiation(p_id UUID,p_resource TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- A returned Checkout URL is not settled provider work; only reconciliation may close the intent.
 UPDATE private.provider_initiations SET resource_id=p_resource WHERE id=p_id AND state='unresolved' AND (resource_id IS NULL OR resource_id=p_resource);
 RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION private.lifecycle_user_lock(UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.reserve_provider_initiation(UUID,TEXT,TEXT,TEXT),public.record_provider_initiation(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reserve_provider_initiation(UUID,TEXT,TEXT,TEXT),public.record_provider_initiation(UUID,TEXT) TO service_role;

-- An operator records this only after BOTH reservation-aware application routes
-- are verified and all old issuance requests/routing have stopped. No backdating.
CREATE TABLE private.billing_application_cutovers (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 confirmed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 checkout_source_hash TEXT NOT NULL CHECK(checkout_source_hash ~ '^[a-f0-9]{64}$'),
 portal_source_hash TEXT NOT NULL CHECK(portal_source_hash ~ '^[a-f0-9]{64}$'),
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 200),
 actor NAME NOT NULL DEFAULT session_user
);
ALTER TABLE private.billing_application_cutovers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.billing_application_cutovers FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.confirm_billing_application_cutover(p_checkout_hash TEXT,p_portal_hash TEXT,p_evidence_reference TEXT)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE confirmed TIMESTAMPTZ;
BEGIN
 INSERT INTO private.billing_application_cutovers(checkout_source_hash,portal_source_hash,evidence_reference)
 VALUES(p_checkout_hash,p_portal_hash,p_evidence_reference) RETURNING confirmed_at INTO confirmed;
 RETURN confirmed;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_billing_application_cutover(TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.billing_application_horizon_elapsed() RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE(max(confirmed_at) + INTERVAL '24 hours' <= statement_timestamp(),FALSE)
 FROM private.billing_application_cutovers;
$$;
REVOKE ALL ON FUNCTION private.billing_application_horizon_elapsed() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.billing_application_cutover_status() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('recorded',count(*)>0,'confirmed_at',max(confirmed_at),
 'earliest_provider_verification_at',max(confirmed_at)+INTERVAL '24 hours',
 'horizon_elapsed',private.billing_application_horizon_elapsed(),
 'provider_clearance',FALSE)
 FROM private.billing_application_cutovers;
$$;
REVOKE ALL ON FUNCTION public.billing_application_cutover_status() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.billing_application_cutover_status() TO service_role;

COMMIT;
