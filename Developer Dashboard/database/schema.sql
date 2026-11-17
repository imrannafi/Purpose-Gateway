-- =====================================================================
--  Purpose Gateway — Developer Portal
--  Database schema (PostgreSQL 15+)
--
--  STATUS: architecture only — NOT connected to the application yet.
--  Apply later with:   psql "$DATABASE_URL" -f database/schema.sql
--                      psql "$DATABASE_URL" -f database/seed.sql
--
--  Conventions
--    • Primary keys: UUID (gen_random_uuid) for business entities,
--      smallint/bigint identity for catalogs and high-volume logs.
--    • All timestamps are TIMESTAMPTZ (stored UTC).
--    • Money is stored as BIGINT in minor units (1 BDT = 100 poisha).
--    • Soft delete via deleted_at where records must be kept for audit.
--    • Secrets are never stored in plain text (hash or encrypt).
--    • Every merchant-owned row carries organization_id (multi-tenant),
--      and live/test data is separated by the `environment` column.
-- =====================================================================

BEGIN;

-- gen_random_uuid() and sha256() are built in (PG13+), no pgcrypto needed.
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive emails

-- ---------------------------------------------------------------------
--  ENUM TYPES
-- ---------------------------------------------------------------------
CREATE TYPE account_status        AS ENUM ('active', 'invited', 'suspended', 'deleted');
CREATE TYPE org_role              AS ENUM ('owner', 'admin', 'developer', 'viewer');
CREATE TYPE environment_type      AS ENUM ('live', 'test');
CREATE TYPE api_key_type          AS ENUM ('publishable', 'secret');
CREATE TYPE api_key_status        AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE payment_method_kind   AS ENUM ('card', 'mobile_wallet', 'bank_transfer');
CREATE TYPE payment_status        AS ENUM ('pending', 'requires_action', 'processing', 'succeeded',
                                           'failed', 'cancelled', 'refunded', 'partially_refunded');
CREATE TYPE refund_status         AS ENUM ('pending', 'succeeded', 'failed', 'cancelled');
CREATE TYPE webhook_status        AS ENUM ('enabled', 'disabled');
CREATE TYPE delivery_status       AS ENUM ('pending', 'succeeded', 'failed', 'retrying');
CREATE TYPE http_method           AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
CREATE TYPE service_status        AS ENUM ('operational', 'degraded', 'partial_outage', 'major_outage', 'maintenance');
CREATE TYPE incident_status       AS ENUM ('investigating', 'identified', 'monitoring', 'resolved');
CREATE TYPE incident_impact       AS ENUM ('none', 'minor', 'major', 'critical');
CREATE TYPE notification_type     AS ENUM ('info', 'success', 'warning', 'error');
CREATE TYPE doc_kind              AS ENUM ('guide', 'reference', 'tutorial', 'changelog');
CREATE TYPE code_language         AS ENUM ('curl', 'node', 'python', 'php', 'java', 'go', 'ruby', 'dotnet');
CREATE TYPE ticket_status         AS ENUM ('open', 'pending', 'resolved', 'closed');
CREATE TYPE ticket_priority       AS ENUM ('low', 'normal', 'high', 'urgent');

-- ---------------------------------------------------------------------
--  SHARED TRIGGER: keep updated_at current
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- =====================================================================
--  1. IDENTITY & TENANCY
-- =====================================================================

-- Merchants / businesses integrating with the gateway.
CREATE TABLE organizations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(160) NOT NULL,
  slug              varchar(80)  NOT NULL UNIQUE,
  legal_name        varchar(200),
  country_code      char(2)      NOT NULL DEFAULT 'BD',
  default_currency  char(3)      NOT NULL DEFAULT 'BDT',
  website_url       text,
  support_email     citext,
  status            account_status NOT NULL DEFAULT 'active',
  live_mode_enabled boolean      NOT NULL DEFAULT false,   -- unlocked after KYC/approval
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- Portal users (developers, admins). Sidebar profile + top-bar avatar.
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext       NOT NULL UNIQUE,
  password_hash      text,                                -- argon2id / bcrypt; NULL for SSO-only users
  full_name          varchar(160) NOT NULL,
  job_title          varchar(80),                         -- e.g. "Developer" (display label)
  avatar_url         text,
  phone              varchar(32),
  status             account_status NOT NULL DEFAULT 'active',
  two_factor_enabled boolean      NOT NULL DEFAULT false,
  two_factor_secret_encrypted bytea,
  email_verified_at  timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- Many-to-many: a user can belong to several organizations with a role.
