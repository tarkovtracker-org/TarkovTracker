BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE private.billing_generations(user_id UUID PRIMARY KEY,generation BIGINT NOT NULL DEFAULT 0);
CREATE TABLE private.final_billing_verifications(
 user_id UUID PRIMARY KEY,
 token UUID NOT NULL DEFAULT gen_random_uuid(),
 deletion_generation UUID NOT NULL,
 claim_token UUID NOT NULL,
 billing_generation BIGINT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('checking','clear','blocked','consumed')),
 expires_at TIMESTAMPTZ NOT NULL,
 started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 verified_at TIMESTAMPTZ
);
ALTER TABLE private.billing_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.final_billing_verifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.billing_generations,private.final_billing_verifications FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.invalidate_billing_verification(p_user UUID) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_user IS NULL THEN RETURN; END IF;
 PERFORM private.lifecycle_user_lock(p_user);
 INSERT INTO private.billing_generations(user_id,generation) VALUES(p_user,1)
 ON CONFLICT(user_id) DO UPDATE SET generation=private.billing_generations.generation+1;
 UPDATE private.final_billing_verifications SET state='blocked' WHERE user_id=p_user;
END; $$;
REVOKE ALL ON FUNCTION private.invalidate_billing_verification(UUID) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.advance_billing_generation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE uid UUID;
BEGIN
 uid:=CASE WHEN TG_OP='DELETE' THEN OLD.user_id ELSE NEW.user_id END;
 PERFORM private.invalidate_billing_verification(uid);
 IF TG_OP='UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
  PERFORM private.invalidate_billing_verification(OLD.user_id);
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER billing_initiation_generation AFTER INSERT OR UPDATE OR DELETE ON private.provider_initiations
 FOR EACH ROW EXECUTE FUNCTION private.advance_billing_generation();
CREATE TRIGGER billing_asset_generation AFTER INSERT OR UPDATE OR DELETE ON private.provider_assets
 FOR EACH ROW EXECUTE FUNCTION private.advance_billing_generation();
CREATE TRIGGER billing_supporter_generation AFTER INSERT OR UPDATE OF stripe_customer_id,stripe_subscription_id OR DELETE ON public.supporters
 FOR EACH ROW EXECUTE FUNCTION private.advance_billing_generation();

CREATE TRIGGER billing_work_insert AFTER INSERT ON private.lifecycle_work
 FOR EACH ROW WHEN (NEW.kind IN ('stripe_event','stripe_cleanup','operator_review')) EXECUTE FUNCTION private.advance_billing_generation();
CREATE TRIGGER billing_work_update AFTER UPDATE ON private.lifecycle_work
 FOR EACH ROW WHEN (NEW.kind IN ('stripe_event','stripe_cleanup','operator_review')) EXECUTE FUNCTION private.advance_billing_generation();

DO $$ DECLARE object TEXT; BEGIN
 FOREACH object IN ARRAY ARRAY['billing_generations','final_billing_verifications'] LOOP
  EXECUTE format('CREATE TRIGGER fence_delivery_before BEFORE INSERT OR UPDATE OR DELETE ON private.%I FOR EACH ROW EXECUTE FUNCTION private.fence_delivery_write()',object);
  EXECUTE format('CREATE CONSTRAINT TRIGGER fence_delivery_commit AFTER INSERT OR UPDATE OR DELETE ON private.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.fence_delivery_write()',object);
 END LOOP;
END $$;

CREATE FUNCTION private.guard_final_billing_initiation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM private.lifecycle_user_lock(NEW.user_id);
 IF EXISTS(SELECT 1 FROM private.final_billing_verifications WHERE user_id=NEW.user_id
 AND state IN ('checking','clear') AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'Final billing verification in progress' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER guard_final_billing_initiation BEFORE INSERT ON private.provider_initiations
 FOR EACH ROW EXECUTE FUNCTION private.guard_final_billing_initiation();

-- Withdrawal revokes deletion-specific work from older generations. Keep that
-- evidence, while enforcing current-generation and standalone obligations.
CREATE FUNCTION private.billing_work_pending(p_user UUID) RETURNS BOOLEAN
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM private.lifecycle_work w
 WHERE w.user_id=p_user AND w.kind IN ('stripe_event','stripe_cleanup','operator_review') AND w.state<>'completed'
 AND (w.dedupe_key NOT LIKE 'deletion:%' OR w.generation IS NULL OR w.generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id=p_user)));
