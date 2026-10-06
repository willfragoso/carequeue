import { transaction } from "./db.js";
import { logger } from "./logger.js";
import type { CaseEvent } from "./domain.js";
export async function relayOne(publish: (event: CaseEvent) => Promise<void>) {
  const event = await transaction(async (client) => {
    const result = await client.query(
      "SELECT event_id,envelope FROM outbox WHERE published_at IS NULL ORDER BY created_at,event_id FOR UPDATE SKIP LOCKED LIMIT 1",
    );
    if (!result.rowCount) return null;
    const event = result.rows[0].envelope as CaseEvent;
    try {
      await publish(event);
    } catch (error) {
      logger.warn({
        step: "event_publication_failure",
        eventId: event.eventId,
        correlationId: event.correlationId,
      });
      throw error;
    }
    await client.query(
      "UPDATE outbox SET published_at=now() WHERE event_id=$1",
      [event.eventId],
    );
    return event;
  });
  if (event)
    logger.info({
      step: "event_published",
      eventId: event.eventId,
      correlationId: event.correlationId,
    });
  return event !== null;
}
