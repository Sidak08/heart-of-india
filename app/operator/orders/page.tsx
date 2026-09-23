import type { Metadata } from "next";
import { OperatorDashboard, type OperatorOrder } from "@/components/operator-dashboard";
import { requireOperator } from "@/lib/server/operator";
import { listOperatorOrders } from "@/lib/server/orders";
import { toOrderView } from "@/lib/operations";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pickup orders", robots: { index: false, follow: false } };
export default async function OperatorOrdersPage() {
  const operator = await requireOperator(); const stored = await listOperatorOrders();
  const orders: OperatorOrder[] = stored.map(toOrderView);
  return <OperatorDashboard initialOrders={orders} operatorEmail={operator.email} />;
}
