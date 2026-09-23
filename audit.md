# Heart of India website audit

Audit date: September 23, 2026  
Scope: current local Next.js application, public ordering flow, operator workflow, Google Sheets persistence, Web Push, security controls, responsive layouts, accessibility, and failure handling.  
Change policy: this audit did not change application code or production data. Adversarial order and menu-mutation checks ran against the test-only in-memory adapter. The configured Google Sheet was checked with read-only menu and quote requests.

## Remediation update — September 23, 2026

The three findings originally rated **High** have been addressed in the implementation:

- **H-01:** checkout now requires a short-lived HMAC-signed quote token bound to the complete server quote, including item IDs, line IDs, options, quantities, catalogue revision, totals, and orderability. A changed same-price cart receives `409` and a fresh quote.
- **H-02:** order creation and status changes now append immutable mutation rows. Canonical row-order conflict resolution prevents duplicate create notification work and last-writer overwrites; conflicts are reported to the operator. Persistent rate-limit accounting now appends one uniquely identified event per request.
- **H-03:** order rows are schema-validated. Malformed rows are returned as safe diagnostics with Sheet row numbers and shown in the authenticated order dashboard instead of disappearing silently.

The original findings below remain as the audit record and explain the pre-remediation failure modes.

## Executive summary

The normal ordering path is in good shape. The server resolves trusted catalogue data, validates item and option IDs, calculates money in integer cents, protects operator routes, scopes customer order access with a high-entropy token, and fails closed when durable storage is unavailable. The current configured catalogue returned 80 items and a valid orderable quote. The normal automated suite, build, and dependency audit pass.

The adversarial review found three high-priority integrity risks and several realistic edge cases that the normal suite does not cover:

1. A stale checkout quote can authorize a different same-priced cart than the receipt the customer reviewed.
2. Google Sheets cannot make order creation and status changes atomic; concurrent requests can duplicate notification work or overwrite a newer status.
3. A malformed order row is silently removed from the operator dashboard instead of being surfaced as an operational error.

The most important customer-facing problems after those are inconsistent availability controls, overnight-hours handling, malformed local cart data, cross-tab cart loss, and an operator mobile cart bar that can cover order controls.

### Severity guide

- **High:** can cause the kitchen to receive a different order than the customer reviewed, duplicate operational work, or hide a recorded order.
- **Medium:** blocks ordering, loses edits/state, misstates operating behaviour, or creates a significant accessibility or operational problem in a realistic edge case.
- **Low:** limited-scope usability, accessibility, hardening, or maintainability concern.

## High-priority findings

### H-01 — The accepted quote is not bound to the cart lines the customer reviewed

**Status:** Remediated on September 23, 2026. See the remediation update above.

**Where**

- `components/checkout-client.tsx:23-55`
- `lib/server/orders.ts:35-41`

**When it occurs**

The checkout already has a valid quote, the cart changes, and the replacement quote fails or races with an older request. If the new cart happens to have the same total and catalogue revision as the old cart, the Place order button becomes enabled with the old receipt still displayed. The server compares only `acceptedCatalogRevision` and `acceptedTotalCents`; it does not compare the accepted line snapshot or a cart digest.

**Observed result**

This was reproduced with Roti and Gulab Jamun, which have the same price. The checkout displayed `1 × Roti`, local storage contained only Gulab Jamun, the forced refresh quote failed, and the enabled Place order button created a Gulab Jamun order. The server correctly priced the submitted cart, but it did not prove that this was the cart shown in the accepted quote.

**Impact**

The kitchen can prepare a different dish from the receipt the customer believed they submitted. The current pay-at-store model limits financial harm, but this is still an order-integrity failure.

**How to fix it**

1. Compute a canonical cart fingerprint from item IDs, option IDs, line IDs, and quantities.
2. Return that fingerprint in the quote, or return a short-lived signed quote token containing the canonical line snapshot, total, and catalogue revision.
3. Clear the existing quote synchronously as soon as the cart fingerprint changes.
4. Enable submission only when the displayed quote fingerprint exactly matches the current cart fingerprint.
5. Require the server to verify the signed quote or exact canonical fingerprint, not only the total and revision.
6. Add request sequence IDs so an aborted older quote cannot clear the loading state or replace a newer result.

