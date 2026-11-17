-- =====================================================================
--  Purpose Gateway — Reference & demo seed data
--  Run after schema.sql:  psql -d purpose_gateway -f seed.sql
--  Mirrors the mock data in assets/js/data.js so the UI looks the same
--  once it is switched to the real API.
-- =====================================================================
BEGIN;

-- ---------- Roles & permissions ----------
INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('super_admin',  'Super Admin',  'Full access to every module',                TRUE),
  ('operations',   'Operations',   'Manage merchants, providers and routing',     TRUE),
  ('risk_analyst', 'Risk Analyst', 'Review and resolve risk alerts',              TRUE),
  ('support',      'Support',      'Read-only access to transactions/merchants',  TRUE);

INSERT INTO permissions (code, module, description) VALUES
  ('dashboard.read',      'dashboard', 'View dashboard'),
  ('providers.read',      'providers', 'View payment providers'),
  ('providers.write',     'providers', 'Configure payment providers'),
  ('routing.read',        'routing',   'View routing rules'),
  ('routing.write',       'routing',   'Create/update routing rules'),
  ('merchants.read',      'merchants', 'View merchants'),
  ('merchants.write',     'merchants', 'Create/update merchants'),
  ('merchants.suspend',   'merchants', 'Suspend/reactivate merchants'),
  ('transactions.read',   'transactions', 'View transactions'),
  ('transactions.refund', 'transactions', 'Issue refunds'),
  ('risk.read',           'risk',      'View risk alerts'),
  ('risk.write',          'risk',      'Resolve risk alerts & manage risk rules'),
  ('audit.read',          'audit',     'View audit logs'),
  ('settings.write',      'settings',  'Change system settings'),
  ('monitor.read',        'monitor',   'View system monitor'),
  ('admins.write',        'settings',  'Manage admin users & roles');

-- super_admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'super_admin';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('dashboard.read','providers.read','providers.write','routing.read','routing.write','merchants.read','merchants.write','merchants.suspend','transactions.read','monitor.read')
WHERE r.name = 'operations';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('dashboard.read','transactions.read','merchants.read','risk.read','risk.write','audit.read')
WHERE r.name = 'risk_analyst';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN
  ('dashboard.read','transactions.read','merchants.read','providers.read')
WHERE r.name = 'support';

-- ---------- Admin user ----------
-- Replace the hash before use. Generate it with argon2id in the backend.
INSERT INTO admin_users (role_id, full_name, email, password_hash, status)
SELECT id, 'Admin', 'admin@purposegateway.local', '$argon2id$REPLACE_ME', 'active'
FROM roles WHERE name = 'super_admin';

-- ---------- Payment providers ----------
INSERT INTO payment_providers (code, name, type, status, fee_percent, fee_fixed, min_amount, max_amount, uptime_30d, success_rate_24h, avg_latency_ms, display_order) VALUES
  ('bkash',      'bKash',      'mfs',  'online', 1.850, 0, 10, 250000, 99.90, 99.10, 412, 1),
  ('nagad',      'Nagad',      'mfs',  'online', 1.700, 0, 10, 250000, 99.80, 98.60, 455, 2),
  ('rocket',     'Rocket',     'mfs',  'online', 1.800, 0, 10, 250000, 99.70, 98.20, 520, 3),
  ('visa',       'Visa',       'card', 'online', 2.300, 0, 50, NULL,   99.90, 99.30, 380, 4),
  ('mastercard', 'Mastercard', 'card', 'online', 2.300, 0, 50, NULL,   99.80, 99.00, 395, 5);

-- ---------- Merchants (sample) ----------
INSERT INTO merchants (merchant_code, business_name, business_type, email, phone, city, status, kyc_status, mode) VALUES
  ('PG-M-000001', 'Alpha Store',     'ecommerce', 'ops@alphastore.example',  '01700000001', 'Dhaka',      'active',    'approved', 'live'),
  ('PG-M-000002', 'Daraz Express',   'ecommerce', 'pay@darazx.example',      '01700000002', 'Dhaka',      'active',    'approved', 'live'),
  ('PG-M-000003', 'Shohoz Tickets',  'travel',    'finance@shohoz.example',  '01700000003', 'Chattogram', 'active',    'approved', 'live'),
  ('PG-M-000004', 'Green Grocers',   'retail',    'hello@greengro.example',  '01700000004', 'Sylhet',     'suspended', 'approved', 'live'),
  ('PG-M-000005', 'EduPath Academy', 'education', 'billing@edupath.example', '01700000005', 'Rajshahi',   'pending',   'pending',  'sandbox');

