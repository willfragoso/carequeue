import amqp from "amqplib";
import { config } from "../platform/config.js";
import { pool } from "../platform/db.js";
import { queues } from "../messaging/broker.js";
import { getCase } from "../cases/cases.js";

import { retryQueues } from "../messaging/retries.js";
export type BrokerSnapshot =
  | {
      status: "available";
      ready: number;
      consumers: number;
      retryReady: number;
      deadLetters: number;
    }
  | {
      status: "unavailable";
      ready: null;
      consumers: null;
      retryReady: null;
      deadLetters: null;
    };

export async function inspectBroker(): Promise<BrokerSnapshot> {
  let connection: Awaited<ReturnType<typeof amqp.connect>> | undefined;
  let timer: NodeJS.Timeout | undefined;
  try {
    connection = await amqp.connect(config.RABBITMQ_URL, { timeout: 2000 });
    connection.on("error", () => {});
    const read = async () => {
      const channel = await connection!.createChannel();
      channel.on("error", () => {});
      const main = await channel.checkQueue(queues.main);
      let retryReady = 0;
      for (const queue of retryQueues())
        retryReady += (await channel.checkQueue(queue)).messageCount;
      const dead = await channel.checkQueue(queues.dead);
      return {
        status: "available" as const,
        ready: main.messageCount,
        consumers: main.consumerCount,
        retryReady,
        deadLetters: dead.messageCount,
      };
    };
    return await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Inspection timeout")), 2000);
      }),
    ]);
  } catch {
    return {
      status: "unavailable",
      ready: null,
      consumers: null,
      retryReady: null,
      deadLetters: null,
    };
  } finally {
    clearTimeout(timer);
    await connection?.close().catch(() => {});
  }
}

export async function operations(readBroker = inspectBroker) {
  const [result, broker] = await Promise.all([
    pool.query(`SELECT
      (SELECT count(*)::int FROM cases) AS "cases",
      (SELECT count(*)::int FROM notifications) AS "notifications",
      count(*) FILTER (WHERE published_at IS NULL)::int AS "pending",
      count(*) FILTER (WHERE published_at IS NOT NULL)::int AS "published",
      extract(epoch FROM now()-min(created_at) FILTER (WHERE published_at IS NULL))::float8 AS "oldestPendingSeconds"
      FROM outbox`),
    readBroker(),
  ]);
  const row = result.rows[0];
  return {
    observedAt: new Date().toISOString(),
    database: "available",
    cases: row.cases,
    notifications: row.notifications,
    outbox: {
      pending: row.pending,
      published: row.published,
      oldestPendingSeconds: row.oldestPendingSeconds,
    },
    broker,
  };
}

export async function delivery(id: string) {
  await getCase(id);
  const result = await pool.query(
    `SELECT o.event_id AS "eventId",
    o.envelope->>'correlationId' AS "correlationId", o.envelope->>'eventType' AS "eventType",
    o.created_at AS "createdAt", o.published_at AS "publishedAt", n.created_at AS "notificationSavedAt"
    FROM outbox o LEFT JOIN notifications n ON n.event_id=o.event_id
    WHERE o.envelope->'payload'->>'caseId'=$1 ORDER BY o.created_at`,
    [id],
  );
  return result.rows.map((row) => ({
    ...row,
    state: row.notificationSavedAt
      ? "completed"
      : row.publishedAt
        ? "awaitingNotification"
        : "pendingPublication",
  }));
}
