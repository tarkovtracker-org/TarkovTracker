# TarkovTracker

TarkovTracker records players' progress through Escape from Tarkov across game modes and seasons.
The reliability policy below describes agreed behavior, not a claim that every existing path already implements it.

## Language

**Player progress**:
A player's tracked advancement within one game mode and, for Seasonal PvP, one season.
_Avoid_: Account, profile (when referring only to tracked advancement)

**Locally saved progress**:
Player progress confirmed stored in the current browser for recovery in that browser.
_Avoid_: Cloud-saved progress, saved (without naming the destination)

**Cloud-saved progress**:
Player progress whose save has been acknowledged by the cloud service for its owning account.
_Avoid_: Locally saved progress, saved (without naming the destination)

**Pending cloud changes**:
Changes to current player progress awaiting cloud-save acknowledgement that have not been superseded by a deliberate reset or Seasonal rollover.
_Avoid_: Lost progress, cloud-saved progress, superseded changes

**Account recovery copy**:
Locally saved progress retained for its owning account to recover pending cloud changes after signing out or switching accounts.
_Avoid_: Guest progress, cloud backup

**Unsaved progress changes**:
Changes to current player progress held in the current session without confirmation of either a local save or a cloud save.
_Avoid_: Locally saved progress, account recovery copy

**Superseded recovery copy**:
An export-only record of unacknowledged progress changes displaced by a deliberate reset or Seasonal rollover.
_Avoid_: Pending cloud changes, current progress, automatic restore

## Relationships

- An account has separate **Player progress** for PvP, PvE, and each Seasonal PvP season.
- **Player progress** can have a local copy and a cloud copy with different acknowledged changes.
- **Pending cloud changes** can already be part of **Locally saved progress**; lack of cloud acknowledgement alone does not establish whether a local save succeeded.
- An **Account recovery copy** belongs to exactly one account and is restored or synchronized only when that account is signed in.
- **Unsaved progress changes** are **Pending cloud changes** without a confirmed local save and may be newer than an existing **Account recovery copy**.
- A **Superseded recovery copy** belongs to exactly one account and identifies the original game mode and season, where applicable; it is separate from that account's current **Player progress**.

## Agreed reliability policy

- A failed cloud save must not prevent continued local tracking.
- Transient cloud-save failures receive a bounded automatic retry schedule.
- **Pending cloud changes** remain visibly marked until acknowledged; exhausting retries does not dismiss the warning or discard the changes.
- A manual retry action remains available after automatic retries are exhausted.
- A successful local-save message requires confirmation of local persistence; a cloud-save failure is not evidence that the local save succeeded.
- Successfully stored **Pending cloud changes** remain recoverable after sign-out and another account's use of the same browser.
- An **Account recovery copy** must not appear in another account's tracker or be uploaded as that account's progress.
- Signing out remains available without cloud connectivity.
- If the player deliberately signs out with **Unsaved progress changes**, explain the loss risk and require confirmation before discarding them; the default is to stay signed in.
- That confirmation offers retrying the save and exporting current progress, plus an explicit sign-out-and-discard action; retrying or requesting an export must not automatically sign the player out.
- Removing the account's data from this device is an explicit action, distinct from ordinary sign-out and from deleting cloud progress.
- If both local and cloud saving fail, tracking may continue in memory with a persistent warning that new changes are not saved and may be lost on reload or close.
- A prominent progress-export action must make the current in-memory progress available for download without requiring a successful local or cloud save.
- **Unsaved progress changes** must not be described as locally saved or recoverable after sign-out.
- A deliberate reset or Seasonal rollover remains authoritative; older changes must not undo the fresh start or enter a different season.
- Changes displaced by that reset or rollover stop being **Pending cloud changes**: stop retrying them and explain why they were superseded rather than reporting them as cloud-saved.
- Retain superseded changes separately as an owner-only **Superseded recovery copy**, labeled with the original mode and season, for export rather than automatic restoration or synchronization.
- A **Superseded recovery copy** is not a promise of durable recovery unless its local save succeeds; the same truthful-save policy applies as for current progress.
- The app must not automatically expire or delete the only recovery copy of unacknowledged changes to free storage; automatic cleanup is limited to copies proven redundant or safely cloud-saved.
- Storage or saving failures must explain which destination failed, what progress is affected, and whether a confirmed recoverable copy exists.
- Recovery guidance must distinguish a known cause from an unknown failure and offer applicable remedies such as retrying or exporting current progress without implying they are guaranteed to succeed.
- Do not recommend reloading, clearing site data, or removing recovery data as a routine fix when doing so could destroy the only copy of changes; explain that consequence and offer non-destructive recovery first.

## Example dialogue

> **Player:** "My connection failed after I completed a task. Is my progress saved?"
> **Tracker maintainer:** "If the browser confirmed the local save, it is **Locally saved progress**, but the task completion remains a **Pending cloud change** until cloud saving acknowledges it. You can keep tracking and retry cloud saving."
>
> **Player:** "Can someone else sign in before I return?"
> **Tracker maintainer:** "Yes. Your **Account recovery copy** remains separate from their progress and is restored only when you sign back in, unless you explicitly remove your data from this device."
>
> **Player:** "What if my browser cannot save either?"
> **Tracker maintainer:** "You can keep tracking, but those are **Unsaved progress changes**. Export your progress before leaving; we cannot promise to recover those changes after a reload or sign-out."
>
> **Player:** "I reset my progress on another device while this one was offline. Will these old completions undo my reset?"
> **Tracker maintainer:** "No. The reset wins. Those completions stop retrying and remain separate in a **Superseded recovery copy** for you to export, subject to successful local storage."
>
> **Player:** "The browser cannot save more progress. Should I clear this site's data?"
> **Tracker maintainer:** "Not while it holds your only recovery copy. We should explain what failed and help you export or retry saving before you decide whether to remove any data."
>
> **Player:** "I still want to sign out, even though my new changes cannot be saved."
> **Tracker maintainer:** "You can explicitly confirm that those changes will be discarded. Until then, you stay signed in and can retry saving or export your current progress."

## Flagged ambiguities

- "Saved" could mean either local recovery or cloud acknowledgement — resolved: always distinguish **Locally saved progress** from **Cloud-saved progress**.
- "Cloud sync pending" does not mean progress is lost or safely stored locally — resolved: local-save confirmation and cloud acknowledgement are separate facts.
- "Sign out" could imply either ending account access or removing device data — resolved: ordinary sign-out retains the **Account recovery copy**; device-data removal is a separate explicit action.
- "Cloud sync pending" alone does not distinguish locally recoverable changes from memory-only changes — resolved: **Unsaved progress changes** require an explicit warning about the lack of a confirmed save.
- "Keep retrying until saved" conflicts with an intentional fresh start — resolved: superseded changes stop retrying and become export-only recovery data; supersession is not cloud-save acknowledgement.
- "Free up storage" could mean removing disposable duplicates or destroying the only recovery copy — resolved: automatic cleanup must not discard otherwise-unrecoverable changes, and failure guidance must explain the risk and safe recovery options.
- "Offline sign-out remains available" does not mean discarding memory-only changes without consent — resolved: deliberate sign-out requires an explicit loss-risk confirmation when those changes would be discarded.