### H-02 — Google Sheets cannot enforce atomic order idempotency or status updates

**Status:** Remediated within the current Sheets architecture on September 23, 2026. Mutations are append-only and deterministically resolved; the database-upgrade caveat still applies at higher scale.

**Where**

- `lib/server/orders.ts:35-55`
- `lib/server/sheets.ts:340-376`
- `lib/server/sheets.ts:408-423`

**When it occurs**

- Two requests with the same checkout attempt reach different serverless invocations before either append is visible.
- Two operator windows update the same order from the same `updatedAt` value at nearly the same time.
- Two login attempts update the same rate-limit row concurrently.

The code performs read-check-write sequences. Google Sheets offers no unique constraint, row lock, compare-and-swap, or transaction across those operations.

**Impact**

- The same deterministic order ID can be appended twice and trigger duplicate push attempts. The dashboard later deduplicates the display, which can hide the underlying duplicate rows.
- Concurrent order status changes can both pass the timestamp check, with the last write silently overwriting the first.
- Concurrent rate-limit increments can be lost, weakening login throttling.

**How to fix it**

The robust fix is a transactional data store with unique constraints on order ID and attempt ID, plus conditional updates on a version column. If Google Sheets must remain the only store, route all mutations through one serialized lock service or an Apps Script endpoint using `LockService`, keep an append-only operation ledger, make notification delivery idempotent by order ID, and explicitly surface duplicate/conflict recovery in the operator UI. Document that this remains weaker than a database under serverless concurrency.

### H-03 — Invalid order rows silently disappear from the operator dashboard

**Status:** Remediated on September 23, 2026. Invalid rows are quarantined into authenticated dashboard diagnostics.

**Where**

- `lib/server/sheets.ts:208-241`
- `lib/server/sheets.ts:340-347`

**When it occurs**

A spreadsheet row has an invalid or manually edited fulfillment/payment status. `parseOrder` returns `null`, and `listOrders` filters the row out. Malformed JSON fields such as `lines_json` also fall back to empty data instead of producing a visible quarantine error.

**Impact**

A real customer order can vanish from the dashboard while remaining in the Sheet. Staff may miss it, and the dashboard gives no count or warning that a row was rejected.

**How to fix it**

Return parsed rows and validation failures separately. Show an authenticated dashboard alert with the affected Sheet row numbers and a safe summary, log the failure, and keep the raw row available for operator recovery. For an active order with malformed receipt data, fail visibly instead of rendering an empty order. Add a Sheet validation rule for status columns, but do not rely on it as the only guard.

## Medium-priority findings

### M-01 — Non-orderable items can still be added to the cart

**Where**

- `components/menu-client.tsx:71-84`
- `components/item-dialog.tsx:18-28`
- `components/webmcp-tools.tsx:21`
- `components/cart-provider.tsx:55-69`

**When it occurs**

- An item is `requires_owner_confirmation`: the card still shows Add or Choose.
- An item is `unavailable`: the card button is disabled, but its separate detail trigger opens an enabled Add to Cart action.
- The WebMCP cart tool rejects only `unavailable`, not `requires_owner_confirmation`.

**Observed result**

Both UI paths were reproduced. Chicken Pakora in confirmation-required state added from the card; in unavailable state it added from the detail dialog. Checkout later rejected both, so the server remains authoritative.

**How to fix it**

Create one shared `isOrderableItem(item)` predicate requiring `availability === "available"`. Apply it in menu cards, detail dialogs, cart editing, WebMCP tools, and the cart provider. Keep details viewable, but replace Add with a clear disabled state and explanation. Reconcile existing carts when availability changes.

### M-02 — Overnight hours are closed incorrectly after midnight, and equal times mean an implicit 24-hour interval

**Where**

- `lib/server/hours.ts:14-29`
- `components/operator-settings-form.tsx:13-24`
- `lib/server/public-settings.ts:10-13`

**When it occurs**

- Friday is configured as 17:00–02:00 and the customer orders at 01:00 Saturday. The code checks only Saturday's intervals, so it misses Friday's overnight carry-over.
- The operator sets any equal opening and closing time, such as 11:00–11:00. The backend treats it as a 24-hour interval, while the public display shows `11:00–11:00`; only `00:00–00:00` is labelled “Open 24 hours.”

