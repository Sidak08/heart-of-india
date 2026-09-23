import "server-only";

import { randomUUID } from "node:crypto";
import { GoogleAuth } from "google-auth-library";
import { z } from "zod";
import menuSeed from "@/heart-of-india-menu.json";
import fallbackSettingsJson from "@/data/restaurant-config.json";
import type { MenuItem } from "@/lib/menu";
import type { OrderDataIssue, RestaurantSettings, StoredOrder } from "@/lib/operations";
import { fulfillmentStatusSchema, paymentStatusSchema } from "@/lib/operations";
import { env, sheetsConfigured } from "@/lib/server/env";

export const SHEET_NAMES = ["Orders", "Menu", "Settings", "PushSubscriptions", "LoginAttempts"] as const;

export const ORDER_HEADERS = [
  "schema_version", "order_id", "order_number", "attempt_id", "created_at", "updated_at",
  "fulfillment_status", "payment_status", "payment_method", "paid_at", "customer_name",
  "customer_email", "customer_phone", "customer_notes", "currency", "subtotal_cents",
  "tax_cents", "fee_cents", "total_cents", "tax_breakdown_json", "pickup_address_json",
  "pickup_estimate", "catalog_revision", "items_summary", "lines_json", "cart_snapshot_json",
  "guest_token_hash", "guest_access_expires_at", "previous_updated_at", "mutation_id",
] as const;

const MENU_HEADERS = ["item_id", "name", "category_id", "price_cents", "availability", "updated_at"] as const;

const SETTINGS_HEADERS = [
  "id", "name", "tagline", "phone", "public_email", "address_json", "currency", "timezone",
  "weekly_hours_json", "date_overrides_json", "cutoff_minutes", "prep_min_minutes", "prep_max_minutes",
  "ordering_enabled", "menu_approved_at", "operations_approved_at", "policies_approved_at",
  "privacy_policy_json", "ordering_policy_json", "retention_days", "catalog_revision", "tax_label",
  "tax_rate_basis_points", "tax_inclusive", "updated_at",
] as const;

const PUSH_HEADERS = ["device_id", "endpoint", "p256dh", "auth", "enabled", "created_at", "updated_at", "last_success_at", "last_error"] as const;
const RATE_HEADERS = ["key_hash", "bucket", "window_started_at", "count", "expires_at", "mutation_id"] as const;

type SheetValue = string | number | boolean | null;
type PushSubscriptionRecord = {
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};

const fallbackSettings: RestaurantSettings = {
  ...(fallbackSettingsJson as Omit<RestaurantSettings, "taxLabel" | "taxRateBasisPoints" | "taxInclusive" | "updatedAt">),
  publicEmail: env.PUBLIC_CONTACT_EMAIL ?? fallbackSettingsJson.publicEmail,
  currency: "CAD",
  taxLabel: "HST",
  taxRateBasisPoints: 1300,
  taxInclusive: false,
  updatedAt: null,
};

type MemoryStore = {
  orders: StoredOrder[];
  settings: RestaurantSettings;
  menu: MenuItem[];
  subscriptions: PushSubscriptionRecord[];
  attempts: Map<string, { count: number; expiresAt: number }>;
};

const globalStore = globalThis as unknown as { hoiSheetsMemory?: MemoryStore };

function seedMenu(approved = false): MenuItem[] {
  return menuSeed.items.map((source) => ({
    ...menuSeed.defaults,
    ...source,
    availability: approved ? "available" : menuSeed.defaults.availability,
  })) as MenuItem[];
}

