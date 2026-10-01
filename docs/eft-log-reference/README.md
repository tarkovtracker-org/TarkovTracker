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
| [`eft-log-events-reference.md`](./eft-log-events-reference.md)           | Full evidence catalogue: per-channel event inventory, structured field-name dictionary, PII rules, and per-build version evidence.                                                                       |
| [`eft-log-event-dictionary.md`](./eft-log-event-dictionary.md)           | Purpose-first lookup: "how do I detect X" recipes (quests, raid lifecycle, modes, matchmaking, groups, economy), an A–Z event reference by channel, the cannot-answer gap list, and audit-tool commands. |
| [`.eft_log_audit.py`](./.eft_log_audit.py)                               | Read-only, privacy-safe audit tool that re-verifies the docs against a log corpus. See "Refreshing" below.                                                                                               |
| [`audit_2026-08-29_signatures.json`](./audit_2026-08-29_signatures.json) | Snapshot output of the audit tool (2026-08-29), the evidence base for the current doc state.                                                                                                             |

## Start here

- **"I want to detect X"** → Dictionary [Part 1](./eft-log-event-dictionary.md#part-1--how-do-i-detect-recipes).
- **"What is this log line / field?"** → Dictionary [Part 2](./eft-log-event-dictionary.md#part-2--a-z-event-dictionary-by-channel), or the full per-channel catalogue in the reference.
- **"Can logs answer this?"** → Dictionary [Part 3](./eft-log-event-dictionary.md#part-3--what-the-logs-cannot-answer-do-not-automate-off-these) before building anything on log data.

## Import resource budgets

Browser imports use a selection-wide budget owned by
[`eftLogImportBudget.ts`](../../app/utils/eftLogImportBudget.ts), shared by raw files and all ZIP
members. Actual expanded bytes are charged before decoding; ZIP size declarations are only a
format check. Events (including duplicates) and explicit/legacy mode signals are charged before
retention. Retained strings are copied so short substrings cannot pin whole decoded batches. Identity,
ordering, raw counters, and later version/mode reconciliation remain intact.
No partial preview or progress import is returned when a budget is exceeded. Select fewer recent
sessions or extract only relevant logs to retry.

The defaults permit 1 GiB of selected supported input and 1 GiB of actual expanded log bytes,
100,000 retained evidence items, 16 Mi characters of retained event strings, 8,192 selected
files plus archive entries (including ignored entries), and 1 Mi characters of aggregate names.
These are availability ceilings, not measured browser heap guarantees. The byte ceiling preserves
the existing 513 MiB raw-streaming and 33 MiB ZIP regressions; the entry allowance is several
times the reference corpus's 1,121 files. The reference does not establish a maximum legitimate
event count, so the separate evidence ceilings deliberately reject unusually dense histories
rather than allow unlimited objects/strings. Splitting such histories into recent-session imports
is the practical tradeoff. No per-log 32 MiB cap is restored.

ZIP input slices are 1 KiB to keep the unavoidable synchronous DEFLATE allocation before an
output callback around a MiB rather than tens of MiB. Expanded-byte and evidence checks stop
further decoding, parsing, and retention on that callback; they cannot preempt fflate inside a
slice. Ignored entries are never inflated. Selected input bytes and entry counts also bound work
on archives dominated by irrelevant members. The existing unfinished-record ceiling remains a
separate guard. Cancellation/error paths terminate active members and discard local evidence.
Tests use small generated fixtures and internal lowered budgets, never crash/OOM payloads.

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
  --reference eft-log-events-reference.md --section endpoints
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
