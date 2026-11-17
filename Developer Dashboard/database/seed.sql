-- =====================================================================
--  Purpose Gateway — seed / demo data
--  Mirrors the mock data in assets/js/mock-data.js so the UI looks the
--  same once it is connected. Run AFTER schema.sql. Safe for dev/staging only.
-- =====================================================================
BEGIN;

-- ---------- catalogs ----------
INSERT INTO payment_methods (code, name, kind, min_amount, display_order) VALUES
  ('bkash',      'bKash',      'mobile_wallet', 1000, 1),
  ('nagad',      'Nagad',      'mobile_wallet', 1000, 2),
  ('rocket',     'Rocket',     'mobile_wallet', 1000, 3),
  ('visa',       'Visa',       'card',          100,  4),
  ('mastercard', 'Mastercard', 'card',          100,  5);

INSERT INTO services (name, slug, display_order) VALUES
  ('Payment Processing', 'payment-processing', 1),
  ('API Services',       'api',                2),
  ('Webhooks',           'webhooks',           3),
  ('Dashboard',          'dashboard',          4);

INSERT INTO onboarding_steps (step_key, position, title, description, cta_url) VALUES
  ('read_docs',     1, 'Read the Documentation',  'Explore our comprehensive API docs.', '/docs'),
  ('get_keys',      2, 'Get Your API Keys',       'Generate keys from your dashboard.',  '/api-keys'),
  ('first_request', 3, 'Make Your First Request', 'Try our APIs and see the magic.',     '/sandbox');

INSERT INTO sdk_libraries (language, display_name, package_name, latest_version, install_command, repository_url) VALUES
  ('node',   'Node.js', '@purposegateway/node',   '2.4.0', 'npm install @purposegateway/node',          'https://github.com/purposegateway/purposegateway-node'),
  ('python', 'Python',  'purposegateway',         '1.9.2', 'pip install purposegateway',                'https://github.com/purposegateway/purposegateway-python'),
  ('php',    'PHP',     'purposegateway/purposegateway-php', '1.6.0', 'composer require purposegateway/purposegateway-php', 'https://github.com/purposegateway/purposegateway-php');

INSERT INTO tutorials (title, description, video_url, duration_seconds, is_featured) VALUES
  ('Accept your first payment in 5 minutes', 'Create keys, send a sandbox payment and handle the webhook.', 'https://videos.example.com/pg-quickstart.mp4', 312, true);

-- ---------- docs ----------
INSERT INTO doc_categories (slug, name, position) VALUES
  ('getting-started', 'Getting Started', 1),
  ('payments',        'Payments',        2),
  ('webhooks',        'Webhooks',        3),
  ('payment-methods', 'Payment Methods', 4);

INSERT INTO doc_articles (category_id, slug, title, summary, kind, is_published, published_at) VALUES
  ((SELECT id FROM doc_categories WHERE slug='getting-started'), 'auth',               'Authentication',      'Bearer tokens & key types',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='getting-started'), 'idempotency',        'Idempotent requests', 'Safely retry POST requests',       'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='getting-started'), 'errors',             'Error codes',         'HTTP status & error objects',      'reference', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='getting-started'), 'rate-limits',        'Rate limits',         'Quotas and retry strategy',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='webhooks'),        'webhook-signatures', 'Webhook signatures',  'Verify event authenticity',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='payment-methods'), 'bkash',              'bKash integration',   'Mobile financial services',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='payment-methods'), 'nagad',              'Nagad integration',   'Mobile financial services',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='payment-methods'), 'rocket',             'Rocket integration',  'Mobile financial services',        'guide', true, now()),
  ((SELECT id FROM doc_categories WHERE slug='payment-methods'), 'cards',              'Card payments (Visa / Mastercard)', '3-D Secure & tokenization', 'guide', true, now());

INSERT INTO api_endpoints (operation_id, method, path, summary, category_id) VALUES
  ('payments.create',  'POST', '/pay',               'Create a payment',          (SELECT id FROM doc_categories WHERE slug='payments')),
  ('payments.get',     'GET',  '/payments/{id}',     'Retrieve a payment',        (SELECT id FROM doc_categories WHERE slug='payments')),
  ('payments.list',    'GET',  '/payments',          'List payments',             (SELECT id FROM doc_categories WHERE slug='payments')),
  ('refunds.create',   'POST', '/refunds',           'Create a refund',           (SELECT id FROM doc_categories WHERE slug='payments')),
  ('webhooks.create',  'POST', '/webhook_endpoints', 'Register webhook endpoint', (SELECT id FROM doc_categories WHERE slug='webhooks'));

