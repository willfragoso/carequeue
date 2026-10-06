import { z } from "zod";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import {
  canTransition,
  statusSchema,
  type Status,
  type CaseEvent,
} from "./domain.js";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const columns =
  'id,title,description,status,created_at AS "createdAt",updated_at AS "updatedAt"';
export async function createCase(
  input: { title: string; description: string },
  correlationId: string,
) {
  return transaction(async (client) => {
    const id = randomUUID();
    const result = await client.query(
      "INSERT INTO cases(id,title,description,status) VALUES($1,$2,$3,'OPEN') RETURNING " +
        columns,
      [id, input.title, input.description],
    );
    await client.query(
      "INSERT INTO case_history(case_id,to_status,correlation_id) VALUES($1,'OPEN',$2)",
      [id, correlationId],
    );
    const event: CaseEvent = {
      eventId: randomUUID(),
      eventType: "CaseCreated.v1",
      schemaVersion: 1,
      occurredAt: new Date().toISOString(),
      correlationId,
      payload: { caseId: id },
    };
    await client.query("INSERT INTO outbox(event_id,envelope) VALUES($1,$2)", [
      event.eventId,
      event,
    ]);
    return result.rows[0];
  });
}
export async function getCase(id: string) {
  const result = await pool.query(
    "SELECT " + columns + " FROM cases WHERE id=$1",
    [id],
  );
  if (!result.rowCount)
    throw new HttpError(404, "CASE_NOT_FOUND", "Case not found");
  return result.rows[0];
}
export async function listCases(
  status: Status | undefined,
  page: number,
  pageSize: number,
) {
  const result = await pool.query(
    "SELECT " +
      columns +
      " FROM cases WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
    [status ?? null, pageSize, (page - 1) * pageSize],
  );
  return { data: result.rows, pagination: { page, pageSize } };
}
export async function changeStatus(
  id: string,
  status: Status,
  correlationId: string,
) {
  return transaction(async (client) => {
    const current = await client.query(
      "SELECT status FROM cases WHERE id=$1 FOR UPDATE",
      [id],
    );
    if (!current.rowCount)
      throw new HttpError(404, "CASE_NOT_FOUND", "Case not found");
    const from = current.rows[0].status as Status;
    if (!canTransition(from, status))
      throw new HttpError(
        409,
        "INVALID_STATUS_TRANSITION",
        "Allowed flow: OPEN -> TRIAGE -> ASSIGNED -> RESOLVED",
      );
    const result = await client.query(
      "UPDATE cases SET status=$2,updated_at=now() WHERE id=$1 RETURNING " +
        columns,
      [id, status],
    );
    await client.query(
      "INSERT INTO case_history(case_id,from_status,to_status,correlation_id) VALUES($1,$2,$3,$4)",
      [id, from, status, correlationId],
    );
    return result.rows[0];
  });
}
export async function history(id: string) {
  await getCase(id);
  return (
    await pool.query(
      'SELECT id,from_status AS "fromStatus",to_status AS "toStatus",correlation_id AS "correlationId",created_at AS "createdAt" FROM case_history WHERE case_id=$1 ORDER BY id',
      [id],
    )
  ).rows;
}
export async function notifications(id: string) {
  await getCase(id);
  return (
    await pool.query(
      'SELECT id,event_id AS "eventId",kind,created_at AS "createdAt" FROM notifications WHERE case_id=$1 ORDER BY created_at,id',
      [id],
    )
  ).rows;
}

const cursorSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.iso.datetime(),
    id: z.uuid(),
    status: statusSchema.nullable(),
  })
  .strict();
export async function listCasesCursor(
  status: Status | undefined,
  pageSize: number,
  cursor?: string,
) {
  let boundary: z.infer<typeof cursorSchema> | undefined;
  if (cursor) {
    try {
      boundary = cursorSchema.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
      );
      if (boundary.status !== (status ?? null))
        throw new Error("Changed filter");
    } catch {
      throw new HttpError(
        400,
        "INVALID_CURSOR",
        "Invalid cursor or changed status filter",
      );
    }
  }
  const result = await pool.query(
    `SELECT ${columns},
    to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "cursorTimestamp"
    FROM cases WHERE ($1::text IS NULL OR status=$1)
    AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
    ORDER BY created_at DESC,id DESC LIMIT $4`,
    [
      status ?? null,
      boundary?.createdAt ?? null,
      boundary?.id ?? null,
      pageSize + 1,
    ],
  );
  const rows = result.rows.slice(0, pageSize);
  const last = rows.at(-1);
  const nextCursor =
    result.rows.length > pageSize && last
      ? Buffer.from(
          JSON.stringify({
            version: 1,
            createdAt: last.cursorTimestamp,
            id: last.id,
            status: status ?? null,
          }),
        ).toString("base64url")
      : null;
  const data = rows.map(({ cursorTimestamp, ...row }) => {
    void cursorTimestamp;
    return row;
  });
  return { data, pagination: { mode: "cursor", pageSize, nextCursor } };
}
