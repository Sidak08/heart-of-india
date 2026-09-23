import { describe, expect, it } from "vitest";
import { createOrder, getGuestOrder, setOrderStatus } from "@/lib/server/orders";

describe("pay-at-store orders", () => {
  it("creates an idempotent order and protects guest access", async () => {
    const attemptId = crypto.randomUUID(); const lineId = crypto.randomUUID();
    const input = { attemptId, customer: { name: "A Customer", email: "customer@example.com", phone: "905-555-0100", notes: "Door pickup" }, lines: [{ lineId, itemId: "curries-butter-chicken", quantity: 1, selections: {} }], acceptedCatalogRevision: 1, acceptedTotalCents: 1807 };
    const first = await createOrder(input); const second = await createOrder(input);
    expect(first.changed).toBe(false); expect(second.changed).toBe(false);
    if (first.changed || second.changed) throw new Error("Unexpected changed quote");
    expect(second.order.id).toBe(first.order.id); expect(second.existing).toBe(true);
    expect(await getGuestOrder(first.order.id, first.guestToken)).toMatchObject({ paymentStatus: "unpaid", fulfillmentStatus: "new", totalCents: 1807 });
    expect(await getGuestOrder(first.order.id, "wrong-token")).toBeNull();
  });
  it("uses updated-at conflict protection for operator changes", async () => {
    const result = await createOrder({ attemptId: crypto.randomUUID(), customer: { name: "Owner Test", email: "owner-test@example.com", phone: "905-555-0101", notes: "" }, lines: [{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }], acceptedCatalogRevision: 1, acceptedTotalCents: 113 });
    if (result.changed) throw new Error("Unexpected changed quote");
    const updated = await setOrderStatus(result.order.id, { fulfillmentStatus: "preparing", expectedUpdatedAt: result.order.updatedAt });
    expect(updated?.fulfillmentStatus).toBe("preparing");
    expect(await setOrderStatus(result.order.id, { fulfillmentStatus: "ready_for_pickup", expectedUpdatedAt: result.order.updatedAt })).toBeNull();
  });
  it("returns a current quote instead of accepting an altered total", async () => {
    const result = await createOrder({ attemptId: crypto.randomUUID(), customer: { name: "Price Test", email: "price-test@example.com", phone: "905-555-0102", notes: "" }, lines: [{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }], acceptedCatalogRevision: 1, acceptedTotalCents: 1 });
    expect(result.changed).toBe(true);
    if (!result.changed) throw new Error("Expected a changed quote");
    expect(result.quote.totalCents).toBe(113);
  });
  it("rejects a required option that is missing", async () => {
    await expect(createOrder({ attemptId: crypto.randomUUID(), customer: { name: "Option Test", email: "option-test@example.com", phone: "905-555-0103", notes: "" }, lines: [{ lineId: crypto.randomUUID(), itemId: "curries-saag-chicken-goat-lamb", quantity: 1, selections: {} }], acceptedCatalogRevision: 1, acceptedTotalCents: 1694 })).rejects.toThrow("Choose protein is required");
  });
});