INSERT INTO code_samples (endpoint_id, language, label, position, code)
SELECT e.id, s.language::code_language, s.label, s.position, s.code
FROM api_endpoints e
CROSS JOIN (VALUES
  ('curl', 'cURL', 1, E'curl -X POST https://api.purposegateway.com/pay \\\n  -H "Authorization: Bearer {{KEY}}" \\\n  -H "Content-Type: application/json" \\\n  -d ''{\n    "amount": 1000,\n    "currency": "BDT",\n    "method": "bKash"\n  }'''),
  ('node', 'Node.js', 2, E'import PurposeGateway from "@purposegateway/node";\n\nconst pg = new PurposeGateway("{{KEY}}");\n\nconst payment = await pg.payments.create({\n  amount: 1000,\n  currency: "BDT",\n  method: "bKash",\n});\n\nconsole.log(payment.id);'),
  ('python', 'Python', 3, E'import purposegateway\n\nclient = purposegateway.Client("{{KEY}}")\n\npayment = client.payments.create(\n    amount=1000,\n    currency="BDT",\n    method="bKash",\n)\n\nprint(payment.id)'),
  ('php', 'PHP', 4, E'<?php\n$client = new \\PurposeGateway\\Client("{{KEY}}");\n\n$payment = $client->payments->create([\n    "amount"   => 1000,\n    "currency" => "BDT",\n    "method"   => "bKash",\n]);\n\necho $payment->id;')
) AS s(language, label, position, code)
WHERE e.operation_id = 'payments.create';

-- ---------- demo tenant ----------
INSERT INTO organizations (id, name, slug, live_mode_enabled) VALUES
  ('a9d6b3c2-1111-4c4c-8e8e-000000000001', 'Purpose Demo Store', 'purpose-demo', true);

INSERT INTO users (id, email, full_name, job_title, email_verified_at) VALUES
  ('6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'imran@example.com', 'Imran Un Nafi', 'Developer', now());

INSERT INTO organization_members (organization_id, user_id, role, joined_at) VALUES
  ('a9d6b3c2-1111-4c4c-8e8e-000000000001', '6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'owner', now());

INSERT INTO user_preferences (user_id, sandbox_mode) VALUES
  ('6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', true);

-- Keys: only the sha256 hash, prefix and last four are stored.
INSERT INTO api_keys (organization_id, created_by, name, environment, key_type, key_prefix, last_four, key_hash) VALUES
  ('a9d6b3c2-1111-4c4c-8e8e-000000000001', '6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'Live API Key', 'live', 'publishable', 'pk_live_', '9f3a',
     encode(sha256(convert_to('pk_live_51PgWq8LxD2nR7tYz4KcV9f3a', 'UTF8')), 'hex')),
  ('a9d6b3c2-1111-4c4c-8e8e-000000000001', '6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'Test API Key', 'test', 'publishable', 'pk_test_', '2b7e',
     encode(sha256(convert_to('pk_test_51PgWq8LxD2nR7tYz4KcV2b7e', 'UTF8')), 'hex'));

INSERT INTO organization_payment_methods (organization_id, payment_method_id, environment)
SELECT 'a9d6b3c2-1111-4c4c-8e8e-000000000001', pm.id, env::environment_type
FROM payment_methods pm CROSS JOIN (VALUES ('live'), ('test')) AS e(env);

INSERT INTO user_onboarding_progress (user_id, step_id)
SELECT '6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', id FROM onboarding_steps WHERE step_key IN ('read_docs', 'get_keys');

INSERT INTO notifications (user_id, organization_id, type, title, body, created_at) VALUES
  ('6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'a9d6b3c2-1111-4c4c-8e8e-000000000001', 'warning', 'Webhook delivery failing',     'https://shop.example.com/hooks returned 500 — retrying (3/8).', now() - interval '1 hour'),
  ('6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', NULL,                                   'info',    'Node.js SDK v2.4.0 released',  'Adds idempotency helpers and Nagad tokenization.',             now() - interval '1 day'),
  ('6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01', 'a9d6b3c2-1111-4c4c-8e8e-000000000001', 'success', 'First sandbox payment',        'Your test key processed its first bKash payment.',             now() - interval '2 days');

-- 90 days of usage roll-ups (~12.5M requests over the last 30 days).
INSERT INTO api_usage_daily (organization_id, environment, usage_date, total_requests, successful_requests, client_errors, server_errors, total_latency_ms, p95_latency_ms)
SELECT 'a9d6b3c2-1111-4c4c-8e8e-000000000001', 'live', d::date, t, t - (t / 1000), (t / 1000) - (t / 4000), t / 4000, t * 1200, 2100
FROM (
  SELECT d, (195000 + 120000 * sin(extract(doy FROM d) / 4.0) + 3000 * (d::date - (current_date - 90)))::bigint AS t
  FROM generate_series(current_date - 89, current_date, interval '1 day') AS d
) s;

-- 30 days of uptime per service (99.99% average).
INSERT INTO service_uptime_daily (service_id, day, uptime_percent, downtime_seconds)
SELECT s.id, d::date, CASE WHEN extract(day FROM d) = 9 THEN 99.80 ELSE 99.997 END, CASE WHEN extract(day FROM d) = 9 THEN 173 ELSE 3 END
FROM services s CROSS JOIN generate_series(current_date - 29, current_date, interval '1 day') AS d;

COMMIT;
