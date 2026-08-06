-- Backfills persistent PvP/PvE progress for uuid range 7 of f.
--
-- One range per migration on purpose. The Supabase runner applies a migration file atomically even
-- with `-- supabase:disable-transaction` (verified: a multi-statement non-transactional file rolls
-- back entirely on error), and a single statement covering every account died in production with
-- `conn closed`. Splitting by file gives each range its own transaction and its own recorded
-- version, so a failure leaves earlier ranges applied and the retry resumes where it stopped.
--
-- Idempotent: the helper only fills rows whose progress carries no level, so re-running changes
-- nothing and a write that landed first is never overwritten.
SET statement_timeout = '15min';

SELECT private.backfill_game_mode_progress_range(
  '70000000-0000-0000-0000-000000000000',
  '80000000-0000-0000-0000-000000000000'
);

RESET statement_timeout;
