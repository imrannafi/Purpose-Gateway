-- =====================================================================
--  Purpose Gateway — Database Schema
--  Target:   PostgreSQL 15+
--  Status:   ARCHITECTURE ONLY. Not connected to the application yet.
--  Run:      psql -d purpose_gateway -f schema.sql
--
--  Conventions
--   * snake_case names, plural table names
--   * UUID primary keys (gen_random_uuid(), built into PG13+)
--   * Money is NUMERIC(14,2) plus a currency code. Never use FLOAT for money.
--   * Every table has created_at; mutable tables also have updated_at,
--     maintained by the set_updated_at() trigger
--   * Soft delete (deleted_at) only where business records must be kept
--   * Secrets (API keys, provider credentials) are stored hashed or encrypted.
--     Never store them in plain text.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid(), digest()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email

-- ---------------------------------------------------------------------
-- 0. ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE admin_status        AS ENUM ('active', 'invited', 'disabled');
CREATE TYPE merchant_status     AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE kyc_status          AS ENUM ('not_submitted', 'pending', 'approved', 'rejected');
CREATE TYPE provider_type       AS ENUM ('mfs', 'card', 'bank', 'wallet');
CREATE TYPE provider_status     AS ENUM ('online', 'degraded', 'down', 'maintenance');
CREATE TYPE environment_mode    AS ENUM ('sandbox', 'live');
CREATE TYPE txn_status          AS ENUM ('initiated', 'pending', 'processing', 'success', 'failed', 'cancelled', 'refunded', 'partially_refunded', 'chargeback');
CREATE TYPE refund_status       AS ENUM ('requested', 'processing', 'completed', 'failed', 'rejected');
CREATE TYPE settlement_status   AS ENUM ('scheduled', 'processing', 'paid', 'failed', 'on_hold');
CREATE TYPE rule_status         AS ENUM ('active', 'inactive', 'draft');
CREATE TYPE routing_strategy    AS ENUM ('priority', 'weighted', 'lowest_cost', 'highest_success', 'lowest_latency');
CREATE TYPE condition_operator  AS ENUM ('eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'not_in', 'between', 'contains');
CREATE TYPE risk_severity       AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE risk_alert_type     AS ENUM ('suspicious_transaction', 'unusual_activity', 'multiple_failures', 'velocity_breach', 'blacklist_hit', 'chargeback_risk', 'geo_mismatch');
CREATE TYPE risk_alert_status   AS ENUM ('open', 'investigating', 'resolved', 'dismissed', 'escalated');
CREATE TYPE risk_action         AS ENUM ('flag', 'review', 'block', 'allow');
CREATE TYPE blocklist_kind      AS ENUM ('phone', 'email', 'card_bin', 'card_fingerprint', 'ip', 'device');
CREATE TYPE activity_kind       AS ENUM ('transaction', 'routing', 'risk', 'merchant', 'provider', 'system', 'settlement');
CREATE TYPE notification_level  AS ENUM ('info', 'success', 'warning', 'danger');
CREATE TYPE webhook_status      AS ENUM ('pending', 'delivered', 'failed', 'retrying');
CREATE TYPE service_status      AS ENUM ('operational', 'degraded', 'outage', 'maintenance');

-- ---------------------------------------------------------------------
-- Helper: auto-update updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. ACCESS CONTROL (admin panel users)
-- =====================================================================
CREATE TABLE roles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(50)  NOT NULL UNIQUE,          -- 'super_admin', 'ops', 'risk_analyst', 'support'
  display_name VARCHAR(100) NOT NULL,                 -- 'Super Admin'
  description  TEXT,
  is_system    BOOLEAN      NOT NULL DEFAULT FALSE,   -- system roles cannot be deleted
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(100) NOT NULL UNIQUE,           -- 'merchants.suspend', 'routing.write'
  module      VARCHAR(50)  NOT NULL,                  -- 'merchants', 'routing', 'risk' ...
  description TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE admin_users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id         UUID         NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  full_name       VARCHAR(120) NOT NULL,
  email           CITEXT       NOT NULL UNIQUE,
  phone           VARCHAR(20),
  password_hash   TEXT         NOT NULL,              -- argon2id / bcrypt
  avatar_url      TEXT,
  status          admin_status NOT NULL DEFAULT 'active',
  mfa_enabled     BOOLEAN      NOT NULL DEFAULT FALSE,
  mfa_secret_enc  BYTEA,                              -- encrypted TOTP secret
  last_login_at   TIMESTAMPTZ,
  last_login_ip   INET,
  failed_logins   SMALLINT     NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID        NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash    TEXT        NOT NULL UNIQUE,          -- sha256 of the refresh token
  ip_address    INET,
  user_agent    TEXT,
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions(admin_user_id);

-- =====================================================================
-- 2. MERCHANTS
-- =====================================================================
CREATE TABLE merchants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_code     VARCHAR(20)     NOT NULL UNIQUE,  -- public id, e.g. 'PG-M-000123'
  business_name     VARCHAR(160)    NOT NULL,
  legal_name        VARCHAR(160),
  business_type     VARCHAR(60),                      -- 'ecommerce', 'travel', 'education' ...
  category_mcc      CHAR(4),                          -- merchant category code
  contact_name      VARCHAR(120),
  email             CITEXT          NOT NULL UNIQUE,
  phone             VARCHAR(20),
  website_url       TEXT,
  address_line      TEXT,
  city              VARCHAR(80),
  country_code      CHAR(2)         NOT NULL DEFAULT 'BD',
  trade_license_no  VARCHAR(60),
  tin_no            VARCHAR(30),
  status            merchant_status NOT NULL DEFAULT 'pending',
  kyc_status        kyc_status      NOT NULL DEFAULT 'not_submitted',
  risk_level        risk_severity   NOT NULL DEFAULT 'low',
  mode              environment_mode NOT NULL DEFAULT 'sandbox',
  settlement_cycle_days SMALLINT    NOT NULL DEFAULT 1 CHECK (settlement_cycle_days BETWEEN 0 AND 30),
  default_currency  CHAR(3)         NOT NULL DEFAULT 'BDT',
  suspended_reason  TEXT,
  suspended_at      TIMESTAMPTZ,
  approved_by       UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX idx_merchants_status ON merchants(status) WHERE deleted_at IS NULL;

CREATE TABLE merchant_users (                         -- logins for the Merchant Dashboard
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id    UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  full_name      VARCHAR(120) NOT NULL,
  email          CITEXT       NOT NULL UNIQUE,
  password_hash  TEXT         NOT NULL,
  role           VARCHAR(30)  NOT NULL DEFAULT 'owner', -- owner | developer | finance | viewer
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_merchant_users_merchant ON merchant_users(merchant_id);

CREATE TABLE merchant_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  UUID             NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  label        VARCHAR(80),
  mode         environment_mode NOT NULL,
  key_prefix   VARCHAR(16)      NOT NULL,             -- shown in UI: 'pk_live_ab12…'
  key_hash     TEXT             NOT NULL UNIQUE,      -- sha256(secret)
  scopes       TEXT[]           NOT NULL DEFAULT ARRAY['payments:write','payments:read'],
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_merchant ON merchant_api_keys(merchant_id);

CREATE TABLE merchant_bank_accounts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  account_name     VARCHAR(160) NOT NULL,
  account_no_enc   BYTEA        NOT NULL,             -- encrypted
  account_no_last4 CHAR(4)      NOT NULL,
  bank_name        VARCHAR(120) NOT NULL,
  branch_name      VARCHAR(120),
  routing_no       VARCHAR(20),
  is_primary       BOOLEAN      NOT NULL DEFAULT FALSE,
  verified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
-- at most one primary account per merchant
CREATE UNIQUE INDEX uq_bank_primary ON merchant_bank_accounts(merchant_id) WHERE is_primary;

CREATE TABLE merchant_kyc_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  UUID        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  doc_type     VARCHAR(40) NOT NULL,                  -- 'trade_license', 'nid', 'tin', 'bank_statement'
  file_url     TEXT        NOT NULL,                  -- object storage key
  status       kyc_status  NOT NULL DEFAULT 'pending',
  reviewed_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  reject_note  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_merchant ON merchant_kyc_documents(merchant_id);

-- =====================================================================
-- 3. PAYMENT PROVIDERS
-- =====================================================================
CREATE TABLE payment_providers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                VARCHAR(30)     NOT NULL UNIQUE, -- 'bkash', 'nagad', 'rocket', 'visa', 'mastercard'
  name                VARCHAR(80)     NOT NULL,
  type                provider_type   NOT NULL,
  logo_url            TEXT,
  status              provider_status NOT NULL DEFAULT 'online',
  is_enabled          BOOLEAN         NOT NULL DEFAULT TRUE,
  supported_currencies CHAR(3)[]      NOT NULL DEFAULT ARRAY['BDT']::CHAR(3)[],
  min_amount          NUMERIC(14,2)   NOT NULL DEFAULT 10,
  max_amount          NUMERIC(14,2),
  fee_percent         NUMERIC(5,3)    NOT NULL DEFAULT 0,   -- e.g. 1.850 (%)
  fee_fixed           NUMERIC(10,2)   NOT NULL DEFAULT 0,
  -- denormalized health snapshot, refreshed by the monitor job (dashboard reads this)
  uptime_30d          NUMERIC(5,2),                          -- 99.90
  success_rate_24h    NUMERIC(5,2),
  avg_latency_ms      INTEGER,
  last_health_check_at TIMESTAMPTZ,
  display_order       SMALLINT        NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE provider_credentials (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    UUID             NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  mode           environment_mode NOT NULL,
  base_url       TEXT             NOT NULL,
  config_enc     BYTEA            NOT NULL,           -- encrypted JSON: app_key, secret, username …
  key_version    SMALLINT         NOT NULL DEFAULT 1, -- for KMS key rotation
  is_active      BOOLEAN          NOT NULL DEFAULT TRUE,
  rotated_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  UNIQUE (provider_id, mode)
);

CREATE TABLE provider_health_checks (                 -- time series; prune or partition by month
  id           BIGSERIAL PRIMARY KEY,
  provider_id  UUID            NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  status       provider_status NOT NULL,
  latency_ms   INTEGER,
  http_status  SMALLINT,
  error        TEXT,
  checked_at   TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX idx_health_provider_time ON provider_health_checks(provider_id, checked_at DESC);

CREATE TABLE merchant_provider_configs (              -- which providers a merchant may use, and at what pricing
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_id   UUID          NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  is_enabled    BOOLEAN       NOT NULL DEFAULT TRUE,
  fee_percent   NUMERIC(5,3),                          -- NULL = use provider default
  fee_fixed     NUMERIC(10,2),
  daily_limit   NUMERIC(14,2),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider_id)
);

-- =====================================================================
-- 4. CUSTOMERS & TRANSACTIONS
-- =====================================================================
CREATE TABLE customers (                              -- payers (scoped per merchant)
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id   UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  external_ref  VARCHAR(100),                         -- merchant's own customer id
  full_name     VARCHAR(120),
  email         CITEXT,
  phone         VARCHAR(20),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, external_ref)
);
CREATE INDEX idx_customers_phone ON customers(phone);

-- NOTE: at scale, partition this table by RANGE (created_at), one partition per month.
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  txn_ref             VARCHAR(24)    NOT NULL UNIQUE,  -- public id, e.g. 'TXN-8F21A9C3'
  merchant_id         UUID           NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id         UUID           REFERENCES customers(id) ON DELETE SET NULL,
  provider_id         UUID           REFERENCES payment_providers(id) ON DELETE RESTRICT, -- NULL until routed
  routing_rule_id     UUID,                            -- FK added after routing_rules is created
  merchant_order_id   VARCHAR(100)   NOT NULL,         -- merchant's invoice/order no
  idempotency_key     VARCHAR(100),
  amount              NUMERIC(14,2)  NOT NULL CHECK (amount > 0),
  currency            CHAR(3)        NOT NULL DEFAULT 'BDT',
  fee_amount          NUMERIC(14,2)  NOT NULL DEFAULT 0,
  net_amount          NUMERIC(14,2)  GENERATED ALWAYS AS (amount - fee_amount) STORED,
  refunded_amount     NUMERIC(14,2)  NOT NULL DEFAULT 0,
  status              txn_status     NOT NULL DEFAULT 'initiated',
  payment_method      VARCHAR(30),                     -- 'wallet', 'card', 'netbanking'
  payer_account_mask  VARCHAR(30),                     -- '017••••4321' / '4111 •••• 1111'
  card_bin            CHAR(6),
  card_fingerprint    VARCHAR(64),
  provider_txn_id     VARCHAR(100),                    -- id returned by bKash/Nagad/…
  failure_code        VARCHAR(50),
  failure_message     TEXT,
  risk_score          SMALLINT       CHECK (risk_score BETWEEN 0 AND 100),
  risk_action         risk_action,
  mode                environment_mode NOT NULL DEFAULT 'live',
  customer_ip         INET,
  device_id           VARCHAR(100),
  user_agent          TEXT,
  callback_url        TEXT,
  metadata            JSONB          NOT NULL DEFAULT '{}'::jsonb,
  initiated_at        TIMESTAMPTZ    NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  settlement_id       UUID,                            -- FK added after settlements is created
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, merchant_order_id),
  UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX idx_txn_merchant_time ON transactions(merchant_id, created_at DESC);
