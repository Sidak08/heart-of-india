import "server-only";

import { createHmac } from "node:crypto";
import { z } from "zod";
import type { FulfillmentStatus, PaymentStatus, StoredOrder } from "@/lib/operations";
import { allowedFulfillmentTransitions, fulfillmentStatusSchema, paymentStatusSchema } from "@/lib/operations";
import { env } from "@/lib/server/env";
import { processOrderNotification, processPendingNotifications } from "@/lib/server/push";
import { cartLineSchema, createQuote, verifyAcceptedQuoteToken } from "@/lib/server/quote";
import { appendOrder, ensureNotificationJob, findOrderByAttempt, findOrderById, listOrders, readOperationsSnapshot, updateOrder, usingSheetsTestMode } from "@/lib/server/sheets";
import { hashToken, safeEqual } from "@/lib/server/security";
import { isReasonablePhone } from "@/lib/validation";
import { DateTime } from "luxon";

export const createOrderRequestSchema = z.object({
  attemptId: z.string().uuid(),
  customer: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(254), phone: z.string().trim().max(30).refine(isReasonablePhone, "Enter a phone number with 10 to 15 digits."), notes: z.string().trim().max(500).default("") }).strict(),
  lines: z.array(cartLineSchema).min(1).max(30),
  acceptedQuoteToken: z.string().min(80).max(2048),
}).strict();

export const updateOrderRequestSchema = z.object({
  fulfillmentStatus: fulfillmentStatusSchema.optional(), paymentStatus: paymentStatusSchema.optional(), expectedUpdatedAt: z.string().datetime(), reason: z.string().trim().max(200).optional(),
}).strict().refine((value) => value.fulfillmentStatus || value.paymentStatus, "Choose a status to update.");

export class OrderTransitionError extends Error {}

function secret() {
  if (env.ORDER_ACCESS_SECRET) return env.ORDER_ACCESS_SECRET;
  if (usingSheetsTestMode()) return "test-order-access-secret-at-least-thirty-two-characters";
  throw new Error("Order access is not configured.");
}

