import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/components/cart-provider";
import { CartDrawer } from "@/components/cart-drawer";
import { MobileCartBar } from "@/components/mobile-cart-bar";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WebMcpTools } from "@/components/webmcp-tools";
import { getPublicSettings } from "@/lib/server/public-settings";

const display = Cormorant_Garamond({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });
const body = Source_Sans_3({ subsets: ["latin"], variable: "--font-body", weight: ["400", "600", "700", "800"] });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Heart of India | Indian Restaurant in Brampton", template: "%s | Heart of India" },
  description: "Explore the pickup menu from Heart of India, an authentic Indian restaurant at 89 Clarence Street in Brampton, Ontario.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const settings = await getPublicSettings();
  return (
    <html lang="en-CA">
      <body className={`${display.variable} ${body.variable}`}>{settings.operationsApprovedAt && <script type="application/ld+json">{JSON.stringify({ "@context": "https://schema.org", "@type": "Restaurant", name: settings.name, telephone: settings.phone, address: { "@type": "PostalAddress", streetAddress: settings.address.street, addressLocality: settings.address.city, addressRegion: settings.address.province, postalCode: settings.address.postalCode, addressCountry: settings.address.country }, currenciesAccepted: settings.currency })}</script>}<CartProvider><SiteHeader name={settings.name} tagline={settings.tagline} phone={settings.phone} />{children}<SiteFooter name={settings.name} tagline={settings.tagline} phone={settings.phone} address={settings.address} publicEmail={settings.publicEmail} /><CartDrawer /><MobileCartBar /><WebMcpTools /></CartProvider></body>
    </html>
  );
}
