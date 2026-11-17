-- =====================================================================
--  Purpose Gateway — Merchant Dashboard
--  Database schema (PostgreSQL 14+)
--
--  STATUS: Architecture only. NOT connected to the frontend yet.
--          The UI runs on assets/js/mock-data.js through assets/js/api.js.
--
--  Conventions (same as the Checkout project)
--   • Primary keys : UUID (gen_random_uuid()). Lookup tables use SMALLINT.
--   • Public IDs   : human-readable, unique per table (PGT-78452, PO-10241).
--   • Money        : BIGINT minor units (poisha; 1 BDT = 100) + currency CHAR(3).
--                    Never FLOAT/NUMERIC-with-rounding for stored money.
--   • Time         : TIMESTAMPTZ (UTC). created_at / updated_at on mutable tables.
--   • Multi-tenant : every merchant-owned row carries merchant_id. Enforce it in
--                    the API and, optionally, with Row-Level Security (bottom).
--   • Secrets      : only hashes or vault references are stored (API keys,
--                    gateway credentials, webhook secrets). No raw PAN/CVV ever.
--   • Balances     : ledger_entries is the source of truth (append-only);
--                    merchant_balances is a cached projection of it.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email / slugs

-- ---------------------------------------------------------------------
--  ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE merchant_status        AS ENUM ('pending', 'active', 'suspended', 'closed');
CREATE TYPE kyc_status             AS ENUM ('not_started', 'submitted', 'in_review', 'verified', 'rejected');
CREATE TYPE business_type          AS ENUM ('individual', 'sole_proprietorship', 'partnership', 'private_limited', 'public_limited', 'ngo', 'other');
CREATE TYPE kyc_document_type      AS ENUM ('trade_license', 'tin_certificate', 'nid_front', 'nid_back', 'bank_statement', 'incorporation_certificate', 'other');
CREATE TYPE document_status        AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE merchant_user_role     AS ENUM ('owner', 'admin', 'finance', 'developer', 'support', 'viewer');
CREATE TYPE user_status            AS ENUM ('invited', 'active', 'suspended', 'deleted');
CREATE TYPE plan_interval          AS ENUM ('month', 'year');
CREATE TYPE subscription_status    AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE environment            AS ENUM ('test', 'live');
CREATE TYPE payment_method_code    AS ENUM ('mobile_banking', 'card', 'wallet', 'bank_transfer');
CREATE TYPE gateway_status         AS ENUM ('pending', 'active', 'disabled', 'error');
CREATE TYPE transaction_status     AS ENUM ('pending', 'processing', 'success', 'failed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE payment_link_status    AS ENUM ('active', 'inactive', 'expired', 'completed');
CREATE TYPE refund_status          AS ENUM ('pending', 'processing', 'succeeded', 'failed');
CREATE TYPE refund_reason          AS ENUM ('requested_by_customer', 'duplicate', 'fraudulent', 'other');
CREATE TYPE ledger_entry_type      AS ENUM ('payment', 'fee', 'refund', 'payout', 'payout_reversal', 'chargeback', 'adjustment', 'settlement_release');
CREATE TYPE ledger_bucket          AS ENUM ('available', 'pending', 'reserved');
CREATE TYPE payout_account_type    AS ENUM ('bank_account', 'mobile_wallet');
CREATE TYPE payout_account_status  AS ENUM ('unverified', 'verified', 'disabled');
CREATE TYPE payout_status          AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled');
CREATE TYPE payout_schedule        AS ENUM ('manual', 'daily', 'weekly', 'monthly');
CREATE TYPE notification_type      AS ENUM ('payment_success', 'payment_failed', 'refund', 'payout', 'gateway', 'security', 'billing', 'system');
CREATE TYPE webhook_delivery_status AS ENUM ('pending', 'succeeded', 'failed', 'abandoned');
CREATE TYPE ticket_status          AS ENUM ('open', 'pending_merchant', 'pending_support', 'resolved', 'closed');
CREATE TYPE ticket_priority        AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE ticket_author_type     AS ENUM ('merchant_user', 'support_agent', 'system');

-- ---------------------------------------------------------------------
--  updated_at trigger helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
--  1. MERCHANTS & ACCESS
-- =====================================================================

CREATE TABLE merchants (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name       VARCHAR(150)    NOT NULL,
  legal_name          VARCHAR(200),
  slug                CITEXT          NOT NULL UNIQUE,            -- used in payment-link URLs
  business_type       business_type   NOT NULL DEFAULT 'sole_proprietorship',
  industry            VARCHAR(80),
  email               CITEXT          NOT NULL,
  phone               VARCHAR(20),                                -- E.164
  website_url         TEXT,
  logo_url            TEXT,
  address_line1       VARCHAR(200),
  address_line2       VARCHAR(200),
  city                VARCHAR(100),
  postal_code         VARCHAR(12),
  country_code        CHAR(2)         NOT NULL DEFAULT 'BD',
  default_currency    CHAR(3)         NOT NULL DEFAULT 'BDT',
  timezone            VARCHAR(64)     NOT NULL DEFAULT 'Asia/Dhaka',
  trade_license_no    VARCHAR(60),
  tin                 VARCHAR(30),
  kyc_status          kyc_status      NOT NULL DEFAULT 'not_started',
  kyc_verified_at     TIMESTAMPTZ,
  status              merchant_status NOT NULL DEFAULT 'pending',
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ
);

CREATE TABLE merchant_kyc_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID              NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  document_type       kyc_document_type NOT NULL,
  file_url            TEXT              NOT NULL,                 -- private object storage key
  status              document_status   NOT NULL DEFAULT 'pending',
  rejection_reason    TEXT,
  reviewed_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_kyc_docs_merchant ON merchant_kyc_documents(merchant_id);

-- People who log in to the dashboard (sidebar profile: "Imran Un Nafi · Merchant")
CREATE TABLE merchant_users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID                NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  full_name           VARCHAR(120)        NOT NULL,
  display_title       VARCHAR(60)         NOT NULL DEFAULT 'Merchant',
  email               CITEXT              NOT NULL,
  phone               VARCHAR(20),
  password_hash       VARCHAR(255),                               -- argon2id; NULL while invited
  avatar_url          TEXT,
  role                merchant_user_role  NOT NULL DEFAULT 'viewer',
  status              user_status         NOT NULL DEFAULT 'invited',
  two_factor_enabled  BOOLEAN             NOT NULL DEFAULT false,
  two_factor_secret_ref TEXT,                                     -- vault reference, never plaintext
  email_verified_at   TIMESTAMPTZ,
  last_login_at       TIMESTAMPTZ,
  invited_by          UUID                REFERENCES merchant_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT uq_merchant_users_email UNIQUE (email)              -- one login identity per email
);
CREATE INDEX idx_merchant_users_merchant ON merchant_users(merchant_id);
-- exactly one owner per merchant
CREATE UNIQUE INDEX uq_merchant_owner ON merchant_users(merchant_id) WHERE role = 'owner' AND deleted_at IS NULL;

