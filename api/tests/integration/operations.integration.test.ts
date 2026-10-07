import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { pool } from "../../src/platform/db.js";
import { applyMigrations } from "../../src/platform/migrations.js";
import { createCase } from "../../src/cases/cases.js";
import { operations, delivery } from "../../src/operations/operations.js";
import { relayOne } from "../../src/messaging/relay.js";
import { saveNotification } from "../../src/messaging/consumer.js";
// This suite shares application tables with the reliability suite; run files sequentially.
beforeAll(async () => {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
    throw new Error("Disposable services required");
  await applyMigrations(pool, new URL("../../migrations/", import.meta.url));
  await pool.query(
    "TRUNCATE notifications,outbox,case_history,cases RESTART IDENTITY CASCADE",
  );
});
afterAll(async () => {
  await pool.end();
});
it("tracks a pending event through publication and a saved notification", async () => {
  const correlationId = randomUUID();
  const created = await createCase(
    { title: "Synthetic", description: "Demo" },
    correlationId,
  );
  const [pending] = await delivery(created.id);
  expect(pending.state).toBe("pendingPublication");
  expect(pending.correlationId).toBe(correlationId);
  await relayOne(async () => {});
  expect((await delivery(created.id))[0].state).toBe("awaitingNotification");
  await saveNotification({
    eventId: pending.eventId,
    eventType: "CaseCreated.v1",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId,
    payload: { caseId: created.id },
  });
  expect((await delivery(created.id))[0].state).toBe("completed");
});
it("reports durable counts even while broker inspection fails", async () => {
  const snapshot = await operations(async () => ({
    status: "unavailable",
    ready: null,
    consumers: null,
    retryReady: null,
    deadLetters: null,
  }));
  expect(snapshot.database).toBe("available");
  expect(snapshot.broker.status).toBe("unavailable");
  expect(snapshot.outbox.published).toBe(1);
  expect(snapshot.notifications).toBe(1);
});
