import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireDb } from "@/db";
import { guestSessions, orderLines, orders, restaurantSettings, taxProfiles } from "@/db/schema";
import { env } from "@/lib/server/env";
import { cartLineSchema, createQuote, type Quote, verifyQuoteSignature } from "@/lib/server/quote";
import { hashToken, newGuestToken } from "@/lib/server/security";
import { requireStripe } from "@/lib/server/stripe";

export const checkoutRequestSchema = z.object({
  attemptId: z.string().uuid(),
  customer: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254), phone: z.string().trim().min(7).max(30), notes: z.string().trim().max(500).default("") }).strict(),
  quote: z.object({
    currency: z.literal("CAD"), catalogRevision: z.number().int().positive(), lines: z.array(cartLineSchema.extend({ name: z.string(), selections: z.array(z.object({ groupId: z.string(), groupLabel: z.string(), optionId: z.string(), optionName: z.string(), priceDeltaCents: z.number().int() })), unitPriceCents: z.number().int(), lineTotalCents: z.number().int(), taxProfileId: z.string().nullable(), taxCents: z.number().int() })).min(1), subtotalCents: z.number().int(), taxCents: z.number().int(), feeCents: z.number().int(), totalCents: z.number().int(), taxBreakdown: z.array(z.object({ label: z.string(), amountCents: z.number().int(), inclusive: z.boolean() })), orderable: z.boolean(), blockers: z.array(z.string()), pickupAddress: z.object({ street: z.string(), city: z.string(), province: z.string(), postalCode: z.string(), country: z.string() }), pickupEstimateText: z.string().nullable(), expiresAt: z.string().datetime(), signature: z.string().min(20),
  }).strict(),
}).strict();

function equivalentQuote(client: Quote, current: Quote) {
  const { signature, ...signedBody } = client;
  const sameLines = JSON.stringify(client.lines) === JSON.stringify(current.lines);
  return verifyQuoteSignature(signedBody, signature) && client.totalCents === current.totalCents && client.subtotalCents === current.subtotalCents && client.taxCents === current.taxCents && client.feeCents === current.feeCents && client.catalogRevision === current.catalogRevision && sameLines && new Date(client.expiresAt).getTime() > Date.now();
}
function makeOrderNumber() { const stamp = new Date().toISOString().slice(2, 10).replaceAll("-", ""); return `HOI-${stamp}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }

export async function startCheckout(input: z.infer<typeof checkoutRequestSchema>) {
  const submitted = input.quote as Quote;
  const current = await createQuote({ lines: submitted.lines.map(({ lineId, itemId, quantity, selections }) => ({ lineId, itemId, quantity, selections: Object.fromEntries(selections.map((selection) => [selection.groupId, selection.optionId])) })), acceptedCatalogRevision: submitted.catalogRevision });
  if (!equivalentQuote(submitted, current)) return { changed: true as const, quote: current };
  if (!current.orderable) throw new Error(current.blockers[0] ?? "Online ordering is unavailable.");
  const db = requireDb(); const stripe = requireStripe();
  const existing = await db.select({ id: orders.id, sessionId: orders.stripeCheckoutSessionId }).from(orders).where(eq(orders.checkoutAttemptId, input.attemptId)).limit(1);
  if (existing[0]?.sessionId) { const session = await stripe.checkout.sessions.retrieve(existing[0].sessionId); if (session.url) return { changed: false as const, orderId: existing[0].id, url: session.url, guestToken: null }; }
  const guestToken = newGuestToken(); const tokenHash = hashToken(guestToken); const orderId = crypto.randomUUID(); const orderNumber = makeOrderNumber();
  await db.transaction(async (tx) => {
    await tx.insert(guestSessions).values({ tokenHash, expiresAt: new Date(Date.now() + 30 * 86400_000) });
    const guest = await tx.select({ id: guestSessions.id }).from(guestSessions).where(eq(guestSessions.tokenHash, tokenHash)).limit(1);
    await tx.insert(orders).values({ id: orderId, orderNumber, guestSessionId: guest[0].id, checkoutAttemptId: input.attemptId, customerName: input.customer.name, customerEmail: input.customer.email.toLowerCase(), customerPhone: input.customer.phone, customerNotes: input.customer.notes || null, subtotalCents: current.subtotalCents, taxCents: current.taxCents, feeCents: current.feeCents, totalCents: current.totalCents, taxBreakdown: current.taxBreakdown, pickupAddress: current.pickupAddress, pickupEstimateText: current.pickupEstimateText, catalogRevision: current.catalogRevision, cartSnapshot: current.lines.map((line) => ({ lineId: line.lineId, itemId: line.itemId, quantity: line.quantity })) });
    await tx.insert(orderLines).values(current.lines.map((line, sortOrder) => ({ orderId, lineId: line.lineId, itemId: line.itemId, snapshot: line, sortOrder })));
  });
  try {
    const profiles = await db.select().from(taxProfiles);
    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
    const lineItems = current.lines.map((line) => ({
      quantity: line.quantity,
      price_data: { currency: "cad", unit_amount: line.unitPriceCents, product_data: { name: line.name, description: line.selections.map((selection) => `${selection.groupLabel}: ${selection.optionName}`).join(" · ") || undefined } },
      tax_rates: line.taxProfileId ? [profileMap.get(line.taxProfileId)!.stripeTaxRateId] : undefined,
    }));
    const [checkoutSettings] = await db.select({ feeRule: restaurantSettings.feeRule }).from(restaurantSettings).where(eq(restaurantSettings.id, "heart-of-india")).limit(1);
    const feeProfileId = checkoutSettings?.feeRule?.taxProfileId;
    if (current.feeCents) lineItems.push({ quantity: 1, price_data: { currency: "cad", unit_amount: current.feeCents, product_data: { name: "Order fee", description: undefined } }, tax_rates: feeProfileId ? [profileMap.get(feeProfileId)!.stripeTaxRateId] : undefined });
    const appUrl = env.APP_URL!;
    const session = await stripe.checkout.sessions.create({ mode: "payment", payment_method_types: ["card"], customer_email: input.customer.email, line_items: lineItems, success_url: `${appUrl}/order/${orderId}?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${appUrl}/order/${orderId}?cancelled=1`, metadata: { orderId, orderNumber }, payment_intent_data: { metadata: { orderId, orderNumber } }, expires_at: Math.floor(Date.now() / 1000) + 30 * 60 }, { idempotencyKey: `checkout:${input.attemptId}` });
    if (!session.url || session.currency?.toUpperCase() !== "CAD" || session.amount_total !== current.totalCents) throw new Error("Stripe returned an unexpected checkout total.");
    await db.update(orders).set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() }).where(eq(orders.id, orderId));
    return { changed: false as const, orderId, url: session.url, guestToken };
  } catch (error) {
    await db.update(orders).set({ paymentStatus: "payment_failed", updatedAt: new Date() }).where(eq(orders.id, orderId));
    throw error;
  }
}
