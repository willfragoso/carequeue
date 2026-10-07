import type { components } from "./api.gen";

// Wire types come from api/openapi.json (pnpm --filter @carequeue/web generate:api).
type Schemas = components["schemas"];
export type Status = Schemas["Status"];
export type Case = Schemas["Case"];
export type CaseList = Schemas["CaseListCursor"];
export type History = Schemas["HistoryEntry"];
export type Notification = Schemas["Notification"];
export type Delivery = Schemas["Delivery"];
export type Operations = Schemas["Operations"];
export interface Data<T> {
  data: T;
}

// Presentation data. Record<Status, …> makes the compiler flag a status added to the spec.
export const labels: Record<Status, string> = {
  OPEN: "Aberta",
  TRIAGE: "Em triagem",
  ASSIGNED: "Atribuída",
  RESOLVED: "Resolvida",
};
export const statuses = Object.keys(labels) as Status[];
export const nextStatus: Record<Status, Status | null> = {
  OPEN: "TRIAGE",
  TRIAGE: "ASSIGNED",
  ASSIGNED: "RESOLVED",
  RESOLVED: null,
};
