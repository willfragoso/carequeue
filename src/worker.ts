import { runBrokerProcess } from "./runtime.js";
import { queues } from "./broker.js";
import { handleMessage } from "./consumer.js";

await runBrokerProcess("worker", async ({ connection, channel }, signal) => {
  await channel.prefetch(1);
  let active: Promise<void> | undefined;
  let fail: () => void = () => {};
  const stopped = new Promise<void>((resolve) => {
    fail = resolve;
  });
  const onStop = () => fail();
  connection.once("close", onStop);
  channel.once("close", onStop);
  signal.addEventListener("abort", onStop, { once: true });
  let consumerTag: string | undefined;
  try {
    if (signal.aborted) return;
    const consumer = await channel.consume(
      queues.main,
      (message) => {
        if (!message) {
          fail();
          return;
        }
        active = handleMessage(channel, message).catch(() => {
          fail(); // Closing the connection requeues the unacknowledged original.
        });
      },
      { noAck: false },
    );
    consumerTag = consumer.consumerTag;
    await stopped;
  } finally {
    signal.removeEventListener("abort", onStop);
    connection.removeListener("close", onStop);
    channel.removeListener("close", onStop);
    if (consumerTag) await channel.cancel(consumerTag).catch(() => {});
    await active;
  }
});
