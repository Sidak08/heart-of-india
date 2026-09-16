import "server-only";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { Resend } from "resend";
import { requireDb } from "@/db";
import { notificationOutbox, orderLines, orders } from "@/db/schema";
import { env } from "@/lib/server/env";
import { formatCad } from "@/lib/menu";

function escapeHtml(value: unknown) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!); }
function formatDate(date: Date) { return new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeStyle: "short", timeZone: "America/Toronto" }).format(date); }

async function renderOrderEmail(orderId: string, kind: "restaurant_order" | "customer_confirmation") {
  const db = requireDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1); if (!order) throw new Error("Order no longer exists.");
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.sortOrder));
  const restaurantCopy = kind === "restaurant_order";
  const title = restaurantCopy ? `Paid pickup order ${order.orderNumber}` : `Payment confirmed — ${order.orderNumber}`;
  const intro = restaurantCopy ? "A customer has completed payment. Review the pickup order below." : "We received your payment. The restaurant still needs to accept and prepare your pickup order.";
  const textLines = lines.map(({ snapshot }) => `${snapshot.quantity} × ${snapshot.name}${snapshot.selections.length ? ` (${snapshot.selections.map((selection) => `${selection.groupLabel}: ${selection.optionName}`).join(", ")})` : ""} @ ${formatCad(snapshot.unitPriceCents)} each — ${formatCad(snapshot.lineTotalCents)}`);
  const totals = [`Subtotal: ${formatCad(order.subtotalCents)}`, `Tax: ${formatCad(order.taxCents)}`, ...(order.feeCents ? [`Fees: ${formatCad(order.feeCents)}`] : []), `Total: ${formatCad(order.totalCents)} CAD`];
  const internal = restaurantCopy ? `\nPayment reference: ${order.stripePaymentIntentId ?? order.stripeCheckoutSessionId ?? "pending reference"}` : "";
  const plain = `${title}\n\n${intro}\n\nPaid: ${formatDate(order.paidAt ?? order.createdAt)}\nCustomer: ${order.customerName}\nEmail: ${order.customerEmail}\nPhone: ${order.customerPhone}\nPickup: ${Object.values(order.pickupAddress).join(", ")}${order.pickupEstimateText ? `\nEstimate: ${order.pickupEstimateText}` : ""}\n\n${textLines.join("\n")}\n\n${totals.join("\n")}${order.customerNotes ? `\n\nOrder notes: ${order.customerNotes}` : ""}${internal}`;
  const htmlLines = lines.map(({ snapshot }) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eadfce"><strong>${snapshot.quantity} × ${escapeHtml(snapshot.name)}</strong><br><span style="color:#725f58">${escapeHtml(formatCad(snapshot.unitPriceCents))} each</span>${snapshot.selections.map((selection) => `<br><span style="color:#725f58">${escapeHtml(selection.groupLabel)}: ${escapeHtml(selection.optionName)}</span>`).join("")}</td><td style="padding:10px 0;border-bottom:1px solid #eadfce;text-align:right">${escapeHtml(formatCad(snapshot.lineTotalCents))}</td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#faf8f4;color:#2b1b17;font:16px/1.5 Arial,sans-serif"><div style="max-width:640px;margin:auto;padding:32px 20px"><div style="background:#750909;color:#fff;padding:24px;border-radius:16px 16px 0 0"><h1 style="margin:0;font-size:26px">${escapeHtml(title)}</h1></div><div style="background:#fff;padding:24px;border:1px solid #eadfce"><p>${escapeHtml(intro)}</p><p><strong>Paid:</strong> ${escapeHtml(formatDate(order.paidAt ?? order.createdAt))}<br><strong>Customer:</strong> ${escapeHtml(order.customerName)}<br><strong>Email:</strong> ${escapeHtml(order.customerEmail)}<br><strong>Phone:</strong> ${escapeHtml(order.customerPhone)}<br><strong>Pickup:</strong> ${escapeHtml(Object.values(order.pickupAddress).join(", "))}${order.pickupEstimateText ? `<br><strong>Estimate:</strong> ${escapeHtml(order.pickupEstimateText)}` : ""}</p><table role="presentation" style="width:100%;border-collapse:collapse">${htmlLines}</table><div style="margin-top:18px;text-align:right"><p>${totals.map(escapeHtml).join("<br>")}</p></div>${order.customerNotes ? `<p><strong>Order notes:</strong><br>${escapeHtml(order.customerNotes)}</p>` : ""}${restaurantCopy ? `<p style="color:#725f58"><strong>Payment reference:</strong> ${escapeHtml(order.stripePaymentIntentId ?? order.stripeCheckoutSessionId ?? "pending reference")}</p>` : ""}</div></div></body></html>`;
  return { subject: title, html, text: plain };
}

export async function processNotificationOutbox(limit = 10) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) throw new Error("Resend is not configured.");
  const db = requireDb(); const now = new Date(); const stale = new Date(now.getTime() - 10 * 60_000);
  const candidates = await db.select().from(notificationOutbox).where(and(lte(notificationOutbox.nextAttemptAt, now), or(inArray(notificationOutbox.status, ["pending", "failed"]), and(eq(notificationOutbox.status, "processing"), lte(notificationOutbox.lockedAt, stale))))).orderBy(asc(notificationOutbox.nextAttemptAt)).limit(limit);
  const resend = new Resend(env.RESEND_API_KEY); let sent = 0; let failed = 0;
  for (const candidate of candidates) {
    const lockToken = crypto.randomUUID();
    const [job] = await db.update(notificationOutbox).set({ status: "processing", lockedAt: now, lockToken }).where(and(eq(notificationOutbox.id, candidate.id), or(inArray(notificationOutbox.status, ["pending", "failed"]), and(eq(notificationOutbox.status, "processing"), lte(notificationOutbox.lockedAt, stale))))).returning();
    if (!job || !job.orderId) continue;
    try {
      if (job.kind === "operator_magic_link") throw new Error("Magic links are sent directly by Auth.js.");
      const content = await renderOrderEmail(job.orderId, job.kind);
      const response = await resend.emails.send({ from: env.RESEND_FROM_EMAIL, to: job.recipient, subject: content.subject, html: content.html, text: content.text }, { idempotencyKey: `hoi-${job.kind}-${job.orderId}` });
      if (response.error || !response.data?.id) throw new Error(response.error?.message ?? "Email provider returned no delivery ID.");
      await db.update(notificationOutbox).set({ status: "sent", providerId: response.data.id, sentAt: new Date(), lockedAt: null, lockToken: null, lastError: null }).where(and(eq(notificationOutbox.id, job.id), eq(notificationOutbox.lockToken, lockToken)));
      sent++;
    } catch (error) {
      const attempts = job.attempts + 1; const terminal = attempts >= job.maxAttempts;
      await db.update(notificationOutbox).set({ status: terminal ? "terminal" : "failed", attempts, nextAttemptAt: new Date(Date.now() + Math.min(3600, 2 ** attempts * 30) * 1000), lastError: (error instanceof Error ? error.message : "Unknown email failure").slice(0, 1000), lockedAt: null, lockToken: null }).where(and(eq(notificationOutbox.id, job.id), eq(notificationOutbox.lockToken, lockToken)));
      console.error("Notification delivery failed", { jobId: job.id, orderId: job.orderId, kind: job.kind, attempts, terminal }); failed++;
    }
  }
  return { claimed: candidates.length, sent, failed };
}
