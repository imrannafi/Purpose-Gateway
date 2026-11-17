-- =====================================================================
--  Purpose Gateway — Checkout & Payments
--  Database schema (PostgreSQL 14+)
--
--  STATUS: Architecture only. Not connected to the frontend yet.
--
--  Conventions
--   • Primary keys:  UUID (gen_random_uuid()) — safe to expose, no enumeration.
--   • Money:         BIGINT in minor units (poisha; 1 BDT = 100) + currency CHAR(3).
--                    Never use FLOAT/REAL for money.
--   • Timestamps:    TIMESTAMPTZ, UTC. created_at / updated_at on every mutable table.
--   • Soft delete:   deleted_at on user-facing master data only.
--   • PCI scope:     Raw PAN and CVV are NEVER stored. Only processor tokens,
--                    brand, last4 and expiry. See README.md → "PCI scope".
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email / codes

-- ---------------------------------------------------------------------
--  ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE user_status          AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE merchant_status      AS ENUM ('pending', 'active', 'suspended');
CREATE TYPE product_status       AS ENUM ('draft', 'active', 'archived');
CREATE TYPE order_status         AS ENUM ('draft', 'pending_payment', 'partially_paid', 'paid',
                                          'processing', 'shipped', 'delivered', 'cancelled',
                                          'refunded', 'partially_refunded');
CREATE TYPE checkout_step        AS ENUM ('payment_method', 'payment_details', 'complete');
CREATE TYPE checkout_status      AS ENUM ('open', 'completed', 'expired', 'abandoned');
CREATE TYPE payment_method_code  AS ENUM ('card', 'mobile_banking', 'wallet', 'group');
CREATE TYPE payment_status       AS ENUM ('initiated', 'pending', 'requires_action', 'authorized',
                                          'succeeded', 'failed', 'cancelled', 'refunded',
                                          'partially_refunded');
CREATE TYPE discount_type        AS ENUM ('percentage', 'fixed');
CREATE TYPE split_type           AS ENUM ('equal', 'custom');
CREATE TYPE group_status         AS ENUM ('collecting', 'completed', 'expired', 'cancelled');
CREATE TYPE member_status        AS ENUM ('invited', 'viewed', 'paid', 'declined', 'expired');
CREATE TYPE refund_status        AS ENUM ('pending', 'succeeded', 'failed');
CREATE TYPE instrument_type      AS ENUM ('card', 'mobile_banking', 'wallet');
CREATE TYPE address_type         AS ENUM ('shipping', 'billing');
CREATE TYPE provider_operator_type    AS ENUM ('bank', 'mfs_company', 'government', 'card_network', 'tech_company', 'other');
CREATE TYPE provider_integration_type AS ENUM ('redirect', 'api', 'ussd', 'sdk', 'hosted_fields');
CREATE TYPE provider_asset_variant    AS ENUM ('logo', 'logo_dark', 'icon', 'wordmark');

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
--  1. IDENTITY
-- =====================================================================

-- Customers who pay (the person in the header avatar menu)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       VARCHAR(120)  NOT NULL,
  email           CITEXT        NOT NULL UNIQUE,
  phone           VARCHAR(20)   UNIQUE,                    -- E.164, e.g. +8801712345678
  password_hash   VARCHAR(255),                            -- NULL for guest / OAuth-only users
  avatar_url      TEXT,
  email_verified_at TIMESTAMPTZ,
  phone_verified_at TIMESTAMPTZ,
  status          user_status   NOT NULL DEFAULT 'active',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE TABLE user_addresses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            address_type  NOT NULL DEFAULT 'shipping',
  recipient_name  VARCHAR(120)  NOT NULL,
  phone           VARCHAR(20)   NOT NULL,
  line1           VARCHAR(200)  NOT NULL,
  line2           VARCHAR(200),
  area            VARCHAR(100),                            -- thana / upazila
  city            VARCHAR(100)  NOT NULL,
  district        VARCHAR(100),
  postal_code     VARCHAR(12),
  country_code    CHAR(2)       NOT NULL DEFAULT 'BD',
  is_default      BOOLEAN       NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_addresses_user ON user_addresses(user_id);
