import { describe, expect, it } from "vitest";
import type { StoredOrder } from "@/lib/operations";
import { eligibleForRetentionCleanup } from "@/lib/server/sheets";

function order(id: string, fulfillmentStatus: StoredOrder["fulfillmentStatus"], createdAt: string, customerName = "Customer") {
  return { id, orderNumber: id, fulfillmentStatus, createdAt, customerName } as StoredOrder;
}
describe("retention cleanup eligibility", () => {
  it("includes only old completed or cancelled customer records", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    const eligible = eligibleForRetentionCleanup([
      order("old-completed", "completed", "2025-01-01T00:00:00Z"),
      order("old-active", "ready_for_pickup", "2025-01-01T00:00:00Z"),
      order("recent-completed", "completed", "2026-09-01T00:00:00Z"),
      order("already-redacted", "cancelled", "2025-01-01T00:00:00Z", "Deleted customer"),
    ], 365, now);
    expect(eligible.map((entry) => entry.id)).toEqual(["old-completed"]);
  });
});