-- every active merchant may use every provider
INSERT INTO merchant_provider_configs (merchant_id, provider_id)
SELECT m.id, p.id FROM merchants m CROSS JOIN payment_providers p WHERE m.status = 'active';

-- ---------- Routing ----------
INSERT INTO routing_rules (name, description, priority, strategy, status)
VALUES ('High Value Rule', 'Send transactions >= ৳50,000 to the highest-success card or MFS provider', 10, 'highest_success', 'active'),
       ('Low Latency Fallback', 'Default rule: prefer the fastest healthy provider', 1000, 'lowest_latency', 'active');

INSERT INTO routing_rule_conditions (rule_id, field, operator, value)
SELECT id, 'amount', 'gte', '50000'::jsonb FROM routing_rules WHERE name = 'High Value Rule';

INSERT INTO routing_rule_targets (rule_id, provider_id, priority, weight)
SELECT r.id, p.id, p.display_order, 100
FROM routing_rules r CROSS JOIN payment_providers p
WHERE r.name IN ('High Value Rule', 'Low Latency Fallback');

-- ---------- Risk rules ----------
INSERT INTO risk_rules (name, alert_type, severity, action, config, score_weight) VALUES
  ('Velocity: >5 txns in 10 min per phone', 'velocity_breach',        'high',   'review', '{"key":"phone","window_minutes":10,"max_count":5}', 30),
  ('Large amount vs. merchant average x10', 'suspicious_transaction', 'high',   'flag',   '{"multiplier":10,"lookback_days":30}',              25),
  ('3+ failed attempts in 15 min',          'multiple_failures',      'medium', 'flag',   '{"window_minutes":15,"max_failures":3}',            15),
  ('Blocklist match',                       'blacklist_hit',          'critical','block', '{}',                                                100);

-- ---------- System ----------
INSERT INTO system_services (code, name, status, last_heartbeat_at) VALUES
  ('api',            'Public API',       'operational', now()),
  ('routing-engine', 'Routing Engine',   'operational', now()),
  ('risk-engine',    'Risk Engine',      'operational', now()),
  ('webhooks',       'Webhook Dispatcher','operational', now()),
  ('database',       'Primary Database', 'operational', now());

INSERT INTO system_settings (key, value, description) VALUES
  ('risk.auto_block_score',       '85',                'Transactions at or above this risk score are blocked automatically'),
  ('risk.review_score',           '60',                'Transactions at or above this score are held for review'),
  ('routing.default_strategy',    '"lowest_latency"',  'Strategy used when no rule matches'),
  ('routing.max_fallback_attempts','2',                'Maximum provider retries per transaction'),
  ('settlement.default_cycle_days','1',                'T+N settlement for new merchants'),
  ('ui.timezone',                 '"Asia/Dhaka"',      'Display timezone for the admin panel');

-- ---------- Audit / activity / notifications (demo) ----------
INSERT INTO audit_logs (actor_type, actor_id, actor_name, action, action_label, entity_type, ip_address, created_at)
SELECT 'admin', a.id, 'Admin', v.action, v.label, v.entity, '103.110.45.67', v.ts
FROM admin_users a,
 (VALUES
   ('routing_rule.updated',    'Updated Routing Rule',    'routing_rule', TIMESTAMPTZ '2025-11-30 14:32+06'),
   ('merchant.suspended',      'Suspended Merchant',      'merchant',     TIMESTAMPTZ '2025-11-30 14:20+06'),
   ('provider.config_updated', 'Updated Provider Config', 'provider',     TIMESTAMPTZ '2025-11-30 13:55+06'),
   ('risk_alert.viewed',       'Viewed Risk Alerts',      'risk_alert',   TIMESTAMPTZ '2025-11-30 13:40+06')
 ) AS v(action, label, entity, ts)
WHERE a.email = 'admin@purposegateway.local';

INSERT INTO activity_events (kind, title, meta, status_label, created_at) VALUES
  ('transaction', 'New transaction from Rahim Ahmed',        '৳ 2,500 via bKash',  'success', now() - interval '2 minutes'),
  ('routing',     'Routing rule updated: High Value Rule',   'by Admin',           'updated', now() - interval '5 minutes'),
  ('risk',        'Risk alert: Unusual transaction pattern', '৳ 87,000 via Nagad', 'flagged', now() - interval '8 minutes'),
  ('merchant',    'New merchant registered: Alpha Store',    NULL,                 'active',  now() - interval '2 hours');

INSERT INTO notifications (level, title, link) VALUES
  ('danger',  '3 high-severity risk alerts need review', '#risk'),
  ('warning', 'Rocket latency above 500ms threshold',    '#providers'),
  ('info',    'Monthly settlement report is ready',      '#dashboard');

COMMIT;
