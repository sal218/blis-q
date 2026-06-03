import { sql } from "drizzle-orm";
import { db, pool } from "../db";

// First integration test: confirms the test database is reachable through the
// Drizzle client. This validates the whole integration harness (env loading +
// real DB connectivity) before feature tests are layered on. Every bug fix
// ships with a regression test alongside it (CLAUDE.md "Testing Rules").
describe("integration health", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("reaches the test database", async () => {
    const result = await db.execute(sql`select 1 as value`);
    expect(result.rows[0]).toEqual({ value: 1 });
  });
});
