/**
 * Mock data — shaped exactly like the rows defined in /database/schema.sql.
 * Field names are snake_case to match DB columns so the swap to a real API
 * (which will return the same shapes) requires no UI changes.
 *
 * Money is stored as integer minor units (poisha: 1 BDT = 100 poisha),
 * matching the BIGINT `*_minor` columns in the schema.
 */
window.PG_MOCK = {
  user: {
    id: "8f6c1d2e-4b7a-4e0e-9c1a-0a1b2c3d4e5f",
    full_name: "Rahim Ahmed",
    email: "rahim@example.com",
    phone: "+8801712345678",
    avatar_url: null,
  },

  /**
   * Mirrors `user_wallets` (Purpose Wallet stored balance).
   * 92,000 BDT is deliberately below the 95,000 order total so the
   * "insufficient balance" state shows first; apply PURPOSE10
   * (−5,000) and the wallet covers the order.
   */
  wallet: {
    id: "wal_3f9a2c71",
    user_id: "8f6c1d2e-4b7a-4e0e-9c1a-0a1b2c3d4e5f",
    wallet_number_masked: "PW •••• 4821",
    balance_minor: 9200000,
    currency: "BDT",
    status: "active",
  },

  merchant: {
    id: "1b2c3d4e-0000-4000-8000-000000000001",
    name: "Purpose Store",
    slug: "purpose-store",
  },

  checkout_session: {
    id: "cs_7Hk2pQ9xLm",
    order_id: "ord_000001",
    current_step: "payment_method", // payment_method | payment_details | complete
    selected_method_code: "card",
    status: "open",
    expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  },

  order: {
    id: "ord_000001",
    order_number: "PG-2026-000148",
    currency: "BDT",
    status: "pending_payment",
    subtotal_minor: 9500000,
    discount_minor: 0,
    delivery_charge_minor: 0,
    tax_minor: 0,
    total_minor: 9500000,
    coupon_code: null,
    items: [
      {
        id: "oi_1",
        product_id: "prd_macbook_air_m2",
        variant_id: "var_mba_m2_8_256_silver",
        product_name: "MacBook Air M2",
        variant_attributes: { screen: "13.6″", ram: "8GB RAM", storage: "256GB SSD", color: "Silver" },
        image_url: null, // falls back to built-in illustration
        unit_price_minor: 9500000,
        quantity: 1,
        line_total_minor: 9500000,
      },
    ],
  },

  payment_methods: [
    { code: "card", name: "Card Payment", description: "Visa, Mastercard & more", is_popular: false, sort_order: 1 },
    { code: "mobile_banking", name: "Mobile Banking", description: "bKash, Nagad, Rocket & more", is_popular: false, sort_order: 2 },
    { code: "wallet", name: "Wallet", description: "Pay from your Purpose Wallet balance", is_popular: false, sort_order: 3 },
    { code: "group", name: "Group Payment", description: "Collect from friends on any mobile banking", is_popular: true, sort_order: 4 },
  ],

  /**
   * Mirrors `payment_providers` rows where method = 'mobile_banking'.
   *
   * logo_url → official logo file. Put the provider's OFFICIAL artwork
   * (from its brand/press kit or merchant onboarding pack) at that path.
   * The UI tries .svg first, then .png, and shows a neutral name tile if
   * neither exists. It never draws an imitation logo.
   *
   * account_number_length = digits after +880 (leading 0 dropped).
   * Rocket account numbers are the mobile number + 1 check digit → 11.
   */
  payment_providers: [
    { code: "bkash",     method_code: "mobile_banking", name: "bKash",      name_bn: "বিকাশ",       operator_name: "BRAC Bank PLC",                      logo_url: "assets/img/mfs/bkash.png",     account_number_length: 10, is_featured: true,  sort_order: 1 },
    { code: "nagad",     method_code: "mobile_banking", name: "Nagad",      name_bn: "নগদ",        operator_name: "Nagad Ltd. (Bangladesh Post Office)", logo_url: "assets/img/mfs/nagad.png",     account_number_length: 10, is_featured: true,  sort_order: 2 },
    { code: "rocket",    method_code: "mobile_banking", name: "Rocket",     name_bn: "রকেট",       operator_name: "Dutch-Bangla Bank PLC",              logo_url: "assets/img/mfs/rocket.png",    account_number_length: 11, is_featured: true,  sort_order: 3 },
    { code: "upay",      method_code: "mobile_banking", name: "Upay",       name_bn: "উপায়",       operator_name: "United Commercial Bank PLC",         logo_url: "assets/img/mfs/upay.png",      account_number_length: 10, is_featured: true,  sort_order: 4 },
    { code: "tap",       method_code: "mobile_banking", name: "Tap",        name_bn: "ট্যাপ",       operator_name: "Trust Axiata Pay (Trust Bank PLC)",  logo_url: "assets/img/mfs/tap.png",       account_number_length: 10, is_featured: false, sort_order: 5 },
    { code: "surecash",  method_code: "mobile_banking", name: "SureCash",   name_bn: "শিওরক্যাশ",    operator_name: "Rupali Bank PLC & partner banks",    logo_url: "assets/img/mfs/surecash.png",  account_number_length: 10, is_featured: false, sort_order: 6 },
    { code: "ok_wallet", method_code: "mobile_banking", name: "OK Wallet",  name_bn: "ওকে ওয়ালেট",  operator_name: "ONE Bank PLC",                       logo_url: "assets/img/mfs/ok_wallet.png", account_number_length: 10, is_featured: false, sort_order: 7 },
    { code: "mcash",     method_code: "mobile_banking", name: "mCash",      name_bn: "এমক্যাশ",     operator_name: "Islami Bank Bangladesh PLC",         logo_url: "assets/img/mfs/mcash.png",     account_number_length: 10, is_featured: false, sort_order: 8 },
    { code: "mycash",    method_code: "mobile_banking", name: "MyCash",     name_bn: "মাইক্যাশ",    operator_name: "Mercantile Bank PLC",                logo_url: "assets/img/mfs/mycash.png",    account_number_length: 10, is_featured: false, sort_order: 9 },
    { code: "firstcash", method_code: "mobile_banking", name: "FirstCash",  name_bn: "ফার্স্টক্যাশ",  operator_name: "First Security Islami Bank PLC",     logo_url: "assets/img/mfs/firstcash.png", account_number_length: 10, is_featured: false, sort_order: 10 },
    { code: "cellfin",   method_code: "mobile_banking", name: "CellFin",    name_bn: "সেলফিন",      operator_name: "Islami Bank Bangladesh PLC",         logo_url: "assets/img/mfs/cellfin.png",   account_number_length: 10, is_featured: false, sort_order: 11 },
  ],

  // Mirrors the `coupons` table
  coupons: [
    { code: "PURPOSE10", discount_type: "percentage", discount_value: 10, max_discount_minor: 500000, min_order_minor: 100000, is_active: true },
    { code: "FLAT2000", discount_type: "fixed", discount_value: 200000, max_discount_minor: null, min_order_minor: 1000000, is_active: true },
  ],
};
