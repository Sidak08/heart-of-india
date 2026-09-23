"use client";

import { Bookmark, Camera, Check, CheckCircle2, ChefHat, CircleX, Clock3, Copy, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatCad } from "@/lib/menu";
import { fulfillmentLabels, type FulfillmentStatus, type StoredOrder } from "@/lib/operations";

type PublicOrder = Omit<StoredOrder, "guestTokenHash" | "guestAccessExpiresAt" | "attemptId">;
type OrderStatusResponse = { order: PublicOrder; accessToken: string; accessExpiresAt: string };

function StatusIcon({ status }: { status: FulfillmentStatus }) {
  if (status === "cancelled") return <CircleX className="status-icon failure" size={54} />;
  if (status === "preparing") return <ChefHat className="status-icon pending" size={54} />;
  if (status === "ready_for_pickup") return <PackageCheck className="status-icon success" size={54} />;
  if (status === "completed") return <CheckCircle2 className="status-icon success" size={54} />;
  return <Clock3 className="status-icon pending" size={54} />;
}

function heading(status: FulfillmentStatus) {
  return { new: "Your order was received", preparing: "Your order is being prepared", ready_for_pickup: "Your order is ready for pickup", completed: "Your order is complete", cancelled: "This order was cancelled" }[status];
}

function tokenFromLocation() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("access") ?? "";
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}

function saveTokenInAddress(token: string) {
  const url = new URL(window.location.href); const hash = new URLSearchParams(url.hash.slice(1));
  hash.set("access", token); url.hash = hash.toString(); window.history.replaceState(window.history.state, "", url.toString());
}

function formatAccessExpiry(value: string) {
  try { return new Intl.DateTimeFormat("en-CA", { dateStyle: "long" }).format(new Date(value)); }
  catch { return "30 days after the order was placed"; }
}

