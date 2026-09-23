# Heart of India go-live setup guide

This guide explains what the owner needs to collect, where each value comes from, how to configure the production services, and how to verify the complete ordering workflow before opening it to customers.

The finished system works as follows:

1. A customer adds menu items and choices to the cart.
2. The customer enters their name, email address, phone number, and optional notes.
3. The server validates the menu, prices, required choices, hours, and HST.
4. The order is saved in a private Google Sheet.
5. The customer receives an order number and pays when collecting the order.
6. The restaurant sees the order at `/operator/orders`, updates its preparation status, and records payment at the store.
7. Enrolled restaurant devices can receive free browser push notifications.

There is no Stripe account, online card processing, Google customer login, email-delivery provider, external database, Redis service, or scheduled worker to configure.

## 1. Information to collect from the owner

Complete this section before configuring production. Keep secrets in a password manager rather than writing them in this file.

### Public business information

| Information | Current value | Where to confirm it |
| --- | --- | --- |
| Restaurant name | Heart of India | Storefront sign, incorporation/business records, or owner |
| Tagline | Authentic Indian Restaurant | Owner |
| Phone | 905-500-5382 | Active restaurant phone line and printed menu |
| Address | 89 Clarence St., Brampton, ON L6W 1S5 | Lease, utility bill, or Google Business Profile |
| Public contact email | Not supplied | Owner-created restaurant inbox |
| Production domain | Not supplied | Domain registrar or Vercel |

Use a restaurant-controlled inbox for the public contact email and VAPID contact address. Avoid using a developer's personal email if ownership may change.

### Ordering operations

Ask the owner to provide and approve:

- Opening and closing time for every day of the week.
- Days when pickup ordering is closed.
- Holiday or one-off closures. Holiday overrides currently require a settings data update; record the expected dates before launch.
- How many minutes before closing new orders should stop.
- Minimum and maximum preparation estimates shown to customers.
- Whether 13% HST should be added to every listed item price. Confirm this with the restaurant's accountant.
- How long customer order records should be retained.
- The final privacy policy.
- The final ordering, pickup, cancellation, and refund policy.
- The staff email address used to sign in to the operator dashboard.
- Which phones, tablets, and computers should receive new-order notifications.

### Menu review

The checked-in catalogue contains 80 items. Review every row against the restaurant's current menu and confirm:

- Item name and category.
- Price in Canadian dollars.
- Whether the item is currently available.
- Saag protein choices: Chicken, Goat, or Lamb.
- Non-Veg Curry Combo choices.
- Veg Curry Combo choices.
- Whether the Thali wording “Naan, Bread” means one naan bread.
- The excluded, white-obscured appetizer, if the owner wants it added later.
- What is included with “Spl. Chai & Pakora.” No variety or portion is currently claimed.

The owner checklist in [`owner-review.md`](./owner-review.md) records the remaining source ambiguities.

## 2. Accounts and access needed

Prepare these accounts before starting:

- A Google account that will own the private production spreadsheet.
- A Google Cloud project for the Google Sheets API and service account.
- A Git provider account containing this repository, normally GitHub.
- A Vercel account suitable for a commercial restaurant website.
- Access to the domain registrar or DNS provider if using a custom domain.
- A password manager for the operator password and server secrets.

