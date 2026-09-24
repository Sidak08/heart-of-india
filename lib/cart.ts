import type { MenuItem } from "@/lib/menu";
import { z } from "zod";

export const CART_MAX_LINES = 30;
export const CART_MAX_ITEMS = 50;

export type CartSelections = Record<string, string>;
export type CartLine = {
  lineId: string;
  itemId: string;
  quantity: number;
  selections: CartSelections;
  displayName: string;
  unitPriceCents: number;
  updatedAt: number;
};
export type CartState = { version: 2; revision: number; writerId: string; lines: CartLine[]; tombstones: Record<string, number> };

export const EMPTY_CART: CartState = { version: 2, revision: 0, writerId: "", lines: [], tombstones: {} };

const selectionsSchema = z.record(z.string().min(1).max(80), z.string().min(1).max(80));
const storedLineSchema = z.object({
  lineId: z.string().uuid(), itemId: z.string().min(1).max(100), quantity: z.number().int().min(1).max(20), selections: selectionsSchema,
  displayName: z.string().min(1).max(160), unitPriceCents: z.number().int().min(0).max(100_000), updatedAt: z.number().int().nonnegative().optional(),
}).strict();
const v1Schema = z.object({ version: z.literal(1), lines: z.array(z.unknown()) }).passthrough();
const v2Schema = z.object({ version: z.literal(2), revision: z.number().int().nonnegative(), writerId: z.string(), lines: z.array(z.unknown()), tombstones: z.record(z.string(), z.number().int().nonnegative()) }).strict();

export function parseCartStorage(value: string | null, catalogue: MenuItem[], now = Date.now()): { state: CartState; damaged: boolean } {
  if (!value) return { state: EMPTY_CART, damaged: false };
  try {
    const raw = JSON.parse(value) as unknown;
    const v2 = v2Schema.safeParse(raw); const v1 = v1Schema.safeParse(raw);
    if (!v2.success && !v1.success) return { state: EMPTY_CART, damaged: true };
    const source = v2.success ? v2.data.lines : v1.success ? v1.data.lines : [];
    const known = new Map(catalogue.map((item) => [item.id, item]));
    const lines = source.flatMap((candidate) => {
      const parsed = storedLineSchema.safeParse(candidate); if (!parsed.success) return [];
      const item = known.get(parsed.data.itemId); if (!item || !validateSelections(item, parsed.data.selections)) return [];
      return [{ ...parsed.data, displayName: item.name, unitPriceCents: calculateUnitPrice(item, parsed.data.selections), updatedAt: parsed.data.updatedAt ?? now }];
    });
    const total = lines.reduce((sum, line) => sum + line.quantity, 0);
    const bounded = lines.slice(0, CART_MAX_LINES); let running = 0;
    const limited = bounded.flatMap((line) => { const quantity = Math.min(line.quantity, CART_MAX_ITEMS - running); running += quantity; return quantity > 0 ? [{ ...line, quantity }] : []; });
    return { state: { version: 2, revision: v2.success ? v2.data.revision : now, writerId: v2.success ? v2.data.writerId : "migration", lines: limited, tombstones: v2.success ? v2.data.tombstones : {} }, damaged: lines.length !== source.length || limited.length !== lines.length || total > CART_MAX_ITEMS };
  } catch { return { state: EMPTY_CART, damaged: true }; }
}

export function mergeCartStates(local: CartState, incoming: CartState): CartState {
  const tombstones = { ...local.tombstones };
  for (const [lineId, timestamp] of Object.entries(incoming.tombstones)) tombstones[lineId] = Math.max(tombstones[lineId] ?? 0, timestamp);
  const byId = new Map<string, CartLine>();
  for (const line of [...local.lines, ...incoming.lines]) { const prior = byId.get(line.lineId); if (!prior || line.updatedAt > prior.updatedAt || (line.updatedAt === prior.updatedAt && JSON.stringify(line) > JSON.stringify(prior))) byId.set(line.lineId, line); }
  const active = [...byId.values()].filter((line) => line.updatedAt > (tombstones[line.lineId] ?? 0));
  const bySelection = new Map<string, CartLine>();
  for (const line of active.sort((a, b) => a.updatedAt - b.updatedAt)) {
    const key = selectionKey(line.itemId, line.selections); const prior = bySelection.get(key);
    if (!prior) bySelection.set(key, line);
    else {
      const keep = prior.updatedAt >= line.updatedAt ? prior : line; const remove = keep.lineId === prior.lineId ? line : prior;
      bySelection.set(key, { ...keep, quantity: Math.min(20, prior.quantity + line.quantity), updatedAt: Math.max(prior.updatedAt, line.updatedAt) });
      tombstones[remove.lineId] = Math.max(tombstones[remove.lineId] ?? 0, keep.updatedAt);
    }
  }
  let remaining = CART_MAX_ITEMS;
  const lines = [...bySelection.values()].sort((a, b) => a.updatedAt - b.updatedAt).slice(0, CART_MAX_LINES).flatMap((line) => { const quantity = Math.min(line.quantity, remaining); remaining -= quantity; return quantity > 0 ? [{ ...line, quantity }] : []; });
  return { version: 2, revision: Math.max(local.revision, incoming.revision, Date.now()), writerId: local.writerId, lines, tombstones };
}

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