-- Only one default address per user per type
CREATE UNIQUE INDEX uq_user_addresses_default ON user_addresses(user_id, type) WHERE is_default;

-- Businesses that sell through the gateway
CREATE TABLE merchants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(150)  NOT NULL,
  slug            CITEXT        NOT NULL UNIQUE,
  email           CITEXT        NOT NULL,
  phone           VARCHAR(20),
  logo_url        TEXT,
  website_url     TEXT,
  webhook_url     TEXT,
  webhook_secret_hash VARCHAR(255),
  settlement_currency CHAR(3)   NOT NULL DEFAULT 'BDT',
  status          merchant_status NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE merchant_api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  label           VARCHAR(80)   NOT NULL,
  key_prefix      VARCHAR(16)   NOT NULL,                  -- shown in dashboard, e.g. "pk_live_ab12"
  key_hash        VARCHAR(255)  NOT NULL UNIQUE,           -- store hash only
  is_live         BOOLEAN       NOT NULL DEFAULT false,
  last_used_at    TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_merchant_api_keys_merchant ON merchant_api_keys(merchant_id);

-- =====================================================================
--  2. CATALOG
-- =====================================================================

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  name            VARCHAR(200)  NOT NULL,                  -- "MacBook Air M2"
  slug            CITEXT        NOT NULL,
  description     TEXT,
  brand           VARCHAR(100),
  image_url       TEXT,
  status          product_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (merchant_id, slug)
);

-- A purchasable SKU: "13.6″ • 8GB RAM • 256GB SSD • Silver"
CREATE TABLE product_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku             VARCHAR(64)   NOT NULL UNIQUE,
  attributes      JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- {"screen":"13.6″","ram":"8GB RAM","storage":"256GB SSD","color":"Silver"}
  price_minor     BIGINT        NOT NULL CHECK (price_minor >= 0),
  compare_at_price_minor BIGINT CHECK (compare_at_price_minor >= 0),
  currency        CHAR(3)       NOT NULL DEFAULT 'BDT',
  stock_quantity  INTEGER       NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  image_url       TEXT,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_variants_product ON product_variants(product_id);
CREATE INDEX idx_product_variants_attrs   ON product_variants USING GIN (attributes);

-- =====================================================================
--  3. PROMOTIONS
-- =====================================================================

CREATE TABLE coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     UUID          REFERENCES merchants(id) ON DELETE CASCADE,  -- NULL = platform-wide
  code            CITEXT        NOT NULL,
  description     VARCHAR(255),
  discount_type   discount_type NOT NULL,
  discount_value  BIGINT        NOT NULL CHECK (discount_value > 0), -- % (1-100) or minor units
  max_discount_minor BIGINT     CHECK (max_discount_minor > 0),
  min_order_minor BIGINT        NOT NULL DEFAULT 0,
  usage_limit     INTEGER       CHECK (usage_limit > 0),            -- NULL = unlimited
  usage_limit_per_user INTEGER  CHECK (usage_limit_per_user > 0),
  used_count      INTEGER       NOT NULL DEFAULT 0,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (discount_type <> 'percentage' OR discount_value <= 100),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX uq_coupons_code ON coupons(COALESCE(merchant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- =====================================================================
--  4. ORDERS
-- =====================================================================

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number          VARCHAR(32)   NOT NULL UNIQUE,       -- human readable: PG-2026-000148
  merchant_id           UUID          NOT NULL REFERENCES merchants(id) ON DELETE RESTRICT,
  user_id               UUID          REFERENCES users(id) ON DELETE SET NULL,  -- NULL = guest
  guest_email           CITEXT,
  guest_phone           VARCHAR(20),
  status                order_status  NOT NULL DEFAULT 'pending_payment',
  currency              CHAR(3)       NOT NULL DEFAULT 'BDT',
  -- Price breakdown shown in the Order Summary card
  subtotal_minor        BIGINT        NOT NULL DEFAULT 0 CHECK (subtotal_minor >= 0),
  discount_minor        BIGINT        NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  delivery_charge_minor BIGINT        NOT NULL DEFAULT 0 CHECK (delivery_charge_minor >= 0),
  tax_minor             BIGINT        NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor           BIGINT        NOT NULL DEFAULT 0 CHECK (total_minor >= 0),
  amount_paid_minor     BIGINT        NOT NULL DEFAULT 0 CHECK (amount_paid_minor >= 0),
  amount_refunded_minor BIGINT        NOT NULL DEFAULT 0 CHECK (amount_refunded_minor >= 0),
  coupon_id             UUID          REFERENCES coupons(id) ON DELETE SET NULL,
  coupon_code           CITEXT,                              -- snapshot
  shipping_address_id   UUID          REFERENCES user_addresses(id) ON DELETE SET NULL,
  shipping_address      JSONB,                               -- immutable snapshot at time of order
  notes                 TEXT,
  metadata              JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- merchant-supplied
  placed_at             TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_email IS NOT NULL OR guest_phone IS NOT NULL),
  CHECK (total_minor = subtotal_minor - discount_minor + delivery_charge_minor + tax_minor)
);
CREATE INDEX idx_orders_user       ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_merchant   ON orders(merchant_id, created_at DESC);
CREATE INDEX idx_orders_status     ON orders(status);

