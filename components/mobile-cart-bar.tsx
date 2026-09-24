"use client";
import { ShoppingBag } from "lucide-react";
import { Fragment } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart-provider";
import { formatCad } from "@/lib/menu";

export function MobileCartBar() {
  const pathname = usePathname();
  const { itemCount, subtotalCents, cartOpen, openCart, cartPulseToken } = useCart();
  if (!itemCount || cartOpen || !["/", "/menu", "/about"].includes(pathname)) return null;
  return <Fragment><div className="mobile-cart-spacer" aria-hidden="true" /><div className="mobile-cart-wrap"><button id="mobile-cart-trigger" type="button" className="mobile-cart-bar" onClick={() => openCart("mobile-cart-trigger")}><span><ShoppingBag size={20} /> View Cart <b key={cartPulseToken} className={cartPulseToken ? "cart-count-pulse" : ""}>{itemCount}</b></span><span><small>Subtotal</small>{formatCad(subtotalCents)}</span></button></div></Fragment>;
}
