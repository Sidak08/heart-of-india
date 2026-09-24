import "server-only";
import { DateTime } from "luxon";
import type { DateOverride, WeeklyHours } from "@/lib/operations";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export type OrderingWindowInput = {
  timezone: string; weeklyHours: WeeklyHours | null; dateOverrides?: DateOverride[] | null;
  cutoffMinutes?: number | null; now?: DateTime;
};

export function getOrderingWindow(input: OrderingWindowInput) {
  const now = (input.now ?? DateTime.now()).setZone(input.timezone);
  if (!now.isValid || !input.weeklyHours) return { open: false, reason: "Opening hours have not been confirmed.", now: now.toISO() };
  const cutoff = input.cutoffMinutes ?? 0;
  const intervalsFor = (day: DateTime) => {
    const override = input.dateOverrides?.find((entry) => entry.date === day.toISODate());
    return override ? override.intervals : (input.weeklyHours?.[DAYS[day.weekday - 1]] ?? []);
  };
  const candidates = [now.startOf("day"), now.minus({ days: 1 }).startOf("day")].flatMap((day, dayIndex) => intervalsFor(day).flatMap((interval) => {
    const [openHour, openMinute] = interval.open.split(":").map(Number);
    const [closeHour, closeMinute] = interval.close.split(":").map(Number);
    const starts = day.set({ hour: openHour, minute: openMinute });
    let closes = interval.allDay ? day.plus({ days: 1 }) : day.set({ hour: closeHour, minute: closeMinute });
    if (!interval.allDay && closes.equals(starts)) return [];
    if (!interval.allDay && closes < starts) closes = closes.plus({ days: 1 });
    if (dayIndex === 1 && closes <= now.startOf("day")) return [];
    return [{ starts, closes }];
  }));
  for (const { starts, closes } of candidates) {
    const lastOrder = closes.minus({ minutes: cutoff });
    if (now >= starts && now <= lastOrder) return { open: true, reason: null, now: now.toISO(), closesAt: closes.toISO(), lastOrderAt: lastOrder.toISO() };
  }
  return { open: false, reason: "Online ordering is currently closed.", now: now.toISO() };
}
