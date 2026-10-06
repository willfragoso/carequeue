import { z } from "zod";
export const statusSchema = z.enum(["OPEN", "TRIAGE", "ASSIGNED", "RESOLVED"]);
export type Status = z.infer<typeof statusSchema>;
export function canTransition(from: Status, to: Status) {
  return (
    {
      OPEN: "TRIAGE",
      TRIAGE: "ASSIGNED",
      ASSIGNED: "RESOLVED",
      RESOLVED: null,
    }[from] === to
  );
}
export const eventSchema = z
  .object({
    eventId: z.uuid(),
    eventType: z.literal("CaseCreated.v1"),
    schemaVersion: z.literal(1),
    occurredAt: z.iso.datetime(),
    correlationId: z.uuid(),
    payload: z.object({ caseId: z.uuid() }).strict(),
  })
  .strict();
export type CaseEvent = z.infer<typeof eventSchema>;
