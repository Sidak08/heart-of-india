import "server-only";
import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const schema = z.object({
  DATABASE_URL: optionalUrl,
  APP_URL: optionalUrl,
  AUTH_SECRET: z.string().min(32).optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  ORDER_NOTIFICATION_EMAIL: z.string().email().optional(),
  PUBLIC_CONTACT_EMAIL: z.string().email().optional(),
  OPERATOR_EMAILS: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  QUOTE_SIGNING_SECRET: z.string().min(32).optional(),
  CRON_SECRET: z.string().min(16).optional(),
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  PREVIEW_CART_ENABLED: z.enum(["true", "false"]).optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

const parsed = schema.safeParse(process.env);

export const env = parsed.success ? parsed.data : {};

export function operatorEmails() {
  return new Set((env.OPERATOR_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
}

export function isOperatorEmail(email: string | null | undefined) {
  if (!email) return false;
  return operatorEmails().has(email.normalize("NFKC").toLowerCase());
}

export function runtimeReadiness() {
  const missing = [
    ["DATABASE_URL", env.DATABASE_URL], ["APP_URL", env.APP_URL], ["AUTH_SECRET", env.AUTH_SECRET],
    ["RESEND_API_KEY", env.RESEND_API_KEY], ["RESEND_FROM_EMAIL", env.RESEND_FROM_EMAIL],
    ["ORDER_NOTIFICATION_EMAIL", env.ORDER_NOTIFICATION_EMAIL], ["STRIPE_SECRET_KEY", env.STRIPE_SECRET_KEY],
    ["STRIPE_WEBHOOK_SECRET", env.STRIPE_WEBHOOK_SECRET], ["QUOTE_SIGNING_SECRET", env.QUOTE_SIGNING_SECRET],
    ["CRON_SECRET", env.CRON_SECRET], ["UPSTASH_REDIS_REST_URL", env.UPSTASH_REDIS_REST_URL],
    ["UPSTASH_REDIS_REST_TOKEN", env.UPSTASH_REDIS_REST_TOKEN], ["OPERATOR_EMAILS", env.OPERATOR_EMAILS],
  ].filter(([, value]) => !value).map(([key]) => key);
  return { ready: missing.length === 0, missing };
}
