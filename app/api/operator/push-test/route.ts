import { z } from "zod";
import { getOperator } from "@/lib/server/operator";
import { sendTestNotification } from "@/lib/server/push";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

const schema = z.object({ deviceId: z.string().uuid() }).strict();
export async function POST(request: Request) {
  if (!await getOperator()) return jsonError("Sign in is required.", 401);
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = schema.safeParse(body); if (!parsed.success) return jsonError("The browser identifier is invalid.", 400);
  try { await sendTestNotification(parsed.data.deviceId); return Response.json({ ok: true }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "The test notification failed.", 503); }
}