**Observed result**

A Friday 17:00–02:00 interval returned closed at Saturday 01:00 in America/Toronto.

**How to fix it**

Evaluate both the current day's intervals and the previous day's intervals that roll past midnight. Add an explicit 24-hour control, reject other equal-time intervals, and validate that the cutoff does not consume the entire service window. Add tests around midnight, weekly boundaries, date overrides, and both daylight-saving transitions.

### M-03 — Stale operator forms can overwrite newer menu or settings changes

**Where**

- `app/api/operator/menu/route.ts:8-34`
- `components/operator-menu-editor.tsx:25-73`
- `app/api/operator/settings/route.ts:25-47`
- `components/operator-settings-form.tsx:11-24`

**When it occurs**

Two operator tabs load the same item or settings. Tab A saves one field; tab B then saves a different field from its stale full-object form.

**Observed result**

Both menu PATCH requests returned 200. Tab B's price change silently restored Tab A's renamed dish to the old name.

**How to fix it**

Include `expectedUpdatedAt` or catalogue revision in every menu/settings mutation. Reject stale writes with 409, return the current server value, and let the operator reload or intentionally merge. For menu changes, update the item row and catalogue revision as one serialized operation.

### M-04 — Corrupt local cart data can crash every page that renders the cart

**Where**

- `components/cart-provider.tsx:19-25`
- `lib/cart.ts:34-40`
- `components/cart-drawer.tsx:21`
- `components/cart-page-client.tsx:16`

**When it occurs**

Browser storage contains a structurally invalid line that passes the shallow checks, for example `selections: null`, a missing display name, or an invalid unit price. This can result from an older release, an extension, manual storage editing, or partial data corruption.

**Observed result**

A Saag line with `selections: null` passed hydration and crashed the cart with `Cannot read properties of null (reading 'protein')`, leaving the global error page on every reload until storage is manually cleared.

**How to fix it**

Validate the complete stored-cart shape with Zod, including UUIDs, known item IDs, selection records, strings, non-negative integer prices, and bounds. Migrate known older versions and discard only invalid lines. The error recovery screen should offer a deliberate “Clear damaged cart” action.

### M-05 — New-order notifications are best effort and have no durable retry state

**Where**

- `lib/server/orders.ts:52-55`
- `lib/server/push.ts:16-43`
- `components/notification-settings.tsx:23-55`

**When it occurs**

The order is stored but the serverless invocation ends, Google Sheets cannot read subscriptions, the push provider times out, or all subscribed devices are offline/expired. Per-device failures are sometimes recorded, but there is no durable order-level notification job and no retry queue. If the dashboard is closed, five-second polling cannot alert staff.

There is also a subscription reconciliation edge: the browser can successfully create a push subscription but the Sheet POST can fail. On reload, the UI sees the browser subscription and reports “subscribed,” although the server has no record and cannot notify it.

**Impact**

The order is durable, but “instant” notification is not guaranteed. Staff must keep the dashboard open or monitor the Sheet.

**How to fix it**

Without adding a paid service, store notification state on the order or in a Sheet outbox and retry pending work whenever the operator dashboard polls or opens. Add an operator-visible last attempt/error/retry action. Reconcile the browser subscription with the server on page load, and make the test result say “accepted by push service” until delivery/display is confirmed. For stronger guarantees, use a durable queue later.

### M-06 — The retention setting records a promise but does not delete customer data

**Where**

- `components/operator-settings-form.tsx:24`
- `app/api/operator/settings/route.ts:14-45`
- `data/restaurant-config.json` retention policy text
- `docs/go-live-setup-guide.md:545-555`

**When it occurs**

Orders become older than `retentionDays`. Nothing in the application reads that setting to delete or de-identify rows. The public policy says records are normally retained for up to 365 days, while the setup guide relies on a manual owner process.

**How to fix it**

Either implement a protected operator cleanup screen that lists eligible rows and requires explicit confirmation, or create an automated deletion process if the owner later accepts scheduling. Until then, make the manual process, responsible person, review interval, and evidence log part of launch operations, and ensure the policy matches the actual practice.

### M-07 — Tax treatment is hard-coded to 13% HST for every item

**Where**

- `app/api/operator/settings/route.ts:43-45`
- `lib/server/quote.ts:54-57`
- `components/operator-settings-form.tsx:24`

