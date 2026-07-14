import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations/20260710120000_enforce_active_api_token_cap.sql'
);
const migrationSql = readFileSync(migrationPath, 'utf-8');

describe('active API token cap migration', () => {
  it('includes a preflight reconciliation that revokes excess tokens', () => {
    expect(migrationSql).toContain('UPDATE public.api_tokens');
    expect(migrationSql).toContain('is_active = FALSE');
    expect(migrationSql).toContain('ROW_NUMBER()');
    expect(migrationSql).toContain('PARTITION BY user_id');
    expect(migrationSql).toMatch(/rn\s*>\s*3/);
  });

  it('locks api_tokens before reconciliation to block concurrent inserts', () => {
    expect(migrationSql).toContain('LOCK TABLE public.api_tokens IN SHARE ROW EXCLUSIVE MODE');
    expect(migrationSql).toMatch(/BEGIN;\s*\n\s*LOCK TABLE public\.api_tokens/s);
    expect(migrationSql).toContain('COMMIT;');
  });

  it('orders reconciliation with NULLS LAST and a deterministic tiebreaker', () => {
    expect(migrationSql).toContain('ORDER BY created_at DESC NULLS LAST, token_id DESC');
  });

  it('uses a transaction advisory lock to prevent concurrent-creation races', () => {
    expect(migrationSql).toContain('pg_advisory_xact_lock');
    expect(migrationSql).toContain('hashtext');
  });

  it('enforces the cap with SQLSTATE check_violation (23514)', () => {
    expect(migrationSql).toContain("ERRCODE = 'check_violation'");
    expect(migrationSql).toContain('Token limit reached (3 active)');
  });

  it('fires the trigger on insert, is_active update, and user_id update', () => {
    expect(migrationSql).toContain('BEFORE INSERT OR UPDATE OF is_active, user_id');
    expect(migrationSql).toContain('FOR EACH ROW');
  });

  it('excludes the current row from the count to allow updates', () => {
    expect(migrationSql).toContain('token_id <> NEW.token_id');
  });

  it('checks the destination user_id on reassignment', () => {
    expect(migrationSql).toContain('v_target_user := NEW.user_id');
    expect(migrationSql).toContain('WHERE user_id = v_target_user');
  });

  it('revokes execute from public/anon/authenticated and does not grant to authenticated', () => {
    expect(migrationSql).toContain(
      'REVOKE ALL ON FUNCTION public.enforce_api_token_cap() FROM PUBLIC, anon, authenticated'
    );
    expect(migrationSql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.enforce_api_token_cap\(\)\s+TO\s+[^;]*authenticated/i
    );
  });

  it('drops any prior trigger before creating the new one', () => {
    expect(migrationSql).toContain('DROP TRIGGER IF EXISTS trg_enforce_api_token_cap');
  });

  it('revokes authenticated INSERT so creates must use token-create', () => {
    expect(migrationSql).toContain(
      'REVOKE INSERT ON public.api_tokens FROM PUBLIC, anon, authenticated'
    );
    expect(migrationSql).toContain(
      'DROP POLICY IF EXISTS "Users can create own API tokens" ON public.api_tokens'
    );
  });
});
