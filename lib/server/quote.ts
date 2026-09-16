import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { menuItems as seedItems, restaurant as seedRestaurant, type MenuItem } from "@/lib/menu";
import { menuItems, menuOptions, optionGroups, restaurantSettings, taxProfiles } from "@/db/schema";
import { env, runtimeReadiness } from "@/lib/server/env";
import { getOrderingWindow } from "@/lib/server/hours";

export const cartLineSchema = z.object({
  lineId: z.string().uuid(), itemId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20),
  selections: z.record(z.string().max(80), z.string().max(80)).default({}),
}).strict();
export const quoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(30), acceptedCatalogRevision: z.number().int().positive().optional(),
}).strict().superRefine((value, context) => {
  if (value.lines.reduce((sum, line) => sum + line.quantity, 0) > 50) context.addIssue({ code: "custom", message: "A maximum of 50 items is allowed.", path: ["lines"] });
  const ids = value.lines.map((line) => line.lineId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Cart line IDs must be unique.", path: ["lines"] });
});

export type QuoteLine = { lineId: string; itemId: string; name: string; quantity: number; selections: Array<{ groupId: string; groupLabel: string; optionId: string; optionName: string; priceDeltaCents: number }>; unitPriceCents: number; lineTotalCents: number; taxProfileId: string | null; taxCents: number };
export type Quote = { currency: "CAD"; catalogRevision: number; lines: QuoteLine[]; subtotalCents: number; taxCents: number; feeCents: number; totalCents: number; taxBreakdown: Array<{ label: string; amountCents: number; inclusive: boolean }>; orderable: boolean; blockers: string[]; pickupAddress: typeof seedRestaurant.address; pickupEstimateText: string | null; expiresAt: string; signature: string | null };

function canonicalQuote(quote: Omit<Quote, "signature">) { return JSON.stringify(quote); }
export function signQuote(quote: Omit<Quote, "signature">) { return env.QUOTE_SIGNING_SECRET ? createHmac("sha256", env.QUOTE_SIGNING_SECRET).update(canonicalQuote(quote)).digest("base64url") : null; }
export function verifyQuoteSignature(quote: Omit<Quote, "signature">, signature: string | null) {
  if (!env.QUOTE_SIGNING_SECRET || !signature) return false;
  const expected = Buffer.from(createHmac("sha256", env.QUOTE_SIGNING_SECRET).update(canonicalQuote(quote)).digest("base64url"));
  const actual = Buffer.from(signature); return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function validateOptions(item: MenuItem, selections: Record<string, string>) {
  if (Object.keys(selections).some((groupId) => !item.optionGroups.some((group) => group.id === groupId))) throw new Error(`Invalid option group for ${item.name}.`);
  return item.optionGroups.flatMap((group) => {
    const optionId = selections[group.id];
    if (!optionId && group.required) throw new Error(`${group.label} is required for ${item.name}.`);
    if (!optionId) return [];
    const option = group.options.find((entry) => entry.id === optionId);
    if (!option) throw new Error(`Invalid ${group.label.toLowerCase()} for ${item.name}.`);
    return [{ groupId: group.id, groupLabel: group.label, optionId: option.id, optionName: option.name, priceDeltaCents: option.priceDeltaCents }];
  });
}

export async function createQuote(input: z.infer<typeof quoteRequestSchema>): Promise<Quote> {
  const db = getDb();
  let missingTaxAssignment = false;
  let catalogue: MenuItem[] = seedItems;
  let settings: typeof restaurantSettings.$inferSelect | null = null;
  const profileMap = new Map<string, typeof taxProfiles.$inferSelect>();
  if (db) {
    const ids = [...new Set(input.lines.map((line) => line.itemId))];
    const [dbItems, groups, options, settingsRows, profiles] = await Promise.all([
      db.select().from(menuItems).where(inArray(menuItems.id, ids)).orderBy(asc(menuItems.sortOrder)),
      db.select().from(optionGroups).where(inArray(optionGroups.itemId, ids)).orderBy(asc(optionGroups.sortOrder)),
      db.select().from(menuOptions).where(inArray(menuOptions.itemId, ids)).orderBy(asc(menuOptions.sortOrder)),
      db.select().from(restaurantSettings).where(eq(restaurantSettings.id, "heart-of-india")).limit(1),
      db.select().from(taxProfiles),
    ]);
    settings = settingsRows[0] ?? null; profiles.forEach((profile) => profileMap.set(profile.id, profile));
    catalogue = dbItems.map((item) => ({ ...item, optionGroups: groups.filter((group) => group.itemId === item.id).map((group) => ({ ...group, options: options.filter((option) => option.itemId === item.id && option.groupId === group.id) })) })) as MenuItem[];
  }
  const catalogueMap = new Map(catalogue.map((item) => [item.id, item]));
  const lines: QuoteLine[] = input.lines.map((line) => {
    const item = catalogueMap.get(line.itemId); if (!item) throw new Error("One or more menu items no longer exist.");
    if (item.availability === "unavailable") throw new Error(`${item.name} is unavailable.`);
    const selections = validateOptions(item, line.selections);
    const unitPriceCents = item.priceCents + selections.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    const taxProfileId = (item as typeof item & { taxProfileId?: string | null }).taxProfileId ?? null;
    const profile = taxProfileId ? profileMap.get(taxProfileId) : null;
    if (db && taxProfileId && !profile) throw new Error(`Tax configuration is invalid for ${item.name}.`);
    if (db && !taxProfileId) missingTaxAssignment = true;
    const gross = unitPriceCents * line.quantity;
    const taxCents = profile ? profile.inclusive ? Math.round(gross - (gross * 10000) / (10000 + profile.rateBasisPoints)) : Math.round(gross * profile.rateBasisPoints / 10000) : 0;
    return { ...line, name: item.name, selections, unitPriceCents, lineTotalCents: gross, taxProfileId, taxCents };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const feeCents = settings?.feeRule?.type === "flat" ? settings.feeRule.amountCents : settings?.feeRule?.type === "percent" ? Math.round(subtotalCents * settings.feeRule.rateBasisPoints / 10000) : 0;
  const feeProfileId = settings?.feeRule?.taxProfileId ?? null; const feeProfile = feeProfileId ? profileMap.get(feeProfileId) : null;
  if (feeProfileId && !feeProfile) throw new Error("Tax configuration is invalid for the order fee.");
  const feeTaxPortion = feeProfile ? feeProfile.inclusive ? Math.round(feeCents - (feeCents * 10000) / (10000 + feeProfile.rateBasisPoints)) : Math.round(feeCents * feeProfile.rateBasisPoints / 10000) : 0;
  const taxBreakdown = [...profileMap.values()].map((profile) => ({ label: profile.label, amountCents: lines.filter((line) => line.taxProfileId === profile.id).reduce((sum, line) => sum + line.taxCents, 0) + (feeProfileId === profile.id ? feeTaxPortion : 0), inclusive: profile.inclusive })).filter((row) => row.amountCents > 0);
  const taxCents = taxBreakdown.filter((row) => !row.inclusive).reduce((sum, row) => sum + row.amountCents, 0);
  const readiness = runtimeReadiness();
  const hours = settings ? getOrderingWindow({ timezone: settings.timezone, weeklyHours: settings.weeklyHours, dateOverrides: settings.dateOverrides, cutoffMinutes: settings.cutoffMinutes }) : { open: false, reason: "Restaurant settings have not been configured." };
  const blockers = [
    ...(!db ? ["Online checkout is waiting for the restaurant's final setup."] : []),
    ...(settings && !settings.orderingEnabled ? ["Online ordering is currently paused."] : []),
    ...(settings && (!settings.menuApprovedAt || !settings.operationsApprovedAt || !settings.policiesApprovedAt) ? ["The menu, hours, taxes, and policies require owner approval."] : []),
    ...(missingTaxAssignment ? ["Tax treatment has not been assigned to every item in this order."] : []),
    ...(!hours.open && hours.reason ? [hours.reason] : []),
    ...(!readiness.ready ? ["Payment and notification services are not fully configured."] : []),
  ];
  const base = { currency: "CAD" as const, catalogRevision: settings?.catalogRevision ?? 1, lines, subtotalCents, taxCents, feeCents, totalCents: subtotalCents + taxCents + feeCents, taxBreakdown, orderable: blockers.length === 0, blockers: [...new Set(blockers)], pickupAddress: settings?.address ?? seedRestaurant.address, pickupEstimateText: settings?.prepMinMinutes ? settings.prepMaxMinutes && settings.prepMaxMinutes !== settings.prepMinMinutes ? `${settings.prepMinMinutes}–${settings.prepMaxMinutes} minutes after payment` : `${settings.prepMinMinutes} minutes after payment` : null, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  return { ...base, signature: signQuote(base) };
}
