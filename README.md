# Heart of India online ordering

A production-oriented pickup ordering site for Heart of India in Brampton, Ontario. It uses Next.js App Router, TypeScript, Tailwind CSS, PostgreSQL/Drizzle, Stripe-hosted Checkout, Resend, Auth.js, and Upstash rate limiting, and is configured for Vercel in `yul1`.

The site intentionally launches in **browse-and-cart preview mode**. Live checkout stays disabled until the owner approves the menu, opening hours, cutoff, preparation estimate, tax treatment, and policies and all production services are configured.

## What is implemented

- Responsive Home, Menu, About, Cart, Checkout, confirmation, privacy, and ordering/refund pages
- One data-driven catalogue for all 80 supplied menu entries and eight categories
- Required radio choices for Saag and both curry combos
- Versioned, non-sensitive local cart persistence with an in-memory fallback
- Server-authoritative Zod validation, catalogue lookup, integer-cent totals, per-item tax profiles, availability, quantity limits, and signed five-minute quotes
- Pickup-hours enforcement in `America/Toronto`, including date overrides, daylight-saving-aware time calculations, and a closing cutoff
- A pending immutable order and line snapshot written to PostgreSQL before redirecting to Stripe Checkout
- Raw-body Stripe signature verification, amount/currency checks, idempotent paid transitions, unique payment identity constraints, and duplicate/out-of-order event handling
- Durable restaurant/customer email outbox with locks, exponential backoff, attempt history, provider IDs, and Resend idempotency keys
- Auth.js operator access using Resend email links and optional Google OAuth, restricted to a server-only email allowlist
- Paid-order recovery view and failed-notification retry action
- Shared Upstash rate limits for quote, checkout, status, and operator-auth endpoints
- CSP and security headers, guest order access via a 256-bit HTTP-only token, metadata, sitemap, robots, manifest, and structured data after operational approval
- Read-only WebMCP menu tools plus local-cart add; no tool can create a payment

## Local setup

1. Install Node.js 22 or newer and run:

   ```bash
   npm install
   cp .env.example .env.local
   ```

2. Start PostgreSQL locally or create a managed database. The included Compose file uses PostgreSQL 17:

   ```bash
   docker compose up -d
   npm run db:migrate
   npm run db:seed
   ```

3. Start the app:

   ```bash
   npm run dev
   ```

Without credentials or PostgreSQL, the public site remains fully browsable and the cart remains usable. The quote endpoint uses the checked-in catalogue and returns an explicit checkout blocker. It does not simulate a database, payment, or email success.

## Environment variables

Use [.env.example](./.env.example) as the source list. All integration values are server-only; no secret may use a `NEXT_PUBLIC_` prefix.

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Exact public origin, with HTTPS in production |
| `DATABASE_URL` | Pooled PostgreSQL connection; use the Supabase pooler for Vercel functions |
| `AUTH_SECRET` | At least 32 random bytes for Auth.js |
| `OPERATOR_EMAILS` | Comma-separated, lowercased operator allowlist |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional second operator sign-in provider |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Verified-domain transactional sender |
| `ORDER_NOTIFICATION_EMAIL` | Fixed restaurant order recipient; never accepted from the browser |
| `PUBLIC_CONTACT_EMAIL` | Owner-supplied public contact value for configuration/reference |
| `STRIPE_SECRET_KEY` | Test or live Stripe server key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the environment’s webhook endpoint |
| `QUOTE_SIGNING_SECRET` | Separate random secret for short-lived price quotes |
| `CRON_SECRET` | Vercel Cron bearer secret |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Persistent, shared serverless rate limiting |

Generate independent secrets for preview and production. Keep Stripe test and live keys, webhooks, databases, Resend configuration, and Upstash instances separated by environment.

## Database and catalogue

Drizzle schema lives in [`db/schema.ts`](./db/schema.ts), generated migrations in [`drizzle/`](./drizzle/), and the idempotent initial seed in [`scripts/seed.ts`](./scripts/seed.ts).

```bash
npm run db:generate   # after an intentional schema change
npm run db:migrate
npm run db:seed
```

The seed updates transcribed public fields while preserving existing availability and tax assignments. After a price/catalogue change, increment `restaurant_settings.catalog_revision`; a cart with an older signed quote receives HTTP 409 and must show the new quote for acknowledgement.

Tax is deliberately unseeded. Create owner-approved `tax_profiles` records with integer basis points, Stripe Tax Rate IDs, and the correct inclusive/exclusive flag, then assign every orderable item’s `tax_profile_id`. A 13% rate is stored as `1300`; do not add it until the owner/accountant confirms the treatment. The live-order gate rejects missing assignments.

Menu availability supports `requires_owner_confirmation`, `available`, and `unavailable`. The operator settings form can approve the initially transcribed catalogue in bulk; individual later changes should update `menu_items.availability`, bump the catalogue revision, and be reviewed before enabling ordering.

Business name, tagline, phone, address, public email, weekly hours JSON, cutoff, preparation range, retention period, policies, approvals, and the ordering-enabled switch are editable in `/operator/settings`. The checked-in preview defaults remain in [`data/restaurant-config.json`](./data/restaurant-config.json).

