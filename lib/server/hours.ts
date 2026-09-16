import "server-only";
import { DateTime } from "luxon";
import type { DateOverride, WeeklyHours } from "@/db/schema";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export type OrderingWindowInput = {
  timezone: string; weeklyHours: WeeklyHours | null; dateOverrides?: DateOverride[] | null;
  cutoffMinutes?: number | null; now?: DateTime;
};

export function getOrderingWindow(input: OrderingWindowInput) {
  const now = (input.now ?? DateTime.now()).setZone(input.timezone);
  if (!now.isValid || !input.weeklyHours) return { open: false, reason: "Opening hours have not been confirmed.", now: now.toISO() };
  const isoDate = now.toISODate();
  const override = input.dateOverrides?.find((entry) => entry.date === isoDate);
  const intervals = override ? override.intervals : (input.weeklyHours[DAYS[now.weekday - 1]] ?? []);
  const cutoff = input.cutoffMinutes ?? 0;
  for (const interval of intervals) {
    const [openHour, openMinute] = interval.open.split(":").map(Number);
    const [closeHour, closeMinute] = interval.close.split(":").map(Number);
    const starts = now.startOf("day").set({ hour: openHour, minute: openMinute });
    let closes = now.startOf("day").set({ hour: closeHour, minute: closeMinute });
    if (closes <= starts) closes = closes.plus({ days: 1 });
    const lastOrder = closes.minus({ minutes: cutoff });
    if (now >= starts && now <= lastOrder) return { open: true, reason: null, now: now.toISO(), closesAt: closes.toISO(), lastOrderAt: lastOrder.toISO() };
  }
  return { open: false, reason: "Online ordering is currently closed.", now: now.toISO() };
}
