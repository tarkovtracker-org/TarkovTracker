-- Schema only: history is collected lazily; no existing account is rewritten or deleted here.
ALTER TABLE public.supporters
  ADD COLUMN last_contribution_at timestamptz,
  ADD COLUMN subscription_ended_at timestamptz,
  ADD COLUMN retention_history_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN supporter_disqualified_at timestamptz;

-- Billing evidence can arrive before the first supporter row. Retain the customer-level denial.
CREATE TABLE private.supporter_chargebacks (
  customer_id text PRIMARY KEY CHECK (length(customer_id) BETWEEN 4 AND 128),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  disqualified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX supporter_chargebacks_user_id_idx ON private.supporter_chargebacks(user_id);
ALTER TABLE private.supporter_chargebacks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.supporter_chargebacks FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.disqualify_supporter_customer(p_customer_id text, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_customer_id IS NULL OR length(p_customer_id) NOT BETWEEN 4 AND 128 THEN
    RAISE EXCEPTION 'Invalid Stripe customer reference';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext(p_customer_id));
  INSERT INTO private.supporter_chargebacks(customer_id, user_id)
    VALUES (p_customer_id, (SELECT id FROM auth.users WHERE id = p_user_id))
    ON CONFLICT (customer_id) DO UPDATE SET
      user_id = coalesce(supporter_chargebacks.user_id, EXCLUDED.user_id);
  UPDATE public.supporters SET supporter_disqualified_at =
    (SELECT disqualified_at FROM private.supporter_chargebacks WHERE customer_id = p_customer_id)
    WHERE stripe_customer_id = p_customer_id OR user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.disqualify_supporter_customer(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_supporter_customer(text, uuid) TO service_role;

-- Customerless historical payments still carry an authenticated account reference.
CREATE FUNCTION public.disqualify_supporter_account(p_user_id uuid, p_charge_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_user_id IS NULL OR p_charge_id IS NULL OR length(p_charge_id) NOT BETWEEN 4 AND 100 THEN
    RAISE EXCEPTION 'Invalid account chargeback reference';
  END IF;
  PERFORM public.disqualify_supporter_customer('charge:' || p_charge_id, p_user_id);
END;
$$;
REVOKE ALL ON FUNCTION public.disqualify_supporter_account(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.disqualify_supporter_account(uuid, text) TO service_role;

CREATE FUNCTION public.supporter_benefits_disqualified(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM private.supporter_chargebacks WHERE user_id = p_user_id)
    OR EXISTS (SELECT 1 FROM public.supporters
      WHERE user_id = p_user_id AND supporter_disqualified_at IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.supporter_benefits_disqualified(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supporter_benefits_disqualified(uuid) TO service_role;

CREATE TABLE private.account_retention (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_active_at timestamptz,
  pending_since timestamptz,
  last_attempt_at timestamptz,
  last_error text
);
ALTER TABLE private.account_retention ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.account_retention FROM PUBLIC, anon, authenticated;

-- Serializes heartbeat/billing writes against the final Auth deletion, including first inserts.
CREATE FUNCTION public.record_account_activity(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  INSERT INTO private.account_retention(user_id, last_active_at)
  VALUES (p_user_id, clock_timestamp())
  ON CONFLICT (user_id) DO UPDATE SET
    last_active_at = clock_timestamp(), pending_since = NULL, last_error = NULL
  WHERE account_retention.last_active_at IS NULL
    OR account_retention.last_active_at < clock_timestamp() - interval '1 day'
    OR account_retention.pending_since IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_account_activity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_account_activity(uuid) TO service_role;

CREATE FUNCTION private.track_account_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.record_account_activity(NEW.user_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_progress_activity AFTER INSERT OR UPDATE OF progress_data
  ON public.user_game_mode_progress FOR EACH ROW
  WHEN (pg_trigger_depth() < 2) EXECUTE FUNCTION private.track_account_mutation();
CREATE TRIGGER retain_preferences_activity AFTER INSERT OR UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION private.track_account_mutation();
CREATE TRIGGER retain_archive_activity AFTER INSERT ON public.user_prestige_runs
  FOR EACH ROW EXECUTE FUNCTION private.track_account_mutation();

CREATE FUNCTION private.track_account_sign_in()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.last_sign_in_at IS DISTINCT FROM OLD.last_sign_in_at THEN
    PERFORM public.record_account_activity(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_sign_in_activity AFTER UPDATE OF last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION private.track_account_sign_in();

-- API accounting is asynchronous and has no Auth FK. Fence late counters against deletion.
CREATE FUNCTION private.guard_api_activity_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM auth.users WHERE id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_api_owner BEFORE INSERT OR UPDATE ON public.api_usage_daily
  FOR EACH ROW EXECUTE FUNCTION private.guard_api_activity_owner();

-- Reuse existing API accounting. Quota-admitted authenticated requests count conservatively as
-- activity, even if a later handler rejects their input. Throttled-only requests do not count.
CREATE FUNCTION private.track_api_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.reads + NEW.writes > 0 THEN PERFORM public.record_account_activity(NEW.user_id); END IF;
  ELSIF NEW.reads > OLD.reads OR NEW.writes > OLD.writes THEN
    PERFORM public.record_account_activity(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_api_activity AFTER INSERT OR UPDATE ON public.api_usage_daily
  FOR EACH ROW EXECUTE FUNCTION private.track_api_activity();

-- Dates are durable evidence, not an independent entitlement: verified has_ever_supported=false
-- following a full refund/chargeback always overrides old payment and subscription-end dates.
CREATE FUNCTION private.prepare_supporter_retention()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.stripe_customer_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('supporter-chargeback'), hashtext(NEW.stripe_customer_id));
  END IF;
  PERFORM 1 FROM auth.users WHERE id = NEW.user_id FOR UPDATE;
  NEW.supporter_disqualified_at := coalesce(NEW.supporter_disqualified_at,
    (SELECT min(disqualified_at) FROM private.supporter_chargebacks
      WHERE customer_id = NEW.stripe_customer_id OR user_id = NEW.user_id));
  IF TG_OP = 'UPDATE' THEN
    NEW.supporter_disqualified_at := coalesce(OLD.supporter_disqualified_at, NEW.supporter_disqualified_at);
    NEW.last_contribution_at := greatest(OLD.last_contribution_at, NEW.last_contribution_at);
    NEW.subscription_ended_at := greatest(OLD.subscription_ended_at, NEW.subscription_ended_at);
  END IF;
  IF NEW.supporter_disqualified_at IS NOT NULL THEN
    NEW.has_ever_supported := false;
    NEW.retention_history_verified := true;
    NEW.status := 'cancelled';
    NEW.expires_at := coalesce(NEW.supporter_disqualified_at, clock_timestamp());
  END IF;
  IF NEW.last_contribution_at > clock_timestamp() OR NEW.subscription_ended_at > clock_timestamp() THEN
    RAISE EXCEPTION 'Retention evidence cannot be in the future';
  END IF;
  IF NEW.has_ever_supported AND NEW.supporter_disqualified_at IS NULL THEN
    UPDATE private.account_retention SET pending_since = NULL WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_supporter_evidence BEFORE INSERT OR UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION private.prepare_supporter_retention();

-- Preserve historical activity before short-lived API/session telemetry is pruned.
CREATE FUNCTION private.account_last_activity(p_user_id uuid)
RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
      greatest(u.created_at, u.last_sign_in_at, r.last_active_at,
        (SELECT max(updated_at) FROM public.user_progress WHERE user_id = u.id),
        (SELECT max(updated_at) FROM public.user_game_mode_progress WHERE user_id = u.id),
        (SELECT max(updated_at) FROM public.user_preferences WHERE user_id = u.id),
        (SELECT max(created_at) FROM public.user_prestige_runs WHERE user_id = u.id),
        (SELECT max(last_seen_at) FROM public.account_ip_audit WHERE user_id = u.id),
        (SELECT max(updated_at) FROM public.api_usage_daily
          WHERE user_id = u.id AND reads + writes > 0),
        (SELECT max(greatest(created_at, updated_at, refreshed_at AT TIME ZONE 'UTC'))
          FROM auth.sessions WHERE user_id = u.id)
      )
  FROM auth.users u LEFT JOIN private.account_retention r ON r.user_id = u.id
  WHERE u.id = p_user_id;
$$;
CREATE FUNCTION private.snapshot_account_activity()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO private.account_retention(user_id, last_active_at)
  SELECT u.id, private.account_last_activity(u.id) FROM auth.users u
  ON CONFLICT (user_id) DO UPDATE SET
    last_active_at = greatest(account_retention.last_active_at, EXCLUDED.last_active_at),
    pending_since = CASE WHEN EXCLUDED.last_active_at > account_retention.pending_since
      THEN NULL ELSE account_retention.pending_since END
  WHERE account_retention.last_active_at IS DISTINCT FROM
    greatest(account_retention.last_active_at, EXCLUDED.last_active_at)
    OR EXCLUDED.last_active_at > account_retention.pending_since;
$$;

-- A single eligibility owner for reporting, collection, and the final locked deletion check.
CREATE FUNCTION private.account_retention_deadline(p_user_id uuid)
RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  WITH evidence AS (
    SELECT u.id, s.user_id AS supporter_id, s.has_ever_supported, s.retention_history_verified,
      s.type, s.status, s.expires_at, s.supporter_disqualified_at,
      private.account_last_activity(u.id) AS last_activity,
      greatest(s.last_contribution_at,
        CASE WHEN s.has_ever_supported AND s.last_contribution_at IS NULL THEN s.updated_at END,
        s.subscription_ended_at,
        CASE WHEN s.has_ever_supported AND s.type = 'subscription' AND s.status <> 'active'
          THEN greatest(s.expires_at,
            CASE WHEN s.subscription_ended_at IS NULL THEN s.updated_at END) END
      ) AS support_anchor
    FROM auth.users u
    LEFT JOIN public.supporters s ON s.user_id = u.id
    LEFT JOIN private.account_retention r ON r.user_id = u.id
    WHERE u.id = p_user_id AND u.deleted_at IS NULL
  )
  SELECT CASE
    WHEN supporter_disqualified_at IS NOT NULL THEN last_activity + interval '6 months'
    WHEN (has_ever_supported OR NOT retention_history_verified)
      AND type = 'subscription' AND (status = 'active'
      OR (status = 'past_due' AND (expires_at IS NULL OR expires_at > clock_timestamp()))) THEN NULL
    -- Unknown legacy payment history cannot be treated as proof of never supporting.
    WHEN supporter_id IS NOT NULL AND NOT has_ever_supported AND NOT retention_history_verified THEN NULL
    WHEN last_activity IS NULL THEN NULL
    WHEN has_ever_supported THEN greatest(last_activity, support_anchor) + interval '1 year'
    ELSE last_activity + interval '6 months'
  END FROM evidence;
$$;

CREATE FUNCTION private.prepare_inactive_account_teams(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_team record; v_successor uuid;
BEGIN
  FOR v_team IN SELECT id FROM public.teams WHERE owner_id = p_user_id ORDER BY id FOR UPDATE LOOP
    SELECT user_id INTO v_successor FROM public.team_memberships
      WHERE team_id = v_team.id AND user_id <> p_user_id ORDER BY joined_at, user_id LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      PERFORM public.transfer_team_ownership(v_team.id, p_user_id, v_successor);
    END IF;
    -- Empty owned teams are removed by the Auth FK cascade; populated teams retain their data.
  END LOOP;
END;
$$;

CREATE FUNCTION private.delete_inactive_account(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_claim record; v_pending timestamptz; v_deadline timestamptz;
BEGIN
  -- Each activity/billing writer takes this same account lock before recording evidence.
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT pending_since INTO v_pending FROM private.account_retention WHERE user_id = p_user_id FOR UPDATE;
  v_deadline := private.account_retention_deadline(p_user_id);
  IF v_deadline IS NULL OR v_deadline >= clock_timestamp()
    OR v_pending IS NULL OR v_pending > clock_timestamp() - interval '30 days' THEN RETURN false; END IF;
  -- Storage bytes must be removed through the Storage API; never orphan objects with SQL deletion.
  IF EXISTS (SELECT 1 FROM storage.objects WHERE owner_id = p_user_id::text)
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE owner_id = p_user_id::text) THEN RETURN false; END IF;
  -- Do not steal a user-requested deletion or revive dead-lettered work.
  IF EXISTS (SELECT 1 FROM public.account_deletion_jobs WHERE user_id = p_user_id) THEN RETURN false; END IF;
  SELECT * INTO v_claim FROM public.claim_account_deletion_job(p_user_id, true);
  IF NOT COALESCE(v_claim.claimed, false) THEN RETURN false; END IF;
  PERFORM private.prepare_inactive_account_teams(p_user_id);
  DELETE FROM public.team_events WHERE initiated_by = p_user_id OR target_user = p_user_id;
  DELETE FROM public.api_usage_daily WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  UPDATE public.account_deletion_jobs SET status = 'completed', completed_at = clock_timestamp(),
    updated_at = clock_timestamp(), next_run_at = NULL, claim_token = NULL,
    last_error_details = jsonb_build_object('reason', 'inactivity')
  WHERE user_id = p_user_id AND claim_token = v_claim.claim_token;
  RETURN true;
END;
$$;

-- No secrets, HTTP callbacks, or separate deletion worker: each account is removed transactionally
-- using the existing claim/fencing audit. A failed account rolls back completely and retries weekly.
CREATE FUNCTION private.run_inactive_account_cleanup(p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_user record; v_pending timestamptz; v_deleted integer := 0; v_queued integer := 0;
  v_failed integer := 0; v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('inactive-account-cleanup')) THEN
    RETURN jsonb_build_object('skipped', 'already_running');
  END IF;
  FOR v_user IN
    SELECT u.id FROM auth.users u
    LEFT JOIN private.account_retention r ON r.user_id = u.id
    WHERE private.account_retention_deadline(u.id) < clock_timestamp()
      AND NOT EXISTS (SELECT 1 FROM public.account_deletion_jobs j WHERE j.user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.owner_id = u.id::text)
      AND NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.owner_id = u.id::text)
    ORDER BY r.last_attempt_at NULLS FIRST, u.created_at, u.id LIMIT v_limit
  LOOP
    BEGIN
      PERFORM 1 FROM auth.users WHERE id = v_user.id FOR UPDATE;
      IF private.account_retention_deadline(v_user.id) < clock_timestamp() THEN
        INSERT INTO private.account_retention(user_id, pending_since) VALUES (v_user.id, clock_timestamp())
          ON CONFLICT (user_id) DO UPDATE SET pending_since = coalesce(account_retention.pending_since, EXCLUDED.pending_since);
        SELECT pending_since INTO v_pending FROM private.account_retention WHERE user_id = v_user.id;
        IF v_pending > clock_timestamp() - interval '30 days' THEN
          v_queued := v_queued + 1;
        ELSIF private.delete_inactive_account(v_user.id) THEN
          v_deleted := v_deleted + 1;
        END IF;
      ELSE
        UPDATE private.account_retention SET pending_since = NULL WHERE user_id = v_user.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      INSERT INTO private.account_retention(user_id, last_attempt_at, last_error)
        VALUES (v_user.id, clock_timestamp(), SQLSTATE)
        ON CONFLICT (user_id) DO UPDATE SET last_attempt_at = EXCLUDED.last_attempt_at, last_error = EXCLUDED.last_error;
    END;
  END LOOP;
  RETURN jsonb_build_object('queued', v_queued, 'deleted', v_deleted, 'failed', v_failed);
END;
$$;

REVOKE ALL ON FUNCTION private.track_account_mutation(), private.track_account_sign_in(),
  private.track_api_activity(), private.guard_api_activity_owner(), private.prepare_supporter_retention(),
  private.account_last_activity(uuid), private.snapshot_account_activity(),
  private.account_retention_deadline(uuid), private.prepare_inactive_account_teams(uuid),
  private.delete_inactive_account(uuid), private.run_inactive_account_cleanup(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.snapshot_account_activity(), private.account_retention_deadline(uuid),
  private.run_inactive_account_cleanup(integer) TO service_role;

-- Applying this migration installs the schedule; production apply is a separately approved action.
SELECT cron.schedule('inactive-account-cleanup', '45 3 * * 0',
  'SELECT private.run_inactive_account_cleanup(100)');

-- Capture legacy evidence daily, before 180-day API usage retention removes its source.
SELECT cron.schedule('account-activity-snapshot', '15 2 * * *',
  'SELECT private.snapshot_account_activity()');
