"use client";
import { ShoppingBag, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ItemDialog } from "@/components/item-dialog";
import { QuantityControl } from "@/components/quantity-control";
import { selectedOptionNames } from "@/lib/cart";
import { formatCad, menuItems, type MenuItem } from "@/lib/menu";

export function CartPageClient() {
  const cart = useCart();
  const [editing, setEditing] = useState<{ lineId: string; item: MenuItem; selections: Record<string, string>; quantity: number } | null>(null);
  if (!cart.hydrated) return <div className="container page-loading" aria-live="polite">Loading your cart…</div>;
  if (!cart.lines.length) return <main className="container empty-page"><ShoppingBag size={44} /><h1 className="display">Your cart is empty</h1><p>Explore the menu and add dishes for pickup.</p><Link className="button-primary" href="/menu">View menu</Link></main>;
  return <main className="container cart-page"><div className="cart-page-head"><span className="eyebrow">Pickup order</span><h1 className="section-title">Review your cart</h1><p>Check quantities and required choices before continuing.</p></div><div className="cart-page-grid"><section aria-label="Cart items" className="cart-items-panel">{cart.lines.map((line) => { const item = menuItems.find((entry) => entry.id === line.itemId); return <article className="cart-page-line" key={line.lineId}><div><h2>{line.displayName}</h2>{selectedOptionNames(item, line.selections).map((name) => <p key={name}>{name}</p>)}<strong>{formatCad(line.unitPriceCents)} each</strong></div><div className="cart-page-controls"><QuantityControl value={line.quantity} onChange={(quantity) => cart.updateQuantity(line.lineId, quantity)} label={`${line.displayName} quantity`} />{item?.optionGroups.length ? <button className="text-action" onClick={() => setEditing({ lineId: line.lineId, item, selections: line.selections, quantity: line.quantity })}>Edit choices</button> : null}<button className="text-action" onClick={() => cart.removeLine(line.lineId)}><Trash2 size={17} /> Remove</button></div><strong className="cart-page-total">{formatCad(line.unitPriceCents * line.quantity)}</strong></article>; })}</section><aside className="order-summary"><h2 className="display">Order summary</h2><div className="summary-row"><span>Subtotal</span><strong>{formatCad(cart.subtotalCents)}</strong></div><p className="summary-note">Taxes and any approved fees are calculated from the current server catalogue at checkout.</p><Link className="button-primary full" href="/checkout">Continue to checkout</Link><Link className="button-secondary full" href="/menu">Add more items</Link></aside></div>{editing && <ItemDialog item={editing.item} open onOpenChange={(open) => { if (!open) setEditing(null); }} editingLineId={editing.lineId} initialSelections={editing.selections} initialQuantity={editing.quantity} />}</main>;
}
