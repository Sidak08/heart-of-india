import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { requireDb } from "@/db";
import { guestSessions, notificationOutbox, orderLines, orders } from "@/db/schema";
import { hashToken } from "@/lib/server/security";

export async function getGuestOrder(orderId: string, guestToken: string) {
  const db = requireDb(); const tokenHash = hashToken(guestToken);
  const rows = await db.select({ order: orders }).from(orders).innerJoin(guestSessions, and(eq(guestSessions.id, orders.guestSessionId), eq(guestSessions.tokenHash, tokenHash))).where(eq(orders.id, orderId)).limit(1);
  if (!rows[0] || rows[0].order.createdAt.getTime() > Date.now() + 60_000) return null;
  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, orderId)).orderBy(asc(orderLines.sortOrder));
  return { ...rows[0].order, lines: lines.map((line) => line.snapshot) };
}

export async function listPaidOrders() {
  const db = requireDb();
  const paid = await db.select().from(orders).where(eq(orders.paymentStatus, "paid")).orderBy(orders.paidAt).limit(100);
  if (!paid.length) return [];
  const ids = paid.map((order) => order.id);
  const [statuses, lines] = await Promise.all([db.select().from(notificationOutbox).where(inArray(notificationOutbox.orderId, ids)), db.select().from(orderLines).where(inArray(orderLines.orderId, ids)).orderBy(asc(orderLines.sortOrder))]);
  return paid.reverse().map((order) => ({ ...order, notifications: statuses.filter((status) => status.orderId === order.id), lines: lines.filter((line) => line.orderId === order.id).map((line) => line.snapshot) }));
}
