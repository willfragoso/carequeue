import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { Pool } from "pg";

export async function applyMigrations(database: Pool, directory: URL) {
  const names = (await readdir(directory))
    .filter((name) => /^\d{3}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!names.length) throw new Error("No migration files found");
  const versions = names.map((name) => name.slice(0, 3));
  if (new Set(versions).size !== names.length)
    throw new Error("Duplicate migration version");
  const migrations = await Promise.all(
    names.map(async (name) => {
      const sql = (await readFile(new URL(name, directory), "utf8")).replace(
        /\r\n/g,
        "\n",
      );
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
  const client = await database.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(741234)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const applied = await client.query<{ name: string; checksum: string }>(
      "SELECT name, checksum FROM schema_migrations ORDER BY name",
    );
    for (const row of applied.rows) {
      const source = migrations.find(
        (migration) => migration.name === row.name,
      );
      if (!source || source.checksum !== row.checksum)
        throw new Error("Applied migration missing or changed: " + row.name);
    }
    const completed = new Set(applied.rows.map((row) => row.name));
    const pending = migrations.filter(
      (migration) => !completed.has(migration.name),
    );
    const lastApplied = applied.rows.at(-1)?.name;
    if (
      lastApplied &&
      pending.some((migration) => migration.name < lastApplied)
    )
      throw new Error("Migration inserted before an applied version");
    for (const migration of pending) {
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations(name, checksum) VALUES($1,$2)",
        [migration.name, migration.checksum],
      );
    }
    await client.query("COMMIT");
    return pending.map((migration) => migration.name);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
