import { describe, expect, it, vi } from "vitest";
import { createQuote, quoteRequestSchema, verifyAcceptedQuoteToken } from "@/lib/server/quote";

describe("server quote", () => {
  it("resolves trusted names, prices, and 13% HST", async () => {
    const quote = await createQuote({ lines: [{ lineId: "11111111-1111-4111-8111-111111111111", itemId: "curries-butter-chicken", quantity: 2, selections: {} }] });
    expect(quote.lines[0]).toMatchObject({ name: "Butter Chicken", unitPriceCents: 1599, lineTotalCents: 3198 });
    expect(quote).toMatchObject({ subtotalCents: 3198, taxCents: 416, totalCents: 3614, orderable: true });
  });
  it("retains required options", async () => {
    const quote = await createQuote({ lines: [{ lineId: "11111111-1111-4111-8111-111111111112", itemId: "curries-saag-chicken-goat-lamb", quantity: 1, selections: { protein: "goat" } }] });
    expect(quote.lines[0].selections[0]).toMatchObject({ groupId: "protein", optionId: "goat", optionName: "Goat" });
  });
  it("accepts an unchanged signed quote and expires it after ten minutes", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-09-23T16:00:00.000Z"));
      const quote = await createQuote({ lines: [{ lineId: "11111111-1111-4111-8111-111111111113", itemId: "drinks-desserts-water", quantity: 1, selections: {} }] });
      expect(verifyAcceptedQuoteToken(quote.quoteToken, quote)).toBe(true);
      vi.advanceTimersByTime(10 * 60_000 + 1);
      expect(verifyAcceptedQuoteToken(quote.quoteToken, quote)).toBe(false);
    } finally { vi.useRealTimers(); }
  });
  it("rejects unknown items and bad option choices", async () => {
    await expect(createQuote({ lines: [{ lineId: "11111111-1111-4111-8111-111111111111", itemId: "made-up", quantity: 1, selections: {} }] })).rejects.toThrow(/no longer exist/i);
    await expect(createQuote({ lines: [{ lineId: "11111111-1111-4111-8111-111111111111", itemId: "curries-saag-chicken-goat-lamb", quantity: 1, selections: { protein: "tofu" } }] })).rejects.toThrow(/invalid choose protein/i);
  });
  it("rejects excessive quantities and request sizes", () => {
    expect(quoteRequestSchema.safeParse({ lines: [{ lineId: "11111111-1111-4111-8111-111111111111", itemId: "curries-butter-chicken", quantity: 21, selections: {} }] }).success).toBe(false);
    const lines = Array.from({ length: 3 }, (_, index) => ({ lineId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, itemId: "curries-butter-chicken", quantity: 20, selections: {} }));
    expect(quoteRequestSchema.safeParse({ lines }).success).toBe(false);
  });
});
