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
- **Recent Transactions:** a ⋯ menu per row to view details, copy the ID, or refund (successful payments only, partial amounts allowed).
- **Transactions page** (`#transactions`): search, status filter, pagination and CSV export.
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

Payment Links, Analytics, Payouts, Settings and Support show a "next phase" placeholder. Their tables are already in the schema.

## Database

See [database/README.md](database/README.md). The frontend talks only to `assets/js/api.js`. Every function there already contains the real `fetch()` call and returns the same shape as the mock, so connecting the backend means setting `USE_MOCK = false`.

Brand marks for bKash, Nagad, Rocket and the others are simple stand-ins drawn in SVG. Put the official logo files in `payment_providers.logo_url`: the Connected Gateways tiles use them automatically. The `LOGOS` map in `app.js` covers the remaining spots.