**When it occurs**

Any item, price band, or future rule needs different treatment, or the owner/accountant confirms tax-inclusive pricing. Every settings save resets the configuration to 13%, exclusive, and every item is taxed identically.

**How to fix it**

Confirm treatment with the owner's accountant before launch. Add operator-managed tax configuration and a trusted tax class per item if treatment differs. Store the applied tax class/rate in each immutable order line snapshot. Keep calculation in integer cents and require acknowledgement when a quote changes.

### M-08 — The customer cart bar appears over the mobile operator dashboard

**Where**

- `components/mobile-cart-bar.tsx:8-12`
- `app/layout.tsx:26`

**When it occurs**

The same browser has a non-empty customer cart and then signs into an `/operator` route on a mobile viewport. The cart bar is hidden on cart, checkout, and order-status routes, but not operator routes.

**Observed result**

At 390px, “View Cart” covered the first order's notes/status area and introduced an unrelated customer action into the protected workflow.

**How to fix it**

Do not render the mobile cart bar on `/operator` or `/operator/*`. Prefer an allowlist of storefront browsing routes. Add an end-to-end test with a populated cart before operator login.

### M-09 — Enlarged text creates page-level horizontal scrolling on the menu

**Where**

- `app/globals.css:267-270` (`.menu-section-head` and `.menu-count`)
- responsive category layout around `app/globals.css:316-318`

**When it occurs**

At a 320px viewport with 200% root text size, several category item-count labels extend beyond the viewport. The document width measured 336px. The category chip strip's own horizontal scrolling is intentional; the page-level overflow is not.

**How to fix it**

Allow the section header to wrap or stack, set `min-width: 0` on the title block, and keep the count inside the available width. Retest all pages at 200% zoom and enlarged text, including overlay actions and operator navigation.

### M-10 — A category URL or refresh marks the category active without revealing it

**Where**

- `components/menu-client.tsx:12-18`
- `components/menu-client.tsx:39-65`

**When it occurs**

The customer loads or refreshes `/menu?category=special-combos`. The active state initializes to Special Combos, but no initial scroll occurs.

**Observed result**

At both 390px and 1440px, scroll position remained zero, Special Combos was styled active, and its section began thousands of pixels below the viewport.

**How to fix it**

After hydration, scroll an explicitly requested valid category into view once, accounting for the real sticky header/chip height and reduced motion. Do not run this for the default category or while a search query is active. Add refresh and direct-link tests.

### M-11 — Cart editing uses the checked-in seed while the menu uses live Sheet data

**Where**

- `components/cart-drawer.tsx:8-21`
- `components/cart-page-client.tsx:8-16`
- `lib/menu.ts:13-21`

**When it occurs**

The operator changes a dish name or price after a cart was created. The public menu receives the live Sheet catalogue, but cart details and edit dialogs look up the static seed. Editing a required-choice line can put the old name and price back into the local display until checkout replaces it with the trusted server quote.

**How to fix it**

Provide the live public catalogue through one shared provider or fetch it for cart pages. Reconcile persisted line snapshots against current catalogue data while preserving selected option IDs. Clearly flag changed/unavailable items before checkout.

### M-12 — Two browser tabs can overwrite each other's cart

**Where**

- `components/cart-provider.tsx:38-53`

**When it occurs**

Two tabs hydrate the same cart, then each changes it. There is no `storage` event or `BroadcastChannel` synchronization, so the most recent writer replaces the other tab's cart.

**Observed result**

Tab A added Water and tab B added Roti. Reloading tab A showed only Roti; Water was lost.

**How to fix it**

Store a revision and updated timestamp, listen for cross-tab changes, and merge by line identity/selection key. A `BroadcastChannel` can provide immediate updates, with the storage event as fallback. Test simultaneous additions, removals, and quantity changes.

### M-13 — Customer status polling stops after a transient failure

**Where**

- `components/order-status-client.tsx:44-60`

**When it occurs**

Any scheduled status request fails after the page is running. The next timeout is created only after a successful response; the catch path displays Try again but schedules no retry. A production customer can remain on stale status until manually reloading. A completed/cancelled page also stops forever even if an operator later reverses that status.

**How to fix it**

