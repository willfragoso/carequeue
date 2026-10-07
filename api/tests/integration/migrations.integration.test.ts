import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { it, expect } from "vitest";
import { config } from "../../src/platform/config.js";
import { applyMigrations } from "../../src/platform/migrations.js";

async function fixture(run: (pool: pg.Pool, directory: URL) => Promise<void>) {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
    throw new Error("Disposable test database required");
  const schema = "migration_test_" + randomUUID().replaceAll("-", "");
  const admin = new pg.Pool({ connectionString: config.DATABASE_URL });
  const path = await mkdtemp(join(tmpdir(), "carequeue-migrations-"));
  const directory = pathToFileURL(path + "/");
  const database = new pg.Pool({
    connectionString: config.DATABASE_URL,
    options: "-c search_path=" + schema,
  });
  try {
    await admin.query('CREATE SCHEMA "' + schema + '"');
    await run(database, directory);
  } finally {
    await database.end();
    await admin.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    await admin.end();
    await rm(path, { recursive: true, force: true });
  }
}
it("applies migrations once and serializes concurrent runners", async () => {
  await fixture(async (database, directory) => {
    await writeFile(
      new URL("001_demo.sql", directory),
      "CREATE TABLE demo(id integer PRIMARY KEY); INSERT INTO demo VALUES(1);",
    );
    const results = await Promise.all([
      applyMigrations(database, directory),
      applyMigrations(database, directory),
    ]);
    expect(results.map((result) => result.length).sort()).toEqual([0, 1]);
    expect((await database.query("SELECT * FROM demo")).rowCount).toBe(1);
    expect(await applyMigrations(database, directory)).toEqual([]);
  });
});
it("rejects edited applied migrations", async () => {
  await fixture(async (database, directory) => {
    const file = new URL("001_demo.sql", directory);
    await writeFile(file, "CREATE TABLE demo(id integer);");
    await applyMigrations(database, directory);
    await writeFile(file, "CREATE TABLE demo(id text);");
    await expect(applyMigrations(database, directory)).rejects.toThrow(
      "changed",
    );
    expect(
      (await database.query("SELECT * FROM schema_migrations")).rowCount,
    ).toBe(1);
  });
});
it("rolls back SQL and migration bookkeeping together", async () => {
  await fixture(async (database, directory) => {
    await writeFile(
      new URL("001_demo.sql", directory),
      "CREATE TABLE demo(id integer);",
    );
    await writeFile(
      new URL("002_failure.sql", directory),
      "INSERT INTO missing_table VALUES(1);",
    );
    await expect(applyMigrations(database, directory)).rejects.toThrow();
    expect(
      (await database.query("SELECT to_regclass('demo') AS relation")).rows[0]
        .relation,
    ).toBeNull();
    expect(
      (
        await database.query(
          "SELECT to_regclass('schema_migrations') AS relation",
        )
      ).rows[0].relation,
    ).toBeNull();
  });
});
