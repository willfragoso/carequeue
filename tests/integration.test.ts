import { randomUUID } from "node:crypto";
import { applyMigrations } from "../src/migrations.js";
import { setTimeout as delay } from "node:timers/promises";
import { beforeAll, afterAll, beforeEach, describe, it, expect } from "vitest";
import request from "supertest";
import type { GetMessage } from "amqplib";
// Dedicated disposable database and broker required. Never point at shared data.
const { pool, transaction } = await import("../src/db.js");
const { createCase, changeStatus } = await import("../src/cases.js");
const { createApp } = await import("../src/app.js");
const { relayOne } = await import("../src/relay.js");
const { saveNotification, handleMessage } = await import("../src/consumer.js");
const { connectBroker, publishConfirmed, queues } =
  await import("../src/broker.js");
const { config } = await import("../src/config.js");
let broker: Awaited<ReturnType<typeof connectBroker>>;
async function next(queue: string): Promise<GetMessage> {
  for (let i = 0; i < 100; i++) {
    const message = await broker.channel.get(queue, { noAck: false });
    if (message) return message;
    await delay(100);
  }
  throw new Error("Timed out waiting for " + queue);
}
beforeAll(async () => {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
    throw new Error(
      "Set ALLOW_DESTRUCTIVE_TESTS=true only with disposable test services",
    );
  await applyMigrations(pool, new URL("../migrations/", import.meta.url));
  broker = await connectBroker();
}, 20000);
beforeEach(async () => {
  await pool.query(
    "TRUNCATE notifications,outbox,case_history,cases RESTART IDENTITY CASCADE",
  );
  for (const queue of Object.values(queues))
    await broker.channel.purgeQueue(queue);
});
afterAll(async () => {
  await broker?.connection.close();
  await pool.end();
});
describe("real PostgreSQL and RabbitMQ", () => {
  it("creates case, history and outbox atomically; rejects invalid transition over HTTP", async () => {
    const response = await request(createApp())
      .post("/api/cases")
      .send({ title: "Synthetic case", description: "Fictional demo" });
    expect(response.status).toBe(201);
    expect((await pool.query("SELECT * FROM outbox")).rowCount).toBe(1);
    expect((await pool.query("SELECT * FROM case_history")).rowCount).toBe(1);
    expect(
      (
        await request(createApp())
          .patch("/api/cases/" + response.body.data.id + "/status")
          .send({ status: "RESOLVED" })
      ).status,
    ).toBe(409);
    await changeStatus(response.body.data.id, "TRIAGE", randomUUID());
    expect((await pool.query("SELECT * FROM case_history")).rowCount).toBe(2);
  });
  it("rolls back case and history if outbox insert fails", async () => {
    await pool.query(
      "CREATE FUNCTION reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test failure'; END $$",
    );
    await pool.query(
      "CREATE TRIGGER reject_outbox BEFORE INSERT ON outbox FOR EACH ROW EXECUTE FUNCTION reject_outbox()",
    );
    try {
      await expect(
        createCase({ title: "Synthetic", description: "Demo" }, randomUUID()),
      ).rejects.toThrow();
      expect((await pool.query("SELECT * FROM cases")).rowCount).toBe(0);
      expect((await pool.query("SELECT * FROM case_history")).rowCount).toBe(0);
    } finally {
      await pool.query("DROP TRIGGER reject_outbox ON outbox");
      await pool.query("DROP FUNCTION reject_outbox()");
    }
  });
  it("keeps failed publication pending and publishes after broker recovery", async () => {
    await createCase({ title: "Synthetic", description: "Demo" }, randomUUID());
    const disconnected = await connectBroker();
    await disconnected.connection.close();
    await expect(
      relayOne((event) =>
        publishConfirmed(
          disconnected.channel,
          queues.main,
          Buffer.from(JSON.stringify(event)),
        ),
      ),
    ).rejects.toThrow();
    expect(
      (await pool.query("SELECT * FROM outbox WHERE published_at IS NULL"))
        .rowCount,
    ).toBe(1);
    await relayOne((event) =>
      publishConfirmed(
        broker.channel,
        queues.main,
        Buffer.from(JSON.stringify(event)),
      ),
    );
    expect(
      (await pool.query("SELECT * FROM outbox WHERE published_at IS NULL"))
        .rowCount,
    ).toBe(0);
    const message = await next(queues.main);
    await handleMessage(broker.channel, message);
    expect((await pool.query("SELECT * FROM notifications")).rowCount).toBe(1);
  });
  it("redelivery after interrupted worker does not duplicate committed effect", async () => {
    await createCase({ title: "Synthetic", description: "Demo" }, randomUUID());
    await relayOne((event) =>
      publishConfirmed(
        broker.channel,
        queues.main,
        Buffer.from(JSON.stringify(event)),
      ),
    );
    const interrupted = await connectBroker();
    const message = await interrupted.channel.get(queues.main, {
      noAck: false,
    });
    expect(message).toBeTruthy();
    if (!message) throw new Error("Missing message");
    await saveNotification(JSON.parse(message.content.toString()));
    await interrupted.connection.close(); // Result committed but ack lost.
    const redelivered = await next(queues.main);
    expect(redelivered.fields.redelivered).toBe(true);
    await handleMessage(broker.channel, redelivered);
    await publishConfirmed(broker.channel, queues.main, message.content);
    await handleMessage(broker.channel, await next(queues.main));
    expect((await pool.query("SELECT * FROM notifications")).rowCount).toBe(1);
  });
  it("persistent database failure reaches durable DLQ after bounded retries", async () => {
    await publishConfirmed(
      broker.channel,
      queues.main,
      Buffer.from(
        JSON.stringify({
          eventId: randomUUID(),
          eventType: "CaseCreated.v1",
          schemaVersion: 1,
          occurredAt: new Date().toISOString(),
          correlationId: randomUUID(),
          payload: { caseId: randomUUID() },
        }),
      ),
    );
    for (let attempt = 0; attempt <= config.MAX_RETRIES; attempt++)
      await handleMessage(broker.channel, await next(queues.main));
    const dead = await next(queues.dead);
    expect(dead.properties.headers?.["x-retry-count"]).toBe(
      config.MAX_RETRIES + 1,
    );
    broker.channel.ack(dead);
    expect(await broker.channel.get(queues.main)).toBe(false);
  });
  it("database transaction rollback preserves all-or-nothing semantics", async () => {
    await expect(
      transaction(async (client) => {
        await client.query(
          "INSERT INTO cases(id,title,description,status) VALUES($1,'Demo','Synthetic','OPEN')",
          [randomUUID()],
        );
        throw new Error("interrupt");
      }),
    ).rejects.toThrow();
    expect((await pool.query("SELECT * FROM cases")).rowCount).toBe(0);
  });
});
