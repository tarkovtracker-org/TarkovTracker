# Label Reference Guide

This document describes the streamlined label system used in the TarkovTracker repository.

## Philosophy

**Issue Types** (not labels) categorize WHAT kind of work it is. **Labels** provide additional context about technical areas, priority, and special flags. **Project Board Status** tracks WHERE it is in the workflow.

## Issue Types vs Labels

GitHub's native **Issue Types** feature replaces type labels. Each issue must have exactly ONE issue type:

- 🐛 **bug** - An unexpected problem or behavior (Red)
- ✨ **feature** - Adds or improves functionality in the codebase (Green)
- ⚡ **enhancement** - Improvement or optimization to existing features (Blue)
- 📦 **dependencies** - Package updates and dependency management (Gray)
- 📝 **documentation** - Documentation, guides, or README updates (Yellow)

**Labels** supplement the issue type with additional metadata.

## Label Categories

### Area Labels (Technical boundaries - which systems are affected)

All area labels use `#c2e0c6` (light green) for visual grouping.

| Label           | Description                                 | Examples                                                              |
| --------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `area:ui`       | Vue components, pages, styling              | Component bugs, layout issues, Tailwind CSS, responsive design        |
| `area:api`      | Nitro server routes, workers, API endpoints | Server routes in `app/server/api/`, Cloudflare Workers, GraphQL proxy |
| `area:database` | Supabase schema, migrations, queries        | Database schema, Postgres queries, migrations, RLS policies           |
| `area:auth`     | Authentication and authorization            | Login/logout, Supabase Auth, permissions, session management          |
| `area:realtime` | Team sync, Supabase broadcasts              | Team features, real-time sync, Supabase Realtime, broadcasts          |
| `area:i18n`     | Translations and localization               | Language files, translation keys, i18n system, locale switching       |

**Note:** Issues can have multiple area labels if they affect multiple systems (e.g., `area:ui` + `area:realtime` for team page display issues).

### Priority Labels (How urgent)

| Label             | Color     | Description             | When to Use                                                                    |
| ----------------- | --------- | ----------------------- | ------------------------------------------------------------------------------ |
| `priority:high`   | `#d93f0b` | Important features/bugs | Critical bugs, security issues, data loss, blocking issues, important features |
| `priority:medium` | `#fbca04` | Normal priority         | Standard bugs and features (default)                                           |
| `priority:low`    | `#0e8a16` | Nice to have            | Minor improvements, edge cases, quality-of-life enhancements                   |

### Special Labels

| Label              | Color     | Description                        | When to Use                                                                                           |
| ------------------ | --------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `good-first-issue` | `#7057ff` | Good for newcomers                 | Simple, well-defined issues that can be completed in isolation without deep knowledge                 |
| `help-wanted`      | `#008672` | Community help needed              | Well-scoped issues that welcome community contributions but may require broader context or experience |
| `never-stale`      | `#5319e7` | Never auto-close from stale        | Long-lived backlog issues/PRs that may be marked stale for review but must not be auto-closed         |
| `upstream`         | `#e99695` | Issue belongs in data-overlay repo | Quest/item data issues that need fixes in the data-overlay repository                                 |

## Label Usage Guidelines

### `good-first-issue` guidelines

Only apply `good-first-issue` to issues that meet **all** of the following criteria:

- Limited to a single technical area (usually `area:ui`)
- Can be completed without introducing new data models or shared logic
- Does not require deep Tarkov Tracker domain knowledge
- Has a clear, testable outcome that can be verified visually or with simple checks

If an issue is contributor-friendly but larger in scope, use **`help-wanted` without `good-first-issue`**.

### Combining Labels

Issues and PRs should typically have:

1. **One Issue Type** (required) - bug, feature, enhancement, dependencies, or documentation
2. **One or more Area labels** (optional) - Which technical systems are affected
3. **One Priority label** (optional, for issues) - How urgent is it
4. **Zero or more Special labels** (optional) - Additional flags

