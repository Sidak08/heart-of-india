import {
  boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

export const availabilityEnum = pgEnum("menu_availability", ["requires_owner_confirmation", "available", "unavailable"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending_payment", "paid", "expired", "payment_failed"]);
export const notificationKindEnum = pgEnum("notification_kind", ["restaurant_order", "customer_confirmation", "operator_magic_link"]);
export const notificationStatusEnum = pgEnum("notification_status", ["pending", "processing", "sent", "failed", "terminal"]);

export const menuCategories = pgTable("menu_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  printedInclusions: text("printed_inclusions"),
  reviewNote: text("review_note"),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const taxProfiles = pgTable("tax_profiles", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  rateBasisPoints: integer("rate_basis_points").notNull(),
  inclusive: boolean("inclusive").notNull(),
  stripeTaxRateId: text("stripe_tax_rate_id").notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

export const menuItems = pgTable("menu_items", {
  id: text("id").primaryKey(),
  categoryId: text("category_id").notNull().references(() => menuCategories.id),
  name: text("name").notNull(),
  description: text("description"),
  image: text("image"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull().default("CAD"),
  availability: availabilityEnum("availability").notNull().default("requires_owner_confirmation"),
  includedItems: jsonb("included_items").$type<string[]>(),
  dietaryTags: jsonb("dietary_tags").$type<string[]>(),
  allergens: jsonb("allergens").$type<string[]>(),
  taxProfileId: text("tax_profile_id").references(() => taxProfiles.id),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("menu_items_category_idx").on(table.categoryId, table.sortOrder)]);

export const optionGroups = pgTable("menu_option_groups", {
  id: text("id").notNull(),
  itemId: text("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  required: boolean("required").notNull(),
  minSelections: integer("min_selections").notNull(),
  maxSelections: integer("max_selections").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [primaryKey({ columns: [table.itemId, table.id] })]);

export const menuOptions = pgTable("menu_options", {
  id: text("id").notNull(),
  itemId: text("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  groupId: text("group_id").notNull(),
  name: text("name").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  primaryKey({ columns: [table.itemId, table.groupId, table.id] }),
]);

export type WeeklyHours = Record<string, Array<{ open: string; close: string }>>;
export type DateOverride = { date: string; intervals: Array<{ open: string; close: string }> };
export type FeeRule = null | { label: string; type: "flat"; amountCents: number; taxProfileId?: string } | { label: string; type: "percent"; rateBasisPoints: number; taxProfileId?: string };

export const restaurantSettings = pgTable("restaurant_settings", {
  id: text("id").primaryKey().default("heart-of-india"),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  phone: text("phone").notNull(),
  publicEmail: text("public_email"),
  address: jsonb("address").$type<{ street: string; city: string; province: string; postalCode: string; country: string }>().notNull(),
  currency: text("currency").notNull().default("CAD"),
  timezone: text("timezone").notNull().default("America/Toronto"),
  weeklyHours: jsonb("weekly_hours").$type<WeeklyHours>(),
  dateOverrides: jsonb("date_overrides").$type<DateOverride[]>(),
  cutoffMinutes: integer("cutoff_minutes"),
  prepMinMinutes: integer("prep_min_minutes"),
  prepMaxMinutes: integer("prep_max_minutes"),
  feeRule: jsonb("fee_rule").$type<FeeRule>(),
  orderingEnabled: boolean("ordering_enabled").notNull().default(false),
  menuApprovedAt: timestamp("menu_approved_at", { withTimezone: true }),
  operationsApprovedAt: timestamp("operations_approved_at", { withTimezone: true }),
  policiesApprovedAt: timestamp("policies_approved_at", { withTimezone: true }),
  privacyPolicy: jsonb("privacy_policy").$type<Array<{ heading: string; paragraphs: string[] }>>(),
  orderingPolicy: jsonb("ordering_policy").$type<Array<{ heading: string; paragraphs: string[] }>>(),
  retentionDays: integer("retention_days"),
  catalogRevision: integer("catalog_revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const guestSessions = pgTable("guest_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type OrderLineSnapshot = { lineId: string; itemId: string; name: string; quantity: number; selections: Array<{ groupId: string; groupLabel: string; optionId: string; optionName: string; priceDeltaCents: number }>; unitPriceCents: number; lineTotalCents: number; taxProfileId: string | null; taxCents: number };

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderNumber: text("order_number").notNull().unique(),
  guestSessionId: uuid("guest_session_id").notNull().references(() => guestSessions.id),
  checkoutAttemptId: uuid("checkout_attempt_id").notNull().unique(),
  paymentStatus: paymentStatusEnum("payment_status").notNull().default("pending_payment"),
  fulfillmentStatus: text("fulfillment_status").notNull().default("unconfirmed"),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerNotes: text("customer_notes"),
  currency: text("currency").notNull().default("CAD"),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull(),
  feeCents: integer("fee_cents").notNull(),
  totalCents: integer("total_cents").notNull(),
  taxBreakdown: jsonb("tax_breakdown").$type<Array<{ label: string; amountCents: number; inclusive: boolean }>>().notNull(),
  pickupAddress: jsonb("pickup_address").$type<Record<string, string>>().notNull(),
  pickupEstimateText: text("pickup_estimate_text"),
  catalogRevision: integer("catalog_revision").notNull(),
  cartSnapshot: jsonb("cart_snapshot").$type<Array<{ lineId: string; itemId: string; quantity: number }>>().notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("orders_stripe_session_unique").on(table.stripeCheckoutSessionId),
  uniqueIndex("orders_payment_intent_unique").on(table.stripePaymentIntentId),
  index("orders_paid_at_idx").on(table.paidAt),
]);

export const orderLines = pgTable("order_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  lineId: text("line_id").notNull(),
  itemId: text("item_id").notNull(),
  snapshot: jsonb("snapshot").$type<OrderLineSnapshot>().notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [uniqueIndex("order_lines_order_line_unique").on(table.orderId, table.lineId)]);

export const stripeEvents = pgTable("stripe_events", {
  eventId: text("event_id").primaryKey(),
  eventType: text("event_type").notNull(),
  sessionId: text("session_id"),
  payloadHash: text("payload_hash").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id").references(() => orders.id, { onDelete: "cascade" }),
  kind: notificationKindEnum("kind").notNull(),
  recipient: text("recipient").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: notificationStatusEnum("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(8),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockToken: uuid("lock_token"),
  providerId: text("provider_id"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("notification_order_kind_unique").on(table.orderId, table.kind),
  index("notification_due_idx").on(table.status, table.nextAttemptAt),
]);

export const users = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"), email: text("email").unique(), emailVerified: timestamp("emailVerified", { mode: "date" }), image: text("image"),
});
export const accounts = pgTable("account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), type: text("type").notNull(), provider: text("provider").notNull(), providerAccountId: text("providerAccountId").notNull(), refresh_token: text("refresh_token"), access_token: text("access_token"), expires_at: integer("expires_at"), token_type: text("token_type"), scope: text("scope"), id_token: text("id_token"), session_state: text("session_state"),
}, (table) => [primaryKey({ columns: [table.provider, table.providerAccountId] })]);
export const sessions = pgTable("session", { sessionToken: text("sessionToken").primaryKey(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), expires: timestamp("expires", { mode: "date" }).notNull() });
export const verificationTokens = pgTable("verificationToken", { identifier: text("identifier").notNull(), token: text("token").notNull(), expires: timestamp("expires", { mode: "date" }).notNull() }, (table) => [primaryKey({ columns: [table.identifier, table.token] })]);
export const authenticators = pgTable("authenticator", { credentialID: text("credentialID").notNull().unique(), userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }), providerAccountId: text("providerAccountId").notNull(), credentialPublicKey: text("credentialPublicKey").notNull(), counter: integer("counter").notNull(), credentialDeviceType: text("credentialDeviceType").notNull(), credentialBackedUp: boolean("credentialBackedUp").notNull(), transports: text("transports") }, (table) => [primaryKey({ columns: [table.userId, table.credentialID] })]);
