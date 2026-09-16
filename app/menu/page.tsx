import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { MenuClient } from "@/components/menu-client";
import { getPublicCatalogue } from "@/lib/server/public-menu";

export const metadata: Metadata = { title: "Menu & Online Ordering", description: "Browse all eight Heart of India menu categories and build a pickup order." };

export default async function MenuPage() {
  const catalogue = await getPublicCatalogue();
  return <main><section className="page-hero"><div className="container"><div className="eyebrow">Pickup menu</div><h1>Choose something delicious.</h1><p>Browse all eight categories, search by dish name, and customise required choices before adding them to your cart.</p><div className="preview-notice"><CircleAlert size={21} aria-hidden="true" /><span>Online ordering is being prepared. You can explore the complete menu and build a cart; secure payment remains unavailable until the restaurant confirms its operating details.</span></div></div></section><Suspense fallback={<div className="container" style={{ padding: "60px 0" }}>Loading the menu…</div>}><MenuClient categories={catalogue.categories} menuItems={catalogue.items} /></Suspense></main>;
}
