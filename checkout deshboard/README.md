# Purpose Gateway: Checkout

A responsive checkout page for Purpose Gateway built with plain HTML, CSS and JavaScript. There is no build step and nothing to install.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python -m http.server 8080
```

## Structure

```
index.html              Page markup and inline SVG icon sprite
assets/css/styles.css   All styles, including responsive breakpoints
assets/js/mock-data.js  Mock rows shaped like the DB tables (snake_case, money in minor units)
assets/js/api.js        Service layer. The only place to change when the backend is ready
assets/js/app.js        UI logic: method switching, stepper, validation, group split, coupons, success screen
database/schema.sql     PostgreSQL schema (not connected yet)
database/seed.sql       Seed data that matches the design
database/README.md      ER diagram, table reference, UI-to-DB mapping, API plan, security notes
```

## Features

- **4 payment methods:** Card, Mobile Banking (bKash/Nagad/Rocket), Wallet (Google Pay/Apple Pay) and Group Payment. Each opens its own form panel.
- **Card form:** auto-formats the number, detects the brand (Visa/Mastercard/AmEx highlight), validates with the Luhn check, masks expiry as MM / YY, and checks CVV length per brand.
- **Group payment:** add up to 10 friends and split equally (the remainder goes to the organizer) or with custom amounts. A live check confirms the shares add up to the total.
- **Coupons:** try `PURPOSE10` or `FLAT2000`.
- **3-step stepper:** follows progress from Method to Details to Complete. The success screen shows a receipt and a copyable transaction ID.
- **Responsive:** desktop (2 columns), small laptop/tablet (stacked, with the summary split into 2 columns), phones (single column, 2×2 then 1×1 method grid), down to 320px.
- **Accessible:** method tiles act as a radio group with arrow-key navigation, inline field errors use `aria-invalid`, focus is visible, and `prefers-reduced-motion` is respected.

## Database

See [database/README.md](database/README.md). The frontend talks only to `assets/js/api.js`. Every function there returns the same shapes the DB/API will return, so connecting the backend means setting `USE_MOCK = false`.
