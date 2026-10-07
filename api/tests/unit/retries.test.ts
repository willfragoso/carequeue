import { it, expect } from "vitest";
process.env.DATABASE_URL ??= "postgres://unused:unused@localhost/unused";
process.env.RABBITMQ_URL ??= "amqp://localhost";
const { retryDelay } = await import("../../src/messaging/retries.js");
it("increases retry delays exponentially and caps them at one minute", () => {
  expect([1, 2, 3, 4].map((attempt) => retryDelay(attempt, 100))).toEqual([
    100, 200, 400, 800,
  ]);
  expect(retryDelay(10, 2000)).toBe(60000);
});
