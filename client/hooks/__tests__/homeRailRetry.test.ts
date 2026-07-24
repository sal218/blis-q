import {
  isTransientRailError,
  railRetryDelay,
  RAIL_RETRY_MS,
} from "@/hooks/homeRailRetry";

describe("isTransientRailError", () => {
  it("treats network + server errors as transient (retryable)", () => {
    expect(isTransientRailError({ kind: "network" })).toBe(true);
    expect(isTransientRailError({ kind: "server" })).toBe(true);
  });

  it("treats validation + rateLimited + anything else as non-transient", () => {
    expect(isTransientRailError({ kind: "validation" })).toBe(false);
    expect(isTransientRailError({ kind: "rateLimited" })).toBe(false);
    expect(isTransientRailError({ kind: "notFound" })).toBe(false);
  });
});

describe("railRetryDelay", () => {
  it("resolves after the given delay", async () => {
    jest.useFakeTimers();
    let done = false;
    const p = railRetryDelay(RAIL_RETRY_MS).then(() => {
      done = true;
    });
    expect(done).toBe(false);
    await jest.advanceTimersByTimeAsync(RAIL_RETRY_MS);
    await p;
    expect(done).toBe(true);
    jest.useRealTimers();
  });
});
