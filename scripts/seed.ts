import { sql } from "drizzle-orm";
import menuSeed from "../heart-of-india-menu.json";
import restaurantConfig from "../data/restaurant-config.json";
import { closeDb, requireDb } from "../db";
import { menuCategories, menuItems, menuOptions, optionGroups, restaurantSettings } from "../db/schema";

async function main() {
const db = requireDb();
await db.transaction(async (tx) => {
  for (const [sortOrder, category] of menuSeed.categories.entries()) await tx.insert(menuCategories).values({ id: category.id, name: category.name, description: "description" in category ? category.description : null, printedInclusions: "printedInclusions" in category ? category.printedInclusions : null, reviewNote: "reviewNote" in category ? category.reviewNote : null, sortOrder }).onConflictDoUpdate({ target: menuCategories.id, set: { name: category.name, description: "description" in category ? category.description : null, printedInclusions: "printedInclusions" in category ? category.printedInclusions : null, reviewNote: "reviewNote" in category ? category.reviewNote : null, sortOrder, updatedAt: sql`now()` } });
  for (const [sortOrder, source] of menuSeed.items.entries()) {
    const item = { ...menuSeed.defaults, ...source };
    await tx.insert(menuItems).values({ id: item.id, categoryId: item.categoryId, name: item.name, description: item.description, image: item.image, priceCents: item.priceCents, availability: item.availability as "requires_owner_confirmation" | "available" | "unavailable", includedItems: "includedItems" in item ? item.includedItems : null, dietaryTags: item.dietaryTags, allergens: item.allergens, sortOrder }).onConflictDoUpdate({ target: menuItems.id, set: { categoryId: item.categoryId, name: item.name, description: item.description, image: item.image, priceCents: item.priceCents, includedItems: "includedItems" in item ? item.includedItems : null, dietaryTags: item.dietaryTags, allergens: item.allergens, sortOrder, updatedAt: new Date() } });
    await tx.delete(menuOptions).where(sql`${menuOptions.itemId} = ${item.id}`);
    await tx.delete(optionGroups).where(sql`${optionGroups.itemId} = ${item.id}`);
    for (const [groupOrder, group] of item.optionGroups.entries()) {
      await tx.insert(optionGroups).values({ id: group.id, itemId: item.id, label: group.label, required: group.required, minSelections: group.minSelections, maxSelections: group.maxSelections, sortOrder: groupOrder });
      await tx.insert(menuOptions).values(group.options.map((option, optionOrder) => ({ ...option, itemId: item.id, groupId: group.id, sortOrder: optionOrder })));
    }
  }
  await tx.insert(restaurantSettings).values({ ...restaurantConfig, dateOverrides: restaurantConfig.dateOverrides, feeRule: null }).onConflictDoUpdate({ target: restaurantSettings.id, set: { name: restaurantConfig.name, tagline: restaurantConfig.tagline, phone: restaurantConfig.phone, address: restaurantConfig.address, currency: restaurantConfig.currency, timezone: restaurantConfig.timezone, catalogRevision: restaurantConfig.catalogRevision, updatedAt: new Date() } });
});
console.log(`Seeded ${menuSeed.categories.length} categories and ${menuSeed.items.length} menu items.`);
await closeDb();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
