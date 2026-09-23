"use client";
import { useEffect } from "react";
import { useCart } from "@/components/cart-provider";
import type { MenuItem } from "@/lib/menu";

type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; execute: (input: Record<string, unknown>) => unknown };
declare global { interface Navigator { modelContext?: { registerTool: (tool: Tool) => void; unregisterTool?: (name: string) => void } } }

export function WebMcpTools() {
  const cart = useCart();
  useEffect(() => {
    const context = navigator.modelContext; if (!context) return;
    const getMenu = async () => {
      const response = await fetch("/api/menu", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("The menu is temporarily unavailable.");
      return (await response.json()) as { items: MenuItem[] };
    };
    const tools: Tool[] = [
      { name: "search_menu", description: "Search the public Heart of India menu by dish name.", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, execute: async ({ query }) => { const { items } = await getMenu(); return items.filter((item) => item.name.toLowerCase().includes(String(query).toLowerCase())).slice(0, 20).map(({ id, name, priceCents, categoryId, availability }) => ({ id, name, priceCents, currency: "CAD", categoryId, availability })); } },
      { name: "read_menu_item", description: "Read one Heart of India menu item and its required choices.", inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"] }, execute: async ({ itemId }) => { const { items } = await getMenu(); return items.find((item) => item.id === itemId) ?? { error: "Menu item not found" }; } },
      { name: "add_menu_item_to_cart", description: "Add a valid menu item and its selected options to the local pickup cart. This does not place an order.", inputSchema: { type: "object", properties: { itemId: { type: "string" }, quantity: { type: "integer", minimum: 1, maximum: 20 }, selections: { type: "object", additionalProperties: { type: "string" } } }, required: ["itemId"] }, execute: async ({ itemId, quantity, selections }) => { const { items } = await getMenu(); const item = items.find((entry) => entry.id === itemId); if (!item) return { ok: false, error: "Menu item not found" }; if (item.availability === "unavailable") return { ok: false, error: "Menu item is unavailable" }; const result = cart.addItem(item, (selections ?? {}) as Record<string, string>, Number(quantity ?? 1)); return result.ok ? { ok: true, itemCount: cart.itemCount + Number(quantity ?? 1) } : { ok: false, error: "Required choices are missing or invalid" }; } },
    ];
    tools.forEach((tool) => context.registerTool(tool));
    return () => tools.forEach((tool) => context.unregisterTool?.(tool.name));
  }, [cart]);
  return null;
}
