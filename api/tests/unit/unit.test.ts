import { randomUUID } from "node:crypto";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
process.env.DATABASE_URL = "postgres://unused:unused@localhost/unused";
process.env.RABBITMQ_URL = "amqp://localhost";
const { canTransition, eventSchema } = await import("../../src/cases/domain.js");
const { processEvent } = await import("../../src/messaging/consumer.js");
const { createApp } = await import("../../src/http/app.js");
const event = {
  eventId: randomUUID(),
  eventType: "CaseCreated.v1" as const,
  schemaVersion: 1 as const,
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
  payload: { caseId: randomUUID() },
};
describe("domain and consumer contract", () => {
  it("accepts only forward adjacent transitions", () => {
    const statuses = ["OPEN", "TRIAGE", "ASSIGNED", "RESOLVED"] as const;
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        expect(canTransition(statuses[i], statuses[j])).toBe(j === i + 1);
  });
  it("requires a valid versioned envelope", () => {
    expect(eventSchema.safeParse({ ...event, schemaVersion: 2 }).success).toBe(
      false,
    );
  });
  it("acks only after save completes", async () => {
    const ack = vi.fn();
    let completeSave!: (saved: boolean) => void;
    const saving = new Promise<boolean>((resolve) => {
      completeSave = resolve;
    });
    const processing = processEvent(event, () => saving, ack);
    await Promise.resolve();
    expect(ack).not.toHaveBeenCalled();
    completeSave(true);
    await processing;
    expect(ack).toHaveBeenCalledOnce();
  });
  it("does not ack when persistence fails", async () => {
    const ack = vi.fn();
    await expect(
      processEvent(
        event,
        async () => {
          throw new Error("db down");
        },
        ack,
      ),
    ).rejects.toThrow();
    expect(ack).not.toHaveBeenCalled();
  });
  it("safely acks an already persisted duplicate", async () => {
    const ack = vi.fn();
    await processEvent(event, async () => false, ack);
    expect(ack).toHaveBeenCalledOnce();
  });
});
describe("HTTP validation", () => {
  it("rejects unknown fields and preserves correlation ID", async () => {
    const correlationId = randomUUID();
    const result = await request(createApp())
      .post("/api/cases")
      .set("x-correlation-id", correlationId)
      .send({ title: "Synthetic", description: "Demo", patient: "forbidden" });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe("VALIDATION_ERROR");
    expect(result.headers["x-correlation-id"]).toBe(correlationId);
  });
  it("rejects malformed IDs and pagination", async () => {
    expect(
      (await request(createApp()).get("/api/cases/not-a-uuid")).status,
    ).toBe(400);
    expect(
      (await request(createApp()).get("/api/cases?pageSize=101")).status,
    ).toBe(400);
  });
  it("live does not require dependencies", async () => {
    expect((await request(createApp()).get("/health/live")).status).toBe(200);
  });
});
