# GitHub Project Board Setup Guide

This guide describes how to set up and use the TarkovTracker GitHub Project board.

## Project Board Structure

### Columns (Status Fields)

| Column | Icon | Description | Automation |
|--------|------|-------------|------------|
| **Inbox** | 📥 | New issues awaiting triage | Auto-add newly created issues |
| **Waiting for Info** | ❓ | Need clarification from reporter | Manual move during triage |
| **Blocked** | 🚫 | Waiting on external dependency | Manual move when blocked |
| **Backlog** | 📋 | Triaged, not yet prioritized for active work | Manual move after triage |
| **Todo** | 📝 | Ready to work on, prioritized | Manual move when prioritized |
| **In Progress** | 🚧 | Actively being worked on | Auto-move when PR opened or issue assigned |
| **In Review** | 👀 | PR open, awaiting review | Auto-move when PR marked ready for review |
| **Done** | ✅ | Completed/merged | Auto-move when PR merged or issue closed |

### Custom Fields

Configure these custom fields in your project:

| Field Name | Type | Options | Description |
|------------|------|---------|-------------|
| **Priority** | Single Select | Critical, High, Medium, Low | Urgency level |
| **Area** | Multi Select | Frontend, Backend, Tasks, Team, Hideout, Maps, Traders, i18n, API | Affected codebase areas |
| **Type** | Single Select | Bug, Feature, Enhancement, Refactor, Docs, Dependencies, Chore | Type of work |
| **Estimate** | Single Select | XS, S, M, L, XL | Size estimate (optional) |
| **Sprint** | Text | | Sprint/iteration identifier (optional) |

## Setting Up the Project Board

### Step 1: Create the Project

1. Go to your repository on GitHub
2. Click **Projects** tab
3. Click **New project**
4. Choose **Board** layout
5. Name it "TarkovTracker Development"

### Step 2: Configure Columns

1. Rename default columns to match the structure above
2. Add any missing columns
3. Set column limits (optional):
   - In Progress: 5 items max
   - In Review: 10 items max

### Step 3: Add Custom Fields

1. Click **⚙️** (Settings) in the project view
2. Click **+ New field** for each custom field
3. Configure options as listed above

### Step 4: Set Up Automation

GitHub Projects supports built-in automation. Configure these:

#### Auto-add to Inbox
```
When: Issue is created
Action: Add to project → Set status to Inbox
```

#### Move to In Progress
```
When: Pull request is opened
Action: Set status to In Progress

When: Issue is assigned
Action: Set status to In Progress (optional)
```

#### Move to In Review
```
When: Pull request is marked ready for review
Action: Set status to In Review
```

#### Move to Done
```
When: Pull request is merged
Action: Set status to Done

When: Issue is closed
Action: Set status to Done
```

### Step 5: Configure Workflows (Optional)

For more advanced automation, use GitHub Actions:

Create `.github/workflows/project-automation.yml`:

```yaml
name: Project Automation

on:
  issues:
    types: [opened, labeled, assigned]
  pull_request:
    types: [opened, ready_for_review, closed]

jobs:
  auto-label-from-template:
    runs-on: ubuntu-latest
    steps:
      - name: Auto-label from issue template
        uses: actions/github-script@v8
        with:
          script: |
            # Auto-assign labels based on issue body content
            # Sync project fields with labels
            # Add custom automation logic here
```

## Using the Project Board

### For Contributors

1. **Find work**: Browse **Todo** column for prioritized, ready-to-work issues
2. **Start work**: Assign yourself and move to **In Progress**
3. **Submit PR**: Project automatically moves to **In Review**
4. **Complete**: After merge, automatically moves to **Done**

### For Maintainers

#### Triage Workflow (Inbox → Backlog/Todo)

For each item in **Inbox**:

1. **Verify completeness**
   - Is there enough information?
   - Can it be reproduced (for bugs)?
   - If not → Add `status:needs-info` label

2. **Add labels**
   - Add `area:*` label(s)
   - Add `priority:*` label
   - Add `data:*` if applicable
   - Add special labels if appropriate

3. **Set custom fields**
   - Set Priority field
   - Set Area field(s)
   - Set Type field
   - Add Estimate if known

4. **Move to appropriate column**
   - **Backlog**: Valid issue, but not prioritized yet
   - **Todo**: High priority, ready to work
   - **Done**: Duplicate, wontfix, or invalid

5. **Remove `status:inbox` label**

#### Prioritization (Backlog → Todo)

Periodically review **Backlog**:

1. Promote high-priority items to **Todo**
2. Update Priority labels and fields
3. Order items in **Todo** by priority
4. Ensure **Todo** has manageable number of items

#### Code Review (In Review → Done)

For each PR in **In Review**:

1. Review code changes
2. Check PR template completeness
3. Verify tests pass
4. Request changes or approve
5. Merge when approved (auto-moves to Done)

## Project Views

Create these saved views for better workflow management:

### By Priority
- Group by: Priority
- Filter: Status = Todo OR In Progress
- Sort: Priority (Critical → Low)

### By Area
- Group by: Area
- Filter: Status ≠ Done
- Sort: Updated (newest first)

### Current Sprint
- Filter: Sprint = "Current"
- Group by: Status
- Sort: Priority

### Needs Triage
- Filter: Status = Inbox
- Sort: Created (oldest first)

### Blocked Items
- Filter: Label = status:blocked
- Sort: Created (oldest first)

### My Work
- Filter: Assignee = @me
- Group by: Status
- Sort: Updated (newest first)

## Best Practices

### For Everyone
- Keep project up to date
- Update status when work state changes
- Use comments for status updates
- Link related issues and PRs

### For Contributors
- Check **Todo** before starting new work
- Assign yourself when starting work
- Keep only 1-2 items **In Progress** at a time
- Update PR status appropriately

### For Maintainers
- Triage **Inbox** daily
- Keep **Todo** curated and prioritized
- Review **In Review** PRs promptly
- Archive **Done** items periodically

## Tips & Tricks

### Quick Filters
Use keyboard shortcut `f` to quickly filter:
- `is:open` - Only open items
- `is:pr` - Only pull requests
- `is:issue` - Only issues
- `label:type:bug` - Only bugs
- `assignee:username` - Assigned to user

### Bulk Operations
- Select multiple items with checkboxes
- Apply labels to multiple items
- Move multiple items between columns
- Archive multiple done items

### Project Insights
- View burndown charts
- Track velocity
- Monitor cycle time
- Identify bottlenecks

## Troubleshooting

### Items not auto-adding to project
- Check repository settings → Actions → General
- Ensure "Allow GitHub Actions to create and approve pull requests" is enabled
- Verify automation rules are configured correctly

### Status not updating automatically
- Check if automation workflows are running
- Review workflow logs in Actions tab
- Ensure project has proper permissions

### Custom fields not syncing with labels
- This requires custom GitHub Actions workflow
- See Step 5 above for workflow template
- Manual sync may be required

## Questions?

Contact project maintainers or ask in Discord for help with the project board.
