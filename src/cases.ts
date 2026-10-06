import { randomUUID } from "node:crypto";
import { pool, transaction } from "./db.js";
import { canTransition, type Status, type CaseEvent } from "./domain.js";
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
