import express from "express";
import request from "supertest";
import { resendUrlFix } from "../resendUrlFix";

// The %3F URL-fix middleware must log the PATH ONLY — never the query string,
// which can carry a reset-password token or a safe-places `near=lat,lng`
// (COMPLIANCE §9 request-log redaction). No DB — a pure middleware test.

function appWith(log: (msg: string) => void) {
  const app = express();
  app.use(resendUrlFix(log));
  app.get("/api/v1/safe-places", (_req, res) => res.json({ ok: true }));
  return app;
}

describe("resendUrlFix middleware", () => {
  it("302-redirects a %3F-encoded URL to a real '?'", async () => {
    const res = await request(appWith(() => {}))
      .get("/api/v1/safe-places%3Fnear=52.1,21.0")
      .redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/api/v1/safe-places?near=52.1,21.0");
  });

  it("logs the path only — never the near coordinates", async () => {
    const logs: string[] = [];
    await request(appWith((m) => logs.push(m)))
      .get("/api/v1/safe-places%3Fnear=52.1,21.0")
      .redirects(0);
    const line = logs.join("\n");
    expect(line).toContain("/api/v1/safe-places");
    expect(line).not.toContain("near="); // no query at all
    expect(line).not.toContain("52.1"); // latitude never logged
    expect(line).not.toContain("21.0"); // longitude never logged
  });

  it("also keeps a reset-password token out of the log", async () => {
    const logs: string[] = [];
    await request(appWith((m) => logs.push(m)))
      .get("/reset-password%3Ftoken=SECRET_TOKEN_VALUE")
      .redirects(0);
    expect(logs.join("\n")).not.toContain("SECRET_TOKEN_VALUE");
  });

  it("passes through URLs without %3F and logs nothing", async () => {
    const logs: string[] = [];
    const res = await request(appWith((m) => logs.push(m)))
      .get("/api/v1/safe-places")
      .redirects(0);
    expect(res.status).toBe(200);
    expect(logs).toHaveLength(0);
  });
});
