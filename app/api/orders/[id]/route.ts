import { cookies } from "next/headers";
import { getGuestOrder } from "@/lib/server/orders";
import { jsonError, rateLimit } from "@/lib/server/security";

export async function GET(request: Request, context: RouteContext<"/api/orders/[id]">) {
  const limited = await rateLimit(request, "order-status", 60, "1 m"); if (!limited.success) return jsonError("Too many status requests.", 429);
  const token = (await cookies()).get("hoi_guest")?.value; if (!token) return jsonError("Order access is not authorised.", 401);
  const { id } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Order was not found.", 404);
  try { const order = await getGuestOrder(id, token); if (!order) return jsonError("Order was not found.", 404); return Response.json({ id: order.id, orderNumber: order.orderNumber, paymentStatus: order.paymentStatus, fulfillmentStatus: order.fulfillmentStatus, createdAt: order.createdAt, paidAt: order.paidAt, customerName: order.customerName, customerEmail: order.customerEmail, customerPhone: order.customerPhone, customerNotes: order.customerNotes, pickupAddress: order.pickupAddress, pickupEstimateText: order.pickupEstimateText, currency: order.currency, subtotalCents: order.subtotalCents, taxCents: order.taxCents, feeCents: order.feeCents, totalCents: order.totalCents, taxBreakdown: order.taxBreakdown, cartSnapshot: order.cartSnapshot, lines: order.lines }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return jsonError("Order status is temporarily unavailable.", 503); }
}
