import { http, HttpResponse } from "msw";

// --- Gmail API mocks ---

export const gmailHandlers = [
  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages", ({ request }) => {
    return HttpResponse.json({
      messages: [
        { id: "msg_gmail_001", threadId: "thread_gmail_001" },
        { id: "msg_gmail_002", threadId: "thread_gmail_002" },
      ],
      resultSizeEstimate: 2,
    });
  }),

  http.get("https://gmail.googleapis.com/gmail/v1/users/me/messages/:id", ({ params }) => {
    const id = params.id as string;
    const isGithub = id === "msg_gmail_002";

    return HttpResponse.json({
      id,
      threadId: isGithub ? "thread_gmail_002" : "thread_gmail_001",
      snippet: isGithub ? "Review requested on PR #42" : "Hey, can we sync up?",
      labelIds: ["INBOX", "UNREAD"],
      payload: {
        headers: [
          { name: "From", value: isGithub ? "notifications@github.com" : "alice@example.com" },
          { name: "To", value: "me@example.com" },
          { name: "Subject", value: isGithub ? "[acme/widget] Add feature (PR #42)" : "Quick sync" },
          { name: "Date", value: "Mon, 30 Mar 2026 10:00:00 +0000" },
        ],
        body: { data: btoa(isGithub ? "Please review PR #42" : "Hey, can we sync up tomorrow?") },
      },
      internalDate: "1743328800000",
    });
  }),

  http.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/:id/modify", () => {
    return HttpResponse.json({ id: "msg_gmail_001", labelIds: [] });
  }),
];

// --- GitHub API mocks ---

export const githubHandlers = [
  http.get("https://api.github.com/search/issues", ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || "";

    if (q.includes("review-requested")) {
      return HttpResponse.json({
        total_count: 1,
        items: [
          {
            id: 1001,
            node_id: "PR_node_gh_001",
            number: 42,
            title: "Add feature X",
            state: "open",
            draft: false,
            user: { login: "alice" },
            pull_request: { url: "https://api.github.com/repos/acme/widget/pulls/42" },
            repository_url: "https://api.github.com/repos/acme/widget",
          },
        ],
      });
    }

    return HttpResponse.json({
      total_count: 1,
      items: [
        {
          id: 2001,
          node_id: "I_node_gh_001",
          number: 10,
          title: "Bug: login broken",
          state: "open",
          user: { login: "carol" },
          assignees: [{ login: "me" }],
          labels: [{ name: "bug" }],
          repository_url: "https://api.github.com/repos/acme/widget",
        },
      ],
    });
  }),

  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number", () => {
    return HttpResponse.json({
      id: 1001,
      node_id: "PR_node_gh_001",
      number: 42,
      title: "Add feature X",
      state: "open",
      draft: false,
      user: { login: "alice" },
      head: { ref: "feature-x" },
      base: { ref: "main" },
      body: "This adds feature X",
      additions: 150,
      deletions: 30,
      changed_files: 2,
      merged_at: null,
      merged_by: null,
      requested_reviewers: [{ login: "bob" }, { login: "carol" }],
    });
  }),

  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number/files", () => {
    return HttpResponse.json([
      { filename: "src/feature.ts", additions: 100, deletions: 20 },
      { filename: "tests/feature.test.ts", additions: 50, deletions: 10 },
    ]);
  }),

  http.get("https://api.github.com/repos/:owner/:repo/commits/:ref/status", () => {
    return HttpResponse.json({ state: "success" });
  }),

  http.get("https://api.github.com/repos/:owner/:repo/pulls/:number/reviews", () => {
    return HttpResponse.json([]);
  }),
];

// --- Todoist API mocks ---

export const todoistHandlers = [
  http.get("https://api.todoist.com/rest/v2/tasks", () => {
    return HttpResponse.json([
      {
        id: "td_api_001",
        content: "Review Eight Arms PR",
        description: "Check schema changes",
        project_id: "proj_001",
        priority: 4,
        due: { date: "2026-03-31", datetime: "2026-03-31T17:00:00Z" },
        labels: ["code-review"],
        is_completed: false,
      },
      {
        id: "td_api_002",
        content: "Write documentation",
        description: "",
        project_id: "proj_002",
        priority: 3,
        due: null,
        labels: [],
        is_completed: false,
      },
    ]);
  }),

  http.get("https://api.todoist.com/rest/v2/projects", () => {
    return HttpResponse.json([
      { id: "proj_001", name: "Work" },
      { id: "proj_002", name: "Personal" },
    ]);
  }),
];

export const allHandlers = [...gmailHandlers, ...githubHandlers, ...todoistHandlers];
