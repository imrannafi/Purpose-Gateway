# Mobile banking (MFS) logos

Put each provider's **official** logo in this folder, named by its provider `code`:

| File | Provider | Operator |
|---|---|---|
| `bkash.png` | bKash | BRAC Bank PLC |
| `nagad.png` | Nagad | Nagad Ltd. (Bangladesh Post Office) |
| `rocket.png` | Rocket | Dutch-Bangla Bank PLC |
| `upay.png` | Upay | United Commercial Bank PLC |
| `tap.png` | Tap | Trust Axiata Pay (Trust Bank PLC) |
| `surecash.png` | SureCash | Rupali Bank PLC & partner banks |
| `ok_wallet.png` | OK Wallet | ONE Bank PLC |
| `mcash.png` | mCash | Islami Bank Bangladesh PLC |
| `mycash.png` | MyCash | Mercantile Bank PLC |
| `firstcash.png` | FirstCash | First Security Islami Bank PLC |
| `cellfin.png` | CellFin | Islami Bank Bangladesh PLC |

- **Formats:** the current files are transparent PNGs, referenced explicitly by `logo_url` in `assets/js/mock-data.js` (live: the `mfs_providers.logo_url` column). To use an `.svg` instead, drop it here and change the extension in `logo_url`. If `logo_url` has no extension, the page tries `.svg`, then `.png`, then `.webp`.
- **Proportions:** don't crop, stretch or recolour the files. The page fits each logo inside its tile (`object-fit: contain`), so any aspect ratio displays correctly.
- **Fallback:** if a file is missing, the tile shows a neutral grey initials badge. That badge is a placeholder, not a logo.

## Where to get official artwork

Use **only** artwork supplied by the provider:

1. **Merchant / payment-gateway onboarding:** when Purpose Gateway signs the integration agreement with each MFS, the provider supplies an approved logo pack and usage guidelines. This is the correct source for a payment gateway.
2. **The provider's official website, press or media kit.**

Don't use logos from image search, icon sites or AI generators. Displaying an MFS brand at checkout is normally covered by the merchant agreement, so follow each provider's brand guidelines on clear space, minimum size and colour.

When the database is connected, record the source of each logo in `payment_provider_assets` (`source`, `approved_at`). See `database/README.md`.
