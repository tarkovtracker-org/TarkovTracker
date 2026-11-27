create table public.season_two_modifier_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  modifier_ids text[] not null,
  constraint season_two_modifier_plan_size check (
    case when coalesce(array_ndims(modifier_ids), 1) = 1 then
      cardinality(modifier_ids) <= 256
      and octet_length(array_to_string(modifier_ids, '')) <= 65536
      and array_position(modifier_ids, null) is null
    else false end
  )
);

alter table public.season_two_modifier_plans enable row level security;
revoke all on public.season_two_modifier_plans from public, anon, authenticated, service_role;
grant select, insert, update on public.season_two_modifier_plans to authenticated;

create policy "Read own Season 2 modifier plan" on public.season_two_modifier_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Insert own Season 2 modifier plan" on public.season_two_modifier_plans
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own Season 2 modifier plan" on public.season_two_modifier_plans
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