CREATE TABLE merchant_user_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_user_id    UUID         NOT NULL REFERENCES merchant_users(id) ON DELETE CASCADE,
  refresh_token_hash  VARCHAR(255) NOT NULL UNIQUE,
  user_agent          TEXT,
  ip_address          INET,
  expires_at          TIMESTAMPTZ  NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON merchant_user_sessions(merchant_user_id) WHERE revoked_at IS NULL;

CREATE TABLE merchant_api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  name                VARCHAR(80)  NOT NULL,
  environment         environment  NOT NULL DEFAULT 'test',
  key_prefix          VARCHAR(16)  NOT NULL,                      -- shown in UI: pk_live_8f3a…
  key_hash            VARCHAR(255) NOT NULL UNIQUE,               -- sha256 of full secret
  scopes              TEXT[]       NOT NULL DEFAULT '{}',
  last_used_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  created_by          UUID         REFERENCES merchant_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_api_keys_merchant ON merchant_api_keys(merchant_id) WHERE revoked_at IS NULL;

-- =====================================================================
--  2. PLANS & SUBSCRIPTIONS  (sidebar "Upgrade to Pro Plan")
-- =====================================================================

CREATE TABLE subscription_plans (
  id                      SMALLSERIAL PRIMARY KEY,
  code                    VARCHAR(30)   NOT NULL UNIQUE,          -- starter | pro | enterprise
  name                    VARCHAR(60)   NOT NULL,
  description             TEXT,
  price_minor             BIGINT        NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency                CHAR(3)       NOT NULL DEFAULT 'BDT',
  billing_interval        plan_interval NOT NULL DEFAULT 'month',
  mfs_fee_bps             INTEGER       NOT NULL CHECK (mfs_fee_bps BETWEEN 0 AND 10000),   -- 150 = 1.50%
  card_fee_bps            INTEGER       NOT NULL CHECK (card_fee_bps BETWEEN 0 AND 10000),
  monthly_volume_limit_minor BIGINT,                              -- NULL = unlimited
  max_payment_links       INTEGER,                                -- NULL = unlimited
  max_team_members        INTEGER,
  payout_speed            VARCHAR(20)   NOT NULL DEFAULT 'next_day',
  features                JSONB         NOT NULL DEFAULT '{}',
  is_public               BOOLEAN       NOT NULL DEFAULT true,
  sort_order              SMALLINT      NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE merchant_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID                NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  plan_id               SMALLINT            NOT NULL REFERENCES subscription_plans(id),
  status                subscription_status NOT NULL DEFAULT 'active',
  current_period_start  TIMESTAMPTZ         NOT NULL,
  current_period_end    TIMESTAMPTZ         NOT NULL,
  cancel_at_period_end  BOOLEAN             NOT NULL DEFAULT false,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT now(),
  CHECK (current_period_end > current_period_start)
);
-- one live subscription per merchant
CREATE UNIQUE INDEX uq_merchant_active_subscription ON merchant_subscriptions(merchant_id)
  WHERE status IN ('trialing', 'active', 'past_due');

