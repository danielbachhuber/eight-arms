import { describe, it, expect } from "vitest";
import { app } from "../src/server.js";

describe("server", () => {
  it("returns 200 on health check", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});
