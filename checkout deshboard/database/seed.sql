-- =====================================================================
--  Purpose Gateway — seed data (matches the checkout screen design)
--  Run after schema.sql.  Not executed automatically.
-- =====================================================================
BEGIN;

-- Payment methods (the 4 tiles)
INSERT INTO payment_methods (code, name, description, icon, is_popular, is_new, sort_order) VALUES
  ('card',           'Card Payment',   'Visa, Mastercard & more', 'card',   false, false, 1),
  ('mobile_banking', 'Mobile Banking', 'bKash, Nagad, Rocket',    'phone',  false, false, 2),
  ('wallet',         'Wallet',         'Google Pay, Apple Pay',   'wallet', false, false, 3),
  ('group',          'Group Payment',  'Pay together',            'users',  true,  true,  4);

-- Operators (institutions behind each provider)
INSERT INTO provider_operators (code, legal_name, operator_type, regulator) VALUES
  ('brac_bank',  'BRAC Bank PLC',                        'bank',         'Bangladesh Bank'),
  ('nagad_ltd',  'Nagad Ltd. (Bangladesh Post Office)',  'mfs_company',  'Bangladesh Bank'),
  ('dbbl',       'Dutch-Bangla Bank PLC',                'bank',         'Bangladesh Bank'),
  ('ucb',        'United Commercial Bank PLC',           'bank',         'Bangladesh Bank'),
  ('trust_bank', 'Trust Axiata Pay (Trust Bank PLC)',    'bank',         'Bangladesh Bank'),
  ('rupali',     'Rupali Bank PLC & partner banks',      'bank',         'Bangladesh Bank'),
  ('one_bank',   'ONE Bank PLC',                         'bank',         'Bangladesh Bank'),
  ('ibbl',       'Islami Bank Bangladesh PLC',           'bank',         'Bangladesh Bank'),
  ('mercantile', 'Mercantile Bank PLC',                  'bank',         'Bangladesh Bank'),
  ('fsibl',      'First Security Islami Bank PLC',       'bank',         'Bangladesh Bank'),
  ('visa',       'Visa Inc.',                            'card_network', NULL),
  ('mastercard', 'Mastercard Inc.',                      'card_network', NULL),
  ('amex',       'American Express Company',             'card_network', NULL),
  ('google',     'Google LLC',                           'tech_company', NULL),
  ('apple',      'Apple Inc.',                           'tech_company', NULL);

-- Providers
--  • fee_percent is 0 here on purpose: set real rates from each provider contract.
--  • logo_url points at the official file the provider supplies (see assets/img/mfs/README.md).
--  • account_number_length = digits after +880 (Rocket = mobile number + 1 check digit).
INSERT INTO payment_providers
  (payment_method_id, operator_id, code, name, name_bn, logo_url, integration_type,
   account_number_length, account_number_regex, is_featured, sort_order)
SELECT pm.id, op.id, p.code, p.name, p.name_bn, p.logo, p.integ::provider_integration_type,
       p.acc_len, p.acc_re, p.featured, p.ord
