/**
 * SmartTutors — Automated Verification Suite for Public Configuration Endpoint (Phase 1)
 *
 * Verifies:
 * - api/config.js endpoint contract (valid config, missing config, invalid URL/key)
 * - Method restriction (405 on non-GET)
 * - Zero secret leakage (service_role, gemini key, cookie secret never returned)
 * - Cache-Control & Content-Type header enforcement
 * - In-memory client bootstrap in js/auth.js (mutex, error resilience, zero storage leaks)
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const configHandler = require('../api/config');

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

function createMockReqRes({ method = 'GET', headers = {} } = {}) {
  const req = {
    method,
    headers: Object.assign({}, headers)
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, val) {
      this.headers[name.toLowerCase()] = val;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end(str) {
      if (str && !this.body) {
        try {
          this.body = JSON.parse(str);
        } catch (_e) {
          this.body = str;
        }
      }
      return this;
    }
  };

  return { req, res };
}

function createMockAuthEnvironment(config = {}) {
  const localStorageStore = {};
  const sessionStorageStore = {};

  const mockLocalStorage = {
    getItem: (key) => (key in localStorageStore ? localStorageStore[key] : null),
    setItem: (key, val) => { localStorageStore[key] = String(val); },
    removeItem: (key) => { delete localStorageStore[key]; }
  };

  const mockSessionStorage = {
    getItem: (key) => (key in sessionStorageStore ? sessionStorageStore[key] : null),
    setItem: (key, val) => { sessionStorageStore[key] = String(val); },
    removeItem: (key) => { delete sessionStorageStore[key]; }
  };

  const mockWindow = {
    SMARTTUTORS_SUPABASE_URL: config.supabaseUrl !== undefined ? config.supabaseUrl : '',
    SMARTTUTORS_SUPABASE_ANON_KEY: config.supabaseAnonKey !== undefined ? config.supabaseAnonKey : '',
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
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
    sessionStorage: mockSessionStorage,
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
    Promise: Promise,
    encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout
  });

  vm.runInContext(authCode, context);
  return {
    auth: context.window.SmartTutorsAuth,
    storage: localStorageStore,
    sessionStorage: sessionStorageStore,
    window: context.window
  };
}

async function main() {
  console.log('=== Running SmartTutors Phase 1 Configuration Endpoint Test Suite ===\n');

  // Save pristine process.env state
  const originalEnv = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GUEST_COOKIE_SECRET: process.env.GUEST_COOKIE_SECRET
  };

  function restoreEnv() {
    for (const key of Object.keys(originalEnv)) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }

  /* ── 1. Endpoint Contract & Validation Tests ── */
  await runTest('api/config returns 200 with configured=true when valid URL and anon key are present', async () => {
    try {
      process.env.SUPABASE_URL = 'https://gfzffxvpmotjuydcvfav.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.headers['content-type'], 'application/json; charset=utf-8');
      assert.ok(res.headers['cache-control'].includes('public'));
      assert.ok(res.headers['cache-control'].includes('max-age=60'));

      assert.strictEqual(res.body.configured, true);
      assert.strictEqual(res.body.supabaseUrl, 'https://gfzffxvpmotjuydcvfav.supabase.co');
      assert.strictEqual(res.body.supabaseAnonKey, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature');
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config strips trailing slashes from Supabase project URL', async () => {
    try {
      process.env.SUPABASE_URL = 'https://gfzffxvpmotjuydcvfav.supabase.co///';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, true);
      assert.strictEqual(res.body.supabaseUrl, 'https://gfzffxvpmotjuydcvfav.supabase.co');
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config returns configured=false when SUPABASE_URL is missing', async () => {
    try {
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, false);
      assert.strictEqual(res.body.supabaseUrl, '');
      assert.strictEqual(res.body.supabaseAnonKey, '');
      assert.ok(res.headers['cache-control'].includes('no-cache'));
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config returns configured=false when SUPABASE_ANON_KEY is missing', async () => {
    try {
      process.env.SUPABASE_URL = 'https://gfzffxvpmotjuydcvfav.supabase.co';
      delete process.env.SUPABASE_ANON_KEY;

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, false);
      assert.strictEqual(res.body.supabaseUrl, '');
      assert.strictEqual(res.body.supabaseAnonKey, '');
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config rejects non-HTTPS URL (e.g. plain http://)', async () => {
    try {
      process.env.SUPABASE_URL = 'http://gfzffxvpmotjuydcvfav.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, false);
      assert.strictEqual(res.body.supabaseUrl, '');
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config rejects malformed or unparseable URL string', async () => {
    try {
      process.env.SUPABASE_URL = 'not-a-valid-url';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, false);
    } finally {
      restoreEnv();
    }
  });

  await runTest('api/config rejects anon key with insufficient length or whitespace', async () => {
    try {
      process.env.SUPABASE_URL = 'https://gfzffxvpmotjuydcvfav.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'too-short';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.configured, false);
    } finally {
      restoreEnv();
    }
  });

  /* ── 2. HTTP Method Security ── */
  await runTest('api/config rejects POST with 405 Method Not Allowed and sets Allow: GET', async () => {
    const { req, res } = createMockReqRes({ method: 'POST' });
    await configHandler(req, res);

    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.headers['allow'], 'GET');
    assert.strictEqual(res.headers['cache-control'], 'no-store');
    assert.strictEqual(res.body.configured, false);
  });

  await runTest('api/config rejects DELETE with 405 Method Not Allowed', async () => {
    const { req, res } = createMockReqRes({ method: 'DELETE' });
    await configHandler(req, res);

    assert.strictEqual(res.statusCode, 405);
    assert.strictEqual(res.headers['allow'], 'GET');
  });

  /* ── 3. Zero Secret Leakage ── */
  await runTest('api/config NEVER leaks service_role key, Gemini key, or guest secret in response payload', async () => {
    try {
      process.env.SUPABASE_URL = 'https://gfzffxvpmotjuydcvfav.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_anon_payload.dummy_signature';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'CRITICAL_SECRET_SERVICE_ROLE_KEY_12345';
      process.env.GEMINI_API_KEY = 'CRITICAL_SECRET_GEMINI_KEY_67890';
      process.env.GUEST_COOKIE_SECRET = 'CRITICAL_SECRET_GUEST_HMAC_99999';

      const { req, res } = createMockReqRes({ method: 'GET' });
      await configHandler(req, res);

      assert.strictEqual(res.statusCode, 200);
      const keys = Object.keys(res.body);
      assert.deepStrictEqual(keys.sort(), ['configured', 'supabaseAnonKey', 'supabaseUrl'].sort());

      const jsonStr = JSON.stringify(res.body);
      assert.strictEqual(jsonStr.includes('SERVICE_ROLE'), false);
      assert.strictEqual(jsonStr.includes('CRITICAL_SECRET'), false);
      assert.strictEqual(jsonStr.includes('GEMINI'), false);
      assert.strictEqual(jsonStr.includes('GUEST_COOKIE'), false);
    } finally {
      restoreEnv();
    }
  });

  /* ── 4. Client Integration (js/auth.js) ── */
  await runTest('SmartTutorsAuth.ensureConfig bootstraps configuration in-memory without persistent storage leaks', async () => {
    const mockFetch = async (url) => {
      if (url === '/api/config') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            supabaseUrl: 'https://bootstrap-proj.supabase.co',
            supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon_key_bootstrap_12345',
            configured: true
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: '',
      supabaseAnonKey: '',
      fetch: mockFetch
    });

    // Before bootstrap: unconfigured
    assert.strictEqual(env.auth.isConfigured(), false);

    // Bootstrap
    const configured = await env.auth.ensureConfig();
    assert.strictEqual(configured, true);
    assert.strictEqual(env.auth.isConfigured(), true);

    // Verify zero storage leak (keys must remain in-memory only)
    assert.strictEqual(env.storage['st_config'], undefined);
    assert.strictEqual(env.sessionStorage['st_config'], undefined);
  });

  await runTest('SmartTutorsAuth.ensureConfig coalesces concurrent calls into single in-flight promise', async () => {
    let fetchCalls = 0;
    const mockFetch = async (url) => {
      if (url === '/api/config') {
        fetchCalls++;
        await new Promise((r) => setTimeout(r, 20)); // latency simulation
        return {
          ok: true,
          status: 200,
          json: async () => ({
            supabaseUrl: 'https://bootstrap-proj.supabase.co',
            supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon_key_bootstrap_12345',
            configured: true
          })
        };
      }
      return { ok: false, status: 404 };
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: '',
      supabaseAnonKey: '',
      fetch: mockFetch
    });

    // Fire 3 simultaneous calls
    const [c1, c2, c3] = await Promise.all([
      env.auth.ensureConfig(),
      env.auth.ensureConfig(),
      env.auth.ensureConfig()
    ]);

    assert.strictEqual(c1, true);
    assert.strictEqual(c2, true);
    assert.strictEqual(c3, true);
    assert.strictEqual(fetchCalls, 1, 'Concurrent ensureConfig calls must coalesce to 1 network request');
  });

  await runTest('SmartTutorsAuth.ensureConfig handles HTTP error gracefully and preserves unconfigured state', async () => {
    const mockFetch = async (url) => {
      if (url === '/api/config') {
        return {
          ok: false,
          status: 503,
          json: async () => ({ error: 'Service unavailable' })
        };
      }
      return { ok: false, status: 404 };
    };

    const env = createMockAuthEnvironment({
      supabaseUrl: '',
      supabaseAnonKey: '',
      fetch: mockFetch
    });

    const result = await env.auth.ensureConfig();
    assert.strictEqual(result, false);
    assert.strictEqual(env.auth.isConfigured(), false);
  });

  console.log(`\n================================================================`);
  console.log(`SmartTutors Phase 1 Config Tests: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`================================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
