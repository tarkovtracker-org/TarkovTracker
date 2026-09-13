SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- No historical receipt conversion, data cleanup or scheduled runner.
CREATE TABLE private.lifecycle_requests (
 user_id UUID PRIMARY KEY,
 generation UUID NOT NULL DEFAULT gen_random_uuid(),
 state TEXT NOT NULL DEFAULT 'requested' CHECK(state IN
 ('requested','provider_wait','sealed','prepared','auth_authorized','completed','cancelled')),
 reason TEXT,
 snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE private.lifecycle_work (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 kind TEXT NOT NULL CHECK(kind IN ('stripe_event','stripe_cleanup','discord_cleanup','operator_review')),
 dedupe_key TEXT NOT NULL,
 user_id UUID,
 generation UUID,
 resource_id TEXT,
 action TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'received' CHECK(state IN
 ('received','processing','retryable','waiting','blocked','completed','dead_letter')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 claim_token UUID,
 lease_until TIMESTAMPTZ,
 available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 error_code TEXT,
 first_failure_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 completed_at TIMESTAMPTZ,
 parent_id UUID REFERENCES private.lifecycle_work(id),
 expected_revision BIGINT,
 UNIQUE(kind,dedupe_key),
 CHECK ((state='processing')=(claim_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK ((state='completed')=(completed_at IS NOT NULL))
);
CREATE INDEX lifecycle_work_due ON private.lifecycle_work(kind,available_at)
 WHERE state IN ('received','retryable','waiting','processing');
CREATE INDEX lifecycle_work_user ON private.lifecycle_work(user_id,generation);
CREATE INDEX lifecycle_work_parent ON private.lifecycle_work(parent_id);
CREATE TABLE private.supporter_lifecycle_revision(user_id UUID PRIMARY KEY,revision BIGINT NOT NULL DEFAULT 0);
ALTER TABLE private.supporter_lifecycle_revision ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.supporter_lifecycle_revision FROM PUBLIC,anon,authenticated,service_role;
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
ALTER TABLE private.lifecycle_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.lifecycle_work ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.provider_initiations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lifecycle_requests,private.lifecycle_work,private.provider_initiations FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE private.provider_assets (
 user_id UUID NOT NULL,provider_id TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(user_id,provider_id)
);
ALTER TABLE private.provider_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.provider_assets FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.lifecycle_user_lock(p_user UUID) RETURNS void
LANGUAGE sql SET search_path='' AS $$ SELECT pg_advisory_xact_lock(784114,hashtext(p_user::text)); $$;

CREATE FUNCTION private.capture_provider_obligation(p_user UUID,p_kind TEXT,p_resource TEXT,p_source TEXT)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE g UUID; covered BOOLEAN;
BEGIN
 PERFORM private.lifecycle_user_lock(p_user);
 SELECT generation INTO g FROM private.lifecycle_requests WHERE user_id=p_user AND state<>'cancelled';
 SELECT EXISTS(SELECT 1 FROM private.lifecycle_requests r JOIN private.lifecycle_work w ON w.user_id=r.user_id AND w.generation=r.generation
 WHERE r.user_id=p_user AND r.state IN ('sealed','prepared','auth_authorized') AND w.kind=p_kind
 AND w.resource_id=p_resource AND w.state='completed' AND w.dedupe_key LIKE 'deletion:%') INTO covered;
 INSERT INTO private.lifecycle_work(kind,dedupe_key,user_id,generation,resource_id,action,state,error_code,completed_at)
 VALUES(p_kind,p_source||':'||COALESCE(p_resource,'unknown'),p_user,g,p_resource,
 CASE WHEN p_kind='discord_cleanup' THEN 'remove_managed_roles' WHEN p_source LIKE 'deletion:%' THEN 'cancel_at_period_end' ELSE 'review_only' END,
 CASE WHEN covered THEN 'completed' WHEN p_resource IS NULL OR (p_kind='stripe_cleanup' AND p_source NOT LIKE 'deletion:%') THEN 'blocked' ELSE 'received' END,
 CASE WHEN p_resource IS NULL THEN 'missing_identifier' END,CASE WHEN covered THEN clock_timestamp() END)
 ON CONFLICT(kind,dedupe_key) DO NOTHING;
END; $$;

-- Public application trigger function already referenced by the supported Auth identity workflow.
-- No managed Auth table/trigger is modified, and no external request is made in a transaction.
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

CREATE FUNCTION private.capture_link_removal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF TG_OP='UPDATE' AND OLD.discord_user_id IS NOT DISTINCT FROM NEW.discord_user_id THEN RETURN NEW; END IF;
 IF OLD.discord_user_id IS NOT NULL THEN
   PERFORM private.capture_provider_obligation(OLD.user_id,'discord_cleanup',OLD.discord_user_id,
     TG_TABLE_NAME||':'||OLD.user_id::text||':'||txid_current()::text);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER capture_discord_link_removal BEFORE DELETE OR UPDATE OF discord_user_id ON public.discord_account_links
 FOR EACH ROW EXECUTE FUNCTION private.capture_link_removal();
CREATE TRIGGER capture_supporter_discord_removal BEFORE DELETE OR UPDATE OF discord_user_id ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.capture_link_removal();

CREATE FUNCTION private.guard_lifecycle_addition() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE u UUID;
BEGIN
 u:=(CASE WHEN TG_TABLE_NAME='teams' THEN to_jsonb(NEW)->>'owner_id' ELSE to_jsonb(NEW)->>'user_id' END)::UUID;
 IF TG_TABLE_NAME='teams' AND TG_OP='UPDATE' AND to_jsonb(OLD)->>'owner_id'=to_jsonb(NEW)->>'owner_id' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='team_memberships' AND TG_OP='UPDATE' AND to_jsonb(NEW)->>'role'<>'owner'
 AND to_jsonb(OLD)->>'user_id'=to_jsonb(NEW)->>'user_id' AND to_jsonb(OLD)->>'team_id'=to_jsonb(NEW)->>'team_id' THEN RETURN NEW; END IF;
 PERFORM private.lifecycle_user_lock(u);
 IF EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=u AND state IN ('sealed','prepared','auth_authorized','completed')) THEN
   RAISE EXCEPTION 'Account deletion preparation has started' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_lifecycle_owner BEFORE INSERT OR UPDATE OF owner_id ON public.teams
 FOR EACH ROW EXECUTE FUNCTION private.guard_lifecycle_addition();
CREATE TRIGGER guard_lifecycle_member BEFORE INSERT OR UPDATE OF role,user_id,team_id ON public.team_memberships
 FOR EACH ROW EXECUTE FUNCTION private.guard_lifecycle_addition();

CREATE FUNCTION public.reserve_provider_initiation(p_user_id UUID,p_operation TEXT,p_fingerprint TEXT,p_customer_id TEXT DEFAULT NULL) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE v UUID; existing private.provider_initiations;
BEGIN
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND state IN ('sealed','prepared','auth_authorized','completed')) THEN
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

CREATE FUNCTION public.request_account_lifecycle(p_user_id UUID,p_restart BOOLEAN DEFAULT FALSE) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE g UUID; r RECORD;
BEGIN
 -- Same order as deletion workers: job row before the per-user barrier.
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id FOR UPDATE;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF p_restart AND EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND state='cancelled') THEN
   -- Only an explicit withdrawal can re-arm this job. Historical jobs have no such request.
   UPDATE public.account_deletion_jobs SET status='pending',claim_token=NULL,next_run_at=clock_timestamp(),
     attempts=0,dead_lettered_at=NULL,updated_at=clock_timestamp()
   WHERE user_id=p_user_id AND status<>'completed';
 END IF;
 INSERT INTO private.lifecycle_requests(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO UPDATE
 SET generation=gen_random_uuid(),state='requested',reason=NULL,snapshot_captured=FALSE
 WHERE lifecycle_requests.state='cancelled' AND p_restart;
 IF EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND state='cancelled') THEN RETURN 'cancelled'; END IF;
 SELECT generation INTO g FROM private.lifecycle_requests WHERE user_id=p_user_id;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) AND
    NOT EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND snapshot_captured) THEN
   UPDATE private.lifecycle_requests SET reason='missing_auth_snapshot_unverified' WHERE user_id=p_user_id;
   RETURN 'operator_review';
 END IF;
 FOR r IN SELECT 'stripe_cleanup' AS kind,v.identifier FROM public.supporters s
 CROSS JOIN LATERAL (VALUES(s.stripe_customer_id),(s.stripe_subscription_id)) v(identifier)
 WHERE s.user_id=p_user_id AND v.identifier IS NOT NULL
 UNION SELECT 'stripe_cleanup',provider_id FROM private.provider_assets WHERE user_id=p_user_id
 UNION SELECT 'discord_cleanup',discord_user_id FROM public.supporters WHERE user_id=p_user_id AND discord_user_id IS NOT NULL
 UNION SELECT 'discord_cleanup',discord_user_id FROM public.discord_account_links WHERE user_id=p_user_id
 UNION SELECT 'discord_cleanup',COALESCE(NULLIF(identity_data->>'provider_id',''),NULLIF(identity_data->>'sub','')) FROM auth.identities WHERE user_id=p_user_id AND provider='discord'
 LOOP PERFORM private.capture_provider_obligation(p_user_id,r.kind,r.identifier,'deletion:'||g::text); END LOOP;
 UPDATE private.lifecycle_requests SET snapshot_captured=TRUE,updated_at=clock_timestamp() WHERE user_id=p_user_id;
 RETURN (SELECT state FROM private.lifecycle_requests WHERE user_id=p_user_id);
