import { getOperator } from "@/lib/server/operator";
import { getOperatorOrderSnapshot } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";
import { jsonError } from "@/lib/server/security";

export async function GET() {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  try {
    const snapshot = await getOperatorOrderSnapshot();
    return Response.json({ orders: snapshot.orders.map(toOrderView), issues: snapshot.issues, conflictCount: snapshot.conflictCount, notificationJobs: snapshot.notificationJobs, checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }
  catch { return jsonError("Orders are temporarily unavailable.", 503); }
}
