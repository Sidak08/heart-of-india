import { describe, expect, it } from "vitest";
import { createOrderRequestSchema } from "@/lib/server/orders";

const validRequest = {
  attemptId: "22222222-2222-4222-8222-222222222222",
  customer: { name: "Test Customer", email: "customer@example.com", phone: "905-555-0100", notes: "" },
  lines: [{ lineId: "11111111-1111-4111-8111-111111111111", itemId: "curries-butter-chicken", quantity: 1, selections: {} }],
  acceptedQuoteToken: "x".repeat(80),
};

describe("order input validation", () => {
  it("accepts bounded guest details and trusted identifiers", () => { expect(createOrderRequestSchema.safeParse(validRequest).success).toBe(true); });
  it("rejects invalid contact data, oversized notes, and client prices", () => {
    expect(createOrderRequestSchema.safeParse({ ...validRequest, customer: { ...validRequest.customer, email: "bad", notes: "x".repeat(501) } }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...validRequest, browserUnitPriceCents: 1 }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...validRequest, acceptedTotalCents: 1807 }).success).toBe(false);
  });
});
