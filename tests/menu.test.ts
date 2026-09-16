import { describe, expect, it } from "vitest";
import seed from "@/heart-of-india-menu.json";
import { categories, formatCad, menuItems } from "@/lib/menu";

describe("trusted menu seed", () => {
  it("contains every expected item exactly once in one of eight categories", () => {
    expect(categories).toHaveLength(8); expect(menuItems).toHaveLength(80);
    expect(new Set(menuItems.map((item) => item.id)).size).toBe(80);
    const categoryIds = new Set(categories.map((category) => category.id));
    expect(menuItems.every((item) => categoryIds.has(item.categoryId))).toBe(true);
    expect(Object.fromEntries(categories.map((category) => [category.id, menuItems.filter((item) => item.categoryId === category.id).length]))).toEqual({ thali: 5, biriyani: 4, appetizers: 14, tandoori: 4, curries: 37, "side-orders": 6, "drinks-desserts": 7, "special-combos": 3 });
  });
  it("preserves cents and formats CAD with two decimals", () => { expect(formatCad(1499)).toBe("CA$14.99"); expect(formatCad(100)).toBe("CA$1.00"); expect(menuItems.every((item) => Number.isInteger(item.priceCents))).toBe(true); });
  it("has only the three supplied required-choice products", () => { expect(menuItems.filter((item) => item.optionGroups.some((group) => group.required)).map((item) => item.id)).toEqual(["curries-saag-chicken-goat-lamb", "special-combos-non-veg-curry-combo", "special-combos-veg-curry-combo"]); });
  it("retains unresolved review metadata outside public items", () => { expect(seed.unresolved).toHaveLength(4); expect(menuItems.every((item) => !("reviewNote" in item))).toBe(true); });
});
