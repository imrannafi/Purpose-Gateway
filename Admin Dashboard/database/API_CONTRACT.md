# Dashboard API Contract

Base URL: `/api/v1`. Auth: admin session cookie (or `Authorization: Bearer <jwt>`). All responses are JSON.
Timestamps are ISO-8601 UTC. Money values are numbers in major units (BDT).

Every endpoint below matches a method in `assets/js/data.js`. The mock data there returns exactly these
shapes, so switching `USE_MOCK` to `false` is the only frontend change.

---

### `GET /dashboard/kpis?range=7d|30d|90d` → `getKpis()`
```json
{
  "totalTransactions": 124850, "successfulTransactions": 122844,
  "failedTransactions": 1606,  "pendingTransactions": 400,
  "totalVolume": 61920750,     "totalRefunds": 984,
  "txDelta": 12.5,             "successRate": 98.7,
  "successDelta": 0.3,         "totalRevenue": 2475320,
  "revenueDelta": 18.2,        "riskAlerts": 12,
  "riskDelta": -20.0,
  "sparks": { "totalTransactions": [..], "successRate": [..], "totalRevenue": [..], "riskAlerts": [..] }
}
```
**Source:** `v_daily_platform_stats` for the current period vs. the previous period of the same length.
Transaction counts, `totalVolume` (gross amount in BDT), and `totalRefunds` are for the selected period.
`successRate` is successful transactions divided by completed transactions (successful + failed); pending
transactions are excluded. `riskAlerts` = count of `risk_alerts` created in the period. Deltas are % change.

The dashboard combines this response with `GET /merchants/stats` for total registered and active merchants,
and the enabled-provider list from `GET /providers/health` for active payment providers.

### `GET /providers/health` → `getProviders()`
```json
[{ "id": "uuid", "code": "bkash", "name": "bKash", "type": "mfs",
   "status": "online", "uptime": 99.9, "successRate": 99.1, "avgLatencyMs": 412 },
 { "id": "uuid", "code": "upay", "name": "Upay", "type": "mfs",
   "status": "online", "uptime": 99.6, "successRate": 98.8, "avgLatencyMs": 468 }]
```
**Source:** `payment_providers` (`uptime_30d`, `success_rate_24h`, `avg_latency_ms`), `WHERE is_enabled ORDER BY display_order`.
The dashboard uses provided local logo assets for bKash, Nagad, Rocket and Upay; card-network marks remain vector logos.

### Payment provider management

- `GET /providers` returns all provider configuration and monitoring fields for the management page:
  `id`, `code`, `name`, `type`, `status`, `isEnabled`, `uptime`, `successRate`, `failureRate`,
  `avgLatencyMs`, `transactionCount`, `transactionVolume`, `credentialsConfigured`, `apiBaseUrl`,
  `transactionLimit`, `dailyLimit`, `priority`, `fallbackProviderId`, and recent `logs`.
- `GET /providers/:id` returns a single provider. Credential values must never be returned; only a boolean
  such as `credentialsConfigured` is exposed.
- `POST /providers` adds a provider with its credentials transmitted over TLS to a server-side secrets manager.
  Return the non-secret provider DTO only.
- `PATCH /providers/:id` updates provider configuration, enable state, credentials, or transaction limits.
  Empty credential fields mean “leave the existing secret unchanged”; credentials must never be logged or
  returned in API responses. The server validates URL scheme, limit values, permissions, and transitions.
- `PATCH /providers/routing` accepts `{ "routes": [{ "type": "mfs", "primaryProviderId": "...",
  "fallbackProviderId": "..." }] }`. Validate that each referenced provider is enabled, belongs to the
  specified payment type, and that primary/fallback are distinct.
- `GET /providers/:id/logs` may be used for paginated integration events. Mask sensitive headers and payloads;
  never include API keys, tokens, or secrets in logs.

Health and performance metrics are read-only observations from provider health checks and transaction
aggregates. The UI's mock metrics and mutations are demonstration data only and reset on reload. Real credential
storage, connectivity checks, access control, and durable audit logging require the backend; each mutation must
be authorized and audited in the same database transaction.

### Smart routing management

- `GET /routing/config` returns `config.autoFailover`, ordered `config.rules`, enabled provider records,
  recent routing `decisions`, and aggregate `analytics`.
