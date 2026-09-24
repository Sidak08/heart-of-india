"use client";

import { Bell, ClipboardList, Database, ExternalLink, LayoutDashboard, LogOut, Settings, UtensilsCrossed } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/operator", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/operator/orders", label: "Orders", icon: ClipboardList, exact: false },
  { href: "/operator/menu", label: "Edit Menu", icon: UtensilsCrossed, exact: false },
  { href: "/operator/settings", label: "Settings", icon: Settings, exact: false },
  { href: "/operator/notifications", label: "Notifications", icon: Bell, exact: false },
  { href: "/operator/data", label: "Data", icon: Database, exact: false },
] as const;

export function OperatorNav({ email }: { email: string }) {
  const pathname = usePathname(); const router = useRouter(); const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true);
    try {
      const registration = await navigator.serviceWorker?.getRegistration(); const subscription = await registration?.pushManager.getSubscription();
      if (subscription && window.confirm("Disable new-order notifications on this device before signing out? Choose Cancel to keep this device subscribed.")) {
        const deviceId = localStorage.getItem("hoi-operator-device-id"); if (deviceId) await fetch("/api/operator/push-subscriptions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceId }) }); await subscription.unsubscribe();
      }
    } catch { /* Sign-out must still complete if browser notification cleanup fails. */ }
    await fetch("/api/operator/logout", { method: "POST" }); router.replace("/operator/login"); router.refresh();
  }
  return <div className="operator-nav-wrap"><nav className="container operator-nav" aria-label="Operator navigation"><div className="operator-nav-links">{links.map(({ href, label, icon: Icon, ...item }) => { const route = href.split("#")[0]; const active = item.exact ? pathname === route : !href.includes("#") && pathname.startsWith(route); return <Link href={href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} key={href}><Icon size={17} aria-hidden="true" />{label}</Link>; })}<Link href="/" className="operator-view-site"><ExternalLink size={17} aria-hidden="true" />View website</Link></div><div className="operator-session"><span title={email}>{email}</span><button type="button" onClick={signOut} disabled={pending}><LogOut size={17} aria-hidden="true" />{pending ? "Signing out…" : "Sign out"}</button></div></nav></div>;
}
