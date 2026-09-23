import type { Metadata } from "next";
import { NotificationSettings } from "@/components/notification-settings";
import { env } from "@/lib/server/env";
import { requireOperator } from "@/lib/server/operator";
import { pushConfigured } from "@/lib/server/push";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator notifications", robots: { index: false, follow: false } };

export default async function OperatorNotificationsPage() {
  await requireOperator();
  return <main className="container operator-page operator-notification-page"><div className="operator-head"><div><span className="eyebrow">Operator devices</span><h1 className="section-title">Notifications</h1><p>Set up and test new-order alerts separately on every phone, tablet, or computer used by restaurant staff.</p></div></div><NotificationSettings publicKey={env.VAPID_PUBLIC_KEY ?? ""} configured={pushConfigured()} /></main>;
}
