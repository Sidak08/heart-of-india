import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { requireDb } from "@/db";
import { notificationOutbox, orders, stripeEvents } from "@/db/schema";
import { env } from "@/lib/server/env";

export async function processStripeEvent(event: Stripe.Event, rawBody: string) {
  const db = requireDb();
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(stripeEvents).values({ eventId: event.id, eventType: event.type, sessionId: "object" in event.data && "id" in event.data.object ? String(event.data.object.id) : null, payloadHash: createHash("sha256").update(rawBody).digest("hex") }).onConflictDoNothing().returning({ id: stripeEvents.eventId });
    if (!inserted.length) return;
    if (!["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) return;
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId; if (!orderId) throw new Error("Checkout Session has no order metadata.");
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1); if (!order || order.stripeCheckoutSessionId !== session.id) throw new Error("Checkout Session does not match an order.");
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      if (session.payment_status !== "paid" || session.currency?.toUpperCase() !== order.currency || session.amount_total !== order.totalCents) throw new Error("Paid session amount, currency, or status did not match the order.");
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      if (order.paymentStatus === "paid") { if (order.stripePaymentIntentId !== paymentIntentId) throw new Error("Paid order identity conflict."); return; }
      const transitioned = await tx.update(orders).set({ paymentStatus: "paid", stripePaymentIntentId: paymentIntentId, paidAt: new Date(), updatedAt: new Date() }).where(and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending_payment"))).returning({ id: orders.id });
      if (!transitioned.length) { const [latest] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1); if (latest?.paymentStatus !== "paid" || latest.stripePaymentIntentId !== paymentIntentId) throw new Error("Concurrent paid order identity conflict."); }
      if (!env.ORDER_NOTIFICATION_EMAIL) throw new Error("Restaurant notification recipient is not configured.");
      await tx.insert(notificationOutbox).values([{ orderId: order.id, kind: "restaurant_order", recipient: env.ORDER_NOTIFICATION_EMAIL, payload: { orderId: order.id } }, { orderId: order.id, kind: "customer_confirmation", recipient: order.customerEmail, payload: { orderId: order.id } }]).onConflictDoNothing();
    } else if (event.type === "checkout.session.expired" && order.paymentStatus === "pending_payment") await tx.update(orders).set({ paymentStatus: "expired", updatedAt: new Date() }).where(eq(orders.id, order.id));
    else if (event.type === "checkout.session.async_payment_failed" && order.paymentStatus === "pending_payment") await tx.update(orders).set({ paymentStatus: "payment_failed", updatedAt: new Date() }).where(eq(orders.id, order.id));
  });
}
