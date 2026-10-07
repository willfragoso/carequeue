import { setTimeout as delay } from "node:timers/promises";
import { runBrokerProcess } from "../messaging/runtime.js";
import { relayOne } from "../messaging/relay.js";
import { publishConfirmed, queues } from "../messaging/broker.js";
await runBrokerProcess("publisher", async ({ connection, channel }, signal) => {
  let closed = false;
  connection.on("close", () => {
    closed = true;
  });
  while (!signal.aborted && !closed) {
    const published = await relayOne((event) =>
      publishConfirmed(
        channel,
        queues.main,
        Buffer.from(JSON.stringify(event)),
      ),
    );
    if (!published) await delay(500, undefined, { signal }).catch(() => {});
  }
});