CREATE TABLE order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id        UUID          REFERENCES products(id) ON DELETE SET NULL,
  variant_id        UUID          REFERENCES product_variants(id) ON DELETE SET NULL,
  -- Snapshots so historical orders don't change if the catalog changes
  product_name      VARCHAR(200)  NOT NULL,
  variant_attributes JSONB        NOT NULL DEFAULT '{}'::jsonb,
  image_url         TEXT,
  sku               VARCHAR(64),
  unit_price_minor  BIGINT        NOT NULL CHECK (unit_price_minor >= 0),
  quantity          INTEGER       NOT NULL CHECK (quantity > 0),
  discount_minor    BIGINT        NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  line_total_minor  BIGINT        NOT NULL CHECK (line_total_minor >= 0),
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (line_total_minor = unit_price_minor * quantity - discount_minor)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE coupon_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id       UUID          NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  order_id        UUID          NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id         UUID          REFERENCES users(id) ON DELETE SET NULL,
  discount_minor  BIGINT        NOT NULL CHECK (discount_minor >= 0),
  redeemed_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupon_redemptions_coupon_user ON coupon_redemptions(coupon_id, user_id);

-- =====================================================================
--  5. PAYMENT CONFIGURATION (lookup tables)
-- =====================================================================

-- The 4 tiles: Card Payment / Mobile Banking / Wallet / Group Payment
CREATE TABLE payment_methods (
  id              SMALLSERIAL PRIMARY KEY,
  code            payment_method_code NOT NULL UNIQUE,
  name            VARCHAR(60)   NOT NULL,
  description     VARCHAR(120),                            -- "Visa, Mastercard & more"
  icon            VARCHAR(60),
  is_popular      BOOLEAN       NOT NULL DEFAULT false,    -- "Popular" badge
  is_new          BOOLEAN       NOT NULL DEFAULT false,    -- "New" badge
  is_active       BOOLEAN       NOT NULL DEFAULT true,
  sort_order      SMALLINT      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- The licensed institution behind a provider (bank, card scheme, post office, tech company).
-- One operator can run several providers, e.g. Islami Bank → mCash and CellFin.
CREATE TABLE provider_operators (
  id                SMALLSERIAL PRIMARY KEY,
  code              VARCHAR(40)  NOT NULL UNIQUE,          -- brac_bank, dbbl, ucb, ...
  legal_name        VARCHAR(150) NOT NULL,                 -- "Dutch-Bangla Bank PLC"
  operator_type     provider_operator_type NOT NULL,
  country_code      CHAR(2)      NOT NULL DEFAULT 'BD',
  regulator         VARCHAR(80),                           -- "Bangladesh Bank"
  license_reference VARCHAR(80),                           -- MFS / PSP licence number
  website_url       TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Brands/providers under each method:
--   card:           visa, mastercard, amex
--   mobile_banking: bkash, nagad, rocket, upay, tap, surecash, ok_wallet, mcash, mycash, firstcash, cellfin
--   wallet:         google_pay, apple_pay
-- Adding a new provider is one INSERT here (plus logo rows in payment_provider_assets); no schema or UI change.
CREATE TABLE payment_providers (
  id                SMALLSERIAL PRIMARY KEY,
  payment_method_id SMALLINT     NOT NULL REFERENCES payment_methods(id) ON DELETE RESTRICT,
  operator_id       SMALLINT     REFERENCES provider_operators(id) ON DELETE SET NULL,
  code              VARCHAR(40)  NOT NULL UNIQUE,
  name              VARCHAR(60)  NOT NULL,                 -- "bKash"
  name_bn           VARCHAR(60),                           -- "বিকাশ" (Bengali display name)
  description       VARCHAR(160),
  logo_url          TEXT,                                  -- primary logo (denormalised from payment_provider_assets)
  brand_color       CHAR(7)      CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),  -- from official brand guide only
  country_code      CHAR(2)      NOT NULL DEFAULT 'BD',
  currency          CHAR(3)      NOT NULL DEFAULT 'BDT',
  integration_type  provider_integration_type NOT NULL DEFAULT 'redirect',
  -- Account-number rules for the checkout form (mobile banking)
  account_number_length SMALLINT CHECK (account_number_length BETWEEN 6 AND 20), -- digits after +880; Rocket = 11
  account_number_regex  VARCHAR(120),                      -- server-side validation pattern
  fee_percent       NUMERIC(5,3) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0),   -- e.g. 1.850 (%)
  fee_fixed_minor   BIGINT       NOT NULL DEFAULT 0 CHECK (fee_fixed_minor >= 0),
  min_amount_minor  BIGINT,
  max_amount_minor  BIGINT,
  supports_refund   BOOLEAN      NOT NULL DEFAULT true,
  supports_tokenization BOOLEAN  NOT NULL DEFAULT false,   -- can save for "faster checkout"
  is_featured       BOOLEAN      NOT NULL DEFAULT false,   -- shown first / highlighted
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  sort_order        SMALLINT     NOT NULL DEFAULT 0,
  config            JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- non-secret settings; secrets live in a vault
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (max_amount_minor IS NULL OR min_amount_minor IS NULL OR max_amount_minor >= min_amount_minor)
);
CREATE INDEX idx_payment_providers_method ON payment_providers(payment_method_id, is_active, sort_order);
CREATE INDEX idx_payment_providers_operator ON payment_providers(operator_id);

