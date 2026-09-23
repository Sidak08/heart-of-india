import { describe, expect, it } from "vitest";
import { createOrder, getGuestOrder, setOrderStatus } from "@/lib/server/orders";
import { createQuote } from "@/lib/server/quote";

type RequestLine = { lineId: string; itemId: string; quantity: number; selections: Record<string, string> };

async function orderRequest(lines: RequestLine[], customer = { name: "A Customer", email: "customer@example.com", phone: "905-555-0100", notes: "Door pickup" }) {
  const quote = await createQuote({ lines });
  return { attemptId: crypto.randomUUID(), customer, lines, acceptedQuoteToken: quote.quoteToken };
}

describe("pay-at-store orders", () => {
  it("creates an idempotent order and protects guest access", async () => {
    const input = await orderRequest([{ lineId: crypto.randomUUID(), itemId: "curries-butter-chicken", quantity: 1, selections: {} }]);
    const first = await createOrder(input); const second = await createOrder(input);
    expect(first.changed).toBe(false); expect(second.changed).toBe(false);
    if (first.changed || second.changed) throw new Error("Unexpected changed quote");
    expect(second.order.id).toBe(first.order.id); expect(second.existing).toBe(true);
    expect(await getGuestOrder(first.order.id, first.guestToken)).toMatchObject({ paymentStatus: "unpaid", fulfillmentStatus: "new", totalCents: 1807 });
    expect(await getGuestOrder(first.order.id, "wrong-token")).toBeNull();
  });

  it("commits only one order when the same attempt is submitted concurrently", async () => {
    const input = await orderRequest([{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }]);
    const [first, second] = await Promise.all([createOrder(input), createOrder(input)]);
    if (first.changed || second.changed) throw new Error("Unexpected changed quote");
    expect(first.order.id).toBe(second.order.id);
    expect([first.existing, second.existing].sort()).toEqual([false, true]);
  });

  it("uses updated-at conflict protection for operator changes", async () => {
    const request = await orderRequest([{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }], { name: "Owner Test", email: "owner-test@example.com", phone: "905-555-0101", notes: "" });
    const result = await createOrder(request);
    if (result.changed) throw new Error("Unexpected changed quote");
    const updated = await setOrderStatus(result.order.id, { fulfillmentStatus: "preparing", expectedUpdatedAt: result.order.updatedAt });
    expect(updated?.fulfillmentStatus).toBe("preparing");
    expect(await setOrderStatus(result.order.id, { fulfillmentStatus: "ready_for_pickup", expectedUpdatedAt: result.order.updatedAt })).toBeNull();
  });

  it("rejects a signed quote when the cart changes to a same-priced item", async () => {
    const lineId = crypto.randomUUID();
    const accepted = await createQuote({ lines: [{ lineId, itemId: "side-orders-roti", quantity: 1, selections: {} }] });
    const result = await createOrder({
      attemptId: crypto.randomUUID(), customer: { name: "Cart Swap", email: "cart-swap@example.com", phone: "905-555-0102", notes: "" },
      lines: [{ lineId, itemId: "drinks-desserts-gulab-jamun", quantity: 1, selections: {} }], acceptedQuoteToken: accepted.quoteToken,
    });
    expect(result.changed).toBe(true);
    if (!result.changed) throw new Error("Expected a changed quote");
    expect(result.quote.lines[0].itemId).toBe("drinks-desserts-gulab-jamun");
    expect(result.quote.totalCents).toBe(accepted.totalCents);
  });

  it("rejects a tampered quote token", async () => {
    const request = await orderRequest([{ lineId: crypto.randomUUID(), itemId: "drinks-desserts-water", quantity: 1, selections: {} }]);
    request.acceptedQuoteToken = `${request.acceptedQuoteToken.slice(0, -1)}x`;
    const result = await createOrder(request);
    expect(result.changed).toBe(true);
  });

  it("rejects a required option that is missing", async () => {
    const lineId = crypto.randomUUID();
    const accepted = await createQuote({ lines: [{ lineId, itemId: "curries-saag-chicken-goat-lamb", quantity: 1, selections: { protein: "goat" } }] });
    await expect(createOrder({ attemptId: crypto.randomUUID(), customer: { name: "Option Test", email: "option-test@example.com", phone: "905-555-0103", notes: "" }, lines: [{ lineId, itemId: "curries-saag-chicken-goat-lamb", quantity: 1, selections: {} }], acceptedQuoteToken: accepted.quoteToken })).rejects.toThrow("Choose protein is required");
  });
});
