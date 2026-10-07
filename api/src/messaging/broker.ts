import amqp, { type ConfirmChannel, type ChannelModel } from "amqplib";
import { config } from "../platform/config.js";
import { retryDelay, retryQueue } from "./retries.js";
export const queues = {
  main: "carequeue.case-created",
  retry: "carequeue.case-created.retry",
  dead: "carequeue.case-created.dead",
};
export async function connectBroker(): Promise<{
  connection: ChannelModel;
  channel: ConfirmChannel;
}> {
  const connection = await amqp.connect(config.RABBITMQ_URL, { timeout: 3000 });
  connection.on("error", () => {}); // Never log raw broker errors or connection URLs.
  try {
    const channel = await connection.createConfirmChannel();
    channel.on("error", () => {});
    await channel.assertQueue(queues.main, { durable: true });
    await channel.assertQueue(queues.dead, { durable: true });
    for (let attempt = 1; attempt <= config.MAX_RETRIES; attempt++) {
      await channel.assertQueue(retryQueue(attempt), {
        durable: true,
        arguments: {
          "x-message-ttl": retryDelay(attempt),
          "x-dead-letter-exchange": "",
          "x-dead-letter-routing-key": queues.main,
        },
      });
    }
    return { connection, channel };
  } catch (error) {
    await connection.close().catch(() => {});
    throw error;
  }
}
// Each process has only one in-flight publication on this channel.
export function publishConfirmed(
  channel: ConfirmChannel,
  queue: string,
  body: Buffer,
  headers: Record<string, unknown> = {},
) {
  return new Promise<void>((resolve, reject) => {
    let returned = false;
    const onReturn = () => {
      returned = true;
    };
    const finish = (error?: Error | null) => {
      clearTimeout(timer);
      channel.removeListener("return", onReturn);
      channel.removeListener("close", onClose);
      if (error || returned)
        reject(new Error("Publication not confirmed or unroutable"));
      else resolve();
    };
    const onClose = () => finish(new Error("Channel closed"));
    const timer = setTimeout(() => finish(new Error("Confirm timeout")), 5000);
    channel.on("return", onReturn);
    channel.once("close", onClose);
    try {
      channel.sendToQueue(
        queue,
        body,
        {
          persistent: true,
          mandatory: true,
          contentType: "application/json",
          headers,
        },
        finish,
      );
    } catch {
      finish(new Error("Publication failed"));
    }
  });
}
