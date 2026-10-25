/**
 * SmartTutors — Supabase Integration & Quota Lifecycle Test Suite (Phase 2.2)
 * Verifies:
 * - SEC-01: Frontend runtime staging configuration & unconfigured error handling
 * - SEC-02: Fail-closed server quota enforcement (Gemini never called when unconfigured/failing)
 * - SEC-03: HMAC guest cookie signing, constant-time verification & forged cookie rejection
 * - SEC-04: Session refresh mutex, token rotation, and invalid session clearing
 * - Two-phase reservation/finalization lifecycle & security boundaries
 */
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const {
  parseCookies,
  signGuestIdentifier,
  verifyGuestIdentifier,
  getOrCreateGuestIdentifier,
  createGuestCookieHeader,
  hashGuestIdentifier,
  verifySupabaseToken,
  callSupabaseRpc,
  reserveQuestionQuota,
  finalizeQuotaReservation
} = require('../api/_lib/supabase-quota');

const chatHandler = require('../api/chat');

let testsPassed = 0;
let testsFailed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`✔ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`✖ [FAIL] ${name}:`, err.message);
    testsFailed++;
  }
}

function mockResponse({ ok = true, status = 200, json = null, text = null }) {
  const bodyText = text !== null ? text : (json !== null ? JSON.stringify(json) : '');
  let bodyJson = json;
  if (bodyJson === null) {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch (_e) {
      bodyJson = {};
    }
  }
  return {
    ok,
    status,
    headers: {
      get: (h) => (h.toLowerCase() === 'content-type' ? 'application/json' : null)
    },
    json: async () => bodyJson,
    text: async () => bodyText
  };
}

function createMockAuthEnvironment(config = {}) {
  const localStorageStore = {};
  const mockLocalStorage = {
    getItem: (key) => (key in localStorageStore ? localStorageStore[key] : null),
    setItem: (key, val) => { localStorageStore[key] = String(val); },
    removeItem: (key) => { delete localStorageStore[key]; }
  };

  const mockWindow = {
    SMARTTUTORS_SUPABASE_URL: config.supabaseUrl || '',
    SMARTTUTORS_SUPABASE_ANON_KEY: config.supabaseAnonKey || '',
    localStorage: mockLocalStorage,
    fetch: config.fetch || global.fetch
  };

  const mockDocument = {
    readyState: 'complete',
    addEventListener: () => {}
  };

  const authCode = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');
  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    fetch: (...args) => mockWindow.fetch(...args),
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Error: Error,
    Object: Object,
    Array: Array,
    String: String,
    Boolean: Boolean,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  });

  vm.runInContext(authCode, context);
  return {
    auth: context.window.SmartTutorsAuth,
    storage: localStorageStore,
    window: context.window
  };
}

async function main() {
  console.log('=== Running SmartTutors Phase 2.2 Security & Integration Test Suite ===\n');

  /* ── 1. Cookie & Guest Identity Pipeline (SEC-03) ── */
  console.log('--- 1. Testing Cookie & Guest Identity Pipeline (SEC-03 HMAC Integrity) ---');

  await runTest('parseCookies correctly extracts single and multiple cookies', () => {
    const empty = parseCookies('');
    assert.deepStrictEqual(empty, {});

    const single = parseCookies('st_guest_id=abcdef123456');
    assert.strictEqual(single.st_guest_id, 'abcdef123456');

    const multiple = parseCookies('st-theme=dark; st_guest_id=token987; other=hello%20world');
    assert.strictEqual(multiple['st-theme'], 'dark');
    assert.strictEqual(multiple['st_guest_id'], 'token987');
    assert.strictEqual(multiple['other'], 'hello world');
  });

  await runTest('signGuestIdentifier and verifyGuestIdentifier validate genuine HMAC cookies', () => {
    const secret = 'test-server-secret-key-12345';
    const rawId = crypto.randomBytes(32).toString('hex');
    const signedCookie = signGuestIdentifier(rawId, secret);

    assert.ok(signedCookie.includes('.'), 'Signed cookie must contain dot separator');
    const parts = signedCookie.split('.');
    assert.strictEqual(parts.length, 2);
    assert.strictEqual(parts[0], rawId);

    const verified = verifyGuestIdentifier(signedCookie, secret);
    assert.strictEqual(verified, rawId);
  });

  await runTest('verifyGuestIdentifier rejects forged or tampered cookies', () => {
    const secret = 'test-server-secret-key-12345';
    const rawId = crypto.randomBytes(32).toString('hex');
    const forgedSig = crypto.randomBytes(32).toString('hex');
    const forgedCookie = `${rawId}.${forgedSig}`;

    const verified = verifyGuestIdentifier(forgedCookie, secret);
    assert.strictEqual(verified, null, 'Forged cookie must be rejected');

    const tamperedCookie = signGuestIdentifier(rawId, secret).slice(0, -4) + '0000';
    assert.strictEqual(verifyGuestIdentifier(tamperedCookie, secret), null, 'Tampered cookie must be rejected');
  });

  await runTest('verifyGuestIdentifier rejects malformed values', () => {
    const secret = 'test-server-secret-key-12345';
    assert.strictEqual(verifyGuestIdentifier('', secret), null);
    assert.strictEqual(verifyGuestIdentifier('invalid-cookie-no-dot', secret), null);
    assert.strictEqual(verifyGuestIdentifier('too.many.dots.here', secret), null);
    assert.strictEqual(verifyGuestIdentifier('short.sig', secret), null);
  });

  await runTest('getOrCreateGuestIdentifier generates 64-character raw ID and signs cookie with secret', () => {
    const secret = 'my-secret-key';
    const req = { headers: {} };
    const res = getOrCreateGuestIdentifier(req, secret);
    assert.strictEqual(res.isNew, true);
    assert.strictEqual(typeof res.guestId, 'string');
    assert.strictEqual(res.guestId.length, 64);
    assert.match(res.guestId, /^[0-9a-f]{64}$/);
    assert.ok(res.cookieValue.startsWith(res.guestId + '.'));
  });

  await runTest('getOrCreateGuestIdentifier reuses valid signed existing cookie and rejects forged cookie', () => {
    const secret = 'my-secret-key';
    const rawId = crypto.randomBytes(32).toString('hex');
    const validCookie = signGuestIdentifier(rawId, secret);

    const validReq = { headers: { cookie: `st_guest_id=${validCookie}` } };
    const validRes = getOrCreateGuestIdentifier(validReq, secret);
    assert.strictEqual(validRes.isNew, false);
    assert.strictEqual(validRes.guestId, rawId);

    // Forged cookie test
    const forgedCookie = `${rawId}.${'0'.repeat(64)}`;
    const forgedReq = { headers: { cookie: `st_guest_id=${forgedCookie}` } };
    const forgedRes = getOrCreateGuestIdentifier(forgedReq, secret);
    assert.strictEqual(forgedRes.isNew, true, 'Forged cookie must trigger issuance of new guest ID');
    assert.notStrictEqual(forgedRes.guestId, rawId);
  });

  await runTest('createGuestCookieHeader enforces HttpOnly, SameSite=Lax and Secure on HTTPS', () => {
    const cookieHttp = createGuestCookieHeader('mytoken123', false);
    assert.ok(cookieHttp.includes('st_guest_id=mytoken123'));
    assert.ok(cookieHttp.includes('HttpOnly'));
    assert.ok(cookieHttp.includes('SameSite=Lax'));
    assert.ok(!cookieHttp.includes('Secure'));

    const cookieHttps = createGuestCookieHeader('mytoken123', true);
    assert.ok(cookieHttps.includes('Secure'));
  });

  await runTest('hashGuestIdentifier produces exact 64-hex SHA-256 hash matching PostgreSQL migration contract', () => {
    const guestId = 'a'.repeat(64);
    const hash = hashGuestIdentifier(guestId);
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);

    const expected = crypto.createHash('sha256').update(guestId).digest('hex');
    assert.strictEqual(hash, expected);
  });

  /* ── 2. Token & Student Identity Verification ── */
  console.log('\n--- 2. Testing Token Verification & Identity Binding ---');

  await runTest('verifySupabaseToken rejects null or empty tokens immediately', async () => {
    const nullRes = await verifySupabaseToken(null, 'https://mock.supabase.co', 'mock-key');
    assert.strictEqual(nullRes.valid, false);

    const emptyRes = await verifySupabaseToken('', 'https://mock.supabase.co', 'mock-key');
    assert.strictEqual(emptyRes.valid, false);
  });

  await runTest('verifySupabaseToken validates confirmed user token against Supabase Auth', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      assert.ok(url.includes('/auth/v1/user'));
      assert.strictEqual(opts.headers.Authorization, 'Bearer valid-jwt-token');
      assert.strictEqual(opts.headers.apikey, 'mock-key');
      return mockResponse({
        ok: true,
        json: {
          id: 'student-valid-uuid',
          email: 'student@example.com',
          email_confirmed_at: '2026-10-18T10:00:00Z'
        }
      });
    };

    try {
      const res = await verifySupabaseToken('valid-jwt-token', 'https://mock.supabase.co', 'mock-key');
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.user.id, 'student-valid-uuid');
      assert.strictEqual(res.user.email, 'student@example.com');
    } finally {
      global.fetch = originalFetch;
    }
  });

  /* ── 3. Quota Reservation & Two-Phase Finalization Lifecycle ── */
  console.log('\n--- 3. Testing Two-Phase Reservation & Finalization Lifecycle ---');

  await runTest('reserveQuestionQuota rejects unconfirmed email student with status 403', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/auth/v1/user')) {
        return mockResponse({
          ok: true,
          json: {
            id: 'student-unconfirmed-uuid',
            email: 'unconfirmed@example.com',
            email_confirmed_at: null
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    try {
      const req = { headers: { authorization: 'Bearer mock-unconfirmed-token' } };
      const res = await reserveQuestionQuota({
        req,
        subject: 'physics',
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key',
        isHttps: true
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.code, 'email_not_confirmed');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest('reserveQuestionQuota enforces daily limit rejection (429) for student without calling Gemini', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/auth/v1/user')) {
        return mockResponse({
          ok: true,
          json: {
            id: 'student-limit-uuid',
            email: 'student@example.com',
            email_confirmed_at: new Date().toISOString()
          }
        });
      }
      if (url.includes('/rest/v1/rpc/reserve_student_ai_question')) {
        return mockResponse({
          ok: true,
          json: {
            allowed: false,
            reason: 'daily_limit_reached',
            limit: 5,
            used: 5,
            pending: 0,
            questions_remaining: 0
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    try {
      const req = { headers: { authorization: 'Bearer mock-confirmed-token' } };
      const res = await reserveQuestionQuota({
        req,
        subject: 'physics',
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key',
        isHttps: true
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.code, 'daily_limit_reached');
      assert.strictEqual(res.remaining, 0);
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest('reserveQuestionQuota enforces guest limit rejection (429) on repeat question', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/rest/v1/rpc/reserve_guest_ai_question')) {
        return mockResponse({
          ok: true,
          json: {
            allowed: false,
            reason: 'guest_limit_reached',
            limit: 1,
            questions_remaining: 0
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    try {
      const req = { headers: { cookie: 'st_guest_id=' + 'b'.repeat(64) } };
      const res = await reserveQuestionQuota({
        req,
        subject: 'chemistry',
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key',
        isHttps: true
      });

      assert.strictEqual(res.allowed, false);
      assert.strictEqual(res.status, 429);
      assert.strictEqual(res.code, 'guest_limit_reached');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest('reserveQuestionQuota allows guest when quota permits and returns reservationId + signed cookie', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/rest/v1/rpc/reserve_guest_ai_question')) {
        return mockResponse({
          ok: true,
          json: {
            allowed: true,
            reservation_id: 'guest-res-uuid-1234',
            questions_remaining: 0
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    try {
      const req = { headers: {} };
      const res = await reserveQuestionQuota({
        req,
        subject: 'physics',
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key-secret',
        isHttps: true
      });

      assert.strictEqual(res.allowed, true);
      assert.strictEqual(res.reservationId, 'guest-res-uuid-1234');
      assert.strictEqual(res.tier, 'guest');
      assert.strictEqual(res.remaining, 0);
      assert.ok(res.setCookie, 'Expected guest cookie header for new guest');
      assert.ok(res.setCookie.includes('Secure'), 'Expected Secure flag on HTTPS');
    } finally {
      global.fetch = originalFetch;
    }
  });

  await runTest('finalizeQuotaReservation passes p_success=true on success and p_success=false on failure', async () => {
    const calls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, opts) => {
      if (url.includes('/rest/v1/rpc/finalize_ai_question_reservation')) {
        const payload = JSON.parse(opts.body);
        calls.push(payload);
        return mockResponse({
          ok: true,
          json: { finalized: true, status: payload.p_success ? 'committed' : 'released' }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    try {
      await finalizeQuotaReservation({
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key',
        reservationId: 'res-uuid-1',
        success: true
      });

      await finalizeQuotaReservation({
        supabaseUrl: 'https://mock.supabase.co',
        serviceRoleKey: 'mock-key',
        reservationId: 'res-uuid-2',
        success: false
      });

      assert.strictEqual(calls.length, 2);
      assert.strictEqual(calls[0].p_reservation_id, 'res-uuid-1');
      assert.strictEqual(calls[0].p_success, true);
      assert.strictEqual(calls[1].p_reservation_id, 'res-uuid-2');
      assert.strictEqual(calls[1].p_success, false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  /* ── 4. Server Fail-Closed Quota Enforcement (SEC-02) ── */
  console.log('\n--- 4. Testing Fail-Closed Server Quota Enforcement (SEC-02) ---');

  await runTest('api/chat returns HTTP 503 and DOES NOT call Gemini when Supabase config is missing', async () => {
    const oldUrl = process.env.SUPABASE_URL;
    const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const oldFallback = process.env.ENABLE_LOCAL_DEV_FALLBACK;
    const oldVercelEnv = process.env.VERCEL_ENV;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.ENABLE_LOCAL_DEV_FALLBACK;
    process.env.VERCEL_ENV = 'production';

    let geminiCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiCalls++;
        return mockResponse({ ok: true, json: { candidates: [] } });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    let statusCode = 0;
    let responseData = null;
    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseData = data; }
        };
      }
    };

    const mockReq = {
      method: 'POST',
      headers: { host: 'localhost:3000' },
      body: { subject: 'physics', message: 'Explain Newton third law.' }
    };

    try {
      await chatHandler(mockReq, mockRes);
      assert.strictEqual(statusCode, 503, 'Must return HTTP 503 when quota config is missing');
      assert.strictEqual(responseData.code, 'quota_service_unconfigured');
      assert.strictEqual(geminiCalls, 0, 'Gemini must NEVER be called when quota service is unconfigured');
    } finally {
      global.fetch = originalFetch;
      if (oldUrl) process.env.SUPABASE_URL = oldUrl;
      if (oldKey) process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
      if (oldFallback) process.env.ENABLE_LOCAL_DEV_FALLBACK = oldFallback;
      if (oldVercelEnv) process.env.VERCEL_ENV = oldVercelEnv; else delete process.env.VERCEL_ENV;
    }
  });

  await runTest('api/chat returns HTTP 502 and DOES NOT call Gemini when Supabase quota reservation fails', async () => {
    process.env.SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';

    let geminiCalls = 0;
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('/rest/v1/rpc/reserve_guest_ai_question')) {
        return mockResponse({ ok: false, status: 500, text: 'Internal Server Error' });
      }
      if (url.includes('generativelanguage.googleapis.com')) {
        geminiCalls++;
        return mockResponse({ ok: true, json: {} });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    let statusCode = 0;
    let responseData = null;
    const mockRes = {
      setHeader: () => {},
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => { responseData = data; }
        };
      }
    };

    const mockReq = {
      method: 'POST',
      headers: { host: 'localhost:3000' },
      body: { subject: 'physics', message: 'What is momentum?' }
    };

    try {
      await chatHandler(mockReq, mockRes);
      assert.strictEqual(statusCode, 502, 'Must fail closed with HTTP 502 on Supabase RPC outage');
      assert.strictEqual(responseData.code, 'rpc_error');
      assert.strictEqual(geminiCalls, 0, 'Gemini must NEVER be called during Supabase outage');
    } finally {
      global.fetch = originalFetch;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  /* ── 5. Client Auth Lifecycle & Session Refresh (SEC-01 & SEC-04) ── */
  console.log('\n--- 5. Testing Client Auth Lifecycle & Session Refresh (SEC-01 & SEC-04) ---');

  await runTest('SmartTutorsAuth.isConfigured returns false when URL/AnonKey is unconfigured', () => {
    const env = createMockAuthEnvironment({ supabaseUrl: '', supabaseAnonKey: '' });
    assert.strictEqual(env.auth.isConfigured(), false);
  });

  await runTest('SmartTutorsAuth.isConfigured returns true when staging URL and AnonKey are provided', () => {
    const env = createMockAuthEnvironment({
      supabaseUrl: 'https://staging-proj.supabase.co',
      supabaseAnonKey: 'staging-anon-key'
    });
    assert.strictEqual(env.auth.isConfigured(), true);
  });

  await runTest('SmartTutorsAuth.signUp throws clear error when Supabase client is unconfigured', async () => {
    const env = createMockAuthEnvironment({ supabaseUrl: '', supabaseAnonKey: '' });
    await assert.rejects(
      async () => {
        await env.auth.signUp({
          email: 'test@example.com',
          password: 'password123',
          termsAccepted: true
        });
      },
      /Supabase client is not configured on this site/
    );
  });

  await runTest('SmartTutorsAuth.refreshSession successfully exchanges refresh_token for new access_token', async () => {
    let refreshCalls = 0;
    const mockFetch = async (url, opts) => {
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        refreshCalls++;
        const body = JSON.parse(opts.body);
        assert.strictEqual(body.refresh_token, 'initial-refresh-token');
        return mockResponse({
          ok: true,
          json: {
            access_token: 'new-rotated-access-token',
            refresh_token: 'new-rotated-refresh-token',
            expires_in: 3600,
            user: { id: 'student-id-123', email: 'student@example.com' }
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: 'https://staging.supabase.co',
      supabaseAnonKey: 'staging-anon-key',
      fetch: mockFetch
    });

    // Seed expired session with valid refresh_token
    const expiredSession = {
      access_token: 'old-expired-access-token',
      refresh_token: 'initial-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 100, // Expired!
      user: { id: 'student-id-123', email: 'student@example.com' }
    };
    env.storage['st_auth_session'] = JSON.stringify(expiredSession);

    // Call getValidAccessToken()
    const validToken = await env.auth.getValidAccessToken();
    assert.strictEqual(validToken, 'new-rotated-access-token');
    assert.strictEqual(refreshCalls, 1);

    // Verify updated storage
    const updated = JSON.parse(env.storage['st_auth_session']);
    assert.strictEqual(updated.access_token, 'new-rotated-access-token');
    assert.strictEqual(updated.refresh_token, 'new-rotated-refresh-token');
  });

  await runTest('SmartTutorsAuth.refreshSession coalesces concurrent refresh requests using in-flight mutex', async () => {
    let networkCalls = 0;
    const mockFetch = async (url) => {
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        networkCalls++;
        // Simulate network latency
        await new Promise((r) => setTimeout(r, 20));
        return mockResponse({
          ok: true,
          json: {
            access_token: 'coalesced-access-token',
            refresh_token: 'coalesced-refresh-token',
            expires_in: 3600,
            user: { id: 'student-id-123', email: 'student@example.com' }
          }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: 'https://staging.supabase.co',
      supabaseAnonKey: 'staging-anon-key',
      fetch: mockFetch
    });

    env.storage['st_auth_session'] = JSON.stringify({
      access_token: 'expiring-token',
      refresh_token: 'coalesce-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 10,
      user: { id: 'student-id-123' }
    });

    // Fire 5 concurrent token requests simultaneously
    const results = await Promise.all([
      env.auth.getValidAccessToken(),
      env.auth.getValidAccessToken(),
      env.auth.getValidAccessToken(),
      env.auth.getValidAccessToken(),
      env.auth.getValidAccessToken()
    ]);

    assert.strictEqual(networkCalls, 1, 'In-flight mutex must coalesce 5 concurrent calls into exactly 1 network call');
    results.forEach((token) => assert.strictEqual(token, 'coalesced-access-token'));
  });

  await runTest('SmartTutorsAuth.refreshSession clears session state on invalid or revoked refresh token', async () => {
    const mockFetch = async (url) => {
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return mockResponse({
          ok: false,
          status: 400,
          json: { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }
        });
      }
      return mockResponse({ ok: false, status: 404 });
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: 'https://staging.supabase.co',
      supabaseAnonKey: 'staging-anon-key',
      fetch: mockFetch
    });

    env.storage['st_auth_session'] = JSON.stringify({
      access_token: 'old-token',
      refresh_token: 'revoked-refresh-token',
      expires_at: Math.floor(Date.now() / 1000) - 50,
      user: { id: 'student-id-123' }
    });

    const token = await env.auth.getValidAccessToken();
    assert.strictEqual(token, null, 'Must return null when refresh fails');
    assert.strictEqual(env.auth.isAuthenticated(), false);
    assert.strictEqual(env.storage['st_auth_session'], undefined, 'Must wipe revoked session from storage');
  });

  /* ── 6. Security Boundary & Secret Exposure Audit ── */
  console.log('\n--- 6. Testing Security Boundaries & Zero Secret Leakage ---');

  await runTest('Client frontend JS files contain ZERO references to service_role or SUPABASE_SERVICE_ROLE_KEY', () => {
    const clientFiles = ['js/auth.js', 'js/auth-ui.js', 'js/ai-widget.js', 'js/main.js', 'index.html'];
    for (const file of clientFiles) {
      const fullPath = path.join(__dirname, '..', file);
      if (!fs.existsSync(fullPath)) continue;
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(!content.includes('SUPABASE_SERVICE_ROLE_KEY'), `Found SUPABASE_SERVICE_ROLE_KEY in client file ${file}`);
      assert.ok(!content.includes('service_role'), `Found service_role reference in client file ${file}`);
    }
  });

  await runTest('Content Security Policy in vercel.json permits Supabase project domains without dangerous wildcards', () => {
    const vercelJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
    const cspHeader = vercelJson.headers[0].headers.find((h) => h.key.includes('Content-Security-Policy'));
    assert.ok(cspHeader, 'CSP header missing in vercel.json');
    const val = cspHeader.value;

    assert.ok(val.includes('https://*.supabase.co'), 'connect-src must allow https://*.supabase.co');
    assert.ok(val.includes('wss://*.supabase.co'), 'connect-src must allow wss://*.supabase.co for realtime/auth');
    assert.ok(val.includes('https://cdn.jsdelivr.net'), 'script-src must allow https://cdn.jsdelivr.net');
    assert.ok(!val.includes('default-src *'), 'CSP must not contain wildcard default-src *');
  });

  console.log('\n================================================================');
  console.log(`SmartTutors Phase 2.2 Integration Tests: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('================================================================');

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled failure in test suite:', err);
  process.exit(1);
});