-- Official brand assets per provider (several variants: full logo, dark-mode, square icon ...).
-- Records where each file came from so only approved, authentic artwork is shown.
CREATE TABLE payment_provider_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id       SMALLINT     NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  variant           provider_asset_variant NOT NULL DEFAULT 'logo',
  url               TEXT         NOT NULL,
  mime_type         VARCHAR(40)  NOT NULL,                 -- image/svg+xml, image/png, image/webp
  width_px          INTEGER      CHECK (width_px > 0),     -- intrinsic size → aspect ratio preserved in UI
  height_px         INTEGER      CHECK (height_px > 0),
  source            VARCHAR(255) NOT NULL,                 -- "bKash merchant onboarding kit 2026", "official press kit"
  usage_notes       TEXT,                                  -- clear space / min size from brand guidelines
  is_primary        BOOLEAN      NOT NULL DEFAULT false,
  approved_by       UUID         REFERENCES users(id) ON DELETE SET NULL,
  approved_at       TIMESTAMPTZ,                           -- NULL = not yet approved → not served
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_provider_assets_provider ON payment_provider_assets(provider_id);
CREATE UNIQUE INDEX uq_provider_assets_primary ON payment_provider_assets(provider_id, variant) WHERE is_primary;

-- Which methods/providers a merchant has enabled (with optional per-merchant overrides)
CREATE TABLE merchant_payment_providers (
  merchant_id     UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  provider_id     SMALLINT      NOT NULL REFERENCES payment_providers(id) ON DELETE CASCADE,
  is_enabled      BOOLEAN       NOT NULL DEFAULT true,
  sort_order      SMALLINT,                                -- NULL = use payment_providers.sort_order
  fee_percent_override NUMERIC(5,3) CHECK (fee_percent_override >= 0),
  fee_fixed_minor_override BIGINT CHECK (fee_fixed_minor_override >= 0),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, provider_id)
);