function memoryStore(): MemoryStore {
  if (!globalStore.hoiSheetsMemory) {
    const now = new Date().toISOString();
    globalStore.hoiSheetsMemory = {
      orders: [],
      menu: seedMenu(true),
      subscriptions: [],
      attempts: new Map(),
      settings: {
        ...fallbackSettings,
        weeklyHours: Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => [day, [{ open: "00:00", close: "00:00" }]])),
        cutoffMinutes: 0,
        prepMinMinutes: 25,
        prepMaxMinutes: 35,
        orderingEnabled: true,
        menuApprovedAt: now,
        operationsApprovedAt: now,
        policiesApprovedAt: now,
        privacyPolicy: [{ heading: "Privacy", paragraphs: ["Contact information is used only to prepare and coordinate pickup orders."] }],
        orderingPolicy: [{ heading: "Pickup orders", paragraphs: ["Orders are paid at the store when collected."] }],
        retentionDays: 365,
        updatedAt: now,
      },
    };
  }
  return globalStore.hoiSheetsMemory;
}

export function usingSheetsTestMode() {
  return env.SHEETS_TEST_MODE === "true" && process.env.NODE_ENV !== "production";
}

function privateKey() {
  return env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
}

const auth = sheetsConfigured() ? new GoogleAuth({
  credentials: { client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: privateKey() },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
}) : null;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!auth || !env.GOOGLE_SHEETS_ID) throw new Error("Google Sheets is not configured.");
  const token = await auth.getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEETS_ID}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Sheets request failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

function range(value: string) {
  return encodeURIComponent(value);
}

async function getValues(a1: string): Promise<SheetValue[][]> {
  const data = await request<{ values?: SheetValue[][] }>(`/values/${range(a1)}?majorDimension=ROWS`);
  return data.values ?? [];
}

async function putValues(a1: string, values: SheetValue[][]) {
  return request(`/values/${range(a1)}?valueInputOption=RAW`, { method: "PUT", body: JSON.stringify({ range: a1, majorDimension: "ROWS", values }) });
}

