/**
 * SmartTutors — Automated Verification Suite for AI Widget Expired-Session Guard (Phase 1C)
 *
 * Verifies:
 * 1. Intentional guest with no authenticated identity submits a guest request (no Authorization header).
 * 2. Valid authenticated user submits request with Authorization: Bearer <token>.
 * 3. Authenticated user whose refresh fails does NOT submit a guest request (fetch aborted).
 * 4. Expired-session message is rendered in chat and typed input is preserved for retry.
 * 5. Sign-in modal trigger is invoked when available.
 * 6. No duplicate request is dispatched during session failure.
 * 7. Server 401 response is handled gracefully as session expiration rather than offline hint.
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

function createMockElement(id = '', tag = 'div') {
  const listeners = {};
  const children = [];
  const classListSet = new Set();

  const el = {
    id,
    tagName: tag.toUpperCase(),
    value: '',
    disabled: false,
    textContent: '',
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 100,
    dataset: {},
    style: {},
    get className() {
      return Array.from(classListSet).join(' ');
    },
    set className(val) {
      classListSet.clear();
      if (val) {
        val.split(/\s+/).forEach(c => c && classListSet.add(c));
      }
    },
    classList: {
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls),
      toggle: (cls, force) => {
        if (force === undefined) {
          if (classListSet.has(cls)) classListSet.delete(cls);
          else classListSet.add(cls);
        } else if (force) {
          classListSet.add(cls);
        } else {
          classListSet.delete(cls);
        }
      },
      contains: (cls) => classListSet.has(cls)
    },
    addEventListener: (evt, fn) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(fn);
    },
    removeEventListener: (evt, fn) => {
      if (listeners[evt]) {
        listeners[evt] = listeners[evt].filter(f => f !== fn);
      }
    },
    appendChild: (child) => {
      child._parent = el;
      children.push(child);
      return child;
    },
    remove: function () {
      el._removed = true;
      if (el._parent && el._parent.children) {
        const idx = el._parent.children.indexOf(el);
        if (idx !== -1) {
          el._parent.children.splice(idx, 1);
        }
      }
    },
    focus: function () {
      el._focused = true;
    },
    querySelector: function (sel) {
      if (sel === '.ai-msg-body') {
        return children.find(c => c.classList.contains('ai-msg-body')) || null;
      }
      return null;
    },
    querySelectorAll: function () {
      return [];
    },
    children,
    _listeners: listeners
  };
  return el;
}

function createWidgetEnvironment({ auth = null, authUI = null, fetchFn = null } = {}) {
  const elements = {
    'ai-fab': createMockElement('ai-fab'),
    'ai-chat-drawer': createMockElement('ai-chat-drawer'),
    'ai-chat-close': createMockElement('ai-chat-close'),
    'ai-chat-messages': createMockElement('ai-chat-messages'),
    'ai-chat-input': createMockElement('ai-chat-input', 'textarea'),
    'ai-chat-send': createMockElement('ai-chat-send', 'button'),
    'ai-subject-select': createMockElement('ai-subject-select', 'select')
  };

  const storage = {};
  const mockLocalStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  };

  const mockDocument = {
    readyState: 'complete',
    getElementById: (id) => {
      if (elements[id]) return elements[id];
      if (elements['ai-chat-messages']) {
        for (const child of elements['ai-chat-messages'].children) {
          if (child.id === id) return child;
        }
      }
      return null;
    },
    createElement: (tag) => createMockElement('', tag),
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  const mockWindow = {
    document: mockDocument,
    localStorage: mockLocalStorage,
    SmartTutorsAuth: auth,
    SmartTutorsAuthUI: authUI,
    fetch: fetchFn || (async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => ({ reply: 'Mock reply' }) })),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {}
  };

  const widgetCode = fs.readFileSync(path.join(__dirname, '../js/ai-widget.js'), 'utf8');
  const context = vm.createContext({
    window: mockWindow,
    document: mockDocument,
    localStorage: mockLocalStorage,
    fetch: (...args) => mockWindow.fetch(...args),
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    console: console,
    Date: Date,
    JSON: JSON,
    Math: Math,
    Error: Error,
    Object: Object,
    Array: Array,
    String: String,
    Boolean: Boolean,
    Promise: Promise
  });

  vm.runInContext(widgetCode, context);

  return {
    window: mockWindow,
    elements,
    storage,
    ai: context.window.SmartTutorsAI
  };
}

async function main() {
  console.log('=== Running SmartTutors AI Widget Expired-Session Guard Test Suite (Phase 1C) ===\n');

  /* ── 1. Intentional Guest ── */
  await runTest('Intentional guest without authenticated session submits request without Authorization header', async () => {
    let capturedHeaders = null;
    let fetchCount = 0;

    const mockFetch = async (url, opts) => {
      fetchCount++;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ reply: 'Socratic hint for guest' })
      };
    };

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => false,
        getUser: () => null,
        getValidAccessToken: async () => null
      },
      fetchFn: mockFetch
    });

    await env.ai.sendMessage('What is Ohm\'s Law?');

    assert.strictEqual(fetchCount, 1, 'Guest request must be dispatched');
    assert.strictEqual(capturedHeaders['Authorization'], undefined, 'No Authorization header on guest request');
  });

  /* ── 2. Valid Authenticated Student ── */
  await runTest('Valid authenticated student submits request with Authorization: Bearer <token>', async () => {
    let capturedHeaders = null;
    let fetchCount = 0;

    const mockFetch = async (url, opts) => {
      fetchCount++;
      capturedHeaders = opts.headers;
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ reply: 'Socratic hint for authenticated student' })
      };
    };

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-42', email: 'student@example.com' }),
        getValidAccessToken: async () => 'valid-active-jwt-token-12345'
      },
      fetchFn: mockFetch
    });

    await env.ai.sendMessage('Can you explain resistance?');

    assert.strictEqual(fetchCount, 1, 'Authenticated request must be dispatched');
    assert.strictEqual(capturedHeaders['Authorization'], 'Bearer valid-active-jwt-token-12345');
  });

  /* ── 3. Expired Session Guard: Refresh Fails ── */
  await runTest('Authenticated student whose refresh fails is NOT submitted as guest (fetch aborted)', async () => {
    let fetchCount = 0;
    let modalOpenedTab = null;

    const mockFetch = async () => {
      fetchCount++;
      return { ok: true, status: 200 };
    };

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        // Before token call, user appeared authenticated
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-expired', email: 'expired@example.com' }),
        // Token refresh fails
        getValidAccessToken: async () => null
      },
      authUI: {
        openModal: (tab) => { modalOpenedTab = tab; }
      },
      fetchFn: mockFetch
    });

    const inputEl = env.elements['ai-chat-input'];
    inputEl.value = 'Explain nuclear fission';

    await env.ai.sendMessage('Explain nuclear fission');

    // CRITICAL: Fetch must NOT be called
    assert.strictEqual(fetchCount, 0, 'Fetch must NOT be called when session refresh fails (zero guest fallback)');

    // Input text must be preserved for retry
    assert.strictEqual(inputEl.value, 'Explain nuclear fission', 'Typed question must be preserved');
    assert.strictEqual(inputEl.disabled, false, 'Input must be re-enabled');

    // Message area must contain expired session message
    const msgArea = env.elements['ai-chat-messages'];
    const lastMsg = msgArea.children[msgArea.children.length - 1];
    const bodyEl = lastMsg.querySelector('.ai-msg-body');
    assert.ok(bodyEl.textContent.includes('session has expired'), 'Expired session notice must be rendered');

    // Signin modal must be triggered
    assert.strictEqual(modalOpenedTab, 'signin', 'Sign-in modal must be triggered');
  });

  /* ── 4. Stored Session Guard (Ambiguous / Dead Refresh Token) ── */
  await runTest('User with stored session whose token retrieval throws aborts request and preserves text', async () => {
    let fetchCount = 0;

    const mockFetch = async () => {
      fetchCount++;
      return { ok: true, status: 200 };
    };

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => false,
        getUser: () => null,
        getValidAccessToken: async () => { throw new Error('Network timeout during refresh'); }
      },
      fetchFn: mockFetch
    });

    // Seed localStorage with residual session
    env.storage['st_auth_session'] = JSON.stringify({
      access_token: 'dead-token',
      refresh_token: 'dead-refresh',
      user: { id: 'usr-999' }
    });

    const inputEl = env.elements['ai-chat-input'];
    inputEl.value = 'How does refraction work?';

    await env.ai.sendMessage('How does refraction work?');

    assert.strictEqual(fetchCount, 0, 'Must abort request when stored session cannot be refreshed');
    assert.strictEqual(inputEl.value, 'How does refraction work?', 'Input preserved on refresh error');

    const msgArea = env.elements['ai-chat-messages'];
    const lastMsg = msgArea.children[msgArea.children.length - 1];
    const bodyEl = lastMsg.querySelector('.ai-msg-body');
    assert.ok(bodyEl.textContent.includes('session has expired'));
  });

  /* ── 5. Server-Side 401 Response Handling ── */
  await runTest('Server HTTP 401 is handled gracefully as session expired without triggering offline fallback', async () => {
    let modalOpenedTab = null;

    const mockFetch = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: 'Invalid or expired session. Please sign in again.' })
    });

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-revoked' }),
        getValidAccessToken: async () => 'revoked-token'
      },
      authUI: {
        openModal: (tab) => { modalOpenedTab = tab; }
      },
      fetchFn: mockFetch
    });

    await env.ai.sendMessage('What is electromagnetic induction?');

    const msgArea = env.elements['ai-chat-messages'];
    const lastMsg = msgArea.children[msgArea.children.length - 1];
    const bodyEl = lastMsg.querySelector('.ai-msg-body');

    assert.strictEqual(bodyEl.textContent, 'Invalid or expired session. Please sign in again.');
    assert.strictEqual(bodyEl.textContent.includes('Offline study hint'), false, 'Must NOT trigger offline fallback on 401');
    assert.strictEqual(modalOpenedTab, 'signin', 'Must open signin modal on 401');
  });

  /* ── 6. Concurrency & Duplicate Request Prevention ── */
  await runTest('No duplicate AI request is dispatched while handling session failure or during in-flight request', async () => {
    let fetchCount = 0;
    let resolveFirstFetch = null;

    const mockFetch = async () => {
      fetchCount++;
      return new Promise((resolve) => {
        resolveFirstFetch = resolve;
      });
    };

    const env = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-concurrent' }),
        getValidAccessToken: async () => 'valid-token'
      },
      fetchFn: mockFetch
    });

    // Submitting first request starts in-flight state
    const p1 = env.ai.sendMessage('First query');
    // Rapid secondary submission while first is still pending
    const p2 = env.ai.sendMessage('Second concurrent query');

    // Yield microtasks so the first request advances through token resolution to fetch
    await new Promise((resolve) => setImmediate(resolve));

    assert.strictEqual(fetchCount, 1, 'In-flight mutex must drop concurrent second request');

    // Resolve first fetch
    resolveFirstFetch({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ reply: 'Reply to first query' })
    });

    await Promise.all([p1, p2]);

    assert.strictEqual(fetchCount, 1, 'Exactly one fetch must have occurred');

    // Duplicate prevention during session failure
    let failFetchCount = 0;
    const failEnv = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-expired' }),
        getValidAccessToken: async () => null
      },
      fetchFn: async () => {
        failFetchCount++;
        return { ok: true, status: 200 };
      }
    });

    // Attempting query with expired session
    await failEnv.ai.sendMessage('Query during expiration');
    assert.strictEqual(failFetchCount, 0, 'Zero requests dispatched on session failure');

    // Immediate repeat attempt without sign-in still dispatches zero requests
    await failEnv.ai.sendMessage('Immediate retry while still expired');
    assert.strictEqual(failFetchCount, 0, 'Zero requests dispatched on repeated expired attempts');
  });

  /* ── 7. Multi-Turn Sequential Compatibility (Guest, Authenticated & Session Recovery) ── */
  await runTest('Existing guest and authenticated workflows remain compatible across multiple sequential queries', async () => {
    // 7A: Sequential Guest Queries
    const guestCalls = [];
    const guestEnv = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => false,
        getUser: () => null,
        getValidAccessToken: async () => null
      },
      fetchFn: async (url, opts) => {
        const body = JSON.parse(opts.body);
        guestCalls.push({ headers: opts.headers, body });
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ reply: `Reply to ${body.message}` })
        };
      }
    });

    await guestEnv.ai.sendMessage('Guest query 1');
    await guestEnv.ai.sendMessage('Guest query 2');

    assert.strictEqual(guestCalls.length, 2, 'Both guest queries must be dispatched');
    assert.strictEqual(guestCalls[0].headers['Authorization'], undefined, 'Turn 1 has no Authorization header');
    assert.strictEqual(guestCalls[1].headers['Authorization'], undefined, 'Turn 2 has no Authorization header');
    assert.strictEqual(guestCalls[1].body.history.length >= 2, true, 'Turn 2 includes conversation history from Turn 1');

    // 7B: Sequential Authenticated Queries
    const authCalls = [];
    const authEnv = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-multi' }),
        getValidAccessToken: async () => 'active-jwt-multiturn'
      },
      fetchFn: async (url, opts) => {
        const body = JSON.parse(opts.body);
        authCalls.push({ headers: opts.headers, body });
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ reply: `Reply to ${body.message}` })
        };
      }
    });

    await authEnv.ai.sendMessage('Student query 1');
    await authEnv.ai.sendMessage('Student query 2');

    assert.strictEqual(authCalls.length, 2, 'Both student queries must be dispatched');
    assert.strictEqual(authCalls[0].headers['Authorization'], 'Bearer active-jwt-multiturn');
    assert.strictEqual(authCalls[1].headers['Authorization'], 'Bearer active-jwt-multiturn');
    assert.strictEqual(authCalls[1].body.history.length >= 2, true, 'Turn 2 includes student history from Turn 1');

    // 7C: Expired Session Recovery Flow
    let currentToken = null; // initially expired
    const recoveryCalls = [];
    let modalOpened = null;

    const recoveryEnv = createWidgetEnvironment({
      auth: {
        isConfigured: () => true,
        isAuthenticated: () => true,
        getUser: () => ({ id: 'student-recovering' }),
        getValidAccessToken: async () => currentToken
      },
      authUI: {
        openModal: (tab) => { modalOpened = tab; }
      },
      fetchFn: async (url, opts) => {
        const body = JSON.parse(opts.body);
        recoveryCalls.push({ headers: opts.headers, body });
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ reply: 'Welcome back! Here is your answer.' })
        };
      }
    });

    const input = recoveryEnv.elements['ai-chat-input'];
    input.value = 'Explain Doppler Effect';

    // Step 1: Attempt while expired -> blocked
    await recoveryEnv.ai.sendMessage('Explain Doppler Effect');
    assert.strictEqual(recoveryCalls.length, 0, 'Fetch must not be called while expired');
    assert.strictEqual(modalOpened, 'signin', 'Sign-in modal must open');
    assert.strictEqual(input.value, 'Explain Doppler Effect', 'Input preserved after expiry');

    // Step 2: Student signs in -> token becomes available
    currentToken = 'freshly-minted-session-token-999';

    // Step 3: Student retries sending preserved input
    await recoveryEnv.ai.sendMessage(input.value);
    assert.strictEqual(recoveryCalls.length, 1, 'Fetch dispatched after successful re-authentication');
    assert.strictEqual(recoveryCalls[0].headers['Authorization'], 'Bearer freshly-minted-session-token-999');
    assert.strictEqual(recoveryCalls[0].body.message, 'Explain Doppler Effect');
  });

  console.log(`\n================================================================`);
  console.log(`SmartTutors Phase 1C AI Widget Tests: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`================================================================\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
