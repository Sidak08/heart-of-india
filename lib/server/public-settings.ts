import "server-only";

import { getFallbackSettings, readSettings } from "@/lib/server/sheets";

export async function getPublicSettings() {
  try { return await readSettings(); }
  catch { return getFallbackSettings(); }
}

export function displayHours(hours: Record<string, Array<{ open: string; close: string }>> | null | undefined) {
  if (!hours) return [];
  const labels: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
  return Object.entries(labels).map(([key, label]) => ({ label, value: hours[key]?.length ? hours[key].map((entry) => entry.open === "00:00" && entry.close === "00:00" ? "Open 24 hours" : `${entry.open}–${entry.close}`).join(", ") : "Closed" }));
}