$$;
REVOKE ALL ON FUNCTION private.billing_work_pending(UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.billing_verification_valid(p_user UUID,p_claim UUID) RETURNS BOOLEAN
LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT private.billing_application_horizon_elapsed() AND EXISTS(
 SELECT 1 FROM private.final_billing_verifications v
 JOIN private.lifecycle_requests r ON r.user_id=v.user_id AND r.generation=v.deletion_generation
 JOIN public.account_deletion_jobs j ON j.user_id=v.user_id AND j.claim_token=v.claim_token
 LEFT JOIN private.billing_generations b ON b.user_id=v.user_id
 WHERE v.user_id=p_user AND v.claim_token=p_claim AND v.state='clear' AND v.expires_at>clock_timestamp()
 AND v.billing_generation=COALESCE(b.generation,0) AND r.state<>'cancelled'
 AND j.status='in_progress' AND j.updated_at>clock_timestamp()-INTERVAL '15 minutes')
 AND NOT EXISTS(SELECT 1 FROM private.provider_initiations WHERE user_id=p_user AND state='unresolved')
 AND NOT private.billing_work_pending(p_user);
$$;

CREATE FUNCTION public.begin_final_billing_verification(p_user_id UUID,p_claim_token UUID) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE deletion_id UUID; billing_id BIGINT; nonce UUID; resources JSONB; legacy BOOLEAN;
BEGIN
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','lease_lost'); END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 -- Every new attempt first invalidates any previous CLEAR, including failed HTTP retries.
 UPDATE private.final_billing_verifications SET state='blocked' WHERE user_id=p_user_id;
 SELECT generation INTO deletion_id FROM private.lifecycle_requests WHERE user_id=p_user_id AND state<>'cancelled';
 IF deletion_id IS NULL THEN RETURN jsonb_build_object('status','cancelled'); END IF;
 IF NOT private.billing_application_horizon_elapsed() THEN RETURN jsonb_build_object('status','provider_wait'); END IF;
 IF EXISTS(SELECT 1 FROM private.provider_initiations WHERE user_id=p_user_id AND state='unresolved') OR
 private.billing_work_pending(p_user_id) THEN
  RETURN jsonb_build_object('status','provider_wait');
 END IF;
 SELECT COALESCE(generation,0) INTO billing_id FROM private.billing_generations WHERE user_id=p_user_id;
 INSERT INTO private.final_billing_verifications(user_id,deletion_generation,claim_token,billing_generation,state,expires_at)
 VALUES(p_user_id,deletion_id,p_claim_token,COALESCE(billing_id,0),'checking',clock_timestamp()+INTERVAL '60 seconds')
 ON CONFLICT(user_id) DO UPDATE SET token=gen_random_uuid(),deletion_generation=EXCLUDED.deletion_generation,
 claim_token=EXCLUDED.claim_token,billing_generation=EXCLUDED.billing_generation,state='checking',
 expires_at=EXCLUDED.expires_at,started_at=clock_timestamp(),verified_at=NULL RETURNING token INTO nonce;
 SELECT COALESCE(jsonb_agg(id),'[]'::jsonb) INTO resources FROM (
 SELECT provider_id id FROM private.provider_assets WHERE user_id=p_user_id
 UNION SELECT stripe_customer_id FROM public.supporters WHERE user_id=p_user_id AND stripe_customer_id IS NOT NULL
 UNION SELECT stripe_subscription_id FROM public.supporters WHERE user_id=p_user_id AND stripe_subscription_id IS NOT NULL
 UNION SELECT resource_id FROM private.lifecycle_work WHERE user_id=p_user_id AND kind='stripe_cleanup' AND resource_id IS NOT NULL) known;
 SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND created_at>(SELECT max(confirmed_at) FROM private.billing_application_cutovers)) INTO legacy;
 RETURN jsonb_build_object('status','checking','token',nonce,'resources',resources,'discover_legacy',legacy);
END; $$;