- Each routing rule has `id`, `method` (`any` or a supported payment method), `methodType` (`mfs` or `card`
  when the method is specific), inclusive `minAmount`/`maxAmount` in BDT (`null` maximum means unbounded),
  `primaryProviderId`, and optional `fallbackProviderId`. Evaluate rules in the returned order, with specific
  rules before broad rules.
- `PATCH /routing/config` accepts `{ "autoFailover": true, "priorityRoutes": [{ "type": "mfs",
  "primaryProviderId": "...", "fallbackProviderId": "..." }], "rules": [...],
  "providerLimits": [{ "id": "...", "transactionLimit": 100000, "dailyLimit": 500000 }] }`.
  Validate enabled provider references and payment-type compatibility, reject duplicate primary/fallback
  choices and invalid amount ranges, and require daily limits to be at least the per-transaction limit. Preserve
  rule ordering so specific rules can precede broad rules. Persist configuration and audit the change atomically.
- Routing decisions should record the selected rule/provider, primary/fallback outcome, timestamp, and
  transaction reference without including credentials or sensitive payment payloads. Analytics should expose
  routed volume, primary selections, failover counts, success rates, and decision latency.

### Financial management and settlement monitoring

- `GET /finance/overview?range=7d|30d|90d` returns aggregate `processedVolume`, `platformFees`,
  `providerFees`, `merchantPayables`, `refundAmount`, and `pendingSettlementAmount`, plus the filtered
  settlement records. Support optional `status`, `providerId`, `merchantId`, and `discrepanciesOnly` filters.
- A settlement record includes `id`, `period`, merchant/provider IDs and names, `processedVolume`,
  `platformFee`, `providerFee`, `refundAmount`, `payableAmount`, `expectedAmount`, `settledAmount`, `status`,
  and a `discrepancyReason` when applicable. Payable calculations must account for captured payments, refunds,
  platform fees, provider fees, reversals, and adjustments according to the financial ledger.
- Reconcile provider-reported settlement statements against the internal ledger. Keep pending/processing
  settlements distinct from settled funds; flag non-zero expected-versus-reported differences for review,
  retaining the source statement reference and reconciliation timestamps.
- The client report export includes the currently filtered settlement records. Production exports should be
  generated server-side for complete, auditable financial periods and must use the authorized ledger data.
  Financial overview figures and settlement rows in this dashboard are sample-only until API integration.

### Reconciliation management

- `GET /reconciliation?batchId=&exceptionType=&reviewStatus=&q=` returns statement batches, the selected
  batch, summary counts, and comparison rows. A batch includes `id`, `providerId`, `providerName`, `filename`,
  `importedAt`, `status`, provider record count, matched count, exception count, and pending-review count.
  A comparison row includes its source (`provider` or `internal`), provider reference, transaction ID,
  provider amount/currency/status/settled time, matched internal transaction summary, exception type, and
  review status/history. Paginate large batches in production.
- `POST /reconciliation/batches` accepts `multipart/form-data` containing `providerId` and the original
  `statement` CSV file. Require an authenticated admin and enabled provider; validate supported file type and
  encoding, bounded file/row sizes, required reference and amount fields, valid currency/status, and safe
  numeric values on the server (client-side validation is only for user feedback). Store the original statement
  in access-controlled storage with a checksum and uploader metadata; never trust a client-supplied filename or
  provider identity without validation.
- Match records using the provider's stable transaction reference first, then an exact transaction ID only
  when provider and transaction context agree. Do not silently auto-match ambiguous candidates. Compare amount
  and currency after normalization; flag amount mismatches, provider records without internal transactions,
  successful/refunded internal transactions absent from the statement, and duplicate provider references as
  separate exceptions. Retain the match basis and statement line number for auditability.
- Supported row result types are `matched`, `missing_internal`, `missing_provider`, `amount_mismatch`, and
  `duplicate`. Batch status is `review_required` while any exception has not been reviewed, otherwise
  `reconciled`; statement import and matching must not alter payment, refund, or settlement ledger entries.
- `PATCH /reconciliation/batches/:batchId/records/:recordId` accepts
  `{ "reviewStatus": "reviewed", "note": "..." }`. Verify the row belongs to the batch and caller is allowed
  to review it; preserve prior review events append-only and audit the action atomically. Review is an
  investigation annotation, not a financial adjustment or confirmation of a duplicate charge.