CREATE TABLE organization_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role             org_role NOT NULL DEFAULT 'developer',
  invited_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_at       timestamptz,
  joined_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX idx_org_members_user ON organization_members(user_id);

-- Dashboard login sessions (opaque token, stored hashed).
CREATE TABLE user_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  uuid REFERENCES organizations(id) ON DELETE SET NULL,  -- currently selected org
  token_hash       char(64) NOT NULL UNIQUE,                               -- sha256 hex
  ip_address       inet,
  user_agent       text,
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON user_sessions(user_id) WHERE revoked_at IS NULL;

-- Per-user UI preferences (Sandbox Mode toggle, default code tab, etc.).
CREATE TABLE user_preferences (
  user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sandbox_mode          boolean       NOT NULL DEFAULT true,
  default_code_language code_language NOT NULL DEFAULT 'curl',
  default_usage_range   varchar(8)    NOT NULL DEFAULT '30d' CHECK (default_usage_range IN ('7d','30d','90d')),
  timezone              varchar(64)   NOT NULL DEFAULT 'Asia/Dhaka',
  email_notifications   boolean       NOT NULL DEFAULT true,
  updated_at            timestamptz   NOT NULL DEFAULT now()
);

-- =====================================================================
--  2. API CREDENTIALS
-- =====================================================================

-- "Your API Keys" card. Full key is shown ONCE at creation; we keep a hash.
CREATE TABLE api_keys (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  name             varchar(100)     NOT NULL,              -- "Live API Key"
  environment      environment_type NOT NULL,              -- live | test
  key_type         api_key_type     NOT NULL DEFAULT 'secret',
  key_prefix       varchar(16)      NOT NULL,              -- "pk_live_" / "sk_test_"
  last_four        char(4)          NOT NULL,              -- for masked display
  key_hash         char(64)         NOT NULL UNIQUE,       -- sha256(full key) hex
  scopes           text[]           NOT NULL DEFAULT ARRAY['*'],
  allowed_ips      inet[],                                 -- optional IP allow-list
  status           api_key_status   NOT NULL DEFAULT 'active',
  last_used_at     timestamptz,
  last_used_ip     inet,
  expires_at       timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- prefix must agree with type + environment: pk_live_, pk_test_, sk_live_, sk_test_
  CHECK (key_prefix = (CASE key_type WHEN 'publishable' THEN 'pk_' ELSE 'sk_' END) || environment::text || '_')
);
CREATE INDEX idx_api_keys_org_env ON api_keys(organization_id, environment, status);

-- =====================================================================
--  3. PAYMENTS DOMAIN
-- =====================================================================

-- Catalog of supported payment methods (bKash, Nagad, Rocket, Visa, ...).
CREATE TABLE payment_methods (
  id               smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code             varchar(32)  NOT NULL UNIQUE,            -- 'bkash'
  name             varchar(64)  NOT NULL,                   -- 'bKash'
  kind             payment_method_kind NOT NULL,
  logo_url         text,
  supports_refund  boolean      NOT NULL DEFAULT true,
  min_amount       bigint       NOT NULL DEFAULT 100,        -- minor units
  max_amount       bigint,
  is_active        boolean      NOT NULL DEFAULT true,
  display_order    smallint     NOT NULL DEFAULT 0
);

-- Which methods a merchant has enabled, per environment.
CREATE TABLE organization_payment_methods (
  organization_id    uuid     NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payment_method_id  smallint NOT NULL REFERENCES payment_methods(id),
  environment        environment_type NOT NULL,
  is_enabled         boolean  NOT NULL DEFAULT true,
  provider_config_encrypted bytea,                           -- merchant credentials with provider
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, payment_method_id, environment)
);

