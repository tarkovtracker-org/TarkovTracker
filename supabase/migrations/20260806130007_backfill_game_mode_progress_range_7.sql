-- Backfills persistent PvP/PvE progress for uuid range 7 of f.
--
-- One range per migration on purpose, and deliberately transactional. Staging a backfill inside a
-- single non-transactional file does not work: the runner applies a migration file atomically
-- regardless of the disable-transaction directive (verified with a probe whose earlier statements
-- were rolled back by a later failure), and one statement covering every account died in production
-- with `conn closed`. A file per range gives each range its own transaction and its own recorded
-- version, so a failure leaves earlier ranges applied and the retry resumes where it stopped. The
-- directive is not used here because a single INSERT has no need to run outside a transaction.
--
-- Idempotent: the helper only fills rows whose progress carries no level, so re-running changes
-- nothing and a write that landed first is never overwritten.
SET statement_timeout = '15min';

SELECT private.backfill_game_mode_progress_range(
  '70000000-0000-0000-0000-000000000000',
  '80000000-0000-0000-0000-000000000000'
);

RESET statement_timeout;
