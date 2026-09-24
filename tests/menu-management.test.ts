import { describe, expect, it } from "vitest";
import { readMenu, readSettings, StaleMenuUpdateError, updateMenuItem } from "@/lib/server/sheets";

describe("operator menu management", () => {
  it("updates trusted menu fields and advances the catalogue revision", async () => {
    const beforeMenu = await readMenu();
    const original = beforeMenu.find((item) => item.id === "appetizers-montreal-spl-poutine");
    expect(original).toBeDefined();
    const beforeSettings = await readSettings();

    const updated = await updateMenuItem({
      id: original!.id,
      name: "Montreal Special Poutine",
      categoryId: "tandoori",
      priceCents: 949,
      availability: "unavailable",
      taxClass: "standard",
      expectedUpdatedAt: original!.updatedAt ?? null,
    });

    expect(updated).toMatchObject({ name: "Montreal Special Poutine", categoryId: "tandoori", priceCents: 949, availability: "unavailable" });
    expect(updated.optionGroups).toEqual(original!.optionGroups);
    expect((await readMenu()).find((item) => item.id === original!.id)).toMatchObject(updated);
    expect((await readSettings()).catalogRevision).toBe(beforeSettings.catalogRevision + 1);

    await expect(updateMenuItem({ id: original!.id, name: "Stale overwrite", categoryId: original!.categoryId, priceCents: 100, availability: "available", taxClass: "standard", expectedUpdatedAt: original!.updatedAt ?? null })).rejects.toBeInstanceOf(StaleMenuUpdateError);

    await updateMenuItem({
      id: original!.id,
      name: original!.name,
      categoryId: original!.categoryId,
      priceCents: original!.priceCents,
      availability: original!.availability ?? "requires_owner_confirmation",
      taxClass: original!.taxClass ?? "standard",
      expectedUpdatedAt: updated.updatedAt ?? null,
    });
  });
});