-- End customers of a merchant (optional on a payment).
CREATE TABLE customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment      environment_type NOT NULL,
  public_id        varchar(40) NOT NULL UNIQUE,              -- 'cus_...'
  external_id      varchar(120),                             -- merchant's own id
  name             varchar(160),
  email            citext,
  phone            varchar(32),
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX idx_customers_org ON customers(organization_id, environment);
CREATE UNIQUE INDEX uq_customers_external ON customers(organization_id, environment, external_id) WHERE external_id IS NOT NULL;

-- Core transaction table (POST /pay).
CREATE TABLE payments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id          varchar(40) NOT NULL UNIQUE,            -- 'pay_live_...' / 'pay_test_...'
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  environment        environment_type NOT NULL,
  api_key_id         uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  customer_id        uuid REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id  smallint NOT NULL REFERENCES payment_methods(id),
  amount             bigint  NOT NULL CHECK (amount > 0),    -- minor units
  amount_refunded    bigint  NOT NULL DEFAULT 0 CHECK (amount_refunded >= 0),
  currency           char(3) NOT NULL DEFAULT 'BDT',
  status             payment_status NOT NULL DEFAULT 'pending',
  description        varchar(500),
  merchant_reference varchar(120),                           -- order id on merchant side
  idempotency_key    varchar(255),
  provider_reference varchar(160),                           -- bKash trxID, card auth code ...
  failure_code       varchar(64),
  failure_message    text,
  return_url         text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at            timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (amount_refunded <= amount)
);
CREATE INDEX idx_payments_org_created ON payments(organization_id, environment, created_at DESC);
CREATE INDEX idx_payments_status      ON payments(organization_id, status);
CREATE UNIQUE INDEX uq_payments_idem  ON payments(organization_id, environment, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE refunds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id        varchar(40) NOT NULL UNIQUE,              -- 're_...'
  payment_id       uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  environment      environment_type NOT NULL,
  amount           bigint NOT NULL CHECK (amount > 0),
  reason           varchar(255),
  status           refund_status NOT NULL DEFAULT 'pending',
  provider_reference varchar(160),
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  processed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_refunds_payment ON refunds(payment_id);

-- =====================================================================
--  4. EVENTS & WEBHOOKS
-- =====================================================================

-- Immutable domain events (payment.succeeded, refund.created, ...).
CREATE TABLE events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id        varchar(40) NOT NULL UNIQUE,              -- 'evt_...'
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment      environment_type NOT NULL,
  type             varchar(80) NOT NULL,
  resource_type    varchar(40) NOT NULL,                     -- 'payment', 'refund'
  resource_id      uuid NOT NULL,
  api_version      varchar(16) NOT NULL DEFAULT '2026-01-01',
  payload          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_org_created ON events(organization_id, environment, created_at DESC);
CREATE INDEX idx_events_resource    ON events(resource_type, resource_id);

-- Merchant webhook endpoints ("Webhooks" page / guide).
CREATE TABLE webhook_endpoints (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment              environment_type NOT NULL,
  url                      text NOT NULL CHECK (url ~* '^https?://'),
  description              varchar(255),
  enabled_events           text[] NOT NULL DEFAULT ARRAY['*'],
  signing_secret_encrypted bytea NOT NULL,                   -- needed to sign payloads → encrypted, not hashed
  signing_secret_last_four char(4) NOT NULL,
  api_version              varchar(16) NOT NULL DEFAULT '2026-01-01',
  status                   webhook_status NOT NULL DEFAULT 'enabled',
  consecutive_failures     integer NOT NULL DEFAULT 0,
  disabled_reason          varchar(255),
  created_by               uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_endpoints_org ON webhook_endpoints(organization_id, environment, status);

-- One row per delivery attempt of an event to an endpoint.
CREATE TABLE webhook_deliveries (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_endpoint_id uuid NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id            uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  attempt             smallint NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 20),
  status              delivery_status NOT NULL DEFAULT 'pending',
  request_headers     jsonb,
  response_status     smallint,
  response_body       text,                                  -- truncated to ~4 KB by the app
  duration_ms         integer,
  error_message       text,
  next_retry_at       timestamptz,
  delivered_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (webhook_endpoint_id, event_id, attempt)
);
CREATE INDEX idx_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_deliveries_endpoint_created ON webhook_deliveries(webhook_endpoint_id, created_at DESC);

-- =====================================================================
--  5. API USAGE & ANALYTICS
-- =====================================================================

-- Raw request log — high volume, partitioned by month.
CREATE TABLE api_request_logs (
  id               bigint GENERATED ALWAYS AS IDENTITY,
  request_id       varchar(40) NOT NULL,                     -- 'req_...' (returned in response header)
  organization_id  uuid NOT NULL,
  api_key_id       uuid,
  environment      environment_type NOT NULL,
  method           http_method NOT NULL,
  path             varchar(255) NOT NULL,
  endpoint_id      integer,                                  -- → api_endpoints.id (soft link)
  status_code      smallint NOT NULL,
  latency_ms       integer NOT NULL,
  ip_address       inet,
  user_agent       text,
  error_code       varchar(64),
  is_sandbox_console boolean NOT NULL DEFAULT false,         -- sent from the "Try in Sandbox" button
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
-- Foreign keys are intentionally omitted on this hot table for write speed;
-- integrity is enforced by the API layer. Create monthly partitions via a cron/pg_partman.
CREATE TABLE api_request_logs_2026_11 PARTITION OF api_request_logs FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE api_request_logs_2026_12 PARTITION OF api_request_logs FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE api_request_logs_default PARTITION OF api_request_logs DEFAULT;
CREATE INDEX idx_req_logs_org_created ON api_request_logs(organization_id, environment, created_at DESC);
CREATE INDEX idx_req_logs_request_id  ON api_request_logs(request_id);

-- Daily roll-up powering the "API Usage Overview" card and chart.
CREATE TABLE api_usage_daily (
  organization_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment         environment_type NOT NULL,
  usage_date          date NOT NULL,
  total_requests      bigint  NOT NULL DEFAULT 0,
  successful_requests bigint  NOT NULL DEFAULT 0,           -- 2xx/3xx
  client_errors       bigint  NOT NULL DEFAULT 0,           -- 4xx
  server_errors       bigint  NOT NULL DEFAULT 0,           -- 5xx
  total_latency_ms    bigint  NOT NULL DEFAULT 0,           -- sum, so averages can be re-aggregated
  p95_latency_ms      integer,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, environment, usage_date),
  CHECK (successful_requests + client_errors + server_errors <= total_requests)
);

-- Summary for a date range: Total Requests / Success Rate / Avg Response / Error Rate.
CREATE OR REPLACE FUNCTION fn_usage_summary(p_org uuid, p_env environment_type, p_days integer)
RETURNS TABLE (total_requests bigint, success_rate numeric, avg_response_ms numeric, error_rate numeric)
LANGUAGE sql STABLE AS $$
  SELECT
    COALESCE(SUM(d.total_requests), 0)::bigint,
    ROUND(100.0 * SUM(d.successful_requests) / NULLIF(SUM(d.total_requests), 0), 2),
    ROUND(SUM(d.total_latency_ms)::numeric / NULLIF(SUM(d.total_requests), 0), 0),
    ROUND(100.0 * SUM(d.client_errors + d.server_errors) / NULLIF(SUM(d.total_requests), 0), 2)
  FROM api_usage_daily d
  WHERE d.organization_id = p_org
    AND d.environment     = p_env
    AND d.usage_date     >  current_date - p_days;
$$;

-- =====================================================================
--  6. SYSTEM STATUS
-- =====================================================================

-- "Live Status" card rows.
CREATE TABLE services (
  id              smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name            varchar(80) NOT NULL,                       -- 'Payment Processing'
  slug            varchar(60) NOT NULL UNIQUE,
  description     text,
  current_status  service_status NOT NULL DEFAULT 'operational',
  is_public       boolean  NOT NULL DEFAULT true,
  display_order   smallint NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Health-check samples written by the monitoring worker.
CREATE TABLE service_status_checks (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_id       smallint NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  status           service_status NOT NULL,
  response_time_ms integer,
  region           varchar(32) NOT NULL DEFAULT 'ap-south-1',
  checked_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_status_checks_service_time ON service_status_checks(service_id, checked_at DESC);

-- Daily uptime per service → "99.99% Uptime · Last 30 Days".
CREATE TABLE service_uptime_daily (
  service_id      smallint NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  day             date     NOT NULL,
  uptime_percent  numeric(6,3) NOT NULL CHECK (uptime_percent BETWEEN 0 AND 100),
  downtime_seconds integer NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, day)
);

CREATE OR REPLACE VIEW v_platform_uptime_30d AS
  SELECT ROUND(AVG(uptime_percent), 2) AS uptime_percent
  FROM service_uptime_daily u
  JOIN services s ON s.id = u.service_id AND s.is_public
  WHERE u.day > current_date - 30;

CREATE TABLE incidents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        varchar(200) NOT NULL,
  status       incident_status NOT NULL DEFAULT 'investigating',
  impact       incident_impact NOT NULL DEFAULT 'minor',
  started_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident_services (
  incident_id  uuid     NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  service_id   smallint NOT NULL REFERENCES services(id)  ON DELETE CASCADE,
  PRIMARY KEY (incident_id, service_id)
);

CREATE TABLE incident_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id  uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  status       incident_status NOT NULL,
  message      text NOT NULL,
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_updates_incident ON incident_updates(incident_id, created_at DESC);

-- =====================================================================
--  7. ONBOARDING & NOTIFICATIONS
-- =====================================================================

-- "Getting Started" checklist definition.
CREATE TABLE onboarding_steps (
  id           smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  step_key     varchar(40)  NOT NULL UNIQUE,                 -- 'read_docs'
  position     smallint     NOT NULL,
  title        varchar(120) NOT NULL,
  description  varchar(255),
  cta_url      text,
  is_active    boolean NOT NULL DEFAULT true
);

-- Per-user completion state.
CREATE TABLE user_onboarding_progress (
  user_id       uuid     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id       smallint NOT NULL REFERENCES onboarding_steps(id) ON DELETE CASCADE,
  completed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, step_id)
);

-- Bell-icon notifications.
CREATE TABLE notifications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id  uuid REFERENCES organizations(id) ON DELETE CASCADE,
  type             notification_type NOT NULL DEFAULT 'info',
  title            varchar(160) NOT NULL,
  body             text,
  action_url       text,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_unread ON notifications(user_id, created_at DESC) WHERE read_at IS NULL;

-- =====================================================================
--  8. DEVELOPER CONTENT (docs, endpoints, samples, SDKs, tutorials)
-- =====================================================================

CREATE TABLE doc_categories (
  id         smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  parent_id  smallint REFERENCES doc_categories(id) ON DELETE SET NULL,
  slug       varchar(80) NOT NULL UNIQUE,
  name       varchar(120) NOT NULL,
  position   smallint NOT NULL DEFAULT 0
);

-- API Documentation / Integration Guide articles (search bar source #1).
CREATE TABLE doc_articles (
  id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    smallint REFERENCES doc_categories(id) ON DELETE SET NULL,
  slug           varchar(120) NOT NULL UNIQUE,
  title          varchar(200) NOT NULL,
  summary        varchar(500),
  body_markdown  text NOT NULL DEFAULT '',
  kind           doc_kind NOT NULL DEFAULT 'guide',
  api_version    varchar(16) NOT NULL DEFAULT '2026-01-01',
  is_published   boolean NOT NULL DEFAULT false,
  published_at   timestamptz,
  author_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  search_vector  tsvector GENERATED ALWAYS AS (
                   setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
                   setweight(to_tsvector('english', coalesce(summary, '')), 'B') ||
                   setweight(to_tsvector('english', coalesce(body_markdown, '')), 'C')
                 ) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doc_articles_search ON doc_articles USING gin(search_vector);

-- API reference endpoints (search bar source #2).
CREATE TABLE api_endpoints (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id     varchar(80) NOT NULL UNIQUE,              -- 'payments.create'
  method           http_method NOT NULL,
  path             varchar(200) NOT NULL,                    -- '/pay'
  summary          varchar(200) NOT NULL,
  description      text,
  category_id      smallint REFERENCES doc_categories(id) ON DELETE SET NULL,
  request_schema   jsonb,                                    -- JSON Schema / OpenAPI fragment
  response_schema  jsonb,
  api_version      varchar(16) NOT NULL DEFAULT '2026-01-01',
  is_deprecated    boolean NOT NULL DEFAULT false,
  search_vector    tsvector GENERATED ALWAYS AS (
                     to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(path, '') || ' ' || coalesce(description, ''))
                   ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (method, path, api_version)
);
CREATE INDEX idx_api_endpoints_search ON api_endpoints USING gin(search_vector);

-- Code panel tabs (cURL / Node.js / Python / PHP). {{KEY}} placeholder is replaced client-side.
CREATE TABLE code_samples (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  endpoint_id  integer NOT NULL REFERENCES api_endpoints(id) ON DELETE CASCADE,
  language     code_language NOT NULL,
  label        varchar(40) NOT NULL,                         -- 'Node.js'
  code         text NOT NULL,
  position     smallint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint_id, language)
);

-- "SDK & Libraries".
CREATE TABLE sdk_libraries (
  id               smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  language         code_language NOT NULL,
  display_name     varchar(80) NOT NULL,
  package_name     varchar(120) NOT NULL,
  latest_version   varchar(32) NOT NULL,
  install_command  text NOT NULL,
  repository_url   text,
  docs_url         text,
  is_official      boolean NOT NULL DEFAULT true,
  released_at      timestamptz,
  UNIQUE (language, package_name)
);

-- "Watch Tutorial" videos.
CREATE TABLE tutorials (
  id                smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title             varchar(160) NOT NULL,
  description       text,
  video_url         text NOT NULL,
  thumbnail_url     text,
  duration_seconds  integer,
  position          smallint NOT NULL DEFAULT 0,
  is_featured       boolean NOT NULL DEFAULT false,
  is_published      boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
--  9. SUPPORT
-- =====================================================================

CREATE TABLE support_tickets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id        varchar(20) NOT NULL UNIQUE,              -- 'PG-10234'
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  opened_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_to      uuid REFERENCES users(id) ON DELETE SET NULL,
  subject          varchar(200) NOT NULL,
  category         varchar(60),                              -- 'integration', 'billing', ...
  status           ticket_status   NOT NULL DEFAULT 'open',
  priority         ticket_priority NOT NULL DEFAULT 'normal',
  related_request_id varchar(40),                            -- api_request_logs.request_id
  closed_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_org_status ON support_tickets(organization_id, status);

CREATE TABLE support_ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  is_staff     boolean NOT NULL DEFAULT false,
  body         text NOT NULL,
  attachments  jsonb NOT NULL DEFAULT '[]'::jsonb,           -- [{name, url, size}]
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_messages_ticket ON support_ticket_messages(ticket_id, created_at);

-- =====================================================================
--  10. AUDIT
-- =====================================================================

-- Security-relevant actions (key created/revoked, webhook changed, member invited ...).
CREATE TABLE audit_logs (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id  uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id    uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_api_key_id uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  action           varchar(80) NOT NULL,                     -- 'api_key.revoked'
  target_type      varchar(40),
  target_id        varchar(64),
  ip_address       inet,
  user_agent       text,
  metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_org_created ON audit_logs(organization_id, created_at DESC);

-- ---------------------------------------------------------------------
--  Attach updated_at trigger to every table that has the column
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables tb ON tb.table_name = c.table_name AND tb.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;

COMMIT;