-- =====================================================================
--  3. PAYMENT METHODS, PROVIDERS & CONNECTED GATEWAYS
-- =====================================================================

CREATE TABLE payment_methods (
  id            SMALLSERIAL PRIMARY KEY,
  code          payment_method_code NOT NULL UNIQUE,
  name          VARCHAR(60)         NOT NULL,
  sort_order    SMALLINT            NOT NULL DEFAULT 0,
  is_active     BOOLEAN             NOT NULL DEFAULT true
);

-- bKash, Nagad, Rocket, Upay, Visa, Mastercard, Bank Transfer…
CREATE TABLE payment_providers (
  id                  SMALLSERIAL PRIMARY KEY,
  payment_method_id   SMALLINT     NOT NULL REFERENCES payment_methods(id),
  code                VARCHAR(30)  NOT NULL UNIQUE,
  name                VARCHAR(80)  NOT NULL,
  brand_color         CHAR(7),                                    -- #E2136E
  logo_url            TEXT,                                       -- official asset (light bg)
  logo_dark_url       TEXT,
  min_amount_minor    BIGINT,
  max_amount_minor    BIGINT,
  supports_refund     BOOLEAN      NOT NULL DEFAULT true,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  sort_order          SMALLINT     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (max_amount_minor IS NULL OR min_amount_minor IS NULL OR max_amount_minor >= min_amount_minor)
);

-- "Connected Gateways" card: which providers a merchant has activated
CREATE TABLE merchant_gateways (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID            NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_id         SMALLINT        NOT NULL REFERENCES payment_providers(id),
  environment         environment     NOT NULL DEFAULT 'live',
  status              gateway_status  NOT NULL DEFAULT 'pending',
  credentials_ref     TEXT,                                       -- secrets-manager path, never raw creds
  provider_merchant_id VARCHAR(100),                              -- merchant's ID at bKash/Nagad/etc.
  fee_bps_override    INTEGER CHECK (fee_bps_override BETWEEN 0 AND 10000),
  display_order       SMALLINT        NOT NULL DEFAULT 0,
  last_error          TEXT,
  connected_at        TIMESTAMPTZ,
  disabled_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, provider_id, environment)
);
CREATE INDEX idx_merchant_gateways_merchant ON merchant_gateways(merchant_id, status);

-- =====================================================================
--  4. CUSTOMERS, PAYMENT LINKS & TRANSACTIONS
-- =====================================================================

