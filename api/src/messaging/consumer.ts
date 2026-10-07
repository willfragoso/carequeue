import { randomUUID } from "node:crypto";
import type { ConsumeMessage, GetMessage, ConfirmChannel } from "amqplib";
import { pool } from "../platform/db.js";
import { eventSchema, type CaseEvent } from "../cases/domain.js";
import { config } from "../platform/config.js";
import { logger } from "../platform/logger.js";
import { publishConfirmed, queues } from "./broker.js";
import { retryQueue, retryDelay } from "./retries.js";
export async function saveNotification(event: CaseEvent) {
  const result = await pool.query(
    "INSERT INTO notifications(id,event_id,case_id) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING",
    [randomUUID(), event.eventId, event.payload.caseId],
  );
  return result.rowCount === 1;
}
export async function processEvent(
  event: CaseEvent,
  save: (event: CaseEvent) => Promise<boolean>,
  ack: () => void,
) {
  logger.info({
    step: "event_consumed",
    eventId: event.eventId,
    correlationId: event.correlationId,
  });
  const inserted = await save(event);
  logger.info({
    step: inserted ? "notification_saved" : "duplicate_detected",
    eventId: event.eventId,
    correlationId: event.correlationId,
  });
  ack();
}
export async function handleMessage(
  channel: ConfirmChannel,
  message: ConsumeMessage | GetMessage,
  save = saveNotification,
) {
  let event: CaseEvent | undefined;
  try {
    event = eventSchema.parse(JSON.parse(message.content.toString()));
    await processEvent(event, save, () => channel.ack(message));
  } catch {
    const raw = message.properties.headers?.["x-retry-count"];
    const attempt =
      typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
    logger.warn({
      step: "consumer_failure",
      eventId: event?.eventId,
      correlationId: event?.correlationId,
      attempt,
      retryDelayMs:
        attempt < config.MAX_RETRIES ? retryDelay(attempt + 1) : null,
    });
    // Confirm the durable retry/DLQ copy before acknowledging the original.
    await publishConfirmed(
      channel,
      attempt < config.MAX_RETRIES ? retryQueue(attempt + 1) : queues.dead,
      message.content,
      { "x-retry-count": attempt + 1 },
    );
    channel.ack(message);
  }
}
