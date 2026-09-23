# Heart of India pickup ordering

A responsive Next.js App Router website for Heart of India in Brampton, Ontario. Customers build a pickup order, enter their contact information, receive an order number, and pay at the restaurant. The owner manages orders from a protected dashboard and can enable free browser push notifications.

The storefront uses the supplied logo and the checked-in 80-item menu. Google Sheets is the only persistent service: it stores the authoritative menu overrides, restaurant settings, customer orders, fulfillment/payment status, push subscriptions, and login throttling records.

## Features

- Responsive Home, Menu, About, Cart, Checkout, order-status, privacy, and ordering-policy pages
- Searchable eight-category menu with required Saag and combo choices
- Persistent local cart containing only menu selections and quantities
- Server-authoritative catalogue lookup, input validation, quantities, hours, availability, integer-cent totals, and 13% HST
- Pay-at-store pickup orders with protected live customer status
- Operator workflow: New, Preparing, Ready for pickup, Completed, and Cancelled
- Separate Unpaid/Paid at store tracking
- Private email/password operator login with a one-way scrypt hash and signed HttpOnly session cookie
- Live dashboard polling, audible alerts, and optional Web Push on each enrolled operator device
- Private Google Sheet that remains readable and editable by the owner
- No online card processing, customer accounts, transactional email provider, database server, Redis, or cron worker

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a Google Cloud project, enable the **Google Sheets API**, and create a service account with a JSON key.
3. Create an empty private Google Sheet and share it with the service account's `client_email` as **Editor**. Do not publish the sheet or enable link-wide access because it contains customer contact information.
4. Copy `.env.example` to `.env.local` and configure the values described below.
5. Initialize the spreadsheet tabs and seed the menu/settings:

   ```bash
   npm run sheets:setup
   ```

6. Start the site:

   ```bash
   npm run dev
   ```

The public site remains browseable without Sheets credentials, but placing orders fails closed. A missing or invalid spreadsheet is never replaced by an in-memory production store.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Canonical origin used for mutation origin checks |
| `GOOGLE_SHEETS_ID` | ID between `/d/` and `/edit` in the spreadsheet URL |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service-account email that has Editor access to the private sheet |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Private key from the service-account JSON; use literal `\n` separators in Vercel |
| `OPERATOR_EMAIL` | Single dashboard sign-in email |
| `OPERATOR_PASSWORD_HASH` | Scrypt value produced by `npm run auth:hash` |
| `OPERATOR_SESSION_SECRET` | Independent random secret of at least 32 characters |
| `ORDER_ACCESS_SECRET` | Independent random secret used for private customer order access |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys produced by `npm run vapid:generate` |
| `VAPID_SUBJECT` | Contact URI such as `mailto:owner@example.com` |
| `PUBLIC_CONTACT_EMAIL` | Optional public restaurant contact address |

Generate the two application secrets independently, for example with `openssl rand -base64 32`. Generate the operator hash locally:

```bash
npm run auth:hash
```

The reusable password is not stored in source, the spreadsheet, or browser storage.

## Spreadsheet layout

`npm run sheets:setup` creates five tabs and freezes their header rows:

- **Orders** — one complete immutable order snapshot per row, plus current fulfillment/payment state and readable item summary.
- **Menu** — seeded item IDs plus the customer-facing name, category, price, and availability. IDs must remain unchanged. Edits made through Operator Settings advance `catalog_revision` automatically.
- **Settings** — one restaurant configuration row, including business details, hours, policies, approvals, and the ordering switch.
- **PushSubscriptions** — enrolled operator devices and last push result. Treat endpoints and keys as private operational data.
- **LoginAttempts** — hashed client identifiers used to throttle operator sign-in attempts.

The setup command is safe to run again: it repairs headers and fills Menu/Settings only when their data rows are empty. It does not erase orders.

## Owner workflow

1. Visit `/operator/login` and sign in with `OPERATOR_EMAIL` and the password used to generate the hash.
2. Open **Edit Menu** to review names, categories, prices, and availability. Open **Settings** to confirm restaurant details, hours, preparation times, policies, approvals, and the ordering switch.
3. Return to **Pickup orders**. New orders appear within five seconds and can also trigger a push alert.
4. Move each order through New → Preparing → Ready for pickup → Completed, or Cancelled. Mark payment received separately when the customer pays at the store.
5. Open **Notifications**, enable each operator device, and send a test alert. Browser permission and HTTPS are required. On iPhone/iPad, install the site to the Home Screen before enabling push.

The Google Sheet is the fallback operational view if browser push is unavailable. Push failure never removes an order.

## Vercel deployment

1. Push the repository and create a Vercel project.
2. Add all production environment variables. Paste the Google private key with escaped `\n` line breaks.
3. Share the production spreadsheet with the production service-account email.
4. Run `npm run sheets:setup` locally with the production Sheets variables or through a trusted administrative environment.
5. Deploy, sign in to `/operator/settings`, finish owner review, and enable ordering.
6. Enroll and test every device that should receive order alerts.

No OAuth callback, payment webhook, email domain, Redis instance, PostgreSQL server, or scheduled function is required. Google Sheets and browser push services enforce their own quotas. Vercel and Google may change free-tier limits independently.

## Security and privacy

- The spreadsheet and Google credentials stay server-only. Never make the order sheet public.
- Operator sessions are signed, eight-hour, HttpOnly, Secure in production, and SameSite cookies. Every operator API checks the session.
- Customer order details require a high-entropy, order-scoped private link token or its corresponding HttpOnly cookie. The human-readable order number is not authorization.
- Mutation endpoints validate the request origin and all input with Zod.
- Customer name, email, phone, notes, and receipt are personal information. Configure a retention period and periodically remove expired records according to the approved privacy policy.
- Push lock-screen text contains only the order number, not customer information.

Google Sheets does not offer database transactions or uniqueness constraints. The application uses deterministic order identity, checkout-attempt reuse, logical deduplication, and update timestamps, but it cannot provide the same concurrent-write guarantees as PostgreSQL. This tradeoff is suitable only for the expected low-volume, single-location workflow.

## Updating the menu

The source catalogue is [`heart-of-india-menu.json`](./heart-of-india-menu.json). `npm run sheets:setup` seeds all 80 items into the Menu tab. In **Operator → Edit Menu**, the owner can search and edit each existing item's customer-facing name, category, CAD price, and availability. The server uses those Sheet values as the trusted catalogue and advances `catalog_revision` after every dashboard edit. Valid availability values are:

- `requires_owner_confirmation`
- `available`
- `unavailable`

Do not change item or option IDs after launch. Required choices, new products, and product removal still require a deliberate JSON/code change and testing. Use `unavailable` when an existing item should temporarily stop accepting orders. If you edit the Sheet directly instead of using the dashboard, increment `catalog_revision` in Settings manually.

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

The automated browser suite uses an explicitly test-only in-memory Sheets adapter. Production builds cannot activate that adapter. A real Google Sheets and Web Push smoke test requires the owner's external credentials and an HTTPS deployment.

## Remaining owner decisions

See [`docs/owner-review.md`](./docs/owner-review.md) for the facts and wording that still require confirmation before enabling ordering.

For the complete production setup, credential, deployment, notification, and launch procedure, follow [`docs/go-live-setup-guide.md`](./docs/go-live-setup-guide.md).
