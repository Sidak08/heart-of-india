import "server-only";
import { z } from "zod";

const issues: string[] = [];
function optionalValue<T>(name: string, schema: z.ZodType<T>): T | undefined {
  const raw = process.env[name]; if (raw == null || raw === "") return undefined;
  const parsed = schema.safeParse(raw); if (parsed.success) return parsed.data;
  issues.push(`${name}: ${parsed.error.issues[0]?.message ?? "invalid value"}`); return undefined;
}
const vapidSubjectSchema = z.string().refine((value) => {
  if (value.startsWith("mailto:")) return z.string().email().safeParse(value.slice(7)).success;
  try { const url = new URL(value); return url.protocol === "https:"; } catch { return false; }
}, "use a valid mailto: email or https URL");

export const env = {
  APP_URL: optionalValue("APP_URL", z.string().url()),
  PUBLIC_CONTACT_EMAIL: optionalValue("PUBLIC_CONTACT_EMAIL", z.string().email()),
  GOOGLE_SHEETS_ID: optionalValue("GOOGLE_SHEETS_ID", z.string().min(10)),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalValue("GOOGLE_SERVICE_ACCOUNT_EMAIL", z.string().email()),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: optionalValue("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", z.string().min(40)),
  OPERATOR_EMAIL: optionalValue("OPERATOR_EMAIL", z.string().email()),
  OPERATOR_PASSWORD_HASH: optionalValue("OPERATOR_PASSWORD_HASH", z.string().min(20)),
  OPERATOR_SESSION_SECRET: optionalValue("OPERATOR_SESSION_SECRET", z.string().min(32)),
  ORDER_ACCESS_SECRET: optionalValue("ORDER_ACCESS_SECRET", z.string().min(32)),
  VAPID_PUBLIC_KEY: optionalValue("VAPID_PUBLIC_KEY", z.string().min(20)),
  VAPID_PRIVATE_KEY: optionalValue("VAPID_PRIVATE_KEY", z.string().min(20)),
  VAPID_SUBJECT: optionalValue("VAPID_SUBJECT", vapidSubjectSchema),
  SHEETS_TEST_MODE: optionalValue("SHEETS_TEST_MODE", z.enum(["true", "false"])),
  VERCEL_ENV: optionalValue("VERCEL_ENV", z.enum(["development", "preview", "production"])),
};
export const configurationIssues = Object.freeze([...issues]);

export function sheetsConfigured() { return Boolean(env.GOOGLE_SHEETS_ID && env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY); }
function readiness(required: Array<[string, unknown]>) {
  const missing = required.filter(([, value]) => !value).map(([key]) => key);
  const invalid = configurationIssues.filter((issue) => required.some(([key]) => issue.startsWith(`${key}:`)));
  return { ready: missing.length === 0 && invalid.length === 0, missing, invalid };
}
export function runtimeReadiness() { return readiness([["GOOGLE_SHEETS_ID", env.GOOGLE_SHEETS_ID], ["GOOGLE_SERVICE_ACCOUNT_EMAIL", env.GOOGLE_SERVICE_ACCOUNT_EMAIL], ["GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY", env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY], ["ORDER_ACCESS_SECRET", env.ORDER_ACCESS_SECRET]]); }
export function operatorAuthReadiness() { return readiness([["OPERATOR_EMAIL", env.OPERATOR_EMAIL], ["OPERATOR_PASSWORD_HASH", env.OPERATOR_PASSWORD_HASH], ["OPERATOR_SESSION_SECRET", env.OPERATOR_SESSION_SECRET]]); }
export function pushReadiness() { return readiness([["VAPID_PUBLIC_KEY", env.VAPID_PUBLIC_KEY], ["VAPID_PRIVATE_KEY", env.VAPID_PRIVATE_KEY], ["VAPID_SUBJECT", env.VAPID_SUBJECT]]); }
