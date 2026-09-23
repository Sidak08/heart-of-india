import { z } from "zod";

export const fulfillmentStatuses = ["new", "preparing", "ready_for_pickup", "completed", "cancelled"] as const;
export const paymentStatuses = ["unpaid", "paid_at_store"] as const;

export type FulfillmentStatus = (typeof fulfillmentStatuses)[number];
export type PaymentStatus = (typeof paymentStatuses)[number];

export type WeeklyHours = Record<string, Array<{ open: string; close: string }>>;
export type DateOverride = { date: string; intervals: Array<{ open: string; close: string }> };

export type RestaurantSettings = {
  id: string;
  name: string;
  tagline: string;
  phone: string;
  publicEmail: string | null;
  address: { street: string; city: string; province: string; postalCode: string; country: string };
  currency: "CAD";
  timezone: string;
  weeklyHours: WeeklyHours | null;
  dateOverrides: DateOverride[];
  cutoffMinutes: number | null;
  prepMinMinutes: number | null;
  prepMaxMinutes: number | null;
  orderingEnabled: boolean;
  menuApprovedAt: string | null;
  operationsApprovedAt: string | null;
  policiesApprovedAt: string | null;
  privacyPolicy: Array<{ heading: string; paragraphs: string[] }> | null;
  orderingPolicy: Array<{ heading: string; paragraphs: string[] }> | null;
  retentionDays: number | null;
  catalogRevision: number;
  taxLabel: string;
  taxRateBasisPoints: number;
  taxInclusive: boolean;
  updatedAt: string | null;
};

export type OrderSelection = {
  groupId: string;
  groupLabel: string;
  optionId: string;
  optionName: string;
  priceDeltaCents: number;
};

export type OrderLineSnapshot = {
  lineId: string;
  itemId: string;
  name: string;
  quantity: number;
  selections: OrderSelection[];
  unitPriceCents: number;
  lineTotalCents: number;
};

export type StoredOrder = {
  schemaVersion: 1;
  id: string;
  orderNumber: string;
  attemptId: string;
  guestTokenHash: string;
  guestAccessExpiresAt: string;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: "pay_at_store";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerNotes: string | null;
  currency: "CAD";
  subtotalCents: number;
  taxCents: number;
  feeCents: number;
  totalCents: number;
  taxBreakdown: Array<{ label: string; amountCents: number; inclusive: boolean }>;
  pickupAddress: RestaurantSettings["address"];
  pickupEstimateText: string | null;
  catalogRevision: number;
  cartSnapshot: Array<{ lineId: string; itemId: string; quantity: number }>;
  lines: OrderLineSnapshot[];
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
};

export type OrderView = Omit<StoredOrder, "guestTokenHash" | "guestAccessExpiresAt" | "attemptId">;

export type OrderDataIssue = {
  rowNumber: number;
  orderId: string | null;
  orderNumber: string | null;
  reasons: string[];
};

export function toOrderView(order: StoredOrder): OrderView {
  const safe: Partial<StoredOrder> = { ...order };
  delete safe.guestTokenHash; delete safe.guestAccessExpiresAt; delete safe.attemptId;
  return safe as OrderView;
}

export const fulfillmentStatusSchema = z.enum(fulfillmentStatuses);
export const paymentStatusSchema = z.enum(paymentStatuses);

export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  new: "New",
  preparing: "Preparing",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
};
