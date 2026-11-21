BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'api-activity-owner@example.invalid'),
  ('00000000-0000-0000-0000-00000000a002', 'api-activity-other@example.invalid');
INSERT INTO public.api_tokens (token_id, user_id, token_hash, game_mode) VALUES
  ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a001', 'activity-11', 'pvp'),
  ('00000000-0000-0000-0000-00000000a012', '00000000-0000-0000-0000-00000000a001', 'activity-12', 'pvp'),
  ('00000000-0000-0000-0000-00000000a021', '00000000-0000-0000-0000-00000000a002', 'activity-21', 'pve');

SET LOCAL ROLE service_role;
SELECT public.record_api_request_activity(
  owner_id::UUID, token::UUID, now(), 'GET /progress', 'questsync', 429, 'read', 'throttled',
  1000, 0, (extract(epoch FROM date_trunc('day', now(), 'UTC') + INTERVAL '24 hours') * 1000)::BIGINT
)
FROM (VALUES
  ('00000000-0000-0000-0000-00000000a011', '00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a021', '00000000-0000-0000-0000-00000000a002'),
  ('00000000-0000-0000-0000-00000000a021', '00000000-0000-0000-0000-00000000a001')
) AS samples(token, owner_id);
RESET ROLE;

INSERT INTO private.api_request_activity
  (user_id, token_id, occurred_at, endpoint, client, status, kind, outcome)
SELECT '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a012', age,
  'POST /progress/tasks', NULL, 200, 'write', 'counted'
FROM unnest(ARRAY[now() - INTERVAL '25 hours', now() - INTERVAL '721 hours']) AS age;
INSERT INTO private.api_request_activity
  (user_id, token_id, occurred_at, endpoint, client, status, kind, outcome)
SELECT '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a012', now(),
  'GET /token', 'poller', 304, 'read', 'counted'
FROM generate_series(1, 52);

SELECT ok(NOT has_function_privilege('anon', 'public.get_api_request_activity(text,uuid,text,text,timestamptz,uuid,boolean,text)', 'EXECUTE'),
  'anonymous users cannot call the history RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.record_api_request_activity(uuid,uuid,timestamptz,text,text,integer,text,text,integer,integer,bigint)', 'EXECUTE'),
  'authenticated users cannot forge activity');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a001', true);
SELECT is(public.get_api_request_activity('24h')->'summary'->>'requests', '53',
  'only the caller’s own last 24 hours count');
SELECT is(public.get_api_request_activity('30d')->'summary'->>'requests', '54',
  'the 30-day window includes older history and excludes expired rows');
SELECT is(public.get_api_request_activity(p_token_id => '00000000-0000-0000-0000-00000000a021')->'summary'->>'requests', '0',
  'a foreign token ID cannot expose another account’s history');
SELECT is(public.get_api_request_activity(p_token_id => '00000000-0000-0000-0000-00000000a011')->'summary'->>'requests', '1',
  'a token view selects that token’s requests');
SELECT is(public.get_api_request_activity('30d', p_client => '', p_kind => 'write')->'summary'->>'requests', '1',
  'unidentified clients and quota types can be combined as filters');
SELECT is(public.get_api_request_activity('today', p_endpoint => 'GET /progress', p_client => 'questsync', p_throttle_only => true)->'summary'->>'throttled', '1',
  'endpoint, client, and throttling filters combine');
SELECT is(public.get_api_request_activity(p_throttle_only => true)->'summary'->>'requests', '1',
  'the throttles-only view excludes counted requests');
SELECT is(public.get_api_request_activity(p_token_id => '00000000-0000-0000-0000-00000000a012')->'quota'->0->>'remaining', '0',
  'quota is account-wide even when activity is filtered to a different token');
SELECT is(jsonb_array_length(public.get_api_request_activity()->'requests'), 51,
  'the first page returns at most 50 usable rows and one lookahead row');
WITH first_page AS (SELECT public.get_api_request_activity()->'requests'->49 AS cursor)
SELECT is(jsonb_array_length(public.get_api_request_activity(
  p_before_at => (cursor->>'occurred_at')::TIMESTAMPTZ, p_before_id => (cursor->>'id')::UUID
)->'requests'), 3, 'paging stays stable with many events at exactly the same timestamp')
FROM first_page;
SELECT is((SELECT sum((bucket->>'requests')::INTEGER)
  FROM jsonb_array_elements(public.get_api_request_activity('30d')->'buckets') AS bucket), 54::BIGINT,
  'chart buckets reconcile with the request total');
RESET ROLE;

DELETE FROM public.api_tokens WHERE token_id = '00000000-0000-0000-0000-00000000a011';
SET LOCAL ROLE authenticated;
SELECT is(public.get_api_request_activity(p_token_id => '00000000-0000-0000-0000-00000000a011')->'summary'->>'requests', '1',
  'revoking a token preserves its evidence in account history');

SELECT * FROM finish();
ROLLBACK;
