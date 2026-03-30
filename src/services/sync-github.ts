import { Octokit } from "@octokit/rest";
import type { Database } from "../db/index.js";
import { githubPullRequests, githubIssues } from "../db/schema/github.js";
import { getCredentials } from "./credentials.js";

export async function syncGithub(db: Database): Promise<{ prs: number; issues: number }> {
  const cred = await getCredentials(db, "github");
  if (!cred) throw new Error("GitHub not connected");

  const octokit = new Octokit({ auth: cred.accessToken });

  // Get authenticated user
  const { data: user } = await octokit.users.getAuthenticated();
  const username = user.login;

  const prs = await syncPullRequests(db, octokit, username);
  const issues = await syncIssues(db, octokit, username);

  return { prs, issues };
}

async function syncPullRequests(
  db: Database,
  octokit: Octokit,
  username: string
): Promise<number> {
  // Fetch PRs where user is a requested reviewer
  const { data: searchResult } = await octokit.search.issuesAndPullRequests({
    q: `is:pr is:open review-requested:${username}`,
    per_page: 100,
  });

  let synced = 0;

  for (const item of searchResult.items) {
    // Extract owner/repo from repository_url
    const repoUrl = item.repository_url || "";
    const repoMatch = repoUrl.match(/repos\/(.+)$/);
    if (!repoMatch) continue;
    const repo = repoMatch[1]; // "owner/repo"
    const [owner, repoName] = repo.split("/");

    // Fetch full PR detail
    const { data: pr } = await octokit.pulls.get({
      owner,
      repo: repoName,
      pull_number: item.number,
    });

    // Fetch files
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo: repoName,
      pull_number: item.number,
    });

    // Fetch combined status
    const { data: status } = await octokit.repos.getCombinedStatusForRef({
      owner,
      repo: repoName,
      ref: pr.head.ref,
    });

    await db
      .insert(githubPullRequests)
      .values({
        id: pr.node_id,
        repo,
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || "",
        state: pr.state.toUpperCase(),
        isDraft: pr.draft || false,
        reviewDecision: null, // Would need GraphQL for this
        reviewRequests: (pr.requested_reviewers || []).map((r: any) => r.login),
        additions: pr.additions,
        deletions: pr.deletions,
        files: files.map((f) => ({
          path: f.filename,
          additions: f.additions,
          deletions: f.deletions,
        })),
        ciStatus: status.state,
        branch: pr.head.ref,
        body: pr.body || "",
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        mergedBy: pr.merged_by?.login || null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: githubPullRequests.id,
        set: {
          state: pr.state.toUpperCase(),
          isDraft: pr.draft || false,
          reviewRequests: (pr.requested_reviewers || []).map((r: any) => r.login),
          additions: pr.additions,
          deletions: pr.deletions,
          files: files.map((f) => ({
            path: f.filename,
            additions: f.additions,
            deletions: f.deletions,
          })),
          ciStatus: status.state,
          mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
          mergedBy: pr.merged_by?.login || null,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return synced;
}

async function syncIssues(
  db: Database,
  octokit: Octokit,
  username: string
): Promise<number> {
  const { data: searchResult } = await octokit.search.issuesAndPullRequests({
    q: `is:issue is:open assignee:${username}`,
    per_page: 100,
  });

  let synced = 0;

  for (const item of searchResult.items) {
    const repoUrl = item.repository_url || "";
    const repoMatch = repoUrl.match(/repos\/(.+)$/);
    if (!repoMatch) continue;
    const repo = repoMatch[1];

    await db
      .insert(githubIssues)
      .values({
        id: item.node_id,
        repo,
        number: item.number,
        title: item.title,
        author: item.user?.login || "",
        state: item.state.toUpperCase(),
        assignees: (item.assignees || []).map((a: any) => a.login),
        labels: (item.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
        body: item.body || "",
        closedAt: item.closed_at ? new Date(item.closed_at) : null,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: githubIssues.id,
        set: {
          state: item.state.toUpperCase(),
          assignees: (item.assignees || []).map((a: any) => a.login),
          labels: (item.labels || []).map((l: any) => (typeof l === "string" ? l : l.name)),
          body: item.body || "",
          closedAt: item.closed_at ? new Date(item.closed_at) : null,
          syncedAt: new Date(),
        },
      });

    synced++;
  }

  return synced;
}
