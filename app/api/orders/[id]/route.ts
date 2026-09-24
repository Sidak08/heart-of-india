import { cookies } from "next/headers";
import { getGuestOrder } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";
import { jsonError, rateLimit } from "@/lib/server/security";

export async function GET(request: Request, context: RouteContext<"/api/orders/[id]">) {
  const limited = await rateLimit(request, "order-status", 60, "1 m", { shared: false }); if (!limited.success) return jsonError("Too many status requests.", 429);
  const { id } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Order was not found.", 404);
  const authorization = request.headers.get("authorization");
  const bearerToken = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  const token = bearerToken ?? (await cookies()).get(`hoi_order_${id}`)?.value; if (!token) return jsonError("Order access is not authorised.", 401);
  try {
    const order = await getGuestOrder(id, token); if (!order) return jsonError("Order was not found.", 404);
    return Response.json({ order: toOrderView(order), accessToken: token, accessExpiresAt: order.guestAccessExpiresAt }, { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Order status is temporarily unavailable.", 503); }
}