END; $$;

CREATE FUNCTION public.seal_account_lifecycle(p_user_id UUID,p_claim_token UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE st TEXT;
BEGIN
 -- This transaction never acquires team rows. Commit the barrier before team preparation.
 UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp() WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 PERFORM public.request_account_lifecycle(p_user_id);
 SELECT state INTO st FROM private.lifecycle_requests WHERE user_id=p_user_id FOR UPDATE;
 IF st IN ('sealed','prepared','auth_authorized','completed') THEN RETURN 'ready'; END IF;
 IF st='cancelled' THEN RETURN 'cancelled'; END IF;
 IF EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND reason='missing_auth_snapshot_unverified') THEN RETURN 'operator_review'; END IF;
 IF EXISTS(SELECT 1 FROM private.provider_initiations WHERE user_id=p_user_id AND state='unresolved') THEN
   UPDATE private.lifecycle_requests SET state='provider_wait',reason='provider_initiation_unresolved' WHERE user_id=p_user_id; RETURN 'provider_wait';
 END IF;
 IF EXISTS(SELECT 1 FROM private.lifecycle_work w WHERE user_id=p_user_id AND state<>'completed'
 AND NOT (kind='discord_cleanup' AND dedupe_key LIKE 'deletion:%' AND resource_id IS NOT NULL)
 AND (dedupe_key NOT LIKE 'deletion:%' OR generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id=p_user_id))) THEN
   UPDATE private.lifecycle_requests SET state='provider_wait',reason='provider_policy_or_work_pending' WHERE user_id=p_user_id; RETURN 'provider_wait';
 END IF;
 UPDATE private.lifecycle_requests SET state='sealed',reason=NULL WHERE user_id=p_user_id;
 RETURN 'ready';
