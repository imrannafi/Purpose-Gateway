/**
 * PGApi — the single data-access layer for the UI.
 *
 * Every function returns a Promise. Right now they resolve with mock data
 * (assets/js/mock-data.js). When the backend + database are ready, replace each
 * body with a real request, e.g.:
 *
 *   getApiKeys: () => http("GET", "/v1/dashboard/api-keys"),
 *
 * The suggested REST endpoints and the tables they read are documented next to
 * each function and in database/README.md ("UI → data mapping").
 */
(function () {
  "use strict";

  var USE_MOCK = true;                       // flip to false once the backend exists
  var API_BASE = "/api";                     // e.g. https://api.purposegateway.com
  var M = window.PG_MOCK;

  function delay(value, ms) {
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(JSON.parse(JSON.stringify(value))); }, ms || 220);
    });
  }

  // Real HTTP helper (unused while USE_MOCK = true).
  function http(method, path, body) {
    return fetch(API_BASE + path, {
      method: method,
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (!res.ok) throw new Error(method + " " + path + " → " + res.status);
      return res.status === 204 ? null : res.json();
    });
  }

  window.PGApi = {
    /** GET /me — users, organization_members, organizations */
    getCurrentUser: function () {
      return USE_MOCK ? delay(M.current_user, 120) : http("GET", "/me");
    },

    /** GET /me/preferences — user_preferences */
    getPreferences: function () {
      return USE_MOCK ? delay(M.user_preferences, 80) : http("GET", "/me/preferences");
    },

    /** PATCH /me/preferences — user_preferences */
    updatePreferences: function (patch) {
      if (!USE_MOCK) return http("PATCH", "/me/preferences", patch);
      Object.assign(M.user_preferences, patch);
      return delay(M.user_preferences, 80);
    },

    /** GET /api-keys — api_keys (never returns secret material; only prefix + last_four) */
    getApiKeys: function () {
      return USE_MOCK ? delay(M.api_keys) : http("GET", "/api-keys");
    },

    /** GET /usage/summary?range=30d — view v_api_usage_summary (over api_usage_daily) */
    getUsageSummary: function (range) {
      return USE_MOCK ? delay(M.usage_summary[range]) : http("GET", "/usage/summary?range=" + encodeURIComponent(range));
    },

    /** GET /usage/daily?range=30d — api_usage_daily */
    getUsageDaily: function (range) {
      return USE_MOCK ? delay(M.usage_daily[range]) : http("GET", "/usage/daily?range=" + encodeURIComponent(range));
    },

    /** GET /status — services, service_status_checks, service_uptime_daily */
    getServiceStatus: function () {
      return USE_MOCK
        ? delay({ services: M.services, uptime_30d: M.uptime_30d }, 160)
        : http("GET", "/status");
    },

    /** GET /onboarding — onboarding_steps LEFT JOIN user_onboarding_progress */
    getOnboarding: function () {
      return USE_MOCK ? delay(M.onboarding) : http("GET", "/onboarding");
    },

    /** POST /onboarding/{step_key}/complete — user_onboarding_progress */
    completeOnboardingStep: function (stepKey) {
      if (!USE_MOCK) return http("POST", "/onboarding/" + encodeURIComponent(stepKey) + "/complete");
      M.onboarding.forEach(function (s) { if (s.step_key === stepKey) s.completed = true; });
      return delay(M.onboarding, 60);
    },

    /** GET /notifications — notifications */
    getNotifications: function () {
      return USE_MOCK ? delay(M.notifications) : http("GET", "/notifications");
    },

    /** POST /notifications/read-all — notifications.read_at */
    markAllNotificationsRead: function () {
      if (!USE_MOCK) return http("POST", "/notifications/read-all");
      M.notifications.forEach(function (n) { n.is_read = true; });
      return delay(M.notifications, 60);
    },

    /** GET /search?q= — doc_articles + api_endpoints (full-text search) */
    search: function (q) {
      if (!USE_MOCK) return http("GET", "/search?q=" + encodeURIComponent(q));
      var needle = q.trim().toLowerCase();
      var out = !needle ? [] : M.search_index.filter(function (r) {
        return (r.title + " " + r.path + " " + (r.method || "")).toLowerCase().indexOf(needle) !== -1;
      });
      return delay(out.slice(0, 8), 40);
    },

    /** GET /code-samples?endpoint=payments.create — code_samples */
    getCodeSamples: function () {
      return USE_MOCK ? delay(M.code_samples, 60) : http("GET", "/code-samples?endpoint=payments.create");
    },

    /** POST /sandbox/requests — runs the sample against the sandbox; logged in api_request_logs */
    runSandboxRequest: function (payload) {
      if (!USE_MOCK) return http("POST", "/sandbox/requests", payload);
      return delay({
        status: 200,
        latency_ms: 184,
        body: { id: "pay_test_" + Math.random().toString(36).slice(2, 12), status: "pending", amount: 1000, currency: "BDT", method: "bkash" }
      }, 900);
    }
  };
})();
