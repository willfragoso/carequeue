import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { logger } from "./logger.js";
const server = createApp().listen(config.PORT, () =>
  logger.info({ step: "api_started", port: config.PORT }),
);
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  const timer = setTimeout(() => process.exit(1), 15000);
  timer.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timer);
  });
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