END; $$;

CREATE FUNCTION public.account_lifecycle_status(p_user_id UUID,p_cancel BOOLEAN DEFAULT FALSE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF p_cancel THEN
   IF EXISTS(SELECT 1 FROM private.lifecycle_work WHERE user_id=p_user_id AND state='processing') THEN
     RETURN jsonb_build_object('state','provider_wait','reason','wait_for_inflight_provider_response');
   END IF;
   UPDATE private.lifecycle_requests SET state='cancelled',reason=NULL WHERE user_id=p_user_id AND state IN ('requested','provider_wait');
 END IF;
 RETURN COALESCE((SELECT jsonb_build_object('state',state,'reason',reason,'can_cancel',state IN ('requested','provider_wait') AND NOT EXISTS(SELECT 1 FROM private.lifecycle_work WHERE user_id=p_user_id AND state='processing'))
 FROM private.lifecycle_requests WHERE user_id=p_user_id),jsonb_build_object('state','none'));
END; $$;

CREATE FUNCTION public.prepare_account_deletion(p_user_id UUID,p_claim_token UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE t RECORD; successor UUID;
BEGIN
 UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp() WHERE user_id=p_user_id AND claim_token=p_claim_token AND status='in_progress'
 AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 PERFORM 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND state IN ('sealed','prepared','auth_authorized') FOR UPDATE;
 IF NOT FOUND THEN RETURN 'not_sealed'; END IF;
 FOR t IN SELECT id FROM public.teams WHERE owner_id=p_user_id ORDER BY id FOR UPDATE LOOP
   SELECT m.user_id INTO successor FROM public.team_memberships m WHERE m.team_id=t.id AND m.user_id<>p_user_id
   AND NOT EXISTS(SELECT 1 FROM private.lifecycle_requests l WHERE l.user_id=m.user_id AND l.state IN ('sealed','prepared','auth_authorized','completed'))
   ORDER BY m.joined_at,m.user_id LIMIT 1 FOR UPDATE;
   IF FOUND THEN PERFORM public.transfer_team_ownership(t.id,p_user_id,successor);
   ELSIF EXISTS(SELECT 1 FROM public.team_memberships WHERE team_id=t.id AND user_id<>p_user_id) THEN
     RETURN 'blocked_successor';
   ELSE PERFORM public.disband_team(t.id,p_user_id); END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) THEN RAISE EXCEPTION 'Ownership preparation incomplete'; END IF;
 UPDATE private.lifecycle_requests SET state='prepared' WHERE user_id=p_user_id AND state='sealed';
 RETURN 'ready';
END; $$;
CREATE FUNCTION public.authorize_account_auth_delete(p_user_id UUID,p_claim_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp() WHERE user_id=p_user_id AND claim_token=p_claim_token AND status='in_progress'
 AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) OR
 EXISTS(SELECT 1 FROM private.lifecycle_work w WHERE user_id=p_user_id AND state<>'completed' AND (dedupe_key NOT LIKE 'deletion:%' OR generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id=p_user_id))) OR
 EXISTS(SELECT 1 FROM private.provider_initiations WHERE user_id=p_user_id AND state='unresolved') THEN RETURN FALSE; END IF;
 UPDATE private.lifecycle_requests SET state='auth_authorized' WHERE user_id=p_user_id AND state IN ('prepared','auth_authorized') AND snapshot_captured;
 RETURN FOUND;
END; $$;
CREATE FUNCTION public.finish_account_deletion(p_user_id UUID,p_claim_token UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 UPDATE public.account_deletion_jobs SET updated_at=clock_timestamp() WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id) THEN RETURN 'auth_remaining'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id AND state='auth_authorized') OR
 EXISTS(SELECT 1 FROM private.lifecycle_work w WHERE user_id=p_user_id AND state<>'completed' AND (dedupe_key NOT LIKE 'deletion:%' OR generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id=p_user_id))) OR
 EXISTS(SELECT 1 FROM public.teams WHERE owner_id=p_user_id) THEN RETURN 'blocked'; END IF;
 UPDATE public.account_deletion_jobs SET status='completed',completed_at=clock_timestamp(),updated_at=clock_timestamp(),claim_token=NULL,
 next_run_at=NULL,last_error=NULL,last_error_details=NULL,last_error_at=NULL,dead_lettered_at=NULL
 WHERE user_id=p_user_id AND claim_token=p_claim_token AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 UPDATE private.lifecycle_requests SET state='completed' WHERE user_id=p_user_id;
 RETURN 'completed';