-- =====================================================================
--  6. CHECKOUT SESSION (drives the 3-step stepper)
-- =====================================================================

CREATE TABLE checkout_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_token      VARCHAR(64)   NOT NULL UNIQUE,         -- appears in URL: ?session=cs_...
  order_id          UUID          NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id           UUID          REFERENCES users(id) ON DELETE SET NULL,
  current_step      checkout_step NOT NULL DEFAULT 'payment_method',
  selected_method_id SMALLINT     REFERENCES payment_methods(id),
  status            checkout_status NOT NULL DEFAULT 'open',
  success_url       TEXT,
  cancel_url        TEXT,
  client_ip         INET,
  user_agent        TEXT,
  expires_at        TIMESTAMPTZ   NOT NULL,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_checkout_sessions_order  ON checkout_sessions(order_id);
CREATE INDEX idx_checkout_sessions_open   ON checkout_sessions(expires_at) WHERE status = 'open';

-- =====================================================================
--  7. SAVED PAYMENT INSTRUMENTS ("Save this card")
-- =====================================================================

CREATE TABLE saved_payment_instruments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id       SMALLINT      NOT NULL REFERENCES payment_providers(id),
  type              instrument_type NOT NULL,
  processor_token   VARCHAR(255)  NOT NULL,                -- vault / processor token, NOT the PAN
  fingerprint       VARCHAR(128),                          -- processor fingerprint to dedupe same card
  display_label     VARCHAR(60),                           -- "Visa •••• 4242" / "bKash •••• 5678"
  card_brand        VARCHAR(20),
  card_last4        CHAR(4),
  card_exp_month    SMALLINT      CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year     SMALLINT      CHECK (card_exp_year BETWEEN 2000 AND 2100),
  cardholder_name   VARCHAR(120),
  wallet_number_masked VARCHAR(20),
  is_default        BOOLEAN       NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  UNIQUE (user_id, fingerprint)
);
CREATE UNIQUE INDEX uq_saved_instruments_default ON saved_payment_instruments(user_id) WHERE is_default AND deleted_at IS NULL;

-- =====================================================================
--  8. GROUP PAYMENT
--     Declared before `payments` because payments references group_payment_members.
-- =====================================================================

CREATE TABLE group_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID          NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  organizer_user_id UUID          REFERENCES users(id) ON DELETE SET NULL,
  share_code        VARCHAR(16)   NOT NULL UNIQUE,         -- GRP-AB12C, used in invite links
  split_type        split_type    NOT NULL DEFAULT 'equal',
  total_minor       BIGINT        NOT NULL CHECK (total_minor > 0),
  collected_minor   BIGINT        NOT NULL DEFAULT 0 CHECK (collected_minor >= 0),
  currency          CHAR(3)       NOT NULL DEFAULT 'BDT',
  status            group_status  NOT NULL DEFAULT 'collecting',
  expires_at        TIMESTAMPTZ   NOT NULL,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (collected_minor <= total_minor)
);
CREATE INDEX idx_group_payments_status ON group_payments(status, expires_at);

CREATE TABLE group_payment_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_payment_id  UUID          NOT NULL REFERENCES group_payments(id) ON DELETE CASCADE,
  user_id           UUID          REFERENCES users(id) ON DELETE SET NULL,  -- NULL until invitee signs in
  display_name      VARCHAR(120)  NOT NULL,
  email             CITEXT,
  phone             VARCHAR(20),
  is_organizer      BOOLEAN       NOT NULL DEFAULT false,
  share_minor       BIGINT        NOT NULL CHECK (share_minor > 0),
  invite_token      VARCHAR(64)   NOT NULL UNIQUE,         -- personal pay link
  status            member_status NOT NULL DEFAULT 'invited',
  invited_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  viewed_at         TIMESTAMPTZ,
  paid_at           TIMESTAMPTZ,
  reminder_count    SMALLINT      NOT NULL DEFAULT 0,
  last_reminded_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL OR is_organizer)
);
CREATE INDEX idx_group_members_group ON group_payment_members(group_payment_id);
CREATE UNIQUE INDEX uq_group_members_organizer ON group_payment_members(group_payment_id) WHERE is_organizer;