-- Payers, scoped to a merchant ("Customer" column)
CREATE TABLE customers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  full_name           VARCHAR(120)  NOT NULL,
  email               CITEXT,
  phone               VARCHAR(20),
  external_ref        VARCHAR(100),                               -- merchant's own customer ID
  total_spent_minor   BIGINT        NOT NULL DEFAULT 0,           -- denormalised, updated by job
  transactions_count  INTEGER       NOT NULL DEFAULT 0,
  first_seen_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  metadata            JSONB         NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_customers_merchant ON customers(merchant_id);
CREATE UNIQUE INDEX uq_customers_merchant_email ON customers(merchant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX uq_customers_merchant_phone ON customers(merchant_id, phone) WHERE phone IS NOT NULL;

-- Quick Action "Create Payment Link"
CREATE TABLE payment_links (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID                NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  slug                VARCHAR(64)         NOT NULL,
  title               VARCHAR(80)         NOT NULL,
  description         VARCHAR(300),
  amount_minor        BIGINT CHECK (amount_minor IS NULL OR amount_minor > 0),   -- NULL = customer enters amount
  min_amount_minor    BIGINT,
  currency            CHAR(3)             NOT NULL DEFAULT 'BDT',
  allowed_method_codes payment_method_code[],                    -- NULL = all connected gateways
  status              payment_link_status NOT NULL DEFAULT 'active',
  max_uses            INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count          INTEGER             NOT NULL DEFAULT 0,
  collected_minor     BIGINT              NOT NULL DEFAULT 0,
  success_redirect_url TEXT,
  expires_at          TIMESTAMPTZ,
  created_by          UUID                REFERENCES merchant_users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ         NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, slug)
);
CREATE INDEX idx_payment_links_merchant ON payment_links(merchant_id, status, created_at DESC);

-- "Recent Transactions" / Transactions page. One row per payment attempt.
CREATE SEQUENCE transaction_public_seq START 10001;

CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           VARCHAR(20)        NOT NULL UNIQUE DEFAULT ('PGT-' || nextval('transaction_public_seq')),
  merchant_id         UUID               NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  customer_id         UUID               REFERENCES customers(id) ON DELETE SET NULL,
  payment_link_id     UUID               REFERENCES payment_links(id) ON DELETE SET NULL,
  merchant_gateway_id UUID               REFERENCES merchant_gateways(id) ON DELETE SET NULL,
  provider_id         SMALLINT           NOT NULL REFERENCES payment_providers(id),
  payment_method_id   SMALLINT           NOT NULL REFERENCES payment_methods(id),
  environment         environment        NOT NULL DEFAULT 'live',
  status              transaction_status NOT NULL DEFAULT 'pending',
  amount_minor        BIGINT             NOT NULL CHECK (amount_minor > 0),
  fee_minor           BIGINT             NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_minor           BIGINT             GENERATED ALWAYS AS (CASE WHEN status IN ('success','partially_refunded','refunded') THEN amount_minor - fee_minor - refunded_minor ELSE 0 END) STORED,
  refunded_minor      BIGINT             NOT NULL DEFAULT 0 CHECK (refunded_minor >= 0),
  currency            CHAR(3)            NOT NULL DEFAULT 'BDT',
  description         VARCHAR(255),
  merchant_order_ref  VARCHAR(100),                               -- merchant's order number
  provider_reference  VARCHAR(100),                               -- bKash trxID, card auth code…
  payer_account_masked VARCHAR(30),                               -- 01712•••890
  card_brand          VARCHAR(20),
  card_last4          CHAR(4),
  failure_code        VARCHAR(60),
  failure_message     TEXT,
  idempotency_key     VARCHAR(100),
  ip_address          INET,
  metadata            JSONB              NOT NULL DEFAULT '{}',
  paid_at             TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ        NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ        NOT NULL DEFAULT now(),
  CHECK (refunded_minor <= amount_minor),
  CHECK (fee_minor <= amount_minor),
  UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX idx_tx_merchant_created ON transactions(merchant_id, created_at DESC);       -- recent list
