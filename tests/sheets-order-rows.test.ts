import { describe, expect, it } from "vitest";
import type { StoredOrder } from "@/lib/operations";
import { inspectOrderRows, orderToRow } from "@/lib/server/sheets";

function storedOrder(overrides: Partial<StoredOrder> = {}): StoredOrder {
  const createdAt = "2026-09-23T12:00:00.000Z";
  const lineId = "11111111-1111-4111-8111-111111111111";
  return {
    schemaVersion: 1,
    id: "22222222-2222-4222-8222-222222222222",
    orderNumber: "HOI-260923-ABC123",
    attemptId: "33333333-3333-4333-8333-333333333333",
    guestTokenHash: "a".repeat(64),
    guestAccessExpiresAt: "2026-10-23T12:00:00.000Z",
    fulfillmentStatus: "new",
    paymentStatus: "unpaid",
    paymentMethod: "pay_at_store",
    customerName: "Test Customer",
    customerEmail: "customer@example.com",
    customerPhone: "905-555-0100",
    customerNotes: null,
    currency: "CAD",
    subtotalCents: 100,
    taxCents: 13,
    feeCents: 0,
    totalCents: 113,
    taxBreakdown: [{ label: "HST (13%)", amountCents: 13, inclusive: false }],
    pickupAddress: { street: "89 Clarence St.", city: "Brampton", province: "ON", postalCode: "L6W 1S5", country: "CA" },
    pickupEstimateText: "25–35 minutes after the order is placed",
    catalogRevision: 1,
    cartSnapshot: [{ lineId, itemId: "drinks-desserts-water", quantity: 1 }],
    lines: [{ lineId, itemId: "drinks-desserts-water", name: "Water", quantity: 1, selections: [], unitPriceCents: 100, lineTotalCents: 100 }],
    createdAt,
    updatedAt: createdAt,
    paidAt: null,
    ...overrides,
  };
}

describe("Google Sheets order row diagnostics", () => {
  it("surfaces an invalid status instead of silently hiding the row", () => {
    const row = orderToRow(storedOrder()); row[6] = "cooking-ish";
    const result = inspectOrderRows([row]);
    expect(result.orders).toHaveLength(0);
    expect(result.issues).toEqual([expect.objectContaining({ rowNumber: 2, orderNumber: "HOI-260923-ABC123" })]);
    expect(result.issues[0].reasons.join(" ")).toMatch(/fulfillmentStatus/i);
  });

  it("surfaces malformed line JSON", () => {
    const row = orderToRow(storedOrder()); row[24] = "{not-json";
    const result = inspectOrderRows([row]);
    expect(result.orders).toHaveLength(0);
    expect(result.issues[0].reasons.join(" ")).toMatch(/lines/i);
  });

  it("chooses one deterministic winner for concurrent status versions", () => {
    const root = storedOrder();
    const first = { ...root, fulfillmentStatus: "preparing" as const, updatedAt: "2026-09-23T12:01:00.000Z" };
    const second = { ...root, fulfillmentStatus: "cancelled" as const, updatedAt: "2026-09-23T12:01:01.000Z" };
    const result = inspectOrderRows([
      orderToRow(root, { previousUpdatedAt: null, mutationId: "44444444-4444-4444-8444-444444444444" }),
      orderToRow(first, { previousUpdatedAt: root.updatedAt, mutationId: "55555555-5555-4555-8555-555555555555" }),
      orderToRow(second, { previousUpdatedAt: root.updatedAt, mutationId: "66666666-6666-4666-8666-666666666666" }),
    ]);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].fulfillmentStatus).toBe("preparing");
    expect(result.conflictCount).toBe(1);
    expect(result.issues).toHaveLength(0);
  });
});
