import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/auth";
import { retryNotifications } from "@/app/operator/actions";
import { getDb } from "@/db";
import { listPaidOrders } from "@/lib/server/orders";
import { requireOperator } from "@/lib/server/operator";
import { formatCad } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Paid orders", robots: { index: false, follow: false } };
export default async function OperatorOrdersPage() {
  const operator = await requireOperator(); const db = getDb(); const paid = db ? await listPaidOrders() : [];
  return <main className="container operator-page"><div className="operator-head"><div><span className="eyebrow">Operations</span><h1 className="section-title">Paid orders</h1><p>Signed in as {operator.email}</p></div><div className="hero-actions"><Link className="button-secondary" href="/operator/settings">Settings</Link><form action={async () => { "use server"; await signOut({ redirectTo: "/operator/login" }); }}><button className="button-secondary">Sign out</button></form></div></div>{!paid.length ? <div className="empty-operator"><h2>No paid orders yet</h2><p>Verified Stripe payments will appear here even if email delivery is interrupted.</p></div> : <div className="operator-orders">{paid.map((order) => <article className="operator-order" key={order.id}><div><strong>{order.orderNumber}</strong><span>{new Intl.DateTimeFormat("en-CA", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Toronto" }).format(order.paidAt ?? order.createdAt)}</span></div><div><span>{order.customerName}</span><a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a><a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a></div><strong>{formatCad(order.totalCents)}</strong><div className="operator-lines">{order.lines.map((line) => <span key={line.lineId}><b>{line.quantity} × {line.name}</b>{line.selections.map((selection) => ` · ${selection.optionName}`).join("")}</span>)}</div>{order.customerNotes && <p className="operator-notes"><strong>Notes:</strong> {order.customerNotes}</p>}<div className="notification-list">{order.notifications.map((notification) => <span className={`notification ${notification.status}`} key={notification.id}>{notification.kind === "restaurant_order" ? "Restaurant" : "Customer"}: {notification.status}{notification.attempts ? ` (${notification.attempts} attempts)` : ""}</span>)}</div>{order.notifications.some((notification) => ["failed", "terminal"].includes(notification.status)) && <form action={retryNotifications}><input type="hidden" name="orderId" value={order.id} /><button className="button-secondary">Retry failed email</button></form>}</article>)}</div>}</main>;
}
