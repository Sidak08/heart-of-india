"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem } from "@/lib/menu";
import { isOrderableItem } from "@/lib/menu";
import {
  calculateUnitPrice, type CartLine, type CartSelections, CART_MAX_ITEMS, CART_MAX_LINES, cartSubtotal,
  mergeCartStates, parseCartStorage, selectionKey, type CartState, validateSelections,
} from "@/lib/cart";

const STORAGE_KEY = "heart-of-india-cart-v1";

export type CartMutationResult = { ok: boolean; itemCount: number; lineId?: string; error?: string };
export type CartLineIssue = { lineId: string; message: string };

type CartContextValue = {
  lines: CartLine[]; itemCount: number; subtotalCents: number; hydrated: boolean; storageAvailable: boolean; catalogue: MenuItem[];
  issues: CartLineIssue[]; canCheckout: boolean; cartPulseToken: number;
  cartOpen: boolean; cartReturnFocusId: string; setCartOpen: (open: boolean) => void; openCart: (returnFocusId: string) => void;
  addItem: (item: MenuItem, selections?: CartSelections, quantity?: number) => CartMutationResult;
  updateQuantity: (lineId: string, quantity: number) => CartMutationResult;
  removeLine: (lineId: string) => void;
  replaceLine: (lineId: string, item: MenuItem, selections: CartSelections, quantity: number) => CartMutationResult;
  clearPurchasedSnapshot: (snapshot: Array<{ lineId: string; quantity: number }>) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);
const countItems = (lines: CartLine[]) => lines.reduce((sum, line) => sum + line.quantity, 0);

