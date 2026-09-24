import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { restaurant as seedRestaurant, type MenuItem } from "@/lib/menu";
import type { OrderLineSnapshot } from "@/lib/operations";
import { env, runtimeReadiness } from "@/lib/server/env";
import { getOrderingWindow } from "@/lib/server/hours";
import { getFallbackMenu, getFallbackSettings, readMenu, readSettings, usingSheetsTestMode } from "@/lib/server/sheets";

export const cartLineSchema = z.object({
  lineId: z.string().uuid(), itemId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20),
  selections: z.record(z.string().max(80), z.string().max(80)).default({}),
}).strict();

export const quoteRequestSchema = z.object({
  lines: z.array(cartLineSchema).min(1).max(30),
}).strict().superRefine((value, context) => {
  if (value.lines.reduce((sum, line) => sum + line.quantity, 0) > 50) context.addIssue({ code: "custom", message: "A maximum of 50 items is allowed.", path: ["lines"] });
  const ids = value.lines.map((line) => line.lineId);
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Cart line IDs must be unique.", path: ["lines"] });
});

export type Quote = {
  currency: "CAD"; catalogRevision: number; lines: OrderLineSnapshot[]; subtotalCents: number; taxCents: number;
  feeCents: number; totalCents: number; taxBreakdown: Array<{ label: string; amountCents: number; inclusive: boolean }>;
  orderable: boolean; blockers: string[]; pickupAddress: typeof seedRestaurant.address; pickupEstimateText: string | null;
  quoteToken: string; quoteExpiresAt: string;
};

type QuoteDetails = Omit<Quote, "quoteToken" | "quoteExpiresAt">;
const quoteTokenPayloadSchema = z.object({ version: z.literal(1), fingerprint: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: z.string().datetime() }).strict();
const QUOTE_LIFETIME_MS = 10 * 60_000;

function quoteSigningSecret() {
  return env.ORDER_ACCESS_SECRET ?? "ordering-is-disabled-until-order-access-is-configured";
}

function quoteFingerprint(quote: QuoteDetails) {
  return createHash("sha256").update(JSON.stringify(quote)).digest("hex");
}

function signPayload(payload: string) {
  return createHmac("sha256", quoteSigningSecret()).update(payload).digest("base64url");
}

function issueQuoteToken(quote: QuoteDetails) {
  const quoteExpiresAt = new Date(Date.now() + QUOTE_LIFETIME_MS).toISOString();
  const payload = Buffer.from(JSON.stringify({ version: 1, fingerprint: quoteFingerprint(quote), expiresAt: quoteExpiresAt })).toString("base64url");
  return { quoteToken: `${payload}.${signPayload(payload)}`, quoteExpiresAt };
}

export function verifyAcceptedQuoteToken(token: string, quote: Quote) {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(signPayload(payload)); const received = Buffer.from(signature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return false;
  try {
    const parsed = quoteTokenPayloadSchema.safeParse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now()) return false;
    const details: QuoteDetails = {
      currency: quote.currency,
      catalogRevision: quote.catalogRevision,
      lines: quote.lines,
      subtotalCents: quote.subtotalCents,
      taxCents: quote.taxCents,
      feeCents: quote.feeCents,
      totalCents: quote.totalCents,
      taxBreakdown: quote.taxBreakdown,
      orderable: quote.orderable,
      blockers: quote.blockers,
      pickupAddress: quote.pickupAddress,
      pickupEstimateText: quote.pickupEstimateText,
    };
    return parsed.data.fingerprint === quoteFingerprint(details);
  } catch { return false; }
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
  let catalogue: MenuItem[]; let settings; let storageError = false;
  try { [catalogue, settings] = await Promise.all([readMenu(), readSettings()]); }
  catch { catalogue = getFallbackMenu(); settings = getFallbackSettings(); storageError = true; }
  const catalogueMap = new Map(catalogue.map((item) => [item.id, item]));
  const lines: OrderLineSnapshot[] = input.lines.map((line) => {
    const item = catalogueMap.get(line.itemId);
    if (!item) throw new Error("One or more menu items no longer exist.");
    if (item.availability !== "available") throw new Error(item.availability === "unavailable" ? `${item.name} is unavailable.` : `${item.name} is waiting for owner confirmation.`);
    const selections = validateOptions(item, line.selections);
    const unitPriceCents = item.priceCents + selections.reduce((sum, option) => sum + option.priceDeltaCents, 0);
    const lineTotalCents = unitPriceCents * line.quantity;
    const taxRateBasisPoints = item.taxClass === "zero_rated" ? 0 : settings.taxRateBasisPoints;
    const taxCents = settings.taxInclusive && taxRateBasisPoints > 0 ? Math.round(lineTotalCents - lineTotalCents * 10_000 / (10_000 + taxRateBasisPoints)) : Math.round(lineTotalCents * taxRateBasisPoints / 10_000);
    return { ...line, name: item.name, selections, unitPriceCents, lineTotalCents, taxClass: item.taxClass ?? "standard", taxRateBasisPoints, taxCents };
  });
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  const appliedTax = lines.reduce((sum, line) => sum + (line.taxCents ?? 0), 0);
  const taxCents = settings.taxInclusive ? 0 : appliedTax;
  const taxRateLabel = (settings.taxRateBasisPoints / 100).toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  const taxBreakdown = settings.taxRateBasisPoints > 0 ? [{ label: `${settings.taxLabel} (${taxRateLabel}%)`, amountCents: appliedTax, inclusive: settings.taxInclusive }] : [];
  const hours = getOrderingWindow({ timezone: settings.timezone, weeklyHours: settings.weeklyHours, dateOverrides: settings.dateOverrides, cutoffMinutes: settings.cutoffMinutes });
  const readiness = runtimeReadiness();
  const blockers = [
    ...(storageError || (!readiness.ready && !usingSheetsTestMode()) ? ["Online ordering is waiting for the restaurant’s Google Sheets setup."] : []),
    ...(!settings.orderingEnabled ? ["Online ordering is currently paused."] : []),
    ...(!settings.menuApprovedAt || !settings.operationsApprovedAt || !settings.policiesApprovedAt ? ["The menu, hours, and policies require owner approval."] : []),
    ...(!hours.open && hours.reason ? [hours.reason] : []),
  ];
  const pickupEstimateText = settings.prepMinMinutes ? settings.prepMaxMinutes && settings.prepMaxMinutes !== settings.prepMinMinutes ? `${settings.prepMinMinutes}–${settings.prepMaxMinutes} minutes after the order is placed` : `${settings.prepMinMinutes} minutes after the order is placed` : null;
  const details: QuoteDetails = { currency: "CAD", catalogRevision: settings.catalogRevision, lines, subtotalCents, taxCents, feeCents: 0, totalCents: subtotalCents + taxCents, taxBreakdown, orderable: blockers.length === 0, blockers: [...new Set(blockers)], pickupAddress: settings.address, pickupEstimateText };
  return { ...details, ...issueQuoteToken(details) };
}
