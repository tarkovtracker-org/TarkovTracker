-- supabase:disable-transaction
-- Copies existing persistent PvP/PvE progress into user_game_mode_progress.
--
-- Runs outside a transaction, one statement per key range, so each range commits on its own. A
-- failure part-way leaves the completed ranges committed; because the ranges are idempotent, the
-- next attempt re-runs them as no-ops and continues. The ranges split the uuid keyspace by leading
-- hex digit, which is uniform for v4 uuids, and each one is an index range scan on the
-- user_progress primary key.
--
-- This is deliberately not part of the schema migration. A backfill that rolls back must never take
-- the schema with it: on 2026-08-06 that coupling left production with the new frontend and the old
-- schema. The app tolerates missing rows — reads fall back to user_progress and the sync RPC
-- creates rows on the next write — so the schema landing is what restores service, and this only
-- fixes how a dormant account appears to others.
SET statement_timeout = '15min';

SELECT private.backfill_game_mode_progress_range('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('10000000-0000-0000-0000-000000000000', '20000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('20000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('30000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('40000000-0000-0000-0000-000000000000', '50000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('50000000-0000-0000-0000-000000000000', '60000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('60000000-0000-0000-0000-000000000000', '70000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('70000000-0000-0000-0000-000000000000', '80000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('80000000-0000-0000-0000-000000000000', '90000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('90000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('a0000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('b0000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('c0000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('d0000000-0000-0000-0000-000000000000', 'e0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('e0000000-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-000000000000');
SELECT private.backfill_game_mode_progress_range('f0000000-0000-0000-0000-000000000000', NULL);

RESET statement_timeout;

DROP FUNCTION private.backfill_game_mode_progress_range(UUID, UUID);