CREATE INDEX idx_txn_provider_time ON transactions(provider_id, created_at DESC);
CREATE INDEX idx_txn_status_time   ON transactions(status, created_at DESC);
CREATE INDEX idx_txn_created       ON transactions(created_at DESC);
CREATE INDEX idx_txn_provider_ref  ON transactions(provider_txn_id);

CREATE TABLE transaction_events (                     -- immutable status history
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  from_status     txn_status,
  to_status       txn_status  NOT NULL,
  source          VARCHAR(30) NOT NULL,               -- 'api', 'provider_callback', 'admin', 'system'
  payload         JSONB,                              -- raw provider response, redacted
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_events_txn ON transaction_events(transaction_id, created_at);

CREATE TABLE refunds (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_ref      VARCHAR(24)   NOT NULL UNIQUE,
  transaction_id  UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reason          TEXT,
  status          refund_status NOT NULL DEFAULT 'requested',
  provider_ref    VARCHAR(100),
  requested_by_admin    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  requested_by_merchant UUID REFERENCES merchant_users(id) ON DELETE SET NULL,
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_txn ON refunds(transaction_id);

-- =====================================================================
-- 5. SETTLEMENTS
-- =====================================================================
CREATE TABLE settlements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_ref   VARCHAR(24)       NOT NULL UNIQUE,
  merchant_id      UUID              NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  bank_account_id  UUID              REFERENCES merchant_bank_accounts(id) ON DELETE SET NULL,
  period_start     DATE              NOT NULL,
  period_end       DATE              NOT NULL,
  txn_count        INTEGER           NOT NULL DEFAULT 0,
  gross_amount     NUMERIC(14,2)     NOT NULL DEFAULT 0,
  fee_amount       NUMERIC(14,2)     NOT NULL DEFAULT 0,
  refund_amount    NUMERIC(14,2)     NOT NULL DEFAULT 0,
  net_amount       NUMERIC(14,2)     NOT NULL DEFAULT 0,
  currency         CHAR(3)           NOT NULL DEFAULT 'BDT',
  status           settlement_status NOT NULL DEFAULT 'scheduled',
  bank_txn_ref     VARCHAR(100),
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ       NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);
CREATE INDEX idx_settlements_merchant ON settlements(merchant_id, period_end DESC);

ALTER TABLE transactions
  ADD CONSTRAINT fk_txn_settlement FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE SET NULL;

-- =====================================================================
-- 6. SMART ROUTING
-- =====================================================================
CREATE TABLE routing_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)     NOT NULL,            -- 'High Value Rule'
  description   TEXT,
  merchant_id   UUID REFERENCES merchants(id) ON DELETE CASCADE, -- NULL = global rule
  priority      INTEGER          NOT NULL DEFAULT 100, -- lower number = evaluated first
  strategy      routing_strategy NOT NULL DEFAULT 'priority',
  status        rule_status      NOT NULL DEFAULT 'draft',
  fallback_enabled BOOLEAN       NOT NULL DEFAULT TRUE,
  valid_from    TIMESTAMPTZ,
  valid_until   TIMESTAMPTZ,
  created_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ      NOT NULL DEFAULT now()
);
CREATE INDEX idx_routing_active ON routing_rules(status, priority);