-- =====================================================================
--  9. PAYMENTS (one row per payment attempt)
-- =====================================================================

CREATE TABLE payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id              UUID          NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  checkout_session_id   UUID          REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  user_id               UUID          REFERENCES users(id) ON DELETE SET NULL,
  payment_method_id     SMALLINT      NOT NULL REFERENCES payment_methods(id),
  provider_id           SMALLINT      REFERENCES payment_providers(id),
  saved_instrument_id   UUID          REFERENCES saved_payment_instruments(id) ON DELETE SET NULL,
  group_member_id       UUID          REFERENCES group_payment_members(id) ON DELETE SET NULL, -- set for group shares
  amount_minor          BIGINT        NOT NULL CHECK (amount_minor > 0),
  fee_minor             BIGINT        NOT NULL DEFAULT 0 CHECK (fee_minor >= 0),
  net_minor             BIGINT GENERATED ALWAYS AS (amount_minor - fee_minor) STORED,
  currency              CHAR(3)       NOT NULL DEFAULT 'BDT',
  status                payment_status NOT NULL DEFAULT 'initiated',
  idempotency_key       VARCHAR(80)   NOT NULL UNIQUE,     -- from Idempotency-Key header; prevents double-charge
  gateway_reference     VARCHAR(64)   UNIQUE,              -- our public Transaction ID: PGTX...
  processor_reference   VARCHAR(128),                      -- id at bKash / card processor / etc.
  failure_code          VARCHAR(60),
  failure_message       VARCHAR(255),
  risk_score            SMALLINT      CHECK (risk_score BETWEEN 0 AND 100),
  client_ip             INET,
  authorized_at         TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_payments_order      ON payments(order_id);
CREATE INDEX idx_payments_user       ON payments(user_id, created_at DESC);
CREATE INDEX idx_payments_status     ON payments(status, created_at DESC);
CREATE INDEX idx_payments_processor  ON payments(provider_id, processor_reference);
CREATE INDEX idx_payments_group_member ON payments(group_member_id) WHERE group_member_id IS NOT NULL;

-- Method-specific details (1:1 with payments). Kept separate so the
-- payments table stays narrow and sensitive data is isolated.

CREATE TABLE card_payment_details (
  payment_id        UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  card_brand        VARCHAR(20)   NOT NULL,                -- visa | mastercard | amex
  card_last4        CHAR(4)       NOT NULL,
  card_exp_month    SMALLINT      NOT NULL CHECK (card_exp_month BETWEEN 1 AND 12),
  card_exp_year     SMALLINT      NOT NULL CHECK (card_exp_year BETWEEN 2000 AND 2100),
  cardholder_name   VARCHAR(120),
  card_bin          CHAR(6),                               -- first 6 (allowed under PCI DSS)
  issuer_country    CHAR(2),
  processor_token   VARCHAR(255)  NOT NULL,                -- token only; NO PAN / CVV columns, by design
  three_ds_status   VARCHAR(30),                           -- authenticated / attempted / failed / not_enrolled
  avs_result        VARCHAR(10),
  cvc_check         VARCHAR(10)                            -- pass / fail / unavailable (result only)
);

CREATE TABLE mobile_banking_payment_details (
  payment_id        UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  provider_id       SMALLINT      NOT NULL REFERENCES payment_providers(id),  -- bkash, nagad, rocket, upay, tap, ...
  wallet_number_masked VARCHAR(20) NOT NULL,               -- +88017****5678
  provider_transaction_id VARCHAR(64),                     -- trxID returned by the MFS
  payer_reference   VARCHAR(64)
);

CREATE TABLE wallet_payment_details (
  payment_id        UUID PRIMARY KEY REFERENCES payments(id) ON DELETE CASCADE,
  wallet_type       VARCHAR(20)   NOT NULL,                -- google_pay | apple_pay
  underlying_card_brand VARCHAR(20),
  underlying_card_last4 CHAR(4),
  wallet_token_ref  VARCHAR(255)
);

