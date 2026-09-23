import { getOperator } from "@/lib/server/operator";
import { listOperatorOrders } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";
import { jsonError } from "@/lib/server/security";

export async function GET() {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  try { const orders = (await listOperatorOrders()).map(toOrderView); return Response.json({ orders, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return jsonError("Orders are temporarily unavailable.", 503); }
}