- `GET /reconciliation/batches/:batchId/report` returns a complete, authorized reconciliation report including
  match outcomes and reviewed/unreviewed exceptions. Production reports should be generated server-side for
  full batches and maintain an audit trail. The dashboard CSV export is a filtered client-side report of the
  currently available rows.
- Never store payment credentials in a statement; redact account/card identifiers and sensitive customer
  information from displayed records, logs, and reports. The current mock batch and CSV imports are in-memory
  demonstrations only and are cleared on reload; no real provider file is uploaded or ledger modified.

### Refund and dispute management

- `GET /refunds?status=&disputeStatus=&q=` returns refund requests filtered by refund status, dispute status,
  and a search query matching refund ID, transaction ID, merchant, or customer. Each refund includes `id`,
  `transactionId`, merchant/provider/customer display values, `amount`, `currency`, `reason`, `status`,
  `requestedAt`, `dispute` (`status`, `reason`), investigation `notes`, and ordered `history`. Use cursor
  pagination in production; return aggregate counts and requested amount separately if the list is paginated,
  so summary cards remain accurate.
- Refund statuses are `requested`, `approved`, `processing`, `failed`, `completed`, and `rejected`. Allowed
  transitions are: `requested` → `approved` or `rejected`; `approved` or `failed` → `processing` (retry);
  and `processing` → `completed` or `failed`. The API must validate transitions and permissions server-side.
- `PATCH /refunds/:id/status` accepts `{ "action": "approve|reject|process|complete|fail", "note": "..." }`
  and returns the updated refund. A rejection requires a non-empty decision reason. Processing and retry
  actions must be idempotent and submit a refund through the selected provider; return `processing` until
  the provider confirms a final result. Do not treat an admin UI action as proof that funds were returned.
- `PATCH /refunds/:id/dispute` accepts
  `{ "status": "open|under_review|resolved|none", "note": "..." }` and returns the updated dispute/refund.
  Keep dispute resolution separate from the refund's own status; record the investigation update and actor.
- `POST /refunds/:id/notes` accepts `{ "note": "..." }` and returns the created note. Reject empty notes.
- `GET /refunds/audit?limit=50` returns newest-first audit entries with `id`, `refundId`, `transactionId`,
  `at`, `actor`, `action`, and `note`. In production, paginate this endpoint and keep audit records append-only.
- Every decision, retry, provider status update, dispute change, and investigation note must be authorized and
  audited atomically. Enforce eligibility and role permissions on the server, use idempotency keys for provider
  refund requests, and preserve provider references and failure classifications for investigation. Never expose
  credentials, raw provider payloads, full payment identifiers, or unmasked customer data in refund details,
  notes, or logs. The current mock actions only change in-memory demonstration data and do not initiate an
  actual provider refund or persist across reloads.

### `GET /analytics/transactions?period=week|month|quarter` → `getTransactionSeries()`
```json
[{ "date": "2025-11-01", "label": "Nov 1", "successful": 38200, "failed": 11040,
   "pending": 20110, "volume": 1250000 }]
```
**Source:** `v_daily_platform_stats` (`success_count`, `failed_count`, `pending_count`, `gross_volume_bdt`).
Quarter is bucketed weekly. `volume` is the gross transaction amount in BDT for the bucket. Successful and failed
series are plotted on separate labeled axes so the smaller failed count remains visible.

### `GET /analytics/payment-methods?range=7d|30d|90d` → `getPaymentMethodDistribution()`
```json
[{ "code": "bkash", "name": "bKash", "count": 47443 }]
```
**Source:** transaction counts grouped by payment provider/method for the selected period.

### `GET /analytics/transactions/daily` → `getDailyActivity()`
```json
[{ "date": "2025-11-30", "label": "Sun", "total": 4270 }]
```
Returns total transaction counts for each of the last seven days.

### Global transaction monitoring

`GET /transactions` accepts `id`, `merchantId`, `providerId`, `status`, `from`, `to`, `amountMin`,
`amountMax`, and `duplicatesOnly` filters, plus the standard cursor pagination parameters. Return newest
records first. A transaction summary includes `id`, merchant/provider IDs and display names, `amount`,
`currency`, `status`, `paymentMethod`, `createdAt`, order/reference IDs, masked customer fields,
`providerReference`, duplicate-group metadata, and a failure reason when applicable.

