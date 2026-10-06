export type Status = "OPEN" | "TRIAGE" | "ASSIGNED" | "RESOLVED";
export interface Case {
  id: string;
  title: string;
  description: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
}
export interface CaseList {
  data: Case[];
  pagination: { mode: "cursor"; pageSize: number; nextCursor: string | null };
}
export interface History {
  id: string;
  fromStatus: Status | null;
  toStatus: Status;
  correlationId: string;
  createdAt: string;
}
export interface Notification {
  id: string;
  eventId: string;
  kind: string;
  createdAt: string;
}
export interface Delivery {
  eventId: string;
  correlationId: string;
  eventType: string;
  createdAt: string;
  publishedAt: string | null;
  notificationSavedAt: string | null;
  state: "pendingPublication" | "awaitingNotification" | "completed";
}
export interface Operations {
  observedAt: string;
  database: string;
  cases: number;
  notifications: number;
  outbox: {
    pending: number;
    published: number;
    oldestPendingSeconds: number | null;
  };
  broker: {
    status: "available" | "unavailable";
    ready: number | null;
    consumers: number | null;
    retryReady: number | null;
    deadLetters: number | null;
  };
}
export interface Data<T> {
  data: T;
}
export const statuses: Status[] = ["OPEN", "TRIAGE", "ASSIGNED", "RESOLVED"];
export const labels: Record<Status, string> = {
  OPEN: "Aberta",
  TRIAGE: "Em triagem",
  ASSIGNED: "Atribuída",
  RESOLVED: "Resolvida",
};
export const nextStatus: Record<Status, Status | null> = {
  OPEN: "TRIAGE",
  TRIAGE: "ASSIGNED",
  ASSIGNED: "RESOLVED",
  RESOLVED: null,
};