CREATE TABLE routing_rule_conditions (                -- all conditions in a rule are ANDed
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id     UUID               NOT NULL REFERENCES routing_rules(id) ON DELETE CASCADE,
  field       VARCHAR(50)        NOT NULL,            -- 'amount', 'payment_method', 'card_bin', 'hour_of_day', 'merchant_category'
  operator    condition_operator NOT NULL,
  value       JSONB              NOT NULL,            -- 50000 | ["visa","mastercard"] | [10000, 50000]
  created_at  TIMESTAMPTZ        NOT NULL DEFAULT now()
);
CREATE INDEX idx_rule_conditions_rule ON routing_rule_conditions(rule_id);

CREATE TABLE routing_rule_targets (                   -- candidate providers for a rule
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      UUID     NOT NULL REFERENCES routing_rules(id) ON DELETE CASCADE,
  provider_id  UUID     NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  priority     SMALLINT NOT NULL DEFAULT 1,           -- used by the 'priority' strategy
  weight       SMALLINT NOT NULL DEFAULT 100 CHECK (weight BETWEEN 0 AND 100), -- used by 'weighted'
  UNIQUE (rule_id, provider_id)
);

CREATE TABLE routing_decisions (                      -- why each transaction went where it did
  id               BIGSERIAL PRIMARY KEY,
  transaction_id   UUID        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  rule_id          UUID        REFERENCES routing_rules(id) ON DELETE SET NULL,
  selected_provider_id UUID    REFERENCES payment_providers(id) ON DELETE SET NULL,
  candidates       JSONB       NOT NULL,              -- [{provider:'bkash', score:0.97, reason:'success_rate'}]
  attempt_no       SMALLINT    NOT NULL DEFAULT 1,    -- >1 when a fallback was used
  decision_ms      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_routing_decisions_txn ON routing_decisions(transaction_id);

ALTER TABLE transactions
  ADD CONSTRAINT fk_txn_routing_rule FOREIGN KEY (routing_rule_id) REFERENCES routing_rules(id) ON DELETE SET NULL;

-- =====================================================================
-- 7. RISK MANAGEMENT
-- =====================================================================
CREATE TABLE risk_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(120)    NOT NULL,             -- 'Velocity: >5 txns/10min per phone'
  alert_type    risk_alert_type NOT NULL,
  severity      risk_severity   NOT NULL DEFAULT 'medium',
  action        risk_action     NOT NULL DEFAULT 'flag',
  config        JSONB           NOT NULL,             -- {"window_minutes":10,"max_count":5,"key":"phone"}
  score_weight  SMALLINT        NOT NULL DEFAULT 10,
  status        rule_status     NOT NULL DEFAULT 'active',
  created_by    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE risk_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_ref       VARCHAR(24)       NOT NULL UNIQUE,
  type            risk_alert_type   NOT NULL,
  severity        risk_severity     NOT NULL,
  status          risk_alert_status NOT NULL DEFAULT 'open',
  title           VARCHAR(200)      NOT NULL,         -- 'Unusual transaction pattern'
  description     TEXT,
  risk_rule_id    UUID REFERENCES risk_rules(id)   ON DELETE SET NULL,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  merchant_id     UUID REFERENCES merchants(id)    ON DELETE SET NULL,
  amount          NUMERIC(14,2),
  evidence        JSONB             NOT NULL DEFAULT '{}'::jsonb,
  assigned_to     UUID REFERENCES admin_users(id)  ON DELETE SET NULL,
  resolved_by     UUID REFERENCES admin_users(id)  ON DELETE SET NULL,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_alerts_open ON risk_alerts(status, severity, created_at DESC);
CREATE INDEX idx_risk_alerts_merchant ON risk_alerts(merchant_id);

CREATE TABLE risk_alert_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_alert_id  UUID        NOT NULL REFERENCES risk_alerts(id) ON DELETE CASCADE,
  admin_user_id  UUID        NOT NULL REFERENCES admin_users(id) ON DELETE RESTRICT,
  body           TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_blocklist (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        blocklist_kind NOT NULL,
  value_hash  TEXT           NOT NULL,                -- sha256 of normalized value
  value_hint  VARCHAR(40),                            -- masked, for display: '017••••4321'
  reason      TEXT,
  expires_at  TIMESTAMPTZ,
  created_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (kind, value_hash)
);

-- =====================================================================
-- 8. AUDIT, ACTIVITY, NOTIFICATIONS
-- =====================================================================
CREATE TABLE audit_logs (                             -- append-only; never UPDATE/DELETE
  id            BIGSERIAL PRIMARY KEY,
  actor_type    VARCHAR(20)  NOT NULL DEFAULT 'admin', -- 'admin', 'merchant_user', 'system', 'api_key'
  actor_id      UUID,                                  -- admin_users.id / merchant_users.id …
  actor_name    VARCHAR(120) NOT NULL,                 -- snapshot, kept even if the user is deleted
  action        VARCHAR(80)  NOT NULL,                 -- 'routing_rule.updated' (code)
  action_label  VARCHAR(160) NOT NULL,                 -- 'Updated Routing Rule' (display)
  entity_type   VARCHAR(50),                           -- 'routing_rule', 'merchant', 'provider'
  entity_id     UUID,
  changes       JSONB,                                 -- {"before":{…},"after":{…}}
  ip_address    INET,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_time   ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_logs(actor_type, actor_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);

-- Enforce append-only at the DB level
CREATE OR REPLACE FUNCTION forbid_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();

CREATE TABLE activity_events (                        -- feed for the "Recent Activity" widget
  id           BIGSERIAL PRIMARY KEY,
  kind         activity_kind NOT NULL,
  title        VARCHAR(200)  NOT NULL,                -- 'New transaction from Rahim Ahmed'
  meta         VARCHAR(200),                          -- '৳ 2,500 via bKash'
  status_label VARCHAR(30),                           -- 'success' | 'updated' | 'flagged' | 'active'
  entity_type  VARCHAR(50),
  entity_id    UUID,
  merchant_id  UUID REFERENCES merchants(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_time ON activity_events(created_at DESC);

CREATE TABLE notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID REFERENCES admin_users(id) ON DELETE CASCADE, -- NULL = broadcast to all admins
  level          notification_level NOT NULL DEFAULT 'info',
  title          VARCHAR(200) NOT NULL,
  body           TEXT,
  link           TEXT,                                -- e.g. '#risk'
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(admin_user_id, created_at DESC) WHERE read_at IS NULL;

-- =====================================================================
-- 9. WEBHOOKS (merchant callbacks)
-- =====================================================================
CREATE TABLE webhook_endpoints (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id  UUID        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  url          TEXT        NOT NULL,
  secret_enc   BYTEA       NOT NULL,                  -- HMAC signing secret (encrypted)
  events       TEXT[]      NOT NULL DEFAULT ARRAY['payment.success','payment.failed','refund.completed'],
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id              BIGSERIAL PRIMARY KEY,
  endpoint_id     UUID           NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  transaction_id  UUID           REFERENCES transactions(id) ON DELETE SET NULL,
  event           VARCHAR(60)    NOT NULL,
  payload         JSONB          NOT NULL,
  status          webhook_status NOT NULL DEFAULT 'pending',
  attempts        SMALLINT       NOT NULL DEFAULT 0,
  response_code   SMALLINT,
  response_body   TEXT,
  next_retry_at   TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_retry ON webhook_deliveries(status, next_retry_at) WHERE status IN ('pending','retrying');

-- =====================================================================
-- 10. SYSTEM MONITOR & SETTINGS
-- =====================================================================
CREATE TABLE system_services (                        -- 'api', 'routing-engine', 'risk-engine', 'db', 'queue'
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(40)    NOT NULL UNIQUE,
  name            VARCHAR(80)    NOT NULL,
  status          service_status NOT NULL DEFAULT 'operational',
  last_heartbeat_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

CREATE TABLE system_metrics (                         -- time series (cpu, p95 latency, queue depth …)
  id          BIGSERIAL PRIMARY KEY,
  service_id  UUID          NOT NULL REFERENCES system_services(id) ON DELETE CASCADE,
  metric      VARCHAR(50)   NOT NULL,
  value       NUMERIC(14,4) NOT NULL,
  recorded_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_metrics_service_time ON system_metrics(service_id, metric, recorded_at DESC);

CREATE TABLE system_settings (
  key         VARCHAR(100) PRIMARY KEY,               -- 'risk.auto_block_score', 'routing.default_strategy'
  value       JSONB        NOT NULL,
  description TEXT,
  updated_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- =====================================================================
-- 11. REPORTING ROLLUPS (feed the dashboard KPI cards & chart)
-- =====================================================================
-- One row per day x provider x merchant, upserted by a job every few minutes.
-- Keeps dashboard queries fast instead of scanning `transactions`.
CREATE TABLE daily_transaction_stats (
  stat_date       DATE          NOT NULL,
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_id     UUID          NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  total_count     INTEGER       NOT NULL DEFAULT 0,
  success_count   INTEGER       NOT NULL DEFAULT 0,
  failed_count    INTEGER       NOT NULL DEFAULT 0,
  pending_count   INTEGER       NOT NULL DEFAULT 0,
  gross_amount    NUMERIC(16,2) NOT NULL DEFAULT 0,   -- successful volume
  fee_amount      NUMERIC(16,2) NOT NULL DEFAULT 0,
  refund_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
  avg_latency_ms  INTEGER,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (stat_date, merchant_id, provider_id)
);
CREATE INDEX idx_daily_stats_date ON daily_transaction_stats(stat_date);

-- Convenience views used by the dashboard API -------------------------
CREATE VIEW v_merchant_stats AS
SELECT
  count(*)                                    AS total,
  count(*) FILTER (WHERE status = 'active')    AS active,
  count(*) FILTER (WHERE status = 'suspended') AS suspended,
  count(*) FILTER (WHERE status = 'pending')   AS pending
FROM merchants
WHERE deleted_at IS NULL;

CREATE VIEW v_risk_summary AS
SELECT type, severity, count(*) AS open_count
FROM risk_alerts
WHERE status IN ('open', 'investigating', 'escalated')
GROUP BY type, severity;

CREATE VIEW v_daily_platform_stats AS
SELECT
  stat_date,
  sum(total_count)   AS total_count,
  sum(success_count) AS success_count,
  sum(failed_count)  AS failed_count,
  sum(pending_count) AS pending_count,
  sum(gross_amount)  AS gross_amount,
  round(100.0 * sum(success_count) / NULLIF(sum(success_count) + sum(failed_count), 0), 2) AS success_rate
FROM daily_transaction_stats
GROUP BY stat_date;

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'roles','admin_users','merchants','merchant_users','merchant_bank_accounts',
    'payment_providers','provider_credentials','merchant_provider_configs','customers',
    'transactions','refunds','settlements','routing_rules','risk_rules','risk_alerts',
    'webhook_endpoints','system_services','system_settings','daily_transaction_stats'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END $$;

COMMIT;