Keep the last successful order visible, retry failures with capped exponential backoff, and refresh on window focus/visibility recovery. Stop only after an explicit expiry or a terminal state that the operator workflow cannot reverse.

### M-14 — One malformed optional environment value disables all parsed configuration

**Where**

- `lib/server/env.ts:4-25`

**When it occurs**

Any value in the single Zod object is invalid, such as a mistyped optional public email, invalid `APP_URL`, or bad `VERCEL_ENV`. `safeParse` fails and exports `{}`, making Sheets, operator auth, order access, and push all appear unconfigured without identifying the bad field.

**How to fix it**

Fail startup with a redacted, field-specific configuration error for required production values, or parse independent optional groups so an invalid VAPID value does not erase Sheets/auth configuration. Expose a protected readiness screen with missing/invalid variable names only.

### M-15 — The settings UI cannot configure split hours or date overrides

**Where**

- `components/operator-settings-form.tsx:11-24`
- `app/api/operator/settings/route.ts:7-20`
- `lib/server/hours.ts:16`

**When it occurs**

The restaurant has lunch/dinner intervals, a holiday closure, or a special opening date. The data model accepts up to three intervals and date overrides, but the UI edits only the first interval and sends no date overrides.

**How to fix it**

Add interval add/remove controls per day and a dated exception editor. Preserve existing overrides in the PUT payload. Validate overlaps, overnight spans, equal times, and cutoff feasibility.

### M-16 — Re-approving the menu can publish items intentionally left for confirmation

**Where**

- `app/api/operator/settings/route.ts:33-44`
- `lib/server/sheets.ts:326-338`

**When it occurs**

The owner unchecks menu approval, marks a specific item `requires_owner_confirmation`, then rechecks approval. The approval action converts every confirmation-required item to `available`.

**How to fix it**

Separate the one-time seed migration from the ongoing approval flag. Never bulk-change explicit item availability during a later reapproval. Require a review screen that lists all remaining confirmation-required items before approval.

### M-17 — The UI allows carts that the server will always reject

**Where**

- `components/cart-provider.tsx:55-87`
- `lib/server/quote.ts:10-18`
- `components/webmcp-tools.tsx:21`

**When it occurs**

The customer builds more than 30 distinct lines or 50 total items. Local controls enforce only 20 per line. The cart appears valid until checkout rejects it. The WebMCP tool can also report an incorrect item count when an existing line is capped at 20.

**How to fix it**

Apply the same line and total limits in the cart provider, disable increases at the global limit, and announce why. Return the actual post-update count from cart mutations. Keep the server checks as the authoritative backstop.

### M-18 — Operator order history is capped without pagination or search

**Where**

- `lib/server/orders.ts:68`
- `components/operator-dashboard.tsx:40-56`

**When it occurs**

The Sheet exceeds 500 orders. Only the newest 500 are returned, regardless of whether an older order is still active. Staff also have no search by order number, customer, or date, so investigation becomes slow well before that limit.

**How to fix it**

Never omit active orders. Add server-side paging, status/date filters, and search. Consider a separate active-order index if Sheets remains the store. Display that history is paged rather than silently capped.

### M-19 — Rate limiting is not consistently shared or atomic

**Where**

- `lib/server/security.ts:7-32`
- `lib/server/sheets.ts:408-423`

**When it occurs**

Quote and status limits run in per-instance memory and reset when a serverless instance changes. Login/order limits use Sheets, but concurrent read-modify-write calls can lose increments. IP identity relies on forwarded headers without platform-specific trust handling.

**How to fix it**

Use one shared atomic limiter for sensitive endpoints, or accept and document the weaker protection while adding account lockout alerting. Use the deployment platform's trusted client-IP semantics. Keep login failure messages generic.

## Low-priority findings

### L-01 — Phone validation accepts arbitrary text

**Where:** `components/checkout-client.tsx:12-18` and `lib/server/orders.ts:10-16`.  
**When:** a value has 7–30 characters but no usable telephone number.  
**Fix:** allow common Canadian formatting and extensions, but require a sensible count of digits on both client and server.

### L-02 — Some validation errors are not programmatically associated with their controls

