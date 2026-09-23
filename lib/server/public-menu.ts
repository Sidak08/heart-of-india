import "server-only";

import { categories, type MenuCategory, type MenuItem } from "@/lib/menu";
import { getFallbackMenu, readMenu } from "@/lib/server/sheets";

export type PublicCatalogue = { categories: MenuCategory[]; items: MenuItem[] };

export async function getPublicCatalogue(): Promise<PublicCatalogue> {
  try { return { categories, items: await readMenu() }; }
  catch { return { categories, items: getFallbackMenu() }; }
}
