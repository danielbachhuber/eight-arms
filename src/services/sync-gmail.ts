import type { Database } from "../db/index.js";
import { emails } from "../db/schema/emails.js";
import { emailGithubLinks } from "../db/schema/work.js";
import { getCredentials } from "./credentials.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gmailFetch(accessToken: string, path: string, params?: Record<string, string>) {
  const url = new URL(`${GMAIL_API}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Gmail API error (${res.status}): ${await res.text()}`);
  }

  return res.json();
}

export async function syncGmail(db: Database): Promise<{ synced: number }> {
  const cred = await getCredentials(db, "gmail");
  if (!cred) throw new Error("Gmail not connected");

  const listData = await gmailFetch(cred.accessToken, "/messages", {
    q: "in:inbox",
    maxResults: "100",
  });

  const messageIds: { id: string; threadId: string }[] = listData.messages || [];
  if (messageIds.length === 0) return { synced: 0 };

  let synced = 0;

  for (const { id } of messageIds) {
    const msg = await gmailFetch(cred.accessToken, `/messages/${id}`, {
      format: "full",
    });

    const headers = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h: { name: string; value: string }) => h.name === name)?.value || "";

    const from = getHeader("From");
    const to = getHeader("To");
    const subject = getHeader("Subject");
    const dateStr = getHeader("Date");
    const body = msg.payload?.body?.data
      ? Buffer.from(msg.payload.body.data, "base64").toString("utf-8")
      : "";

    const labelIds: string[] = msg.labelIds || [];

    await db
      .insert(emails)
      .values({
        id: msg.id,
        threadId: msg.threadId,
        from,
        to,
        subject,
        snippet: msg.snippet || "",
        body,
        date: dateStr ? new Date(dateStr) : new Date(parseInt(msg.internalDate)),
        labels: labelIds,
        isRead: !labelIds.includes("UNREAD"),
        isArchived: !labelIds.includes("INBOX"),
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emails.id,
        set: {
          labels: labelIds,
          isRead: !labelIds.includes("UNREAD"),
          isArchived: !labelIds.includes("INBOX"),
          syncedAt: new Date(),
        },
      });

    if (from.includes("notifications@github.com")) {
      await detectAndLinkGithub(db, msg.threadId, subject);
    }

    synced++;
  }

  return { synced };
}

async function detectAndLinkGithub(
  db: Database,
  threadId: string,
  subject: string
): Promise<void> {
  const repoMatch = subject.match(/\[([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)\]/);
  if (!repoMatch) return;
  const repo = repoMatch[1];

  const prMatch = subject.match(/\(PR #(\d+)\)/);
  if (prMatch) {
    const number = parseInt(prMatch[1]);
    await db
      .insert(emailGithubLinks)
      .values({
        emailThreadId: threadId,
        sourceType: "pull_request",
        sourceId: `${repo}#${number}`,
        repo,
        number,
      })
      .onConflictDoNothing();
    return;
  }

  const issueMatch = subject.match(/\(Issue #(\d+)\)/);
  if (issueMatch) {
    const number = parseInt(issueMatch[1]);
    await db
      .insert(emailGithubLinks)
      .values({
        emailThreadId: threadId,
        sourceType: "issue",
        sourceId: `${repo}#${number}`,
        repo,
        number,
      })
      .onConflictDoNothing();
  }
}
