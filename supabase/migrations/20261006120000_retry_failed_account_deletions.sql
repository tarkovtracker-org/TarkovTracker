-- PvE and seasonal team references already clear on team deletion. The PvP reference kept the
-- legacy NO ACTION rule, so deleting an empty owned PvP team blocked self-service account deletion.
ALTER TABLE public.user_system DROP CONSTRAINT user_system_team_id_fkey;
ALTER TABLE public.user_system ADD CONSTRAINT user_system_team_id_fkey
  FOREIGN KEY (pvp_team_id) REFERENCES public.teams(id) ON DELETE SET NULL;

-- Finishes one user-requested deletion that failed after its claim. Reuses the inactive-account
-- deletion steps so both paths remove the same data in one transaction.
CREATE FUNCTION private.retry_account_deletion(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_claim record;
BEGIN
  PERFORM 1 FROM auth.users WHERE id = p_user_id FOR UPDATE;
  -- Storage bytes must be removed through the Storage API; never orphan objects with SQL deletion.
  IF EXISTS (SELECT 1 FROM storage.objects WHERE owner_id = p_user_id::text)
    OR EXISTS (SELECT 1 FROM storage.buckets WHERE owner_id = p_user_id::text) THEN RETURN false; END IF;
  -- Never creates a job or revives dead-lettered work; a live lease stays with its owner.
  SELECT * INTO v_claim FROM public.claim_account_deletion_job(p_user_id, false);
  IF NOT COALESCE(v_claim.claimed, false) THEN RETURN false; END IF;
  PERFORM private.prepare_inactive_account_teams(p_user_id);
  DELETE FROM public.team_events WHERE initiated_by = p_user_id OR target_user = p_user_id;
  DELETE FROM public.api_usage_daily WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
  UPDATE public.account_deletion_jobs SET status = 'completed', completed_at = clock_timestamp(),
    updated_at = clock_timestamp(), next_run_at = NULL, last_error = NULL, last_error_at = NULL,
    dead_lettered_at = NULL, claim_token = NULL,
    last_error_details = jsonb_build_object('reason', 'scheduled_retry')
  WHERE user_id = p_user_id AND claim_token = v_claim.claim_token;
  RETURN true;
END;
$$;

-- A failed retry rolls back completely and consumes one attempt, dead-lettering at max_attempts.
-- The rollback also releases the claim, so a fresh in_progress row belongs to another worker and is
-- left untouched; only the restored pre-claim state (due work or an expired lease) is charged.
CREATE FUNCTION private.record_account_deletion_retry_failure(p_user_id uuid, p_error text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.account_deletion_jobs SET
    attempts = attempts + 1,
    status = CASE WHEN attempts + 1 >= max_attempts THEN 'dead_lettered' ELSE 'failed' END,
    dead_lettered_at = CASE WHEN attempts + 1 >= max_attempts THEN clock_timestamp() END,
    next_run_at = CASE WHEN attempts + 1 < max_attempts THEN clock_timestamp() + interval '1 day' END,
    last_error = 'scheduled_retry_failed', last_error_at = clock_timestamp(),
    last_error_details = jsonb_build_object('stage', 'scheduled_retry', 'sqlstate', p_error),
    updated_at = clock_timestamp(), claim_token = NULL
  WHERE user_id = p_user_id AND (status IN ('pending', 'failed')
    OR (status = 'in_progress' AND updated_at <= clock_timestamp() - interval '15 minutes'));
$$;

-- No secrets, HTTP callbacks, or separate deletion worker: due failed jobs and expired leases are
-- retried by the same claim/fencing protocol the account-delete function uses.
CREATE FUNCTION private.run_account_deletion_retries(p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE v_job record; v_completed integer := 0; v_skipped integer := 0; v_failed integer := 0;
  v_unrecorded integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 500);
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('account-deletion-retry')) THEN
    RETURN jsonb_build_object('skipped', 'already_running');
  END IF;
  FOR v_job IN
    SELECT j.user_id FROM public.account_deletion_jobs j
    WHERE ((j.status IN ('pending', 'failed') AND (j.next_run_at IS NULL OR j.next_run_at <= clock_timestamp()))
      OR (j.status = 'in_progress' AND j.updated_at <= clock_timestamp() - interval '15 minutes'))
      -- Storage owners need Storage API cleanup first; never let them fill every batch.
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.owner_id = j.user_id::text)
      AND NOT EXISTS (SELECT 1 FROM storage.buckets b WHERE b.owner_id = j.user_id::text)
    ORDER BY j.next_run_at NULLS FIRST, j.user_id LIMIT v_limit
  LOOP
    BEGIN
      IF private.retry_account_deletion(v_job.user_id) THEN
        v_completed := v_completed + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      BEGIN
        PERFORM private.record_account_deletion_retry_failure(v_job.user_id, SQLSTATE);
      EXCEPTION WHEN OTHERS THEN
        v_unrecorded := v_unrecorded + 1;
        RAISE WARNING 'account deletion retry failure not recorded for %: %', v_job.user_id, SQLSTATE;
      END;
    END;
  END LOOP;
  RETURN jsonb_build_object('completed', v_completed, 'skipped', v_skipped, 'failed', v_failed,
    'unrecorded', v_unrecorded);
END;
$$;

REVOKE ALL ON FUNCTION private.retry_account_deletion(uuid),
  private.record_account_deletion_retry_failure(uuid, text),
  private.run_account_deletion_retries(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.run_account_deletion_retries(integer) TO service_role;

SELECT cron.schedule('account-deletion-retry', '30 4 * * *',
  'SELECT private.run_account_deletion_retries(50)');
