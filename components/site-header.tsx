"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, ShoppingBag, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/cart-provider";

const nav = [{ href: "/", label: "Home" }, { href: "/menu", label: "Menu" }, { href: "/about", label: "About Us" }];

export function SiteHeader({ name = "Heart of India", tagline = "Authentic Indian Restaurant", phone = "+19055005382" }: { name?: string; tagline?: string; phone?: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { itemCount, openCart } = useCart();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link className="brand" href="/" aria-label="Heart of India home">
          <Image src="/heart-of-india-logo.png" alt="" width={124} height={124} priority />
          <span className="brand-copy"><strong>{name}</strong><span>{tagline}</span></span>
        </Link>
        <nav className="desktop-nav" aria-label="Primary navigation">{nav.map((item) => <Link aria-current={pathname === item.href ? "page" : undefined} key={item.href} href={item.href}>{item.label}</Link>)}<Link className="button-primary" href="/menu">Order Online</Link></nav>
        <button id="site-cart-trigger" className="cart-trigger" type="button" onClick={() => openCart("site-cart-trigger")} aria-label={`Open cart, ${itemCount} items`}><ShoppingBag size={20} /><span className="cart-label">Cart</span><span className="cart-count" aria-hidden="true">{itemCount}</span></button>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger asChild><button className="mobile-menu-trigger" type="button" aria-label="Open navigation"><Menu size={24} /></button></Dialog.Trigger>
          <Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className="nav-drawer" aria-describedby={undefined}><div className="drawer-head"><Dialog.Title className="display">Menu</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close navigation"><X size={24} /></Dialog.Close></div><nav aria-label="Mobile navigation">{nav.map((item) => <Dialog.Close key={item.href} asChild><Link aria-current={pathname === item.href ? "page" : undefined} href={item.href}>{item.label}</Link></Dialog.Close>)}<Dialog.Close asChild><Link href="/menu">Order Online</Link></Dialog.Close><a href={`tel:${phone}`}>Call {phone === "+19055005382" ? "905-500-5382" : phone}</a></nav></Dialog.Content></Dialog.Portal>
        </Dialog.Root>
      </div>
    </header>
  );
}