async function appendValues(a1: string, values: SheetValue[][]) {
  return request(`/values/${range(a1)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, { method: "POST", body: JSON.stringify({ range: a1, majorDimension: "ROWS", values }) });
}

function asString(value: SheetValue | undefined) { return value == null ? "" : String(value); }
function asNumber(value: SheetValue | undefined, fallback = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function asBoolean(value: SheetValue | undefined) { return value === true || String(value).toLowerCase() === "true"; }
function nullable(value: SheetValue | undefined) { const text = asString(value).trim(); return text || null; }
function parseJson<T>(value: SheetValue | undefined, fallback: T): T { try { return JSON.parse(asString(value)) as T; } catch { return fallback; } }

function rowObject(headers: readonly string[], row: SheetValue[]) {
  return Object.fromEntries(headers.map((header, index) => [header, row[index]]));
}

function settingsToRow(settings: RestaurantSettings): SheetValue[] {
  return [settings.id, settings.name, settings.tagline, settings.phone, settings.publicEmail ?? "", JSON.stringify(settings.address), settings.currency,
    settings.timezone, JSON.stringify(settings.weeklyHours), JSON.stringify(settings.dateOverrides), settings.cutoffMinutes, settings.prepMinMinutes,
    settings.prepMaxMinutes, settings.orderingEnabled, settings.menuApprovedAt ?? "", settings.operationsApprovedAt ?? "", settings.policiesApprovedAt ?? "",
    JSON.stringify(settings.privacyPolicy), JSON.stringify(settings.orderingPolicy), settings.retentionDays, settings.catalogRevision, settings.taxLabel,
    settings.taxRateBasisPoints, settings.taxInclusive, settings.updatedAt ?? ""];
}

function parseSettings(row: SheetValue[]): RestaurantSettings {
  const value = rowObject(SETTINGS_HEADERS, row);
  const address = parseJson<RestaurantSettings["address"]>(value.address_json, fallbackSettings.address);
  return {
    id: asString(value.id) || "heart-of-india",
    name: asString(value.name) || fallbackSettings.name,
    tagline: asString(value.tagline) || fallbackSettings.tagline,
    phone: asString(value.phone) || fallbackSettings.phone,
    publicEmail: nullable(value.public_email),
    address,
    currency: "CAD",
    timezone: asString(value.timezone) || "America/Toronto",
    weeklyHours: parseJson(value.weekly_hours_json, null),
    dateOverrides: parseJson(value.date_overrides_json, []),
    cutoffMinutes: nullable(value.cutoff_minutes) == null ? null : asNumber(value.cutoff_minutes),
    prepMinMinutes: nullable(value.prep_min_minutes) == null ? null : asNumber(value.prep_min_minutes),
    prepMaxMinutes: nullable(value.prep_max_minutes) == null ? null : asNumber(value.prep_max_minutes),
    orderingEnabled: asBoolean(value.ordering_enabled),
    menuApprovedAt: nullable(value.menu_approved_at),
    operationsApprovedAt: nullable(value.operations_approved_at),
    policiesApprovedAt: nullable(value.policies_approved_at),
    privacyPolicy: parseJson(value.privacy_policy_json, null),
    orderingPolicy: parseJson(value.ordering_policy_json, null),
    retentionDays: nullable(value.retention_days) == null ? null : asNumber(value.retention_days),
    catalogRevision: Math.max(1, asNumber(value.catalog_revision, 1)),
    taxLabel: asString(value.tax_label) || "HST",
    taxRateBasisPoints: asNumber(value.tax_rate_basis_points, 1300),
    taxInclusive: asBoolean(value.tax_inclusive),
    updatedAt: nullable(value.updated_at),
  };
}

type OrderRowMetadata = { previousUpdatedAt: string | null; mutationId: string | null };
type ParsedOrderRow = OrderRowMetadata & { rowNumber: number; order: StoredOrder };

const isoDateSchema = z.string().datetime();
const addressSchema = z.object({ street: z.string().min(1), city: z.string().min(1), province: z.string().min(1), postalCode: z.string().min(1), country: z.string().min(1) }).strict();
const orderSelectionSchema = z.object({ groupId: z.string().min(1), groupLabel: z.string().min(1), optionId: z.string().min(1), optionName: z.string().min(1), priceDeltaCents: z.number().int() }).strict();
const orderLineSchema = z.object({
  lineId: z.string().uuid(), itemId: z.string().min(1), name: z.string().min(1), quantity: z.number().int().min(1).max(20),
  selections: z.array(orderSelectionSchema), unitPriceCents: z.number().int().nonnegative(), lineTotalCents: z.number().int().nonnegative(),
}).strict().refine((line) => line.lineTotalCents === line.unitPriceCents * line.quantity, { message: "line total does not match price and quantity" });
const cartSnapshotSchema = z.array(z.object({ lineId: z.string().uuid(), itemId: z.string().min(1), quantity: z.number().int().min(1).max(20) }).strict()).min(1);
const taxBreakdownSchema = z.array(z.object({ label: z.string().min(1), amountCents: z.number().int().nonnegative(), inclusive: z.boolean() }).strict());
const parsedOrderSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), orderNumber: z.string().min(1), attemptId: z.string().uuid(), createdAt: isoDateSchema, updatedAt: isoDateSchema,
  fulfillmentStatus: fulfillmentStatusSchema, paymentStatus: paymentStatusSchema, paymentMethod: z.literal("pay_at_store"), paidAt: isoDateSchema.nullable(),
  customerName: z.string().min(1), customerEmail: z.string().email(), customerPhone: z.string().min(1), customerNotes: z.string().nullable(), currency: z.literal("CAD"),
  subtotalCents: z.number().int().nonnegative(), taxCents: z.number().int().nonnegative(), feeCents: z.number().int().nonnegative(), totalCents: z.number().int().nonnegative(),
  taxBreakdown: taxBreakdownSchema, pickupAddress: addressSchema, pickupEstimateText: z.string().nullable(), catalogRevision: z.number().int().positive(),
  lines: z.array(orderLineSchema).min(1), cartSnapshot: cartSnapshotSchema, guestTokenHash: z.string().regex(/^[a-f0-9]{64}$/), guestAccessExpiresAt: isoDateSchema,
}).strict().superRefine((order, context) => {
  const lineSubtotal = order.lines.reduce((sum, line) => sum + line.lineTotalCents, 0);
  if (lineSubtotal !== order.subtotalCents) context.addIssue({ code: "custom", message: "subtotal does not match line totals", path: ["subtotalCents"] });
  if (order.totalCents !== order.subtotalCents + order.taxCents + order.feeCents) context.addIssue({ code: "custom", message: "total does not match subtotal, tax, and fees", path: ["totalCents"] });
  if (order.updatedAt < order.createdAt) context.addIssue({ code: "custom", message: "updated time is before created time", path: ["updatedAt"] });
  if (order.cartSnapshot.length !== order.lines.length) context.addIssue({ code: "custom", message: "cart snapshot does not match line count", path: ["cartSnapshot"] });
  const cartByLine = new Map(order.cartSnapshot.map((line) => [line.lineId, line]));
  if (new Set(order.lines.map((line) => line.lineId)).size !== order.lines.length || new Set(order.cartSnapshot.map((line) => line.lineId)).size !== order.cartSnapshot.length) context.addIssue({ code: "custom", message: "duplicate line IDs are not allowed", path: ["lines"] });
  if (order.lines.some((line) => { const cartLine = cartByLine.get(line.lineId); return !cartLine || cartLine.itemId !== line.itemId || cartLine.quantity !== line.quantity; })) context.addIssue({ code: "custom", message: "cart snapshot does not match stored lines", path: ["cartSnapshot"] });
});

export function orderToRow(order: StoredOrder, metadata: OrderRowMetadata = { previousUpdatedAt: null, mutationId: null }): SheetValue[] {
  const itemSummary = order.lines.map((line) => `${line.quantity}× ${line.name}${line.selections.length ? ` (${line.selections.map((s) => s.optionName).join(", ")})` : ""}`).join("; ");
  return [order.schemaVersion, order.id, order.orderNumber, order.attemptId, order.createdAt, order.updatedAt, order.fulfillmentStatus,
    order.paymentStatus, order.paymentMethod, order.paidAt ?? "", order.customerName, order.customerEmail, order.customerPhone,
    order.customerNotes ?? "", order.currency, order.subtotalCents, order.taxCents, order.feeCents, order.totalCents,
    JSON.stringify(order.taxBreakdown), JSON.stringify(order.pickupAddress), order.pickupEstimateText ?? "", order.catalogRevision,
    itemSummary, JSON.stringify(order.lines), JSON.stringify(order.cartSnapshot), order.guestTokenHash, order.guestAccessExpiresAt,
    metadata.previousUpdatedAt ?? "", metadata.mutationId ?? ""];
}

function jsonValue(value: SheetValue | undefined) {
  try { return JSON.parse(asString(value)) as unknown; } catch { return Symbol.for("invalid-json"); }
}

function parseOrderRow(row: SheetValue[], rowNumber: number): { parsed: ParsedOrderRow | null; issue: OrderDataIssue | null } {
  if (!row.some((cell) => asString(cell).trim())) return { parsed: null, issue: null };
  const value = rowObject(ORDER_HEADERS, row);
  const candidate = {
    schemaVersion: Number(value.schema_version),
    id: asString(value.order_id),
    orderNumber: asString(value.order_number),
    attemptId: asString(value.attempt_id),
    createdAt: asString(value.created_at),
    updatedAt: asString(value.updated_at),
    fulfillmentStatus: asString(value.fulfillment_status),
    paymentStatus: asString(value.payment_status),
    paymentMethod: asString(value.payment_method),
    paidAt: nullable(value.paid_at),
    customerName: asString(value.customer_name),
    customerEmail: asString(value.customer_email),
    customerPhone: asString(value.customer_phone),
    customerNotes: nullable(value.customer_notes),
    currency: asString(value.currency),
    subtotalCents: Number(value.subtotal_cents),
    taxCents: Number(value.tax_cents),
    feeCents: Number(value.fee_cents),
    totalCents: Number(value.total_cents),
    taxBreakdown: jsonValue(value.tax_breakdown_json),
    pickupAddress: jsonValue(value.pickup_address_json),
    pickupEstimateText: nullable(value.pickup_estimate),
    catalogRevision: Number(value.catalog_revision),
    lines: jsonValue(value.lines_json),
    cartSnapshot: jsonValue(value.cart_snapshot_json),
    guestTokenHash: asString(value.guest_token_hash),
    guestAccessExpiresAt: asString(value.guest_access_expires_at),
  };
  const result = parsedOrderSchema.safeParse(candidate);
  const previousUpdatedAt = nullable(value.previous_updated_at);
  const mutationId = nullable(value.mutation_id);
  const metadata = z.object({ previousUpdatedAt: isoDateSchema.nullable(), mutationId: z.string().uuid().nullable() }).strict().superRefine((entry, context) => {
    if (entry.previousUpdatedAt && !entry.mutationId) context.addIssue({ code: "custom", message: "version row is missing a mutation ID", path: ["mutationId"] });
  }).safeParse({ previousUpdatedAt, mutationId });
  const reasons = [
    ...(result.success ? [] : result.error.issues.map((issue) => `${issue.path.join(".") || "row"}: ${issue.message}`)),
    ...(metadata.success ? [] : metadata.error.issues.map((issue) => `${issue.path.join(".") || "metadata"}: ${issue.message}`)),
  ];
  if (!result.success || !metadata.success) return { parsed: null, issue: { rowNumber, orderId: nullable(value.order_id), orderNumber: nullable(value.order_number), reasons: [...new Set(reasons)].slice(0, 8) } };
  return { parsed: { rowNumber, order: result.data, ...metadata.data }, issue: null };
}

function resolveOrderRows(rows: SheetValue[][]) {
  const parsed: ParsedOrderRow[] = []; const issues: OrderDataIssue[] = [];
  rows.forEach((row, index) => { const result = parseOrderRow(row, index + 2); if (result.parsed) parsed.push(result.parsed); if (result.issue) issues.push(result.issue); });
  const groups = new Map<string, ParsedOrderRow[]>();
  for (const entry of parsed) groups.set(entry.order.id, [...(groups.get(entry.order.id) ?? []), entry]);
  const canonical = new Map<string, ParsedOrderRow>(); let conflictCount = 0;
  for (const [id, versions] of groups) {
    const legacy = versions.filter((entry) => !entry.mutationId && !entry.previousUpdatedAt).sort((a, b) => b.order.updatedAt.localeCompare(a.order.updatedAt) || a.rowNumber - b.rowNumber);
    const roots = versions.filter((entry) => entry.mutationId && !entry.previousUpdatedAt).sort((a, b) => a.rowNumber - b.rowNumber);
    let current = legacy[0] ?? roots[0];
    if (!current) continue;
    conflictCount += legacy.length ? Math.max(0, legacy.length - 1) + roots.length : Math.max(0, roots.length - 1);
    const visited = new Set<number>([current.rowNumber]);
    while (true) {
      const children = versions.filter((entry) => entry.previousUpdatedAt === current.order.updatedAt && entry.mutationId && !visited.has(entry.rowNumber)).sort((a, b) => a.rowNumber - b.rowNumber);
      if (!children.length) break;
      conflictCount += Math.max(0, children.length - 1);
      current = children[0]; visited.add(current.rowNumber);
    }
    canonical.set(id, current);
  }
  const orders = [...canonical.values()].map((entry) => entry.order).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { orders, issues, conflictCount, canonical };
}

export function inspectOrderRows(rows: SheetValue[][]) {
  const { orders, issues, conflictCount } = resolveOrderRows(rows);
  return { orders, issues, conflictCount };
}

let settingsCache: { value: RestaurantSettings; expires: number } | null = null;
let menuCache: { value: MenuItem[]; expires: number } | null = null;

export function invalidateSheetsCache() { settingsCache = null; menuCache = null; }

export async function readSettings(): Promise<RestaurantSettings> {
  if (usingSheetsTestMode()) return memoryStore().settings;
  if (!sheetsConfigured()) throw new Error("Google Sheets is not configured.");
  if (settingsCache && settingsCache.expires > Date.now()) return settingsCache.value;
  const rows = await getValues("Settings!A2:Y2");
  if (!rows[0]) throw new Error("The Settings sheet has not been initialized.");
  const value = parseSettings(rows[0]);
  settingsCache = { value, expires: Date.now() + 30_000 };
  return value;
}

export async function writeSettings(value: RestaurantSettings) {
  if (usingSheetsTestMode()) { memoryStore().settings = structuredClone(value); invalidateSheetsCache(); return; }
  await putValues("Settings!A2:Y2", [settingsToRow(value)]);
  invalidateSheetsCache();
}

export async function readMenu(): Promise<MenuItem[]> {
  if (usingSheetsTestMode()) return memoryStore().menu;
  if (!sheetsConfigured()) throw new Error("Google Sheets is not configured.");
  if (menuCache && menuCache.expires > Date.now()) return menuCache.value;
  const rows = await getValues("Menu!A2:F");
  if (!rows.length) throw new Error("The Menu sheet has not been initialized.");
  const categoryIds = new Set(menuSeed.categories.map((category) => category.id));
  const overrides = new Map(rows.map((row) => {
    const value = rowObject(MENU_HEADERS, row);
    return [asString(value.item_id), {
      name: asString(value.name).trim(),
      categoryId: asString(value.category_id),
      priceCents: asNumber(value.price_cents),
      availability: asString(value.availability),
    }];
  }));
  const menu = seedMenu().map((item) => {
    const override = overrides.get(item.id);
    const availability = override?.availability;
    if (!override || override.name.length < 2 || !categoryIds.has(override.categoryId) || !Number.isInteger(override.priceCents) || override.priceCents < 0 || !["available", "unavailable", "requires_owner_confirmation"].includes(availability ?? "")) throw new Error(`Menu row for ${item.id} is missing or invalid.`);
    return { ...item, name: override.name, categoryId: override.categoryId, priceCents: override.priceCents, availability: availability as MenuItem["availability"] };
  });
  menuCache = { value: menu, expires: Date.now() + 30_000 };
  return menu;
}

type MenuItemUpdate = Pick<MenuItem, "id" | "name" | "categoryId" | "priceCents"> & { availability: NonNullable<MenuItem["availability"]> };

export async function updateMenuItem(value: MenuItemUpdate) {
  const catalogue = await readMenu();
  const current = catalogue.find((item) => item.id === value.id);
  if (!current) throw new Error("Menu item was not found.");
  const updated: MenuItem = {
    ...current,
    name: value.name.trim(),
    categoryId: value.categoryId,
    priceCents: value.priceCents,
    availability: value.availability,
  };
  const now = new Date().toISOString();

  if (usingSheetsTestMode()) {
    const store = memoryStore();
    store.menu = store.menu.map((item) => item.id === updated.id ? structuredClone(updated) : item);
    store.settings = { ...store.settings, catalogRevision: store.settings.catalogRevision + 1, updatedAt: now };
    invalidateSheetsCache();
    return structuredClone(updated);
  }

  const rows = await getValues("Menu!A2:F");
  const index = rows.findIndex((row) => asString(row[0]) === updated.id);
  if (index < 0) throw new Error("Menu item was not found in the spreadsheet.");
  await putValues(`Menu!A${index + 2}:F${index + 2}`, [[updated.id, updated.name, updated.categoryId, updated.priceCents, updated.availability ?? "requires_owner_confirmation", now]]);
  menuCache = null;

  const settings = await readSettings();
  await writeSettings({ ...settings, catalogRevision: settings.catalogRevision + 1, updatedAt: now });
  return updated;
}

export async function approveSeedMenu(now = new Date().toISOString()) {
  if (usingSheetsTestMode()) { memoryStore().menu = memoryStore().menu.map((item) => item.availability === "requires_owner_confirmation" ? { ...item, availability: "available" } : item); return; }
  const rows = await getValues("Menu!A2:F");
  const next = rows.map((row) => {
    const padded = [...row];
    while (padded.length < MENU_HEADERS.length) padded.push("");
    if (asString(padded[4]) === "requires_owner_confirmation") padded[4] = "available";
    padded[5] = now;
    return padded;
  });
  if (next.length) await putValues(`Menu!A2:F${next.length + 1}`, next);
  invalidateSheetsCache();
}

export async function listOrders(): Promise<StoredOrder[]> {
  return (await listOrdersWithDiagnostics()).orders;
}

export async function listOrdersWithDiagnostics(): Promise<{ orders: StoredOrder[]; issues: OrderDataIssue[]; conflictCount: number }> {
  if (usingSheetsTestMode()) return { orders: [...memoryStore().orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), issues: [], conflictCount: 0 };
  const { orders, issues, conflictCount } = resolveOrderRows(await getValues("Orders!A2:AD"));
  return { orders, issues, conflictCount };
}

export async function findOrderByAttempt(attemptId: string) { return (await listOrders()).find((order) => order.attemptId === attemptId) ?? null; }
export async function findOrderById(id: string) { return (await listOrders()).find((order) => order.id === id) ?? null; }

export async function appendOrder(order: StoredOrder) {
  if (usingSheetsTestMode()) {
    const store = memoryStore();
    if (store.orders.some((entry) => entry.id === order.id || entry.attemptId === order.attemptId)) return false;
    store.orders.push(structuredClone(order));
    return true;
  }
  const mutationId = randomUUID();
  await appendValues("Orders!A:AD", [orderToRow(order, { previousUpdatedAt: null, mutationId })]);
  const resolved = resolveOrderRows(await getValues("Orders!A2:AD"));
  return resolved.canonical.get(order.id)?.mutationId === mutationId;
}

export async function updateOrder(order: StoredOrder, expectedUpdatedAt: string) {
  if (usingSheetsTestMode()) {
    const index = memoryStore().orders.findIndex((entry) => entry.id === order.id);
    if (index < 0) throw new Error("Order was not found.");
    if (memoryStore().orders[index].updatedAt !== expectedUpdatedAt) return false;
    memoryStore().orders[index] = structuredClone(order);
    return true;
  }
  const before = resolveOrderRows(await getValues("Orders!A2:AD"));
  const current = before.canonical.get(order.id);
  if (!current) throw new Error("Order was not found.");
  if (current.order.updatedAt !== expectedUpdatedAt) return false;
  const mutationId = randomUUID();
  await appendValues("Orders!A:AD", [orderToRow(order, { previousUpdatedAt: expectedUpdatedAt, mutationId })]);
  const after = resolveOrderRows(await getValues("Orders!A2:AD"));
  return after.canonical.get(order.id)?.mutationId === mutationId;
}

function parseSubscription(row: SheetValue[]): PushSubscriptionRecord | null {
  const value = rowObject(PUSH_HEADERS, row);
  if (!asString(value.device_id) || !asString(value.endpoint)) return null;
  return { deviceId: asString(value.device_id), endpoint: asString(value.endpoint), p256dh: asString(value.p256dh), auth: asString(value.auth), enabled: asBoolean(value.enabled), createdAt: asString(value.created_at), updatedAt: asString(value.updated_at), lastSuccessAt: nullable(value.last_success_at), lastError: nullable(value.last_error) };
}

function subscriptionToRow(value: PushSubscriptionRecord): SheetValue[] { return [value.deviceId, value.endpoint, value.p256dh, value.auth, value.enabled, value.createdAt, value.updatedAt, value.lastSuccessAt ?? "", value.lastError ?? ""]; }

export async function listPushSubscriptions() {
  return usingSheetsTestMode() ? memoryStore().subscriptions.filter((entry) => entry.enabled) : (await getValues("PushSubscriptions!A2:I")).map(parseSubscription).filter((entry): entry is PushSubscriptionRecord => Boolean(entry?.enabled));
}

export async function upsertPushSubscription(value: PushSubscriptionRecord) {
  if (usingSheetsTestMode()) {
    const store = memoryStore(); const index = store.subscriptions.findIndex((entry) => entry.deviceId === value.deviceId);
    if (index >= 0) store.subscriptions[index] = structuredClone(value); else store.subscriptions.push(structuredClone(value));
    return;
  }
  const rows = await getValues("PushSubscriptions!A2:I");
  const index = rows.findIndex((row) => asString(row[0]) === value.deviceId);
  if (index >= 0) await putValues(`PushSubscriptions!A${index + 2}:I${index + 2}`, [subscriptionToRow(value)]);
  else await appendValues("PushSubscriptions!A:I", [subscriptionToRow(value)]);
}

export async function disablePushSubscription(deviceId: string, error: string | null = null) {
  const existing = (await listPushSubscriptions()).find((entry) => entry.deviceId === deviceId);
  if (existing) await upsertPushSubscription({ ...existing, enabled: false, updatedAt: new Date().toISOString(), lastError: error });
}

export async function consumeRateLimit(keyHash: string, bucket: string, limit: number, windowMs: number) {
  if (usingSheetsTestMode()) {
    const key = `${bucket}:${keyHash}`; const now = Date.now(); const current = memoryStore().attempts.get(key);
    const next = !current || current.expiresAt <= now ? { count: 1, expiresAt: now + windowMs } : { ...current, count: current.count + 1 };
    memoryStore().attempts.set(key, next); return { success: next.count <= limit, remaining: Math.max(0, limit - next.count) };
  }
  if (!sheetsConfigured()) return { success: false, remaining: 0 };
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const started = new Date(windowStart).toISOString();
  const expires = new Date(windowStart + windowMs).toISOString();
  const mutationId = randomUUID();
  await appendValues("LoginAttempts!A:F", [[keyHash, bucket, started, 1, expires, mutationId]]);
  const rows = await getValues("LoginAttempts!A2:F");
  const mutationVisible = rows.some((row) => asString(row[5]) === mutationId);
  if (!mutationVisible) return { success: false, remaining: 0 };
  const count = rows.reduce((sum, row) => {
    if (asString(row[0]) !== keyHash || asString(row[1]) !== bucket || asString(row[2]) !== started || Date.parse(asString(row[4])) <= now) return sum;
    return sum + Math.max(0, asNumber(row[3]));
  }, 0);
  return { success: count <= limit, remaining: Math.max(0, limit - count) };
}

export async function initializeSpreadsheet() {
  if (usingSheetsTestMode()) return { created: [], initialized: SHEET_NAMES };
  if (!sheetsConfigured()) throw new Error("Set the Google Sheets service-account environment variables first.");
  const metadata = await request<{ sheets?: Array<{ properties?: { title?: string } }> }>("?fields=sheets.properties.title");
  const existing = new Set(metadata.sheets?.map((sheet) => sheet.properties?.title).filter(Boolean));
  const missing = SHEET_NAMES.filter((name) => !existing.has(name));
  if (missing.length) await request(":batchUpdate", { method: "POST", body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } })) }) });
  await Promise.all([
    putValues("Orders!A1:AD1", [[...ORDER_HEADERS]]),
    putValues("Menu!A1:F1", [[...MENU_HEADERS]]),
    putValues("Settings!A1:Y1", [[...SETTINGS_HEADERS]]),
    putValues("PushSubscriptions!A1:I1", [[...PUSH_HEADERS]]),
    putValues("LoginAttempts!A1:F1", [[...RATE_HEADERS]]),
  ]);
  const [menuRows, settingRows] = await Promise.all([getValues("Menu!A2:F"), getValues("Settings!A2:Y2")]);
  const now = new Date().toISOString();
  if (!menuRows.length) await putValues(`Menu!A2:F${menuSeed.items.length + 1}`, seedMenu().map((item) => [item.id, item.name, item.categoryId, item.priceCents, item.availability ?? "requires_owner_confirmation", now]));
  if (!settingRows.length) await putValues("Settings!A2:Y2", [settingsToRow({ ...fallbackSettings, updatedAt: now })]);
  invalidateSheetsCache();
  return { created: missing, initialized: SHEET_NAMES };
}

export function getFallbackSettings() { return structuredClone(fallbackSettings); }
export function getFallbackMenu() { return seedMenu(); }