### Examples

**Bug in task display:**

```text
Issue Type: bug
Labels: area:ui, priority:medium
```

**API endpoint missing CORS headers:**

```text
Issue Type: bug
Labels: area:api, priority:high
```

**Team page shows wrong level:**

```text
Issue Type: bug
Labels: area:ui, area:realtime, priority:medium
```

**New feature spanning multiple areas:**

```text
Issue Type: feature
Labels: area:api, area:database, area:auth, priority:high
```

**Enhancement to UI:**

```text
Issue Type: enhancement
Labels: area:ui, priority:low, good-first-issue
```

**Missing quest data (send to data-overlay):**

```text
Issue Type: bug (or feature, depending on what's wrong)
Labels: upstream
```

Close the issue with a comment explaining it belongs in the data-overlay repo and link to where they should report it.

**Dependency update PR:**

```text
Issue Type: dependencies
Labels: (none needed, Dependabot handles these)
```

### Workflow States (Use Project Board, NOT Labels)

These are **NOT** labels - they're handled by GitHub Project columns:

| ❌ Don't Use Label   | ✅ Use Project Column Instead          |
| -------------------- | -------------------------------------- |
| ~~needs-info~~       | **Waiting for Info** column            |
| ~~blocked~~          | **Blocked** column                     |
| ~~in-progress~~      | **In Progress** column                 |
| ~~ready-for-review~~ | **In Review** column                   |
| ~~duplicate~~        | Close with comment linking to original |
| ~~wontfix~~          | Close with explanation in comment      |

### Automated Labeling

- Issue templates automatically apply initial type labels
- Area and priority labels are added during triage
- Dependabot PRs automatically get `dependencies` label

### Label Hygiene

- Keep labels current and accurate
- Update priority as needed
- Add area labels during triage
- Use project board for workflow states

## For Maintainers

### Triage Process

1. Review new issues in **Inbox** column
2. Add **one type label** (usually auto-applied by template)
3. Add **one or more area labels** based on technical systems affected
4. Add **priority label** (default to `priority:medium` if unsure)
5. Add special labels if appropriate:
   - `good-first-issue` for simple, well-defined issues
   - `help-wanted` for community contributions
   - `never-stale` for long-lived backlog work that should not auto-close
   - `upstream` if it's a data issue → close with comment

   **Note**: Prefer `help-wanted` over `good-first-issue` unless the issue is truly first-time contributor safe.

6. Move to appropriate project column:
   - **Waiting for Info** if clarification needed
   - **Blocked** if waiting on external dependency
   - **Backlog** if triaged but not prioritized
   - **Todo** if ready to work on

### Label Management

- Keep labels organized and consistent
- Don't create new labels without team discussion
- Use existing labels whenever possible
- Remove unused labels rather than letting them accumulate

### Data Issues (Quest/Item Data)

When someone reports incorrect quest requirements, missing items, wrong item properties, etc.:

1. Add `upstream` label
2. Close the issue
3. Comment:
   > Thanks for reporting! This is a data issue that needs to be fixed in our data source repository. Please report it at: [link to data-overlay repo issues]
   >
   > We'll pick up the fix once it's merged upstream.

## Quick Reference

**Total Labels: 13** (down from 31!)

### By Category

- Area: 6 labels (area:ui, area:api, area:database, area:auth, area:realtime, area:i18n)
- Priority: 3 labels (priority:high, priority:medium, priority:low)
- Special: 4 labels (good-first-issue, help-wanted, never-stale, upstream)

### Issue Types (not labels): 5

- bug, feature, enhancement, dependencies, documentation

### Most Common Patterns

- Issue Type: `bug` + Labels: `area:ui, priority:medium`
- Issue Type: `enhancement` + Labels: `area:ui, priority:low`
- Issue Type: `feature` + Labels: `area:api, priority:high`
- Issue Type: `bug` + Labels: `upstream` (then close)