-- Append-only audit log of every status transition / webhook for a payment
CREATE TABLE payment_events (
  id                BIGSERIAL PRIMARY KEY,
  payment_id        UUID          NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  event_type        VARCHAR(60)   NOT NULL,                -- payment.created, payment.succeeded, webhook.received ...
  status_from       payment_status,
  status_to         payment_status,
  source            VARCHAR(20)   NOT NULL DEFAULT 'system', -- system | processor | admin | customer
  payload           JSONB         NOT NULL DEFAULT '{}'::jsonb,  -- scrubbed of sensitive data
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_events_payment ON payment_events(payment_id, created_at);

CREATE TABLE refunds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        UUID          NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  amount_minor      BIGINT        NOT NULL CHECK (amount_minor > 0),
  currency          CHAR(3)       NOT NULL DEFAULT 'BDT',
  reason            VARCHAR(255),
  status            refund_status NOT NULL DEFAULT 'pending',
  processor_reference VARCHAR(128),
  requested_by      UUID          REFERENCES users(id) ON DELETE SET NULL,
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);

-- =====================================================================
--  10. INTEGRATION / OPERATIONS
-- =====================================================================

-- Inbound webhooks from processors (bKash, card acquirer, ...) — stored raw for replay
CREATE TABLE processor_webhooks (
  id                BIGSERIAL PRIMARY KEY,
  provider_id       SMALLINT      REFERENCES payment_providers(id),
  external_event_id VARCHAR(128),
  event_type        VARCHAR(80),
  signature_valid   BOOLEAN       NOT NULL DEFAULT false,
  payload           JSONB         NOT NULL,
  processed_at      TIMESTAMPTZ,
  error             TEXT,
  received_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
  UNIQUE (provider_id, external_event_id)
);

-- Outbound webhooks to merchants (payment.succeeded etc.)
CREATE TABLE merchant_webhook_deliveries (
  id                BIGSERIAL PRIMARY KEY,
  merchant_id       UUID          NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  event_type        VARCHAR(80)   NOT NULL,
  payload           JSONB         NOT NULL,
  attempt_count     SMALLINT      NOT NULL DEFAULT 0,
  last_status_code  SMALLINT,
  next_attempt_at   TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_pending ON merchant_webhook_deliveries(next_attempt_at) WHERE delivered_at IS NULL;

-- Generic audit trail for admin / sensitive actions
CREATE TABLE audit_logs (
  id                BIGSERIAL PRIMARY KEY,
  actor_type        VARCHAR(20)   NOT NULL,                -- user | merchant | admin | system
  actor_id          UUID,
  action            VARCHAR(80)   NOT NULL,                -- e.g. coupon.applied, card.saved, refund.created
  entity_type       VARCHAR(60)   NOT NULL,
  entity_id         UUID,
  changes           JSONB,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at DESC);

-- =====================================================================
--  updated_at triggers
-- =====================================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','user_addresses','merchants','products','product_variants','coupons','orders',
    'payment_methods','provider_operators','payment_providers','payment_provider_assets',
    'merchant_payment_providers','checkout_sessions','saved_payment_instruments',
    'group_payments','group_payment_members','payments','refunds'
  ] LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

-- =====================================================================
--  Convenience view: what the checkout page needs in one query
-- =====================================================================
CREATE VIEW v_checkout_summary AS
SELECT
  cs.public_token          AS session_token,
  cs.current_step,
  cs.status                AS session_status,
  cs.expires_at,
  pm.code                  AS selected_method_code,
  o.id                     AS order_id,
  o.order_number,
  o.currency,
  o.subtotal_minor,
  o.discount_minor,
  o.delivery_charge_minor,
  o.tax_minor,
  o.total_minor,
  o.coupon_code,
  o.status                 AS order_status,
  u.full_name              AS customer_name,
  COALESCE(u.email, o.guest_email) AS customer_email
FROM checkout_sessions cs
JOIN orders o           ON o.id = cs.order_id
LEFT JOIN users u       ON u.id = o.user_id
LEFT JOIN payment_methods pm ON pm.id = cs.selected_method_id;

COMMIT;
