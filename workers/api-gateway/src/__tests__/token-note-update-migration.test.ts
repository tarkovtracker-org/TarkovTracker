import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations/20260810140000_limit_api_token_updates_to_note.sql'
);
const migrationSql = readFileSync(migrationPath, 'utf-8');
describe('API token note update migration', () => {
  it('revokes broad table and column update privileges', () => {
    expect(migrationSql).toContain(
      'REVOKE UPDATE ON TABLE public.api_tokens FROM PUBLIC, anon, authenticated'
    );
    expect(migrationSql).toContain("attrelid = 'public.api_tokens'::regclass");
    expect(migrationSql).toContain(
      'REVOKE UPDATE (%s) ON public.api_tokens FROM PUBLIC, anon, authenticated'
    );
  });
  it('grants authenticated users update access to note only', () => {
    expect(migrationSql).toContain(
      'GRANT UPDATE (note) ON TABLE public.api_tokens TO authenticated'
    );
    expect(migrationSql).not.toMatch(/GRANT UPDATE \((?!note\))[^)]*\)/);
  });
  it('limits the update policy to the authenticated owner', () => {
    expect(migrationSql).toMatch(
      /CREATE POLICY "Users can update own API tokens"[\s\S]*FOR UPDATE[\s\S]*TO authenticated/
    );
    expect(migrationSql).toContain('USING ((SELECT auth.uid()) = user_id)');
    expect(migrationSql).toContain('WITH CHECK ((SELECT auth.uid()) = user_id)');
  });
  it('applies the privilege and policy changes atomically', () => {
    expect(migrationSql.trimStart()).toMatch(/^BEGIN;/);
    expect(migrationSql.trimEnd()).toMatch(/COMMIT;$/);
  });
});
