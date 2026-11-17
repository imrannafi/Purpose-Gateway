-- =====================================================================
--  Purpose Gateway — Merchant Dashboard · seed data
--  Reproduces the design reference (Imran Un Nafi, ৳186,420.50 balance,
--  transactions #PGT-78449…78452 on 30 Nov 2025). Run after schema.sql.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------- lookups
INSERT INTO payment_methods (code, name, sort_order) VALUES
  ('mobile_banking', 'Mobile Banking', 1),
  ('card',           'Card',           2),
  ('wallet',         'Wallet',         3),
  ('bank_transfer',  'Bank Transfer',  4);

INSERT INTO payment_providers (payment_method_id, code, name, brand_color, sort_order) VALUES
  ((SELECT id FROM payment_methods WHERE code='mobile_banking'), 'bkash',      'bKash',         '#E2136E', 1),
  ((SELECT id FROM payment_methods WHERE code='mobile_banking'), 'nagad',      'Nagad',         '#F26522', 2),
  ((SELECT id FROM payment_methods WHERE code='mobile_banking'), 'rocket',     'Rocket',        '#8C3494', 3),
  ((SELECT id FROM payment_methods WHERE code='card'),           'card',       'Card',          '#2B5CF6', 4),
  ((SELECT id FROM payment_methods WHERE code='mobile_banking'), 'upay',       'Upay',          '#FFC20E', 5),
  ((SELECT id FROM payment_methods WHERE code='bank_transfer'),  'bank',       'Bank Transfer', '#0F766E', 6),
  ((SELECT id FROM payment_methods WHERE code='card'),           'visa',       'Visa',          '#1A1F71', 7),
  ((SELECT id FROM payment_methods WHERE code='card'),           'mastercard', 'Mastercard',    '#EB001B', 8);

INSERT INTO subscription_plans (code, name, price_minor, mfs_fee_bps, card_fee_bps, monthly_volume_limit_minor, max_payment_links, max_team_members, payout_speed, sort_order) VALUES
  ('starter',    'Starter',         0, 150, 250,  50000000,   20,  2, 'next_day', 1),   -- ৳5 lakh / month
  ('pro',        'Pro',        149900, 120, 220, 500000000, NULL, 10, 'same_day', 2),   -- ৳50 lakh / month
  ('enterprise', 'Enterprise',      0, 100, 200,      NULL, NULL, NULL, 'same_day', 3);

-- ---------------------------------------------------------------- merchant + user
INSERT INTO merchants (id, business_name, legal_name, slug, business_type, industry, email, phone, city, country_code, kyc_status, kyc_verified_at, status)
VALUES ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Nafi Lifestyle Store', 'Nafi Lifestyle Store', 'nafi-lifestyle', 'sole_proprietorship', 'Fashion & Apparel',
        'billing@nafilifestyle.example', '+8801712000890', 'Dhaka', 'BD', 'verified', '2025-03-01 10:00+06', 'active');

INSERT INTO merchant_users (id, merchant_id, full_name, display_title, email, role, status, email_verified_at, last_login_at)
VALUES ('b4a0c7de-2f61-4b8e-8d0a-91e6f3c2a7b5', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Imran Un Nafi', 'Merchant',
        'imran@nafilifestyle.example', 'owner', 'active', '2025-02-28 12:00+06', '2025-11-30 09:12+06');

INSERT INTO merchant_subscriptions (merchant_id, plan_id, status, current_period_start, current_period_end)
VALUES ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', (SELECT id FROM subscription_plans WHERE code='starter'), 'active', '2025-11-01 00:00+06', '2025-12-01 00:00+06');

-- ---------------------------------------------------------------- connected gateways (4 shown + "+2")
INSERT INTO merchant_gateways (merchant_id, provider_id, environment, status, display_order, connected_at)
SELECT '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', p.id, 'live', v.status::gateway_status, v.ord, v.connected_at::timestamptz
FROM (VALUES
  ('bkash',  'active',  1, '2025-03-02 10:12+06'),
  ('nagad',  'active',  2, '2025-03-02 10:20+06'),
  ('rocket', 'active',  3, '2025-04-11 16:45+06'),
  ('card',   'active',  4, '2025-05-19 12:00+06'),
  ('upay',   'active',  5, '2025-08-03 09:30+06'),
  ('bank',   'pending', 6, NULL)
) AS v(code, status, ord, connected_at)
JOIN payment_providers p ON p.code = v.code;

