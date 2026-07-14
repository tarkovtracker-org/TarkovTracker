---
name: supabase-migration
description: Create a new Supabase SQL migration with proper naming, RLS policies, and rollback plan
disable-model-invocation: true
---

# Supabase Migration

Create a new SQL migration file in `supabase/migrations/`.

## Arguments

- `$ARGUMENTS` — description of what the migration does (e.g., "add user_preferences table")

## Naming Convention

Files use the format: `YYYYMMDDHHMMSS_<snake_case_description>.sql`

Generate the timestamp from the current date/time. Use a descriptive snake_case suffix.

Examples from this project:
- `20260215100000_add_user_preferences_profile_share_visibility.sql`
- `20260216120000_add_user_preferences_map_zone_opacity.sql`
- `20260222120000_preserve_story_chapter_progress.sql`

## Migration Checklist

1. **Create the migration file** in `supabase/migrations/` with the proper naming convention
2. **Include RLS policies** — all new tables MUST have Row Level Security enabled:
   ```sql
   ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
   ```
3. **Add appropriate RLS policies** for select/insert/update/delete based on `auth.uid()`
4. **Use `IF NOT EXISTS`** for CREATE TABLE/INDEX to make migrations idempotent
5. **Use transactions** — wrap multi-statement migrations in `BEGIN; ... COMMIT;`
6. **Validate data types** — use `jsonb` for flexible data, `timestamptz` for timestamps, `uuid` for IDs
7. **Add indexes** for columns used in WHERE clauses or JOINs
8. **Consider backward compatibility** — existing queries should not break

## RLS Policy Patterns

Standard user-owned table:
```sql
CREATE POLICY "Users can read own data" ON public.<table>
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own data" ON public.<table>
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own data" ON public.<table>
  FOR UPDATE USING (auth.uid() = user_id);
```

## Output

After creating the migration, report:
- File path created
- Tables/columns affected
- RLS policies added
- Any manual steps needed (e.g., updating types, edge functions)
