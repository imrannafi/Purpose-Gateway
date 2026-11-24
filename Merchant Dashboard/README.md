# Purpose Gateway: Merchant Dashboard

A responsive merchant dashboard for Purpose Gateway, built with plain HTML, CSS and JavaScript. There is no build step and nothing to install.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python -m http.server 8080
```

## Structure

```
index.html              Markup, inline SVG icon sprite, modals
assets/css/styles.css   All styles and responsive breakpoints
assets/js/mock-data.js  Mock rows shaped like the DB tables (snake_case, money in poisha)
assets/js/api.js        Service layer. The only file to change when the backend is ready
assets/js/charts.js     Dependency-free SVG sparkline + area chart (crosshair, tooltip, keyboard)
assets/js/app.js        UI logic: KPIs, chart, balance, gateways, transactions, modals, routing
database/schema.sql     PostgreSQL schema, 28 tables (not connected yet)
database/seed.sql       Seed data that matches the design
database/README.md      ER diagram, table reference, UI-to-DB mapping, API contract, integration plan
```

## Features

- **KPI cards** with count-up values and sparklines. The date-range picker (Today / 7 / 30 / 90 days) reloads them. For Failed Payments, an increase shows in red.
- **Revenue Overview** area chart (This Month / Last Month / This Year). Hover, tap or use the arrow keys to inspect each day. The tooltip stays inside the chart.
- **Available Balance:** a show/hide toggle (remembered per browser), plus **Withdraw** with validation (minimum ৳500, can't exceed the balance, 25/50/Max shortcuts) and a success receipt.
- **Connected Gateways:** the first 4 plus "+N". Click a tile for details.
- **Recent Transactions:** a ⋯ menu per row to view details, copy the ID, or issue a full or partial refund. Partially refunded payments keep a refundable balance, which can be refunded later.
- **Transactions page** (`#transactions`): paginate all transactions, search by transaction ID or customer, filter by date range, amount, payment method, status, or possible duplicates, view full details, and export a CSV report using the active filters. The page refreshes transaction status every 15 seconds while visible; real-time updates depend on the API returning current status.
- **Reconciliation Center** (`#reconciliation`): review internal transaction records, import provider CSV statements (up to 10 MB / 20,000 rows), match exact transaction/provider references, identify unmatched transactions and amount mismatches, and download a reconciliation CSV. Imports remain in browser memory and are not uploaded or persisted.
- **Refund Management** (`#refunds`): view refund requests and history, initiate full or partial refunds with a reason, track pending/processing/completed/failed status (auto-refreshes every 15 seconds while open), inspect request details and reasons, filter requests, and download a CSV report.
- **Payment Links** (`#payment-links`): add fixed-amount or customer-priced links, search and filter the list, copy shareable URLs, review payment activity, and pause or resume links.
- **Analytics** (`#analytics`): revenue chart with period selection, 30-day KPIs, and payment-method breakdown.
- **Payouts** (`#payouts`): view withdrawal history, check available balance, and set a default payout account.
- **Payment Management** (`#payment-methods`): connect providers, enable or disable methods, configure payment preferences, view provider availability and illustrative transaction fees, and set a preferred provider by payment category.
- **Business Profile** (`#profile`): manage the merchant's legal/business details, customer-facing contacts, address, and account-owner information.
- **Settings** (`#settings`): review company information and masked payout/payment accounts, manage payout schedule and email/SMS notification preferences, invite/remove team members with roles, change password, and configure two-factor authentication. Sensitive security actions require backend verification in production; mock security flows are demo-only.
- **Support** (`#support`): submit a categorized request with an optional transaction reference, search and filter requests, and view ticket status and message history.
- **Quick Actions:** Create Payment Link (fixed or customer-chosen amount, with a copyable link), plus Analytics, Payouts and Settings.
- **Notifications** panel with unread dot and "Mark all as read".
- **Responsive:**
  - ≥1280: the full layout from the design.
  - 1101–1280: tighter columns.
  - ≤1100: the sidebar becomes a slide-in drawer.
  - ≤1024: chart full width, balance and gateways side by side.
  - ≤860: everything stacks.
  - ≤720: one column, the tables turn into cards, and dialogs open as bottom sheets.
  - It works down to 320px.
- **Accessible:** keyboard-operable menus (arrows and Esc), focus-trapped modals, visible focus, ARIA labels, and support for `prefers-reduced-motion`.

## Database

See [database/README.md](database/README.md). The frontend talks only to `assets/js/api.js`. Every function there already contains the real `fetch()` call and returns the same shape as the mock, so connecting the backend means setting `USE_MOCK = false`.

The supplied bKash, Nagad, Rocket and Upay logo files are stored under `assets/images/payment-providers/` and used in gateway tiles, Payment Management, and transaction rows. Card and bank marks continue to use lightweight inline SVGs; provider-supplied logo URLs take precedence when available.

Payment provider availability and fee rates in mock mode are demonstration values. Production provider onboarding must be completed through the authenticated backend; never collect or store provider secrets in this dashboard UI.