-- ---------------------------------------------------------------- customers
INSERT INTO customers (id, merchant_id, full_name, email, phone) VALUES
  ('c0000000-0000-4000-8000-000000000001', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Rahim Ahmed',  'rahim.ahmed@mail.example',  '+8801712345890'),
  ('c0000000-0000-4000-8000-000000000002', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Nusrat Jahan', 'nusrat.jahan@mail.example', '+8801819456214'),
  ('c0000000-0000-4000-8000-000000000003', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Tanvir Hasan', 'tanvir.hasan@mail.example', '+8801611223507'),
  ('c0000000-0000-4000-8000-000000000004', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'Samiya Akter', 'samiya.akter@mail.example', '+8801915667321');

-- ---------------------------------------------------------------- transactions (Recent Transactions table)
INSERT INTO transactions (public_id, merchant_id, customer_id, merchant_gateway_id, provider_id, payment_method_id, status, amount_minor, fee_minor,
                          provider_reference, payer_account_masked, card_brand, card_last4, failure_code, failure_message, paid_at, failed_at, created_at)
SELECT v.public_id, '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', v.customer_id::uuid, g.id, p.id, p.payment_method_id, v.status::transaction_status,
       v.amount, v.fee, v.ref, v.payer, v.brand, v.last4, v.fcode, v.fmsg,
       CASE WHEN v.status = 'success' THEN v.at::timestamptz END,
       CASE WHEN v.status = 'failed'  THEN v.at::timestamptz END,
       v.at::timestamptz
FROM (VALUES
  ('PGT-78452', 'c0000000-0000-4000-8000-000000000001', 'bkash',  'bkash',  'success', 250000, 3750,  'BK9JX2K7QF', '01712•••890', NULL,   NULL,   NULL,                 NULL,                                    '2025-11-30 14:45+06'),
  ('PGT-78451', 'c0000000-0000-4000-8000-000000000002', 'nagad',  'nagad',  'success', 320000, 4800,  'NG71230045', '01819•••214', NULL,   NULL,   NULL,                 NULL,                                    '2025-11-30 13:20+06'),
  ('PGT-78450', 'c0000000-0000-4000-8000-000000000003', 'rocket', 'rocket', 'failed',  175000, 0,     NULL,         '01611•••507', NULL,   NULL,   'insufficient_funds', 'Payer wallet has insufficient balance.', '2025-11-30 12:12+06'),
  ('PGT-78449', 'c0000000-0000-4000-8000-000000000004', 'visa',   'card',   'success', 420000, 10500, 'AUTH604112',   NULL,        'visa', '4242', NULL,                 NULL,                                    '2025-11-30 11:47+06')
) AS v(public_id, customer_id, provider_code, gateway_code, status, amount, fee, ref, payer, brand, last4, fcode, fmsg, at)
JOIN payment_providers p  ON p.code = v.provider_code
JOIN payment_providers gp ON gp.code = v.gateway_code
JOIN merchant_gateways g  ON g.provider_id = gp.id AND g.merchant_id = '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11';

INSERT INTO transaction_events (transaction_id, from_status, to_status, source, created_at)
SELECT id, 'pending', status, 'provider_webhook', created_at + interval '20 seconds' FROM transactions;

-- ---------------------------------------------------------------- payouts & balance
INSERT INTO payout_accounts (id, merchant_id, account_type, label, account_name, bank_name, branch_name, account_number_last4, is_default, status, verified_at) VALUES
  ('a0000000-0000-4000-8000-000000000001', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'bank_account', 'City Bank •••• 4521', 'Nafi Lifestyle Store', 'The City Bank PLC', 'Gulshan', '4521', true, 'verified', '2025-03-03 11:00+06');
INSERT INTO payout_accounts (id, merchant_id, account_type, label, account_name, wallet_provider_id, account_number_last4, is_default, status, verified_at) VALUES
  ('a0000000-0000-4000-8000-000000000002', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'mobile_wallet', 'bKash Merchant •••• 890', 'Imran Un Nafi', (SELECT id FROM payment_providers WHERE code='bkash'), '890', false, 'verified', '2025-03-03 11:05+06');

INSERT INTO payouts (public_id, merchant_id, payout_account_id, amount_minor, status, provider_reference, requested_by, requested_at, processed_at, paid_at)
VALUES ('PO-10240', '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'a0000000-0000-4000-8000-000000000001', 4500000, 'paid', 'NPSB2511300417', 'b4a0c7de-2f61-4b8e-8d0a-91e6f3c2a7b5',
        '2025-11-29 17:30+06', '2025-11-30 09:40+06', '2025-11-30 10:05+06');

-- Opening balance + the payout, so ledger and cached balance agree (৳186,420.50 available)
INSERT INTO ledger_entries (merchant_id, entry_type, bucket, amount_minor, balance_after_minor, description, created_at) VALUES
  ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'adjustment', 'available', 23142050, 23142050, 'Opening balance (migration)', '2025-11-01 00:00+06');
INSERT INTO ledger_entries (merchant_id, entry_type, bucket, amount_minor, balance_after_minor, payout_id, description, created_at)
SELECT merchant_id, 'payout', 'available', -4500000, 18642050, id, 'Payout PO-10240 to City Bank •••• 4521', requested_at FROM payouts WHERE public_id = 'PO-10240';

INSERT INTO merchant_balances (merchant_id, currency, available_minor, pending_minor, reserved_minor)
VALUES ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'BDT', 18642050, 2315000, 0);

INSERT INTO merchant_settings (merchant_id, statement_descriptor, payout_schedule, min_payout_minor, auto_payout_account_id)
VALUES ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'NAFI LIFESTYLE', 'manual', 50000, 'a0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------- analytics: daily rollups for Nov 2025
-- Shape mirrors the Revenue Overview chart; totals: ৳248,750 revenue, 2,847 transactions, 36 failed.
WITH shape(d, w) AS (
  SELECT d, w FROM unnest(ARRAY[.55,.6,.58,.5,.47,.55,.68,.75,.74,.7,.72,.8,.86,.9,.85,.75,.72,.78,.85,.88,.9,.92,.9,.86,.84,.86,.92,1.0,1.08,1.14]::numeric[])
         WITH ORDINALITY AS s(w, d)
), tot AS (SELECT SUM(w) s FROM shape)
INSERT INTO daily_merchant_stats (merchant_id, stat_date, gross_volume_minor, fee_minor, net_volume_minor, transactions_count, success_count, failed_count, unique_customers)
SELECT '6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11',
       DATE '2025-10-31' + d::int,
       ROUND(24875000 * w / tot.s / 100) * 100,
       ROUND(24875000 * w / tot.s * 0.017),
       ROUND(24875000 * w / tot.s / 100) * 100 - ROUND(24875000 * w / tot.s * 0.017),
       ROUND(2847 * w / tot.s),
       ROUND(2847 * w / tot.s) - CASE WHEN d % 5 = 0 THEN 2 ELSE 1 END,
       CASE WHEN d % 5 = 0 THEN 2 ELSE 1 END,
       ROUND(2847 * w / tot.s * 0.8)
FROM shape, tot;

-- absorb rounding on the last day so the month totals are exact
UPDATE daily_merchant_stats s SET
  gross_volume_minor = s.gross_volume_minor + d.rev_gap,
  net_volume_minor   = s.net_volume_minor   + d.rev_gap,
  transactions_count = s.transactions_count + d.txn_gap,
  success_count      = s.success_count      + d.txn_gap
FROM (SELECT 24875000 - SUM(gross_volume_minor) AS rev_gap, 2847 - SUM(transactions_count) AS txn_gap
      FROM daily_merchant_stats WHERE stat_date BETWEEN '2025-11-01' AND '2025-11-30') d
WHERE s.stat_date = '2025-11-30';

-- keep generated public IDs ahead of the hand-written ones above
SELECT setval('transaction_public_seq', 78452);
SELECT setval('payout_public_seq', 10240);

-- ---------------------------------------------------------------- notifications
INSERT INTO notifications (merchant_id, type, title, body, entity_type, created_at, read_at) VALUES
  ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'payout',         'Payout settled',        '৳45,000.00 was sent to City Bank •••• 4521.',          'payout',      '2025-11-30 10:05+06', NULL),
  ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'payment_failed', 'Payment failed',        '#PGT-78450 from Tanvir Hasan via Rocket failed.',      'transaction', '2025-11-30 12:13+06', NULL),
  ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'gateway',        'Bank Transfer pending', 'Upload your trade license to finish activation.',       'gateway',     '2025-11-29 18:40+06', NULL),
  ('6f1c2a9e-0d3b-4c1e-9a77-3f0b8e5d2c11', 'system',         'Monthly report ready',  'Your October 2025 statement is available to download.', NULL,         '2025-11-01 09:00+06', '2025-11-01 11:00+06');

COMMIT;
