import { createQuote, quoteRequestSchema } from "@/lib/server/quote";
import { jsonError, rateLimit, verifySameOrigin } from "@/lib/server/security";

export async function POST(request: Request) {
  if (!verifySameOrigin(request)) return jsonError("Request origin was not accepted.", 403);
  const limited = await rateLimit(request, "quote", 30, "1 m", { shared: false });
  if (!limited.success) return jsonError("Too many quote requests. Please wait a moment.", 429);
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError("Invalid JSON request.", 400); }
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError("The cart could not be validated.", 400, parsed.error.flatten());
  try { return Response.json(await createQuote(parsed.data), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return jsonError(error instanceof Error ? error.message : "The quote could not be created.", 409); }
}