`GET /transactions/:id` returns complete transaction details and ordered lifecycle/status history. Failed
transactions also include an `investigation` object with the initiation timestamp, selected provider, retry
count, and an ordered `apiAttempts` list. The parent transaction's `status` is the final transaction status.
Each API attempt contains only its attempt number, timestamp, request status/HTTP status, response
classification/HTTP status, and latency. Do not return raw request or response bodies to the dashboard.

Redact sensitive values before writing any provider trace to persistent logs. Never log API credentials,
authorization headers, access tokens, full card numbers, CVV/CVC, bank account details, or raw payment
payloads. Mask any permitted customer/payment identifiers at the source; frontend escaping is not a substitute
for server-side redaction. Include provider response classifications suitable for failure investigation, but
do not expose unmasked customer information. Duplicate-attempt detection should be presented as a review
signal, not proof of duplicate settlement; correlate merchant/order reference, amount, and provider settlement
records before resolving.

The UI exports the currently filtered result set as CSV and protects cells that could be interpreted as
spreadsheet formulas. In production, provide a server-side export for large or paginated result sets, or ensure
the client explicitly exports all matching rows rather than only the current page. The current mock sample is
for UI demonstration only and does not represent live platform transactions.

### `GET /merchants/stats` → `getMerchantStats()`
```json
{ "total": 2350, "active": 2280, "suspended": 70, "pending": 0 }
```
**Source:** `v_merchant_stats`.

### Merchant management

`GET /merchants?status=&q=` returns the merchant records used by the management view. Each record includes
business/contact details (with PII masked), application and verification state, account status, integration
health, transaction limits, permissions, payment-performance aggregates, and recent transactions. In production,
paginate this endpoint using the cursor convention below.

`GET /merchants/:id` returns one merchant profile with the same fields.

`PATCH /merchants/:id` updates only the supplied manageable fields, such as `status`, `applicationStatus`,
`verificationStatus`, `transactionLimit`, `dailyLimit`, or `permissions`. Validate status transitions, limit
values, and permission keys server-side; keep application decisions separate from business verification.
Every mutation must be authorized and audited in the same database transaction. The current mock records in
`assets/js/data.js` support these interactions in memory and reset on reload; they do not persist data or replace
a backend.

### Admin user and role management

- `GET /admin/access-options` returns the assignable `roles` and permission definitions `{ key, label }`.
  The server remains the source of truth for role-to-permission policy; a client-provided permission list must
  never grant access by itself.
- `GET /admin/users?status=&q=` returns paginated admin account records with `id`, `name`, `email`, `role`,
  `status` (`active` or `inactive`), permission keys, `twoFactorEnabled`, `requireApprovedNetwork`,
  approved IPv4/CIDR ranges, and recent login events. Login events should include timestamp, coarse location,
  masked IP, device summary, outcome, and whether MFA was verified. Exclude password hashes, MFA secrets,
  recovery codes, session tokens, and unnecessary device/network identifiers.
- `GET /admin/users/:id` returns the same admin profile with a bounded recent login history. Mask IP addresses
  and avoid exposing credential or session details in both list and detail responses.
- `POST /admin/users` accepts `name`, `email`, `role`, optional permission selections and approved network
  restrictions, and an MFA enrollment requirement. It must create an expiring, single-use invitation rather
  than accept or store a password in the admin UI. Verify the inviter's permission, validate the role and
  access policy, notify the invitee securely, and audit the action.
- `PATCH /admin/users/:id` may update profile fields, role, permissions, status, MFA enrollment state, and
  network restrictions. Validate the caller's authority, role/permission compatibility, status transitions,
  email uniqueness, and network ranges server-side. Prevent an administrator from deactivating their own
  account or removing their last effective super-admin access; on deactivation revoke active sessions and
  outstanding invitations. Record actor, target, changed fields, timestamp, and outcome in an immutable audit
  record without logging secrets.
- MFA enablement must be a real enrollment/verification flow in the identity backend, with appropriate
  recovery and account-recovery controls. A UI flag alone is not proof of MFA. Login history must be sourced
  from authentication events and protected from unauthorized access. The current demo supports in-memory
  account/profile changes and displays sample sign-in history only; it does not provision invitations, enforce
  role permissions, enforce network restrictions, revoke sessions, or enroll MFA.

