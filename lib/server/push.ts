import "server-only";

import webPush from "web-push";
import type { StoredOrder } from "@/lib/operations";
import { env } from "@/lib/server/env";
import { claimNotificationJob, disablePushSubscription, ensureNotificationJob, findOrderById, finishNotificationJob, listNotificationJobs, listPushSubscriptions, upsertPushSubscription } from "@/lib/server/sheets";

export function pushConfigured() { return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT); }

function configure() {
  if (!pushConfigured()) return false;
  webPush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  return true;
}

export async function sendNewOrderNotifications(order: StoredOrder) {
  if (!configure()) return { configured: false, sent: 0, failed: 0, error: "Web Push is not configured." };
  const subscriptions = await listPushSubscriptions();
  if (!subscriptions.length) return { configured: true, sent: 0, failed: 0, error: "No staff device is subscribed." };
  const payload = JSON.stringify({ title: "New Heart of India order", body: `Order ${order.orderNumber} was placed for pickup.`, orderId: order.id, url: "/operator/orders", tag: `order-${order.id}` });
  const results = await Promise.allSettled(subscriptions.map(async (entry) => {
    try {
      await webPush.sendNotification({ endpoint: entry.endpoint, keys: { p256dh: entry.p256dh, auth: entry.auth } }, payload, { TTL: 300, urgency: "high", timeout: 4000 });
      await upsertPushSubscription({ ...entry, lastSuccessAt: new Date().toISOString(), lastError: null, updatedAt: new Date().toISOString() });
      return true;
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await disablePushSubscription(entry.deviceId, "Subscription expired.");
      else await upsertPushSubscription({ ...entry, lastError: error instanceof Error ? error.message.slice(0, 180) : "Push failed.", updatedAt: new Date().toISOString() });
      return false;
    }
  }));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value).length;
  const failed = results.length - sent;
  return { configured: true, sent, failed, error: sent > 0 ? null : "No staff device accepted the notification." };
}

export async function processOrderNotification(order: StoredOrder, force = false) {
  await ensureNotificationJob(order); const claimed = await claimNotificationJob(order.id, force); if (!claimed) return (await listNotificationJobs()).find((job) => job.orderId === order.id) ?? null;
  try { const result = await sendNewOrderNotifications(order); return await finishNotificationJob(claimed, { sent: result.sent > 0, error: result.error ?? (result.failed ? `${result.failed} push attempt${result.failed === 1 ? "" : "s"} failed.` : undefined) }); }
  catch (error) { return await finishNotificationJob(claimed, { sent: false, error: error instanceof Error ? error.message : "Notification delivery failed." }); }
}

export async function processPendingNotifications(limit = 3, snapshot?: { orders: StoredOrder[]; notificationJobs: Awaited<ReturnType<typeof listNotificationJobs>> }) {
  const currentJobs = snapshot?.notificationJobs ?? await listNotificationJobs();
  const jobs = currentJobs.filter((job) => job.state !== "sent" && Date.parse(job.nextAttemptAt) <= Date.now()).slice(0, limit);
  for (const job of jobs) { const order = snapshot?.orders.find((entry) => entry.id === job.orderId) ?? await findOrderById(job.orderId); if (order) await processOrderNotification(order); }
  return jobs.length ? await listNotificationJobs() : currentJobs;
}

export async function sendTestNotification(deviceId: string) {
  if (!configure()) throw new Error("Web Push is not configured.");
  const subscription = (await listPushSubscriptions()).find((entry) => entry.deviceId === deviceId);
  if (!subscription) throw new Error("This browser is not subscribed.");
  await webPush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: "Heart of India notifications", body: "New-order alerts are working on this device.", url: "/operator/orders", tag: "notification-test" }), { TTL: 60, timeout: 4000 });
}
