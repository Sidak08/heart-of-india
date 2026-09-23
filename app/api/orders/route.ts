import { cookies } from "next/headers";
import { createOrder, createOrderRequestSchema } from "@/lib/server/orders";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "order-create", 30, "10 m");
  if (!limited.success) return jsonError("Too many order attempts. Please wait before trying again.", 429);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid JSON request.", 400); }
  const parsed = createOrderRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("Order details are invalid.", 400, parsed.error.flatten());
  try {
    const result = await createOrder(parsed.data);
    if (result.changed) return Response.json({ error: "The order details changed.", quote: result.quote }, { status: 409 });
    (await cookies()).set(`hoi_order_${result.order.id}`, result.guestToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/api/orders/${result.order.id}`, maxAge: 30 * 86_400, priority: "high" });
    return Response.json({ orderId: result.order.id, orderNumber: result.order.orderNumber, statusUrl: `/order/${result.order.id}#access=${encodeURIComponent(result.guestToken)}`, existing: result.existing }, { status: result.existing ? 200 : 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error instanceof Error ? error.message : "The order could not be placed.", 503); }
}
