# Mobile banking (MFS) logos

Put each provider's **official** logo in this folder, named by its provider `code`:

| File | Provider | Operator |
|---|---|---|
| `bkash.svg` | bKash | BRAC Bank PLC |
| `nagad.svg` | Nagad | Nagad Ltd. (Bangladesh Post Office) |
| `rocket.svg` | Rocket | Dutch-Bangla Bank PLC |
| `upay.svg` | Upay | United Commercial Bank PLC |
| `tap.svg` | Tap | Trust Axiata Pay (Trust Bank PLC) |
| `surecash.svg` | SureCash | Rupali Bank PLC & partner banks |
| `ok_wallet.svg` | OK Wallet | ONE Bank PLC |
| `mcash.svg` | mCash | Islami Bank Bangladesh PLC |
| `mycash.svg` | MyCash | Mercantile Bank PLC |
| `firstcash.svg` | FirstCash | First Security Islami Bank PLC |
| `cellfin.svg` | CellFin | Islami Bank Bangladesh PLC |

- **Formats:** `.svg` is preferred. `.png` or `.webp` also work, ideally with a transparent background and about 320px wide. The page tries `.svg`, then `.png`, then `.webp`.
- **Proportions:** don't crop, stretch or recolour the files. The page fits each logo inside its tile (`object-fit: contain`), so any aspect ratio displays correctly.
- **Fallback:** if a file is missing, the tile shows a neutral grey initials badge. That badge is a placeholder, not a logo.

## Where to get official artwork

Use **only** artwork supplied by the provider:

1. **Merchant / payment-gateway onboarding:** when Purpose Gateway signs the integration agreement with each MFS, the provider supplies an approved logo pack and usage guidelines. This is the correct source for a payment gateway.
2. **The provider's official website, press or media kit.**

Don't use logos from image search, icon sites or AI generators. Displaying an MFS brand at checkout is normally covered by the merchant agreement, so follow each provider's brand guidelines on clear space, minimum size and colour.

When the database is connected, record the source of each logo in `payment_provider_assets` (`source`, `approved_at`). See `database/README.md`.
