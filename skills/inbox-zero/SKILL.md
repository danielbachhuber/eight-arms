---
name: inbox-zero
description: Use when the user invokes /inbox-zero to process their Gmail inbox to zero unread messages
user_invocable: true
---

# Inbox Zero

Process unread inbox emails, most important first. Uses the Eight Arms MCP server for data access.

## IMPORTANT: Use Eight Arms MCP Tools Only

This skill uses the **eight-arms** MCP server (http://localhost:3210/mcp). Use ONLY the eight-arms MCP tools listed below — do NOT use the Gmail MCP plugin, Todoist MCP plugin, or any other MCP server for data access.

**Eight Arms tools to use:** `list_emails`, `get_email`, `archive_email`, `list_pulls`, `get_pull`, `list_issues`, `get_issue`, `list_todoist_tasks`, `get_todoist_task`, `list_work`, `get_work_notes`, `save_work_notes`, `trigger_sync`

## Prerequisites

The Eight Arms app must be running (`docker compose up` in the eight-arms directory) with Gmail connected and synced. If data seems stale, call the eight-arms `trigger_sync` tool with `services: ["gmail"]` first.

## Speed

Be fast. Don't over-analyze. Fetch one batch of emails, categorize quickly by subject/sender pattern matching, and present the first archivable group immediately. Don't explain your reasoning — just show the group and ask y/n.

## Workflow

### Step 1: Bulk Archive (Group by Group)

Scan for auto-archivable emails and present them **one group at a time**. Fetch emails with `list_emails` (unread: true). Each email includes `from`, `subject`, `snippet`, and a `github` field with linked PR/issue state (OPEN/MERGED/CLOSED, reviewDecision, isDraft). Use this context to categorize — don't need to call `get_email` for triage.

Call `list_emails` with `unread: true` to get unread inbox emails. The tool returns batches of 20 — use `offset` to paginate through all of them. Each result includes `id`, `from`, `subject`, `snippet`, and `date`.

Categorize emails into archivable groups. Then present each group sequentially, archiving as you go:

**Group order:**
1. **Merge notifications** — subject contains "merged" and sender is `notifications@github.com`
2. **Thread replies on merged PRs** — follow-up comments on PRs that are already merged
3. **Closed PR notifications** — PRs closed without merging
4. **Closed issue notifications** — issues marked as completed
5. **Canceled calendar events** — event cancellation notices
6. **Accepted calendar invites** — invites the user already responded to
7. **CI bot notifications** — build reports, visual diff reports, preview comments
8. **Automated digests/reminders** — Postmark digests, Todoist reminders, etc.

**For each group, present like this:**

> **Merge notifications (3 emails)**
> - PR #3576 — "Fix vertical alignment..." (merged)
> - PR #3465 — "Update dependencies" (merged)
> - PR #3559 — "Refactor auth module" (merged)
>
> Archive these 3? (y/n)

Wait for user response. If "y", archive them immediately with `archive_email` for each, then move to the next group. If "n", skip to the next group (these emails stay in inbox for one-by-one processing).

After all groups are processed, report how many were archived and how many remain, then move to Step 2.

**Do NOT present all groups at once.** One group at a time, archive, move on.

### Step 2: Prioritize Remaining Emails

From the remaining unread emails, prioritize:
1. Emails from real people (not automated/bot senders) — actionable and urgent first
2. GitHub PR notifications where the user is an **explicit requested reviewer** — these block others
3. Other GitHub notifications (mentions, issue updates)
4. Automated/marketing emails

For GitHub notification emails, use the linked PR/issue data from `get_email` to understand context (PR state, review status, CI, files changed).

### Step 3: Process One at a Time

Present the highest priority email:

**Format:**
```
Thread 1 of N (X unread)

From: [sender]
Subject: [subject]
Date: [date]

[Detailed summary using exact quotes from the email. Names, decisions,
questions asked, code changes mentioned. Let the sender's words do the talking.]

[For PR notifications: repo, PR number, author, state, review status,
CI status, files changed count, requested reviewers. Link to PR.]

Suggested action: [your recommendation with reasoning]

1. Archive — [specific reason this can be archived]
2. Reply — [describe what the reply would say]
3. Task & Archive — [describe the specific Todoist task]
4. Skip — leave in inbox
[5. Review — enter PR review mode (for PRs needing review)]
[6. Merge — merge this PR (for approved PRs)]
```

**Action guidelines:**
- Choose 3-5 actions that make sense for this specific email. Do NOT use a fixed set.
- Tailor action descriptions to the email (e.g., "Reply to Sarah about the deploy timeline" not generic "Reply")
- Always present as a numbered list so the user can reply with just a number

### Step 4: Execute Action

**Archive:** Call `archive_email` with the email ID.

**Reply:** Draft the reply text and present it for approval. Do NOT send — use `gws gmail users drafts create` to create a draft.

**Task & Archive:** Create a Todoist task via MCP (`td task add` or the Todoist MCP if available), then call `archive_email`.

**Skip:** Move to the next email.

**Merge:** Run `gh pr merge <number> -R <owner/repo>` via shell, then archive the notification.

**Review:** Enter interactive PR review mode (see below).

### Step 5: Repeat

After executing the action, immediately present the next email. Continue until all emails are processed or the user stops.

## Interactive PR Review Mode

When the user chooses to review a PR:

1. **Show files** with change stats as a numbered list:
   ```
   PR #42: Add feature X (acme/widget)
   Files changed:
   1. src/feature.ts (+100 -20)
   2. tests/feature.test.ts (+50 -10)
   ```

2. User picks a file number to view its diff via `gh pr diff <number> -R <owner/repo> -- <path>`

3. After viewing, offer:
   1. **Comment on line** — specify line and comment, added to pending review
   2. **Next file** — view the next file
   3. **Back to files** — return to file list
   4. **Checkout locally** — `gh pr checkout <number> -R <owner/repo>` for local exploration
   5. **Submit review** — submit accumulated comments as APPROVE, REQUEST_CHANGES, or COMMENT
   6. **Done** — exit review mode, return to inbox

**Submit review** uses the GitHub GraphQL API:
```
gh api graphql -f query='
  mutation {
    addPullRequestReview(input: {
      pullRequestId: "<nodeId>",
      event: APPROVE,
      body: "Review comment",
      threads: [
        {path: "<file>", line: <lineNum>, side: RIGHT, body: "Comment text"}
      ]
    }) { pullRequestReview { id } }
  }'
```

Get the PR node ID first: `gh pr view <number> -R <owner/repo> --json id -q .id`

## Guidelines

- Process **threads**, not individual messages. If multiple emails are in the same thread, summarize the full thread.
- When drafting a reply, **never send directly**. Always create as a draft.
- If there are more than 20 unread emails, mention the total count and ask if the user wants to process all or cap at a number.
- Group related emails (e.g., multiple notifications from the same PR) and present them together.
- Never include internal reasoning or self-corrections — present clean, confident analysis.
