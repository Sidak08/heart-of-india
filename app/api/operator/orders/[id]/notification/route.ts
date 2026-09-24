import { getOperator } from "@/lib/server/operator";
import { processOrderNotification } from "@/lib/server/push";
import { findOrderById } from "@/lib/server/sheets";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

export async function POST(request: Request, context: RouteContext<"/api/operator/orders/[id]/notification">) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "notification-retry", 20, "10 m"); if (!limited.success) return jsonError("Too many notification retries. Wait a few minutes.", 429);
  const { id } = await context.params; const order = await findOrderById(id); if (!order) return jsonError("Order was not found.", 404);
  try { const notification = await processOrderNotification(order, true); return Response.json({ notification }); }
  catch { return jsonError("The notification could not be retried.", 503); }
}
