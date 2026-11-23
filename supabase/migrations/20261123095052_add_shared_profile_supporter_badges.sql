alter table public.user_preferences
  add column show_supporter_badge boolean not null default false;

create view public.shared_profile_supporter_badges
with (security_invoker = true)
as
select
  progress.user_id,
  progress.game_mode,
  progress.season_number,
  case
    when supporter.type = 'subscription'
      and supporter.status = 'active'
      and supporter.stripe_subscription_id <> ''
      and (supporter.expires_at is null or supporter.expires_at > now())
      then 'active_subscriber'
    else 'supporter'
  end as badge
from public.user_game_mode_progress as progress
join public.user_preferences as preferences on preferences.user_id = progress.user_id
join public.supporters as supporter on supporter.user_id = progress.user_id
where progress.profile_public
  and preferences.show_supporter_badge
  and preferences.streamer_mode is not true
  and supporter.has_ever_supported
  and supporter.supporter_disqualified_at is null;

revoke all on public.shared_profile_supporter_badges
  from public, anon, authenticated, service_role;
grant select on public.shared_profile_supporter_badges to service_role;