**Where:** `components/checkout-client.tsx:57` and `components/item-dialog.tsx:24-28`.  
**When:** notes exceed the limit or a required radio group is submitted empty. The notes error has no ID in `aria-describedby`; the radio error is not referenced by the group.  
**Fix:** give each error a stable ID, include help plus error IDs in `aria-describedby`, and set required semantics on the radio group.

### L-03 — The CSP still permits inline scripts and styles

**Where:** `next.config.ts:10-23`.  
**When:** an unrelated injection bug appears. `'unsafe-inline'` reduces CSP's ability to contain it.  
**Fix:** adopt nonces/hashes supported by the current Next.js version, test Next/font and structured data under the stricter policy, and keep `object-src 'none'`, `base-uri 'self'`, and `frame-ancestors 'none'`.

### L-04 — Status changes are freely reversible and have no audit trail

**Where:** `components/operator-dashboard.tsx:46-56`, `lib/server/orders.ts:70-76`.  
**When:** staff accidentally move Completed back to New, toggle Paid back to Unpaid, or cancel an order. The latest row overwrites the prior state, with no reason or history. Customer polling also stops on terminal states.  
**Fix:** define allowed transitions, confirm cancellation/payment reversal, and append status history with timestamp and operator identity.

### L-05 — The public About page contains launch-placeholder copy

**Where:** `app/about/page.tsx:9`.  
**When:** any customer opens About Us. It says the owner's story/photos “will be added here after review,” which reads as unfinished production content.  
**Fix:** remove the placeholder until owner material exists or replace it with confirmed neutral restaurant information.

### L-06 — The home page describes the order as “secure” without explaining the claim

**Where:** `app/page.tsx:24`.  
**When:** every home-page visit. The site has meaningful controls, but broad security wording is difficult to guarantee.  
**Fix:** use “pickup order” or a concrete statement such as “prices and availability are checked before your order is recorded.”

### L-07 — Order-number dates use UTC rather than Toronto time

**Where:** `lib/server/orders.ts:27-30`.  
**When:** an order is placed in the Toronto evening after the UTC date has advanced. The `HOI-YYMMDD` portion can look like the next local day.  
**Fix:** generate the date stamp in `America/Toronto`, while keeping `createdAt` as UTC ISO time.

### L-08 — Storage fallback is silent

**Where:** `components/cart-provider.tsx:38-53` and the unused `storageAvailable` value.  
**When:** localStorage is blocked or full. The in-memory cart works for the tab but will disappear on refresh without explanation.  
**Fix:** show a small non-blocking notice that the cart is temporary, while retaining the usable in-memory fallback.

### L-09 — Public fallback data is silent during a Sheets outage

**Where:** `lib/server/public-menu.ts:8-10` and `lib/server/public-settings.ts:5-8`.  
**When:** Sheets read fails. Public pages silently show checked-in fallback names/prices/settings. Checkout fails closed, which is good, but browsing can look current when it is not.  
**Fix:** return degraded-state metadata and display a concise “menu may be temporarily out of date; ordering is paused” notice.

### L-10 — Menu API caching can expose recently disabled items for up to five minutes

**Where:** `app/api/menu/route.ts:3-5`.  
**When:** an operator disables an item and a cached/stale response is served, especially through the WebMCP tool. Checkout still rejects it.  
**Fix:** invalidate/version the public menu response after edits, shorten stale serving for availability, and retain the shared orderability check at add time.

### L-11 — Notification state can outlive operator sign-out

**Where:** `components/operator-nav.tsx:16-19`, `components/notification-settings.tsx:42-54`, and `public/sw.js`.  
**When:** an operator enables push on a shared device and signs out without disabling it. The device can continue showing new-order-number alerts.  
**Fix:** explain this clearly and offer “sign out and disable notifications on this device.” Keep notification bodies free of customer data.

### L-12 — VAPID subject validation is deferred until send time

**Where:** `lib/server/env.ts:15-17` and `lib/server/push.ts:9-13`.  
**When:** `VAPID_SUBJECT` is present but is not a valid `mailto:` or HTTPS contact URI. The UI reports push configured, then sends fail.  
**Fix:** validate the URI scheme during environment parsing and show a protected configuration error before enrollment.

## Controls that worked as intended

