import { eq, and, like, desc, sql } from "drizzle-orm";
import type { Database } from "../db/index.js";
import { emails } from "../db/schema/emails.js";
import { githubPullRequests, githubIssues } from "../db/schema/github.js";
import { todoistTasks } from "../db/schema/todoist.js";
import { emailGithubLinks, workNotes } from "../db/schema/work.js";

// --- Emails ---

export interface ListEmailsParams {
  unread?: boolean;
  hasGithubLink?: boolean;
  limit?: number;
  offset?: number;
}

export async function listEmails(db: Database, params: ListEmailsParams = {}) {
  // Summary fields + snippet for prioritization (no full body — use getEmail for that)
  let query = db.select({
    id: emails.id,
    threadId: emails.threadId,
    from: emails.from,
    subject: emails.subject,
    snippet: emails.snippet,
    date: emails.date,
    isRead: emails.isRead,
  }).from(emails).orderBy(desc(emails.date));

  const conditions = [];
  if (params.unread !== undefined) {
    conditions.push(eq(emails.isRead, !params.unread));
  }
  conditions.push(eq(emails.isArchived, false));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  if (params.offset) {
    query = query.offset(params.offset) as any;
  }

  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  const results = await query;

  if (params.hasGithubLink) {
    const links = await db.select().from(emailGithubLinks);
    const linkedThreadIds = new Set(links.map((l) => l.emailThreadId));
    return results.filter((e) => linkedThreadIds.has(e.threadId));
  }

  return results;
}

export async function getEmail(db: Database, id: string) {
  const [email] = await db.select().from(emails).where(eq(emails.id, id));
  if (!email) return null;

  // Get linked GitHub data
  const links = await db
    .select()
    .from(emailGithubLinks)
    .where(eq(emailGithubLinks.emailThreadId, email.threadId));

  const githubData = [];
  for (const link of links) {
    if (link.sourceType === "pull_request") {
      const [pr] = await db
        .select()
        .from(githubPullRequests)
        .where(
          and(
            eq(githubPullRequests.repo, link.repo),
            eq(githubPullRequests.number, link.number)
          )
        );
      if (pr) githubData.push({ type: "pull_request" as const, data: pr });
    } else {
      const [issue] = await db
        .select()
        .from(githubIssues)
        .where(
          and(
            eq(githubIssues.repo, link.repo),
            eq(githubIssues.number, link.number)
          )
        );
      if (issue) githubData.push({ type: "issue" as const, data: issue });
    }
  }

  return { ...email, github: githubData };
}

export async function archiveEmail(db: Database, id: string) {
  await db
    .update(emails)
    .set({ isArchived: true, labels: sql`"labels" - 'INBOX'` })
    .where(eq(emails.id, id));
}

// --- GitHub ---

export interface ListPullsParams {
  repo?: string;
  reviewStatus?: string;
  limit?: number;
}

