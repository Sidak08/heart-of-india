import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { MenuClient } from "@/components/menu-client";
import { getPublicCatalogue } from "@/lib/server/public-menu";
import { getPublicSettings } from "@/lib/server/public-settings";

export const metadata: Metadata = { title: "Menu & Online Ordering", description: "Browse all eight Heart of India menu categories and build a pickup order." };

export default async function MenuPage() {
  const [catalogue, settings] = await Promise.all([getPublicCatalogue(), getPublicSettings()]);
  return <main><section className="page-hero"><div className="container page-hero-copy"><div className="eyebrow">Pickup menu</div><h1>Choose something delicious.</h1><div className="tricolour-rule" aria-hidden="true"><span /><span /><span /></div><p>Browse all eight categories, search by dish name, and customise required choices before adding them to your cart.</p>{!settings.orderingEnabled && <div className="preview-notice"><CircleAlert size={21} aria-hidden="true" /><span>Online ordering is currently paused. You can still explore the complete menu and build a cart.</span></div>}</div></section><Suspense fallback={<div className="container" style={{ padding: "60px 0" }}>Loading the menu…</div>}><MenuClient categories={catalogue.categories} menuItems={catalogue.items} /></Suspense></main>;
}
