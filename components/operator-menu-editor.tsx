"use client";

import { Check, RotateCcw, Save, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { MenuCategory, MenuItem } from "@/lib/menu";
import { formatCad } from "@/lib/menu";

const availabilityOptions = [
  { value: "available", label: "Available" },
  { value: "unavailable", label: "Unavailable" },
  { value: "requires_owner_confirmation", label: "Needs owner confirmation" },
] as const;

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function parsePrice(value: string) {
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents <= 100_000 ? cents : null;
}

function MenuItemEditor({ item: initial, categories, onSaved }: { item: MenuItem; categories: MenuCategory[]; onSaved: (item: MenuItem) => void }) {
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [price, setPrice] = useState(dollars(initial.priceCents));
  const [availability, setAvailability] = useState<NonNullable<MenuItem["availability"]>>(initial.availability ?? "requires_owner_confirmation");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const priceCents = parsePrice(price);
  const dirty = name.trim() !== saved.name || categoryId !== saved.categoryId || priceCents !== saved.priceCents || availability !== saved.availability;

  function reset() {
    setName(saved.name);
    setCategoryId(saved.categoryId);
    setPrice(dollars(saved.priceCents));
    setAvailability(saved.availability ?? "requires_owner_confirmation");
    setError("");
    setMessage("");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (name.trim().length < 2) { setError("Enter an item name with at least two characters."); return; }
    if (priceCents == null) { setError("Enter a valid CAD price with no more than two decimal places."); return; }
    setPending(true);
    try {
      const response = await fetch("/api/operator/menu", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: saved.id, name: name.trim(), categoryId, priceCents, availability }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The menu item could not be saved.");
      const item = data.item as MenuItem;
      setSaved(item);
      setName(item.name);
      setCategoryId(item.categoryId);
      setPrice(dollars(item.priceCents));
      setAvailability(item.availability ?? "requires_owner_confirmation");
      onSaved(item);
      setMessage(`${item.name} was updated.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The menu item could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return <form className={`menu-editor-row${dirty ? " dirty" : ""}`} onSubmit={submit}>
    <div className="menu-editor-identity">
      <span>{categories.find((category) => category.id === saved.categoryId)?.name}</span>
      <strong>{saved.name}</strong>
      <small>{saved.id}</small>
    </div>
    <div className="menu-editor-fields">
      <div className="field">
        <label htmlFor={`menu-name-${saved.id}`}>Item name</label>
        <input id={`menu-name-${saved.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
      </div>
      <div className="field">
        <label htmlFor={`menu-category-${saved.id}`}>Category</label>
        <select id={`menu-category-${saved.id}`} value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`menu-price-${saved.id}`}>Price (CAD)</label>
        <div className="price-input"><span aria-hidden="true">$</span><input id={`menu-price-${saved.id}`} value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" pattern="\d{1,4}(\.\d{1,2})?" aria-describedby={`menu-current-${saved.id}`} required /></div>
        <small id={`menu-current-${saved.id}`}>Currently {formatCad(saved.priceCents)}</small>
      </div>
      <div className="field">
        <label htmlFor={`menu-availability-${saved.id}`}>Ordering availability</label>
        <select id={`menu-availability-${saved.id}`} value={availability} onChange={(event) => setAvailability(event.target.value as NonNullable<MenuItem["availability"]>)}>
          {availabilityOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    <div className="menu-editor-actions">
      <button className="button-secondary" type="button" onClick={reset} disabled={!dirty || pending}><RotateCcw size={17} /> Reset</button>
      <button className="button-primary" type="submit" disabled={!dirty || pending}><Save size={17} /> {pending ? "Saving…" : "Save item"}</button>
    </div>
    {error && <p className="field-error menu-editor-message" role="alert">{error}</p>}
    {message && <p className="menu-editor-message success" role="status"><Check size={17} /> {message}</p>}
  </form>;
}

export function OperatorMenuEditor({ initialItems, categories }: { initialItems: MenuItem[]; categories: MenuCategory[] }) {
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return items.filter((item) => (categoryId === "all" || item.categoryId === categoryId) && (!search || item.name.toLowerCase().includes(search) || item.id.toLowerCase().includes(search)));
  }, [categoryId, items, query]);

  function updateItem(updated: MenuItem) {
    const previous = items.find((item) => item.id === updated.id);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    const search = query.trim().toLowerCase();
    if (previous && search && (previous.name.toLowerCase().includes(search) || previous.id.toLowerCase().includes(search)) && !updated.name.toLowerCase().includes(search) && !updated.id.toLowerCase().includes(search)) setQuery(updated.name);
    if (categoryId !== "all" && updated.categoryId !== categoryId) setCategoryId(updated.categoryId);
  }

  return <section className="operator-card menu-editor-section" id="menu-items" aria-labelledby="menu-editor-title">
    <div className="menu-editor-heading">
      <div>
        <span className="eyebrow">Customer catalogue</span>
        <h2 id="menu-editor-title">Menu items</h2>
        <p>Edit customer-facing names, categories, prices, and ordering availability. Item IDs and required choices stay fixed so existing carts remain valid.</p>
      </div>
      <strong>{items.length} items</strong>
    </div>
    <div className="menu-editor-tools">
      <div className="field menu-editor-search">
        <label htmlFor="operator-menu-search">Search menu items</label>
        <div><Search size={18} aria-hidden="true" /><input id="operator-menu-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by item name" /></div>
      </div>
      <div className="field">
        <label htmlFor="operator-menu-category">Filter by category</label>
        <select id="operator-menu-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="all">All categories</option>
          {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
        </select>
      </div>
    </div>
    <div className="menu-editor-results" aria-live="polite">Showing {filtered.length} of {items.length} items</div>
    {filtered.length ? <div className="menu-editor-list">{filtered.map((item) => <MenuItemEditor item={item} categories={categories} onSaved={updateItem} key={item.id} />)}</div> : <div className="empty-operator menu-editor-empty"><Search size={30} /><h3>No menu items found</h3><p>Try a different name or category.</p></div>}
  </section>;
}
