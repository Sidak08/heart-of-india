import { describe, expect, it } from "vitest";
import { calculateUnitPrice, selectionKey, validateSelections } from "@/lib/cart";
import { menuItems } from "@/lib/menu";

describe("cart rules", () => {
  const saag = menuItems.find((item) => item.id === "curries-saag-chicken-goat-lamb")!;
  it("rejects missing or incompatible required options", () => { expect(validateSelections(saag, {})).toBe(false); expect(validateSelections(saag, { protein: "paneer" })).toBe(false); expect(validateSelections(saag, { protein: "goat" })).toBe(true); });
  it("uses item and canonical options as the merge identity", () => { expect(selectionKey(saag.id, { protein: "goat" })).toBe(selectionKey(saag.id, { protein: "goat" })); expect(selectionKey(saag.id, { protein: "goat" })).not.toBe(selectionKey(saag.id, { protein: "lamb" })); });
  it("computes integer unit prices", () => { expect(calculateUnitPrice(saag, { protein: "chicken" })).toBe(1499); });
});
