import { formatAgo } from "./ago.pipe";

describe("formatAgo", () => {
  const now = Date.parse("2026-10-07T15:00:00Z");
  const at = (ms: number) => new Date(now - ms).toISOString();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  it("says 'agora' for the last moments", () => {
    expect(formatAgo(at(10_000), now)).toBe("agora");
  });

  it("uses minutes, hours and days", () => {
    expect(formatAgo(at(12 * minute), now)).toBe("há 12 minutos");
    expect(formatAgo(at(3 * hour), now)).toBe("há 3 horas");
    expect(formatAgo(at(1 * day), now)).toBe("ontem");
    expect(formatAgo(at(3 * day), now)).toBe("há 3 dias");
  });

  it("falls back to a short date after a week", () => {
    expect(formatAgo(at(10 * day), now)).toMatch(/27 de set/);
  });
});
