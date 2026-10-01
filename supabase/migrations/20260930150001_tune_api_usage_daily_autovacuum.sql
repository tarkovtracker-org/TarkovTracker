-- Reclaim obsolete usage-counter row versions sooner, following the tuning
-- already used by the progress tables. Only table storage parameters change.
-- This migration follows the latest applied version, which was future-dated.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.api_usage_daily SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 1000
);

COMMIT;
