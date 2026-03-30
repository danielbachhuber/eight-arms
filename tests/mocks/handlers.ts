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
  http.get("https://api.todoist.com/api/v1/tasks", () => {
    return HttpResponse.json({
      results: [
        {
          id: "td_api_001",
          user_id: "user_001",
          content: "Review Eight Arms PR",
          description: "Check schema changes",
          project_id: "proj_001",
          section_id: null,
          parent_id: null,
          added_by_uid: null,
          assigned_by_uid: null,
          responsible_uid: null,
          priority: 4,
          due: { date: "2026-03-31", datetime: "2026-03-31T17:00:00Z", is_recurring: false, string: "Mar 31" },
          labels: ["code-review"],
          checked: false,
          is_deleted: false,
          is_completed: false,
          added_at: "2026-03-29T10:00:00Z",
          completed_at: null,
          updated_at: "2026-03-29T10:00:00Z",
          child_order: 1,
          day_order: 1,
          is_collapsed: false,
          deadline: null,
          duration: null,
        },
        {
          id: "td_api_002",
          user_id: "user_001",
          content: "Write documentation",
          description: "",
          project_id: "proj_002",
          section_id: null,
          parent_id: null,
          added_by_uid: null,
          assigned_by_uid: null,
          responsible_uid: null,
          priority: 3,
          due: null,
          labels: [],
          checked: false,
          is_deleted: false,
          is_completed: false,
          added_at: "2026-03-29T10:00:00Z",
          completed_at: null,
          updated_at: "2026-03-29T10:00:00Z",
          child_order: 2,
          day_order: 2,
          is_collapsed: false,
          deadline: null,
          duration: null,
        },
      ],
      next_cursor: null,
    });
  }),

  http.get("https://api.todoist.com/api/v1/projects", () => {
    return HttpResponse.json({
      results: [
        {
          id: "proj_001",
          name: "Work",
          can_assign_tasks: false,
          child_order: 1,
          color: "blue",
          created_at: "2026-01-01T00:00:00Z",
          is_archived: false,
          is_deleted: false,
          is_favorite: false,
          is_frozen: false,
          updated_at: "2026-01-01T00:00:00Z",
          view_style: "list",
          default_order: 1,
          description: "",
          is_collapsed: false,
          is_shared: false,
          parent_id: null,
        },
        {
          id: "proj_002",
          name: "Personal",
          can_assign_tasks: false,
          child_order: 2,
          color: "green",
          created_at: "2026-01-01T00:00:00Z",
          is_archived: false,
          is_deleted: false,
          is_favorite: false,
          is_frozen: false,
          updated_at: "2026-01-01T00:00:00Z",
          view_style: "list",
          default_order: 2,
          description: "",
          is_collapsed: false,
          is_shared: false,
          parent_id: null,
        },
      ],
      next_cursor: null,
    });
  }),
];

export const allHandlers = [...gmailHandlers, ...githubHandlers, ...todoistHandlers];