export function OrderStatusClient({ orderId }: { orderId: string }) {
  const cart = useCart(); const [order, setOrder] = useState<PublicOrder | null>(null); const [error, setError] = useState(""); const [checking, setChecking] = useState(true); const [accessExpiresAt, setAccessExpiresAt] = useState(""); const [copyMessage, setCopyMessage] = useState("");
  const cleared = useRef(false); const accessToken = useRef(""); const clearPurchasedSnapshot = cart.clearPurchasedSnapshot;

  useEffect(() => {
    accessToken.current = tokenFromLocation();
    let stopped = false; let timeout: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const headers: HeadersInit = accessToken.current ? { Authorization: `Bearer ${accessToken.current}` } : {};
        const response = await fetch(`/api/orders/${orderId}`, { cache: "no-store", headers }); const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Order status could not be loaded."); if (stopped) return;
        const result = data as OrderStatusResponse;
        if (/^[A-Za-z0-9_-]{43}$/.test(result.accessToken)) { accessToken.current = result.accessToken; saveTokenInAddress(result.accessToken); }
        setOrder(result.order); setAccessExpiresAt(result.accessExpiresAt); setError(""); setChecking(false);
        if (!cleared.current) { clearPurchasedSnapshot(result.order.cartSnapshot); cleared.current = true; }
        if (!["completed", "cancelled"].includes(result.order.fulfillmentStatus)) timeout = setTimeout(check, document.visibilityState === "visible" ? 6000 : 15_000);
      } catch (caught) { if (!stopped) { setError(caught instanceof Error ? caught.message : "Order status could not be loaded."); setChecking(false); } }
    }
    void check();
    return () => { stopped = true; clearTimeout(timeout); };
  }, [orderId, clearPurchasedSnapshot]);

  async function copyPrivateLink() {
    const url = window.location.href;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
      else {
        const field = document.createElement("textarea"); field.value = url; field.setAttribute("readonly", ""); field.style.position = "fixed"; field.style.opacity = "0";
        document.body.append(field); field.select(); const copied = document.execCommand("copy"); field.remove(); if (!copied) throw new Error("Copy was not available.");
      }
      setCopyMessage("Private order link copied. Save it somewhere only you can access.");
    } catch { setCopyMessage("Use your browser’s bookmark or share controls to save this page."); }
  }

  return <main className="container confirmation-page"><section className="confirmation-card">
    {checking && !order ? <Clock3 className="status-icon pending" size={54} /> : order ? <StatusIcon status={order.fulfillmentStatus} /> : <CircleX className="status-icon failure" size={54} />}
    <span className="eyebrow">{order ? fulfillmentLabels[order.fulfillmentStatus] : "Loading order"}</span>
    <h1 className="section-title">{order ? heading(order.fulfillmentStatus) : "Checking your order"}</h1>
    {checking && !order && <p aria-live="polite">We are loading the restaurant’s order record.</p>}
    {error && <div className="inline-error" role="alert"><strong>Status unavailable</strong><span>{error}</span><button className="text-action" onClick={() => location.reload()}>Try again</button></div>}
    {order && <>
      <p>Order <strong>{order.orderNumber}</strong> is recorded. Show this number at the restaurant when you pick it up.</p>
      <div className="order-save-card" aria-labelledby="save-order-title">
        <div className="order-save-heading"><Bookmark aria-hidden="true" /><div><h2 id="save-order-title">Save your order details</h2><p>This is a private order page. The complete saved link can open your live status on another phone or computer{accessExpiresAt ? ` until ${formatAccessExpiry(accessExpiresAt)}` : ""}.</p></div></div>
        <ol className="order-save-steps"><li><Bookmark aria-hidden="true" /><span><strong>Save this link</strong>Bookmark this page or copy the private link below. Keep it private because anyone with the complete link can view this order.</span></li><li><Camera aria-hidden="true" /><span><strong>Take a screenshot</strong>Capture the order number and receipt before leaving this page so you have them ready at pickup.</span></li></ol>
        <button className="button-secondary order-link-button" type="button" onClick={copyPrivateLink}>{copyMessage.startsWith("Private order link copied") ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copyMessage.startsWith("Private order link copied") ? "Link copied" : "Copy private order link"}</button>
        {copyMessage && <p className="order-copy-message" role="status">{copyMessage}</p>}
      </div>
      <div className={`order-progress status-${order.fulfillmentStatus}`} aria-label={`Order status: ${fulfillmentLabels[order.fulfillmentStatus]}`}><span className="active">Received</span><span className={["preparing", "ready_for_pickup", "completed"].includes(order.fulfillmentStatus) ? "active" : ""}>Preparing</span><span className={["ready_for_pickup", "completed"].includes(order.fulfillmentStatus) ? "active" : ""}>Ready</span></div>
      <div className="pickup-box"><strong>Pickup location</strong><span>{order.pickupAddress.street}, {order.pickupAddress.city}, {order.pickupAddress.province} {order.pickupAddress.postalCode}</span>{order.pickupEstimateText && <span>{order.pickupEstimateText}</span>}<strong>{order.paymentStatus === "paid_at_store" ? "Paid at store" : "Payment due at store"}</strong></div>
      <div className="confirmation-receipt"><h2 className="display">Order details</h2>{order.lines.map((line) => <div className="receipt-line" key={line.lineId}><div><strong>{line.quantity} × {line.name}</strong>{line.selections.map((selection) => <small key={selection.groupId}>{selection.groupLabel}: {selection.optionName}</small>)}</div><strong>{formatCad(line.lineTotalCents)}</strong></div>)}<div className="summary-row"><span>Subtotal</span><strong>{formatCad(order.subtotalCents)}</strong></div>{order.taxBreakdown.map((tax) => <div className="summary-row" key={tax.label}><span>{tax.label}{tax.inclusive ? " (included)" : ""}</span><strong>{formatCad(tax.amountCents)}</strong></div>)}{order.feeCents > 0 && <div className="summary-row"><span>Fees</span><strong>{formatCad(order.feeCents)}</strong></div>}<div className="summary-row summary-total"><span>{order.paymentStatus === "paid_at_store" ? "Total paid" : "Total due at store"}</span><strong>{formatCad(order.totalCents)}</strong></div></div>
    </>}
    <div className="hero-actions"><Link className="button-secondary" href="/menu">Back to menu</Link></div>
  </section></main>;
}
