import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { getOrderingWindow } from "@/lib/server/hours";

const hours = { monday: [{ open: "11:00", close: "21:00" }], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
describe("America/Toronto ordering hours", () => {
  it("enforces a cutoff before closing", () => { expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: hours, cutoffMinutes: 30, now: DateTime.fromISO("2026-09-14T20:20:00", { zone: "America/Toronto" }) }).open).toBe(true); expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: hours, cutoffMinutes: 30, now: DateTime.fromISO("2026-09-14T20:45:00", { zone: "America/Toronto" }) }).open).toBe(false); });
  it("uses date overrides", () => { expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: hours, dateOverrides: [{ date: "2026-09-14", intervals: [] }], now: DateTime.fromISO("2026-09-14T12:00:00", { zone: "America/Toronto" }) }).open).toBe(false); });
  it("carries an overnight interval into the next day", () => { const overnight = { ...hours, friday: [{ open: "17:00", close: "02:00" }] }; expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: overnight, now: DateTime.fromISO("2026-09-19T01:00:00", { zone: "America/Toronto" }) }).open).toBe(true); });
  it("does not interpret equal times as 24 hours without the explicit flag", () => { const equal = { ...hours, monday: [{ open: "11:00", close: "11:00" }] }; expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: equal, now: DateTime.fromISO("2026-09-14T15:00:00", { zone: "America/Toronto" }) }).open).toBe(false); });
  it("supports explicit 24-hour intervals across a daylight-saving boundary", () => { const allDay = { ...hours, sunday: [{ open: "00:00", close: "00:00", allDay: true }] }; expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: allDay, now: DateTime.fromISO("2026-11-01T23:30:00", { zone: "America/Toronto" }) }).open).toBe(true); });
  it("fails closed when hours are missing", () => { expect(getOrderingWindow({ timezone: "America/Toronto", weeklyHours: null }).reason).toMatch(/not been confirmed/i); });
});