END; $$;

CREATE FUNCTION public.receive_stripe_lifecycle(p_event_id TEXT,p_type TEXT) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v UUID;
BEGIN
 INSERT INTO private.lifecycle_work(kind,dedupe_key,resource_id,action,state,error_code)
 VALUES('stripe_event',p_event_id,p_event_id,p_type,
 CASE WHEN EXISTS(SELECT 1 FROM public.stripe_events WHERE event_id=p_event_id) THEN 'blocked' ELSE 'received' END,
 CASE WHEN EXISTS(SELECT 1 FROM public.stripe_events WHERE event_id=p_event_id) THEN 'legacy_completion_unknown' END) ON CONFLICT(kind,dedupe_key) DO NOTHING;
 SELECT id INTO v FROM private.lifecycle_work WHERE kind='stripe_event' AND dedupe_key=p_event_id;
 RETURN v;
END; $$;
CREATE FUNCTION public.claim_stripe_lifecycle(p_event_id TEXT,p_type TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE w private.lifecycle_work;
BEGIN
 PERFORM public.receive_stripe_lifecycle(p_event_id,p_type);
 SELECT * INTO w FROM private.lifecycle_work WHERE kind='stripe_event' AND dedupe_key=p_event_id FOR UPDATE;
 IF w.state='completed' THEN RETURN jsonb_build_object('state','completed'); END IF;
 IF w.state IN ('blocked','dead_letter') THEN RETURN jsonb_build_object('state','operator_review'); END IF;
 IF w.state='processing' AND w.lease_until>clock_timestamp() THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF w.state='retryable' AND w.available_at>clock_timestamp() THEN RETURN jsonb_build_object('state','busy'); END IF;
 IF w.attempts>=12 OR w.first_failure_at<clock_timestamp()-INTERVAL '24 hours' THEN
   UPDATE private.lifecycle_work SET state='dead_letter',claim_token=NULL,lease_until=NULL WHERE id=w.id;
   RETURN jsonb_build_object('state','operator_review');
 END IF;
 IF w.state='waiting' THEN RETURN jsonb_build_object('state','provider_wait'); END IF;
 UPDATE private.lifecycle_work SET state='processing',claim_token=gen_random_uuid(),lease_until=clock_timestamp()+INTERVAL '2 minutes',attempts=attempts+1,
 expected_revision=NULL,user_id=NULL
 WHERE id=w.id RETURNING * INTO w;
 RETURN jsonb_build_object('state','processing','id',w.id,'token',w.claim_token);
END; $$;
CREATE FUNCTION public.claim_lifecycle_work(p_kind TEXT,p_limit INTEGER DEFAULT 1)
RETURNS SETOF private.lifecycle_work LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE candidate RECORD; claimed private.lifecycle_work;
BEGIN
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
  lease_until=clock_timestamp()+INTERVAL '2 minutes',attempts=w.attempts+1
  WHERE w.id=candidate.id AND ((w.state IN ('received','retryable','waiting') AND w.available_at<=clock_timestamp())
    OR (w.state='processing' AND w.lease_until<clock_timestamp()))
  AND (w.dedupe_key NOT LIKE 'deletion:%' OR EXISTS(SELECT 1 FROM private.lifecycle_requests r
    WHERE r.user_id=w.user_id AND r.generation=w.generation AND r.state<>'cancelled'
    AND (w.kind<>'discord_cleanup' OR r.state IN ('sealed','prepared','auth_authorized'))))
  RETURNING w.* INTO claimed;
  IF FOUND THEN RETURN NEXT claimed; END IF;
 END LOOP;
END; $$;
CREATE FUNCTION public.finish_lifecycle_work(p_id UUID,p_token UUID,p_state TEXT,p_code TEXT DEFAULT NULL,p_retry_seconds INTEGER DEFAULT 60)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE parent UUID; task_user UUID;
BEGIN
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

CREATE FUNCTION private.fence_stripe_supporter_effect() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE h JSONB; work_id UUID; token UUID; expected BIGINT; current_revision BIGINT; uid UUID;
BEGIN
 h:=COALESCE(NULLIF(current_setting('request.headers',TRUE),''),'{}')::JSONB;
 work_id:=(h->>'x-lifecycle-work')::UUID; token:=(h->>'x-lifecycle-claim')::UUID;
 uid:=COALESCE(NEW.user_id,OLD.user_id);
 -- Match claim/completion ordering before locking work or revision rows.
 PERFORM private.lifecycle_user_lock(uid);
 IF work_id IS NOT NULL THEN
   SELECT expected_revision INTO expected FROM private.lifecycle_work WHERE id=work_id AND claim_token=token AND user_id=uid
   AND state='processing' AND lease_until>clock_timestamp() FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Stale lifecycle effect' USING ERRCODE='40001'; END IF;
 END IF;
 INSERT INTO private.supporter_lifecycle_revision(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT revision INTO current_revision FROM private.supporter_lifecycle_revision WHERE user_id=uid FOR UPDATE;
 IF work_id IS NOT NULL AND expected IS DISTINCT FROM current_revision THEN
   RAISE EXCEPTION 'Provider snapshot is stale; refetch' USING ERRCODE='40001';
 END IF;
 UPDATE private.supporter_lifecycle_revision SET revision=revision+1 WHERE user_id=uid;
 IF work_id IS NOT NULL THEN UPDATE private.lifecycle_work SET expected_revision=current_revision+1 WHERE id=work_id; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER fence_stripe_supporter_effect BEFORE INSERT OR UPDATE OR DELETE ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.fence_stripe_supporter_effect();
CREATE FUNCTION public.enqueue_stripe_discord_effect(p_id UUID,p_token UUID,p_user UUID,p_resource TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM 1 FROM private.lifecycle_work WHERE id=p_id AND claim_token=p_token AND state='processing'
 AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Stale lifecycle effect' USING ERRCODE='40001'; END IF;
 IF p_resource IS NULL OR p_user IS NULL THEN RAISE EXCEPTION 'Missing Discord attribution'; END IF;
 INSERT INTO private.lifecycle_work(kind,dedupe_key,user_id,resource_id,action,parent_id)
 VALUES('discord_cleanup','stripe:'||p_id::text||':'||p_resource,p_user,p_resource,'reconcile_current_supporter',p_id)
 ON CONFLICT(kind,dedupe_key) DO NOTHING;
END; $$;
REVOKE ALL ON FUNCTION private.fence_stripe_supporter_effect(),public.enqueue_stripe_discord_effect(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_stripe_discord_effect(UUID,UUID,UUID,TEXT) TO service_role;

-- Service-only wrappers are the complete API; private state has no direct client grants.
CREATE FUNCTION private.guard_provider_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE k TEXT; old_value TEXT; new_value TEXT;
BEGIN
 PERFORM private.lifecycle_user_lock(NEW.user_id);
 FOREACH k IN ARRAY ARRAY['stripe_customer_id','stripe_subscription_id','discord_user_id'] LOOP
   new_value:=to_jsonb(NEW)->>k;
   old_value:=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)->>k END;
   IF new_value IS NOT NULL AND new_value IS DISTINCT FROM old_value AND EXISTS(
      SELECT 1 FROM private.lifecycle_requests WHERE user_id=NEW.user_id AND state IN ('sealed','prepared','auth_authorized','completed')) THEN
     RAISE EXCEPTION 'Provider linkage requires lifecycle reconciliation' USING ERRCODE='55000';
   END IF;
 END LOOP;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_supporter_provider_link BEFORE INSERT OR UPDATE OF stripe_customer_id,stripe_subscription_id,discord_user_id ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.guard_provider_link();
CREATE TRIGGER guard_discord_provider_link BEFORE INSERT OR UPDATE OF discord_user_id ON public.discord_account_links
 FOR EACH ROW EXECUTE FUNCTION private.guard_provider_link();
CREATE FUNCTION private.capture_stripe_removal() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE k TEXT; old_value TEXT;
BEGIN
 FOREACH k IN ARRAY ARRAY['stripe_customer_id','stripe_subscription_id'] LOOP
   old_value:=to_jsonb(OLD)->>k;
   IF old_value IS NOT NULL AND (TG_OP='DELETE' OR old_value IS DISTINCT FROM to_jsonb(NEW)->>k) THEN
     PERFORM private.capture_provider_obligation(OLD.user_id,'stripe_cleanup',old_value,
       'provider_removal:'||OLD.user_id::text||':'||txid_current()::text);
   END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_stripe_provider_removal BEFORE DELETE OR UPDATE OF stripe_customer_id,stripe_subscription_id ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.capture_stripe_removal();

CREATE FUNCTION private.protect_stripe_receipt_retention() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM private.lifecycle_work WHERE kind='stripe_event' AND dedupe_key=OLD.event_id
 AND state='completed' AND completed_at<clock_timestamp()-INTERVAL '90 days') THEN RETURN OLD; END IF;
 -- Legacy rows have no completion proof. Preserve them; never infer replay eligibility.
 RETURN NULL;
END; $$;
CREATE TRIGGER protect_stripe_receipt_retention BEFORE DELETE ON public.stripe_events
 FOR EACH ROW EXECUTE FUNCTION private.protect_stripe_receipt_retention();
REVOKE ALL ON FUNCTION private.guard_provider_link(),private.capture_stripe_removal(),private.protect_stripe_receipt_retention()
 FROM PUBLIC,anon,authenticated,service_role;

DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname IN ('lifecycle_user_lock','capture_provider_obligation','capture_link_removal','guard_lifecycle_addition'))
 OR (n.nspname='public' AND p.proname IN ('delete_discord_account_link','reserve_provider_initiation','record_provider_initiation',
 'request_account_lifecycle','seal_account_lifecycle','account_lifecycle_status','prepare_account_deletion','authorize_account_auth_delete',
 'finish_account_deletion','receive_stripe_lifecycle','claim_stripe_lifecycle','claim_lifecycle_work','finish_lifecycle_work')) LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 IF f.nspname='public' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
 END LOOP;
END $$;

-- Safe status/lease evidence for explicit service workers; contains no provider identifiers.
CREATE FUNCTION public.lifecycle_work_status(p_id UUID,p_token UUID DEFAULT NULL) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('state',state,'valid_claim',
 state='processing' AND claim_token=p_token AND lease_until>clock_timestamp())
 FROM private.lifecycle_work WHERE id=p_id;
$$;
REVOKE ALL ON FUNCTION public.lifecycle_work_status(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_work_status(UUID,UUID) TO service_role;

-- Expected business waiting does not spend the deletion transport/error retry budget.
CREATE FUNCTION public.park_account_lifecycle(p_user_id UUID,p_claim_token UUID,p_reason TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF p_reason NOT IN ('provider_wait','operator_review','blocked_successor','cancelled','provider_pending') THEN
 RAISE EXCEPTION 'Invalid lifecycle waiting reason'; END IF;
 UPDATE public.account_deletion_jobs SET status=CASE WHEN p_reason IN ('provider_wait','provider_pending') THEN 'pending' ELSE 'blocked' END,
 next_run_at=CASE WHEN p_reason IN ('provider_wait','provider_pending') THEN clock_timestamp()+INTERVAL '6 hours' END,
 claim_token=NULL,updated_at=clock_timestamp(),last_error=p_reason
 WHERE user_id=p_user_id AND claim_token=p_claim_token AND status='in_progress'
 AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.park_account_lifecycle(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.park_account_lifecycle(UUID,UUID,TEXT) TO service_role;

-- Historical jobs with no new, explicit lifecycle request remain HOLD and are never listed here.
CREATE FUNCTION public.account_lifecycle_jobs(p_user_id UUID DEFAULT NULL,p_limit INTEGER DEFAULT 25)
RETURNS SETOF public.account_deletion_jobs LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT j.* FROM public.account_deletion_jobs j JOIN private.lifecycle_requests r USING(user_id)
 WHERE (p_user_id IS NULL OR j.user_id=p_user_id) AND r.state<>'cancelled'
 ORDER BY j.next_run_at NULLS LAST,j.user_id LIMIT least(greatest(p_limit,1),25);
$$;
CREATE FUNCTION public.fail_account_lifecycle(p_user_id UUID,p_claim_token UUID,p_reason TEXT,p_stage TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 UPDATE public.account_deletion_jobs SET attempts=attempts+1,
 status=CASE WHEN attempts+1>=max_attempts THEN 'dead_lettered' ELSE 'failed' END,
 next_run_at=CASE WHEN attempts+1<max_attempts THEN clock_timestamp()+make_interval(secs=>least(3600,300*(2^least(attempts,4))::INTEGER)) END,
 last_error=left(p_reason,80),last_error_details=jsonb_build_object('stage',left(p_stage,40)),
 last_error_at=clock_timestamp(),updated_at=clock_timestamp(),claim_token=NULL,
 dead_lettered_at=CASE WHEN attempts+1>=max_attempts THEN clock_timestamp() END
 WHERE user_id=p_user_id AND claim_token=p_claim_token AND status='in_progress'
 AND updated_at>clock_timestamp()-INTERVAL '15 minutes';
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.account_lifecycle_jobs(UUID,INTEGER),public.fail_account_lifecycle(UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.account_lifecycle_jobs(UUID,INTEGER),public.fail_account_lifecycle(UUID,UUID,TEXT,TEXT) TO service_role;

-- An entitlement mutation and its durable Discord obligation commit together, including crash/retry paths.
CREATE FUNCTION private.enqueue_supporter_lifecycle_effect() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE h JSONB; wid UUID; token UUID; uid UUID; did TEXT;
BEGIN
 h:=COALESCE(NULLIF(current_setting('request.headers',TRUE),''),'{}')::JSONB;
 wid:=(h->>'x-lifecycle-work')::UUID;token:=(h->>'x-lifecycle-claim')::UUID;
 IF wid IS NULL THEN RETURN NULL; END IF;
 uid:=COALESCE(NEW.user_id,OLD.user_id);
 FOR did IN SELECT DISTINCT identifier FROM (
   SELECT NEW.discord_user_id AS identifier UNION SELECT OLD.discord_user_id
   UNION SELECT discord_user_id FROM public.discord_account_links WHERE user_id=uid
   UNION SELECT COALESCE(NULLIF(identity_data->>'provider_id',''),NULLIF(identity_data->>'sub','')) FROM auth.identities WHERE user_id=uid AND provider='discord'
 ) identities WHERE identifier IS NOT NULL LOOP
  PERFORM public.enqueue_stripe_discord_effect(wid,token,uid,did);
 END LOOP;
 RETURN NULL;
END; $$;
CREATE TRIGGER enqueue_supporter_lifecycle_effect AFTER INSERT OR UPDATE OR DELETE ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.enqueue_supporter_lifecycle_effect();
REVOKE ALL ON FUNCTION private.enqueue_supporter_lifecycle_effect() FROM PUBLIC,anon,authenticated,service_role;

-- Bind one user revision before fetching the authoritative provider state. Unrelated users never
-- contend on a global epoch. Rebinding a claim cannot refresh a stale provider snapshot.
CREATE FUNCTION public.bind_stripe_lifecycle(p_id UUID,p_token UUID,p_user_id UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE w private.lifecycle_work; r BIGINT;
BEGIN
 SELECT * INTO w FROM private.lifecycle_work WHERE id=p_id AND claim_token=p_token AND state='processing'
 AND kind='stripe_event' AND lease_until>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF w.user_id IS NOT NULL THEN RETURN w.user_id=p_user_id; END IF;
 INSERT INTO private.supporter_lifecycle_revision(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
 SELECT revision INTO r FROM private.supporter_lifecycle_revision WHERE user_id=p_user_id;
 UPDATE private.lifecycle_work SET user_id=p_user_id,expected_revision=r WHERE id=p_id;
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.bind_stripe_lifecycle(UUID,UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bind_stripe_lifecycle(UUID,UUID,UUID) TO service_role;

-- Make the existing trusted billing writer explicit on fresh replay as well as hosted upgrades.
-- No ordinary API role receives new privileges.
GRANT SELECT,INSERT,UPDATE ON public.supporters TO service_role;
GRANT SELECT(user_id,is_admin) ON public.user_system TO service_role;

CREATE FUNCTION public.discord_lifecycle_context(p_id UUID,p_token UUID) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 WITH snapshot AS (
 SELECT w.resource_id,
 EXISTS(SELECT 1 FROM public.discord_account_links l WHERE l.user_id=w.user_id AND l.discord_user_id=w.resource_id)
 OR EXISTS(SELECT 1 FROM auth.identities i WHERE i.user_id=w.user_id AND i.provider='discord'
 AND COALESCE(i.identity_data->>'provider_id',i.identity_data->>'sub')=w.resource_id) AS linked,
 NOT EXISTS(SELECT 1 FROM auth.users WHERE id=w.user_id)
 OR COALESCE(r.state IN ('sealed','prepared','auth_authorized','completed'),FALSE) AS deleting,
 COALESCE(s.status,'expired') AS status,COALESCE(s.tier,'supporter') AS tier,
 COALESCE(s.has_ever_supported,FALSE) AS has_ever_supported,s.expires_at
 FROM private.lifecycle_work w LEFT JOIN public.supporters s ON s.user_id=w.user_id
 LEFT JOIN private.lifecycle_requests r ON r.user_id=w.user_id
 WHERE w.id=p_id AND w.claim_token=p_token AND w.kind='discord_cleanup' AND w.state='processing' AND w.lease_until>clock_timestamp()
 ) SELECT (to_jsonb(snapshot)-'resource_id')||jsonb_build_object('revision',md5(to_jsonb(snapshot)::TEXT)) FROM snapshot;
$$;
REVOKE ALL ON FUNCTION public.discord_lifecycle_context(UUID,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.discord_lifecycle_context(UUID,UUID) TO service_role;

CREATE FUNCTION public.stripe_lifecycle_recovery_candidates(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(event_id TEXT,event_type TEXT) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT resource_id,action FROM private.lifecycle_work WHERE kind='stripe_event'
 AND ((state IN ('received','retryable') AND available_at<=clock_timestamp()) OR (state='processing' AND lease_until<clock_timestamp()))
 ORDER BY available_at,id LIMIT least(greatest(p_limit,1),25);
$$;
REVOKE ALL ON FUNCTION public.stripe_lifecycle_recovery_candidates(INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stripe_lifecycle_recovery_candidates(INTEGER) TO service_role;

CREATE FUNCTION public.provider_initiation_candidates(p_limit INTEGER DEFAULT 10)
RETURNS TABLE(id UUID,user_id UUID,resource_id TEXT) LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT id,user_id,resource_id FROM private.provider_initiations WHERE state='unresolved' AND operation='checkout' AND resource_id IS NOT NULL AND NOT review_required AND next_check_at<=clock_timestamp()
 ORDER BY next_check_at,id LIMIT least(greatest(p_limit,1),25);
$$;
CREATE FUNCTION public.complete_checkout_initiation(p_id UUID,p_session_id TEXT,p_user_id UUID,p_customer_id TEXT,p_subscription_id TEXT,p_status TEXT,p_payment_status TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM private.lifecycle_user_lock(p_user_id);
 PERFORM 1 FROM private.provider_initiations WHERE id=p_id AND user_id=p_user_id AND operation='checkout' AND resource_id=p_session_id AND state='unresolved' FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 IF NOT COALESCE(p_status='expired' OR (p_status='complete' AND p_payment_status IN ('paid','no_payment_required')),FALSE) THEN RETURN FALSE; END IF;
 IF p_customer_id IS NOT NULL THEN INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_customer_id) ON CONFLICT DO NOTHING; END IF;
 IF p_subscription_id IS NOT NULL THEN INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_subscription_id) ON CONFLICT DO NOTHING; END IF;
 UPDATE private.provider_initiations SET state='reconciled' WHERE id=p_id;
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.provider_initiation_candidates(INTEGER),public.complete_checkout_initiation(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provider_initiation_candidates(INTEGER),public.complete_checkout_initiation(UUID,TEXT,UUID,TEXT,TEXT,TEXT,TEXT) TO service_role;

CREATE TABLE private.lifecycle_operator_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),actor_id UUID NOT NULL,resource_id UUID NOT NULL,
 action TEXT NOT NULL,evidence_reference TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE private.lifecycle_operator_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.lifecycle_operator_log FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.review_provider_initiation(p_id UUID,p_actor UUID,p_evidence_reference TEXT,p_provider_ids TEXT[] DEFAULT ARRAY[]::TEXT[],p_no_external_effect BOOLEAN DEFAULT FALSE) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE uid UUID; provider TEXT; known_customer TEXT;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_system WHERE user_id=p_actor AND is_admin) THEN RAISE EXCEPTION 'Operator access required' USING ERRCODE='42501'; END IF;
 IF p_evidence_reference IS NULL OR length(p_evidence_reference) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Restricted evidence reference required'; END IF;
 SELECT user_id,customer_id INTO uid,known_customer FROM private.provider_initiations WHERE id=p_id AND state='unresolved';
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM private.lifecycle_user_lock(uid);
 IF NOT COALESCE(p_no_external_effect,FALSE) AND known_customer IS NULL AND COALESCE(cardinality(p_provider_ids),0)=0 THEN
   RAISE EXCEPTION 'Preserve provider identifiers or explicitly verify no external effect';
 END IF;
 FOREACH provider IN ARRAY COALESCE(p_provider_ids,ARRAY[]::TEXT[]) LOOP
   IF provider !~ '^(cus_|sub_)[A-Za-z0-9]+$' THEN RAISE EXCEPTION 'Invalid provider identifier'; END IF;
   INSERT INTO private.provider_assets(user_id,provider_id) VALUES(uid,provider) ON CONFLICT DO NOTHING;
 END LOOP;
 -- This is an operator evidence decision, never a time-based guess about a portal/session URL.
 UPDATE private.provider_initiations SET state='reconciled' WHERE id=p_id AND state='unresolved';
 IF NOT FOUND THEN RETURN FALSE; END IF;
 INSERT INTO private.lifecycle_operator_log(actor_id,resource_id,action,evidence_reference)
 VALUES(p_actor,p_id,'provider_initiation_verified_resolved',p_evidence_reference);
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.review_provider_initiation(UUID,UUID,TEXT,TEXT[],BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_provider_initiation(UUID,UUID,TEXT,TEXT[],BOOLEAN) TO service_role;

CREATE FUNCTION public.retry_lifecycle_work(p_id UUID,p_actor UUID,p_evidence_reference TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE uid UUID;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.user_system WHERE user_id=p_actor AND is_admin) THEN RAISE EXCEPTION 'Operator access required' USING ERRCODE='42501'; END IF;
 IF p_evidence_reference IS NULL OR length(p_evidence_reference) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Restricted evidence reference required'; END IF;
 SELECT user_id INTO uid FROM private.lifecycle_work WHERE id=p_id;
 IF uid IS NOT NULL THEN PERFORM private.lifecycle_user_lock(uid); END IF;
 UPDATE private.lifecycle_work SET state='received',attempts=0,first_failure_at=NULL,error_code=NULL,available_at=clock_timestamp(),claim_token=NULL,lease_until=NULL
 WHERE id=p_id AND state IN ('blocked','dead_letter') AND error_code IS DISTINCT FROM 'legacy_completion_unknown'
 AND action<>'review_only'
 AND (dedupe_key NOT LIKE 'deletion:%' OR EXISTS(SELECT 1 FROM private.lifecycle_requests r WHERE r.user_id=lifecycle_work.user_id AND r.generation=lifecycle_work.generation AND r.state<>'cancelled'));
 IF NOT FOUND THEN RETURN FALSE; END IF;
 INSERT INTO private.lifecycle_operator_log(actor_id,resource_id,action,evidence_reference) VALUES(p_actor,p_id,'retry_provider_work',p_evidence_reference);
 RETURN TRUE;
END; $$;
REVOKE ALL ON FUNCTION public.retry_lifecycle_work(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retry_lifecycle_work(UUID,UUID,TEXT) TO service_role;

CREATE FUNCTION public.defer_provider_initiation(p_id UUID,p_retryable BOOLEAN,p_error_code TEXT DEFAULT NULL) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 UPDATE private.provider_initiations SET
 review_required=NOT p_retryable OR attempts>=11 OR first_failure_at<clock_timestamp()-INTERVAL '24 hours',
 attempts=attempts+CASE WHEN p_error_code IS NULL THEN 0 ELSE 1 END,
 first_failure_at=CASE WHEN p_error_code IS NULL THEN first_failure_at ELSE COALESCE(first_failure_at,clock_timestamp()) END,
 next_check_at=clock_timestamp()+make_interval(secs=>CASE WHEN p_error_code IS NULL THEN 900 ELSE least(3600,30*power(2,least(attempts,7)))::INTEGER END),
 error_code=p_error_code
 WHERE id=p_id AND state='unresolved';
END; $$;
REVOKE ALL ON FUNCTION public.defer_provider_initiation(UUID,BOOLEAN,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.defer_provider_initiation(UUID,BOOLEAN,TEXT) TO service_role;