export function CartProvider({ children, catalogue, catalogueDegraded = false }: { children: React.ReactNode; catalogue: MenuItem[]; catalogueDegraded?: boolean }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const linesRef = useRef<CartLine[]>([]);
  const tombstonesRef = useRef<Record<string, number>>({});
  const revisionRef = useRef(0);
  const writerId = useRef("");
  const [hydrated, setHydrated] = useState(false);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [damagedStorage, setDamagedStorage] = useState(false);
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartReturnFocusId, setCartReturnFocusId] = useState("site-cart-trigger");
  const [cartPulseToken, setCartPulseToken] = useState(0);

  const commit = useCallback((next: CartLine[], tombstones = tombstonesRef.current) => {
    linesRef.current = next; tombstonesRef.current = tombstones; revisionRef.current = Math.max(revisionRef.current + 1, Date.now()); setLines(next);
  }, []);

  useEffect(() => {
    writerId.current = crypto.randomUUID();
    queueMicrotask(() => {
      try {
        const parsed = parseCartStorage(window.localStorage.getItem(STORAGE_KEY), catalogue);
        linesRef.current = parsed.state.lines; tombstonesRef.current = parsed.state.tombstones; revisionRef.current = parsed.state.revision;
        setLines(parsed.state.lines); setDamagedStorage(parsed.damaged);
      } catch { setStorageAvailable(false); }
      setHydrated(true);
    });
  }, [catalogue]);

  useEffect(() => {
    if (!hydrated || !storageAvailable || !writerId.current) return;
    const value: CartState = { version: 2, revision: revisionRef.current, writerId: writerId.current, lines, tombstones: tombstonesRef.current };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
    catch { queueMicrotask(() => setStorageAvailable(false)); }
  }, [hydrated, lines, storageAvailable]);

  useEffect(() => {
    if (!hydrated) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      const parsed = parseCartStorage(event.newValue, catalogue);
      if (parsed.damaged) setDamagedStorage(true);
      if (parsed.state.writerId === writerId.current) return;
      const local: CartState = { version: 2, revision: revisionRef.current, writerId: writerId.current, lines: linesRef.current, tombstones: tombstonesRef.current };
      const merged = mergeCartStates(local, parsed.state);
      if (JSON.stringify(merged.lines) === JSON.stringify(local.lines) && JSON.stringify(merged.tombstones) === JSON.stringify(local.tombstones)) return;
      tombstonesRef.current = merged.tombstones; revisionRef.current = merged.revision; linesRef.current = merged.lines; setLines(merged.lines);
    };
    window.addEventListener("storage", onStorage); return () => window.removeEventListener("storage", onStorage);
  }, [catalogue, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const byId = new Map(catalogue.map((item) => [item.id, item])); const now = Date.now();
    const reconciled = linesRef.current.map((line) => {
      const item = byId.get(line.itemId); if (!item || !validateSelections(item, line.selections)) return line;
      const price = calculateUnitPrice(item, line.selections);
      return item.name === line.displayName && price === line.unitPriceCents ? line : { ...line, displayName: item.name, unitPriceCents: price, updatedAt: now };
    });
    if (reconciled.some((line, index) => line !== linesRef.current[index])) commit(reconciled);
  }, [catalogue, commit, hydrated]);

  const addItem = useCallback((item: MenuItem, selections: CartSelections = {}, quantity = 1): CartMutationResult => {
    const current = linesRef.current; const currentCount = countItems(current);
    if (!isOrderableItem(item)) return { ok: false, itemCount: currentCount, error: "This item is not available for online ordering." };
    if (!validateSelections(item, selections)) return { ok: false, itemCount: currentCount, error: "Required choices are missing or invalid." };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return { ok: false, itemCount: currentCount, error: "Choose a quantity from 1 to 20." };
    if (currentCount + quantity > CART_MAX_ITEMS) return { ok: false, itemCount: currentCount, error: `A cart can contain at most ${CART_MAX_ITEMS} items.` };
    const key = selectionKey(item.id, selections); const existing = current.find((line) => selectionKey(line.itemId, line.selections) === key);
    if (!existing && current.length >= CART_MAX_LINES) return { ok: false, itemCount: currentCount, error: `A cart can contain at most ${CART_MAX_LINES} different lines.` };
    if (existing && existing.quantity + quantity > 20) return { ok: false, itemCount: currentCount, error: "A single cart line can contain at most 20 items." };
    const now = Date.now(); const lineId = existing?.lineId ?? crypto.randomUUID();
    const next = existing
      ? current.map((line) => line.lineId === existing.lineId ? { ...line, quantity: line.quantity + quantity, updatedAt: now } : line)
      : [...current, { lineId, itemId: item.id, quantity, selections, displayName: item.name, unitPriceCents: calculateUnitPrice(item, selections), updatedAt: now }];
    commit(next); setCartPulseToken((value) => value + 1);
    return { ok: true, lineId, itemCount: countItems(next) };
  }, [commit]);

  const updateQuantity = useCallback((lineId: string, quantity: number): CartMutationResult => {
    const current = linesRef.current; const line = current.find((entry) => entry.lineId === lineId); const currentCount = countItems(current);
    if (!line) return { ok: false, itemCount: currentCount, error: "That cart line no longer exists." };
    if (quantity <= 0) {
      const now = Date.now(); const tombstones = { ...tombstonesRef.current, [lineId]: now }; const next = current.filter((entry) => entry.lineId !== lineId);
      commit(next, tombstones); return { ok: true, itemCount: countItems(next) };
    }
    const bounded = Math.min(20, Math.max(1, Math.trunc(quantity))); const nextCount = currentCount - line.quantity + bounded;
    if (nextCount > CART_MAX_ITEMS) return { ok: false, itemCount: currentCount, error: `A cart can contain at most ${CART_MAX_ITEMS} items.` };
    const next = current.map((entry) => entry.lineId === lineId ? { ...entry, quantity: bounded, updatedAt: Date.now() } : entry);
    commit(next); if (bounded > line.quantity) setCartPulseToken((value) => value + 1);
    return { ok: true, itemCount: nextCount };
  }, [commit]);

  const removeLine = useCallback((lineId: string) => {
    const now = Date.now(); commit(linesRef.current.filter((line) => line.lineId !== lineId), { ...tombstonesRef.current, [lineId]: now });
  }, [commit]);

  const replaceLine = useCallback((lineId: string, item: MenuItem, selections: CartSelections, quantity: number): CartMutationResult => {
    const current = linesRef.current; const prior = current.find((line) => line.lineId === lineId); const currentCount = countItems(current);
    if (!prior || !isOrderableItem(item) || !validateSelections(item, selections)) return { ok: false, itemCount: currentCount, error: "This selection is no longer available." };
    const bounded = Math.min(20, Math.max(1, Math.trunc(quantity))); if (currentCount - prior.quantity + bounded > CART_MAX_ITEMS) return { ok: false, itemCount: currentCount, error: `A cart can contain at most ${CART_MAX_ITEMS} items.` };
    const now = Date.now(); const rest = current.filter((line) => line.lineId !== lineId); const key = selectionKey(item.id, selections); const matching = rest.find((line) => selectionKey(line.itemId, line.selections) === key);
    let next: CartLine[]; let tombstones = tombstonesRef.current;
    if (matching) {
      if (matching.quantity + bounded > 20) return { ok: false, itemCount: currentCount, error: "A single cart line can contain at most 20 items." };
      tombstones = { ...tombstones, [lineId]: now }; next = rest.map((line) => line.lineId === matching.lineId ? { ...line, quantity: line.quantity + bounded, updatedAt: now } : line);
    } else next = [...rest, { lineId, itemId: item.id, selections, quantity: bounded, displayName: item.name, unitPriceCents: calculateUnitPrice(item, selections), updatedAt: now }];
    commit(next, tombstones); return { ok: true, lineId: matching?.lineId ?? lineId, itemCount: countItems(next) };
  }, [commit]);

  const clearPurchasedSnapshot = useCallback((snapshot: Array<{ lineId: string; quantity: number }>) => {
    const tombstones = { ...tombstonesRef.current }; const now = Date.now();
    const next = linesRef.current.flatMap((line) => { const purchased = snapshot.find((entry) => entry.lineId === line.lineId); if (!purchased) return [line]; const remaining = line.quantity - purchased.quantity; if (remaining > 0) return [{ ...line, quantity: remaining, updatedAt: now }]; tombstones[line.lineId] = now; return []; });
    commit(next, tombstones);
  }, [commit]);
  const clear = useCallback(() => { const now = Date.now(); commit([], { ...tombstonesRef.current, ...Object.fromEntries(linesRef.current.map((line) => [line.lineId, now])) }); setDamagedStorage(false); }, [commit]);
  const openCart = useCallback((returnFocusId: string) => { setCartReturnFocusId(returnFocusId); setCartOpen(true); }, []);

  const catalogueMap = useMemo(() => new Map(catalogue.map((item) => [item.id, item])), [catalogue]);
  const issues = useMemo(() => lines.flatMap((line) => { const item = catalogueMap.get(line.itemId); if (!item) return [{ lineId: line.lineId, message: "This item is no longer on the menu." }]; if (!isOrderableItem(item)) return [{ lineId: line.lineId, message: item.availability === "unavailable" ? "This item is currently unavailable." : "This item still needs owner confirmation." }]; if (!validateSelections(item, line.selections)) return [{ lineId: line.lineId, message: "Required choices need to be reviewed." }]; return []; }), [catalogueMap, lines]);
  const itemCount = countItems(lines);
  const value = useMemo(() => ({ lines, itemCount, subtotalCents: cartSubtotal(lines), hydrated, storageAvailable, catalogue, issues, canCheckout: issues.length === 0 && lines.length <= CART_MAX_LINES && itemCount <= CART_MAX_ITEMS, cartOpen, cartReturnFocusId, cartPulseToken, setCartOpen, openCart, addItem, updateQuantity, removeLine, replaceLine, clearPurchasedSnapshot, clear }), [lines, itemCount, hydrated, storageAvailable, catalogue, issues, cartOpen, cartReturnFocusId, cartPulseToken, openCart, addItem, updateQuantity, removeLine, replaceLine, clearPurchasedSnapshot, clear]);

  return <CartContext.Provider value={value}>{children}{!noticeDismissed && (damagedStorage || !storageAvailable || catalogueDegraded) && <aside className="cart-storage-notice" role="status"><strong>{damagedStorage ? "Your saved cart needed repair." : !storageAvailable ? "Your cart is temporary in this browser tab." : "The menu may be temporarily out of date."}</strong><span>{damagedStorage ? "Invalid saved lines were removed. You can clear the repaired cart and start again." : !storageAvailable ? "Browser storage is unavailable, so the cart may disappear after refresh." : "The restaurant data service is unavailable. Browsing uses a saved catalogue and checkout is paused."}</span><div>{damagedStorage && <button type="button" onClick={clear}>Clear repaired cart</button>}<button type="button" onClick={() => setNoticeDismissed(true)}>Dismiss</button></div></aside>}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
