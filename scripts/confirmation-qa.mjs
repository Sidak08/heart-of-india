import { createHash, randomUUID } from "node:crypto";
import { chromium } from "playwright";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for confirmation QA.");

const baseURL = process.env.QA_BASE_URL || "http://localhost:3000";
const sql = postgres(databaseUrl, { max: 1 });
const guestId = randomUUID();
const orderId = randomUUID();
const lineRecordId = randomUUID();
const checkoutAttemptId = randomUUID();
const guestToken = `qa-${randomUUID()}`;
const tokenHash = createHash("sha256").update(guestToken).digest("hex");
const orderNumber = `HOI-QA-${orderId.slice(0, 6).toUpperCase()}`;
const lineId = randomUUID();
const pickupAddress = { street: "89 Clarence St.", city: "Brampton", province: "ON", postalCode: "L6W 1S5", country: "CA" };
const lineSnapshot = {
  lineId,
  itemId: "curries-saag-chicken-goat-lamb",
  name: "Saag (Chicken/Goat/Lamb)",
  quantity: 1,
  selections: [{ groupId: "protein", groupLabel: "Choose protein", optionId: "goat", optionName: "Goat", priceDeltaCents: 0 }],
  unitPriceCents: 1499,
  lineTotalCents: 1499,
  taxProfileId: null,
  taxCents: 0,
};

let browser;
try {
  await sql`insert into guest_sessions (id, token_hash, expires_at) values (${guestId}, ${tokenHash}, ${new Date(Date.now() + 3600_000)})`;
  await sql`insert into orders (id, order_number, guest_session_id, checkout_attempt_id, payment_status, fulfillment_status, customer_name, customer_email, customer_phone, currency, subtotal_cents, tax_cents, fee_cents, total_cents, tax_breakdown, pickup_address, pickup_estimate_text, catalog_revision, cart_snapshot)
    values (${orderId}, ${orderNumber}, ${guestId}, ${checkoutAttemptId}, 'pending_payment', 'unconfirmed', 'QA Customer', 'qa@example.com', '905-555-0100', 'CAD', 1499, 0, 0, 1499, ${sql.json([])}, ${sql.json(pickupAddress)}, '25–35 minutes after payment', 1, ${sql.json([{ lineId, itemId: lineSnapshot.itemId, quantity: 1 }])})`;
  await sql`insert into order_lines (id, order_id, line_id, item_id, snapshot, sort_order) values (${lineRecordId}, ${orderId}, ${lineId}, ${lineSnapshot.itemId}, ${sql.json(lineSnapshot)}, 0)`;

  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: "hoi_guest", value: guestToken, url: baseURL }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto(`${baseURL}/order/${orderId}?cancelled=1`);
  await page.getByRole("heading", { name: "Your cart is still here" }).waitFor();
  await page.screenshot({ path: "artifacts/screenshots/confirmation-cancelled-390x844.png", fullPage: true });

  await sql`update orders set payment_status = 'paid', stripe_payment_intent_id = ${`pi_qa_${orderId.slice(0, 8)}`}, paid_at = now(), updated_at = now() where id = ${orderId}`;
  await page.goto(`${baseURL}/order/${orderId}`);
  await page.getByRole("heading", { name: "Thank you for your order" }).waitFor();
  await page.getByText("Choose protein: Goat").waitFor();
  await page.getByText("CA$14.99", { exact: true }).last().waitFor();
  await page.screenshot({ path: "artifacts/screenshots/confirmation-paid-390x844.png", fullPage: true });
  if (errors.length) throw new Error(`Browser errors during confirmation QA: ${JSON.stringify(errors)}`);
  console.log(`Confirmation QA passed for authorised cancelled and paid states (${orderNumber}).`);
} finally {
  await browser?.close();
  await sql`delete from orders where id = ${orderId}`;
  await sql`delete from guest_sessions where id = ${guestId}`;
  await sql.end();
}
