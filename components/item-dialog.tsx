"use client";
import * as Dialog from "@radix-ui/react-dialog";
import * as RadioGroup from "@radix-ui/react-radio-group";
import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { QuantityControl } from "@/components/quantity-control";
import type { CartSelections } from "@/lib/cart";
import { calculateUnitPrice, validateSelections } from "@/lib/cart";
import { formatCad, isOrderableItem, type MenuItem } from "@/lib/menu";

type Props = { item: MenuItem | null; open: boolean; onOpenChange: (open: boolean) => void; editingLineId?: string; initialSelections?: CartSelections; initialQuantity?: number; onAdded?: (name: string) => void; returnFocusId?: string };

export function ItemDialog({ item, open, onOpenChange, editingLineId, initialSelections, initialQuantity = 1, onAdded, returnFocusId }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>{item ? <ItemDialogPanel key={`${item.id}:${editingLineId ?? "new"}`} item={item} onOpenChange={onOpenChange} editingLineId={editingLineId} initialSelections={initialSelections} initialQuantity={initialQuantity} onAdded={onAdded} returnFocusId={returnFocusId} /> : null}</Dialog.Root>;
}

function ItemDialogPanel({ item, onOpenChange, editingLineId, initialSelections, initialQuantity, onAdded, returnFocusId }: Omit<Props, "item" | "open" | "initialQuantity"> & { item: MenuItem; initialQuantity: number }) {
  const cart = useCart(); const [selections, setSelections] = useState<CartSelections>(initialSelections ?? {}); const [quantity, setQuantity] = useState(initialQuantity); const [submitted, setSubmitted] = useState(false); const [cartError, setCartError] = useState("");
  const orderable = isOrderableItem(item); const valid = validateSelections(item, selections); const unitPrice = useMemo(() => calculateUnitPrice(item, selections), [item, selections]);
  const existingQuantity = editingLineId ? cart.lines.find((line) => line.lineId === editingLineId)?.quantity ?? 0 : 0;
  const maximum = Math.max(1, Math.min(20, 50 - cart.itemCount + existingQuantity));
  const submit = () => { setSubmitted(true); setCartError(""); if (!valid || !orderable) return; const result = editingLineId ? cart.replaceLine(editingLineId, item, selections, quantity) : cart.addItem(item, selections, quantity); if (!result.ok) { setCartError(result.error ?? "This item could not be added."); return; } onAdded?.(item.name); onOpenChange(false); };
  return <Dialog.Portal><Dialog.Overlay className="overlay" /><Dialog.Content className="item-dialog" aria-describedby={item.description ? "item-description" : undefined} onCloseAutoFocus={(event) => { if (!returnFocusId) return; event.preventDefault(); requestAnimationFrame(() => document.getElementById(returnFocusId)?.focus({ preventScroll: true })); }}>
    <div className="item-dialog-head"><div><span className="eyebrow">{editingLineId ? "Edit selection" : "Add to your order"}</span><Dialog.Title>{item.name}</Dialog.Title></div><Dialog.Close className="icon-button" aria-label="Close item details"><X size={24} /></Dialog.Close></div>
    <div className="item-dialog-scroll">{item.description && <p id="item-description">{item.description}</p>}{item.includedItems?.length ? <p className="card-copy">Includes {item.includedItems.join(" and ")}.</p> : null}<p className="item-base-price">{formatCad(item.priceCents)}</p>
      {!orderable && <div className="preview-block" role="status"><strong>This item cannot be ordered online right now.</strong><span>{item.availability === "unavailable" ? "The restaurant has marked it unavailable." : "The restaurant still needs to confirm this menu item."}</span></div>}
      {item.optionGroups.map((group) => { const errorId = `${item.id}-${group.id}-error`; const missing = submitted && group.required && !selections[group.id]; return <fieldset className="option-group" key={group.id}><legend>{group.label}{group.required && <span className="required-label">Required</span>}</legend><RadioGroup.Root className="radio-list" value={selections[group.id] ?? ""} onValueChange={(value) => setSelections((current) => ({ ...current, [group.id]: value }))} aria-required={group.required} aria-invalid={missing} aria-describedby={missing ? errorId : undefined}>{group.options.map((option) => <label className="radio-row" key={option.id}><RadioGroup.Item className="radio-indicator" value={option.id}><RadioGroup.Indicator><span /></RadioGroup.Indicator></RadioGroup.Item><span>{option.name}{option.priceDeltaCents ? ` (+${formatCad(option.priceDeltaCents)})` : ""}</span></label>)}</RadioGroup.Root>{missing && <p id={errorId} className="option-error" role="alert">Choose one option before adding this item.</p>}</fieldset>; })}
      <div className="item-quantity"><span>Quantity</span><QuantityControl value={quantity} maximum={maximum} onChange={setQuantity} /></div>{cartError && <p className="option-error" role="alert">{cartError}</p>}
    </div>
    <div className="item-dialog-footer"><button className="button-primary full" type="button" onClick={submit} disabled={!orderable}>{orderable ? `${editingLineId ? "Update cart" : "Add to Cart"} · ${formatCad(unitPrice * quantity)}` : "Unavailable for online ordering"}</button></div>
  </Dialog.Content></Dialog.Portal>;
}
