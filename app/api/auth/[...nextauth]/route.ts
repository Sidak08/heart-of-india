import { handlers } from "@/auth";
import { jsonError, rateLimit } from "@/lib/server/security";
export const GET = handlers.GET;
export async function POST(request: Parameters<typeof handlers.POST>[0]) { const limited = await rateLimit(request, "operator-auth", 8, "10 m"); if (!limited.success) return jsonError("Too many sign-in attempts. Please wait.", 429); return handlers.POST(request); }