export async function listPulls(db: Database, params: ListPullsParams = {}) {
  const conditions = [];
  if (params.repo) {
    conditions.push(eq(githubPullRequests.repo, params.repo));
  }
  if (params.reviewStatus) {
    conditions.push(eq(githubPullRequests.reviewDecision, params.reviewStatus));
  }

  let query = db
    .select()
    .from(githubPullRequests)
    .orderBy(desc(githubPullRequests.syncedAt));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getPull(db: Database, id: string) {
  const [pr] = await db
    .select()
    .from(githubPullRequests)
    .where(eq(githubPullRequests.id, id));
  return pr || null;
}

export interface ListIssuesParams {
  repo?: string;
  state?: string;
  limit?: number;
}

export async function listIssues(db: Database, params: ListIssuesParams = {}) {
  const conditions = [];
  if (params.repo) {
    conditions.push(eq(githubIssues.repo, params.repo));
  }
  if (params.state) {
    conditions.push(eq(githubIssues.state, params.state));
  }

  let query = db
    .select()
    .from(githubIssues)
    .orderBy(desc(githubIssues.syncedAt));

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }
  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getIssue(db: Database, id: string) {
  const [issue] = await db
    .select()
    .from(githubIssues)
    .where(eq(githubIssues.id, id));
  return issue || null;
}

// --- Todoist ---

export interface ListTodoistTasksParams {
  project?: string;
  priority?: number;
  limit?: number;
}

export async function listTodoistTasks(
  db: Database,
  params: ListTodoistTasksParams = {}
) {
  const conditions = [eq(todoistTasks.isCompleted, false)];
  if (params.project) {
    conditions.push(eq(todoistTasks.projectName, params.project));
  }
  if (params.priority) {
    conditions.push(eq(todoistTasks.priority, params.priority));
  }

  let query = db
    .select()
    .from(todoistTasks)
    .where(and(...conditions))
    .orderBy(todoistTasks.priority, todoistTasks.dueDate);

  if (params.limit) {
    query = query.limit(params.limit) as any;
  }

  return query;
}

export async function getTodoistTask(db: Database, id: string) {
  const [task] = await db
    .select()
    .from(todoistTasks)
    .where(eq(todoistTasks.id, id));
  return task || null;
}

// --- Work (unified view) ---

export interface ListWorkParams {
  repo?: string;
  sourceType?: string;
  groomed?: boolean;
  limit?: number;
}

export async function listWork(db: Database, params: ListWorkParams = {}) {
  // Fetch all sources
  const pullsPromise = params.sourceType && params.sourceType !== "pull_request"
    ? Promise.resolve([])
    : listPulls(db, { repo: params.repo });

  const issuesPromise = params.sourceType && params.sourceType !== "issue"
    ? Promise.resolve([])
    : listIssues(db, { repo: params.repo });

  const tasksPromise = params.sourceType && params.sourceType !== "todoist_task"
    ? Promise.resolve([])
    : listTodoistTasks(db);

  const emailsPromise = params.sourceType && params.sourceType !== "email"
    ? Promise.resolve([])
    : listEmails(db, { unread: true });

  const [pulls, issues, tasks, unreadEmails] = await Promise.all([
    pullsPromise,
    issuesPromise,
    tasksPromise,
    emailsPromise,
  ]);

  // Get all work notes
  const notes = await db.select().from(workNotes);
  const notesMap = new Map(
    notes.map((n) => [`${n.sourceType}:${n.sourceId}`, n])
  );

  // Build unified list
  const items: {
    sourceType: string;
    sourceId: string;
    title: string;
    repo?: string;
    source: Record<string, unknown>;
    note: typeof notes[0] | null;
  }[] = [];

  for (const pr of pulls) {
    items.push({
      sourceType: "pull_request",
      sourceId: pr.id,
      title: `${pr.repo}#${pr.number}: ${pr.title}`,
      repo: pr.repo,
      source: pr as any,
      note: notesMap.get(`pull_request:${pr.id}`) || null,
    });
  }

  for (const issue of issues) {
    items.push({
      sourceType: "issue",
      sourceId: issue.id,
      title: `${issue.repo}#${issue.number}: ${issue.title}`,
      repo: issue.repo,
      source: issue as any,
      note: notesMap.get(`issue:${issue.id}`) || null,
    });
  }

  for (const task of tasks) {
    items.push({
      sourceType: "todoist_task",
      sourceId: task.id,
      title: task.content,
      source: task as any,
      note: notesMap.get(`todoist_task:${task.id}`) || null,
    });
  }

  for (const email of unreadEmails) {
    items.push({
      sourceType: "email",
      sourceId: email.id,
      title: `${email.from}: ${email.subject}`,
      source: email as any,
      note: notesMap.get(`email:${email.id}`) || null,
    });
  }

  // Filter by groomed status
  if (params.groomed !== undefined) {
    return items.filter((item) =>
      params.groomed ? item.note !== null : item.note === null
    );
  }

  if (params.limit) {
    return items.slice(0, params.limit);
  }

  return items;
}

// --- Work Notes ---

export async function getWorkNotes(
  db: Database,
  sourceType: string,
  sourceId: string
) {
  const [note] = await db
    .select()
    .from(workNotes)
    .where(
      and(eq(workNotes.sourceType, sourceType), eq(workNotes.sourceId, sourceId))
    );
  return note || null;
}

export async function saveWorkNotes(
  db: Database,
  data: {
    sourceType: string;
    sourceId: string;
    notes: string;
    estimate?: string;
    isActionable?: boolean;
  }
) {
  const existing = await getWorkNotes(db, data.sourceType, data.sourceId);

  if (existing) {
    await db
      .update(workNotes)
      .set({
        notes: data.notes,
        estimate: data.estimate ?? existing.estimate,
        isActionable: data.isActionable ?? existing.isActionable,
        groomedAt: new Date(),
      })
      .where(eq(workNotes.id, existing.id));
  } else {
    await db.insert(workNotes).values({
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      notes: data.notes,
      estimate: data.estimate || null,
      isActionable: data.isActionable || false,
    });
  }
}