CREATE INDEX idx_tx_merchant_status  ON transactions(merchant_id, status, created_at DESC);
CREATE INDEX idx_tx_customer         ON transactions(customer_id);
CREATE INDEX idx_tx_provider_ref     ON transactions(provider_id, provider_reference);
CREATE INDEX idx_tx_payment_link     ON transactions(payment_link_id) WHERE payment_link_id IS NOT NULL;

-- Status history / audit trail per transaction
CREATE TABLE transaction_events (
  id                  BIGSERIAL PRIMARY KEY,
  transaction_id      UUID               NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  from_status         transaction_status,
  to_status           transaction_status NOT NULL,
  source              VARCHAR(30)        NOT NULL,                -- api | provider_webhook | dashboard | system
  payload             JSONB              NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ        NOT NULL DEFAULT now()
);
CREATE INDEX idx_tx_events_tx ON transaction_events(transaction_id, created_at);

CREATE TABLE refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           VARCHAR(20)   NOT NULL UNIQUE,              -- RF-xxxxx
  merchant_id         UUID          NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  transaction_id      UUID          NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  amount_minor        BIGINT        NOT NULL CHECK (amount_minor > 0),
  currency            CHAR(3)       NOT NULL DEFAULT 'BDT',
  reason              refund_reason NOT NULL DEFAULT 'requested_by_customer',
  note                TEXT,
  status              refund_status NOT NULL DEFAULT 'pending',
  provider_reference  VARCHAR(100),
  failure_message     TEXT,
  requested_by        UUID          REFERENCES merchant_users(id) ON DELETE SET NULL,
  processed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_tx ON refunds(transaction_id);
CREATE INDEX idx_refunds_merchant ON refunds(merchant_id, created_at DESC);

-- =====================================================================
--  5. BALANCE, LEDGER & PAYOUTS  ("Available Balance" + "Withdraw")
-- =====================================================================

CREATE TABLE payout_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id           UUID                  NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  account_type          payout_account_type   NOT NULL,
  label                 VARCHAR(80)           NOT NULL,           -- "City Bank •••• 4521"
  account_name          VARCHAR(120)          NOT NULL,
  bank_name             VARCHAR(120),
  branch_name           VARCHAR(120),
  routing_number        VARCHAR(20),
  account_number_enc    BYTEA,                                    -- encrypted at app layer (KMS)
  account_number_last4  VARCHAR(4)            NOT NULL,
  wallet_provider_id    SMALLINT              REFERENCES payment_providers(id),   -- for mobile_wallet
  is_default            BOOLEAN               NOT NULL DEFAULT false,
  status                payout_account_status NOT NULL DEFAULT 'unverified',
  verified_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ           NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ           NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ,
  CHECK (account_type <> 'bank_account' OR bank_name IS NOT NULL),
  CHECK (account_type <> 'mobile_wallet' OR wallet_provider_id IS NOT NULL)
);
CREATE INDEX idx_payout_accounts_merchant ON payout_accounts(merchant_id);
CREATE UNIQUE INDEX uq_payout_accounts_default ON payout_accounts(merchant_id) WHERE is_default AND deleted_at IS NULL;

CREATE SEQUENCE payout_public_seq START 10001;

CREATE TABLE payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           VARCHAR(20)   NOT NULL UNIQUE DEFAULT ('PO-' || nextval('payout_public_seq')),
  merchant_id         UUID          NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  payout_account_id   UUID          NOT NULL REFERENCES payout_accounts(id) ON DELETE RESTRICT,
  amount_minor        BIGINT        NOT NULL CHECK (amount_minor > 0),
  fee_minor           BIGINT        NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  currency            CHAR(3)       NOT NULL DEFAULT 'BDT',
  status              payout_status NOT NULL DEFAULT 'pending',
  is_automatic        BOOLEAN       NOT NULL DEFAULT false,       -- from payout schedule
  provider_reference  VARCHAR(100),                               -- bank/NPSB reference
  failure_reason      TEXT,
  idempotency_key     VARCHAR(100),
  requested_by        UUID          REFERENCES merchant_users(id) ON DELETE SET NULL,
  requested_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  processed_at        TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, idempotency_key)
);
CREATE INDEX idx_payouts_merchant ON payouts(merchant_id, requested_at DESC);
CREATE INDEX idx_payouts_status   ON payouts(status) WHERE status IN ('pending', 'processing');

