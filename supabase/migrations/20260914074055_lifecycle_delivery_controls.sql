SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Independent bootstrap: no dependency on the provider lifecycle foundation.
-- Admission closes immediately; quiescence is established only after active=0.
-- Never expire an invocation automatically: a paused process may still issue HTTP.
CREATE TABLE private.lifecycle_delivery_controls (
 component TEXT PRIMARY KEY CHECK(component IN ('deletion_intake','deletion_reconcile','provider_processing')),
 enabled BOOLEAN NOT NULL,
 changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO private.lifecycle_delivery_controls(component,enabled) VALUES
 ('deletion_intake',true),('deletion_reconcile',true),('provider_processing',false);
CREATE TABLE private.lifecycle_delivery_invocations (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 component TEXT NOT NULL REFERENCES private.lifecycle_delivery_controls(component),
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 finished_at TIMESTAMPTZ
);
CREATE INDEX lifecycle_delivery_active ON private.lifecycle_delivery_invocations(component)
 WHERE finished_at IS NULL;
CREATE TABLE private.lifecycle_delivery_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 component TEXT NOT NULL,
 enabled BOOLEAN NOT NULL,
 actor TEXT NOT NULL,
 evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 1 AND 200),
 changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.lifecycle_delivery_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.lifecycle_delivery_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.lifecycle_delivery_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lifecycle_delivery_controls,private.lifecycle_delivery_invocations,
 private.lifecycle_delivery_audit FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.lifecycle_delivery_audit_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.begin_lifecycle_delivery(p_component TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE admitted BOOLEAN; invocation UUID;
BEGIN
 SELECT enabled INTO STRICT admitted FROM private.lifecycle_delivery_controls
 WHERE component=p_component FOR UPDATE;
 IF NOT admitted THEN RETURN NULL; END IF;
 -- Provider processing is single-flight across invocations. User intake is not.
 IF p_component='provider_processing' AND EXISTS(
 SELECT 1 FROM private.lifecycle_delivery_invocations WHERE component=p_component AND finished_at IS NULL)
 THEN RETURN NULL; END IF;
 INSERT INTO private.lifecycle_delivery_invocations(component) VALUES(p_component) RETURNING id INTO invocation;
 RETURN invocation;
END; $$;
CREATE FUNCTION public.finish_lifecycle_delivery(p_invocation UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 UPDATE private.lifecycle_delivery_invocations SET finished_at=clock_timestamp()
 WHERE id=p_invocation AND finished_at IS NULL;
 RETURN FOUND;
END; $$;
CREATE FUNCTION public.lifecycle_delivery_status() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_agg(jsonb_build_object('component',c.component,'enabled',c.enabled,
 'legacy_or_registered_job_claims',(SELECT count(*) FROM public.account_deletion_jobs WHERE status='in_progress'),
 'active', (SELECT count(*) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL),
 'oldest_active_at',(SELECT min(started_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL),
 'last_started_at',(SELECT max(started_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component),
 'last_finished_at',(SELECT max(finished_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component),
 'changed_at',c.changed_at) ORDER BY c.component) FROM private.lifecycle_delivery_controls c;
$$;
-- Operator SQL only. service_role can inspect/admit/finish, never change controls.
CREATE FUNCTION public.set_lifecycle_delivery(p_component TEXT,p_enabled BOOLEAN,p_evidence_reference TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 IF p_evidence_reference IS NULL OR length(p_evidence_reference) NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION 'Evidence reference required'; END IF;
 PERFORM 1 FROM private.lifecycle_delivery_controls WHERE component=p_component FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown lifecycle component'; END IF;
 UPDATE private.lifecycle_delivery_controls SET enabled=p_enabled,changed_at=clock_timestamp() WHERE component=p_component;
 INSERT INTO private.lifecycle_delivery_audit(component,enabled,actor,evidence_reference)
 VALUES(p_component,p_enabled,session_user,p_evidence_reference);
END; $$;
REVOKE ALL ON FUNCTION public.begin_lifecycle_delivery(TEXT),public.finish_lifecycle_delivery(UUID),
 public.lifecycle_delivery_status(),public.set_lifecycle_delivery(TEXT,BOOLEAN,TEXT)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_lifecycle_delivery(TEXT),public.finish_lifecycle_delivery(UUID),
 public.lifecycle_delivery_status() TO service_role;

-- A+C legacy bundles may still be running when wrapped bundles replace them.
-- Deny late unregistered job creation/claims after closing admission. Registered
-- invocations retain permission to finish while their active record keeps drain open.
CREATE FUNCTION private.guard_lifecycle_delivery_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE invocation TEXT; legacy_enabled BOOLEAN;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.status<>'in_progress' OR (OLD.status='in_progress' AND NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token)
  THEN RETURN NEW; END IF;
 END IF;
 invocation:=COALESCE(NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-lifecycle-delivery','');
 PERFORM 1 FROM private.lifecycle_delivery_invocations WHERE id::text=invocation
 AND component IN ('deletion_intake','deletion_reconcile') AND finished_at IS NULL FOR SHARE;
 IF FOUND THEN RETURN NEW; END IF;
 SELECT count(*)=2 AND bool_and(enabled) INTO legacy_enabled FROM (
  SELECT enabled FROM private.lifecycle_delivery_controls
  WHERE component IN ('deletion_intake','deletion_reconcile') ORDER BY component FOR SHARE
 ) c;
 IF NOT legacy_enabled THEN RAISE EXCEPTION 'Lifecycle admission closed' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.guard_lifecycle_delivery_claim() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_lifecycle_delivery_claim BEFORE INSERT OR UPDATE ON public.account_deletion_jobs
 FOR EACH ROW EXECUTE FUNCTION private.guard_lifecycle_delivery_claim();
