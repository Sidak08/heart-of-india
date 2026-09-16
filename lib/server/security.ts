import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/server/env";

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
  ? new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN })
  : null;
const limiters = new Map<string, Ratelimit>();

export async function rateLimit(request: Request, bucket: string, limit = 10, window = "1 m") {
  if (!redis) return { success: true, remaining: limit, degraded: true };
  let limiter = limiters.get(`${bucket}:${limit}:${window}`);
  if (!limiter) {
    limiter = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(limit, window as `${number} ${"s" | "m" | "h" | "d"}`), prefix: `hoi:${bucket}` });
    limiters.set(`${bucket}:${limit}:${window}`, limiter);
  }
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ...(await limiter.limit(forwarded || "unknown")), degraded: false };
}

export function verifySameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const expected = env.APP_URL || new URL(request.url).origin;
  try { return new URL(origin).origin === new URL(expected).origin; } catch { return false; }
}

export function jsonError(message: string, status: number, details?: unknown) {
  return Response.json({ error: message, details }, { status, headers: { "Cache-Control": "no-store" } });
}

export function newGuestToken() { return randomBytes(32).toString("base64url"); }
export function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
