/**
 * Mock data — shaped exactly like the rows/views defined in database/schema.sql.
 * Field names are snake_case to match the database columns, so when the real
 * backend is connected the API can return the same shapes and the UI keeps working.
 *
 * DELETE THIS FILE once api.js is switched to real HTTP calls.
 */
(function () {
  "use strict";

  // Deterministic pseudo-random generator so charts look the same on every load.
  function seeded(seed) {
    return function () {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  // 30-day curve, hand-tuned to mirror the design (values = requests, millions).
  var base30 = [4.6, 3.6, 4.9, 6.3, 5.6, 4.4, 3.9, 3.3, 3.6, 4.6, 5.3, 5.9, 5.4, 4.9, 6.4, 7.9, 9.3, 9.6, 8.6, 8.4, 9.4, 10.6, 12.5, 11.6, 10.8, 10.4, 11.4, 12.4, 12.1, 11.3];

  function dayRows(values, endIso) {
    var end = new Date(endIso + "T00:00:00Z");
    return values.map(function (v, i) {
      var d = new Date(end);
      d.setUTCDate(end.getUTCDate() - (values.length - 1 - i));
      return { usage_date: d.toISOString().slice(0, 10), total_requests: Math.round(v * 1e6) };
    });
  }

  var rnd = seeded(42);
  var base90 = [];
  for (var i = 0; i < 60; i++) {
    base90.push(+(3 + i * 0.03 + Math.sin(i / 4) * 1.4 + rnd() * 0.8).toFixed(2));
  }
  base90 = base90.concat(base30);

  window.PG_MOCK = {
    current_user: {
      id: "6f1c2a10-0b4e-4a8f-9a51-1c2d3e4f5a01",
      full_name: "Imran Un Nafi",
      email: "imran@example.com",
      role: "developer",
      role_label: "Developer",
      avatar_url: null,
      organization: { id: "a9d6b3c2-1111-4c4c-8e8e-000000000001", name: "Purpose Demo Store" }
    },

    user_preferences: { sandbox_mode: true, default_code_language: "curl" },

    api_keys: [
      {
        id: "k_live_01", name: "Live API Key", environment: "live", key_type: "publishable",
        status: "active", key_prefix: "pk_live_", last_four: "9f3a",
        // Full token is ONLY returned once at creation time in production; mock only.
        mock_token: "pk_live_51PgWq8LxD2nR7tYz4KcV9f3a",
        last_used_at: "2026-11-17T08:12:00Z", created_at: "2026-03-02T10:00:00Z"
      },
      {
        id: "k_test_01", name: "Test API Key", environment: "test", key_type: "publishable",
        status: "active", key_prefix: "pk_test_", last_four: "2b7e",
        mock_token: "pk_test_51PgWq8LxD2nR7tYz4KcV2b7e",
        last_used_at: "2026-11-17T09:40:00Z", created_at: "2026-03-02T10:00:00Z"
      }
    ],

    // view: v_api_usage_summary
    usage_summary: {
      "7d":  { total_requests: 2980000,  success_rate: 99.92, avg_response_ms: 1100, error_rate: 0.08 },
      "30d": { total_requests: 12500000, success_rate: 99.9,  avg_response_ms: 1200, error_rate: 0.1 },
      "90d": { total_requests: 33800000, success_rate: 99.86, avg_response_ms: 1250, error_rate: 0.14 }
    },

    // table: api_usage_daily (aggregated)
    usage_daily: {
      "7d": dayRows(base30.slice(-7), "2026-11-30"),
      "30d": dayRows(base30, "2026-11-30"),
      "90d": dayRows(base90, "2026-11-30")
    },

    // tables: services + latest service_status_checks
    services: [
      { id: 1, name: "Payment Processing", slug: "payment-processing", current_status: "operational" },
      { id: 2, name: "API Services", slug: "api", current_status: "operational" },
      { id: 3, name: "Webhooks", slug: "webhooks", current_status: "operational" },
      { id: 4, name: "Dashboard", slug: "dashboard", current_status: "operational" }
    ],
    uptime_30d: 99.99,

    // tables: onboarding_steps + user_onboarding_progress
    onboarding: [
      { step_key: "read_docs", position: 1, title: "Read the Documentation", description: "Explore our comprehensive API docs.", completed: true },
      { step_key: "get_keys", position: 2, title: "Get Your API Keys", description: "Generate keys from your dashboard.", completed: true },
      { step_key: "first_request", position: 3, title: "Make Your First Request", description: "Try our APIs and see the magic.", completed: false }
    ],

    // table: notifications
    notifications: [
      { id: "n1", type: "warning", title: "Webhook delivery failing", body: "https://shop.example.com/hooks returned 500 — retrying (3/8).", is_read: false, created_at: "2026-11-17T09:02:00Z" },
      { id: "n2", type: "info", title: "Node.js SDK v2.4.0 released", body: "Adds idempotency helpers and Nagad tokenization.", is_read: false, created_at: "2026-11-16T15:30:00Z" },
      { id: "n3", type: "success", title: "First sandbox payment", body: "Your test key processed its first bKash payment.", is_read: false, created_at: "2026-11-15T11:10:00Z" }
    ],

    // tables: doc_articles + api_endpoints (search index)
    search_index: [
      { kind: "endpoint", method: "POST", title: "Create a payment", path: "/pay", href: "#docs/payments-create" },
      { kind: "endpoint", method: "GET", title: "Retrieve a payment", path: "/payments/{id}", href: "#docs/payments-get" },
      { kind: "endpoint", method: "GET", title: "List payments", path: "/payments", href: "#docs/payments-list" },
      { kind: "endpoint", method: "POST", title: "Create a refund", path: "/refunds", href: "#docs/refunds-create" },
      { kind: "endpoint", method: "POST", title: "Register webhook endpoint", path: "/webhook_endpoints", href: "#docs/webhooks-create" },
      { kind: "guide", title: "Authentication", path: "Bearer tokens & key types", href: "#docs/auth" },
      { kind: "guide", title: "bKash integration", path: "Mobile financial services", href: "#docs/bkash" },
      { kind: "guide", title: "Nagad integration", path: "Mobile financial services", href: "#docs/nagad" },
      { kind: "guide", title: "Rocket integration", path: "Mobile financial services", href: "#docs/rocket" },
      { kind: "guide", title: "Card payments (Visa / Mastercard)", path: "3-D Secure & tokenization", href: "#docs/cards" },
      { kind: "guide", title: "Webhook signatures", path: "Verify event authenticity", href: "#docs/webhook-signatures" },
      { kind: "guide", title: "Error codes", path: "HTTP status & error objects", href: "#docs/errors" },
      { kind: "guide", title: "Rate limits", path: "Quotas and retry strategy", href: "#docs/rate-limits" },
      { kind: "guide", title: "Idempotent requests", path: "Safely retry POST requests", href: "#docs/idempotency" }
    ],

    // table: code_samples — {{KEY}} is replaced at render time.
    code_samples: {
      curl: [
        'curl -X POST https://api.purposegateway.com/pay \\',
        '  -H "Authorization: Bearer {{KEY}}" \\',
        '  -H "Content-Type: application/json" \\',
        "  -d '{",
        '    "amount": 1000,',
        '    "currency": "BDT",',
        '    "method": "bKash"',
        "  }'"
      ].join("\n"),
      node: [
        'import PurposeGateway from "@purposegateway/node";',
        "",
        'const pg = new PurposeGateway("{{KEY}}");',
        "",
        "const payment = await pg.payments.create({",
        "  amount: 1000,",
        '  currency: "BDT",',
        '  method: "bKash",',
        "});",
        "",
        "console.log(payment.id);"
      ].join("\n"),
      python: [
        "import purposegateway",
        "",
        'client = purposegateway.Client("{{KEY}}")',
        "",
        "payment = client.payments.create(",
        "    amount=1000,",
        '    currency="BDT",',
        '    method="bKash",',
        ")",
        "",
        "print(payment.id)"
      ].join("\n"),
      php: [
        "<?php",
        '$client = new \\PurposeGateway\\Client("{{KEY}}");',
        "",
        "$payment = $client->payments->create([",
        '    "amount"   => 1000,',
        '    "currency" => "BDT",',
        '    "method"   => "bKash",',
        "]);",
        "",
        "echo $payment->id;"
      ].join("\n")
    }
  };
})();
