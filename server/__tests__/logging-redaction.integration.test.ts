import { randomUUID } from "crypto";

// SEC-LOG-01 — catch blocks must log a redacted, non-sensitive code (via
// safeErrorCode), never the raw error object (which can carry a DB connection
// string, SQL, or PII). Unit-tests the helper + a spy test on the notifications
// failure path (representative of the swapped auth/notifications/firebase sites).

jest.mock("../auth", () => ({
  invalidateProfileCache: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../supabase", () => ({
  supabaseAdmin: { auth: { admin: {} } },
  supabaseClient: { auth: {} },
}));

import { safeErrorCode } from "../errorCode";
import { notifyCommunityMembers } from "../notifications";
import { storage } from "../storage";
import { pool } from "../db";

jest.setTimeout(30000);

describe("safeErrorCode (unit)", () => {
  it("returns the .code when present; never the raw message/object", () => {
    expect(safeErrorCode({ code: "ECONNREFUSED" })).toBe("ECONNREFUSED");
    expect(safeErrorCode({ code: 503 })).toBe("503");
    // A raw Error whose message carries a secret must NOT leak — code only.
    expect(safeErrorCode(new Error("postgres://user:secret@host/db"))).toBe(
      "unknown",
    );
    expect(safeErrorCode(null)).toBe("unknown");
    expect(safeErrorCode("some string")).toBe("unknown");
  });
});

describe("notifications logging redaction (SEC-LOG-01)", () => {
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await pool.end();
  });

  it("logs a redacted { code } and never the raw Error when notifying fails", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    // Force the catch with an error whose message contains sensitive-looking text.
    jest
      .spyOn(storage, "getCommunityMembers")
      .mockRejectedValueOnce(
        new Error("db down: postgres://user:secret@host/db"),
      );

    await notifyCommunityMembers(
      randomUUID(),
      randomUUID(),
      "new_event" as Parameters<typeof notifyCommunityMembers>[2],
      { communityId: "x" },
    );

    expect(errorSpy).toHaveBeenCalled();
    const allArgs = errorSpy.mock.calls.flat();
    // No raw Error object was logged...
    expect(allArgs.some((a) => a instanceof Error)).toBe(false);
    // ...and no argument string leaks the connection string.
    expect(
      allArgs.some((a) => typeof a === "string" && a.includes("secret@host")),
    ).toBe(false);
    // ...a redacted { code } payload WAS logged.
    expect(
      errorSpy.mock.calls.some((call) =>
        call.some((a) => a !== null && typeof a === "object" && "code" in a),
      ),
    ).toBe(true);
  });
});