FROM (VALUES
  -- method,          code,        name,               name_bn,         operator,     logo,                               integration,     len,  regex,                featured, ord
  ('card',           'visa',       'Visa',             NULL,            'visa',       NULL,                               'hosted_fields', NULL, NULL,                 false, 1),
  ('card',           'mastercard', 'Mastercard',       NULL,            'mastercard', NULL,                               'hosted_fields', NULL, NULL,                 false, 2),
  ('card',           'amex',       'American Express', NULL,            'amex',       NULL,                               'hosted_fields', NULL, NULL,                 false, 3),
  ('mobile_banking', 'bkash',      'bKash',            'বিকাশ',          'brac_bank',  '/assets/img/mfs/bkash.svg',        'redirect',      10,   '^1[3-9][0-9]{8}$',   true,  1),
  ('mobile_banking', 'nagad',      'Nagad',            'নগদ',           'nagad_ltd',  '/assets/img/mfs/nagad.svg',        'redirect',      10,   '^1[3-9][0-9]{8}$',   true,  2),
  ('mobile_banking', 'rocket',     'Rocket',           'রকেট',          'dbbl',       '/assets/img/mfs/rocket.svg',       'redirect',      11,   '^1[3-9][0-9]{9}$',   true,  3),
  ('mobile_banking', 'upay',       'Upay',             'উপায়',          'ucb',        '/assets/img/mfs/upay.svg',         'redirect',      10,   '^1[3-9][0-9]{8}$',   true,  4),
  ('mobile_banking', 'tap',        'Tap',              'ট্যাপ',          'trust_bank', '/assets/img/mfs/tap.svg',          'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 5),
  ('mobile_banking', 'surecash',   'SureCash',         'শিওরক্যাশ',       'rupali',     '/assets/img/mfs/surecash.svg',     'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 6),
  ('mobile_banking', 'ok_wallet',  'OK Wallet',        'ওকে ওয়ালেট',     'one_bank',   '/assets/img/mfs/ok_wallet.svg',    'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 7),
  ('mobile_banking', 'mcash',      'mCash',            'এমক্যাশ',        'ibbl',       '/assets/img/mfs/mcash.svg',        'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 8),
  ('mobile_banking', 'mycash',     'MyCash',           'মাইক্যাশ',       'mercantile', '/assets/img/mfs/mycash.svg',       'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 9),
  ('mobile_banking', 'firstcash',  'FirstCash',        'ফার্স্টক্যাশ',     'fsibl',      '/assets/img/mfs/firstcash.svg',    'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 10),
  ('mobile_banking', 'cellfin',    'CellFin',          'সেলফিন',         'ibbl',       '/assets/img/mfs/cellfin.svg',      'redirect',      10,   '^1[3-9][0-9]{8}$',   false, 11),
  ('wallet',         'google_pay', 'Google Pay',       NULL,            'google',     NULL,                               'sdk',           NULL, NULL,                 false, 1),
  ('wallet',         'apple_pay',  'Apple Pay',        NULL,            'apple',      NULL,                               'sdk',           NULL, NULL,                 false, 2),
  ('group',          'group',      'Group Split',      NULL,            NULL,         NULL,                               'api',           NULL, NULL,                 false, 1)
) AS p(method, code, name, name_bn, operator, logo, integ, acc_len, acc_re, featured, ord)
JOIN payment_methods pm ON pm.code = p.method::payment_method_code
LEFT JOIN provider_operators op ON op.code = p.operator;

-- Adding another provider later is a single row, e.g.:
--   INSERT INTO payment_providers (payment_method_id, operator_id, code, name, logo_url, account_number_length, sort_order)
--   SELECT pm.id, op.id, 'new_mfs', 'New MFS', '/assets/img/mfs/new_mfs.svg', 10, 12
--   FROM payment_methods pm, provider_operators op
--   WHERE pm.code = 'mobile_banking' AND op.code = 'some_bank';
-- Then register its official logo in payment_provider_assets (source + approved_at).

-- Merchant
INSERT INTO merchants (id, name, slug, email, status)
VALUES ('1b2c3d4e-0000-4000-8000-000000000001', 'Purpose Store', 'purpose-store', 'store@example.com', 'active');

INSERT INTO merchant_payment_providers (merchant_id, provider_id)
SELECT '1b2c3d4e-0000-4000-8000-000000000001', id FROM payment_providers;

-- Customer
INSERT INTO users (id, full_name, email, phone, email_verified_at)
VALUES ('8f6c1d2e-4b7a-4e0e-9c1a-0a1b2c3d4e5f', 'Rahim Ahmed', 'rahim@example.com', '+8801712345678', now());

-- Product + variant: MacBook Air M2, 13.6″ • 8GB RAM • 256GB SSD, Silver — ৳95,000
INSERT INTO products (id, merchant_id, name, slug, brand)
VALUES ('2a000000-0000-4000-8000-000000000001', '1b2c3d4e-0000-4000-8000-000000000001', 'MacBook Air M2', 'macbook-air-m2', 'Apple');

INSERT INTO product_variants (id, product_id, sku, attributes, price_minor, stock_quantity)
VALUES ('2b000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', 'MBA-M2-8-256-SLV',
        '{"screen":"13.6″","ram":"8GB RAM","storage":"256GB SSD","color":"Silver"}', 9500000, 25);

-- Coupons
INSERT INTO coupons (merchant_id, code, description, discount_type, discount_value, max_discount_minor, min_order_minor) VALUES
  (NULL, 'PURPOSE10', '10% off, up to ৳5,000',  'percentage', 10,     500000, 100000),
  (NULL, 'FLAT2000',  '৳2,000 off over ৳10,000', 'fixed',      200000, NULL,   1000000);

-- Order
INSERT INTO orders (id, order_number, merchant_id, user_id, status, currency,
                    subtotal_minor, discount_minor, delivery_charge_minor, tax_minor, total_minor, placed_at)
VALUES ('3a000000-0000-4000-8000-000000000001', 'PG-2026-000148', '1b2c3d4e-0000-4000-8000-000000000001',
        '8f6c1d2e-4b7a-4e0e-9c1a-0a1b2c3d4e5f', 'pending_payment', 'BDT',
        9500000, 0, 0, 0, 9500000, now());

INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_attributes, sku,
                         unit_price_minor, quantity, line_total_minor)
VALUES ('3a000000-0000-4000-8000-000000000001', '2a000000-0000-4000-8000-000000000001', '2b000000-0000-4000-8000-000000000001',
        'MacBook Air M2', '{"screen":"13.6″","ram":"8GB RAM","storage":"256GB SSD","color":"Silver"}', 'MBA-M2-8-256-SLV',
        9500000, 1, 9500000);

-- Checkout session (30 min expiry)
INSERT INTO checkout_sessions (public_token, order_id, user_id, current_step, selected_method_id, expires_at)
SELECT 'cs_7Hk2pQ9xLm', '3a000000-0000-4000-8000-000000000001', '8f6c1d2e-4b7a-4e0e-9c1a-0a1b2c3d4e5f',
       'payment_method', id, now() + interval '30 minutes'
FROM payment_methods WHERE code = 'card';

COMMIT;