function digest(label: string, attemptId: string, encoding: "hex" | "base64url" = "hex") { return createHmac("sha256", secret()).update(`${label}:${attemptId}`).digest(encoding); }
function uuidFromAttempt(attemptId: string) { const hex = digest("order", attemptId, "hex").slice(0, 32).split(""); hex[12] = "4"; hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16); const value = hex.join(""); return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`; }
function guestToken(attemptId: string) { return digest("guest", attemptId, "base64url"); }
function orderNumber(attemptId: string, createdAt: string) { const stamp = DateTime.fromISO(createdAt, { zone: "utc" }).setZone("America/Toronto").toFormat("yyLLdd"); return `HOI-${stamp}-${digest("number", attemptId, "hex").slice(0, 6).toUpperCase()}`; }

export async function createOrder(input: z.infer<typeof createOrderRequestSchema>) {
  const existing = await findOrderByAttempt(input.attemptId);
  if (existing) { try { await ensureNotificationJob(existing); } catch { /* The operator dashboard repairs a missing outbox row. */ } return { changed: false as const, order: existing, guestToken: guestToken(input.attemptId), existing: true }; }
  const quote = await createQuote({ lines: input.lines });
  if (!verifyAcceptedQuoteToken(input.acceptedQuoteToken, quote)) return { changed: true as const, quote };
  if (!quote.orderable) throw new Error(quote.blockers[0] ?? "Online ordering is unavailable.");
  const createdAt = new Date().toISOString(); const token = guestToken(input.attemptId);
  const order: StoredOrder = {
    schemaVersion: 1, id: uuidFromAttempt(input.attemptId), orderNumber: orderNumber(input.attemptId, createdAt), attemptId: input.attemptId,
    guestTokenHash: hashToken(token), guestAccessExpiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), fulfillmentStatus: "new",
    paymentStatus: "unpaid", paymentMethod: "pay_at_store", customerName: input.customer.name, customerEmail: input.customer.email.toLowerCase(),
    customerPhone: input.customer.phone, customerNotes: input.customer.notes || null, currency: "CAD", subtotalCents: quote.subtotalCents,
    taxCents: quote.taxCents, feeCents: quote.feeCents, totalCents: quote.totalCents, taxBreakdown: quote.taxBreakdown,
    pickupAddress: quote.pickupAddress, pickupEstimateText: quote.pickupEstimateText, catalogRevision: quote.catalogRevision,
    cartSnapshot: quote.lines.map(({ lineId, itemId, quantity }) => ({ lineId, itemId, quantity })), lines: quote.lines,
    createdAt, updatedAt: createdAt, paidAt: null, statusHistory: [],
  };
  const committed = await appendOrder(order);
  if (!committed) {
    const winner = await findOrderByAttempt(input.attemptId);
    if (!winner) throw new Error("The order could not be confirmed. Please try again.");
    try { await ensureNotificationJob(winner); } catch { /* The operator dashboard repairs a missing outbox row. */ }
    return { changed: false as const, order: winner, guestToken: token, existing: true };
  }
  let notification = null;
  try { notification = await processOrderNotification(order); } catch { /* The durable outbox is retried when the operator dashboard polls. */ }
  return { changed: false as const, order, guestToken: token, existing: false, notification };
}

export async function getGuestOrder(orderId: string, token: string) {
  const order = await findOrderById(orderId); if (!order) return null;
  if (Date.parse(order.guestAccessExpiresAt) < Date.now() || !safeEqual(order.guestTokenHash, hashToken(token))) return null;
  return order;
}

export async function listOperatorOrders() { return await listOrders(); }

export async function getOperatorOrderSnapshot() {
  const snapshot = await readOperationsSnapshot(); const known = new Set(snapshot.notificationJobs.map((job) => job.orderId));
  const missing = snapshot.orders.filter((entry) => entry.fulfillmentStatus === "new" && Date.parse(entry.createdAt) > Date.now() - 86_400_000 && !known.has(entry.id));
  for (const order of missing) await ensureNotificationJob(order);
  const hasDueNotification = snapshot.notificationJobs.some((job) => job.state !== "sent" && Date.parse(job.nextAttemptAt) <= Date.now());
  if (hasDueNotification) await processPendingNotifications(1, snapshot);
  return missing.length || hasDueNotification ? await readOperationsSnapshot() : snapshot;
}

export async function setOrderStatus(id: string, values: { fulfillmentStatus?: FulfillmentStatus; paymentStatus?: PaymentStatus; expectedUpdatedAt: string; reason?: string }, actor = "operator") {
  const current = await findOrderById(id); if (!current) throw new Error("Order was not found.");
  const fulfillmentStatus = values.fulfillmentStatus ?? current.fulfillmentStatus; const paymentStatus = values.paymentStatus ?? current.paymentStatus;
  if (fulfillmentStatus !== current.fulfillmentStatus && !allowedFulfillmentTransitions[current.fulfillmentStatus].includes(fulfillmentStatus)) throw new OrderTransitionError(`An order cannot move from ${current.fulfillmentStatus.replaceAll("_", " ")} to ${fulfillmentStatus.replaceAll("_", " ")}.`);
  if (current.paymentStatus === "paid_at_store" && paymentStatus !== current.paymentStatus) throw new OrderTransitionError("A recorded payment cannot be reversed from the dashboard.");
  if (fulfillmentStatus === "cancelled" && !values.reason?.trim()) throw new OrderTransitionError("Enter a reason when cancelling an order.");
  const updatedAt = new Date(Math.max(Date.now(), Date.parse(current.updatedAt) + 1)).toISOString();
  const next: StoredOrder = { ...current, fulfillmentStatus, paymentStatus, paidAt: paymentStatus === "paid_at_store" ? current.paidAt ?? updatedAt : current.paidAt, updatedAt, statusHistory: [...(current.statusHistory ?? []), { at: updatedAt, actor, fulfillmentFrom: current.fulfillmentStatus, fulfillmentTo: fulfillmentStatus, paymentFrom: current.paymentStatus, paymentTo: paymentStatus, reason: values.reason?.trim() || null }].slice(-100) };
  const updated = await updateOrder(next, values.expectedUpdatedAt);
  return updated ? next : null;
}
