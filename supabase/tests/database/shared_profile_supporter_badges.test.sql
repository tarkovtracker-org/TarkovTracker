BEGIN;
SELECT plan(14);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000661', 'badge-owner@example.invalid'),
  ('00000000-0000-4000-8000-000000000662', 'badge-other@example.invalid');
INSERT INTO public.user_preferences (user_id, streamer_mode) VALUES
  ('00000000-0000-4000-8000-000000000661', false),
  ('00000000-0000-4000-8000-000000000662', false);
INSERT INTO public.user_game_mode_progress (user_id, game_mode, season_number, profile_public)
VALUES
  ('00000000-0000-4000-8000-000000000661', 'pvp', 0, true),
  ('00000000-0000-4000-8000-000000000661', 'pve', 0, false);
INSERT INTO public.supporters (user_id, type, status, has_ever_supported, stripe_subscription_id, expires_at)
VALUES ('00000000-0000-4000-8000-000000000661', 'subscription', 'active', true,
  'sub_profile_badge', now() + interval '1 day');

SELECT ok(NOT has_table_privilege('anon', 'public.shared_profile_supporter_badges', 'SELECT'),
  'anonymous users cannot list supporter badges');
SELECT ok(NOT has_table_privilege('authenticated', 'public.shared_profile_supporter_badges', 'SELECT'),
  'signed-in users cannot list supporter badges');
SET LOCAL ROLE service_role;
SELECT is((SELECT count(*) FROM public.shared_profile_supporter_badges), 0::bigint,
  'badge sharing defaults to off for existing accounts');
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000662';
WITH updated AS (
  UPDATE public.user_preferences SET show_supporter_badge = true
  WHERE user_id = '00000000-0000-4000-8000-000000000661' RETURNING user_id
)
SELECT is((SELECT count(*) FROM updated), 0::bigint, 'only the owner can opt in');
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-000000000661';
SELECT lives_ok($$UPDATE public.user_preferences SET show_supporter_badge = true
  WHERE user_id = auth.uid()$$, 'the owner can enable the badge');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT is((SELECT badge FROM public.shared_profile_supporter_badges WHERE game_mode = 'pvp'),
  'active_subscriber', 'a paid active subscription earns the subscriber badge');
SELECT is((SELECT count(*) FROM public.shared_profile_supporter_badges WHERE game_mode = 'pve'),
  0::bigint, 'private modes expose no badge');
RESET ROLE;

UPDATE public.supporters SET expires_at = now() - interval '1 second'
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT badge FROM public.shared_profile_supporter_badges), 'supporter',
  'expired subscribers keep the supporter badge');
UPDATE public.supporters SET type = 'one_time', status = 'active', stripe_subscription_id = NULL
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT badge FROM public.shared_profile_supporter_badges), 'supporter',
  'a one-time supporter earns the supporter badge');
UPDATE public.supporters SET type = 'subscription', expires_at = NULL
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT badge FROM public.shared_profile_supporter_badges), 'supporter',
  'manual supporter access is not mistaken for a paid subscription');
UPDATE public.supporters SET stripe_subscription_id = 'sub_profile_badge', status = 'past_due',
  expires_at = now() + interval '1 day'
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT badge FROM public.shared_profile_supporter_badges), 'supporter',
  'a past-due subscription retains only the supporter badge');
UPDATE public.user_preferences SET streamer_mode = true
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT count(*) FROM public.shared_profile_supporter_badges), 0::bigint,
  'Streamer Mode removes the public badge');
UPDATE public.user_preferences SET streamer_mode = false, show_supporter_badge = false
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT count(*) FROM public.shared_profile_supporter_badges), 0::bigint,
  'opting out removes the public badge');
UPDATE public.user_preferences SET show_supporter_badge = true
WHERE user_id = '00000000-0000-4000-8000-000000000661';
UPDATE public.supporters SET supporter_disqualified_at = now()
WHERE user_id = '00000000-0000-4000-8000-000000000661';
SELECT is((SELECT count(*) FROM public.shared_profile_supporter_badges), 0::bigint,
  'disqualified support earns no public badge');

SELECT * FROM finish();
ROLLBACK;
