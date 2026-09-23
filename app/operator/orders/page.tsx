import type { Metadata } from "next";
import { OperatorDashboard, type OperatorOrder } from "@/components/operator-dashboard";
import { requireOperator } from "@/lib/server/operator";
import { getOperatorOrderSnapshot } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pickup orders", robots: { index: false, follow: false } };
export default async function OperatorOrdersPage() {
  const operator = await requireOperator(); const snapshot = await getOperatorOrderSnapshot();
  const orders: OperatorOrder[] = snapshot.orders.map(toOrderView);
  return <OperatorDashboard initialOrders={orders} initialIssues={snapshot.issues} initialConflictCount={snapshot.conflictCount} operatorEmail={operator.email} />;
}
