import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { env, sheetsConfigured } from "@/lib/server/env";
import { consumeRateLimit } from "@/lib/server/sheets";

const globalLimits = globalThis as unknown as { hoiRateLimits?: Map<string, { count: number; expiresAt: number }> };
const localLimits = globalLimits.hoiRateLimits ??= new Map();

function windowToMs(window: string) {
  const match = /^(\d+)\s*([smhd])$/.exec(window.trim());
  if (!match) return 60_000;
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return Number(match[1]) * unit;
}

export async function rateLimit(request: Request, bucket: string, limit = 10, window = "1 m", options: { shared?: boolean } = {}) {
  const trustedForwarded = env.VERCEL_ENV ? request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") : null;
  const forwarded = trustedForwarded?.split(",")[0]?.trim() || (!env.VERCEL_ENV ? request.headers.get("x-real-ip") : null) || "unknown";
  const keyHash = createHash("sha256").update(`${bucket}:${forwarded}:${env.OPERATOR_SESSION_SECRET ?? env.ORDER_ACCESS_SECRET ?? "preview"}`).digest("hex");
  const windowMs = windowToMs(window);
  if (options.shared !== false && (sheetsConfigured() || process.env.NODE_ENV === "test")) {
    try { return { ...(await consumeRateLimit(keyHash, bucket, limit, windowMs)), degraded: false }; }
    catch { if (bucket === "operator-login" || bucket === "order-create") return { success: false, remaining: 0, degraded: true }; }
  }
  const key = `${bucket}:${keyHash}`; const now = Date.now(); const current = localLimits.get(key);
  const next = !current || current.expiresAt <= now ? { count: 1, expiresAt: now + windowMs } : { ...current, count: current.count + 1 };
  localLimits.set(key, next);
  return { success: next.count <= limit, remaining: Math.max(0, limit - next.count), degraded: true };
}

export function verifySameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = env.APP_URL || new URL(request.url).origin;
  try { return new URL(origin).origin === new URL(expected).origin; } catch { return false; }
}

export function jsonError(message: string, status: number, details?: unknown) { return Response.json({ error: message, details }, { status, headers: { "Cache-Control": "no-store" } }); }
export function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function safeEqual(a: string, b: string) { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); }