Vercel's current documentation restricts Hobby accounts to personal or non-commercial use. Select a plan that permits this restaurant's commercial use and confirm current terms and pricing before launch: [Vercel plans](https://vercel.com/docs/plans) and [Vercel fair-use guidelines](https://vercel.com/docs/limits/fair-use-guidelines).

## 3. Create the private Google Sheet connection

The Google Sheet is the production order store. It contains customer names, email addresses, phone numbers, notes, and order details, so it must remain private.

### 3.1 Create or select a Google Cloud project

1. Open the [Google Cloud console](https://console.cloud.google.com/).
2. Use the project selector at the top of the page.
3. Create a project such as `heart-of-india-ordering`, or select a project controlled by the restaurant.
4. Record the project owner and recovery information in the restaurant's password manager.

### 3.2 Enable the Google Sheets API

1. In Google Cloud, open **APIs & Services → Library**.
2. Search for **Google Sheets API**.
3. Open it and select **Enable**.

Google's current API-enabling instructions are available at [Enable and disable APIs](https://support.google.com/googleapi/answer/6158841).

### 3.3 Create a service account

1. Open **IAM & Admin → Service Accounts**.
2. Select **Create service account**.
3. Use a clear name such as `heart-of-india-orders`.
4. Finish creating the account.
5. Do not enable domain-wide delegation.
6. Do not grant broad Google Workspace administrator access. The application only needs direct Editor access to one spreadsheet.
7. Copy the service-account email. It looks similar to:

   ```text
   heart-of-india-orders@your-project-id.iam.gserviceaccount.com
   ```

This becomes `GOOGLE_SERVICE_ACCOUNT_EMAIL`. Google's guide explains the same direct-file-sharing model: [Create access credentials](https://developers.google.com/workspace/guides/create-credentials#service-account).

### 3.4 Create the JSON key

1. Open the new service account.
2. Open the **Keys** tab.
3. Select **Add key → Create new key**.
4. Choose **JSON** and download the file.
5. Move it to a secure location outside this repository.
6. Back it up in the restaurant's password manager or managed secret vault.

The JSON file can only be downloaded when the key is created. The two fields used by this application are:

| JSON field | Environment variable |
| --- | --- |
| `client_email` | `GOOGLE_SERVICE_ACCOUNT_EMAIL` |
| `private_key` | `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` |

Never commit the JSON file, paste it into source code, send it through ordinary email, or upload it to the public website. See Google's [service-account key instructions](https://cloud.google.com/iam/docs/keys-create-delete).

If Google Cloud says service-account key creation is disabled, the project may be governed by an organization policy. Ask that organization's administrator for an approved solution. The current application expects a JSON service-account key and does not implement Workload Identity Federation.

### 3.5 Create and share the spreadsheet

1. Open [Google Sheets](https://sheets.google.com/).
2. Create a blank spreadsheet named something clear, such as `Heart of India Orders - Production`.
3. Select **Share**.
4. Add the service-account email from step 3.3.
5. Assign **Editor** access.
6. Turn off **Notify people** because a service account has no inbox.
7. Confirm **General access** remains **Restricted**.
8. Copy the spreadsheet ID from its URL:

   ```text
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
                                          ^^^^^^^^^^^^^^
   ```

The value between `/d/` and `/edit` becomes `GOOGLE_SHEETS_ID`.

Do not publish the sheet or set it to “Anyone with the link.” Google recommends sharing the individual file directly with the service account for this use case.

## 4. Generate the application credentials

Run these commands from the project directory after installing dependencies:

```bash
npm install
cp .env.example .env.local
```

`.env.local` is excluded from Git. Confirm that it remains untracked before putting any secrets in it.

### 4.1 Choose the operator login

Choose the restaurant-controlled email used to sign in at `/operator/login`. This becomes `OPERATOR_EMAIL`.

Choose a strong, unique dashboard password and store it in the restaurant's password manager. Generate its one-way hash:

```bash
npm run auth:hash
```

The command asks for the password without displaying it and prints a value beginning with `OPERATOR_PASSWORD_HASH=scrypt$`. Copy the complete value into `.env.local` and later into Vercel. Store the original password in the password manager; the hash cannot be converted back into the password.

### 4.2 Generate two independent application secrets

Run this command twice:

```bash
openssl rand -base64 48
```

Use different outputs for:

- `OPERATOR_SESSION_SECRET`: signs eight-hour operator login sessions.
- `ORDER_ACCESS_SECRET`: protects each customer's private order-status access.

Do not reuse the operator password, VAPID private key, Google private key, or the same value for both secrets.

### 4.3 Generate Web Push keys

Web Push is optional but recommended for prompt new-order alerts. Generate one stable key pair:

```bash
npm run vapid:generate
```

Copy the output as follows:

| Generated value | Environment variable | Secret? |
| --- | --- | --- |
| `publicKey` | `VAPID_PUBLIC_KEY` | No |
| `privateKey` | `VAPID_PRIVATE_KEY` | Yes |

Set `VAPID_SUBJECT` to a monitored contact URI, normally:

```text
mailto:restaurant@example.com
```

Generate these keys once and keep them stable. Replacing them requires every operator device to subscribe again. The command comes from the project's `web-push` package; see its [VAPID documentation](https://github.com/web-push-libs/web-push#usage).

## 5. Complete `.env.local`

Use the following as a map. Replace every placeholder with the real value.

```dotenv
APP_URL=http://localhost:3000

GOOGLE_SHEETS_ID=spreadsheet-id-between-d-and-edit
GOOGLE_SERVICE_ACCOUNT_EMAIL=heart-of-india-orders@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

OPERATOR_EMAIL=restaurant-operator@example.com
OPERATOR_PASSWORD_HASH=scrypt$generated-salt$generated-hash
OPERATOR_SESSION_SECRET=first-independent-random-secret
ORDER_ACCESS_SECRET=second-independent-random-secret

VAPID_PUBLIC_KEY=generated-public-key
VAPID_PRIVATE_KEY=generated-private-key
VAPID_SUBJECT=mailto:restaurant@example.com

PUBLIC_CONTACT_EMAIL=restaurant@example.com
```

For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, copy only the JSON file's `private_key` value. Keep the BEGIN/END lines. A single-line environment value may contain literal `\n` separators; the server converts them back to newlines. Do not include the surrounding JSON object.

No secret should use a `NEXT_PUBLIC_` prefix.

## 6. Initialize the spreadsheet

With `.env.local` configured, run:

```bash
npm run sheets:setup
```

Successful output lists these tabs:

- `Orders`
- `Menu`
- `Settings`
- `PushSubscriptions`
- `LoginAttempts`

The command also adds the headers, seeds all 80 menu items, and creates the initial settings row. It is safe to rerun: it repairs headers and only fills Menu or Settings when their data rows are empty. It does not intentionally erase orders.

If the command fails:

- A `403` usually means the Sheet was not shared with the exact service-account email, or the Sheets API is not enabled.
- An authentication or PEM error usually means the private key is incomplete or its newlines were damaged.
- A “not configured” error means one or more Google environment variables are blank.

After the command succeeds, open the Sheet and confirm that all five tabs exist. Do not rename the tabs, change header names, reorder columns, or delete required columns.

## 7. Review the seeded menu in Google Sheets

Open the `Menu` tab. The following fields matter:

| Column | What to do |
| --- | --- |
| `item_id` | Never change it. It connects the cart and server catalogue. |
| `name` | Customer-facing item name. Prefer changing it through Operator Settings. |
| `category_id` | Customer-facing category. Prefer changing it through Operator Settings. |
| `price_cents` | Enter integer CAD cents: `1499` means CA$14.99. |
| `availability` | Use only `available`, `unavailable`, or `requires_owner_confirmation`. |
| `updated_at` | Audit/reference field. Do not change its format. |

Review all 80 rows before approving the menu. Set every temporarily unavailable dish to `unavailable`. When the **menu approved** box is selected in the dashboard for the first time, remaining `requires_owner_confirmation` rows become `available`, so this approval must happen only after a complete review.

Prefer changing an existing item's name, category, price, or availability through **Operator → Edit Menu**. Dashboard edits validate the value and increment `catalog_revision` automatically. If you change a live menu row directly in the Sheet, increment `catalog_revision` in the `Settings` tab by one so open checkouts detect the changed quote.

Changes to required options, new products, or permanent product removal require updating `heart-of-india-menu.json`, testing, and deploying the code. Do not create an arbitrary new row and expect the storefront to display it.

## 8. Test locally before deployment

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and check:

1. Home, Menu, About Us, Cart, and Checkout load.
2. All menu categories appear.
3. A simple item can be added and changed with the minus/plus controls.
4. Saag requires a protein choice.
5. Both combo products require a curry choice.
6. Checkout collects name, email, and phone.
7. The displayed subtotal, 13% HST, and total are correct.
8. An order receives an `HOI-...` number.
9. The order appears in the private Sheet.
10. `/operator/login` accepts the configured email and original password.
11. The order appears in the operator dashboard.
12. Status and paid-at-store changes persist and appear on the customer's status page.

Keep production ordering disabled until the owner has completed the dashboard review.

## 9. Deploy to Vercel

### 9.1 Import the repository

1. Push the repository to the restaurant's Git provider account or an appropriately managed organization.
2. In the [Vercel dashboard](https://vercel.com/dashboard), select **Add New → Project**.
3. Import the repository.
4. Keep the detected Next.js build settings unless the project structure changes.
5. Complete the initial deployment.

Vercel provides a `vercel.app` address. A custom domain is strongly recommended for customers and notification enrollment.

### 9.2 Add a custom domain

1. Open the Vercel project.
2. Go to **Settings → Domains**.
3. Add the restaurant's domain.
4. Follow the exact DNS records shown by Vercel at the domain registrar or DNS provider.
5. Choose one canonical hostname, such as `https://heartofindia.example` or `https://www.heartofindia.example`.
6. Redirect the other hostname to the canonical one.
7. Wait for Vercel to show that DNS verification and the HTTPS certificate are ready.

Use Vercel's displayed DNS values instead of copying values from an old tutorial. Current guidance is in [Adding and configuring a custom domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

### 9.3 Add production environment variables

In the project, open **Settings → Environment Variables** and add every variable from section 5 to the **Production** environment.

For production:

```text
APP_URL=https://your-canonical-domain.example
```

Use the exact HTTPS origin with no path and preferably no trailing slash. `APP_URL` is used for same-origin mutation protection, robots metadata, and the sitemap. An incorrect value can cause checkout or dashboard mutations to return `403`.

Environment variable changes apply only to new deployments. Redeploy after adding or changing them. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

For Preview deployments, use a separate test spreadsheet and separate secrets if ordering needs to work there. Do not connect arbitrary preview branches to the production order Sheet. Because preview URLs can change, either give a preview environment a stable domain and matching `APP_URL`, or leave `APP_URL` unset so same-origin checks use the request's current origin.

### 9.4 Redeploy and verify configuration

1. Redeploy the production branch after setting the variables.
2. Open the production homepage.
3. Open `/operator/login` and confirm the sign-in form is available.
4. Sign in and check that the seeded menu/settings and test orders are reachable.
5. If the Google Sheet was not initialized earlier, run `npm run sheets:setup` from a trusted local checkout containing the production environment variables.

## 10. Complete the owner dashboard settings

Open:

```text
https://your-domain.example/operator/login
```

Sign in with `OPERATOR_EMAIL` and the original password used to generate `OPERATOR_PASSWORD_HASH`. Then open **Settings**.

### Business details

Confirm the restaurant name, tagline, phone number, public email, and full address. These values feed public pages and pickup information.

### Ordering hours

For each day:

1. Check the day if pickup orders are accepted.
2. Enter the opening time.
3. Enter the closing time.

Also set:

- **Stop orders before closing:** the cutoff in minutes.
- **Minimum preparation time:** the lower customer estimate.
- **Maximum preparation time:** the upper customer estimate.
- **Keep customer orders:** the approved retention period in days.

The timezone is fixed to `America/Toronto`, including daylight-saving changes.

The dashboard currently edits the regular weekly schedule. For a holiday closure or special schedule, edit `date_overrides_json` in the private `Settings` tab using valid JSON. A full closure looks like:

```json
[{"date":"2026-12-25","intervals":[]}]
```

A shortened day looks like:

```json
[{"date":"2026-12-24","intervals":[{"open":"11:00","close":"17:00"}]}]
```

Keep all overrides in the same JSON array, use Toronto-local dates and 24-hour `HH:MM` times, and test each override after editing it. Invalid JSON is ignored, so validate the cell carefully.

### Policies

Replace placeholder wording with owner-approved text. The privacy policy should explain at least:

- What customer information is collected.
- Why it is needed for pickup fulfillment.
- Who can access it.
- How long it is kept.
- How a customer can request correction or deletion.
- The restaurant's contact method for privacy questions.

The ordering policy should explain at least:

- Orders are pickup-only.
- Payment is due at the restaurant.
- When an order is considered accepted.
- Preparation estimates are estimates.
- Cancellation, unavailable-item, refund, and uncollected-order handling.

Have an appropriate Canadian legal/privacy professional review the final policy wording. The project does not supply legal advice.

### Approvals and ordering switch

Complete these in order:

1. Confirm all menu rows, prices, choices, inclusions, and availability.
2. Confirm hours, cutoff, preparation times, and HST treatment.
3. Approve the privacy and ordering policies.
4. Save the settings.
5. Enable live pay-at-store ordering only after the production tests in section 12 pass.

The tax implementation currently adds 13% HST to the full subtotal. It is deliberately not an editable dashboard field. If the accountant requires different tax treatment for particular products, update and retest the server tax logic before enabling ordering.

## 11. Enable notifications on restaurant devices

The dashboard checks for new orders every five seconds whenever it is open. Web Push can alert subscribed devices when the dashboard is closed.

On each restaurant-controlled phone, tablet, or computer:

1. Open the production `/operator/login` page over HTTPS.
2. Sign in.
3. Open **Pickup orders**.
4. Find **New-order notifications**.
5. Select **Enable on this device**.
6. Approve the browser notification prompt.
7. Select **Send test** and confirm the notification arrives.
8. Confirm **Dashboard sound on** if audible foreground alerts are wanted.

Each browser profile and device must be enrolled separately.

For iPhone or iPad:

1. Use Safari to open the production site.
2. Use **Share → Add to Home Screen**.
3. Open the installed Heart of India web app from the Home Screen.
4. Sign in and enable notifications from inside the installed app.

Web Push on iOS/iPadOS is available to Home Screen web apps and permission must follow a user action. See [Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

Push notifications contain the order number, not customer contact details. Subscription endpoints are sensitive operational data and remain in the private Sheet.

Notification delivery is a convenience rather than the only order record. Keep the dashboard open during service and use the `Orders` Sheet as the fallback. A push failure does not remove or cancel an order.

## 12. Production acceptance test

Run this test with the restaurant closed to customer ordering or with the live ordering switch still disabled until the final step.

### Customer flow

- Test on a desktop browser and a real phone.
- Add a simple item.
- Add Saag and choose a protein.
- Add each combo and choose a curry.
- Change quantities with minus/plus controls.
- Refresh and confirm the cart persists.
- Enter a test name, email, phone, and note.
- Verify every line, subtotal, HST, and total.
- Place the pickup order.
- Confirm an order number is shown.
- Confirm the page clearly says payment is due at the store.
- Keep the customer status page open.

### Operator flow

- Confirm the order appears in the dashboard within approximately five seconds.
- Confirm the Sheet contains the same contact details, items, choices, quantities, and totals.
- Move the order to **Preparing** and confirm the customer page updates.
- Move it to **Ready for pickup** and confirm the customer page updates.
- Select **Mark paid at store** and confirm the customer page shows paid.
- Move it to **Completed**.
- Place another test order and verify **Cancelled** works.
- Confirm an enrolled device receives a new-order push notification.
- Turn dashboard sound off and on and confirm the preference works.

### Closed-hours and failure checks

- Temporarily test a closed period and confirm checkout is blocked by the server.
- Temporarily disable ordering and confirm customers receive a useful unavailable message.
- Confirm an incorrect dashboard password is rejected.
- Confirm a private order URL opened in a different browser profile does not reveal customer data.
- Confirm orders remain visible in the Sheet if notifications are disabled.

Remove test customer information after verification or keep only what the approved retention policy permits.

## 13. Daily operating procedure

At the beginning of service:

1. Open `/operator/orders` on the primary restaurant device.
2. Confirm it says it is checking for orders every five seconds.
3. Confirm dashboard sound is in the desired state.
4. Send a test push if the device or browser was recently changed.
5. Confirm the ordering-enabled setting and today's hours.

For each order:

1. Review the customer name, phone, email, notes, items, options, and total.
2. Move **New → Preparing** when the kitchen starts.
3. Move to **Ready for pickup** when the order is ready.
4. Take payment at the restaurant.
5. Select **Mark paid at store**.
6. Move the order to **Completed** after handoff.
7. Use **Cancelled** when the restaurant cancels an order and contact the customer using the stored details.

The status represents restaurant workflow. Receiving an order number does not itself promise that the kitchen has accepted the order.

## 14. Maintenance and data handling

### Menu and price changes

- Sign in and open **Edit Menu** in the operator navigation.
- Search for an item, then edit its name, category, CAD price, or ordering availability and select **Save item**.
- Dashboard edits update the private `Menu` tab and increment `catalog_revision` automatically.
- Allow up to roughly 30 seconds for cached public data to refresh.
- Use a code/menu JSON update for required options, new products, or permanent product removal.

### Emergency pause

Sign in, open **Settings**, turn off **Enable live pay-at-store ordering**, and save. Existing orders remain available in the dashboard.

If Google Sheets is unavailable, the server fails closed and does not pretend that an order was stored.

### Customer-data deletion

The retention-days setting records the owner's policy but does not automatically delete rows because the system intentionally has no cron worker. A designated owner must periodically remove orders older than the approved retention period from the private Sheet. Record who performs this review and how often.

Before deleting rows, confirm that the restaurant no longer needs them for tax, accounting, charge dispute, or other lawful recordkeeping purposes.

### Backups

Use Google Sheets version history or an owner-controlled export process. Backups contain personal information and must be kept private, access-controlled, and deleted according to the same approved policy.

### Changing the dashboard password

1. Choose and store the new password.
2. Run `npm run auth:hash`.
3. Replace `OPERATOR_PASSWORD_HASH` in Vercel Production.
4. Redeploy.

### Rotating secrets

- Changing `OPERATOR_SESSION_SECRET` signs out existing dashboard sessions.
- Changing `ORDER_ACCESS_SECRET` prevents existing customer status cookies from validating, so rotate it only with a deliberate migration plan.
- Changing the VAPID keys requires every device to enable push again.
- To rotate the Google key, create a new key, update Vercel, redeploy and test, then delete the old key in Google Cloud.

## 15. Troubleshooting

| Problem | Checks |
| --- | --- |
| `npm run sheets:setup` returns 403 | Enable the Sheets API; share the exact Sheet with the service-account email as Editor; verify the Sheet ID. |
| Google authentication or PEM error | Copy the complete `private_key`; keep BEGIN/END lines; preserve newlines or literal `\n`. |
| Operator page says setup is required | Set `OPERATOR_EMAIL`, `OPERATOR_PASSWORD_HASH`, and `OPERATOR_SESSION_SECRET`, then redeploy. |
| Correct password is rejected | Confirm the email matches `OPERATOR_EMAIL`; regenerate the hash from the intended password; wait after too many failed attempts. |
| Checkout says ordering is unavailable | Check Google variables, Sheet tabs, menu availability, approvals, ordering switch, current Toronto hours, and cutoff. |
| Checkout or dashboard save returns 403 | `APP_URL` does not match the exact browser origin, protocol, or canonical hostname. |
| A changed price is not detected | Update `price_cents` and increment `catalog_revision`. Wait for the short cache to refresh. |
| Push controls say VAPID is missing | Set all three VAPID variables and redeploy. |
| Push permission does not appear | Use HTTPS; check browser support/settings; on iPhone/iPad use the installed Home Screen app. |
| Push fails but the customer ordered | Check the dashboard and `Orders` tab. The saved order remains authoritative. |
| Customer cannot open status on another device | Access is protected by an order-scoped HttpOnly cookie in the original browser. Staff can use the dashboard and order number to assist. |
| Settings or menu changes seem delayed | Public menu/settings reads may be cached for approximately 30 seconds. |

## 16. Cost and capacity notes

- There is no Stripe fee because cards are not processed online.
- There is no transactional email-provider charge because the site does not send order emails.
- There is no separate database, Redis, or scheduled-worker bill.
- Browser Web Push itself does not require a paid notification provider.
- A custom domain normally has an annual registrar cost.
- Use a Vercel plan permitted for commercial use and review current usage-based pricing.
- Review the current [Google Sheets API quotas and pricing](https://developers.google.com/workspace/sheets/api/limits). Google Sheets is appropriate for the expected low-volume, single-location workflow, but it is not a transactional database.

If order volume or the number of simultaneous operators grows materially, plan a future move from Google Sheets to a managed relational database with transaction and concurrency guarantees.

## Final launch checklist

- [ ] Owner confirmed name, tagline, phone, address, and public email.
- [ ] Owner supplied weekly hours, cutoff, and preparation estimate.
- [ ] Accountant confirmed the 13% HST treatment.
- [ ] Owner approved privacy, ordering, cancellation, and refund wording.
- [ ] Owner selected a customer-data retention period and responsible reviewer.
- [ ] All 80 menu rows, prices, choices, and availability were reviewed.
- [ ] Google Sheets API is enabled.
- [ ] Service-account JSON key is stored securely outside the repository.
- [ ] Production Sheet is Restricted and shared only with approved people and the service account.
- [ ] `npm run sheets:setup` completed successfully.
- [ ] Operator password and secrets are stored in the password manager.
- [ ] Production environment variables are set in Vercel.
- [ ] Canonical custom domain and HTTPS are working.
- [ ] `APP_URL` matches the canonical HTTPS origin.
- [ ] Dashboard settings and all three approvals are complete.
- [ ] Every restaurant device was enrolled and push-tested.
- [ ] Desktop and real-phone customer orders were tested end to end.
- [ ] Closed-hours, paused-ordering, cancellation, and access-control checks passed.
- [ ] Test personal information was removed or retained under the approved policy.
- [ ] Live ordering was enabled only after all prior checks passed.
