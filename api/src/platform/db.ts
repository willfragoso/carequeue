import pg from "pg";
import { config } from "./config.js";
import { logger } from "./logger.js";
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  connectionTimeoutMillis: 3000,
  statement_timeout: 10000,
});
pool.on("error", () => logger.error({ step: "database_connection_failure" }));
export async function transaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
