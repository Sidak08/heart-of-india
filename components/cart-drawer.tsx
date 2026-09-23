"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ItemDialog } from "@/components/item-dialog";
import { QuantityControl } from "@/components/quantity-control";
import { formatCad, menuItems, type MenuItem } from "@/lib/menu";
import { selectedOptionNames } from "@/lib/cart";

type Editing = { lineId: string; item: MenuItem; selections: Record<string, string>; quantity: number };
export function CartDrawer() {
  const cart = useCart(); const [editing, setEditing] = useState<Editing | null>(null); const [editorOpen, setEditorOpen] = useState(false); const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (transitionTimer.current) clearTimeout(transitionTimer.current); }, []);
  const transitionDelay = (milliseconds: number) => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : milliseconds;
  const edit = (value: Editing) => { cart.setCartOpen(false); if (transitionTimer.current) clearTimeout(transitionTimer.current); transitionTimer.current = setTimeout(() => { setEditing(value); setEditorOpen(true); }, transitionDelay(210)); };
  const changeEditorOpen = (open: boolean) => { setEditorOpen(open); if (open) return; if (transitionTimer.current) clearTimeout(transitionTimer.current); transitionTimer.current = setTimeout(() => { setEditing(null); cart.setCartOpen(true); }, transitionDelay(190)); };
  return <><Dialog.Root open={cart.cartOpen} onOpenChange={cart.setCartOpen}><Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className="cart-drawer" aria-describedby={undefined} onCloseAutoFocus={(event) => { event.preventDefault(); requestAnimationFrame(() => document.getElementById(cart.cartReturnFocusId)?.focus({ preventScroll: true })); }}>
    <div className="drawer-head"><div><span className="eyebrow">Your pickup order</span><Dialog.Title className="display">Cart</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close cart"><X size={24} /></Dialog.Close></div>
    <div className="cart-scroll">{cart.lines.length === 0 ? <div className="empty-state"><ShoppingBag size={38} /><h3>Your cart is empty</h3><p>Browse the menu to choose something for pickup.</p><Dialog.Close asChild><Link className="button-primary" href="/menu">View menu</Link></Dialog.Close></div> : cart.lines.map((line) => { const item = menuItems.find((entry) => entry.id === line.itemId); return <article className="cart-line" key={line.lineId}><div className="cart-line-title"><div><h3>{line.displayName}</h3>{selectedOptionNames(item, line.selections).map((text) => <p key={text}>{text}</p>)}</div><strong>{formatCad(line.unitPriceCents * line.quantity)}</strong></div><div className="cart-line-actions"><QuantityControl value={line.quantity} onChange={(value) => cart.updateQuantity(line.lineId, value)} label={`${line.displayName} quantity`} /><div>{item?.optionGroups.length ? <button className="text-action" type="button" onClick={() => edit({ lineId: line.lineId, item, selections: line.selections, quantity: line.quantity })}>Edit</button> : null}<button className="text-action" type="button" onClick={() => cart.removeLine(line.lineId)}><Trash2 size={17} /> Remove</button></div></div></article>; })}</div>
    {cart.lines.length > 0 && <div className="drawer-summary"><div><span>Subtotal</span><strong>{formatCad(cart.subtotalCents)}</strong></div><p>HST and the final amount due at the store are shown at checkout.</p><Dialog.Close asChild><Link className="button-primary full" href="/cart">View cart & checkout</Link></Dialog.Close></div>}
  </Dialog.Content></Dialog.Portal></Dialog.Root>{editing && <ItemDialog item={editing.item} open={editorOpen} onOpenChange={changeEditorOpen} editingLineId={editing.lineId} initialSelections={editing.selections} initialQuantity={editing.quantity} />}</>;
}
