import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import formats from "ajv-formats";
import request from "supertest";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApp } from "../../src/http/app.js";
import { saveNotification } from "../../src/messaging/consumer.js";
import { relayOne } from "../../src/messaging/relay.js";
import { operations } from "../../src/operations/operations.js";
import { pool } from "../../src/platform/db.js";
import { applyMigrations } from "../../src/platform/migrations.js";

// Contract test: real responses from the app and the database are validated against
// api/openapi.json, the source of truth the frontend types are generated from.
// Shares application tables with the other integration suites; run files sequentially.

interface SpecResponse {
  headers?: Record<string, { $ref?: string; schema?: unknown }>;
  content?: { "application/json"?: { schema?: unknown } };
}
interface Spec {
  paths: Record<
    string,
    Record<string, { responses: Record<string, SpecResponse> }>
  >;
  components: {
    schemas: Record<string, unknown>;
    headers: Record<string, { schema: unknown }>;
  };
}

const BASE = "https://carequeue.test/openapi";
const spec = JSON.parse(
  await readFile(new URL("../../openapi.json", import.meta.url), "utf8"),
) as Spec;
// OpenAPI 3.1 schemas are JSON Schema 2020-12; $refs point into components.
const resolveRefs = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value).replaceAll('"#/components/', `"${BASE}#/components/`),
  );
const ajv = new Ajv2020({ strict: false, allErrors: true });
// ajv-formats is CommonJS: NodeNext types the default import as the module, `.default` as the plugin.
formats.default(ajv);
ajv.addSchema({ $id: BASE, components: spec.components });

const validators = new Map<string, ValidateFunction>();
function validator(key: string, schema: unknown) {
  let validate = validators.get(key);
  if (!validate) {
    validate = ajv.compile(resolveRefs(schema));
    validators.set(key, validate);
  }
  return validate;
}
function expectValid(key: string, schema: unknown, value: unknown) {
  const validate = validator(key, schema);
  const valid = validate(value);
  expect(
    valid,
    `${key}: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(value, null, 2)}`,
  ).toBe(true);
}
const component = (name: string) => ({ $ref: `#/components/schemas/${name}` });

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const covered = new Set<string>();

/** Checks status, body and headers of a response against the documented operation. */
function expectContract(
  response: request.Response,
  method: "get" | "post" | "patch",
  path: string,
) {
  const label = `${method.toUpperCase()} ${path} -> ${response.status}`;
  const documented =
    spec.paths[path]?.[method]?.responses[String(response.status)];
  expect(
    documented,
    `${label} is not documented in openapi.json`,
  ).toBeDefined();
  const schema = documented?.content?.["application/json"]?.schema;
  expect(schema, `${label} documents no JSON body`).toBeDefined();
  expectValid(label, schema, response.body);

  // The API sets the correlation header on every response; the spec must say so.
  expect(response.headers["x-correlation-id"], label).toMatch(uuid);
  const header = documented?.headers?.["x-correlation-id"];
  expect(header, `${label} does not document x-correlation-id`).toBeDefined();
  expect(
    header?.$ref
      ? spec.components.headers[header.$ref.split("/").at(-1)!]
      : header,
  ).toMatchObject({ schema: { type: "string", format: "uuid" } });
  covered.add(`${method} ${path} ${response.status}`);
}

const app = createApp();
let caseId: string;

beforeAll(async () => {
  if (process.env.ALLOW_DESTRUCTIVE_TESTS !== "true")
    throw new Error("Disposable database required");
  await applyMigrations(pool, new URL("../../migrations/", import.meta.url));
  await pool.query(
    "TRUNCATE notifications,outbox,case_history,cases RESTART IDENTITY CASCADE",
  );
});
afterAll(async () => {
  await pool.end();
});

it("matches the spec for health checks", async () => {
  expectContract(await request(app).get("/health/live"), "get", "/health/live");
  expectContract(
    await request(app).get("/health/ready"),
    "get",
    "/health/ready",
  );
});

it("matches the spec for creating and reading cases", async () => {
  const created = await request(app)
    .post("/api/cases")
    .send({ title: "Contract case", description: "Synthetic" });
  expectContract(created, "post", "/api/cases");
  caseId = created.body.data.id;
  expectContract(
    await request(app).get(`/api/cases/${caseId}`),
    "get",
    "/api/cases/{id}",
  );
});

it("matches the spec for offset and cursor listings", async () => {
  const offset = await request(app).get("/api/cases");
  expectContract(offset, "get", "/api/cases");
  expect(offset.body.pagination).toHaveProperty("page");
  const cursor = await request(app).get(
    "/api/cases?pagination=cursor&pageSize=1&status=OPEN",
  );
  expectContract(cursor, "get", "/api/cases");
  expect(cursor.body.pagination.mode).toBe("cursor");
  const summary = await request(app).get("/api/cases/summary");
  expectContract(summary, "get", "/api/cases/summary");
  expect(summary.body.data).toEqual({
    total: 1,
    byStatus: { OPEN: 1, TRIAGE: 0, ASSIGNED: 0, RESOLVED: 0 },
  });
});

