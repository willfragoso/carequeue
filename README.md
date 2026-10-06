# CareQueue

Projeto de portfólio de backend: triagem fictícia com dados sintéticos, outbox transacional e consumo idempotente.

CareQueue is a small backend portfolio project exploring a real reliability problem: an HTTP request must survive a broker outage, and a repeated event must not repeat its database effect. All examples are fictional. Do not enter personal or patient data.

Cases move through **OPEN → TRIAGE → ASSIGNED → RESOLVED**. Skipping, reversing, and repeating a status returns HTTP 409. Only creation emits an event; status changes remain synchronous.

## Stack and architecture

Node.js 24 LTS, TypeScript 6, Express 5, PostgreSQL 18, RabbitMQ 4.3, amqplib 2, Zod 4, Pino 10, Vitest 5, ESLint 10, and pnpm 11.19.0. The committed lockfile fixes dependency resolution. TypeScript 6 is selected because typescript-eslint currently supports versions below 6.1; TypeScript 7 is not compatible with this lint configuration.

Official references: [Node releases](https://nodejs.org/en/about/previous-releases), [Express 5](https://expressjs.com/en/guide/migrating-5/), [PostgreSQL support](https://www.postgresql.org/support/versioning/), [RabbitMQ releases](https://www.rabbitmq.com/release-information), [confirms and acknowledgements](https://www.rabbitmq.com/docs/confirms), [typescript-eslint compatibility](https://typescript-eslint.io/users/dependency-versions/).

```mermaid
flowchart LR
  Client --> API[Express API]
  API -->|one transaction| DB[(PostgreSQL: cases + history + outbox)]
  DB --> Relay[Outbox publisher]
  Relay -->|persistent message + confirm| MQ[RabbitMQ]
  MQ --> Worker
  Worker -->|unique eventId| DB
  Worker -->|confirm copy before original ack| Retry[TTL retry queue]
  Retry --> MQ
  Worker --> DLQ[Dead-letter queue]
```

Three processes share one database and codebase. This is intentionally a small application, without a distributed service architecture.

## Run locally

Requires Docker Compose v2. Clone the public repository and enter its directory:

```sh
git clone https://github.com/willfragoso/carequeue-api.git
cd carequeue-api
```

The Compose project name is fixed to `carequeue`, so moving the checkout preserves the same local containers and volumes. Start everything:

```sh
docker compose up --build -d
docker compose logs -f api publisher worker
curl http://localhost:3000/health/ready
docker compose stop
# Remove containers while preserving data:
docker compose down
```

PostgreSQL is exposed on localhost:55432 to avoid conflicts with existing installations. Compose has explicit local demo credentials, loopback-only published ports and persistent dependency volumes. It runs a versioned, transactional migration runner before application processes. API startup does **not** depend on RabbitMQ health. Publisher and worker reconnect every second after a connection failure. Management UI: http://localhost:15672 (carequeue / local_demo_only).

For host development, install Node 24 and pnpm 11.19.0, then:

```sh
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d postgres rabbitmq
pnpm build
node --env-file=.env dist/src/migrate.js
node --env-file=.env dist/src/api.js
# In separate terminals:
node --env-file=.env dist/src/publisher.js
node --env-file=.env dist/src/worker.js
```

On PowerShell use `Copy-Item .env.example .env`. The application validates environment variables at startup. Scripts `pnpm start`, `pnpm publisher`, `pnpm worker` and `pnpm migrate` expect variables to be set in the shell; they do not implicitly load .env.

## HTTP contract

The full [OpenAPI 3.1 specification](openapi.json) includes all routes. Responses use camelCase, a `data` wrapper, and errors use `{error: {code, message, correlationId}}`. Validation errors also have sanitized path/code details. Lists use deterministic newest-first ordering and bounded page sizes (1–100); the history is oldest-first.

| Method | Path                                      | Result                                      |
| ------ | ----------------------------------------- | ------------------------------------------- |
| POST   | /api/cases                                | 201; case, initial history and outbox event |
| GET    | /api/cases?status=OPEN&page=1&pageSize=20 | Cases and pagination                        |
| GET    | /api/cases/:id                            | Case or 404                                 |
| PATCH  | /api/cases/:id/status                     | Adjacent transition or 409                  |
| GET    | /api/cases/:id/history                    | Status changes                              |
| GET    | /api/cases/:id/notifications              | Simulated notifications                     |
| GET    | /health/live                              | Process liveness                            |
| GET    | /health/ready                             | PostgreSQL readiness (503 when unavailable) |

```sh
curl -i -X POST http://localhost:3000/api/cases \
  -H 'Content-Type: application/json' \
  -H 'x-correlation-id: 87ba5cdd-9498-49e2-b271-24dccadf0b65' \
  -d '{"title":"Synthetic intake A","description":"Fictional follow-up request"}'

# Replace CASE_ID with the UUID returned above.
curl 'http://localhost:3000/api/cases?status=OPEN&page=1&pageSize=10'
curl http://localhost:3000/api/cases/CASE_ID
curl -X PATCH http://localhost:3000/api/cases/CASE_ID/status \
  -H 'Content-Type: application/json' -d '{"status":"TRIAGE"}'
curl http://localhost:3000/api/cases/CASE_ID/history
curl http://localhost:3000/api/cases/CASE_ID/notifications
```

On Windows use `curl.exe` with your shell's quoting rules. Input objects reject unknown fields, blank strings, malformed UUIDs and invalid statuses. Missing resources return CASE_NOT_FOUND; invalid transitions return INVALID_STATUS_TRANSITION. Bodies are limited to 16 KiB. SQL values are parameterized.

A valid UUID in `x-correlation-id` is accepted; a missing/invalid value is replaced with a UUID. The response always returns the chosen ID. Events and worker logs propagate it. Logs record IDs and steps, never titles, descriptions, raw exceptions, credentials, tokens, or connection strings.

## Delivery and failure semantics

1. A PostgreSQL transaction inserts the case, initial history and CaseCreated.v1 event. If any insert fails, everything rolls back.
2. The publisher selects one pending row using FOR UPDATE SKIP LOCKED. It holds the row lock while publishing, so multiple relays cannot publish that row concurrently.
3. Durable queues and persistent messages are used. A publisher confirm and successful routing are required before setting published_at and committing. A failed publication leaves the event pending.
4. If the broker accepts an event but the publisher dies before committing, it will publish again. Delivery is **at least once**, with an idempotent consumer. This is **not exactly once**.
5. The worker inserts a simulated CASE_RECEIVED notification with a unique event_id. PostgreSQL commits this single statement before RabbitMQ ack. ON CONFLICT DO NOTHING makes replay safe. A crash between commit and ack redelivers safely.
6. Processing failures are copied to a durable TTL retry queue, with a bounded x-retry-count header. Each attempt uses its own TTL queue and exponential delays of 2, 4 and 8 seconds by default (maximum delay 60 seconds). The copy is confirmed before acknowledging the original. After MAX_RETRIES (default 3 additional attempts), it is copied with confirmation to carequeue.case-created.dead. No infinite nack/requeue loop is used.
7. If copying to retry/DLQ fails, the worker closes its connection and reconnects; the original stays unacknowledged and RabbitMQ redelivers it. Infrastructure failures can therefore keep delivery pending until service recovery.
8. SIGINT/SIGTERM stop intake and let current work finish; a 15-second termination deadline protects shutdown. The worker uses prefetch 1. Publisher confirms have a five-second timeout, database statements a ten-second timeout.

Envelope:

```json
{
  "eventId": "a092a7d3-890e-4998-bac6-754f78c3f089",
  "eventType": "CaseCreated.v1",
  "schemaVersion": 1,
  "occurredAt": "2026-10-06T12:00:00.000Z",
  "correlationId": "87ba5cdd-9498-49e2-b271-24dccadf0b65",
  "payload": { "caseId": "a3b83e88-4340-4b39-a4a4-593d588b60ba" }
}
```

The API only requires PostgreSQL. RabbitMQ downtime does not prevent creating a case: the outbox is the durable buffer. Readiness deliberately reflects this dependency boundary.

## Test and quality checks

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Integration tests require **isolated disposable services** and truncate application tables. Use the separate test Compose project; do not use a shared database or run publisher/worker against these test queues:

```sh
docker compose -p carequeue-test -f compose.test.yaml up -d --wait
DATABASE_URL=postgres://carequeue:local_demo_only@localhost:5433/carequeue_test \
RABBITMQ_URL=amqp://carequeue:local_demo_only@localhost:5673 \
RETRY_DELAY_MS=100 ALLOW_DESTRUCTIVE_TESTS=true pnpm test:integration
docker compose -p carequeue-test -f compose.test.yaml down -v
```

PowerShell equivalent:

```powershell
$env:DATABASE_URL='postgres://carequeue:local_demo_only@localhost:5433/carequeue_test'
$env:RABBITMQ_URL='amqp://carequeue:local_demo_only@localhost:5673'
$env:RETRY_DELAY_MS='100'
$env:ALLOW_DESTRUCTIVE_TESTS='true'
pnpm test:integration
```

Tests cover the transition matrix, HTTP validation, ack ordering, atomic creation and rollback on outbox failure, pending events on a disconnected broker channel and subsequent recovery, crash after save before ack, repeated delivery, and bounded retries ending in the real broker DLQ. GitHub Actions provides disposable PostgreSQL/RabbitMQ services and runs lint, types, both suites and build on pull requests.

## Demonstrate broker outage

```sh
docker compose up --build -d
docker compose stop rabbitmq
# POST a synthetic case using the curl example above: expect 201.
docker compose exec postgres psql -U carequeue -d carequeue \
  -c "SELECT event_id,published_at FROM outbox ORDER BY created_at DESC;"
# The new event has NULL published_at; its notification list is empty.
docker compose start rabbitmq
docker compose logs -f publisher worker
# Observe event_published, event_consumed and notification_saved with matching IDs.
# GET /api/cases/CASE_ID/notifications now has one notification.
```

## Demonstrate duplicate delivery

Get the event UUID from the query above, then replay the same envelope:

```sh
docker compose exec publisher node dist/src/replay.js EVENT_ID
docker compose exec publisher node dist/src/replay.js EVENT_ID
curl http://localhost:3000/api/cases/CASE_ID/notifications
docker compose logs worker
```

There is still one notification; worker logs show duplicate_detected. Replay is a local demonstration helper, not an HTTP endpoint.

## Decisions and limitations

- Synthetic local demo only: no authentication, UI, email, AI, cloud infrastructure, real patient data, or external notification side effects.
- PostgreSQL is the source of truth. One-row relay transactions keep the design understandable but bound throughput and hold a database connection during broker confirms.
- Classic durable queues with TTL dead-letter routing are sufficient to demonstrate broker outages and worker interruption. Classic queue dead-letter forwarding can lose a message if its target is unavailable; a production cluster should use quorum queues and at-least-once dead-lettering, policies and operational monitoring. This demo makes no guarantee against broker disk loss or cluster failure.
- Retry counters bound normal processing failures. Ambiguous confirmations and redelivery can create extra physical attempts; database idempotency prevents repeated notification effects.
- Legacy offset pagination remains supported and can shift under concurrent inserts. Use pagination=cursor for stable traversal with microsecond timestamp + UUID ordering. Cursors are opaque, versioned and tied to the status filter; changing filters requires restarting traversal. Cursor pagination is not a snapshot: status changes may alter membership. No total count is promised. History/notification collections are small and unpaginated.
- No event retention, DLQ replay service or HTTP create idempotency key. Forward-only SQL migrations run under an advisory lock; pending SQL and bookkeeping commit together. Applied files cannot be edited or removed: SHA-256 checksums detect drift. Add a new numbered SQL file for changes. The existing initial schema can be adopted without deleting data because 001_init.sql uses IF NOT EXISTS. There is no automatic down migration.
- Readiness tests connectivity, not schema version. Schema bootstrap runs before API in Compose. All processes must restart after environment changes. Changing retry TTL requires recreating the numbered retry queues. An old unnumbered retry queue can finish draining during upgrade; it is not purged or reused.
- Logs intentionally suppress exception text; safe structured codes identify failures. Production would add metrics, alerts and traces.
- Image tags follow supported minor/major lines rather than immutable digests. Review image updates and supply-chain requirements before production reuse.

## Verification recorded on 2026-10-06

Executed locally with Node 24.19.0: frozen-lockfile installation, dependency peer check, ESLint, TypeScript typecheck, build, eight unit tests and six integration tests all passed. Integration tests used real isolated PostgreSQL 18 and RabbitMQ 4.3 containers. Docker Compose built and started the complete application.

A real broker stop/start demonstration persisted a case while RabbitMQ was stopped, left its outbox event pending, and produced one notification after recovery. Replaying the event twice still yielded one notification. API, publisher and worker exited with code 0 on graceful stop, and were restarted. Disposable test containers were removed; the local demo stack remains running.

The GitHub Actions workflow is configured but has not been executed on GitHub in this session. Review the workflow, queue durability limitations and migration strategy before extending the project.

## Delivery inspection

GET /api/operations returns database counts, pending/published outbox totals, oldest pending age and a live RabbitMQ snapshot (ready messages, consumer count, retry queue and DLQ depth). Broker inspection uses passive queue checks: it does not create queues or consume messages. Unavailable broker counts are null, not zero. These snapshots are approximate, not historical metrics; ready counts exclude unacknowledged deliveries. The endpoint is for the unauthenticated local demonstration and should be restricted before production use.

GET /api/cases/:id/delivery exposes eventId, correlationId, timestamps and the derived pendingPublication, awaitingNotification or completed state without exposing the full event payload. A worker may commit its effect before the publisher commits published_at; notification persistence takes precedence when deriving state.

## Cursor pagination

GET /api/cases?pagination=cursor&pageSize=20 returns pagination.nextCursor. Supply it as cursor on the next request, keeping the same status filter. A null nextCursor marks the end. Newer inserts do not shift later pages. The legacy page parameter remains available with pagination=offset (default), but cannot be mixed with cursor mode.
