alter table public.profile_handles add column renamed_at timestamptz;

create function private.enforce_profile_handle_rename_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.renamed_at > statement_timestamp() - interval '720 hours' then
    raise sqlstate 'PT429' using message = 'Profile handle rename cooldown is active';
  end if;

  new.renamed_at := statement_timestamp();
  return new;
end;
$$;

revoke execute on function private.enforce_profile_handle_rename_cooldown()
  from public, anon, authenticated, service_role;

create trigger profile_handle_rename_cooldown
  before update of handle on public.profile_handles
  for each row when (old.handle is distinct from new.handle)
  execute function private.enforce_profile_handle_rename_cooldown();

grant update (handle) on public.profile_handles to authenticated;

create policy "Rename own profile handle" on public.profile_handles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
