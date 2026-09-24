import type { Metadata } from "next";
import { RetentionManager } from "@/components/retention-manager";
import { requireOperator } from "@/lib/server/operator";
import { eligibleForRetentionCleanup, listOrders, readSettings } from "@/lib/server/sheets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Operator data retention", robots: { index: false, follow: false } };
export default async function OperatorDataPage() { await requireOperator(); const [orders, settings] = await Promise.all([listOrders(), readSettings()]); const retentionDays = settings.retentionDays ?? 365; const eligible = eligibleForRetentionCleanup(orders, retentionDays).map((order) => ({ id: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt, fulfillmentStatus: order.fulfillmentStatus, customerName: order.customerName })); return <main className="container operator-page"><div className="operator-head"><div><span className="eyebrow">Operator tools</span><h1 className="section-title">Data retention</h1><p>Review and de-identify customer records that have reached the configured retention period.</p></div></div><RetentionManager initial={{ retentionDays, eligible }} /></main>; }
