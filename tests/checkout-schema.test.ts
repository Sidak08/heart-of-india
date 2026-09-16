import { describe, expect, it } from "vitest";
import { checkoutRequestSchema } from "@/lib/server/checkout";

const line = {
  lineId: "11111111-1111-4111-8111-111111111111",
  itemId: "curries-butter-chicken",
  quantity: 1,
  selections: [],
  name: "Butter Chicken",
  unitPriceCents: 1599,
  lineTotalCents: 1599,
  taxProfileId: null,
  taxCents: 0,
};

const validRequest = {
  attemptId: "22222222-2222-4222-8222-222222222222",
  customer: { name: "Test Customer", email: "customer@example.com", phone: "905-555-0100", notes: "" },
  quote: {
    currency: "CAD",
    catalogRevision: 1,
    lines: [line],
    subtotalCents: 1599,
    taxCents: 0,
    feeCents: 0,
    totalCents: 1599,
    taxBreakdown: [],
    orderable: true,
    blockers: [],
    pickupAddress: { street: "89 Clarence St.", city: "Brampton", province: "ON", postalCode: "L6W 1S5", country: "CA" },
    pickupEstimateText: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    signature: "a-valid-looking-signature-value",
  },
};

describe("checkout input validation", () => {
  it("accepts bounded guest contact details and a complete server quote", () => {
    expect(checkoutRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("rejects invalid contact data, oversized notes, and extra client fields", () => {
    expect(checkoutRequestSchema.safeParse({ ...validRequest, customer: { ...validRequest.customer, email: "bad", notes: "x".repeat(501) } }).success).toBe(false);
    expect(checkoutRequestSchema.safeParse({ ...validRequest, browserTotalCents: 1 }).success).toBe(false);
  });
});