it("matches the spec for status changes and history", async () => {
  expectContract(
    await request(app)
      .patch(`/api/cases/${caseId}/status`)
      .send({ status: "TRIAGE" }),
    "patch",
    "/api/cases/{id}/status",
  );
  expect(
    (await request(app).get("/api/cases/summary")).body.data.byStatus,
  ).toMatchObject({ OPEN: 0, TRIAGE: 1 });
  const history = await request(app).get(`/api/cases/${caseId}/history`);
  expectContract(history, "get", "/api/cases/{id}/history");
  expect(history.body.data).toHaveLength(2);
  expect(history.body.data[0].fromStatus).toBeNull();
});

it("matches the spec once the event is published and notified", async () => {
  const before = await request(app).get(`/api/cases/${caseId}/delivery`);
  expectContract(before, "get", "/api/cases/{id}/delivery");
  expect(before.body.data[0].state).toBe("pendingPublication");

  await relayOne(async () => {});
  const [event] = (await request(app).get(`/api/cases/${caseId}/delivery`)).body
    .data;
  await saveNotification({
    eventId: event.eventId,
    eventType: "CaseCreated.v1",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: event.correlationId,
    payload: { caseId },
  });
  const delivery = await request(app).get(`/api/cases/${caseId}/delivery`);
  expectContract(delivery, "get", "/api/cases/{id}/delivery");
  expect(delivery.body.data[0].state).toBe("completed");
  const notifications = await request(app).get(
    `/api/cases/${caseId}/notifications`,
  );
  expectContract(notifications, "get", "/api/cases/{id}/notifications");
  expect(notifications.body.data).toHaveLength(1);
});

it("matches the spec for operations in every broker state", async () => {
  // Real broker: reachable or not depending on the environment, both shapes are valid.
  expectContract(
    await request(app).get("/api/operations"),
    "get",
    "/api/operations",
  );
  const available = await operations(async () => ({
    status: "available",
    ready: 1,
    consumers: 1,
    retryReady: 0,
    deadLetters: 0,
  }));
  const unavailable = await operations(async () => ({
    status: "unavailable",
    ready: null,
    consumers: null,
    retryReady: null,
    deadLetters: null,
  }));
  // Round-trip through JSON like the HTTP layer does.
  for (const snapshot of [available, unavailable])
    expectValid(
      "Operations",
      component("Operations"),
      JSON.parse(JSON.stringify(snapshot)),
    );
});

it("matches the spec for error responses", async () => {
  const errors: [request.Response, number][] = [
    [await request(app).post("/api/cases").send({ title: "" }), 400],
    [
      await request(app)
        .post("/api/cases")
        .send({ title: "x".repeat(20000), description: "d" }),
      413,
    ],
    [await request(app).get("/api/cases?pagination=cursor&page=1"), 400],
    [await request(app).get("/api/cases/not-a-uuid"), 400],
    [await request(app).get(`/api/cases/${randomUUID()}`), 404],
    [await request(app).get(`/api/cases/${randomUUID()}/history`), 404],
    [await request(app).get("/api/cases/not-a-uuid/delivery"), 400],
    [
      await request(app)
        .patch(`/api/cases/${caseId}/status`)
        .send({ status: "RESOLVED" }),
      409,
    ],
  ];
  const routes = [
    ["post", "/api/cases"],
    ["post", "/api/cases"],
    ["get", "/api/cases"],
    ["get", "/api/cases/{id}"],
    ["get", "/api/cases/{id}"],
    ["get", "/api/cases/{id}/history"],
    ["get", "/api/cases/{id}/delivery"],
    ["patch", "/api/cases/{id}/status"],
  ] as const;
  errors.forEach(([response, status], index) => {
    expect(response.status).toBe(status);
    expectContract(response, routes[index][0], routes[index][1]);
  });
  // Unknown routes are not an operation of their own but use the same Error body.
  const unknown = await request(app).get("/api/nope");
  expect(unknown.status).toBe(404);
  expectValid("unknown route", component("Error"), unknown.body);
});

it("echoes a valid correlation ID and replaces an invalid one", async () => {
  const supplied = randomUUID();
  const echoed = await request(app)
    .get("/health/live")
    .set("x-correlation-id", supplied);
  expect(echoed.headers["x-correlation-id"]).toBe(supplied);
  const replaced = await request(app)
    .get("/health/live")
    .set("x-correlation-id", "nope");
  expect(replaced.headers["x-correlation-id"]).toMatch(uuid);
  expect(replaced.headers["x-correlation-id"]).not.toBe("nope");
});

it("exercises the success response of every documented operation", () => {
  const missing: string[] = [];
  for (const [path, methods] of Object.entries(spec.paths))
    for (const [method, operation] of Object.entries(methods))
      for (const status of Object.keys(operation.responses))
        if (
          status.startsWith("2") &&
          !covered.has(`${method} ${path} ${status}`)
        )
          missing.push(`${method.toUpperCase()} ${path} ${status}`);
  expect(missing, "add a contract case for every documented operation").toEqual(
    [],
  );
});
