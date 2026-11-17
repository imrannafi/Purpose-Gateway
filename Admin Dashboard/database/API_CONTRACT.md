# Dashboard API Contract

Base URL: `/api/v1`. Auth: admin session cookie (or `Authorization: Bearer <jwt>`). All responses are JSON.
Timestamps are ISO-8601 UTC. Money values are numbers in major units (BDT).

Every endpoint below matches a method in `assets/js/data.js`. The mock data there returns exactly these
shapes, so switching `USE_MOCK` to `false` is the only frontend change.

---

### `GET /dashboard/kpis?range=7d|30d|90d` → `getKpis()`
```json
{
  "totalTransactions": 124850, "txDelta": 12.5,
  "successRate": 98.7,         "successDelta": 0.3,
  "totalRevenue": 2475320,     "revenueDelta": 18.2,
  "riskAlerts": 12,            "riskDelta": -20.0,
  "sparks": { "totalTransactions": [..], "successRate": [..], "totalRevenue": [..], "riskAlerts": [..] }
}
```
**Source:** `v_daily_platform_stats` for the current period vs. the previous period of the same length.
`riskAlerts` = count of `risk_alerts` created in the period. Deltas are % change.

### `GET /providers/health` → `getProviders()`
```json
[{ "id": "uuid", "code": "bkash", "name": "bKash", "type": "mfs",
   "status": "online", "uptime": 99.9, "successRate": 99.1, "avgLatencyMs": 412 }]
```
**Source:** `payment_providers` (`uptime_30d`, `success_rate_24h`, `avg_latency_ms`), `WHERE is_enabled ORDER BY display_order`.

### `GET /analytics/transactions?period=week|month|quarter` → `getTransactionSeries()`
```json
[{ "date": "2025-11-01", "label": "Nov 1", "successful": 38200, "failed": 11040, "pending": 20110 }]
```
**Source:** `v_daily_platform_stats` (`success_count`, `failed_count`, `pending_count`). Quarter is bucketed weekly.

### `GET /merchants/stats` → `getMerchantStats()`
```json
{ "total": 2350, "active": 2280, "suspended": 70, "pending": 0 }
```
**Source:** `v_merchant_stats`.

### `GET /risk-alerts/summary` → `getRiskSummary()`
```json
{ "openCount": 12,
  "byType": [{ "type": "suspicious_transaction", "label": "Suspicious Transaction", "count": 5, "severity": "high" }] }
```
**Source:** `v_risk_summary` (open, investigating and escalated alerts).

### `GET /activity?limit=4` → `getRecentActivity()`
```json
[{ "id": "123", "kind": "transaction", "title": "New transaction from Rahim Ahmed",
   "meta": "৳ 2,500 via bKash", "status": "success", "createdAt": "2025-11-30T08:30:00Z" }]
```
**Source:** `activity_events ORDER BY created_at DESC LIMIT $1`. `status` maps to `status_label`.

### `GET /audit-logs?limit=4` → `getAuditLogs()`
```json
[{ "id": "991", "createdAt": "2025-11-30T08:32:00Z", "action": "Updated Routing Rule",
   "actorName": "Admin", "ipAddress": "103.110.45.67" }]
```
**Source:** `audit_logs ORDER BY created_at DESC`. `action` maps to `action_label`.

### `GET /notifications` → `getNotifications()`
```json
[{ "id": "uuid", "title": "3 high-severity risk alerts need review", "level": "danger",
   "read": false, "createdAt": "…" }]
```
**Source:** `notifications WHERE admin_user_id = :me OR admin_user_id IS NULL`. `read` = `read_at IS NOT NULL`.

### `POST /notifications/read-all` → `markAllNotificationsRead()`
Sets `read_at = now()` on the caller's unread notifications. Returns `{ "ok": true }`.

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