CREATE FUNCTION public.preserve_final_billing_resource(p_user_id UUID,p_claim_token UUID,p_token UUID,p_resource TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 IF p_resource !~ '^(cus|sub)_[A-Za-z0-9_]+$' THEN RETURN FALSE; END IF;
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes' FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 PERFORM 1 FROM private.final_billing_verifications WHERE user_id=p_user_id AND token=p_token
 AND claim_token=p_claim_token AND state='checking' AND expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 INSERT INTO private.provider_assets(user_id,provider_id) VALUES(p_user_id,p_resource) ON CONFLICT DO NOTHING;
 IF FOUND THEN
  PERFORM private.capture_provider_obligation(p_user_id,'stripe_cleanup',p_resource,
   'deletion:'||(SELECT deletion_generation::text FROM private.final_billing_verifications WHERE user_id=p_user_id));
 END IF;
 -- A new resource invalidates the snapshot. Preserve it, then restart through
 -- ordinary provider obligation capture; never declare it cleared here.
 RETURN (SELECT state='checking' FROM private.final_billing_verifications WHERE user_id=p_user_id);
END; $$;
REVOKE ALL ON FUNCTION public.preserve_final_billing_resource(UUID,UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preserve_final_billing_resource(UUID,UUID,UUID,TEXT) TO service_role;

CREATE FUNCTION public.finish_final_billing_verification(p_user_id UUID,p_claim_token UUID,p_token UUID,p_outcome TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes' FOR UPDATE;
 IF NOT FOUND THEN RETURN FALSE; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 UPDATE private.final_billing_verifications v SET state=CASE WHEN p_outcome='clear' THEN 'clear' ELSE 'blocked' END,
 verified_at=clock_timestamp(),expires_at=clock_timestamp()+INTERVAL '30 seconds'
 WHERE v.user_id=p_user_id AND v.token=p_token AND v.claim_token=p_claim_token AND v.state='checking' AND v.expires_at>clock_timestamp()
 AND v.billing_generation=COALESCE((SELECT generation FROM private.billing_generations WHERE user_id=p_user_id),0)
 AND v.deletion_generation=(SELECT generation FROM private.lifecycle_requests WHERE user_id=p_user_id AND state<>'cancelled');
 IF NOT FOUND THEN RETURN FALSE; END IF;
 RETURN p_outcome='clear' AND private.billing_verification_valid(p_user_id,p_claim_token);
END; $$;

-- Keep the reviewed lifecycle implementation private; clients cannot bypass verification.
CREATE FUNCTION public.account_deletion_resume_stage(p_user_id UUID,p_claim_token UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes' FOR UPDATE;
 IF NOT FOUND THEN RETURN 'lease_lost'; END IF;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF NOT EXISTS(SELECT 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id AND claim_token=p_claim_token
 AND status='in_progress' AND updated_at>clock_timestamp()-INTERVAL '15 minutes') THEN RETURN 'lease_lost'; END IF;
 IF EXISTS(SELECT 1 FROM private.lifecycle_requests WHERE user_id=p_user_id
 AND snapshot_captured AND state IN ('prepared','auth_authorized')) THEN RETURN 'auth_delete'; END IF;
 RETURN 'prepare';
END; $$;
REVOKE ALL ON FUNCTION public.account_deletion_resume_stage(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.account_deletion_resume_stage(UUID,UUID) TO service_role;

ALTER FUNCTION public.seal_account_lifecycle(UUID,UUID) SET SCHEMA private;
ALTER FUNCTION public.authorize_account_auth_delete(UUID,UUID) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.seal_account_lifecycle(UUID,UUID),private.authorize_account_auth_delete(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.seal_account_lifecycle(p_user_id UUID,p_claim_token UUID) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
BEGIN
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id FOR UPDATE;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF NOT private.billing_verification_valid(p_user_id,p_claim_token) THEN RETURN 'provider_wait'; END IF;
 RETURN private.seal_account_lifecycle(p_user_id,p_claim_token);
END; $$;
CREATE FUNCTION public.authorize_account_auth_delete(p_user_id UUID,p_claim_token UUID) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET lock_timeout='5s' AS $$
DECLARE allowed BOOLEAN;
BEGIN
 PERFORM 1 FROM public.account_deletion_jobs WHERE user_id=p_user_id FOR UPDATE;
 PERFORM private.lifecycle_user_lock(p_user_id);
 IF NOT private.billing_verification_valid(p_user_id,p_claim_token) THEN RETURN FALSE; END IF;
 allowed:=private.authorize_account_auth_delete(p_user_id,p_claim_token);
 IF allowed THEN UPDATE private.final_billing_verifications SET state='consumed' WHERE user_id=p_user_id; END IF;
 RETURN allowed;
END; $$;

DO $$ DECLARE f RECORD; BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE oid IN (
 'private.advance_billing_generation()'::regprocedure,'private.guard_final_billing_initiation()'::regprocedure,
 'private.billing_verification_valid(uuid,uuid)'::regprocedure,
 'public.begin_final_billing_verification(uuid,uuid)'::regprocedure,'public.finish_final_billing_verification(uuid,uuid,uuid,text)'::regprocedure,
 'public.seal_account_lifecycle(uuid,uuid)'::regprocedure,'public.authorize_account_auth_delete(uuid,uuid)'::regprocedure)
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature); END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.begin_final_billing_verification(UUID,UUID),public.finish_final_billing_verification(UUID,UUID,UUID,TEXT),public.seal_account_lifecycle(UUID,UUID),public.authorize_account_auth_delete(UUID,UUID) TO service_role;
COMMIT;
