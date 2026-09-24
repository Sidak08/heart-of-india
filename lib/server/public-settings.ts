import "server-only";

import { getFallbackSettings, readSettings } from "@/lib/server/sheets";
import type { HoursInterval } from "@/lib/operations";

export async function getPublicSettings() {
  try { return { ...(await readSettings()), degraded: false }; }
  catch { return { ...getFallbackSettings(), degraded: true }; }
}

export function displayHours(hours: Record<string, HoursInterval[]> | null | undefined) {
  if (!hours) return [];
  const labels: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
  return Object.entries(labels).map(([key, label]) => ({ label, value: hours[key]?.length ? hours[key].map((entry) => entry.allDay ? "Open 24 hours" : `${entry.open}–${entry.close}`).join(", ") : "Closed" }));
}
