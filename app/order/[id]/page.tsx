import type { Metadata } from "next";
import { OrderStatusClient } from "@/components/order-status-client";
export const metadata: Metadata = { title: "Order status", robots: { index: false, follow: false } };
export default async function OrderPage({ params }: PageProps<"/order/[id]">) { const { id } = await params; return <OrderStatusClient orderId={id} />; }
