# Purpose Gateway: Checkout

A responsive checkout page for Purpose Gateway built with plain HTML, CSS and JavaScript. There is no build step and nothing to install.

## Run

Open `index.html` in a browser, or serve the folder:

```bash
npx serve .        # or: python -m http.server 8080
```

## Structure

```
index.html                   Page markup, icon sprite, Step 1 / Step 2 views, success + sandbox modals
assets/css/styles.css        Theme tokens, layout, order summary, stepper, inputs, responsive base
assets/css/checkout.css      Payment experience: 3D bag, method tiles, 3D card, MFS flow, wallet, group, modals
assets/js/mock-data.js       Mock rows shaped like the DB tables (snake_case, money in minor units)
assets/js/api.js             Service layer. The only place to change when the backend is ready
assets/js/core.js            Shared state, event bus, formatting, view transitions, logo loader, modal, confetti
assets/js/modules/card.js    Card form + live 3D card (flip on CVV, brand detection, Luhn)
assets/js/modules/mobile.js  Mobile banking: provider -> account -> confirm -> provider authorization -> verify
assets/js/modules/wallet.js  Purpose Wallet: balance, coverage meter, insufficient-balance handling
assets/js/modules/group.js   Group payment: contributors, per-person requests, live status tracking
assets/js/modules/success.js Success popup (animated check, confetti, receipt)
assets/js/app.js             Controller: order summary, stepper, method selection, coupon, account menu
assets/img/mfs/              Official MFS logo files go here (see its README)
database/                    PostgreSQL schema, seed and docs (not connected yet)
```

## Checkout flow

1. **Step 1: choose a method.** Four tiles: Card, Mobile Banking, Wallet, Group Payment. Choosing one moves straight to Step 2.
2. **Step 2: the matching payment interface.**
   - **Card:** a 3D card mirrors the number, name and expiry as you type, flips to show the CVV panel while you enter it, and turns back when you finish. Brand detection (Visa/Mastercard/AmEx), Luhn check, expiry and CVV validation. The card is tokenized in the browser (`api.tokenizeCard`) and only the token reaches the backend. 3-D Secure redirects are supported.
   - **Mobile banking:** pick a provider (11 MFS, searchable), enter the account number (Rocket needs its check digit), review the amount, then authorize on the provider's own page. OTP and PIN are entered **there**, never in this app. The backend verifies the result with the provider before success is shown.
   - **Wallet:** Purpose Wallet balance, coverage meter and balance-after-payment. If the balance is short, a notice shows the shortfall with options to split via Group Payment or choose another method.
   - **Group payment:** add 2–10 contributors (name, mobile number, provider; no email), split equally or with custom amounts. Each contributor gets their own provider payment request. Status (Pending → Accepted → Paid) is tracked per person, with collected/remaining totals and a progress ring. **Complete Payment** unlocks once the full amount is collected.
3. **Complete:** a success popup with an animated check, confetti, the amount, method and transaction ID.

## Sandbox vs live

`api.js` has `USE_MOCK = true`. In this mode a **Sandbox** banner is shown, the provider page is a clearly labelled simulated approve/decline screen, and group contributors accept and pay on a timer. Set `USE_MOCK = false` to call the real endpoints listed in `api.js`. Successful payments are never simulated in live mode.

To demo the wallet's insufficient-balance state: the mock balance is ৳92,000 against a ৳95,000 order. Apply `PURPOSE10` and the wallet covers it.

## Database

See [database/README.md](database/README.md). The frontend talks only to `assets/js/api.js`. Every function there returns the same shapes the DB/API will return, so connecting the backend means setting `USE_MOCK = false`.
