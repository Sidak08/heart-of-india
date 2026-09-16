"use server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDb } from "@/db";
import { menuItems, notificationOutbox, restaurantSettings } from "@/db/schema";
import { runtimeReadiness } from "@/lib/server/env";
import { processNotificationOutbox } from "@/lib/server/email";
import { requireOperator } from "@/lib/server/operator";

export async function retryNotifications(formData: FormData) {
  await requireOperator(); const orderId = String(formData.get("orderId") ?? ""); if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw new Error("Invalid order ID.");
  const db = requireDb(); await db.update(notificationOutbox).set({ status: "pending", nextAttemptAt: new Date(), lockedAt: null, lockToken: null }).where(and(eq(notificationOutbox.orderId, orderId), inArray(notificationOutbox.status, ["failed", "terminal"])));
  await processNotificationOutbox(4); revalidatePath("/operator/orders");
}

const hoursSchema = z.record(z.string(), z.array(z.object({ open: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), close: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })).max(3));
export async function updateSettings(formData: FormData) {
  await requireOperator(); const db = requireDb();
  const nullableNumber = (key: string) => { const value = String(formData.get(key) ?? "").trim(); return value ? Number(value) : null; };
  let weeklyHours: z.infer<typeof hoursSchema>; try { weeklyHours = hoursSchema.parse(JSON.parse(String(formData.get("weeklyHours") ?? "{}"))); } catch { throw new Error("Opening hours must be valid JSON using 24-hour HH:MM values."); }
  const values = z.object({ name: z.string().trim().min(2).max(100), tagline: z.string().trim().min(2).max(140), phone: z.string().trim().min(7).max(30), publicEmail: z.string().trim().email().max(254), street: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(80), province: z.string().trim().length(2), postalCode: z.string().trim().min(6).max(8), cutoffMinutes: z.number().int().min(0).max(180), prepMinMinutes: z.number().int().min(1).max(240), prepMaxMinutes: z.number().int().min(1).max(360), retentionDays: z.number().int().min(1).max(3650), privacyPolicy: z.string().trim().min(30).max(10000), orderingPolicy: z.string().trim().min(30).max(10000) }).parse({ name: formData.get("name"), tagline: formData.get("tagline"), phone: formData.get("phone"), publicEmail: formData.get("publicEmail"), street: formData.get("street"), city: formData.get("city"), province: String(formData.get("province") ?? "").toUpperCase(), postalCode: String(formData.get("postalCode") ?? "").toUpperCase(), cutoffMinutes: nullableNumber("cutoffMinutes"), prepMinMinutes: nullableNumber("prepMinMinutes"), prepMaxMinutes: nullableNumber("prepMaxMinutes"), retentionDays: nullableNumber("retentionDays"), privacyPolicy: formData.get("privacyPolicy"), orderingPolicy: formData.get("orderingPolicy") });
  if (values.prepMaxMinutes < values.prepMinMinutes) throw new Error("Maximum preparation time must be at least the minimum.");
  const menuApproved = formData.get("menuApproved") === "on"; const operationsApproved = formData.get("operationsApproved") === "on"; const policiesApproved = formData.get("policiesApproved") === "on"; const orderingEnabled = formData.get("orderingEnabled") === "on";
  if (orderingEnabled) { const unassigned = await db.select({ id: menuItems.id }).from(menuItems).where(isNull(menuItems.taxProfileId)).limit(1); if (!menuApproved || !operationsApproved || !policiesApproved || unassigned.length || !runtimeReadiness().ready) throw new Error("Ordering cannot be enabled until approvals, tax assignments, and all production services are complete."); }
  await db.transaction(async (tx) => { if (menuApproved) await tx.update(menuItems).set({ availability: "available", updatedAt: new Date() }).where(eq(menuItems.availability, "requires_owner_confirmation")); await tx.update(restaurantSettings).set({ name: values.name, tagline: values.tagline, phone: values.phone, publicEmail: values.publicEmail, address: { street: values.street, city: values.city, province: values.province, postalCode: values.postalCode, country: "CA" }, weeklyHours, cutoffMinutes: values.cutoffMinutes, prepMinMinutes: values.prepMinMinutes, prepMaxMinutes: values.prepMaxMinutes, retentionDays: values.retentionDays, privacyPolicy: [{ heading: "Privacy", paragraphs: [values.privacyPolicy] }], orderingPolicy: [{ heading: "Ordering and refunds", paragraphs: [values.orderingPolicy] }], orderingEnabled, menuApprovedAt: menuApproved ? new Date() : null, operationsApprovedAt: operationsApproved ? new Date() : null, policiesApprovedAt: policiesApproved ? new Date() : null, catalogRevision: menuApproved ? (formData.get("catalogRevision") ? Number(formData.get("catalogRevision")) + 1 : 2) : Number(formData.get("catalogRevision") ?? 1), updatedAt: new Date() }).where(eq(restaurantSettings.id, "heart-of-india")); });
  revalidatePath("/"); revalidatePath("/menu"); revalidatePath("/operator/settings");
}
