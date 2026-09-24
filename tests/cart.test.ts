import { describe, expect, it } from "vitest";
import { calculateUnitPrice, mergeCartStates, parseCartStorage, selectionKey, validateSelections } from "@/lib/cart";
import { menuItems } from "@/lib/menu";

describe("cart rules", () => {
  const saag = menuItems.find((item) => item.id === "curries-saag-chicken-goat-lamb")!;
  it("rejects missing or incompatible required options", () => { expect(validateSelections(saag, {})).toBe(false); expect(validateSelections(saag, { protein: "paneer" })).toBe(false); expect(validateSelections(saag, { protein: "goat" })).toBe(true); });
  it("uses item and canonical options as the merge identity", () => { expect(selectionKey(saag.id, { protein: "goat" })).toBe(selectionKey(saag.id, { protein: "goat" })); expect(selectionKey(saag.id, { protein: "goat" })).not.toBe(selectionKey(saag.id, { protein: "lamb" })); });
  it("computes integer unit prices", () => { expect(calculateUnitPrice(saag, { protein: "chicken" })).toBe(1499); });
  it("repairs corrupt persisted lines instead of throwing", () => { const stored = JSON.stringify({ version: 1, lines: [{ lineId: crypto.randomUUID(), itemId: saag.id, quantity: 1, selections: null, displayName: saag.name, unitPriceCents: 1499 }] }); const result = parseCartStorage(stored, menuItems); expect(result.damaged).toBe(true); expect(result.state.lines).toEqual([]); });
  it("merges concurrent tab additions and honours removals", () => { const one = { lineId: crypto.randomUUID(), itemId: saag.id, quantity: 1, selections: { protein: "goat" }, displayName: saag.name, unitPriceCents: 1499, updatedAt: 10 }; const two = { ...one, lineId: crypto.randomUUID(), updatedAt: 11 }; const merged = mergeCartStates({ version: 2, revision: 1, writerId: "a", lines: [one], tombstones: {} }, { version: 2, revision: 1, writerId: "b", lines: [two], tombstones: {} }); expect(merged.lines).toHaveLength(1); expect(merged.lines[0].quantity).toBe(2); const removed = mergeCartStates(merged, { version: 2, revision: 3, writerId: "b", lines: [], tombstones: { [merged.lines[0].lineId]: 20 } }); expect(removed.lines).toEqual([]); });
});
