import { describe, it, expect } from "vitest";
import { testDb } from "../setup.js";
import { emails } from "../../src/db/schema/emails.js";
import { eq } from "drizzle-orm";

describe("emails table", () => {
  it("inserts and retrieves an email", async () => {
    const email = {
      id: "msg_001",
      threadId: "thread_001",
      from: "alice@example.com",
      to: "me@example.com",
      subject: "Hello",
      snippet: "Hey there...",
      body: "Hey there, how are you?",
      date: new Date("2026-03-30T10:00:00Z"),
      labels: ["INBOX", "UNREAD"],
      isRead: false,
      isArchived: false,
    };

    await testDb.insert(emails).values(email);
    const result = await testDb.select().from(emails).where(eq(emails.id, "msg_001"));

    expect(result).toHaveLength(1);
    expect(result[0].subject).toBe("Hello");
    expect(result[0].labels).toEqual(["INBOX", "UNREAD"]);
    expect(result[0].isRead).toBe(false);
  });

  it("updates email read status", async () => {
    await testDb.insert(emails).values({
      id: "msg_002",
      threadId: "thread_002",
      from: "bob@example.com",
      to: "me@example.com",
      subject: "Update",
      date: new Date("2026-03-30T11:00:00Z"),
    });

    await testDb.update(emails).set({ isRead: true }).where(eq(emails.id, "msg_002"));
    const result = await testDb.select().from(emails).where(eq(emails.id, "msg_002"));

    expect(result[0].isRead).toBe(true);
  });

  it("filters unread emails", async () => {
    await testDb.insert(emails).values([
      {
        id: "msg_003",
        threadId: "thread_003",
        from: "alice@example.com",
        to: "me@example.com",
        subject: "Read email",
        date: new Date("2026-03-30T10:00:00Z"),
        isRead: true,
      },
      {
        id: "msg_004",
        threadId: "thread_004",
        from: "bob@example.com",
        to: "me@example.com",
        subject: "Unread email",
        date: new Date("2026-03-30T11:00:00Z"),
        isRead: false,
      },
    ]);

    const unread = await testDb
      .select()
      .from(emails)
      .where(eq(emails.isRead, false));

    expect(unread).toHaveLength(1);
    expect(unread[0].id).toBe("msg_004");
  });
});
