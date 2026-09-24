import { getOperator } from "@/lib/server/operator";
import { OrderTransitionError, setOrderStatus, updateOrderRequestSchema } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

export async function PATCH(request: Request, context: RouteContext<"/api/operator/orders/[id]">) {
  const operator = await getOperator(); if (!operator) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const { id } = await context.params; if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError("Order was not found.", 404);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = updateOrderRequestSchema.safeParse(body); if (!parsed.success) return jsonError("Status update is invalid.", 400, parsed.error.flatten());
  try { const order = await setOrderStatus(id, parsed.data, operator.email); if (!order) return jsonError("This order changed in another window. Refresh and try again.", 409); return Response.json({ order: toOrderView(order) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "The order could not be updated.", error instanceof OrderTransitionError ? 409 : 503); }
}
