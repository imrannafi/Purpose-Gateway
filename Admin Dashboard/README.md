# Purpose Gateway: Admin Dashboard

A responsive admin panel for the Purpose Gateway payment platform. It is plain HTML, CSS and JavaScript,
with no build step and no dependencies.

## Run it

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python -m http.server 8080
```

## Structure

```
index.html              Page markup + inline SVG icon sprite
assets/css/styles.css   Design tokens, components, light/dark themes, responsive breakpoints
assets/js/data.js       Data service: the ONLY data source for the UI (mock now, API later)
assets/js/charts.js     Dependency-free SVG sparklines + area chart with tooltip
assets/js/app.js        Rendering, navigation, search, theme, menus, mobile drawer
database/               Database architecture (not connected yet), see database/README.md
```

## Features

- Closely matches the reference design: KPI cards with sparklines, provider health, transaction
  analytics chart, smart routing flow, merchant stats, risk alerts, recent activity and audit logs
- **Responsive:** 4-column desktop → 2×2 on laptops → off-canvas sidebar on tablets → single column on phones.
  On phones the audit table becomes stacked cards.
- Light and dark themes (follows the OS setting, remembers your choice)
- Global search (`Ctrl/⌘ + K`) with keyboard navigation
- Notifications, profile menu, date-range and chart-period filters
- Hash routing for sidebar modules. Modules other than Dashboard show a placeholder until Phase 2.
- Accessible: semantic landmarks, focus rings, ARIA on menus, `prefers-reduced-motion` respected

## Connecting the database (Phase 2)

1. Apply `database/schema.sql` and `database/seed.sql` to PostgreSQL 15+.
2. Implement the endpoints in `database/API_CONTRACT.md`.
3. In `assets/js/data.js`, set `USE_MOCK = false` and set `API_BASE`.

The full plan is in [database/README.md](database/README.md).
