-- Address Supabase advisor lint 0005 unused_index on public.api_tokens.
--
-- idx_api_tokens_active is a partial index on (is_active, expires_at)
-- WHERE is_active = TRUE, built to optimize "active, non-expired" lookups.
-- No query issues that shape: the API gateway fetches tokens by token_hash
-- (api_tokens_token_hash_key unique constraint) and checks is_active/expires_at
-- in application code, while create/revoke/delete use the primary key, user_id,
-- or token_hash.
-- The index backs no query path, so it only adds write overhead. Safe to drop;
-- recreate from history if a future feature filters tokens by active/expiry.

DROP INDEX IF EXISTS public.idx_api_tokens_active;
