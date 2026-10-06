import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import request from "supertest";
import { pool } from "../src/db.js";
import { applyMigrations } from "../src/migrations.js";
import { createCase, listCasesCursor } from "../src/cases.js";
import { createApp } from "../src/app.js";
beforeAll(async () => {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
    throw new Error("Disposable database required");
  await applyMigrations(pool, new URL("../migrations/", import.meta.url));
  await pool.query(
    "TRUNCATE notifications,outbox,case_history,cases RESTART IDENTITY CASCADE",
  );
});
afterAll(async () => {
  await pool.end();
});
it("retains microsecond precision and stable ordering under concurrent inserts", async () => {
  const ids = [];
  for (let index = 0; index < 4; index++)
    ids.push(
      (
        await createCase(
          { title: "Synthetic " + index, description: "Demo" },
          randomUUID(),
        )
      ).id,
    );
  for (let index = 0; index < 4; index++)
    await pool.query(
      "UPDATE cases SET created_at=$2::timestamptz WHERE id=$1",
      [ids[index], "2026-10-06T12:00:00.00000" + index + "Z"],
    );
  const first = await listCasesCursor(undefined, 2);
  expect(first.data.map((row) => row.id)).toEqual([ids[3], ids[2]]);
  await createCase(
    { title: "New synthetic case", description: "Concurrent insert" },
    randomUUID(),
  );
  const second = await listCasesCursor(
    undefined,
    2,
    first.pagination.nextCursor!,
  );
  expect(second.data.map((row) => row.id)).toEqual([ids[1], ids[0]]);
  expect(second.pagination.nextCursor).toBeNull();
  expect(
    new Set([...first.data, ...second.data].map((row) => row.id)).size,
  ).toBe(4);
});
it("rejects changed filters, malformed cursors and mixed pagination modes", async () => {
  const first = await listCasesCursor("OPEN", 1);
  await expect(
    listCasesCursor("TRIAGE", 1, first.pagination.nextCursor!),
  ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  expect(
    (
      await request(createApp()).get(
        "/api/cases?pagination=cursor&cursor=garbage",
      )
    ).status,
  ).toBe(400);
  expect(
    (await request(createApp()).get("/api/cases?pagination=cursor&page=2"))
      .status,
  ).toBe(400);
});
