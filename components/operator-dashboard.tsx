"use client";

import { Banknote, Check, Clock3, Mail, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playOrderTone } from "@/components/notification-settings";
import { formatCad } from "@/lib/menu";
import { fulfillmentLabels, fulfillmentStatuses, type StoredOrder } from "@/lib/operations";

export type OperatorOrder = Omit<StoredOrder, "guestTokenHash" | "guestAccessExpiresAt" | "attemptId">;
type Filter = "active" | "completed" | "cancelled" | "all";

function date(value: string) { return new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }).format(new Date(value)); }

export function OperatorDashboard({ initialOrders, operatorEmail }: { initialOrders: OperatorOrder[]; operatorEmail: string }) {
  const router = useRouter(); const [orders, setOrders] = useState(initialOrders); const [filter, setFilter] = useState<Filter>("active"); const [error, setError] = useState(""); const [updating, setUpdating] = useState<string | null>(null); const [announcement, setAnnouncement] = useState(""); const [refreshing, setRefreshing] = useState(false); const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null); const seen = useRef(new Set(initialOrders.map((order) => order.id))); const firstPoll = useRef(true); const refreshInFlight = useRef(false);
  const refresh = useCallback(async (announce = true) => {
    if (refreshInFlight.current) return; refreshInFlight.current = true; setRefreshing(true);
    try {
      const response = await fetch("/api/operator/orders", { cache: "no-store" }); if (response.status === 401) { router.replace("/operator/login"); return; }
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Orders could not be refreshed.");
      const incoming = data.orders as OperatorOrder[]; const newOrders = incoming.filter((order) => !seen.current.has(order.id)); incoming.forEach((order) => seen.current.add(order.id)); setOrders(incoming); setError("");
      setLastCheckedAt(data.checkedAt ?? new Date().toISOString());
      if (!firstPoll.current && newOrders.length && announce) { setAnnouncement(`${newOrders.length} new ${newOrders.length === 1 ? "order" : "orders"} received.`); if (localStorage.getItem("hoi-dashboard-sound") !== "off") playOrderTone(); }
      firstPoll.current = false;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Orders could not be refreshed.");
    } finally { refreshInFlight.current = false; setRefreshing(false); }
  }, [router]);
  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(false), 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    const message = (event: MessageEvent) => { if (event.data?.type === "NEW_ORDER") void refresh(); };
    const resume = () => { if (document.visibilityState === "visible") void refresh(); };
    navigator.serviceWorker?.addEventListener("message", message);
    window.addEventListener("focus", resume); document.addEventListener("visibilitychange", resume);
    return () => { clearTimeout(initial); clearInterval(interval); navigator.serviceWorker?.removeEventListener("message", message); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", resume); };
  }, [refresh]);
  useEffect(() => { if (!announcement) return; const timer = setTimeout(() => setAnnouncement(""), 5000); return () => clearTimeout(timer); }, [announcement]);
  const visible = useMemo(() => orders.filter((order) => {
    if (filter === "all") return true;
    if (filter === "active") return !["completed", "cancelled"].includes(order.fulfillmentStatus);
    return order.fulfillmentStatus === filter;
  }), [orders, filter]);
  const counts = { active: orders.filter((order) => !["completed", "cancelled"].includes(order.fulfillmentStatus)).length, completed: orders.filter((order) => order.fulfillmentStatus === "completed").length, cancelled: orders.filter((order) => order.fulfillmentStatus === "cancelled").length, all: orders.length };
  async function update(order: OperatorOrder, patch: { fulfillmentStatus?: string; paymentStatus?: string }) {
    setUpdating(order.id); setError("");
    try {
      const response = await fetch(`/api/operator/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...patch, expectedUpdatedAt: order.updatedAt }) }); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The order could not be updated.");
      const safe = data.order as OperatorOrder;
      setOrders((current) => current.map((entry) => entry.id === safe.id ? safe : entry)); setAnnouncement(`${safe.orderNumber} updated to ${fulfillmentLabels[safe.fulfillmentStatus]}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The order could not be updated."); await refresh(false); }
    finally { setUpdating(null); }
  }
  return <main className="container operator-page"><div className="operator-head"><div><span className="eyebrow">Live operations</span><h1 className="section-title">Pickup orders</h1><p>Signed in as {operatorEmail}</p></div></div><div className="operator-status-bar"><span><i className={refreshing ? "live-dot checking" : "live-dot"} aria-hidden="true" /> {refreshing ? "Checking for new orders…" : "Auto-refresh is on · every 5 seconds"}</span><div><small>{lastCheckedAt ? `Last checked ${new Intl.DateTimeFormat("en-CA", { timeStyle: "medium", timeZone: "America/Toronto" }).format(new Date(lastCheckedAt))}` : "Starting live updates…"}</small><strong>{counts.active} active</strong></div></div>{announcement && <div className="status-announcer operator-announcement" role="status">{announcement}</div>}{error && <div className="inline-error" role="alert"><strong>Dashboard update failed</strong><span>{error}</span><button className="text-action" type="button" onClick={() => refresh(false)}>Try again</button></div>}<nav className="operator-filters" aria-label="Order filters">{(["active", "completed", "cancelled", "all"] as Filter[]).map((value) => <button key={value} className={filter === value ? "active" : ""} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}>{value[0].toUpperCase() + value.slice(1)} <span>{counts[value]}</span></button>)}</nav>{!visible.length ? <div className="empty-operator"><Clock3 size={36} /><h2>No {filter === "all" ? "" : `${filter} `}orders</h2><p>New pickup orders will appear here automatically.</p></div> : <div className="operator-orders">{visible.map((order) => <article className={`operator-order status-${order.fulfillmentStatus}`} key={order.id}><header className="operator-order-head"><div><span className={`status-pill status-${order.fulfillmentStatus}`}>{fulfillmentLabels[order.fulfillmentStatus]}</span><h2>{order.orderNumber}</h2><time dateTime={order.createdAt} suppressHydrationWarning>{date(order.createdAt)}</time></div><strong>{formatCad(order.totalCents)}</strong></header><div className="operator-customer"><span><UserRound size={17} /> {order.customerName}</span><a href={`mailto:${order.customerEmail}`}><Mail size={17} /> {order.customerEmail}</a><a href={`tel:${order.customerPhone}`}><Phone size={17} /> {order.customerPhone}</a></div><div className="operator-lines">{order.lines.map((line) => <span key={line.lineId}><b>{line.quantity} × {line.name}</b>{line.selections.map((selection) => ` · ${selection.optionName}`).join("")} <em>{formatCad(line.lineTotalCents)}</em></span>)}</div>{order.customerNotes && <p className="operator-notes"><strong>Notes:</strong> {order.customerNotes}</p>}<div className="operator-order-actions"><label><span>Kitchen status</span><select value={order.fulfillmentStatus} disabled={updating === order.id} onChange={(event) => update(order, { fulfillmentStatus: event.target.value })}>{fulfillmentStatuses.map((status) => <option value={status} key={status}>{fulfillmentLabels[status]}</option>)}</select></label><button className={order.paymentStatus === "paid_at_store" ? "payment-state paid" : "payment-state"} type="button" disabled={updating === order.id} onClick={() => update(order, { paymentStatus: order.paymentStatus === "paid_at_store" ? "unpaid" : "paid_at_store" })}>{order.paymentStatus === "paid_at_store" ? <Check size={18} /> : <Banknote size={18} />}{order.paymentStatus === "paid_at_store" ? "Paid at store" : "Mark paid at store"}</button>{updating === order.id && <span className="summary-note" role="status">Saving…</span>}</div></article>)}</div>}</main>;
}