-- Append-only double-entry style ledger. Positive = credit to merchant, negative = debit.
CREATE TABLE ledger_entries (
  id                  BIGSERIAL PRIMARY KEY,
  merchant_id         UUID              NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  entry_type          ledger_entry_type NOT NULL,
  bucket              ledger_bucket     NOT NULL DEFAULT 'available',
  amount_minor        BIGINT            NOT NULL CHECK (amount_minor <> 0),
  currency            CHAR(3)           NOT NULL DEFAULT 'BDT',
  balance_after_minor BIGINT            NOT NULL,                 -- running balance of this bucket
  transaction_id      UUID              REFERENCES transactions(id) ON DELETE RESTRICT,
  refund_id           UUID              REFERENCES refunds(id) ON DELETE RESTRICT,
  payout_id           UUID              REFERENCES payouts(id) ON DELETE RESTRICT,
  description         VARCHAR(255),
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_ledger_merchant ON ledger_entries(merchant_id, created_at DESC);
CREATE INDEX idx_ledger_tx       ON ledger_entries(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_ledger_payout   ON ledger_entries(payout_id) WHERE payout_id IS NOT NULL;

-- block UPDATE/DELETE on the ledger
CREATE OR REPLACE FUNCTION forbid_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only; post a reversing entry instead';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_ledger_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();

-- Cached projection used by the dashboard card (updated in the same DB transaction as the ledger insert)
CREATE TABLE merchant_balances (
  merchant_id         UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  currency            CHAR(3)      NOT NULL DEFAULT 'BDT',
  available_minor     BIGINT       NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  pending_minor       BIGINT       NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
  reserved_minor      BIGINT       NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  version             BIGINT       NOT NULL DEFAULT 0,            -- optimistic locking
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, currency)
);

-- =====================================================================
--  6. ANALYTICS ROLLUPS  (KPI cards + Revenue Overview chart)
-- =====================================================================

-- One row per merchant per local day; filled by a job / on transaction finalisation.
CREATE TABLE daily_merchant_stats (
  merchant_id             UUID     NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  stat_date               DATE     NOT NULL,                      -- in merchant timezone
  currency                CHAR(3)  NOT NULL DEFAULT 'BDT',
  gross_volume_minor      BIGINT   NOT NULL DEFAULT 0,            -- sum(amount) of success
  fee_minor               BIGINT   NOT NULL DEFAULT 0,
  net_volume_minor        BIGINT   NOT NULL DEFAULT 0,
  refunded_minor          BIGINT   NOT NULL DEFAULT 0,
  transactions_count      INTEGER  NOT NULL DEFAULT 0,            -- all attempts
  success_count           INTEGER  NOT NULL DEFAULT 0,
  failed_count            INTEGER  NOT NULL DEFAULT 0,
  refund_count            INTEGER  NOT NULL DEFAULT 0,
  unique_customers        INTEGER  NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, stat_date, currency)
);

-- Same, broken down by provider (for "method mix" analytics)
CREATE TABLE daily_provider_stats (
  merchant_id             UUID     NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  stat_date               DATE     NOT NULL,
  provider_id             SMALLINT NOT NULL REFERENCES payment_providers(id),
  gross_volume_minor      BIGINT   NOT NULL DEFAULT 0,
  success_count           INTEGER  NOT NULL DEFAULT 0,
  failed_count            INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (merchant_id, stat_date, provider_id)
);

-- =====================================================================
--  7. NOTIFICATIONS, SETTINGS & WEBHOOKS
-- =====================================================================

