BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- New deployments start quiesced. Old unleased admissions must not be resurrected.
ALTER TABLE private.lifecycle_delivery_invocations
 ADD COLUMN heartbeat_at TIMESTAMPTZ,
 ADD COLUMN expires_at TIMESTAMPTZ,
 ADD COLUMN deadline_at TIMESTAMPTZ;
ALTER TABLE private.lifecycle_work ADD COLUMN delivery_invocation UUID;
CREATE INDEX lifecycle_work_delivery ON private.lifecycle_work(delivery_invocation)
 WHERE delivery_invocation IS NOT NULL;
ALTER TABLE public.account_deletion_jobs ADD COLUMN delivery_invocation UUID;
CREATE INDEX account_deletion_delivery ON public.account_deletion_jobs(delivery_invocation)
 WHERE delivery_invocation IS NOT NULL;

CREATE OR REPLACE FUNCTION public.begin_lifecycle_delivery(p_component TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE enabled BOOLEAN; invocation UUID; t TIMESTAMPTZ;
BEGIN
 SELECT c.enabled INTO STRICT enabled FROM private.lifecycle_delivery_controls c
 WHERE component=p_component FOR UPDATE;
 IF NOT enabled THEN RETURN NULL; END IF;
 t:=clock_timestamp();
 IF p_component='provider_processing' AND EXISTS(SELECT 1 FROM private.lifecycle_delivery_invocations
 WHERE component=p_component AND finished_at IS NULL AND expires_at>t) THEN RETURN NULL; END IF;
 INSERT INTO private.lifecycle_delivery_invocations(component,started_at,heartbeat_at,expires_at,deadline_at)
 VALUES(p_component,t,t,t+INTERVAL '30 seconds',t+INTERVAL '60 seconds') RETURNING id INTO invocation;
 RETURN invocation;
END; $$;

CREATE FUNCTION public.renew_lifecycle_delivery(p_invocation UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM 1 FROM private.lifecycle_delivery_invocations WHERE id=p_invocation FOR UPDATE;
 UPDATE private.lifecycle_delivery_invocations SET heartbeat_at=clock_timestamp(),
 expires_at=LEAST(deadline_at,clock_timestamp()+INTERVAL '30 seconds')
 WHERE id=p_invocation AND finished_at IS NULL AND expires_at>clock_timestamp() AND deadline_at>clock_timestamp();
 RETURN FOUND;
END; $$;
CREATE FUNCTION public.lifecycle_delivery_valid(p_invocation UUID) RETURNS BOOLEAN
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.lifecycle_delivery_invocations WHERE id=p_invocation
 AND finished_at IS NULL AND expires_at>clock_timestamp() AND deadline_at>clock_timestamp());
$$;
CREATE OR REPLACE FUNCTION public.finish_lifecycle_delivery(p_invocation UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
BEGIN
 PERFORM 1 FROM private.lifecycle_delivery_invocations WHERE id=p_invocation FOR UPDATE;
 UPDATE private.lifecycle_delivery_invocations SET finished_at=clock_timestamp()
 WHERE id=p_invocation AND finished_at IS NULL AND expires_at>clock_timestamp();
 RETURN FOUND;
END; $$;

CREATE FUNCTION private.delivery_header() RETURNS UUID LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NULLIF(COALESCE(NULLIF(current_setting('request.headers',true),''),'{}')::jsonb->>'x-lifecycle-delivery','')::UUID;
$$;
CREATE FUNCTION private.require_delivery(p_component TEXT DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SET search_path='' SET lock_timeout='1s' AS $$
DECLARE invocation UUID:=private.delivery_header();
BEGIN
 PERFORM 1 FROM private.lifecycle_delivery_invocations WHERE id=invocation
 AND (p_component IS NULL OR component=p_component) FOR SHARE;
 IF NOT FOUND OR NOT public.lifecycle_delivery_valid(invocation) THEN RAISE EXCEPTION 'Lifecycle invocation authority expired or missing' USING ERRCODE='40001'; END IF;
 RETURN invocation;
END; $$;

-- Validate before writes and again at COMMIT. A transaction that outlives its lease rolls back;
-- no row lock/transaction spans provider HTTP. Existing Auth capture has no worker header.
CREATE FUNCTION private.fence_delivery_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF private.delivery_header() IS NOT NULL THEN PERFORM private.require_delivery(); END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION private.fence_delivery_work() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE invocation UUID:=private.delivery_header();
BEGIN
 IF invocation IS NOT NULL THEN PERFORM private.require_delivery('provider_processing'); END IF;
 IF NEW.state='processing' AND (TG_OP='INSERT' OR NEW.claim_token IS DISTINCT FROM OLD.claim_token) THEN
  IF invocation IS NULL AND current_setting('role',true)='service_role' THEN PERFORM private.require_delivery('provider_processing'); END IF;
  NEW.delivery_invocation:=invocation;
 ELSIF TG_OP='UPDATE' AND OLD.state='processing' AND OLD.delivery_invocation IS NOT NULL THEN
  IF invocation IS DISTINCT FROM OLD.delivery_invocation THEN
   RAISE EXCEPTION 'Lifecycle invocation owner mismatch' USING ERRCODE='40001';
  END IF;
  PERFORM private.require_delivery('provider_processing');
 END IF;
 RETURN NEW;
END; $$;
-- Only claiming/advancing a processing task requires provider authority. Captures generated by
-- deletion intake or Auth are allowed to enqueue, but still undergo the general invocation fence.
CREATE TRIGGER fence_delivery_work_insert BEFORE INSERT ON private.lifecycle_work
 FOR EACH ROW WHEN (NEW.state='processing') EXECUTE FUNCTION private.fence_delivery_work();
CREATE TRIGGER fence_delivery_work_update BEFORE UPDATE ON private.lifecycle_work
 FOR EACH ROW WHEN (NEW.state='processing' OR OLD.state='processing') EXECUTE FUNCTION private.fence_delivery_work();

DO $$
DECLARE object TEXT; schema_name TEXT; table_name TEXT;
BEGIN
 FOREACH object IN ARRAY ARRAY['private.lifecycle_work','private.lifecycle_requests','private.provider_assets',
 'private.provider_initiations','public.account_deletion_jobs','public.supporters','public.discord_account_links'] LOOP
  schema_name:=split_part(object,'.',1); table_name:=split_part(object,'.',2);
  EXECUTE format('CREATE TRIGGER fence_delivery_before BEFORE INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION private.fence_delivery_write()',schema_name,table_name);
  EXECUTE format('CREATE CONSTRAINT TRIGGER fence_delivery_commit AFTER INSERT OR UPDATE OR DELETE ON %I.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.fence_delivery_write()',schema_name,table_name);
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION private.guard_lifecycle_delivery_claim() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE invocation UUID:=private.delivery_header(); legacy_enabled BOOLEAN;
BEGIN
 IF invocation IS NOT NULL THEN PERFORM private.require_delivery(); END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.status<>'in_progress' OR (OLD.status='in_progress' AND NEW.claim_token IS NOT DISTINCT FROM OLD.claim_token)
  THEN RETURN NEW; END IF;
 END IF;
 IF invocation IS NOT NULL THEN
  PERFORM 1 FROM private.lifecycle_delivery_invocations WHERE id=invocation
  AND component IN ('deletion_intake','deletion_reconcile');
  IF NOT FOUND THEN RAISE EXCEPTION 'Wrong lifecycle component' USING ERRCODE='40001'; END IF;
  NEW.delivery_invocation:=invocation;
  RETURN NEW;
 END IF;
 IF current_setting('role',true)='service_role' THEN PERFORM private.require_delivery(); END IF;
 SELECT count(*)=2 AND bool_and(enabled) INTO legacy_enabled FROM (
  SELECT enabled FROM private.lifecycle_delivery_controls
  WHERE component IN ('deletion_intake','deletion_reconcile') ORDER BY component FOR SHARE
 ) c;
 IF NOT legacy_enabled THEN RAISE EXCEPTION 'Lifecycle admission closed' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END; $$;


-- Provider RPCs require invocation authority before any claim/effect, including empty batches.
CREATE OR REPLACE FUNCTION public.claim_stripe_lifecycle(p_event_id TEXT,p_type TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE w private.lifecycle_work;
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 PERFORM public.receive_stripe_lifecycle(p_event_id,p_type);
 SELECT * INTO w FROM private.lifecycle_work WHERE kind='stripe_event' AND dedupe_key=p_event_id FOR UPDATE;
 IF w.state='completed' THEN RETURN jsonb_build_object('state','completed'); END IF;
 IF w.state IN ('blocked','dead_letter') THEN RETURN jsonb_build_object('state','operator_review'); END IF;
 IF w.state='processing' AND w.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF w.state='retryable' AND w.available_at>clock_timestamp() THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF w.state='waiting' THEN RETURN jsonb_build_object('state','provider_wait'); END IF;
 UPDATE private.lifecycle_work SET state='processing',claim_token=gen_random_uuid(),lease_until=clock_timestamp()+INTERVAL '2 minutes',attempts=attempts+1,
 first_failure_at=CASE WHEN state='processing' THEN COALESCE(first_failure_at,lease_until-INTERVAL '2 minutes') ELSE first_failure_at END,
 expected_revision=NULL,user_id=NULL
 WHERE id=w.id RETURNING * INTO w;
 IF w.attempts>12 OR w.first_failure_at<clock_timestamp()-INTERVAL '24 hours' THEN
   UPDATE private.lifecycle_work SET state='dead_letter',claim_token=NULL,lease_until=NULL,error_code='retry_window_exhausted' WHERE id=w.id;
   RETURN jsonb_build_object('state','operator_review');
 END IF;
 RETURN jsonb_build_object('state','processing','id',w.id,'token',w.claim_token);
END; $$;

CREATE OR REPLACE FUNCTION public.claim_lifecycle_work(p_kind TEXT,p_limit INTEGER DEFAULT 1)
RETURNS SETOF private.lifecycle_work LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE candidate RECORD; claimed private.lifecycle_work;
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 IF p_kind='stripe_event' THEN RAISE EXCEPTION 'Use the fenced Stripe event claim'; END IF;
 IF p_limit<1 OR p_limit>25 THEN RAISE EXCEPTION 'Batch limit must be 1..25'; END IF;
 FOR candidate IN SELECT w.id,w.user_id FROM private.lifecycle_work w WHERE w.kind=p_kind AND
 ((w.state IN ('received','retryable','waiting') AND w.available_at<=clock_timestamp()) OR (w.state='processing' AND w.lease_until<clock_timestamp()))
 AND (w.dedupe_key NOT LIKE 'deletion:%' OR EXISTS(SELECT 1 FROM private.lifecycle_requests r
 WHERE r.user_id=w.user_id AND r.generation=w.generation AND r.state<>'cancelled'
 AND (w.kind<>'discord_cleanup' OR r.state IN ('sealed','prepared','auth_authorized'))))
 ORDER BY w.available_at,w.id LIMIT p_limit LOOP
  IF candidate.user_id IS NOT NULL THEN PERFORM private.lifecycle_user_lock(candidate.user_id); END IF;
  UPDATE private.lifecycle_work w SET state='processing',claim_token=gen_random_uuid(),
  lease_until=clock_timestamp()+INTERVAL '2 minutes',attempts=w.attempts+1,
  first_failure_at=CASE WHEN w.state='processing' THEN COALESCE(w.first_failure_at,w.lease_until-INTERVAL '2 minutes') ELSE w.first_failure_at END
  WHERE w.id=candidate.id AND ((w.state IN ('received','retryable','waiting') AND w.available_at<=clock_timestamp())
    OR (w.state='processing' AND w.lease_until<clock_timestamp()))
  AND (w.dedupe_key NOT LIKE 'deletion:%' OR EXISTS(SELECT 1 FROM private.lifecycle_requests r
    WHERE r.user_id=w.user_id AND r.generation=w.generation AND r.state<>'cancelled'
    AND (w.kind<>'discord_cleanup' OR r.state IN ('sealed','prepared','auth_authorized'))))
  RETURNING w.* INTO claimed;
  IF FOUND THEN
   IF claimed.attempts>12 OR claimed.first_failure_at<clock_timestamp()-INTERVAL '24 hours' THEN
    UPDATE private.lifecycle_work SET state='dead_letter',claim_token=NULL,lease_until=NULL,error_code='retry_window_exhausted' WHERE id=claimed.id;
   ELSE RETURN NEXT claimed; END IF;
  END IF;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_lifecycle_work(p_id UUID,p_token UUID,p_state TEXT,p_code TEXT DEFAULT NULL,p_retry_seconds INTEGER DEFAULT 60)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE parent UUID; task_user UUID;
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 SELECT parent_id,user_id INTO parent,task_user FROM private.lifecycle_work WHERE id=p_id;
 IF task_user IS NOT NULL THEN PERFORM private.lifecycle_user_lock(task_user); END IF;
 IF parent IS NOT NULL THEN PERFORM 1 FROM private.lifecycle_work WHERE id=parent FOR UPDATE; END IF;
 PERFORM 1 FROM private.lifecycle_work WHERE id=p_id FOR UPDATE;
 IF p_state NOT IN ('completed','retryable','waiting','blocked','dead_letter') OR p_retry_seconds<1 OR p_retry_seconds>86400 THEN
 RAISE EXCEPTION 'Invalid work transition'; END IF;
 IF p_state='completed' AND EXISTS(SELECT 1 FROM private.lifecycle_work WHERE parent_id=p_id AND state<>'completed') THEN p_state:='waiting'; END IF;
 UPDATE private.lifecycle_work SET state=p_state,claim_token=NULL,lease_until=NULL,
 completed_at=CASE WHEN p_state='completed' THEN clock_timestamp() END,
 available_at=clock_timestamp()+make_interval(secs=>p_retry_seconds),error_code=left(p_code,80),
 first_failure_at=CASE WHEN p_state='waiting' THEN NULL ELSE COALESCE(first_failure_at,clock_timestamp()) END,
 attempts=CASE WHEN p_state='waiting' THEN 0 ELSE attempts END
 WHERE id=p_id AND claim_token=p_token AND state='processing' AND lease_until>clock_timestamp()
 AND (dedupe_key NOT LIKE 'deletion:%' OR EXISTS(SELECT 1 FROM private.lifecycle_requests r WHERE r.user_id=lifecycle_work.user_id
 AND r.generation=lifecycle_work.generation AND r.state<>'cancelled')) RETURNING parent_id INTO parent;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF parent IS NOT NULL AND p_state='completed' THEN
   UPDATE private.lifecycle_work w SET state='completed',completed_at=clock_timestamp() WHERE w.id=parent AND w.state='waiting'
   AND NOT EXISTS(SELECT 1 FROM private.lifecycle_work c WHERE c.parent_id=parent AND c.state<>'completed');
 END IF;
 RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.bind_stripe_lifecycle(p_id UUID,p_token UUID,p_user_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE w private.lifecycle_work; r BIGINT;
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 SELECT * INTO w FROM private.lifecycle_work WHERE id=p_id AND claim_token=p_token AND state='processing'
 AND kind='stripe_event' AND lease_until>clock_timestamp()
 AND (delivery_invocation IS NULL OR delivery_invocation=private.delivery_header()) FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF w.user_id IS NOT NULL THEN RETURN w.user_id=p_user_id; END IF;
 INSERT INTO private.supporter_lifecycle_revision(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO r FROM private.supporter_lifecycle_revision WHERE user_id=p_user_id;
 UPDATE private.lifecycle_work SET user_id=p_user_id,expected_revision=r WHERE id=p_id;
 RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_stripe_discord_effect(p_id UUID,p_token UUID,p_user UUID,p_resource TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 PERFORM 1 FROM private.lifecycle_work WHERE id=p_id AND claim_token=p_token AND state='processing'
 AND lease_until>clock_timestamp()
 AND (delivery_invocation IS NULL OR delivery_invocation=private.delivery_header()) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale lifecycle effect' USING ERRCODE='40001'; END IF;
 IF p_resource IS NULL OR p_user IS NULL THEN RAISE EXCEPTION 'Missing Discord attribution'; END IF;
 INSERT INTO private.lifecycle_work(kind,dedupe_key,user_id,resource_id,action,parent_id)
 VALUES('discord_cleanup','stripe:'||p_id::text||':'||p_resource,p_user,p_resource,'reconcile_current_supporter',p_id)
 ON CONFLICT(kind,dedupe_key) DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.complete_checkout_initiation(p_id UUID,p_session_id TEXT,p_user_id UUID,p_customer_id TEXT,p_subscription_id TEXT,p_status TEXT,p_payment_status TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 PERFORM 1 FROM private.provider_initiations WHERE id=p_id AND user_id=p_user_id AND operation='checkout' AND resource_id=p_session_id AND state='unresolved' FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF NOT COALESCE(p_status='expired' OR (p_status='complete' AND p_payment_status IN ('paid','no_payment_required')),FALSE) THEN RETURN FALSE; END IF;
 IF p_customer_id IS NOT NULL THEN INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_customer_id) ON CONFLICT DO NOTHING; END IF;
 IF p_subscription_id IS NOT NULL THEN INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_subscription_id) ON CONFLICT DO NOTHING; END IF;
 UPDATE private.provider_initiations SET state='reconciled' WHERE id=p_id;
 RETURN TRUE;
END; $$;

CREATE OR REPLACE FUNCTION public.defer_provider_initiation(p_id UUID,p_retryable BOOLEAN,p_error_code TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF current_setting('role',true)='service_role' OR private.delivery_header() IS NOT NULL THEN
  PERFORM private.require_delivery('provider_processing');
 END IF;
 UPDATE private.provider_initiations SET
 review_required=NOT p_retryable OR attempts>=11 OR first_failure_at<clock_timestamp()-INTERVAL '24 hours',
 attempts=attempts+CASE WHEN p_error_code IS NULL THEN 0 ELSE 1 END,
 first_failure_at=CASE WHEN p_error_code IS NULL THEN first_failure_at ELSE COALESCE(first_failure_at,clock_timestamp()) END,
 next_check_at=clock_timestamp()+make_interval(secs=>CASE WHEN p_error_code IS NULL THEN 900 ELSE least(3600,30*power(2,least(attempts,7)))::INTEGER END),
 error_code=p_error_code
 WHERE id=p_id AND state='unresolved';
END; $$;

CREATE OR REPLACE FUNCTION public.lifecycle_work_status(p_id UUID,p_token UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('state',w.state,'valid_claim',w.state='processing' AND w.claim_token=p_token
 AND w.lease_until>clock_timestamp() AND (w.delivery_invocation IS NULL OR
 (w.delivery_invocation=private.delivery_header() AND public.lifecycle_delivery_valid(w.delivery_invocation))))
 FROM private.lifecycle_work w WHERE w.id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.lifecycle_delivery_status() RETURNS JSONB
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_agg(jsonb_build_object('component',c.component,'enabled',c.enabled,
 'legacy_or_registered_job_claims',(SELECT count(*) FROM public.account_deletion_jobs WHERE status='in_progress'),
 'active',(SELECT count(*) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL AND i.expires_at>clock_timestamp()),
 'expired',(SELECT count(*) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL AND (i.expires_at IS NULL OR i.expires_at<=clock_timestamp())),
 'oldest_active_at',(SELECT min(started_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL AND i.expires_at>clock_timestamp()),
 'oldest_heartbeat_at',(SELECT min(heartbeat_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component AND i.finished_at IS NULL AND i.expires_at>clock_timestamp()),
 'last_started_at',(SELECT max(started_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component),
 'last_finished_at',(SELECT max(finished_at) FROM private.lifecycle_delivery_invocations i WHERE i.component=c.component),
 'changed_at',c.changed_at) ORDER BY c.component) FROM private.lifecycle_delivery_controls c;
$$;

-- Explicit operator retention only. Referenced work/job evidence is retained regardless of age.
CREATE FUNCTION public.retain_lifecycle_delivery_history(p_limit INTEGER DEFAULT 100) RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='1s' AS $$
DECLARE affected INTEGER;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN RAISE EXCEPTION 'Invalid retention batch'; END IF;
 DELETE FROM private.lifecycle_delivery_invocations i WHERE i.id IN (
  SELECT old.id FROM private.lifecycle_delivery_invocations old
  WHERE COALESCE(old.finished_at,old.expires_at)>old.started_at
  AND COALESCE(old.finished_at,old.expires_at)<clock_timestamp()-INTERVAL '90 days'
  AND NOT EXISTS(SELECT 1 FROM private.lifecycle_work w WHERE w.delivery_invocation=old.id)
  AND NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs j WHERE j.delivery_invocation=old.id)
  ORDER BY old.started_at LIMIT p_limit FOR UPDATE SKIP LOCKED
 );
 GET DIAGNOSTICS affected=ROW_COUNT; RETURN affected;
END; $$;
REVOKE ALL ON FUNCTION public.retain_lifecycle_delivery_history(INTEGER) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION private.delivery_header(),private.require_delivery(TEXT),private.fence_delivery_write(),private.fence_delivery_work()
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.begin_lifecycle_delivery(TEXT),public.renew_lifecycle_delivery(UUID),public.lifecycle_delivery_valid(UUID),public.finish_lifecycle_delivery(UUID),public.lifecycle_delivery_status()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.begin_lifecycle_delivery(TEXT),public.renew_lifecycle_delivery(UUID),public.lifecycle_delivery_valid(UUID),public.finish_lifecycle_delivery(UUID),public.lifecycle_delivery_status() TO service_role;
SELECT public.set_lifecycle_delivery('deletion_intake',false,'Invocation lease rollout requires verified runtime');
SELECT public.set_lifecycle_delivery('deletion_reconcile',false,'Invocation lease rollout requires verified runtime');
SELECT public.set_lifecycle_delivery('provider_processing',false,'Invocation lease rollout requires verified runtime');
COMMIT;
