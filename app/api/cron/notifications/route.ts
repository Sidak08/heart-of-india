import { env } from "@/lib/server/env";
import { processNotificationOutbox } from "@/lib/server/email";
import { safeEqual } from "@/lib/server/security";

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? ""; const expected = env.CRON_SECRET ? `Bearer ${env.CRON_SECRET}` : "";
  if (!expected || !safeEqual(authorization, expected)) return new Response("Unauthorized", { status: 401 });
  try { return Response.json(await processNotificationOutbox(20)); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Notification worker failed." }, { status: 500 }); }
}