### Risk and fraud monitoring

- `GET /risk-alerts?status=&severity=&type=&q=` returns flagged transaction, merchant, and authentication
  activity. Support `open`, `investigating`, `resolved`, and `dismissed` states and `critical`, `high`,
  `medium`, and `low` severities. Each alert includes `id`, `type`, `title`, `severity`, `status`,
  `createdAt`, masked merchant/account identifiers, optional `transactionId`, `amount`, `paymentMethod`,
  a concise `summary`, evidence items, a review recommendation, and append-only `reviewHistory`. Search
  should cover alert ID, merchant, transaction reference, title, and summary. Paginate in production.
- Detection should cover repeated failed transactions, potential duplicate payments, unusual transaction
  amounts, abnormal transaction frequency, suspicious merchant activity, and unusual login attempts.
  Detection thresholds and baselines must be evaluated server-side using configurable policies and an
  appropriate lookback window; do not infer fraud solely from a single threshold match.
- Duplicate-payment detection is a review signal only. Correlate merchant/order reference, amount, payment
  lifecycle, and provider settlement records before confirming a duplicate charge. Do not automatically
  reverse payments, suspend merchants, or lock users solely because a detector fired.
- `PATCH /risk-alerts/:id` accepts `{ "status": "investigating|resolved|dismissed", "note": "..." }`.
  Allow `open` → `investigating|resolved|dismissed` and `investigating` → `resolved|dismissed`; require a
  non-empty review reason when dismissing. Validate transitions and reviewer permissions, retain the reviewer,
  timestamp, prior status, and note as append-only history, and audit the mutation in the same database
  transaction. An alert that is resolved or dismissed must not be silently reopened; create a linked follow-up
  alert if new evidence arrives.
- `GET /risk-alerts/summary` returns `{ "openCount": 12, "byType": [{ "type": "...", "label": "...",
  "count": 5, "severity": "high" }] }`, with counts derived from alerts currently open or investigating.
  The dashboard home-page badge and risk summary should use the same definition.
- Authentication risk events may include masked account identifiers and coarse location/network metadata
  only when policy permits. Never expose passwords, tokens, full IP/device identifiers, raw payment payloads,
  or unmasked personal/payment data in alert details or audit records. The current mock alert list is static
  demonstration data: it does not execute detection rules, block activity, or represent live incidents.

**Source:** `v_risk_summary` (open and investigating alerts).

### System monitoring and API health

- `GET /system/health?level=&q=` returns a point-in-time operational snapshot. Include `capturedAt` (ISO-8601),
  `status` (`green`, `yellow`, or `red`), `demo: false`, and the following metrics: `api` (`status`, `uptime`,
  `averageResponseMs`, `p95ResponseMs`, `requestsPerMinute`, `failedRequests24h`); `database` (`status`,
  `uptime`, `connections`, `connectionLimit`, `replicationLagMs`); `webhook` (`status`, `deliveryRate`,
  `pending`, `failed24h`, `averageDeliveryMs`); and `jobs` (`status`, `queued`, `running`, `failed24h`,
  `oldestQueuedMinutes`).
- The snapshot also includes enabled `providers` with `id`, `name`, `status`, `uptime`, `averageResponseMs`,
  `successRate`, and `failureRate`; `servers` with `id`, `name`, `status`, `cpuPercent`, `memoryPercent`,
  and `diskPercent`; and `performance` points with `label`, `responseMs`, `errorRate`, and
  `requestsPerMinute`. Each `backgroundJobs` entry contains `id`, `name`, `queue`, `status`, and
  `lastRunAt` (plus optional duration). `failedRequests` entries should contain only `id`, `at`, `method`,
  route template, `statusCode`, `durationMs`, `requestId`, and a sanitized `message`.
- Return `errorLogs` entries with `id`, `at`, `level` (`critical`, `error`, or `warning`), `service`,
  sanitized `message`, and a non-sensitive correlation `requestId`. Apply `level` and `q` filters on the
  server, matching the corresponding log level and safe searchable text. Use pagination for production log
  and request histories; the dashboard's bounded sample list is not a substitute for log retention.
- `status` is the worst component status in the snapshot. Configure explicit, service-owned thresholds for
  healthy, degraded, and critical states based on uptime, latency, error rate, provider availability, queue
  delay, and resource capacity; keep the threshold policy consistent between API and UI. Generate timestamps
  from the metric collection time and expose freshness/staleness so an old successful check is not reported as
  healthy. The current mock telemetry is illustrative and does not probe infrastructure or represent live
  incidents.
