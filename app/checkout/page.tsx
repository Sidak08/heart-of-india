import type { Metadata } from "next";
import { CheckoutClient } from "@/components/checkout-client";

export const metadata: Metadata = { title: "Checkout" };
export default function CheckoutPage() { return <CheckoutClient />; }
