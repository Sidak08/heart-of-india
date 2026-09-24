import menuSeed from "@/heart-of-india-menu.json";

export type MenuOption = { id: string; name: string; priceDeltaCents: number };
export type MenuOptionGroup = { id: string; label: string; required: boolean; minSelections: number; maxSelections: number; options: MenuOption[] };
export type MenuItem = {
  id: string; categoryId: string; name: string; priceCents: number; description?: string | null;
  image?: string | null; dietaryTags?: string[] | null; allergens?: string[] | null;
  availability?: "available" | "unavailable" | "requires_owner_confirmation";
  updatedAt?: string | null;
  taxClass?: "standard" | "zero_rated";
  includedItems?: string[]; optionGroups: MenuOptionGroup[];
};
export type MenuCategory = { id: string; name: string; description?: string; printedInclusions?: string; reviewNote?: string };

export const categories = menuSeed.categories as MenuCategory[];
export const menuItems = menuSeed.items.map((item) => ({
  description: menuSeed.defaults.description,
  image: menuSeed.defaults.image,
  dietaryTags: menuSeed.defaults.dietaryTags,
  allergens: menuSeed.defaults.allergens,
  availability: menuSeed.defaults.availability,
  ...item,
})) as MenuItem[];
export const restaurant = menuSeed.restaurant;

export function formatCad(cents: number) {
  return `CA$${new Intl.NumberFormat("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100)}`;
}

export function isOrderableItem(item: MenuItem | null | undefined) {
  return item?.availability === "available";
}