- Never include API credentials, authorization headers, secrets, payment card/account data, customer PII,
  raw request/response bodies, or unredacted query parameters in failed-request details, error logs, or
  monitoring responses. Sanitize at log ingestion as well as at response serialization; restrict production
  log access and audit privileged access.

**Source:** health-check and metrics aggregation services, provider probes, webhook delivery queue, job runner,
and sanitized operational log index.

### `GET /activity?limit=6` → `getRecentActivity()`
```json
[{ "id": "123", "kind": "transaction", "title": "New transaction from Rahim Ahmed",
   "meta": "৳ 2,500 via bKash", "status": "success", "createdAt": "2025-11-30T08:30:00Z" }]
```
**Source:** `activity_events ORDER BY created_at DESC LIMIT $1`. `status` maps to `status_label`.

### `GET /audit-logs?limit=4` → `getAuditLogs()`
```json
[{ "id": "991", "createdAt": "2025-11-30T08:32:00Z", "eventType": "routing.configuration.updated",
   "category": "routing", "action": "Updated Routing Rule", "actorName": "Admin",
   "actorId": "adm_1001", "target": "MFS routing rules", "outcome": "success",
   "ipAddress": "103.110.45.**", "changes": [{ "field": "autoFailover",
   "previousValue": false, "updatedValue": true }] }]
```
**Source:** `audit_logs ORDER BY created_at DESC`. `action` maps to `action_label`.

### Audit Logs & Security Center

- `GET /security/audit-logs?category=&outcome=&from=&to=&q=&cursor=&limit=` returns `{ logs, summary, total }`.
  Each immutable event includes `id`, server-generated `createdAt`, stable `eventType`, `category`, human-readable
  `action`, `actorName`, `actorId`, `target`, `outcome` (`success`, `failure`, or `denied`), masked `ipAddress`,
  and a `changes` array of `{ field, previousValue, updatedValue }` when configuration or status changes. Search
  and filters must be applied server-side; paginate results and protect ordering with a stable cursor.
- Record admin login, logout, and failed login attempts in the authentication service, including attempts for
  unknown accounts. Failed authentication events must be written without retaining a password, MFA code, token,
  or raw credential payload. Store an outcome and safe reason code; mask or pseudonymize the attempted account
  identifier and source IP according to retention policy. The frontend demo session emits sample sign-in and
  sign-out events; the auth backend must emit the authoritative events.
- Record merchant application approval/rejection and account suspension/reactivation; provider creation and
  configuration/enabled-state changes; routing rule, priority, failover, and limit changes; refund decisions;
  and admin account, role, permission, MFA, and access restriction changes. Capture actor, target, timestamp,
  outcome, and per-field before/after values. On a new object, previous values are `null`; do not invent old
  values when unavailable.
- Never store secrets or raw credential values in audit diffs. Credential changes may only record a safe
  metadata transition (for example `credentialsConfigured: false → true`) and must not include request bodies,
  authorization headers, passwords, MFA secrets/recovery codes, raw payment data, or unnecessary PII.
  Mask source IPs and restrict detailed security-log access. Audit data must be append-only, tamper-evident,
  access-controlled, retained per policy, and written atomically with the protected mutation.
- `POST /security/auth-events` is an ingestion contract for trusted authentication middleware, not a way for a
  browser to assert its own identity. The backend derives the actor, timestamp, outcome, and source metadata from
  the verified session/request; only allowlisted event fields may be accepted from clients. For failed sign-in
  events, record a safe reason code and a masked attempted identity. Backend authorization and immutable event
  storage are required; the current dashboard audit feed is demonstration/in-memory data and is not a compliance
  record.

### `GET /notifications` → `getNotifications()`
```json
[{ "id": "uuid", "category": "provider_downtime", "title": "Provider unavailable",
   "level": "danger", "read": false, "createdAt": "…", "page": "monitor" }]
```
**Source:** `notifications WHERE admin_user_id = :me OR admin_user_id IS NULL`. `read` = `read_at IS NOT NULL`.
Supported categories are `merchant_registration`, `provider_downtime`, `transaction_failure`, `suspicious_activity`,
`failed_settlement`, `reconciliation_mismatch`, `refund_status`, and `system_maintenance`. `level` is `danger`,
`warning`, or `info`; `page` is an allowlisted dashboard route. The backend must enforce per-admin visibility
and apply configured notification preferences when generating and delivering new events.

