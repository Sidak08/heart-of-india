import "server-only";
import { eq } from "drizzle-orm";
import fallback from "@/data/restaurant-config.json";
import { getDb } from "@/db";
import { restaurantSettings } from "@/db/schema";

export async function getPublicSettings() {
  const db = getDb();
  if (!db) return fallback;
  try { const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.id, "heart-of-india")).limit(1); return settings ?? fallback; }
  catch { return fallback; }
}

export function displayHours(hours: Record<string, Array<{ open: string; close: string }>> | null | undefined) {
  if (!hours) return [];
  const labels: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
  return Object.entries(labels).map(([key, label]) => ({ label, value: hours[key]?.length ? hours[key].map((entry) => `${entry.open}–${entry.close}`).join(", ") : "Closed" }));
}