## Stripe test and live setup

1. Use a Stripe **test-mode** secret key.
2. Forward local events with the Stripe CLI:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

3. Put the CLI-provided signing secret in `STRIPE_WEBHOOK_SECRET`.
4. Exercise successful card payment, decline, browser Back/cancel, session expiry, duplicate webhook delivery, and closing the browser immediately after payment. The confirmation page polls the authorised backend; it never infers payment from the success URL.
5. For production, register `https://YOUR_DOMAIN/api/stripe/webhook` and subscribe to:

   - `checkout.session.completed`
   - `checkout.session.expired`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`

Only immediate card payment is enabled initially. Do not add delayed payment methods until their operational handling is reviewed. Replace test keys with live keys only after the owner launch checklist is complete.

## Resend and durable notifications

Verify a sender domain in Resend, set `RESEND_FROM_EMAIL` to an address on that domain, and set the restaurant recipient only in `ORDER_NOTIFICATION_EMAIL`.

The verified Stripe webhook inserts both notification jobs in the same transaction as the paid transition. It then awaits a small immediate delivery batch. Vercel Cron calls `/api/cron/notifications` every minute and authenticates with `CRON_SECRET`. Failed jobs back off up to one hour, stale locks recover after ten minutes, and terminal failures remain in PostgreSQL. The operator order view shows delivery status and retries failed/terminal jobs. External email delivery is idempotent where Resend supports it, but the system does not promise exactly-once delivery.

Monitor:

- Stripe webhook delivery failures and retries
- Vercel function/cron errors
- `notification_outbox` rows in `failed` or `terminal` state
- the authenticated `/operator/orders` recovery view

An email outage never rolls back a paid order. A database failure returns a non-2xx webhook response so Stripe can retry.

## Operator authentication

The primary flow is a Resend email magic link; Google OAuth is an optional backup. Auth.js stores database sessions and verification tokens in PostgreSQL. Every protected page and retry/settings mutation calls the server-side allowlist check. Configure at least one provider and ensure its callback URL is registered for each environment.

## Vercel deployment

1. Import the repository into Vercel and select the Next.js framework preset.
2. Use a Pro plan if retaining the approved every-minute Cron schedule in [`vercel.json`](./vercel.json). The preferred function region is Montreal (`yul1`).
3. Attach a Supabase PostgreSQL project created in Canada Central through Vercel Marketplace, or provide another managed PostgreSQL URL.
4. Add every production environment variable listed above. Add separate preview values.
5. Run migrations and the seed against each environment before accepting traffic.
6. Deploy, register the final Stripe webhook, configure Auth.js OAuth callbacks, and verify the Resend sender domain.
7. Sign into `/operator/settings`, complete the owner review, assign tax profiles, and enable ordering only after every readiness condition passes.

Vercel, Supabase, Upstash, Stripe, Resend, and an email/domain provider are separate services with their own plan or usage costs. Stripe also charges payment-processing fees. The every-minute durable worker is the main reason this project assumes Vercel Pro. Review current provider pricing before launch.

## Privacy, retention, and deletion

The application stores customer name, email, phone, optional notes, an immutable receipt, and non-sensitive payment references. Card data goes directly to Stripe. Local browser storage contains menu item IDs, choices, quantities, and display prices only; checkout contact fields are not stored there.

Set an owner-approved `retention_days`. Until an automated retention job is added, the operator must run a documented database procedure to anonymise expired customer fields while retaining legally required accounting totals and payment references, and handle verified access/deletion requests through the confirmed public contact email. This is a launch decision recorded in [`docs/owner-review.md`](./docs/owner-review.md), not a claim that a policy has already been approved.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run test:confirmation # requires DATABASE_URL and a running app
npm run build
node scripts/visual-qa.mjs
```

The automated suite checks the 80-item seed, category counts, CAD formatting, required/invalid options, quantity/request limits, quote tampering, hours/cutoff logic, search, cart persistence, cart choice retention, the preview checkout gate, 320px overflow, dialog dismissal, and exact focus restoration. The 32 browser tests run in Chromium, Firefox, Playwright WebKit, and mobile Chromium. A separate pass used real macOS Safari’s accessibility tree for menu search, required Goat selection, add-to-cart feedback, focus restoration, and cart review. Visual QA covers the requested phone, tablet, short landscape, laptop, desktop, and wide-screen viewports and writes screenshots to `artifacts/screenshots`.

The suite was also exercised against local PostgreSQL, including public availability changes, unavailable-item rejection, duplicate and concurrent paid webhooks, one-time paid transitions, durable outbox creation, and rollback of a mismatched Stripe amount. Real Stripe Checkout, Resend delivery, Upstash, Auth.js providers, managed production PostgreSQL, Vercel Cron, and physical mobile browsers require the owner’s external credentials and production configuration. Do not report those external integrations as exercised until the relevant services are connected.

## Owner decisions still required

See [`docs/owner-review.md`](./docs/owner-review.md). At minimum: public and notification emails, current hours, cutoff, pickup estimate, every item’s price/availability/tax treatment, any fee, final policies, retention duration, restaurant story/photos, operator addresses, and confirmation of the transcribed name, phone, address, and ambiguous Thali wording.
