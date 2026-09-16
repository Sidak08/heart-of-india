import { cookies } from "next/headers";
import { checkoutRequestSchema, startCheckout } from "@/lib/server/checkout";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "checkout", 6, "10 m"); if (!limited.success) return jsonError("Too many checkout attempts. Please wait before trying again.", 429);
  let body: unknown; try { body = await request.json(); } catch { return jsonError("Invalid JSON request.", 400); }
  const parsed = checkoutRequestSchema.safeParse(body); if (!parsed.success) return jsonError("Checkout details are invalid.", 400, parsed.error.flatten());
  try { const result = await startCheckout(parsed.data); if (result.changed) return Response.json({ error: "The menu or total changed.", quote: result.quote }, { status: 409 }); if (result.guestToken) (await cookies()).set("hoi_guest", result.guestToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86400 }); return Response.json({ url: result.url }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "Secure payment could not be started.", 503); }
}
