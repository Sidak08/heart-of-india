import "server-only";
import { z } from "zod";

const optional = <T extends z.ZodType>(schema: T) => z.preprocess((value) => value === "" ? undefined : value, schema.optional());
const schema = z.object({
  APP_URL: optional(z.string().url()),
  PUBLIC_CONTACT_EMAIL: optional(z.string().email()),
  GOOGLE_SHEETS_ID: optional(z.string().min(10)),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optional(z.string().email()),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: optional(z.string().min(40)),
  OPERATOR_EMAIL: optional(z.string().email()),
  OPERATOR_PASSWORD_HASH: optional(z.string().min(20)),
  OPERATOR_SESSION_SECRET: optional(z.string().min(32)),
  ORDER_ACCESS_SECRET: optional(z.string().min(32)),
  VAPID_PUBLIC_KEY: optional(z.string()),
  VAPID_PRIVATE_KEY: optional(z.string()),
  VAPID_SUBJECT: optional(z.string()),
  SHEETS_TEST_MODE: optional(z.enum(["true", "false"])),
  VERCEL_ENV: optional(z.enum(["development", "preview", "production"])),
});

const parsed = schema.safeParse(process.env);

export const env = parsed.success ? parsed.data : {};

export function sheetsConfigured() {
  return Boolean(env.GOOGLE_SHEETS_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function runtimeReadiness() {
  const missing = [
    ["GOOGLE_SHEETS_ID", env.GOOGLE_SHEETS_ID],
    ["GOOGLE_SERVICE_ACCOUNT_EMAIL", env.GOOGLE_SERVICE_ACCOUNT_EMAIL],
    ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY],
    ["ORDER_ACCESS_SECRET", env.ORDER_ACCESS_SECRET],
  ].filter(([, value]) => !value).map(([key]) => key);
  return { ready: missing.length === 0, missing };
}

export function operatorAuthReadiness() {
  const missing = [
    ["OPERATOR_EMAIL", env.OPERATOR_EMAIL],
    ["OPERATOR_PASSWORD_HASH", env.OPERATOR_PASSWORD_HASH],
    ["OPERATOR_SESSION_SECRET", env.OPERATOR_SESSION_SECRET],
  ].filter(([, value]) => !value).map(([key]) => key);
  return { ready: missing.length === 0, missing };
}
