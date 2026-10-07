import { z } from "zod";
import { pool } from "../platform/db.js";
import { connectBroker, publishConfirmed, queues } from "./broker.js";
const id = z.uuid().parse(process.argv[2]);
const result = await pool.query(
  "SELECT envelope FROM outbox WHERE event_id=$1",
  [id],
);
if (!result.rowCount) {
  await pool.end();
  throw new Error("Event not found");
}
const broker = await connectBroker();
try {
  await publishConfirmed(
    broker.channel,
    queues.main,
    Buffer.from(JSON.stringify(result.rows[0].envelope)),
  );
} finally {
  await broker.connection.close();
  await pool.end();
}
