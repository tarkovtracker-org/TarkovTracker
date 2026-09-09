BEGIN;
SELECT plan(5);
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-000000000891', 'progress-dedup@example.invalid');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000891', true);
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":10},"pve":{"level":20},"seasonal":{"level":30}}',
  private.active_season_number());
CREATE TEMP TABLE progress_write_events (relation_name TEXT, mode TEXT);
CREATE FUNCTION pg_temp.record_progress_write() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO progress_write_events VALUES (TG_TABLE_NAME, to_jsonb(NEW)->>'game_mode');
  RETURN NEW;
END;
$$;
CREATE TRIGGER test_record_account_write AFTER UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.record_progress_write();
CREATE TRIGGER test_record_mode_write AFTER UPDATE ON public.user_game_mode_progress
  FOR EACH ROW EXECUTE FUNCTION pg_temp.record_progress_write();
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":10},"pve":{"level":20},"seasonal":{"level":30}}',
  private.active_season_number());
SELECT is((SELECT count(*) FROM progress_write_events), 0::bigint,
  'identical progress does not update rows or invoke timestamp triggers');
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11},"pve":{"level":20},"seasonal":{"level":30}}',
  private.active_season_number());
SELECT is((SELECT count(*) FROM progress_write_events WHERE relation_name = 'user_progress'), 1::bigint,
  'one persistent change updates the legacy mirror once');
SELECT is((SELECT count(*) FROM progress_write_events WHERE mode = 'pvp'), 1::bigint,
  'the RPC does not repeat the legacy trigger normalized write');
SELECT is((SELECT count(*) FROM progress_write_events WHERE mode IN ('pve', 'seasonal')), 0::bigint,
  'unrelated modes do not produce writes');
TRUNCATE progress_write_events;
SELECT public.sync_user_game_mode_progress('pvp', 1, NULL,
  '{"pvp":{"level":11},"pve":{"level":20},"seasonal":{"level":31}}',
  private.active_season_number());
SELECT is((SELECT count(*) FROM progress_write_events), 1::bigint,
  'a seasonal-only change writes only its normalized row');
SELECT * FROM finish();
ROLLBACK;
