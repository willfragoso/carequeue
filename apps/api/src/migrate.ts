import { pool } from "./db.js";
import { applyMigrations } from "./migrations.js";
import { logger } from "./logger.js";

try {
  const applied = await applyMigrations(
    pool,
    new URL("../../migrations/", import.meta.url),
  );
  logger.info({ step: "migrations_complete", applied });
} catch {
  logger.error({ step: "migration_failure" });
  process.exitCode = 1;
} finally {
  await pool.end();
}
