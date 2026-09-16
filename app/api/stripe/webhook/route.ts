import { env } from "@/lib/server/env";
import { processNotificationOutbox } from "@/lib/server/email";
import { processStripeEvent } from "@/lib/server/webhook";
import { requireStripe } from "@/lib/server/stripe";

export async function POST(request: Request) {
  if (!env.STRIPE_WEBHOOK_SECRET) return new Response("Webhook is not configured.", { status: 503 });
  const signature = request.headers.get("stripe-signature"); if (!signature) return new Response("Missing Stripe signature.", { status: 400 });
  const rawBody = await request.text();
  let event; try { event = requireStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET); } catch { return new Response("Invalid Stripe signature.", { status: 400 }); }
  try { await processStripeEvent(event, rawBody); await processNotificationOutbox(4); return Response.json({ received: true }); }
  catch (error) { console.error("Stripe webhook processing failed", { eventId: event.id, type: event.type, error: error instanceof Error ? error.message : "unknown" }); return new Response("Webhook processing failed.", { status: 500 }); }
}
