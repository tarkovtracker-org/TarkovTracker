# External API integration checks

Public API runtime and pure contracts source belong in `tarkovtracker-org/TarkovTracker-API`.
This directory owns consumer parity and its immutable source tag/commit pin. Keep the contracts
archive URL/integrity unchanged when compiled contents are unchanged. Run `pnpm run
check:progress-contracts` and `pnpm run verify:api-parity` for pin or integration changes; the
latter checks the actual tagged API checkout in PvP, PvE and Seasonal modes. Do not restore a
local gateway implementation or follow a moving branch implicitly.
