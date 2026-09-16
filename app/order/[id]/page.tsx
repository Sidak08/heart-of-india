import type { Metadata } from "next";
import { OrderStatusClient } from "@/components/order-status-client";
export const metadata: Metadata = { title: "Order status", robots: { index: false, follow: false } };
export default async function OrderPage({ params, searchParams }: PageProps<"/order/[id]">) { const [{ id }, query] = await Promise.all([params, searchParams]); return <OrderStatusClient orderId={id} cancelled={query.cancelled === "1"} />; }
