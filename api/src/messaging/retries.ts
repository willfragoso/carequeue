import { config } from "../platform/config.js";
export function retryDelay(attempt: number, base = config.RETRY_DELAY_MS) {
  return Math.min(base * 2 ** (attempt - 1), 60000);
}
export function retryQueue(attempt: number) {
  return "carequeue.case-created.retry." + attempt;
}
export function retryQueues() {
  return Array.from({ length: config.MAX_RETRIES }, (_, index) =>
    retryQueue(index + 1),
  );
}
