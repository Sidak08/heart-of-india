"use client";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { ItemDialog } from "@/components/item-dialog";
import { QuantityControl } from "@/components/quantity-control";
import { formatCad, isOrderableItem, type MenuCategory, type MenuItem } from "@/lib/menu";

export function MenuClient({ categories, menuItems }: { categories: MenuCategory[]; menuItems: MenuItem[] }) {
  const router = useRouter(); const pathname = usePathname(); const params = useSearchParams(); const cart = useCart();
  const initialCategory = params.get("category") ?? categories[0].id;
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [active, setActive] = useState(categories.some((entry) => entry.id === initialCategory) ? initialCategory : categories[0].id);
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [returnFocusId, setReturnFocusId] = useState<string>();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryScrollTarget = useRef<string | null>(null);
  const cancelCategoryScrollRelease = useRef<(() => void) | null>(null);
  const menuRoot = useRef<HTMLDivElement>(null);
  const initialCategoryHandled = useRef(false);

  useEffect(() => { menuRoot.current?.setAttribute("data-menu-ready", "true"); }, []);
  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); cancelCategoryScrollRelease.current?.(); }, []);
  useEffect(() => { if (!announcement) return; const timer = setTimeout(() => setAnnouncement(""), 2200); return () => clearTimeout(timer); }, [announcement]);
  useEffect(() => {
    if (query.trim()) return;
    const sections = categories.map((category) => document.getElementById(category.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => { if (categoryScrollTarget.current) return; const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (visible) setActive(visible.target.id); }, { rootMargin: "-25% 0px -65% 0px" });
    sections.forEach((section) => observer.observe(section)); return () => observer.disconnect();
  }, [categories, query]);
  const updateUrl = (nextQuery: string, category = active) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { const next = new URLSearchParams(); if (nextQuery.trim()) next.set("q", nextQuery.trim()); else next.set("category", category); router.replace(`${pathname}?${next.toString()}`, { scroll: false }); }, 180);
  };
  const chooseCategory = (id: string) => {
    cancelCategoryScrollRelease.current?.();
    categoryScrollTarget.current = id;
    setActive(id);
    setQuery("");
    updateUrl("", id);
    requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) { categoryScrollTarget.current = null; return; }
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const finish = () => {
        if (categoryScrollTarget.current !== id) return;
        cancelCategoryScrollRelease.current?.();
        cancelCategoryScrollRelease.current = null;
        categoryScrollTarget.current = null;
        setActive(id);
      };
      if (reducedMotion) {
        target.scrollIntoView({ behavior: "auto", block: "start" });
        requestAnimationFrame(finish);
        return;
      }
      const fallback = window.setTimeout(finish, 1200);
      cancelCategoryScrollRelease.current = () => window.clearTimeout(fallback);
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  useEffect(() => {
    if (initialCategoryHandled.current || query.trim() || initialCategory === categories[0].id) return;
    const frame = requestAnimationFrame(() => { if (initialCategoryHandled.current) return; initialCategoryHandled.current = true; chooseCategory(initialCategory); });
    return () => cancelAnimationFrame(frame);
  // The direct-link category is intentionally handled once after hydration.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const filtered = useMemo(() => { const needle = query.trim().toLocaleLowerCase("en-CA"); return needle ? menuItems.filter((item) => item.name.toLocaleLowerCase("en-CA").includes(needle)) : menuItems; }, [menuItems, query]);
  const groups = categories.map((category) => ({ category, items: filtered.filter((item) => item.categoryId === category.id) })).filter((group) => group.items.length);
  const openDetails = (item: MenuItem, triggerId: string) => { setReturnFocusId(triggerId); setSelected(item); setDialogOpen(true); };
  const markAdded = (item: MenuItem) => setAnnouncement(`${item.name} added to cart.`);
  const add = (item: MenuItem, triggerId: string) => { if (!isOrderableItem(item)) { setAnnouncement(`${item.name} is not available for online ordering.`); return; } if (item.optionGroups.some((group) => group.required)) { openDetails(item, triggerId); return; } const result = cart.addItem(item); if (result.ok) markAdded(item); else if (result.error) setAnnouncement(result.error); };
  const updateItemQuantity = (item: MenuItem, lineIds: string[], currentQuantity: number, nextQuantity: number) => {
    const target = [...cart.lines].reverse().find((line) => line.itemId === item.id && lineIds.includes(line.lineId));
    if (!target) return;
    const result = cart.updateQuantity(target.lineId, target.quantity + (nextQuantity - currentQuantity));
    if (!result.ok && result.error) { setAnnouncement(result.error); return; }
    if (nextQuantity === 0) setAnnouncement(`${item.name} removed from cart.`);
  };

  return <><div ref={menuRoot} className="container menu-layout" data-menu-ready="false"><aside className="category-sidebar" aria-label="Menu categories">{categories.map((category) => <a href={`#${category.id}`} className={active === category.id && !query ? "active" : ""} key={category.id} onClick={(event) => { event.preventDefault(); chooseCategory(category.id); }}>{category.name}</a>)}</aside><div className="menu-main">
    <div className="search-wrap"><label htmlFor="menu-search">Search the menu</label><Search size={21} aria-hidden="true" /><input id="menu-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); updateUrl(event.target.value); }} placeholder="Try “Butter Chicken”" />{query && <button className="clear-search" type="button" aria-label="Clear search" onClick={() => { setQuery(""); updateUrl(""); }}><X size={20} /></button>}</div>
    <nav className="category-chips" aria-label="Menu categories">{categories.map((category) => <a href={`#${category.id}`} className={active === category.id && !query ? "active" : ""} key={category.id} onClick={(event) => { event.preventDefault(); chooseCategory(category.id); }}>{category.name}</a>)}</nav>
    {query && <p className="eyebrow" aria-live="polite">Searching all categories · {filtered.length} {filtered.length === 1 ? "result" : "results"}</p>}
    {groups.length ? groups.map(({ category, items }) => <section className="menu-section" id={category.id} key={category.id}><div className="menu-section-head"><div><h2>{category.name}</h2>{category.description && <p className="menu-section-description">{category.description}</p>}</div><span className="menu-count">{items.length} {items.length === 1 ? "item" : "items"}</span></div><div className="menu-grid">{items.map((item) => { const itemLines = cart.lines.filter((line) => line.itemId === item.id); const itemQuantity = itemLines.reduce((total, line) => total + line.quantity, 0); const orderable = isOrderableItem(item); return <article className={`menu-card ${item.categoryId === "special-combos" ? "special" : ""}`} key={item.id}><button id={`details-${item.id}`} className="card-detail" type="button" aria-label={`View details for ${item.name}`} onClick={() => openDetails(item, `details-${item.id}`)}><h3>{item.name}</h3></button>{item.includedItems?.length ? <p className="card-copy">Includes {item.includedItems.join(" and ")}.</p> : item.description ? <p className="card-copy">{item.description}</p> : null}<div className="card-bottom"><span className="card-price">{formatCad(item.priceCents)}</span>{!orderable ? <button className="add-button" type="button" disabled>{item.availability === "unavailable" ? "Unavailable" : "Needs confirmation"}</button> : itemQuantity > 0 ? <QuantityControl id={`quantity-${item.id}`} className="menu-card-quantity" value={itemQuantity} minimum={0} maximum={Math.min(20, itemQuantity + Math.max(0, 50 - cart.itemCount))} label={`${item.name} quantity`} onChange={(nextQuantity) => updateItemQuantity(item, itemLines.map((line) => line.lineId), itemQuantity, nextQuantity)} /> : <button id={`add-${item.id}`} className="add-button" type="button" aria-label={item.optionGroups.some((group) => group.required) ? `Choose options for ${item.name}` : `Add ${item.name}`} onClick={() => add(item, `add-${item.id}`)}>{item.optionGroups.some((group) => group.required) ? "Choose" : "Add"}</button>}</div></article>; })}</div></section>) : <div className="no-results"><div><h2>No dishes found</h2><p>Try another dish name or clear the search.</p><button className="button-secondary" type="button" onClick={() => { setQuery(""); updateUrl(""); }}>Clear search</button></div></div>}
  </div></div><ItemDialog item={selected} open={dialogOpen} onOpenChange={setDialogOpen} onAdded={() => { if (selected) markAdded(selected); }} returnFocusId={returnFocusId} />{announcement && <div className="status-announcer" role="status">{announcement}</div>}</>;
}
