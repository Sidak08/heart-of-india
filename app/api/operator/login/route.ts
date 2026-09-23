import { z } from "zod";
import { createOperatorSession, verifyOperatorCredentials } from "@/lib/server/operator";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

const schema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(8).max(200) }).strict();

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "operator-login", 5, "15 m");
  if (!limited.success) return jsonError("Too many sign-in attempts. Try again later.", 429);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid request.", 400); }
  const parsed = schema.safeParse(body); if (!parsed.success) return jsonError("Enter a valid email and password.", 400);
  if (!await verifyOperatorCredentials(parsed.data.email, parsed.data.password)) return jsonError("Email or password was not accepted.", 401);
  await createOperatorSession(parsed.data.email);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

