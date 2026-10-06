import { setTimeout as delay } from "node:timers/promises";
import { pool } from "./db.js";
import { logger } from "./logger.js";
import { connectBroker } from "./broker.js";
export async function runBrokerProcess(
  role: string,
  run: (
    broker: Awaited<ReturnType<typeof connectBroker>>,
    signal: AbortSignal,
  ) => Promise<void>,
) {
  const abort = new AbortController();
  process.on("SIGTERM", () => abort.abort());
  process.on("SIGINT", () => abort.abort());
  let stoppingTimer: NodeJS.Timeout | undefined;
  abort.signal.addEventListener("abort", () => {
    stoppingTimer = setTimeout(() => process.exit(1), 15000);
    stoppingTimer.unref();
  });
  while (!abort.signal.aborted) {
    let broker: Awaited<ReturnType<typeof connectBroker>> | undefined;
    try {
      broker = await connectBroker();
      if (!abort.signal.aborted) await run(broker, abort.signal);
    } catch {
      logger.warn({ step: "broker_process_failure", role });
    } finally {
      await broker?.connection.close().catch(() => {});
    }
    if (!abort.signal.aborted)
      await delay(1000, undefined, { signal: abort.signal }).catch(() => {});
  }
  await pool.end();
  clearTimeout(stoppingTimer);
}
