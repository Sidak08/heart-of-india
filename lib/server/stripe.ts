import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/server/env";

let client: Stripe | null = null;
export function requireStripe() {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe is not configured.");
  client ??= new Stripe(env.STRIPE_SECRET_KEY, { appInfo: { name: "Heart of India Ordering", version: "1.0.0" } });
  return client;
}
