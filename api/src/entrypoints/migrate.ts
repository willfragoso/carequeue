import { pool } from "../platform/db.js";
import { applyMigrations } from "../platform/migrations.js";
import { logger } from "../platform/logger.js";

try {
  const applied = await applyMigrations(
    pool,
    new URL("../../../migrations/", import.meta.url),
  );
  logger.info({ step: "migrations_complete", applied });
} catch {
  logger.error({ step: "migration_failure" });
  process.exitCode = 1;
} finally {
  await pool.end();
}
