import type { MenuItem } from "@/lib/menu";

export type CartSelections = Record<string, string>;
export type CartLine = {
  lineId: string;
  itemId: string;
  quantity: number;
  selections: CartSelections;
  displayName: string;
  unitPriceCents: number;
};
export type CartState = { version: 1; lines: CartLine[] };

export const EMPTY_CART: CartState = { version: 1, lines: [] };

export function selectionKey(itemId: string, selections: CartSelections) {
  return `${itemId}|${Object.entries(selections).sort(([a], [b]) => a.localeCompare(b)).map(([group, option]) => `${group}:${option}`).join("|")}`;
}

export function calculateUnitPrice(item: MenuItem, selections: CartSelections) {
  return item.priceCents + item.optionGroups.reduce((total, group) => {
    const selected = group.options.find((option) => option.id === selections[group.id]);
    return total + (selected?.priceDeltaCents ?? 0);
  }, 0);
}

export function validateSelections(item: MenuItem, selections: CartSelections) {
  return item.optionGroups.every((group) => {
    const selected = selections[group.id];
    return (!group.required && !selected) || Boolean(group.options.some((option) => option.id === selected));
  });
}

export function selectedOptionNames(item: MenuItem | undefined, selections: CartSelections) {
  if (!item) return [];
  return item.optionGroups.flatMap((group) => {
    const option = group.options.find((entry) => entry.id === selections[group.id]);
    return option ? [`${group.label}: ${option.name}`] : [];
  });
}

export function cartSubtotal(lines: CartLine[]) {
  return lines.reduce((total, line) => total + line.unitPriceCents * line.quantity, 0);
}
