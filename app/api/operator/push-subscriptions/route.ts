import { z } from "zod";
import { getOperator } from "@/lib/server/operator";
import { disablePushSubscription, listPushSubscriptions, upsertPushSubscription } from "@/lib/server/sheets";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

const schema = z.object({ deviceId: z.string().uuid(), endpoint: z.string().url().max(2000), keys: z.object({ p256dh: z.string().min(20).max(500), auth: z.string().min(8).max(200) }).strict() }).strict();
const removeSchema = z.object({ deviceId: z.string().uuid() }).strict();

export async function GET(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  const parsed = removeSchema.safeParse({ deviceId: new URL(request.url).searchParams.get("deviceId") }); if (!parsed.success) return jsonError("The browser identifier is invalid.", 400);
  try { return Response.json({ registered: (await listPushSubscriptions()).some((entry) => entry.deviceId === parsed.data.deviceId) }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return jsonError("Notification status could not be checked.", 503); }
}

export async function POST(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = schema.safeParse(body); if (!parsed.success) return jsonError("The browser subscription is invalid.", 400);
  const now = new Date().toISOString();
  try { await upsertPushSubscription({ deviceId: parsed.data.deviceId, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth, enabled: true, createdAt: now, updatedAt: now, lastSuccessAt: null, lastError: null }); return Response.json({ ok: true }); }
  catch { return jsonError("The notification subscription could not be saved.", 503); }
}

export async function DELETE(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = removeSchema.safeParse(body); if (!parsed.success) return jsonError("The browser identifier is invalid.", 400);
  try { await disablePushSubscription(parsed.data.deviceId); return Response.json({ ok: true }); }
  catch { return jsonError("Notifications could not be disabled.", 503); }
}
