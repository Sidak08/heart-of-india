import "server-only";

import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { menuCategories, menuItems, menuOptions, optionGroups } from "@/db/schema";
import { categories as seedCategories, menuItems as seedItems, type MenuCategory, type MenuItem } from "@/lib/menu";

export type PublicCatalogue = { categories: MenuCategory[]; items: MenuItem[] };

const fallback: PublicCatalogue = { categories: seedCategories, items: seedItems };

export async function getPublicCatalogue(): Promise<PublicCatalogue> {
  const db = getDb();
  if (!db) return fallback;

  try {
    const [categoryRows, itemRows, groupRows, optionRows] = await Promise.all([
      db.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder)),
      db.select().from(menuItems).orderBy(asc(menuItems.sortOrder)),
      db.select().from(optionGroups).orderBy(asc(optionGroups.sortOrder)),
      db.select().from(menuOptions).orderBy(asc(menuOptions.sortOrder)),
    ]);

    if (!categoryRows.length || !itemRows.length) return fallback;

    return {
      categories: categoryRows.map(({ id, name, description, printedInclusions, reviewNote }) => ({
        id,
        name,
        description: description ?? undefined,
        printedInclusions: printedInclusions ?? undefined,
        reviewNote: reviewNote ?? undefined,
      })),
      items: itemRows.map((item) => ({
        id: item.id,
        categoryId: item.categoryId,
        name: item.name,
        priceCents: item.priceCents,
        description: item.description,
        image: item.image,
        dietaryTags: item.dietaryTags,
        allergens: item.allergens,
        availability: item.availability,
        includedItems: item.includedItems ?? undefined,
        optionGroups: groupRows.filter((group) => group.itemId === item.id).map((group) => ({
          id: group.id,
          label: group.label,
          required: group.required,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          options: optionRows.filter((option) => option.itemId === item.id && option.groupId === group.id).map((option) => ({
            id: option.id,
            name: option.name,
            priceDeltaCents: option.priceDeltaCents,
          })),
        })),
      })),
    };
  } catch {
    return fallback;
  }
}
