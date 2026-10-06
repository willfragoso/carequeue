import { readFile } from "node:fs/promises";
import { pool, transaction } from "./db.js";
await transaction(async (client) => {
  await client.query("SELECT pg_advisory_xact_lock(741234)");
  await client.query(
    await readFile(
      new URL("../../migrations/001_init.sql", import.meta.url),
      "utf8",
    ),
  );
});
await pool.end();
