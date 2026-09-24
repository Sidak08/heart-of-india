import { z } from "zod";
import { getOperator } from "@/lib/server/operator";
import { eligibleForRetentionCleanup, listOrders, readSettings, redactExpiredOrders } from "@/lib/server/sheets";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

async function summary() {
  const [orders, settings] = await Promise.all([listOrders(), readSettings()]); const retentionDays = settings.retentionDays ?? 365; const eligible = eligibleForRetentionCleanup(orders, retentionDays);
  return { retentionDays, eligible: eligible.map((order) => ({ id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, fulfillmentStatus: order.fulfillmentStatus, customerName: order.customerName })) };
}
export async function GET() { if (!await getOperator()) return jsonError("Sign in is required.", 401); try { return Response.json(await summary(), { headers: { "Cache-Control": "no-store" } }); } catch { return jsonError("Retention records are temporarily unavailable.", 503); } }
export async function POST(request: Request) {
  const operator = await getOperator(); if (!operator) return jsonError("Sign in is required.", 401); if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "retention-cleanup", 3, "1 h"); if (!limited.success) return jsonError("Retention cleanup was attempted too often. Wait before trying again.", 429);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = z.object({ confirmation: z.literal("DELETE ELIGIBLE CUSTOMER DATA") }).strict().safeParse(body); if (!parsed.success) return jsonError("Type the exact confirmation phrase before deleting customer data.", 400);
  try { const current = await summary(); const result = await redactExpiredOrders(current.retentionDays, operator.email); return Response.json({ ...result, summary: await summary() }); } catch { return jsonError("Customer data cleanup could not be completed.", 503); }
}
