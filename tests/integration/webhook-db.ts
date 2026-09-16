import { and, count, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import { closeDb, requireDb } from "../../db";
import { guestSessions, menuItems, notificationOutbox, orders, stripeEvents } from "../../db/schema";
import { getPublicCatalogue } from "../../lib/server/public-menu";
import { createQuote } from "../../lib/server/quote";
import { processStripeEvent } from "../../lib/server/webhook";

function event(id: string, orderId: string, sessionId: string, amount = 1599): Stripe.Event { return { id, type: "checkout.session.completed", api_version: "2026-08-27.basil", created: Math.floor(Date.now() / 1000), data: { object: { id: sessionId, object: "checkout.session", amount_total: amount, currency: "cad", payment_status: "paid", payment_intent: `pi_${orderId.slice(0, 8)}`, metadata: { orderId } } as unknown as Stripe.Checkout.Session }, livemode: false, object: "event", pending_webhooks: 1, request: null } as Stripe.Event; }

async function insertPending(orderId: string, sessionId: string, attemptId: string, orderNumber: string) {
  const db = requireDb(); const tokenHash = `test-${orderId}`;
  await db.insert(guestSessions).values({ tokenHash, expiresAt: new Date(Date.now() + 3600_000) }); const [guest] = await db.select().from(guestSessions).where(eq(guestSessions.tokenHash, tokenHash)).limit(1);
  await db.insert(orders).values({ id: orderId, orderNumber, guestSessionId: guest.id, checkoutAttemptId: attemptId, customerName: "Test Customer", customerEmail: "customer@example.com", customerPhone: "9055550100", subtotalCents: 1599, taxCents: 0, feeCents: 0, totalCents: 1599, taxBreakdown: [], pickupAddress: { street: "89 Clarence St.", city: "Brampton", province: "ON", postalCode: "L6W 1S5", country: "CA" }, catalogRevision: 1, cartSnapshot: [], stripeCheckoutSessionId: sessionId });
  return guest.id;
}

async function main() {
  const db = requireDb(); const orderId = crypto.randomUUID(); const secondId = crypto.randomUUID(); const ids = [orderId, secondId];
  try {
    await db.update(menuItems).set({ availability: "unavailable" }).where(eq(menuItems.id, "drinks-desserts-water"));
    const publicWater = (await getPublicCatalogue()).items.find((item) => item.id === "drinks-desserts-water");
    if (publicWater?.availability !== "unavailable") throw new Error("Public catalogue did not expose current availability.");
    let unavailableRejected = false;
    try { await createQuote({ lines: [{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }] }); } catch { unavailableRejected = true; }
    if (!unavailableRejected) throw new Error("Server quote accepted an unavailable database item.");
    await db.update(menuItems).set({ availability: "requires_owner_confirmation" }).where(eq(menuItems.id, "drinks-desserts-water"));
    await insertPending(orderId, "cs_integration_paid", crypto.randomUUID(), `TEST-${orderId.slice(0, 8)}`);
    const paidEvent = event("evt_integration_paid", orderId, "cs_integration_paid");
    await processStripeEvent(paidEvent, JSON.stringify(paidEvent)); await processStripeEvent(paidEvent, JSON.stringify(paidEvent));
    await Promise.all(["a", "b"].map((suffix) => { const current = event(`evt_integration_concurrent_${suffix}`, orderId, "cs_integration_paid"); return processStripeEvent(current, JSON.stringify(current)); }));
    const [paid] = await db.select().from(orders).where(eq(orders.id, orderId)); const [jobs] = await db.select({ value: count() }).from(notificationOutbox).where(eq(notificationOutbox.orderId, orderId));
    if (paid.paymentStatus !== "paid" || jobs.value !== 2) throw new Error(`Expected one paid transition and two unique notification jobs, got ${paid.paymentStatus}/${jobs.value}.`);
    await insertPending(secondId, "cs_integration_mismatch", crypto.randomUUID(), `TEST-${secondId.slice(0, 8)}`); const mismatch = event("evt_integration_mismatch", secondId, "cs_integration_mismatch", 1);
    let rejected = false; try { await processStripeEvent(mismatch, JSON.stringify(mismatch)); } catch { rejected = true; }
    const [stillPending] = await db.select().from(orders).where(eq(orders.id, secondId)); const [badEvents] = await db.select({ value: count() }).from(stripeEvents).where(eq(stripeEvents.eventId, mismatch.id));
    if (!rejected || stillPending.paymentStatus !== "pending_payment" || badEvents.value !== 0) throw new Error("Mismatched payment was not rolled back for a safe Stripe retry.");
    console.log("Database integration passed: public availability and server enforcement matched; duplicate/concurrent paid events produced one transition and two outbox jobs; mismatched payment rolled back.");
  } finally {
    await db.update(menuItems).set({ availability: "requires_owner_confirmation" }).where(eq(menuItems.id, "drinks-desserts-water"));
    const guests = await db.select({ id: orders.guestSessionId }).from(orders).where(inArray(orders.id, ids)); await db.delete(orders).where(inArray(orders.id, ids)); if (guests.length) await db.delete(guestSessions).where(inArray(guestSessions.id, guests.map((guest) => guest.id))); await db.delete(stripeEvents).where(and(inArray(stripeEvents.eventId, ["evt_integration_paid", "evt_integration_concurrent_a", "evt_integration_concurrent_b", "evt_integration_mismatch"]))); await closeDb();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
