import "server-only";

import { promisify } from "node:util";
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { env, operatorAuthReadiness } from "@/lib/server/env";

const scrypt = promisify(scryptCallback);
const COOKIE_NAME = "hoi_operator";
const SESSION_SECONDS = 8 * 60 * 60;

function sessionKey() { return env.OPERATOR_SESSION_SECRET ? new TextEncoder().encode(env.OPERATOR_SESSION_SECRET) : null; }
export const operatorConfigured = operatorAuthReadiness().ready;

export async function makePasswordHash(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyOperatorCredentials(email: string, password: string) {
  if (!operatorConfigured || !env.OPERATOR_EMAIL || !env.OPERATOR_PASSWORD_HASH) return false;
  const normalized = email.normalize("NFKC").trim().toLowerCase();
  const expectedEmail = env.OPERATOR_EMAIL.normalize("NFKC").trim().toLowerCase();
  const parts = env.OPERATOR_PASSWORD_HASH.replaceAll("\\$", "$").split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let expected: Buffer; let salt: Buffer;
  try { salt = Buffer.from(parts[1], "base64url"); expected = Buffer.from(parts[2], "base64url"); }
  catch { return false; }
  const actual = await scrypt(password, salt, expected.length) as Buffer;
  return normalized === expectedEmail && actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createOperatorSession(email: string) {
  const key = sessionKey(); if (!key) throw new Error("Operator sessions are not configured.");
  const token = await new SignJWT({ email: email.toLowerCase(), role: "operator" }).setProtectedHeader({ alg: "HS256" }).setIssuer("heart-of-india").setAudience("operator").setIssuedAt().setExpirationTime(`${SESSION_SECONDS}s`).sign(key);
  (await cookies()).set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS, priority: "high" });
}

export async function clearOperatorSession() { (await cookies()).delete(COOKIE_NAME); }

export async function getOperator() {
  const key = sessionKey(); if (!key || !env.OPERATOR_EMAIL) return null;
  const token = (await cookies()).get(COOKIE_NAME)?.value; if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: "heart-of-india", audience: "operator" });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (payload.role !== "operator" || email !== env.OPERATOR_EMAIL.toLowerCase()) return null;
    return { email };
  } catch { return null; }
}

export async function requireOperator() {
  if (!operatorConfigured) redirect("/operator/login?setup=1");
  const operator = await getOperator(); if (!operator) redirect("/operator/login");
  return operator;
}
