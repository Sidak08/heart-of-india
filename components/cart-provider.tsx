"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "@/lib/menu";
import { calculateUnitPrice, CartLine, CartSelections, cartSubtotal, EMPTY_CART, selectionKey, validateSelections } from "@/lib/cart";

const STORAGE_KEY = "heart-of-india-cart-v1";

type CartContextValue = {
  lines: CartLine[]; itemCount: number; subtotalCents: number; hydrated: boolean; storageAvailable: boolean;
  cartPulseToken: number;
  cartOpen: boolean; cartReturnFocusId: string; setCartOpen: (open: boolean) => void; openCart: (returnFocusId: string) => void;
  addItem: (item: MenuItem, selections?: CartSelections, quantity?: number) => { ok: boolean; lineId?: string };
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  replaceLine: (lineId: string, item: MenuItem, selections: CartSelections, quantity: number) => void;
  clearPurchasedSnapshot: (snapshot: Array<{ lineId: string; quantity: number }>) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function parseStoredCart(value: string | null): CartLine[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as typeof EMPTY_CART;
    if (parsed.version !== 1 || !Array.isArray(parsed.lines)) return [];
    return parsed.lines.filter((line) => typeof line.lineId === "string" && typeof line.itemId === "string" && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20);
  } catch { return []; }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartReturnFocusId, setCartReturnFocusId] = useState("site-cart-trigger");
  const [cartPulseToken, setCartPulseToken] = useState(0);

  useEffect(() => {
    queueMicrotask(() => {
      try { setLines(parseStoredCart(window.localStorage.getItem(STORAGE_KEY))); }
      catch { setStorageAvailable(false); }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || !storageAvailable) return;
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, lines })); }
    catch { queueMicrotask(() => setStorageAvailable(false)); }
  }, [hydrated, lines, storageAvailable]);

  const addItem = useCallback((item: MenuItem, selections: CartSelections = {}, quantity = 1) => {
    if (!validateSelections(item, selections) || quantity < 1 || quantity > 20) return { ok: false };
    const key = selectionKey(item.id, selections);
    let lineId = "";
    setLines((current) => {
      const existing = current.find((line) => selectionKey(line.itemId, line.selections) === key);
      if (existing) {
        lineId = existing.lineId;
        return current.map((line) => line.lineId === existing.lineId ? { ...line, quantity: Math.min(20, line.quantity + quantity) } : line);
      }
      lineId = crypto.randomUUID();
      return [...current, { lineId, itemId: item.id, quantity, selections, displayName: item.name, unitPriceCents: calculateUnitPrice(item, selections) }];
    });
    setCartPulseToken((current) => current + 1);
    return { ok: true, lineId };
  }, []);

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    const increased = Boolean(lines.find((line) => line.lineId === lineId && quantity > line.quantity));
    setLines((current) => quantity <= 0 ? current.filter((line) => line.lineId !== lineId) : current.map((line) => line.lineId === lineId ? { ...line, quantity: Math.min(20, Math.max(1, quantity)) } : line));
    if (increased) setCartPulseToken((current) => current + 1);
  }, [lines]);
  const removeLine = useCallback((lineId: string) => setLines((current) => current.filter((line) => line.lineId !== lineId)), []);
  const replaceLine = useCallback((lineId: string, item: MenuItem, selections: CartSelections, quantity: number) => {
    if (!validateSelections(item, selections)) return;
    setLines((current) => {
      const next = current.filter((line) => line.lineId !== lineId);
      const key = selectionKey(item.id, selections);
      const matching = next.find((line) => selectionKey(line.itemId, line.selections) === key);
      if (matching) return next.map((line) => line.lineId === matching.lineId ? { ...line, quantity: Math.min(20, line.quantity + quantity) } : line);
      return [...next, { lineId, itemId: item.id, selections, quantity, displayName: item.name, unitPriceCents: calculateUnitPrice(item, selections) }];
    });
  }, []);
  const clearPurchasedSnapshot = useCallback((snapshot: Array<{ lineId: string; quantity: number }>) => setLines((current) => current.flatMap((line) => {
    const purchased = snapshot.find((entry) => entry.lineId === line.lineId);
    if (!purchased) return [line];
    const remaining = line.quantity - purchased.quantity;
    return remaining > 0 ? [{ ...line, quantity: remaining }] : [];
  })), []);
  const clear = useCallback(() => setLines([]), []);
  const openCart = useCallback((returnFocusId: string) => { setCartReturnFocusId(returnFocusId); setCartOpen(true); }, []);

  const value = useMemo(() => ({ lines, itemCount: lines.reduce((sum, line) => sum + line.quantity, 0), subtotalCents: cartSubtotal(lines), hydrated, storageAvailable, cartOpen, cartReturnFocusId, cartPulseToken, setCartOpen, openCart, addItem, updateQuantity, removeLine, replaceLine, clearPurchasedSnapshot, clear }), [lines, hydrated, storageAvailable, cartOpen, cartReturnFocusId, cartPulseToken, openCart, addItem, updateQuantity, removeLine, replaceLine, clearPurchasedSnapshot, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
