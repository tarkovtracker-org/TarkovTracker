-- Reconcile production schema drift: production was modified directly (dashboard/SQL
-- editor) without matching migrations. This migration brings the migration-defined
-- schema in line with the live production schema so a fresh build reproduces prod.

create extension if not exists "hypopg" with schema "extensions";

create extension if not exists "index_advisor" with schema "extensions";

alter table "public"."team_memberships" drop constraint "team_memberships_team_id_user_id_key";

alter table "public"."team_events" drop constraint "team_events_initiated_by_fkey";

alter table "public"."user_system" drop constraint "user_system_team_id_fkey";

alter table "public"."team_events" drop constraint "team_events_pkey";

alter table "public"."team_memberships" drop constraint "team_memberships_pkey";

drop index if exists "public"."team_memberships_team_id_user_id_key";

drop index if exists "public"."uniq_supporters_stripe_customer";

drop index if exists "public"."uniq_supporters_stripe_subscription";

drop index if exists "public"."idx_team_events_cooldown";

drop index if exists "public"."team_events_pkey";

drop index if exists "public"."team_memberships_pkey";

alter table "public"."supporters" alter column "has_ever_supported" set default true;

alter table "public"."supporters" alter column "type" drop default;

alter table "public"."team_events" drop column "event_id";

alter table "public"."team_events" add column "id" uuid not null default gen_random_uuid();

alter table "public"."team_events" alter column "event_type" set data type text using "event_type"::text;

alter table "public"."team_events" alter column "initiated_by" drop not null;

alter table "public"."team_events" alter column "team_id" drop not null;

alter table "public"."team_memberships" drop column "id";

alter table "public"."team_memberships" alter column "team_id" set not null;

alter table "public"."team_memberships" alter column "user_id" set not null;

alter table "public"."teams" add column "max_members" integer default 5;

alter table "public"."teams" add column "members" jsonb default '[]'::jsonb;

alter table "public"."teams" add column "updated_at" timestamp with time zone default now();

alter table "public"."teams" alter column "join_code" drop not null;

alter table "public"."user_preferences" alter column "map_pan_speed" drop not null;

alter table "public"."user_system" add column "api_tokens" text[] default '{}'::text[];

alter table "public"."user_system" add column "created_at" timestamp with time zone default now();

CREATE INDEX team_events_target_user_idx ON public.team_events USING btree (target_user);

CREATE UNIQUE INDEX teams_name_unique_idx ON public.teams USING btree (name);

CREATE INDEX idx_team_events_cooldown ON public.team_events USING btree (team_id, event_type, initiated_by, created_at) WHERE (event_type = ANY (ARRAY['member_kicked'::text, 'member_left'::text]));

CREATE UNIQUE INDEX team_events_pkey ON public.team_events USING btree (id);

CREATE UNIQUE INDEX team_memberships_pkey ON public.team_memberships USING btree (team_id, user_id);

alter table "public"."team_events" add constraint "team_events_pkey" PRIMARY KEY using index "team_events_pkey";

alter table "public"."team_memberships" add constraint "team_memberships_pkey" PRIMARY KEY using index "team_memberships_pkey";

alter table "public"."team_memberships" add constraint "team_memberships_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text]))) not valid;

alter table "public"."team_memberships" validate constraint "team_memberships_role_check";

alter table "public"."teams" add constraint "teams_max_members_check" CHECK (((max_members >= 2) AND (max_members <= 10))) not valid;

alter table "public"."teams" validate constraint "teams_max_members_check";

alter table "public"."team_events" add constraint "team_events_initiated_by_fkey" FOREIGN KEY (initiated_by) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."team_events" validate constraint "team_events_initiated_by_fkey";

alter table "public"."user_system" add constraint "user_system_team_id_fkey" FOREIGN KEY (pvp_team_id) REFERENCES public.teams(id) not valid;

alter table "public"."user_system" validate constraint "user_system_team_id_fkey";

grant insert ("api_tokens"), update ("api_tokens") on table "public"."user_system" to "authenticated";

grant insert ("created_at"), update ("created_at") on table "public"."user_system" to "authenticated";


