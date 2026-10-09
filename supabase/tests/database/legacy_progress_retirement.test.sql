BEGIN;
SELECT plan(17);
-- The client-support cutoff removes legacy readers, while the metadata/account clock remains.
SELECT hasnt_column('public','user_progress','pvp_data','legacy PvP storage is absent');
SELECT hasnt_column('public','user_progress','pve_data','legacy PvE storage is absent');
SELECT is(
  (SELECT jsonb_agg(attname::text ORDER BY attname) FROM pg_attribute
    WHERE attrelid='public.user_progress'::regclass AND attnum>0 AND NOT attisdropped),
  '["created_at","current_game_mode","game_edition","metadata_write_id","tarkov_uid","updated_at","user_id"]'::jsonb,
  'all seven account metadata fields remain');
SELECT is(to_regclass('public.team_member_summary'),NULL,'legacy teammate view is retired');
SELECT is(to_regprocedure('public.get_teammate_legacy_progress(uuid,text)'),NULL,
  'legacy teammate RPC is retired');
SELECT is(to_regprocedure('private.backfill_game_mode_progress_range(uuid,uuid)'),NULL,
  'obsolete frozen-progress backfill is retired');
SELECT is(to_regprocedure('private.unmaterialized_mode_progress(uuid,uuid)'),NULL,
  'obsolete backfill completion gate is retired');
SELECT is(to_regprocedure('private.mode_progress_backfill_active()'),NULL,
  'obsolete backfill flag helper is retired');
SELECT is(to_regprocedure('public.populate_user_progress_api_update_history()'),NULL,
  'legacy history trigger helper is retired');
SELECT is(to_regprocedure('public.sanitize_user_progress_row()'),NULL,
  'legacy payload trigger helper is retired');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint WHERE conrelid='public.user_progress'::regclass
    AND confrelid='auth.users'::regclass AND contype='f' AND confdeltype='c'),
  'the account Auth foreign key is retained');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_publication_rel r JOIN pg_publication p ON p.oid=r.prpubid
  WHERE p.pubname='supabase_realtime' AND r.prrelid='public.user_progress'::regclass),
  'account metadata and compatibility clock remain in Realtime');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_progress'::regclass
    AND tgname='set_progress_metadata_write_id' AND tgenabled='O'),
  'metadata echo generation remains enabled');
SELECT throws_ok($$SELECT pvp_data FROM public.user_progress$$,
  '42703','column "pvp_data" does not exist','old column readers explicitly require an update');
SELECT throws_ok($$SELECT public.get_teammate_legacy_progress(
  '00000000-0000-0000-0000-000000001028'::uuid,'pvp'::text)$$,
  '42883',NULL,'old teammate RPC callers explicitly require an update');

INSERT INTO auth.users(id,email)
VALUES ('00000000-0000-0000-0000-000000001088','retired-backfill-flag@example.invalid');
DELETE FROM private.account_retention
WHERE user_id='00000000-0000-0000-0000-000000001088';
INSERT INTO private.account_retention(user_id,last_active_at,pending_since)
VALUES ('00000000-0000-0000-0000-000000001088',now()-interval '2 days',now()-interval '1 day');
SELECT set_config('tarkovtracker.mode_progress_backfill','on',true);
INSERT INTO public.user_game_mode_progress(user_id,game_mode,season_number,progress_data)
VALUES ('00000000-0000-0000-0000-000000001088','pvp',0,
  '{"level":1,"internal_debug":true}'::jsonb);
SELECT ok((SELECT NOT (progress_data ? 'internal_debug') AND progress_updated_at=now()
  FROM public.user_game_mode_progress
  WHERE user_id='00000000-0000-0000-0000-000000001088' AND game_mode='pvp'),
  'the obsolete backfill flag cannot bypass normal sanitization or freshness');
SELECT ok((SELECT pending_since IS NULL AND last_active_at>now()-interval '1 hour'
  FROM private.account_retention WHERE user_id='00000000-0000-0000-0000-000000001088'),
  'the obsolete backfill flag cannot suppress account activity');
SELECT * FROM finish();
ROLLBACK;