- All 80 source items are present once, with unique IDs, valid integer-cent prices, and the expected eight categories.
- Saag and both curry combos require and retain their supplied option IDs.
- Unknown items, invalid options, altered totals, excessive per-line quantities, missing guest tokens, unauthenticated operator calls, and cross-origin mutations are rejected server-side.
- Direct API checks returned 401 for operator data without a session, 401 for an order without its token, 403 for a mutation without an Origin header, and 400 for quantity 21.
- Prices, tax, and totals are calculated from trusted server catalogue data in integer cents.
- The order is stored before Web Push is attempted; a push outage does not erase the order.
- Guest order access uses a high-entropy order-scoped token in the URL fragment or a scoped HttpOnly cookie. The public order number is not authorization.
- Operator sessions are signed, HttpOnly, SameSite, eight-hour cookies and are Secure in production. Operator pages and APIs check the session.
- Customer inputs are rendered through React escaping, Sheet writes use RAW values, and no unsafe HTML rendering was found.
- Secrets remain server-only. `.env` and `.env.local` are ignored; only `.env.example` is tracked. No `NEXT_PUBLIC_` secret use was found.
- Security headers include HSTS in production, frame denial, MIME sniffing prevention, a restrictive permissions policy, and a CSP baseline.
- Reduced-motion mode removes entrance, pulse, drawer/dialog, and success animations while leaving content visible.
- Normal 320px rendering has no page-level overflow. Cart and item dialogs trap/restore focus in the tested flows.
- The current configured Google Sheet passed a read-only integration check: 80 items, all currently `available`, catalogue revision 2, and a Water quote of CA$1.13 with no blockers.
- `npm audit --omit=dev` reported zero production dependency vulnerabilities.

## Verification performed

### Automated checks

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — 25 tests passed across 9 files.
- `npm run build` — Next.js 16.3.5 production build passed.
- `npm run test:e2e` — 69 passed and 3 intentionally skipped. Projects: Chromium, Firefox, Playwright WebKit, and mobile Chromium emulation.
- `npm audit --omit=dev` — 0 vulnerabilities.

### Adversarial browser and API checks

- Stale same-total quote with a changed cart.
- Confirmation-required and unavailable item add paths.
- Malformed localStorage cart hydration.
- Cross-tab cart writes.
- Concurrent stale operator menu edits.
- Transient customer-status request behaviour.
- Category deep links and refresh behaviour.
- 320px mobile layout, 200% enlarged text, and reduced motion.
- Mobile operator dashboard with a pre-existing customer cart.
- Current screenshots inspected at 1440×900 and 390×844 for Home, Menu, Checkout, and operator orders.
- Actual configured Sheets catalogue and quote read in read-only mode. No real order, setting, menu, status, or notification mutation was made during this audit.

## Coverage limits

- Playwright WebKit is browser-engine automation, not a real Safari installation. No physical iPhone, iPad, Android phone, mobile keyboard, notch/safe-area hardware, or real mobile push delivery was available.
- No screen-reader software session was available. Keyboard/focus semantics were exercised through browser automation and static inspection.
- Real Web Push delivery, denied notification permission, expired subscriptions, iOS Home Screen installation, and operating-system notification suppression were not exercised.
- Real Google Sheets concurrent writes were not generated because that would mutate the owner's data. Concurrency findings come from the concrete read-check-write implementation and a test-adapter stale-edit reproduction.
- No production Vercel deployment, custom domain, HTTPS certificate, production service-worker lifecycle, or real-world network throttling was available.
- Tax and policy findings are implementation/configuration findings, not legal or accounting advice. The owner should confirm final treatment with appropriate professionals before live use.

## Recommended fix order

1. Bind checkout acceptance to the exact quoted cart and fix quote request races.
2. Apply one availability predicate everywhere items can enter or be edited in the cart.
3. Decide how much Google Sheets concurrency risk is acceptable; add serialized/idempotent mutation handling before relying on instant operations.
4. Validate stored cart data and hide the mobile cart bar throughout operator routes.
5. Correct overnight/equal-time hours and add date-override/split-hours controls.
6. Add conflict protection to menu/settings edits and surface invalid Sheet rows.
7. Add durable, visible push retry/reconciliation and an enforceable retention process.
8. Fix category deep links, enlarged-text overflow, client cart limits, and live catalogue reconciliation.
9. Address lower-risk accessibility, CSP, status-history, copy, and configuration hardening items.
