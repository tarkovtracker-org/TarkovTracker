# EFT Log Reference

Reference documentation for the local log files written by Escape from Tarkov (and EFT: Arena) at
`C:\Battlestate Games\Escape from Tarkov\Logs\`. Produced by auditing an on-disk log corpus
covering builds `0.16.8.0.37972`–`1.1.0.1.46911` (main game) and Arena `0.3.2.1.38001` /
`0.4.2.5.42886`.

## Privacy

This directory contains **no raw game logs and no personal data**. All example log lines are
privacy-normalized: identifiers, addresses, hosts, and free text are replaced with angle-bracket
placeholders such as `<PROFILE_ID>`, `<SERVER_IP>`, or `<GATEWAY>`. The only numeric data is EFT
build numbers, which are public. Do not commit real player logs anywhere in this repository — see
the root `.gitignore` for the raw-log exclusions.

## Contents

| File                                                                     | What it is                                                                                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`EFT_LOG_EVENTS_REFERENCE.md`](./EFT_LOG_EVENTS_REFERENCE.md)           | Full evidence catalogue: per-channel event inventory, structured field-name dictionary, PII rules, and per-build version evidence.                                                                       |
| [`EFT_LOG_EVENT_DICTIONARY.md`](./EFT_LOG_EVENT_DICTIONARY.md)           | Purpose-first lookup: "how do I detect X" recipes (quests, raid lifecycle, modes, matchmaking, groups, economy), an A–Z event reference by channel, the cannot-answer gap list, and audit-tool commands. |
| [`.eft_log_audit.py`](./.eft_log_audit.py)                               | Read-only, privacy-safe audit tool that re-verifies the docs against a log corpus. See "Refreshing" below.                                                                                               |
| [`audit_2026-08-29_signatures.json`](./audit_2026-08-29_signatures.json) | Snapshot output of the audit tool (2026-08-29), the evidence base for the current doc state.                                                                                                             |

## Start here

- **"I want to detect X"** → Dictionary [Part 1](./EFT_LOG_EVENT_DICTIONARY.md#part-1--how-do-i-detect-recipes).
- **"What is this log line / field?"** → Dictionary [Part 2](./EFT_LOG_EVENT_DICTIONARY.md#part-2--a-z-event-dictionary-by-channel), or the full per-channel catalogue in the reference.
- **"Can logs answer this?"** → Dictionary [Part 3](./EFT_LOG_EVENT_DICTIONARY.md#part-3--what-the-logs-cannot-answer-do-not-automate-off-these) before building anything on log data.

## Refreshing the docs

The docs track a snapshot of a log corpus; new game versions can add or change events. Re-run the
audit after a game patch to check for drift (commands are also in Dictionary Part 4):

```bash
# Full re-audit of a live corpus
python .eft_log_audit.py \
  --main-root "C:\Battlestate Games\Escape from Tarkov\Logs" \
  --arena-root "C:\Battlestate Games\Escape from Tarkov Arena\Logs" \
  --section all --out audit_report.json

# Diff observed endpoints/events against the reference doc (prints shared/added/missing)
python .eft_log_audit.py \
  --main-root "..." --arena-root "..." \
  --reference EFT_LOG_EVENTS_REFERENCE.md --section endpoints
```

If the diff shows new builds, endpoints, or event shapes, update the reference and dictionary and
replace the dated signatures JSON with the new audit output.

The JSON report includes `corpus_status` and `missing_roots`. Treat a report with
`corpus_status: "incomplete"` as non-authoritative until the missing roots or unreadable files are
resolved. Diagnostic warnings do not echo local filesystem paths.

## Provenance

Originally produced 2026-08-09 (snapshot `H`: 124 session folders, 1,121 log files, 16 main-game
builds) and re-verified against the then-current corpus on 2026-08-29 (snapshot `C`). The Arena
log root was absent on the analyzed machine during snapshot `H`; Arena evidence comes from
snapshot `C` only.
