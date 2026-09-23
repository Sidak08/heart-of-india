import { clearOperatorSession } from "@/lib/server/operator";
import { jsonError, verifySameOrigin } from "@/lib/server/security";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  await clearOperatorSession(); return Response.json({ ok: true });
}