### `POST /notifications/read-all` → `markAllNotificationsRead()`
Sets `read_at = now()` on the caller's unread notifications. Returns `{ "ok": true }`.

### `GET /admin/me` / `PATCH /admin/me` → `getMyAdminProfile()` / `updateMyAdminProfile(changes)`
`GET` returns the authenticated administrator's `id`, `name`, `email`, `jobTitle`, `phone`, `role`, `status`,
and `avatarUrl` (or `null`). `PATCH` accepts editable `name`, `email`, `jobTitle`, and `phone` fields as
`multipart/form-data`; an optional `avatar` file replaces the current picture, while `removeAvatar=true`
removes it. The backend derives the account identity from the authenticated session and must not accept an
admin ID from the client. Validate field lengths, email uniqueness, image content (not only the supplied MIME
type), and a 2 MB maximum; allow only JPEG, PNG, and WebP, strip metadata where practical, and store the image
in protected media storage rather than audit logs. Role, account status, permissions, and authentication
credentials are read-only from this endpoint. Record a profile-update audit event without copying profile
picture bytes or unnecessary personal data into the event. The current mock profile updates are in-memory only.

### `GET /admin/preferences` / `PATCH /admin/preferences` → `getAdminSettings()` / `saveAdminSettings(changes)`
Read and update the authenticated admin's `{ "timeZone": "Asia/Dhaka", "dateFormat": "medium",
"defaultRange": "30d" }` dashboard preferences. Allowed time zones are `Asia/Dhaka`, `UTC`, and
`Asia/Singapore`; date formats are `medium`, `numeric`, and `iso`; reporting periods are `7d`, `30d`, and
`90d`. Reject unsupported values and persist preferences per admin account. The frontend demo stores these
display preferences in browser local storage; production settings must be server-persisted and returned by the
authenticated admin preferences endpoint. Authentication policy, password resets, session revocation, and
two-factor enrollment are deliberately not changed by this preference endpoint.

### `PATCH /notifications/:id/read` → `markNotificationRead(id)`
Marks one notification read for the authenticated admin. Return `{ "ok": true }`; reject unknown IDs and
notifications outside the caller's scope.

### `GET /notifications/preferences` → `getAlertPreferences()`
Returns `{ "preferences": { "<category>": { "enabled": true, "inApp": true, "email": false, ... } },
"rules": { "<category>": { "label": "...", "description": "...", "threshold": { ... } } } }`.
Preferences are scoped to the authenticated admin. Thresholds include provider downtime minutes; transaction
failure percentage and minimum sample size; minimum suspicious activity risk score; and minimum failed-settlement
or reconciliation mismatch amount in BDT. Registration, refund-status, and maintenance alerts have no numeric
threshold in this UI.

### `PATCH /notifications/preferences` → `saveAlertPreferences(preferences)`
Accepts the complete per-category preference map and returns `{ "preferences": { ... } }`. Validate the allowlisted
category and delivery fields, boolean values, and numeric threshold bounds server-side. Persist settings per
admin and apply them to subsequent alert generation and delivery. Delivery channels must be authorized and
configured server-side; the frontend does not send email or monitor operational events. Alert generation must
be deduplicated and retain auditable delivery outcomes. The current mock preferences and alert inbox are
demonstration data and reset on reload.

### `GET /search?q=` → `search()`
```json
[{ "type": "Merchant", "label": "Alpha Store", "page": "merchants" }]
```
**Source:** union over `merchants.business_name`, `routing_rules.name`, `payment_providers.name` and
`transactions.txn_ref` (ILIKE, or a `pg_trgm` index once it's needed). Limit 8.

---

## Rules for the backend

- **Write an audit log for every mutation.** Any admin `POST`, `PUT`, `PATCH` or `DELETE` must insert into `audit_logs`
  in the same database transaction as the change itself.
- **Enforce RBAC server-side** with `role_permissions`. Hiding something in the UI is not access control.
- Mask PII in responses (phone, card, account numbers).
- Paginate list endpoints with `?cursor=` on `(created_at, id)`.
