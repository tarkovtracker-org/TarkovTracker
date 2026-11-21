create table public.profile_handles (
  handle text collate "C" primary key,
  user_id uuid unique references auth.users (id) on delete set null default auth.uid(),
  constraint profile_handles_format check (handle ~ '^[a-z0-9_]{3,24}$' and handle ~ '[a-z]'),
  constraint profile_handles_reserved check (
    handle !~ '^(admin|administrator|moderator|mod|staff|support|system|official|tarkovtracker|tarkov_tracker)([0-9_].*)?$'
  ),
  constraint profile_handles_prohibited check (
    handle !~ '(^|_)(nigger|nigga|faggot|retard|kike|chink|spic|nazi)[0-9]*(_|$)'
  )
);

alter table public.profile_handles enable row level security;
revoke all on public.profile_handles from public, anon, authenticated, service_role;
grant select on public.profile_handles to authenticated, service_role;
grant insert (handle, user_id) on public.profile_handles to authenticated;

create policy "Read own profile handle" on public.profile_handles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Claim own profile handle" on public.profile_handles
  for insert to authenticated with check ((select auth.uid()) = user_id);