CREATE TABLE notifications (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID              NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  merchant_user_id    UUID              REFERENCES merchant_users(id) ON DELETE CASCADE,  -- NULL = everyone on the team
  type                notification_type NOT NULL,
  title               VARCHAR(120)      NOT NULL,
  body                VARCHAR(500),
  link_url            TEXT,
  entity_type         VARCHAR(40),                                -- transaction | payout | gateway …
  entity_id           UUID,
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ       NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_inbox ON notifications(merchant_id, merchant_user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(merchant_id, merchant_user_id) WHERE read_at IS NULL;

CREATE TABLE merchant_settings (
  merchant_id             UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  locale                  VARCHAR(10)     NOT NULL DEFAULT 'en-BD',
  statement_descriptor    VARCHAR(22),
  payout_schedule         payout_schedule NOT NULL DEFAULT 'manual',
  payout_day              SMALLINT CHECK (payout_day BETWEEN 1 AND 31),
  min_payout_minor        BIGINT          NOT NULL DEFAULT 50000, -- ৳500
  auto_payout_account_id  UUID            REFERENCES payout_accounts(id) ON DELETE SET NULL,
  notify_email            JSONB           NOT NULL DEFAULT '{"payment_failed":true,"payout":true,"weekly_report":true}',
  notify_sms              JSONB           NOT NULL DEFAULT '{"payout":true}',
  checkout_branding       JSONB           NOT NULL DEFAULT '{}',  -- colors, logo for hosted checkout
  updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE TABLE webhook_endpoints (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id         UUID         NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  url                 TEXT         NOT NULL,
  environment         environment  NOT NULL DEFAULT 'live',
  secret_hash         VARCHAR(255) NOT NULL,                      -- HMAC signing secret (hashed for display check)
  secret_ref          TEXT         NOT NULL,                      -- vault path of signing secret
  events              TEXT[]       NOT NULL DEFAULT '{transaction.success,transaction.failed,refund.updated,payout.updated}',
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_endpoints_merchant ON webhook_endpoints(merchant_id);

CREATE TABLE webhook_deliveries (
  id                  BIGSERIAL PRIMARY KEY,
  webhook_endpoint_id UUID                    NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_type          VARCHAR(60)             NOT NULL,
  event_id            UUID                    NOT NULL DEFAULT gen_random_uuid(),
  payload             JSONB                   NOT NULL,
  status              webhook_delivery_status NOT NULL DEFAULT 'pending',
  attempts            SMALLINT                NOT NULL DEFAULT 0,
  last_response_code  SMALLINT,
  last_response_body  TEXT,
  next_retry_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ             NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(webhook_endpoint_id, created_at DESC);

-- =====================================================================
--  8. SUPPORT
-- =====================================================================

CREATE SEQUENCE ticket_public_seq START 5000;

CREATE TABLE support_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id           VARCHAR(20)     NOT NULL UNIQUE DEFAULT ('TKT-' || nextval('ticket_public_seq')),
  merchant_id         UUID            NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  opened_by           UUID            REFERENCES merchant_users(id) ON DELETE SET NULL,
  subject             VARCHAR(160)    NOT NULL,
  category            VARCHAR(40)     NOT NULL DEFAULT 'general', -- payments | payouts | integration | account | general
  priority            ticket_priority NOT NULL DEFAULT 'normal',
  status              ticket_status   NOT NULL DEFAULT 'open',
  related_transaction_id UUID         REFERENCES transactions(id) ON DELETE SET NULL,
  assigned_agent      VARCHAR(120),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_merchant ON support_tickets(merchant_id, status, updated_at DESC);

CREATE TABLE support_ticket_messages (
  id                  BIGSERIAL PRIMARY KEY,
  ticket_id           UUID               NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type         ticket_author_type NOT NULL,
  author_user_id      UUID               REFERENCES merchant_users(id) ON DELETE SET NULL,
  author_name         VARCHAR(120),
  body                TEXT               NOT NULL,
  attachments         JSONB              NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ        NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);

-- =====================================================================
--  9. AUDIT
-- =====================================================================

CREATE TABLE audit_logs (
  id                  BIGSERIAL PRIMARY KEY,
  merchant_id         UUID         REFERENCES merchants(id) ON DELETE SET NULL,
  actor_user_id       UUID         REFERENCES merchant_users(id) ON DELETE SET NULL,
  actor_api_key_id    UUID         REFERENCES merchant_api_keys(id) ON DELETE SET NULL,
  action              VARCHAR(80)  NOT NULL,                      -- payout.create, refund.create, api_key.revoke …
  entity_type         VARCHAR(40)  NOT NULL,
  entity_id           UUID,
  changes             JSONB        NOT NULL DEFAULT '{}',         -- {"field": [old, new]}
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_merchant ON audit_logs(merchant_id, created_at DESC);
CREATE INDEX idx_audit_entity   ON audit_logs(entity_type, entity_id);

-- =====================================================================
--  updated_at triggers
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'merchants','merchant_kyc_documents','merchant_users','subscription_plans','merchant_subscriptions',
    'payment_providers','merchant_gateways','customers','payment_links','transactions','refunds',
    'payout_accounts','payouts','merchant_settings','webhook_endpoints','support_tickets'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- =====================================================================
--  VIEWS used by the dashboard endpoints
-- =====================================================================

-- GET /transactions  (flat row for the table)
CREATE VIEW v_transaction_list AS
SELECT
  t.id, t.public_id, t.merchant_id, t.status, t.environment,
  t.amount_minor, t.fee_minor, t.net_minor, t.refunded_minor, t.currency,
  t.created_at, t.paid_at,
  COALESCE(c.full_name, 'Guest') AS customer_name,
  c.email                        AS customer_email,
  p.code                         AS provider_code,
  p.name                         AS provider_name,
  pm.code                        AS method_code,
  t.payer_account_masked, t.card_brand, t.card_last4,
  t.provider_reference, t.failure_code, t.failure_message
FROM transactions t
LEFT JOIN customers c        ON c.id = t.customer_id
JOIN payment_providers p     ON p.id = t.provider_id
JOIN payment_methods pm      ON pm.id = t.payment_method_id;

-- GET /dashboard/summary?range=last_30_days  (current window vs the window before it)
-- Usage: SELECT * FROM dashboard_summary('<merchant uuid>', 30);
CREATE OR REPLACE FUNCTION dashboard_summary(p_merchant UUID, p_days INT)
RETURNS TABLE (
  total_revenue_minor BIGINT, revenue_change_pct NUMERIC,
  success_rate_pct NUMERIC,   success_rate_change_pct NUMERIC,
  total_transactions BIGINT,  transactions_change_pct NUMERIC,
  failed_payments BIGINT,     failed_change_pct NUMERIC
) LANGUAGE sql STABLE AS $$
  WITH tz AS (SELECT (now() AT TIME ZONE m.timezone)::date AS today FROM merchants m WHERE m.id = p_merchant),
  cur AS (
    SELECT COALESCE(SUM(gross_volume_minor),0)::BIGINT rev, COALESCE(SUM(transactions_count),0)::BIGINT txn,
           COALESCE(SUM(success_count),0)::BIGINT ok,       COALESCE(SUM(failed_count),0)::BIGINT bad
    FROM daily_merchant_stats, tz
    WHERE merchant_id = p_merchant AND stat_date >  tz.today - p_days AND stat_date <= tz.today
  ),
  prev AS (
    SELECT COALESCE(SUM(gross_volume_minor),0)::BIGINT rev, COALESCE(SUM(transactions_count),0)::BIGINT txn,
           COALESCE(SUM(success_count),0)::BIGINT ok,       COALESCE(SUM(failed_count),0)::BIGINT bad
    FROM daily_merchant_stats, tz
    WHERE merchant_id = p_merchant AND stat_date >  tz.today - 2 * p_days AND stat_date <= tz.today - p_days
  )
  SELECT
    cur.rev,
    ROUND(100.0 * (cur.rev - prev.rev) / NULLIF(prev.rev, 0), 1),
    ROUND(100.0 * cur.ok / NULLIF(cur.ok + cur.bad, 0), 1),
    ROUND(100.0 * cur.ok / NULLIF(cur.ok + cur.bad, 0) - 100.0 * prev.ok / NULLIF(prev.ok + prev.bad, 0), 1),
    cur.txn,
    ROUND(100.0 * (cur.txn - prev.txn) / NULLIF(prev.txn, 0), 1),
    cur.bad,
    ROUND(100.0 * (cur.bad - prev.bad) / NULLIF(prev.bad, 0), 1)
  FROM cur, prev;
$$;

-- =====================================================================
--  OPTIONAL: Row-Level Security for tenant isolation
--  The API sets:  SET LOCAL app.merchant_id = '<uuid>';  per request.
--  Uncomment when the backend is ready.
-- =====================================================================
-- ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON transactions
--   USING (merchant_id = current_setting('app.merchant_id')::uuid);
-- (repeat for every table with merchant_id)

COMMIT;
