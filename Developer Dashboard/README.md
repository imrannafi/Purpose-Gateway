# Purpose Gateway — Developer Portal

A responsive developer dashboard: API keys, quick links, usage analytics, a getting-started checklist with multi-language code samples, and live system status.

## Run it
There's no build step. Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python -m http.server 8000
```

## Structure
```
index.html                 markup + inline SVG icon sprite
assets/css/styles.css      design tokens, layout, responsive breakpoints
assets/js/mock-data.js     mock rows shaped like the DB tables (remove after DB integration)
assets/js/api.js           data-access layer: every UI read/write goes through here
assets/js/app.js           rendering + interactions
database/schema.sql        PostgreSQL schema (not connected yet)
database/seed.sql          demo data
database/README.md         ERD, table dictionary, UI → data mapping
```

## Features
- Sidebar becomes an off-canvas drawer at ≤1024px. Layouts adapt at 1280 / 860 / 720 / 600 / 380px.
- Copy API keys and code samples. Code tabs for cURL, Node.js, Python and PHP, with syntax highlighting and arrow-key navigation.
- Sandbox Mode toggle switches the code samples between test and live keys.
- "Try in Sandbox" simulates a request and completes onboarding step 3.
- Interactive usage chart: hover or touch to inspect a day, and switch between 7, 30 and 90 days. It redraws on resize.
- Docs and endpoint search with ⌘K / Ctrl+K, keyboard navigation and match highlighting.
- Notifications dropdown, profile menu, tutorial modal and toasts.
- Accessible: semantic landmarks, ARIA states, focus styles, Escape handling and `prefers-reduced-motion`.

## Connecting the database (next phase)
See [database/README.md](database/README.md). In short: apply `schema.sql`, build the endpoints listed in the "UI → data mapping" table, then set `USE_MOCK = false` in `assets/js/api.js`.
